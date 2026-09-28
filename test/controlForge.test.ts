import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  collectControl,
  controlIdOf,
  ensureControls,
  forgeGear,
  forgeStock,
  forgeStockBy,
  reinforceControl,
  releaseFromControl,
  settleReinforcements,
  forgeXpPerHour,
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
const FORGE = controlIdOf('forge');
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

describe('⚒️ la forge de campagne', () => {
  it('un point fixe de plus, à 3 places, glissé entre la mine et le camp sans rien déplacer', () => {
    const m = mapAt(30);
    const f = pt(m, FORGE);
    expect(f.control!.kind).toBe('forge');
    expect(seatsOf('forge')).toBe(3);
    // Les quatre autres gardent la place qu'ils avaient avant la forge (quarts de tour).
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
    expect(quarter(FORGE)).toBeCloseTo(0.5, 1);
    // Et aucun point ne se pose sur un autre.
    const ctl = m.pois.filter((p) => p.control);
    for (const a of ctl)
      for (const b of ctl)
        if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(10);
  });

  it('elle accumule de l’XP par pièce, deux fois plus vite que le camp n’en donne aux champions', () => {
    const m = captureControl(mapAt(30), FORGE, ['a0', 'a1', 'a2'], 0, 7);
    const p = pt(m, FORGE);
    expect(forgeXpPerHour(30)).toBeCloseTo(2 * trainingXpPerHour(30), 9);
    expect(forgeStock(p, 6 * H, 30)).toBe(Math.floor(forgeXpPerHour(30) * 6));
    const c = collectControl(m, FORGE, 6 * H, 30);
    for (const id of ['a0', 'a1', 'a2']) expect(c.gearXp[id]).toBe(forgeStock(p, 6 * H, 30));
    expect(c.xpBy).toEqual({});
    expect(c.gold).toBe(0);
  });

  it('seules les pièces PORTÉES par la garnison apprennent, jamais au-delà de leur porteur', () => {
    // Niveau 25 : la tranche du rang monte jusqu'à 30, donc c'est le PORTEUR qui plafonne.
    const { advs, stock } = team(25);
    const out = forgeGear(stock, advs, { a0: 1e7 });
    for (const g of out) {
      const before = stock.find((x) => x.id === g.id)!;
      const moved = g.level !== before.level || (g.xp ?? 0) !== (before.xp ?? 0);
      expect(moved).toBe(g.id.startsWith('g0-'));
      expect(g.level).toBeLessThanOrEqual(advs[0]!.level);
    }
    // Rien à verser → le même tableau (le store n'écrit pas à vide).
    expect(forgeGear(stock, advs, { a0: 0 })).toBe(stock);
    expect(forgeGear(stock, advs, {})).toBe(stock);
  });

  describe('⚒️ chaque champion a sa jauge, selon le temps passé sur place', () => {
    const at = (m: ReturnType<typeof mapAt>, t: number) => settleReinforcements(m, t, 30);

    it('un renfort arrivé plus tard gagne moins, et part de zéro', () => {
      let m = captureControl(mapAt(30), FORGE, ['a0'], 0, 7);
      m = reinforceControl(m, FORGE, ['a1'], 4 * H);
      m = at(m, 5 * H);
      const p = pt(m, FORGE);
      const r = forgeXpPerHour(30);
      const by = forgeStockBy(p, 10 * H, 30);
      expect(by.a0).toBeCloseTo(10 * r, 6);
      expect(by.a1).toBeCloseTo(6 * r, 6);
      const c = collectControl(m, FORGE, 10 * H, 30);
      expect(c.gearXp.a0).toBe(Math.floor(10 * r + 1e-9));
      expect(c.gearXp.a1).toBe(Math.floor(6 * r + 1e-9));
    });

    it('un renfort en route n’apprend rien', () => {
      let m = captureControl(mapAt(30), FORGE, ['a0'], 0, 7);
      m = reinforceControl(m, FORGE, ['a1'], 8 * H);
      const by = forgeStockBy(pt(m, FORGE), 6 * H, 30);
      expect(by.a1).toBeUndefined();
    });

    it('un champion ramené garde ce qu’il a gagné, puis n’avance plus', () => {
      let m = captureControl(mapAt(30), FORGE, ['a0', 'a1'], 0, 7);
      m = releaseFromControl(m, FORGE, ['a1'], 3 * H, 30);
      const p = pt(m, FORGE);
      const r = forgeXpPerHour(30);
      const by = forgeStockBy(p, 9 * H, 30);
      expect(by.a1).toBeCloseTo(3 * r, 6);
      expect(by.a0).toBeCloseTo(9 * r, 6);
      const c = collectControl(m, FORGE, 9 * H, 30);
      expect(c.gearXp.a1).toBe(Math.floor(3 * r + 1e-9));
      // La récolte vide sa ligne : il ne réapparaît plus.
      expect(forgeStockBy(pt(c.map, FORGE), 12 * H, 30).a1).toBeUndefined();
    });

    it('la fraction entamée reste acquise d’une récolte à l’autre', () => {
      const m = captureControl(mapAt(30), FORGE, ['a0'], 0, 7);
      const p0 = pt(m, FORGE);
      const r = forgeXpPerHour(30);
      const t = (2.5 / r) * H; // 2,5 XP
      const c1 = collectControl(m, FORGE, t, 30);
      expect(c1.gearXp.a0).toBe(2);
      const c2 = collectControl(c1.map, FORGE, t + (0.5 / r) * H, 30);
      expect(c2.gearXp.a0).toBe(1);
    });

    it('une forge d’avant (réserve commune) vaut pour chaque champion posté', () => {
      const m = captureControl(mapAt(30), FORGE, ['a0', 'a1'], 0, 7);
      const p = pt(m, FORGE);
      const legacy = { ...p, control: { ...p.control!, banked: 40 } };
      const by = forgeStockBy(legacy, 0, 30);
      expect(by.a0).toBe(40);
      expect(by.a1).toBe(40);
    });

    it('chaque jauge plafonne à 24 h de présence', () => {
      const m = captureControl(mapAt(30), FORGE, ['a0'], 0, 7);
      const p = pt(m, FORGE);
      expect(forgeStockBy(p, 40 * H, 30).a0).toBeCloseTo(24 * forgeXpPerHour(30), 6);
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
        ...pt(captureControl(mapAt(L), FORGE, ['a0', 'a1', 'a2'], 0, 7), FORGE),
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
