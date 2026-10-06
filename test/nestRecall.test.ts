import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import {
  advanceWorld,
  createMap,
  forgetDeparture,
  moveDeparture,
  recentDepartures,
  recordDeparture,
  type ExpeditionMap,
  type Poi,
} from '@/lib/expedition';
import { ensureControls } from '@/lib/controlPoints';
import { ensureIslandConquest, nestThreshold } from '@/lib/islandConquest';

const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3_600_000;
const LV = 30;

function islandMap(): ExpeditionMap {
  const m = createMap(5, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(2));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}
const tick = (m: ExpeditionMap, t: number) => ensureIslandConquest(m, t, LV);
const nests = (m: ExpeditionMap): Poi[] =>
  m.pois.filter((p) => p.control?.kind === 'objective' && p.control.owner === 'enemy');

/** `n` voyages envoyés à `t0`, qui arrivent 1 h plus tard (une seconde d'écart). */
function sent(m: ExpeditionMap, n: number, t0: number): { map: ExpeditionMap; arrivals: number[] } {
  let map = m;
  const arrivals: number[] = [];
  for (let k = 0; k < n; k++) {
    const at = t0 + H + k * 1000;
    map = recordDeparture(map, t0 + k * 1000, at);
    arrivals.push(at);
  }
  return { map, arrivals };
}

describe('🪺🔙 un voyage rappelé ne fait pas apparaître de nid', () => {
  it('une sortie ne compte qu’à son ARRIVÉE', () => {
    const m0 = islandMap();
    const k = nestThreshold(m0.seed, 0);
    const { map, arrivals } = sent(m0, k, NOW + 1000);
    // En route : aucun nid, et la carte ne les oublie pas d'un tick à l'autre.
    const mid = tick(advanceWorld(map, NOW + H / 2, LV, ISLAND_OUTPOST_LEVEL), NOW + H / 2);
    expect(nests(mid)).toHaveLength(3);
    expect(mid.departures).toEqual(expect.arrayContaining(arrivals));
    // Arrivés : le nid apparaît.
    expect(nests(tick(mid, NOW + 2 * H))).toHaveLength(4);
  });

  it('un demi-tour retire la sortie : le seuil n’est pas atteint', () => {
    const m0 = islandMap();
    const k = nestThreshold(m0.seed, 0);
    const { map, arrivals } = sent(m0, k, NOW + 1000);
    const recalled = forgetDeparture(map, arrivals[0]!);
    expect(nests(tick(recalled, NOW + 2 * H))).toHaveLength(3);
    // Une sortie de plus, arrivée, et il apparaît.
    const again = recordDeparture(recalled, NOW + H, NOW + H + 30_000);
    expect(nests(tick(again, NOW + 2 * H))).toHaveLength(4);
  });

  it('forgetDeparture ne retire qu’UNE sortie, et rend la même carte sinon', () => {
    const m = { ...islandMap(), departures: [NOW + H, NOW + H] };
    expect(forgetDeparture(m, NOW + H).departures).toEqual([NOW + H]);
    expect(forgetDeparture(m, NOW)).toBe(m);
    expect(forgetDeparture({ ...m, departures: [NOW] }, NOW).departures).toBeUndefined();
  });

  it('un boost déplace la sortie avec l’arrivée', () => {
    const m = { ...islandMap(), departures: [NOW + 2 * H] };
    const b = moveDeparture(m, NOW + 2 * H, NOW + H);
    expect(b.departures).toEqual([NOW + H]);
    expect(moveDeparture(m, NOW, NOW + H)).toBe(m);
  });

  it('une sortie encore en route ne compte pas', () => {
    const m = recordDeparture(islandMap(), NOW, NOW + H);
    expect(recentDepartures(m, NOW)).toHaveLength(0);
    expect(recentDepartures(m, NOW + H)).toHaveLength(1);
  });
});
