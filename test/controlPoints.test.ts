// 🏰 Les points de contrôle (2026-09-27) : fixes, pris en groupe, tenus, repris par l'ennemi.
import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  collectControl,
  controlIdOf,
  controlStock,
  dueRetakes,
  ensureControls,
  heldControls,
  holdControl,
  loseControl,
  markAssault,
  retakeDelayMs,
  retakeForce,
  controlTravelMult,
  gardenStock,
  trainingCapLevel,
  trainingRoom,
  trainingStock,
  seatsOf,
} from '@/lib/controlPoints';
import { advXpToNext } from '@/lib/adventurers';
import { rankStartLevel } from '@/lib/characterRank';
import { EXPE, createMap, advanceWorld, revealRadius } from '@/lib/expedition';
import { poiOffers, refAdvGear, refChampionAdv, escortGear, roadUnits } from '@/lib/caravan';
import { partyCapFor, partySendBlocker, partyHeroBlocker } from '@/lib/party';
import { advUnavailableReason, type Adventurer } from '@/lib/adventurers';
import { planPushes } from '@/lib/push';
import { fuseUnits } from '@/lib/skirmish';
import { campFoe } from '@/lib/camp';
import { simulateCombat } from '@/lib/combat';

const H = 3600_000;
const ID = controlIdOf('mine');
const mapAt = (seed: number, L = 30) => ensureControls(createMap(seed, 0, L, 1), 0, L);
const ctl = (m: ReturnType<typeof mapAt>) => m.pois.find((p) => p.id === ID)!;

describe('🏰 un point de contrôle est FIXE', () => {
  it('pose une mine, toujours au même endroit pour une carte donnée', () => {
    const a = ctl(mapAt(42));
    const b = ctl(ensureControls(createMap(42, 5 * H, 80, 30), 5 * H, 80));
    expect(a.type).toBe('control');
    expect(a.control!.owner).toBe('enemy');
    expect({ x: a.x, y: a.y }).toEqual({ x: b.x, y: b.y });
    // Visible dès le départ, sans Avant-poste.
    expect(Math.hypot(a.x - EXPE.town.x, a.y - EXPE.town.y)).toBeLessThanOrEqual(revealRadius(1));
  });
  it('ne se double pas, et la carte ne change pas quand rien ne manque', () => {
    const m = mapAt(7);
    expect(ensureControls(m, H, 30)).toBe(m);
    expect(m.pois.filter((p) => p.type === 'control')).toHaveLength(CONTROL.kinds.length);
  });
  it('survit au monde qui avance (hors quota, jamais expiré)', () => {
    let m = mapAt(9);
    for (let t = H; t <= 20 * 24 * H; t += 6 * H) m = advanceWorld(m, t, 30, 1);
    expect(m.pois.some((p) => p.id === ID)).toBe(true);
  });
  it('son rang est TIRÉ, pas lié à la distance : il varie d’une carte à l’autre', () => {
    const lv = new Set<number>();
    for (let s = 1; s <= 40; s++) lv.add(ctl(mapAt(s * 131, 60)).level);
    expect(lv.size).toBeGreaterThan(5);
  });
});

describe('🏰 les quatre points', () => {
  it('mine, camp d’entraînement, jardin, tour : un de chaque, bien écartés, tous visibles', () => {
    for (let s = 1; s <= 20; s++) {
      const pts = mapAt(s * 977).pois.filter((p) => p.control);
      expect(pts.map((p) => p.control!.kind).sort()).toEqual([...CONTROL.kinds].sort());
      for (const p of pts)
        expect(Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y)).toBeLessThanOrEqual(
          revealRadius(1),
        );
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++)
          expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y)).toBeGreaterThan(
            EXPE.minDistPoi,
          );
    }
  });
  const held = (kind: string, garrison = ['a0', 'a1', 'a2']) => {
    const m = mapAt(11);
    const id = `ctl_${kind}`;
    const t = captureControl(m, id, garrison, 0, 7);
    const p = t.pois.find((x) => x.id === id)!;
    return { map: t, id, p: { ...p, control: { ...p.control!, attackAt: 9e15 } } };
  };
  it('🎯 le camp plafonne au ★5 du rang juste sous le héros (rien pour un héros Bronze)', () => {
    expect(trainingCapLevel(5)).toBe(0);
    expect(trainingCapLevel(25)).toBe(rankStartLevel(2) - 1);
    const adv = { ...refChampionAdv(30, 0), id: 'a0', level: rankStartLevel(2) - 3, xp: 0 };
    const room = trainingRoom(adv, 25, 100);
    expect(room).toBe(advXpToNext(adv.level) + advXpToNext(adv.level + 1));
    expect(trainingRoom({ ...adv, level: rankStartLevel(2) - 1 }, 25, 100)).toBe(0);
    expect(trainingRoom(adv, 5, 100)).toBe(0);
    // Le Panthéon borne aussi.
    expect(trainingRoom(adv, 25, adv.level)).toBe(0);
  });
  it('🎯 l’XP du camp s’accumule par champion, plafonnée à 24 h', () => {
    const { p } = held('training');
    expect(trainingStock(p, 6 * H, 30)).toBeGreaterThan(0);
    expect(trainingStock(p, 24 * H, 30)).toBe(trainingStock(p, 40 * H, 30));
  });
  it('🌿 le jardin cueille 2 consommables par jour à un jardinier, plus vite à plusieurs', () => {
    expect(gardenStock(held('garden', ['a0']).p, 24 * H)).toBe(2);
    // Trois jardiniers : 1 / 0,5 = ×2 ; cinq : 1,3 / 0,5 = ×2,6 (`garrisonShare`).
    expect(gardenStock(held('garden').p, 24 * H)).toBe(4);
    expect(gardenStock(held('garden', ['a0', 'a1', 'a2', 'a3', 'a4']).p, 24 * H)).toBe(5);
  });
  it('🌿 cueillir garde la fraction d’un consommable en cours', () => {
    const { map, id } = held('garden', ['a0']);
    const c = collectControl(map, id, 15 * H, 30);
    expect(Object.values(c.supplies).reduce((s, n) => s + (n ?? 0), 0)).toBe(1);
    const cc = c.map.pois.find((x) => x.id === id)!.control!;
    expect(cc.collectedAt).toBe(15 * H);
    expect(cc.banked).toBeCloseTo(0.25, 5);
  });
  it('🗼 la tour tenue raccourcit les trajets (×0,8 à 3), sans rien à récolter', () => {
    const { map, id } = held('tower');
    expect(controlTravelMult(mapAt(11))).toBe(1);
    expect(controlTravelMult(map)).toBeCloseTo(0.8, 5);
    expect(controlTravelMult(held('tower', ['a0']).map)).toBeCloseTo(0.9, 5);
    // Jusqu'à 5 : chaque présent de plus raccourcit encore les trajets.
    const five = ['a0', 'a1', 'a2', 'a3', 'a4'];
    expect(controlTravelMult(held('tower', five).map)).toBeCloseTo(1 - 0.2 * 1.3, 5);
    expect(controlTravelMult(held('tower', five.slice(0, 4)).map)).toBeLessThan(
      controlTravelMult(map),
    );
    expect(collectControl(map, id, 12 * H, 30).map).toBe(map);
  });
});

describe('🏰 prise, production, reprise', () => {
  const taken = () => captureControl(mapAt(3), ID, ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'], 0, 7);
  it('pris : la garnison (5 au plus à la mine) y reste, une attaque est tirée entre 1 et 3 jours', () => {
    const p = ctl(taken());
    expect(p.control!.owner).toBe('player');
    expect(p.control!.garrison).toEqual(['a0', 'a1', 'a2', 'a3', 'a4']);
    expect(p.control!.attackAt).toBeGreaterThanOrEqual(CONTROL.retakeMinMs);
    expect(p.control!.attackAt).toBeLessThanOrEqual(CONTROL.retakeMaxMs);
  });
  it('les délais restent entre 1 et 3 jours, plus courts si le joueur est actif', () => {
    const at = (a: number) => Array.from({ length: 300 }, (_, i) => retakeDelayMs(ID, i * 977, a));
    const mean = (d: number[]) => d.reduce((x, y) => x + y, 0) / d.length;
    for (const a of [0, 3, 7]) {
      const d = at(a);
      expect(Math.min(...d)).toBeGreaterThanOrEqual(CONTROL.retakeMinMs);
      expect(Math.max(...d)).toBeLessThanOrEqual(CONTROL.retakeMaxMs);
    }
    // Très actif : autour d'un jour ; inactif : autour de trois.
    expect(mean(at(7))).toBeLessThan(30 * H);
    expect(mean(at(0))).toBeGreaterThan(60 * H);
    expect(mean(at(7))).toBeLessThan(mean(at(3)));
    expect(mean(at(3))).toBeLessThan(mean(at(0)));
    // Et ce n'est pas un rendez-vous fixe : le tirage varie.
    expect(new Set(at(7).map((x) => Math.round(x / H))).size).toBeGreaterThan(5);
  });
  it('produit de l’or, plafonné à 24 h, arrêté à l’attaque, plus avec plus de monde', () => {
    const m = captureControl(mapAt(3), ID, ['a0', 'a1', 'a2'], 0, 7);
    const p = { ...ctl(m), control: { ...ctl(m).control!, attackAt: 9e15 } };
    expect(controlStock(p, 0, 30)).toBe(0);
    const s6 = controlStock(p, 6 * H, 30);
    expect(s6).toBeGreaterThan(0);
    expect(controlStock(p, 24 * H, 30)).toBe(controlStock(p, 40 * H, 30));
    const solo = { ...p, control: { ...p.control, garrison: ['a0'] } };
    expect(controlStock(solo, 6 * H, 30)).toBeLessThan(s6);
    // Jusqu'à 5 : chaque présent de plus rapporte, toujours moins que le précédent.
    const gold = (n: number) =>
      controlStock(
        { ...p, control: { ...p.control, garrison: ['a0', 'a1', 'a2', 'a3', 'a4'].slice(0, n) } },
        6 * H,
        30,
      );
    for (let n = 1; n <= 5; n++) expect(gold(n)).toBeGreaterThan(gold(n - 1));
    for (let n = 2; n <= 5; n++)
      // (+1 : l'or est arrondi à l'unité)
      expect(gold(n) - gold(n - 1)).toBeLessThanOrEqual(gold(n - 1) - gold(Math.max(0, n - 2)) + 1);
    const cut = { ...p, control: { ...p.control, attackAt: 3 * H } };
    expect(controlStock(cut, 20 * H, 30)).toBe(controlStock(p, 3 * H, 30));
    expect(controlStock(ctl(mapAt(3)), 6 * H, 30)).toBe(0); // ennemi : rien
  });
  it('récolter vide la réserve', () => {
    const m = captureControl(mapAt(3), ID, ['a0'], 0, 7);
    const c = collectControl(m, ID, 5 * H, 30);
    expect(c.gold).toBeGreaterThan(0);
    expect(controlStock(ctl(c.map), 5 * H, 30)).toBe(0);
  });
  it('l’attaque est due à son heure ; repoussée, une nouvelle se prépare', () => {
    const m = taken();
    const at = ctl(m).control!.attackAt!;
    expect(dueRetakes(m, at - 1)).toHaveLength(0);
    expect(dueRetakes(m, at)).toHaveLength(1);
    const again = ctl(holdControl(m, ID, at, 7)).control!.attackAt!;
    expect(again).toBeGreaterThanOrEqual(at + CONTROL.retakeMinMs);
    expect(heldControls(holdControl(m, ID, at, 7))).toHaveLength(1);
  });
  it('perdu : le lieu redevient ennemi, sa troupe et son compteur changent', () => {
    const p = ctl(loseControl(taken(), ID, 30));
    expect(p.control!.owner).toBe('enemy');
    expect(p.control!.garrison).toEqual([]);
    expect(p.control!.retakes).toBe(1);
  });
  it('la force ennemie est ALÉATOIRE d’une attaque à l’autre', () => {
    const sizes = new Set<number>();
    for (let i = 0; i < 40; i++)
      sizes.add(
        retakeForce(
          { ...ctl(taken()), control: { ...ctl(taken()).control!, attackAt: i * 7777 } },
          1,
        ).size,
      );
    expect(sizes.size).toBeGreaterThan(2);
  });
  it('⚔️ une garnison de 3 ne gagne pas toujours, et 1 champion tient moins bien que 3', () => {
    const L = 30;
    const team = (n: number): Adventurer[] =>
      Array.from({ length: n }, (_, i) => ({
        ...refChampionAdv(L, i),
        id: `a${i}`,
        gear: {
          weapon: `refGear${i}weapon`,
          armor: `refGear${i}armor`,
          accessory: `refGear${i}accessory`,
          relic: `refGear${i}relic`,
        },
      }));
    const rate = (n: number) => {
      const esc = team(n);
      const g = fuseUnits(roadUnits(esc, escortGear(esc, { advGear: refAdvGear(L, n) })), 'g');
      let w = 0;
      let k = 0;
      for (const size of CONTROL.sizes)
        for (let s = 0; s < 150; s++, k++) {
          const f = campFoe({ ...ctl(mapAt(3, L)), level: L }, { faction: 'bandits', size });
          if (simulateCombat(g, f, { seed: s * 211 + 7, goldOnWin: 0 }).win) w++;
        }
      return w / k;
    };
    // Mesuré : 23 % / 62 % / 86 % (troupes [1 · 1,5 · 2,5 · 4,5], équipement à l'échelle du
    // héros). Chaque effectif a sa chance ET son risque.
    const [r1, r2, r3] = [rate(1), rate(2), rate(3)];
    expect(r1).toBeGreaterThan(0.02);
    expect(r1).toBeLessThan(0.25);
    expect(r2).toBeGreaterThan(r1 + 0.2);
    expect(r3).toBeGreaterThan(r2 + 0.1);
    expect(r3).toBeLessThan(0.93);
  }, 60_000);
});

describe('🏰 qui peut partir, et comment', () => {
  const enemy = ctl(mapAt(5));
  const owned = ctl(captureControl(mapAt(5), ID, ['a0'], 0, 7));
  const opts = { heroAway: false, comptoirLevel: 0, advsAvailable: 3, slotsFree: 2 };
  it('se prend en groupe, jamais par le héros seul ; tenu, rien à envoyer', () => {
    expect(poiOffers(enemy, opts)).toMatchObject({ hero: false, party: true });
    expect(poiOffers(owned, opts)).toMatchObject({ hero: false, party: false });
    const marching = ctl(markAssault(mapAt(5), ID, true));
    expect(poiOffers(marching, opts).party).toBe(false);
  });
  it('autant de champions qu’on veut, héros compris — au moins un champion pour occuper', () => {
    // Plus de plafond propre au point : celui du Panthéon seul.
    expect(partyCapFor(20, enemy, false)).toBe(20);
    expect(partyCapFor(20, enemy, true)).toBe(20);
    expect(partySendBlocker(enemy, 8, false, 2, 20, 0.5)).toBeNull();
    expect(partySendBlocker(enemy, 6, true, 2, 20, 0.5)).toBeNull();
    expect(partySendBlocker(enemy, 21, false, 2, 20, 0.5)).toBe('tooMany');
    // Le héros seul ne peut pas l'occuper : il rentre toujours.
    expect(partySendBlocker(enemy, 0, true, 2, 20, 0.5)).toBe('controlEmpty');
    expect(partySendBlocker(owned, 1, false, 2, 20, 0.5)).toBe('controlHeld');
    expect(partyHeroBlocker({ onExpedition: false, healMs: 0, outpost: true })).toBeNull();
  });
  it('pris avec une grosse équipe : seuls les choisis restent, aux places du point', () => {
    const m = captureControl(mapAt(3), ID, ['c', 'a', 'f', 'b', 'e', 'd'], 0, 7);
    expect(ctl(m).control!.garrison).toEqual(['c', 'a', 'f', 'b', 'e']);
    // Le camp et la forge, qui forment CHAQUE champion, gardent 3 places.
    const camp = captureControl(mapAt(3), controlIdOf('training'), ['c', 'a', 'f', 'b'], 0, 7);
    expect(camp.pois.find((q) => q.id === controlIdOf('training'))!.control!.garrison).toEqual([
      'c',
      'a',
      'f',
    ]);
  });
  it('un champion posté n’est disponible pour rien d’autre', () => {
    const a = { ...refChampionAdv(30, 0), id: 'a0', posted: ID } as Adventurer;
    expect(advUnavailableReason(a, 0)).toBe('posted');
    expect(advUnavailableReason({ ...a, posted: undefined }, 0)).toBeNull();
  });
});

describe('🔔 les notifications d’un point de contrôle', () => {
  const base = {
    base: null,
    expedition: null,
    parties: [],
    watchtowerLevel: 0,
    activeDays7: 0,
    playerLevel: 30,
    plunder: null,
  };
  it('ne prévient JAMAIS avant l’attaque ; seule l’attaque se dit, sans son issue', () => {
    const plans = planPushes(
      { ...base, controls: [{ id: ID, attackAt: 10 * H, label: 'Mine fortifiée' }] },
      0,
    );
    const atk = plans.find((p) => p.kind === 'control_attack')!;
    expect(plans.filter((p) => p.sendAt < 10 * H)).toEqual([]);
    expect(atk.sendAt).toBe(10 * H);
    expect(atk.dedupe).toBe(`control_attack:${ID}:${10 * H}`);
    expect(`${atk.title} ${atk.body}`).not.toMatch(/reprise|repouss|perdu/i);
  });
  it('rien dans le passé', () => {
    expect(
      planPushes({ ...base, controls: [{ id: ID, attackAt: H, label: 'Mine fortifiée' }] }, 2 * H),
    ).toEqual([]);
  });
});

describe('🏰 un point se prend à son niveau (signalé : une tour « légendaire » imprenable)', () => {
  const L = 30;
  const team = (n: number): Adventurer[] =>
    Array.from({ length: n }, (_, i) => ({
      ...refChampionAdv(L, i),
      id: `a${i}`,
      gear: {
        weapon: `refGear${i}weapon`,
        armor: `refGear${i}armor`,
        accessory: `refGear${i}accessory`,
        relic: `refGear${i}relic`,
      },
    }));
  const winRate = (n: number, level: number, sizes: readonly number[]) => {
    const esc = team(n);
    const g = fuseUnits(roadUnits(esc, escortGear(esc, { advGear: refAdvGear(L, n) })), 'g');
    let w = 0;
    let k = 0;
    for (const size of sizes)
      for (let s = 0; s < 150; s++, k++) {
        const f = campFoe({ ...ctl(mapAt(3, L)), level }, { faction: 'bandits', size });
        if (simulateCombat(g, f, { seed: s * 211 + 7, goldOnWin: 0 }).win) w++;
      }
    return w / k;
  };

  it('jamais un niveau au-dessus du joueur, jamais une troupe plus grosse qu’une équipe', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8])
      for (const lv of [3, 12, 30, 70]) {
        const m = mapAt(seed, lv);
        for (const q of m.pois.filter((x) => x.control)) {
          expect(q.level).toBeLessThanOrEqual(lv);
          expect(q.control!.size).toBeLessThanOrEqual(Math.max(...CONTROL.captureSizes));
        }
      }
  });

  it('🩹 un point posé avant la règle (trop haut, trop gros) est re-tiré au chargement', () => {
    const m = mapAt(9, L);
    const bad = {
      ...m,
      pois: m.pois.map((q) =>
        q.control ? { ...q, level: L + 12, control: { ...q.control, size: 3.5 } } : q,
      ),
    };
    const healed = ensureControls(bad, 0, L);
    for (const q of healed.pois.filter((x) => x.control)) {
      expect(q.level).toBeLessThanOrEqual(L);
      expect(q.control!.size).toBeLessThanOrEqual(Math.max(...CONTROL.captureSizes));
    }
    // Idempotent : une carte saine ressort telle quelle.
    expect(ensureControls(healed, 0, L)).toBe(healed);
  });

  it('⚔️ trois champions de ton niveau prennent le point le plus dur la plupart du temps', () => {
    const top = Math.max(...CONTROL.captureSizes);
    expect(winRate(3, L, [top])).toBeGreaterThan(0.7);
  }, 60_000);

  it('🏰 5 places là où l’on produit ou agit pour le joueur, 3 là où chacun apprend pour lui', () => {
    for (const k of ['mine', 'garden', 'tower', 'scriptorium'] as const) expect(seatsOf(k)).toBe(5);
    for (const k of ['training', 'forge'] as const) expect(seatsOf(k)).toBe(3);
  });

  it('⚔️ l’ennemi se cale sur une garnison de 3 : en poster 5 ne le fait pas grossir', () => {
    const m = captureControl(mapAt(4, L), controlIdOf('garden'), ['a', 'b', 'c', 'd', 'e'], 0, 7);
    const g = m.pois.find((q) => q.id === controlIdOf('garden'))!;
    expect(g.control!.garrison).toHaveLength(5);
    for (let t = 0; t < 30; t++) {
      const f = retakeForce({ ...g, control: { ...g.control!, attackAt: t * 7919 } }, 1);
      expect(f.size).toBeLessThanOrEqual(Math.max(...CONTROL.sizes));
    }
  });
});
