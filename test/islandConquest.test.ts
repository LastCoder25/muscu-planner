import { describe, expect, it } from 'vitest';
import { ISLANDS, ISLAND_OUTPOST_LEVEL, archipelOn, islandPacified } from '@/lib/archipelago';
import { createMap, poiLabel, type ExpeditionMap, type Poi } from '@/lib/expedition';
import {
  CONTROL,
  attackSlow,
  attackerHidden,
  captureControl,
  collectControl,
  controlGoldPerHour,
  controlTier,
  controlIdOf,
  ensureControls,
  holdControl,
} from '@/lib/controlPoints';
import {
  BRIGANDS,
  FORTRESS_ID,
  ISLAND_CONQUEST,
  brigandPillage,
  pillageDelayMs,
  ensureIslandConquest,
  fortressForce,
  islandConquest,
  objectiveIdOf,
  objectiveSize,
  razeIslandTarget,
} from '@/lib/islandConquest';
import { onIsland } from '@/lib/islandTerrain';
import { partySendBlocker } from '@/lib/party';
import { raidsEnabled, type BaseState } from '@/lib/raid';
import { collectable, type Building } from '@/lib/buildings';

const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;
const LV = 18;

/** Une carte de l'île 1, points fixes et objectifs posés. */
function island1(seed = 7): ExpeditionMap {
  const m = createMap(seed, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(1));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}
const poi = (m: ExpeditionMap, id: string): Poi | undefined => m.pois.find((p) => p.id === id);

describe('🏝️ conquête — les forces', () => {
  it('les premiers objectifs ont une troupe de 3, les derniers de 4', () => {
    expect([0, 1].map((i) => objectiveSize(i, 2))).toEqual([3, 4]);
    expect([0, 1, 2].map((i) => objectiveSize(i, 3))).toEqual([3, 3, 4]);
  });

  it('la forteresse : intacte un rang au-dessus et troupe 12, puis 8 au plafond', () => {
    const isl = ISLANDS[1]!; // 3 objectifs, plafond 40
    expect(fortressForce(isl, 0)).toEqual({ level: 50, size: 12, locked: true });
    expect(fortressForce(isl, 1).locked).toBe(true);
    const two = fortressForce(isl, 2);
    expect(two.locked).toBe(false);
    expect(two.size).toBeLessThan(12);
    expect(two.size).toBeGreaterThan(8);
    expect(fortressForce(isl, 3)).toEqual({ level: 40, size: 8, locked: false });
    // L'île 5 ne dépasse jamais le dernier niveau de l'échelle de prestige.
    expect(fortressForce(ISLANDS[4]!, 0).level).toBeLessThanOrEqual(100);
  });
});

describe('🏝️ conquête — la carte', () => {
  it("pose deux camps de brigands et la forteresse, sur l'île, à l'écart des points fixes", () => {
    const m = island1();
    const objs = [0, 1].map((i) => poi(m, objectiveIdOf(i))!);
    const fort = poi(m, FORTRESS_ID)!;
    for (const p of [...objs, fort]) {
      expect(p.control?.owner).toBe('enemy');
      expect(p.control?.faction).toBe('bandits');
      expect(onIsland(1, p.x, p.y)).toBe(true);
      for (const k of CONTROL.kinds) {
        const c = poi(m, controlIdOf(k))!;
        expect(Math.hypot(c.x - p.x, c.y - p.y)).toBeGreaterThan(9);
      }
    }
    expect(poiLabel(objs[0]!)).toBe('Camp de brigands');
    expect(objs.map((p) => p.control!.size)).toEqual([3, 4]);
    expect(objs.every((p) => p.level === LV)).toBe(true);
    expect(fort.control!.locked).toBe(true);
    expect(fort.control!.size).toBe(12);
  });

  it('rend la MÊME carte quand rien ne change (le store n’écrit pas à vide)', () => {
    const m = island1();
    expect(ensureIslandConquest(m, NOW + H, LV)).toBe(m);
  });

  it('hors du mode archipel : rien de posé, et ce qui l’était s’en va', () => {
    const plain = ensureControls(createMap(7, NOW, LV, 3), NOW, LV, 3);
    expect(ensureIslandConquest(plain, NOW, LV)).toBe(plain);
    const m = island1();
    const off = { ...m };
    delete off.archipel;
    const cleaned = ensureIslandConquest(off, NOW, LV);
    expect(cleaned.pois.some((p) => p.id === FORTRESS_ID)).toBe(false);
  });

  it('deux camps abattus déverrouillent la forteresse et l’affaiblissent au plus bas', () => {
    let m = island1();
    m = razeIslandTarget(m, objectiveIdOf(0), NOW);
    m = ensureIslandConquest(m, NOW, LV);
    expect(poi(m, objectiveIdOf(0))).toBeUndefined();
    expect(poi(m, FORTRESS_ID)!.control!.locked).toBe(true);
    m = ensureIslandConquest(razeIslandTarget(m, objectiveIdOf(1), NOW), NOW, LV);
    const f = poi(m, FORTRESS_ID)!;
    expect(f.control!.locked).toBeUndefined();
    expect(f.control!.size).toBe(ISLAND_CONQUEST.fortressWeakSize);
    expect(f.level).toBe(20);
    // Un objectif abattu ne revient pas.
    expect(poi(ensureIslandConquest(m, NOW + 30 * 24 * H, LV), objectiveIdOf(0))).toBeUndefined();
  });

  it('une forteresse verrouillée refuse l’envoi', () => {
    const m = island1();
    expect(partySendBlocker(poi(m, FORTRESS_ID)!, 8, true, 20, 0.9, NOW)).toBe('fortressLocked');
    // 🏝️ Un objectif attend que les deux avant-postes soient tenus (étape 3)…
    expect(partySendBlocker(poi(m, objectiveIdOf(0))!, 0, true, 20, 0.9, NOW)).toBe(
      'objectiveLocked',
    );
    // …puis s'attaque, héros seul compris.
    let held = m;
    for (const k of ['tower', 'training'] as const)
      held = captureControl(held, controlIdOf(k), ['a'], NOW, 7);
    held = ensureIslandConquest(held, NOW, LV);
    expect(partySendBlocker(poi(held, objectiveIdOf(0))!, 0, true, 20, 0.9, NOW)).toBeNull();
  });
});

describe('🕊️ île pacifiée', () => {
  /** L'île 1 avec la mine tenue par 3 champions depuis NOW. */
  function held(): ExpeditionMap {
    let m = island1();
    m = captureControl(m, controlIdOf('mine'), ['a', 'b', 'c'], NOW, 7);
    return ensureIslandConquest(m, NOW, LV);
  }
  function pacify(m: ExpeditionMap, at: number): ExpeditionMap {
    for (const id of [objectiveIdOf(0), objectiveIdOf(1), FORTRESS_ID])
      m = razeIslandTarget(m, id, at);
    return ensureIslandConquest(m, at, LV);
  }

  it('tout abattu : pacifiée, plus aucune attaque prévue, et aucune ne revient', () => {
    let m = held();
    expect(poi(m, controlIdOf('mine'))!.control!.attackAt).toBeDefined();
    m = pacify(m, NOW + H);
    expect(islandPacified(m)).toBe(true);
    expect(islandConquest(m)?.pacified).toBe(true);
    expect(m.pois.every((p) => p.control?.attackAt === undefined)).toBe(true);
    // Les ticks suivants ne reprogramment rien ; prendre ou tenir un point non plus.
    m = ensureControls(m, NOW + 2 * H, LV, ISLAND_OUTPOST_LEVEL);
    expect(m.pois.every((p) => p.control?.attackAt === undefined)).toBe(true);
    m = captureControl(m, controlIdOf('garden'), ['d'], NOW + 3 * H, 7);
    m = holdControl(m, controlIdOf('mine'), NOW + 3 * H, 7);
    expect(m.pois.every((p) => p.control?.attackAt === undefined)).toBe(true);
  });

  it('pas pacifiée tant que la forteresse tient', () => {
    let m = held();
    m = razeIslandTarget(razeIslandTarget(m, objectiveIdOf(0), NOW), objectiveIdOf(1), NOW);
    expect(islandPacified(m)).toBe(false);
  });

  it('la mine tenue sur une île produit au rythme de 24 h (le tiers de 8 h)', () => {
    const m = held();
    expect(poi(m, controlIdOf('mine'))!.control!.yieldMult).toBeCloseTo(
      CONTROL.mineHoursPerHaul / ISLAND_CONQUEST.mineHours,
    );
    // Hors du mode archipel, la mine garde son rythme.
    const plain = captureControl(
      ensureControls(createMap(7, NOW, LV, 3), NOW, LV, 3),
      controlIdOf('mine'),
      ['a', 'b', 'c'],
      NOW,
      7,
    );
    const a = collectControl(
      ensureIslandConquest(plain, NOW, LV),
      controlIdOf('mine'),
      NOW + 24 * H,
      LV,
    ).gold;
    const b = collectControl(m, controlIdOf('mine'), NOW + 24 * H, LV).gold;
    expect(b / a).toBeCloseTo(1 / 3, 1);
  });

  it('pacifiée : le socle produit à 25 %, la production déjà faite reste au débit d’avant', () => {
    const m0 = held();
    const at = NOW + 10 * H;
    const before = collectControl(m0, controlIdOf('mine'), at, LV).gold;
    const m = pacify(m0, at);
    const c = poi(m, controlIdOf('mine'))!.control!;
    expect(c.flatTier).toBe(true);
    // Rien de perdu : à l'instant de la pacification, la réserve est la même.
    expect(collectControl(m, controlIdOf('mine'), at, LV).gold).toBe(before);
    // Après, 10 h rendent le quart de ce qu'elles rendaient.
    const later = collectControl(m, controlIdOf('mine'), at + 10 * H, LV).gold - before;
    expect(later / before).toBeCloseTo(ISLAND_CONQUEST.socleShare, 1);
    // Une spécialité (le jardin) n'est pas touchée.
    expect(poi(m, controlIdOf('garden'))!.control!.yieldMult).toBeUndefined();
  });

  it('pacifiée : le socle perd ses crans (une mine ancienne retombe au débit de base × 25 %)', () => {
    const m0 = held();
    const at = NOW + 72 * H;
    expect(controlTier(poi(m0, controlIdOf('mine'))!.control, at)).toBeGreaterThan(0);
    const m = pacify(m0, at);
    const id = controlIdOf('mine');
    const g0 = collectControl(m, id, at, LV).gold;
    const gain = collectControl(m, id, at + 10 * H, LV).gold - g0;
    const base =
      (10 * controlGoldPerHour(poi(m, id)!, 3, LV) * CONTROL.mineHoursPerHaul) /
      ISLAND_CONQUEST.mineHours;
    expect(gain / base).toBeCloseTo(ISLAND_CONQUEST.socleShare, 2);
  });
});

describe('⛺ les camps de brigands attaquent et pillent', () => {
  it('les reprises viennent des camps : chaque camp abattu les espace', () => {
    let m = island1();
    expect(attackSlow(m, 'mine')).toBe(1);
    m = razeIslandTarget(m, objectiveIdOf(0), NOW);
    expect(attackSlow(m, 'mine')).toBeCloseTo(1.5);
    m = razeIslandTarget(m, objectiveIdOf(1), NOW);
    expect(attackSlow(m, 'mine')).toBe(3);
    // Sur une île, aucune citadelle « cachée » ne ralentit quoi que ce soit.
    expect(attackerHidden(m, 'mine')).toBe(false);
  });

  it('une île pacifiée ne voit plus aucun siège', () => {
    const base = {
      defenses: [
        { typeId: 'wall', level: 26 },
        { typeId: 'turret', level: 26 },
      ],
    } as BaseState;
    expect(raidsEnabled(base, 7, 26, false)).toBe(true);
    expect(raidsEnabled(base, 7, 26, true)).toBe(false);
  });

  /** Une Dynamo et une Porte, jamais récoltées depuis 20 h. */
  const builds = (): Building[] => [
    { typeId: 'energy_font', level: 20, slot: 0, collectedAt: NOW - 20 * H },
    { typeId: 'labyrinth_gate', level: 20, slot: 1, collectedAt: NOW - 20 * H },
  ];

  it('programme un pillage, puis prend la réserve non récoltée à son heure', () => {
    const m = island1();
    const first = brigandPillage(m, builds(), NOW)!;
    const at = first.map.archipel!.pillageAt!;
    // Deux camps : en moyenne deux fois plus souvent qu'un seul.
    expect(at - NOW).toBeGreaterThan((BRIGANDS.pillageMs / 2) * (1 - BRIGANDS.jitter) - 1);
    expect(at - NOW).toBeLessThan((BRIGANDS.pillageMs / 2) * (1 + BRIGANDS.jitter) + 1);
    expect(brigandPillage(first.map, builds(), NOW + H)).toBeNull();
    const hit = brigandPillage(first.map, builds(), at + 5 * H)!;
    const want = collectable(builds(), at);
    expect(hit.stolen).toEqual(want);
    expect(want.energy + want.keys).toBeGreaterThan(0);
    // Pris À L'HEURE du pillage : ce qui a été produit depuis reste à toi.
    expect(hit.buildings.every((b) => b.collectedAt === at)).toBe(true);
    expect(collectable(hit.buildings, at + 5 * H).energy).toBeGreaterThan(0);
    expect(hit.msg?.text).toContain('⚡');
    expect(hit.map.archipel!.pillageAt!).toBeGreaterThan(at + 5 * H);
  });

  it('un camp abattu espace les pillages ; tous abattus, ils cessent', () => {
    let m = razeIslandTarget(island1(), objectiveIdOf(0), NOW);
    expect(pillageDelayMs(m.seed, NOW, 1)).toBeCloseTo(2 * pillageDelayMs(m.seed, NOW, 2));
    m = brigandPillage(m, builds(), NOW)!.map;
    expect(m.archipel!.pillageAt).toBeDefined();
    m = razeIslandTarget(m, objectiveIdOf(1), NOW);
    const off = brigandPillage(m, builds(), NOW + 1000 * H)!;
    expect(off.map.archipel!.pillageAt).toBeUndefined();
    expect(off.msg).toBeNull();
    expect(off.buildings).toEqual(builds());
  });

  it('seule l’île des brigands pille, et jamais hors du mode archipel', () => {
    const plain = ensureControls(createMap(7, NOW, LV, 3), NOW, LV, 3);
    expect(brigandPillage(plain, builds(), NOW)).toBeNull();
    const isl2 = ensureIslandConquest(
      ensureControls(
        createMap(7, NOW, 30, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(2)),
        NOW,
        30,
        ISLAND_OUTPOST_LEVEL,
      ),
      NOW,
      30,
    );
    expect(brigandPillage(isl2, builds(), NOW)).toBeNull();
  });
});
