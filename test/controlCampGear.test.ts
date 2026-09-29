import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  collectControl,
  controlIdOf,
  ensureControls,
  campGear,
  campGearXpPerHour,
  trainingStock,
  trainingStockBy,
  reinforceControl,
  releaseFromControl,
  settleReinforcements,
  garrisonHold,
  retakeBoost,
  seatsOf,
  trainingXpPerHour,
} from '@/lib/controlPoints';
import { EXPE, createMap, type Poi } from '@/lib/expedition';
import { partyAllies, refAdvGear, refChampionAdv } from '@/lib/caravan';
import { campFoe } from '@/lib/camp';
import { fuseUnits } from '@/lib/skirmish';
import { mulberry32, simulateCombat } from '@/lib/combat';
import type { Adventurer } from '@/lib/adventurers';
import type { AdvGear } from '@/lib/advGear';

const H = 3600_000;
const CAMP = controlIdOf('training');
const mapAt = (L: number) => ensureControls(createMap(3, 0, L, 1), 0, L);
const pt = (m: ReturnType<typeof mapAt>, id: string) => m.pois.find((p) => p.id === id)!;

/** Trois champions de référence, chacun avec ses quatre pièces portées. */
function team(L: number, n = 3): { advs: Adventurer[]; stock: AdvGear[] } {
  // `refAdvGear` rend les pièces de CHAQUE champion de référence, dans sa lignée (4 par
  // champion, dans l'ordre) : chacun porte les siennes.
  const all = refAdvGear(L, n);
  const stock: AdvGear[] = [];
  const advs = Array.from({ length: n }, (_, i) => {
    const pieces = all.slice(i * 4, i * 4 + 4).map((g, k) => ({ ...g, id: `g${i}-${k}` }));
    stock.push(...pieces);
    const gear = Object.fromEntries(pieces.map((g) => [g.slot, g.id]));
    return { ...refChampionAdv(L, i), id: `a${i}`, gear } as Adventurer;
  });
  return { advs, stock };
}

describe('🎯⚒️ le camp d’entraînement forme aussi l’équipement (la forge y est fondue)', () => {
  it('plus de forge sur la carte ; les quatre premiers points gardent leur place', () => {
    const m = mapAt(30);
    expect(m.pois.some((p) => p.id === controlIdOf('forge' as never))).toBe(false);
    expect(CONTROL.kinds).not.toContain('forge');
    expect(seatsOf('training')).toBe(3);
    // Les quatre premiers gardent la place qu'ils avaient (quarts de tour).
    const town = EXPE.town;
    const ang = (p: Poi) => Math.atan2(p.y - town.y, p.x - town.x);
    const mine = ang(pt(m, controlIdOf('mine')));
    const quarter = (id: string) => {
      let d = ang(pt(m, id)) - mine;
      while (d < 0) d += Math.PI * 2;
      return d / (Math.PI / 2);
    };
    expect(quarter(controlIdOf('training'))).toBeCloseTo(1, 1);
    expect(quarter(controlIdOf('garden'))).toBeCloseTo(2, 1);
    expect(quarter(controlIdOf('tower'))).toBeCloseTo(3, 1);
    // Et aucun point ne se pose sur un autre.
    const ctl = m.pois.filter((p) => p.control);
    for (const a of ctl)
      for (const b of ctl)
        if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(10);
  });

  it('une forge déjà posée sur une carte d’avant la quitte, sans rien toucher d’autre', () => {
    const m = mapAt(30);
    const legacy = {
      ...pt(m, CAMP),
      id: 'ctl_forge',
      control: { ...pt(m, CAMP).control!, kind: 'forge' as never },
    };
    const withForge = { ...m, pois: [...m.pois, legacy] };
    const healed = ensureControls(withForge, 0, 30);
    expect(healed.pois.some((p) => p.id === 'ctl_forge')).toBe(false);
    expect(healed.pois.length).toBe(m.pois.length);
    // Une carte déjà propre est rendue telle quelle (le store n'écrit pas à vide).
    expect(ensureControls(m, 0, 30)).toBe(m);
  });

  it('une récolte verse l’XP aux champions ET le double à leurs pièces portées', () => {
    const m = captureControl(mapAt(30), CAMP, ['a0', 'a1', 'a2'], 0, 7);
    const p = pt(m, CAMP);
    expect(campGearXpPerHour(30)).toBeCloseTo(2 * trainingXpPerHour(30), 9);
    const got = trainingStock(p, 6 * H, 30);
    expect(got).toBe(Math.floor(trainingXpPerHour(30) * 6));
    const c = collectControl(m, CAMP, 6 * H, 30);
    for (const id of ['a0', 'a1', 'a2']) {
      expect(c.xpBy[id]).toBe(got);
      expect(c.gearXp[id]).toBe(Math.round(got * CONTROL.gearXpMult));
    }
    expect(c.gold).toBe(0);
  });

  it('seules les pièces PORTÉES par la garnison apprennent, jamais au-delà de leur porteur', () => {
    // Niveau 25 : la tranche du rang monte jusqu'à 30, donc c'est le PORTEUR qui plafonne.
    const { advs, stock } = team(25);
    const out = campGear(stock, advs, { a0: 1e7 });
    for (const g of out) {
      const before = stock.find((x) => x.id === g.id)!;
      const moved = g.level !== before.level || (g.xp ?? 0) !== (before.xp ?? 0);
      expect(moved).toBe(g.id.startsWith('g0-'));
      expect(g.level).toBeLessThanOrEqual(advs[0]!.level);
    }
    // Rien à verser → le même tableau (le store n'écrit pas à vide).
    expect(campGear(stock, advs, { a0: 0 })).toBe(stock);
    expect(campGear(stock, advs, {})).toBe(stock);
  });

  describe('🎯 chaque champion a sa jauge, selon le temps passé sur place', () => {
    const at = (m: ReturnType<typeof mapAt>, t: number) => settleReinforcements(m, t, 30);

    it('un renfort arrivé plus tard gagne moins, et part de zéro', () => {
      let m = captureControl(mapAt(30), CAMP, ['a0'], 0, 7);
      m = reinforceControl(m, CAMP, ['a1'], 4 * H);
      m = at(m, 5 * H);
      const p = pt(m, CAMP);
      const r = trainingXpPerHour(30);
      const by = trainingStockBy(p, 10 * H, 30);
      expect(by.a0).toBeCloseTo(10 * r, 6);
      expect(by.a1).toBeCloseTo(6 * r, 6);
      const c = collectControl(m, CAMP, 10 * H, 30);
      expect(c.xpBy.a0).toBe(Math.floor(10 * r + 1e-9));
      expect(c.xpBy.a1).toBe(Math.floor(6 * r + 1e-9));
    });

    it('un renfort en route n’apprend rien', () => {
      let m = captureControl(mapAt(30), CAMP, ['a0'], 0, 7);
      m = reinforceControl(m, CAMP, ['a1'], 8 * H);
      const by = trainingStockBy(pt(m, CAMP), 6 * H, 30);
      expect(by.a1).toBeUndefined();
    });

    it('un champion ramené garde ce qu’il a gagné, puis n’avance plus', () => {
      let m = captureControl(mapAt(30), CAMP, ['a0', 'a1'], 0, 7);
      m = releaseFromControl(m, CAMP, ['a1'], 3 * H, 30);
      const p = pt(m, CAMP);
      const r = trainingXpPerHour(30);
      const by = trainingStockBy(p, 9 * H, 30);
      expect(by.a1).toBeCloseTo(3 * r, 6);
      expect(by.a0).toBeCloseTo(9 * r, 6);
      const c = collectControl(m, CAMP, 9 * H, 30);
      expect(c.xpBy.a1).toBe(Math.floor(3 * r + 1e-9));
      // La récolte vide sa ligne : il ne réapparaît plus.
      expect(trainingStockBy(pt(c.map, CAMP), 12 * H, 30).a1).toBeUndefined();
    });

    it('la fraction entamée reste acquise d’une récolte à l’autre', () => {
      const m = captureControl(mapAt(30), CAMP, ['a0'], 0, 7);
      const p0 = pt(m, CAMP);
      const r = trainingXpPerHour(30);
      const t = (2.5 / r) * H; // 2,5 XP
      const c1 = collectControl(m, CAMP, t, 30);
      expect(c1.xpBy.a0).toBe(2);
      const c2 = collectControl(c1.map, CAMP, t + (0.5 / r) * H, 30);
      expect(c2.xpBy.a0).toBe(1);
    });

    it('un camp d’avant (réserve commune) vaut pour chaque champion posté', () => {
      const m = captureControl(mapAt(30), CAMP, ['a0', 'a1'], 0, 7);
      const p = pt(m, CAMP);
      const legacy = { ...p, control: { ...p.control!, banked: 40 } };
      const by = trainingStockBy(legacy, 0, 30);
      expect(by.a0).toBe(40);
      expect(by.a1).toBe(40);
    });

    it('chaque jauge plafonne à 24 h de présence', () => {
      const m = captureControl(mapAt(30), CAMP, ['a0'], 0, 7);
      const p = pt(m, CAMP);
      expect(trainingStockBy(p, 40 * H, 30).a0).toBeCloseTo(24 * trainingXpPerHour(30), 6);
    });
  });
});

describe('🏰 une garnison tient ou se fait déborder — jamais pour toujours', () => {
  /** Enchaîne des reprises (même règle que le store : troupe tirée, renforcée par
   *  `retakeBoost`) jusqu'à la première défaite. Rend le nombre d'attaques repoussées. */
  function holdsBeforeFall(p: Poi, advs: Adventurer[], stock: AdvGear[], seed: number): number {
    const allies = partyAllies(advs, { advGear: stock }, null);
    const group = fuseUnits(allies, 'Garnison');
    const boost = retakeBoost(p, allies);
    const seats = seatsOf(p.control!.kind);
    const rng = mulberry32(seed);
    for (let n = 0; n < 500; n++) {
      const size = CONTROL.sizes[Math.floor(rng() * CONTROL.sizes.length)]!;
      const foe = campFoe(p, { faction: 'bandits', size: ((size * seats) / 3) * boost });
      if (!simulateCombat(group, foe, { seed: (rng() * 2 ** 31) | 1, goldOnWin: 0 }).win) return n;
    }
    return 500;
  }

  for (const [label, lag] of [
    ['au niveau du lieu', 0],
    ['bien au-dessus du lieu', 15],
  ] as const)
    it(`3 champions ${label} : repoussent au plus 90 % des attaques, et finissent par tomber`, () => {
      const L = 30;
      const p = {
        ...pt(captureControl(mapAt(L), CAMP, ['a0', 'a1', 'a2'], 0, 7), CAMP),
        level: L,
      };
      const { advs, stock } = team(L + lag);
      const hold = garrisonHold(p, partyAllies(advs, { advGear: stock }, null));
      expect(hold).toBeLessThanOrEqual(CONTROL.maxHold);
      const runs = Array.from({ length: 200 }, (_, s) =>
        holdsBeforeFall(p, advs, stock, s * 97 + 5),
      );
      const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
      // Mesuré : une garnison tombe en moyenne après ~5 à 9 attaques repoussées.
      expect(mean).toBeLessThan(12);
      expect(Math.max(...runs)).toBeLessThan(500);
      // …et elle en repousse quand même : ce n'est pas une défaite annoncée.
      expect(mean).toBeGreaterThan(1);
    }, 120_000);
});
