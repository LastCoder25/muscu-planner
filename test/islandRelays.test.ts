import { describe, expect, it } from 'vitest';
import {
  advanceWorld,
  createMap,
  distNormAt,
  EXPE,
  poiTravelLevel,
  travelOneWayMin,
  type ExpeditionMap,
  type Poi,
} from '@/lib/expedition';
import { archipelOn, ISLAND_OUTPOST_LEVEL, ISLANDS } from '@/lib/archipelago';
import {
  ensureIslandConquest,
  FORTRESS_ID,
  heldPoints,
  islandConquest,
  objectiveIdOf,
  OBJECTIVES_AFTER_HELD,
  withRelays,
} from '@/lib/islandConquest';
import { ensureControls, islandControlLevel } from '@/lib/controlPoints';
import { partySendBlocker } from '@/lib/party';
import { islandPort } from '@/lib/islandShape';

/**
 * 🧭 ÉTAPE 6 BIS (décisions de l'utilisateur, 2026-10-02) : on débarque au village du port et
 * on s'étend. Plus d'avant-postes désignés ni de durée imposée à la forteresse : les trajets
 * partent du lieu tenu le PLUS PROCHE — chaque lieu pris rapproche le reste.
 */
const DAY = 86_400_000;
const leg = (p: Poi) => travelOneWayMin(poiTravelLevel(p), p.distNorm);
const fromTown = (p: Poi) => Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);

/** Une île jouée `days` jours, comme le tick de la carte la tient à jour. */
function island(id: number, seed: number, days = 6): ExpeditionMap {
  const lv = archipelOn(id).levelCap;
  let m = createMap(seed, 0, lv, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  for (let d = 0; d < days; d++) {
    const t = d * DAY;
    m = ensureIslandConquest(
      ensureControls(advanceWorld(m, t, lv, ISLAND_OUTPOST_LEVEL), t, lv, ISLAND_OUTPOST_LEVEL),
      t,
      lv,
    );
  }
  return m;
}
const hold = (m: ExpeditionMap, ids: readonly string[]): ExpeditionMap => ({
  ...m,
  pois: m.pois.map((p) =>
    p.control && ids.includes(p.id)
      ? { ...p, control: { ...p.control, owner: 'player' as const, garrison: ['a'] } }
      : p,
  ),
});
/** Les lieux fixes ordinaires (pas les objectifs ni la forteresse), du plus proche au plus loin. */
const ordinary = (m: ExpeditionMap) =>
  m.pois
    .filter((p) => p.control && !p.id.startsWith('isl_'))
    .sort((a, b) => fromTown(a) - fromTown(b));

describe('🏝️ toute l’île, jusqu’aux côtes', () => {
  it('rien ne tenu : les lieux vont au-delà de 2 h d’aller, la forteresse suit sa distance', () => {
    for (const isl of ISLANDS) {
      let worst = 0;
      for (const seed of [3, 11, 29]) {
        const m = island(isl.id, seed);
        worst = Math.max(worst, ...m.pois.filter((p) => p.type !== 'warband').map(leg));
        const fort = m.pois.find((p) => p.id === FORTRESS_ID)!;
        // ⚠️ Plus de durée imposée (3 h / 2 h en relais) : la distance au village, rien d'autre.
        expect(fort.distNorm, `forteresse île ${isl.id}`).toBeCloseTo(
          distNormAt(fromTown(fort)),
          9,
        );
      }
      expect(worst, `île ${isl.id}`).toBeGreaterThan(150);
    }
  });
  it('les lieux sont espacés : ~23 unités au plus proche voisin en moyenne (16,5 avant)', () => {
    for (const isl of ISLANDS) {
      let sum = 0;
      let n = 0;
      for (const seed of [1, 7, 13, 21]) {
        const ps = island(isl.id, seed).pois.filter((p) => p.type !== 'warband');
        for (const p of ps) {
          sum += Math.min(
            ...ps.filter((q) => q !== p).map((q) => Math.hypot(p.x - q.x, p.y - q.y)),
          );
          n++;
        }
      }
      expect(sum / n, `île ${isl.id}`).toBeGreaterThan(20);
    }
  });
  it('aucun lieu fixe ne se chevauche (≥ 10 unités entre deux)', () => {
    for (const isl of ISLANDS)
      for (const seed of [1, 7, 13, 21]) {
        const fixed = island(isl.id, seed).pois.filter((p) => p.control);
        for (let i = 0; i < fixed.length; i++)
          for (let j = i + 1; j < fixed.length; j++)
            expect(
              Math.hypot(fixed[i]!.x - fixed[j]!.x, fixed[i]!.y - fixed[j]!.y),
              `île ${isl.id} ${fixed[i]!.id}/${fixed[j]!.id}`,
            ).toBeGreaterThanOrEqual(10);
      }
  });
});

describe('🧭 les trajets partent du lieu tenu le plus proche', () => {
  it('chaque lieu se mesure depuis le village OU le lieu tenu le plus proche', () => {
    for (const isl of ISLANDS) {
      const m0 = island(isl.id, 5);
      const relay = ordinary(m0).at(-1)!; // le plus loin du village
      const m = ensureIslandConquest(hold(m0, [relay.id]), DAY * 7, isl.maxLevel);
      for (const p of m.pois) {
        if (p.type === 'warband') continue;
        const d =
          p.id === relay.id
            ? fromTown(p)
            : Math.min(fromTown(p), Math.hypot(p.x - relay.x, p.y - relay.y));
        expect(p.distNorm, `île ${isl.id} ${p.id}`).toBeCloseTo(distNormAt(d), 9);
      }
    }
  });
  it('tenir un lieu vers la forteresse raccourcit son trajet', () => {
    for (const isl of ISLANDS) {
      const m0 = island(isl.id, 5);
      const f0 = m0.pois.find((p) => p.id === FORTRESS_ID)!;
      const near = ordinary(m0).sort(
        (a, b) => Math.hypot(a.x - f0.x, a.y - f0.y) - Math.hypot(b.x - f0.x, b.y - f0.y),
      )[0]!;
      const m = ensureIslandConquest(hold(m0, [near.id]), DAY * 7, isl.maxLevel);
      const f = m.pois.find((p) => p.id === FORTRESS_ID)!;
      expect(leg(f), `île ${isl.id}`).toBeLessThan(leg(f0));
    }
  });
  it('un lieu tenu ne se rapproche pas de lui-même ; sans rien tenir, rien ne change', () => {
    const m0 = island(2, 9);
    expect(withRelays(m0)).toBe(m0);
    const p = ordinary(m0)[0]!;
    const m = withRelays(hold(m0, [p.id]));
    expect(m.pois.find((q) => q.id === p.id)!.distNorm).toBeCloseTo(distNormAt(fromTown(p)), 9);
  });
  it('hors archipel, rien', () => {
    const m = createMap(3, 0, 20, 10);
    expect(withRelays(m)).toBe(m);
  });
});

describe('🏳️ les objectifs s’ouvrent une fois DEUX lieux tenus, n’importe lesquels', () => {
  it('verrouillés à 0 et 1, ouverts à 2', () => {
    const m = island(2, 4);
    const obj = (x: ExpeditionMap) => x.pois.find((p) => p.id === objectiveIdOf(0))!;
    const [a, b] = ordinary(m).slice(-2);
    expect(heldPoints(m)).toHaveLength(0);
    expect(obj(m).control!.locked).toBe(true);
    expect(partySendBlocker(obj(m), 3, false, 10, 0.5, 0)).toBe('objectiveLocked');
    const one = ensureIslandConquest(hold(m, [a!.id]), DAY * 7, 40);
    expect(obj(one).control!.locked).toBe(true);
    const both = ensureIslandConquest(hold(m, [a!.id, b!.id]), DAY * 7, 40);
    expect(islandConquest(one)?.pointsHeld).toBe(1);
    expect(islandConquest(both)?.pointsHeld).toBe(OBJECTIVES_AFTER_HELD);
    expect(obj(both).control!.locked).toBeUndefined();
    expect(partySendBlocker(obj(both), 3, false, 10, 0.5, 0)).toBeNull();
  });
  it('plus aucune marque « avant-poste » : celles d’avant tombent', () => {
    const m = island(1, 9);
    const marked = {
      ...m,
      pois: m.pois.map((p) => (p.control ? { ...p, control: { ...p.control, outpost: true } } : p)),
    };
    const out = ensureIslandConquest(marked, DAY * 7, 20);
    expect(out.pois.some((p) => p.control?.outpost)).toBe(false);
  });
});

describe('🏅 le rang d’un lieu fixe monte en s’éloignant du port', () => {
  it('jamais pris : niveau croissant avec la distance au port d’arrivée, dans la tranche de l’île', () => {
    for (const isl of ISLANDS) {
      const lv = archipelOn(isl.id).levelCap;
      const port = islandPort(isl.id);
      const m = island(isl.id, 6);
      const pts = ordinary(m)
        .filter((p) => p.control!.owner === 'enemy')
        .sort(
          (a, b) => Math.hypot(a.x - port.x, a.y - port.y) - Math.hypot(b.x - port.x, b.y - port.y),
        );
      expect(pts.length).toBeGreaterThan(2);
      for (let i = 1; i < pts.length; i++)
        expect(pts[i]!.level, `île ${isl.id}`).toBeGreaterThanOrEqual(pts[i - 1]!.level);
      for (const p of pts) {
        expect(p.level).toBeGreaterThanOrEqual(isl.minLevel);
        expect(p.level).toBeLessThanOrEqual(lv);
        expect(p.level).toBe(islandControlLevel(m, p, lv));
      }
      // Le plus proche est bas dans la tranche, le plus loin haut.
      expect(pts.at(-1)!.level - pts[0]!.level, `île ${isl.id}`).toBeGreaterThan(
        (lv - isl.minLevel) * 0.2,
      );
    }
  });
  it('jamais au-dessus du joueur', () => {
    const m = archipelOn(3);
    expect(islandControlLevel(m, { x: 400, y: 400 }, m.levelFloor + 1)).toBe(m.levelFloor + 1);
  });
});
