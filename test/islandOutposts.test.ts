import { describe, expect, it } from 'vitest';
import {
  advanceWorld,
  createMap,
  ISLAND_MAX_LEG_MIN,
  poiLabel,
  poiTravelLevel,
  travelOneWayMin,
  type ExpeditionMap,
  type Poi,
} from '@/lib/expedition';
import { archipelOn, ISLAND_OUTPOST_LEVEL, ISLANDS } from '@/lib/archipelago';
import {
  ensureIslandConquest,
  FORTRESS_ID,
  FORTRESS_RELAY_LEG_MIN,
  ISLAND_OUTPOSTS,
  islandConquest,
  objectiveIdOf,
  outpostsHeld,
} from '@/lib/islandConquest';
import { ensureControls } from '@/lib/controlPoints';
import { islandTerrain } from '@/lib/islandTerrain';
import { partySendBlocker } from '@/lib/party';

const DAY = 86_400_000;
const leg = (p: Poi) => travelOneWayMin(poiTravelLevel(p), p.distNorm);

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
const hold = (m: ExpeditionMap, kinds: readonly string[]): ExpeditionMap => ({
  ...m,
  pois: m.pois.map((p) =>
    p.control && kinds.includes(p.control.kind)
      ? { ...p, control: { ...p.control, owner: 'player' as const, garrison: ['a'] } }
      : p,
  ),
});

describe('🏝️ 4 h aller-retour au plus, de la base aux bords de l’île', () => {
  it('sur les cinq îles, aucun lieu (forteresse comprise) à plus de 2 h d’aller', () => {
    for (const isl of ISLANDS)
      for (const seed of [3, 11, 29]) {
        const m = island(isl.id, seed);
        const worst = Math.max(...m.pois.map(leg));
        expect(worst, `île ${isl.id}`).toBeLessThanOrEqual(ISLAND_MAX_LEG_MIN);
        const fort = m.pois.find((p) => p.id === FORTRESS_ID)!;
        expect(leg(fort), `forteresse île ${isl.id}`).toBe(ISLAND_MAX_LEG_MIN);
      }
  });
});

describe('🏝️ les deux avant-postes', () => {
  it('posés sur la route base → forteresse, marqués « avant-poste »', () => {
    for (const isl of ISLANDS) {
      const m = island(isl.id, 7);
      const f = islandTerrain(isl.id).fortress;
      for (const k of ISLAND_OUTPOSTS) {
        const p = m.pois.find((q) => q.control?.kind === k)!;
        expect(p.control!.outpost).toBe(true);
        expect(poiLabel(p)).toContain('avant-poste');
        const a = Math.atan2(p.y - 100, p.x - 100);
        const diff = Math.abs(Math.atan2(Math.sin(a - f.angle), Math.cos(a - f.angle)));
        expect(diff, `île ${isl.id} ${k}`).toBeLessThan(0.8);
        expect(Math.hypot(p.x - f.x, p.y - f.y)).toBeLessThan(Math.hypot(f.x - 100, f.y - 100));
      }
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
  it('tenus TOUS LES DEUX, ils servent de relais : la forteresse passe à 1 h 15', () => {
    for (const isl of ISLANDS) {
      const m = island(isl.id, 5);
      const fort = (x: ExpeditionMap) => x.pois.find((p) => p.id === FORTRESS_ID)!;
      const one = ensureIslandConquest(hold(m, [ISLAND_OUTPOSTS[0]!]), DAY * 7, isl.maxLevel);
      expect(leg(fort(one))).toBe(ISLAND_MAX_LEG_MIN);
      const both = ensureIslandConquest(hold(m, ISLAND_OUTPOSTS), DAY * 7, isl.maxLevel);
      expect(leg(fort(both))).toBe(FORTRESS_RELAY_LEG_MIN);
    }
  });
  it('abattre un objectif ne déplace pas des avant-postes encore ennemis', () => {
    const m = island(2, 8);
    const spot = (x: ExpeditionMap) =>
      x.pois.filter((p) => p.control?.outpost).map((p) => `${p.x},${p.y}`);
    const after = ensureIslandConquest(
      { ...m, archipel: { ...m.archipel!, destroyed: [objectiveIdOf(1)] } },
      DAY * 7,
      40,
    );
    expect(spot(after)).toEqual(spot(m));
  });
  it('les objectifs sont verrouillés tant que les DEUX ne sont pas tenus', () => {
    const m = island(2, 4);
    const obj = (x: ExpeditionMap) => x.pois.find((p) => p.id === objectiveIdOf(0))!;
    expect(outpostsHeld(m)).toBe(false);
    expect(obj(m).control!.locked).toBe(true);
    expect(partySendBlocker(obj(m), 3, false, 10, 0.5, 0)).toBe('objectiveLocked');
    const one = ensureIslandConquest(hold(m, [ISLAND_OUTPOSTS[0]!]), DAY * 7, 40);
    expect(obj(one).control!.locked).toBe(true);
    const both = ensureIslandConquest(hold(m, ISLAND_OUTPOSTS), DAY * 7, 40);
    expect(outpostsHeld(both)).toBe(true);
    expect(islandConquest(one)?.outpostsHeld).toBe(1);
    expect(islandConquest(both)?.outpostsHeld).toBe(2);
    expect(obj(both).control!.locked).toBeUndefined();
    expect(partySendBlocker(obj(both), 3, false, 10, 0.5, 0)).toBeNull();
  });
  it('un point DÉJÀ tenu au passage en archipel est marqué avant-poste, sans bouger', () => {
    let m = createMap(17, 0, 20, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(1));
    m = hold(ensureControls(m, 0, 20, ISLAND_OUTPOST_LEVEL), [ISLAND_OUTPOSTS[0]!]);
    const before = m.pois.find((p) => p.control?.kind === ISLAND_OUTPOSTS[0])!;
    const after = ensureIslandConquest(m, 0, 20).pois.find((p) => p.id === before.id)!;
    expect(after.control!.outpost).toBe(true);
    expect([after.x, after.y]).toEqual([before.x, before.y]);
  });
  it('un avant-poste tenu ne bouge plus ; hors archipel, la marque tombe', () => {
    const m = hold(island(1, 9), [ISLAND_OUTPOSTS[0]!]);
    const p0 = m.pois.find((p) => p.control?.kind === ISLAND_OUTPOSTS[0])!;
    const moved = ensureIslandConquest(
      { ...m, pois: m.pois.map((p) => (p.id === p0.id ? { ...p, x: p.x + 5 } : p)) },
      DAY * 7,
      20,
    );
    expect(moved.pois.find((p) => p.id === p0.id)!.x).toBe(p0.x + 5);
    const off = { ...m };
    delete off.archipel;
    const out = ensureIslandConquest(off, DAY * 7, 20);
    expect(out.pois.some((p) => p.control?.outpost)).toBe(false);
  });
});
