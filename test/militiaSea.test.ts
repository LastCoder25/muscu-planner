import { describe, expect, it } from 'vitest';
import {
  activeMilitiaRoom,
  islandMilitiaStock,
  militiaSailingTo,
  settleMilitiaSailings,
  shipMilitia,
  shipMilitiaBlocker,
  shippableMilitia,
} from '@/lib/militiaSea';
import { CROSSING, landCrossing, settleSailings } from '@/lib/crossing';
import { archipelOn } from '@/lib/archipelago';
import { createMap, type Crossing, type ExpeditionMap, type Poi } from '@/lib/expedition';
import { islandMilitiaOf } from '@/lib/controlPoints';
import { FORTRESS_ID } from '@/lib/islandConquest';

const H = 3600_000;
const T0 = Date.UTC(2026, 9, 12, 10, 0, 0);

const point = (id: string, garrison: string[]): Poi =>
  ({
    id,
    type: 'control',
    level: 15,
    x: 50,
    y: 50,
    distNorm: 0.3,
    spawnedAt: T0,
    expiresAt: 9e15,
    control: {
      kind: id === 'ctl_mine' ? 'mine' : 'garden',
      owner: 'player',
      faction: 'bandits',
      size: 1,
      garrison,
      retakes: 0,
      since: T0 - 24 * H,
      collectedAt: T0 - 24 * H,
    },
  }) as Poi;

/** L'île 1 rangée : 2 miliciens en réserve, 3 sur la mine, 1 au jardin. */
function stored1(): ExpeditionMap {
  const m = createMap(42, T0, 18, 3, undefined, archipelOn(1));
  return {
    ...m,
    archipel: { ...m.archipel!, destroyed: [FORTRESS_ID] },
    pois: [point('ctl_mine', ['mil:1', 'mil:2', 'mil:3']), point('ctl_garden', ['mil:4'])],
    militia: { home: 2, producedAt: T0, seq: 6 },
  };
}

/** L'île 2 active, l'île 1 rangée. */
function active2(extra: Partial<ExpeditionMap> = {}): ExpeditionMap {
  const m = createMap(7, T0, 21, 3, undefined, archipelOn(2));
  return { ...m, pois: [], islands: { '1': stored1() }, ...extra };
}

const seats2 = islandMilitiaOf({ archipel: archipelOn(2) })!.seats;

describe('⛵🛡️ faire venir des miliciens d’une île rangée', () => {
  it('le stock d’une île = sa réserve + ses miliciens postés', () => {
    expect(islandMilitiaStock(stored1())).toBe(6);
  });

  it('la réserve part d’abord, puis le lieu le plus garni ; 2 h de mer', () => {
    const out = shipMilitia(active2(), null, 1, 4, T0, 21)!;
    const im = out.islands!['1']!;
    expect(im.militia!.home).toBe(0);
    const mine = im.pois.find((p) => p.id === 'ctl_mine')!.control!;
    const garden = im.pois.find((p) => p.id === 'ctl_garden')!.control!;
    expect(mine.garrison).toEqual(['mil:1']);
    expect(garden.garrison).toEqual(['mil:4']);
    // La production faite est mise de côté avant le départ.
    expect(mine.collectedAt).toBe(T0);
    const s = out.sailings![0]!;
    expect(s).toMatchObject({ from: 1, to: 2, militia: 4, ids: [] });
    expect(s.arriveAt - s.departAt).toBe(CROSSING.travelMs);
    expect(militiaSailingTo(out, 2)).toBe(4);
  });

  it('refuse ce qui ne se peut pas, avec sa raison', () => {
    expect(shipMilitiaBlocker(active2(), null, 2, 1)).toBe('same');
    expect(shipMilitiaBlocker(active2(), null, 3, 1)).toBe('notVisited');
    expect(shipMilitiaBlocker(active2(), null, 1, 0)).toBe('empty');
    expect(shipMilitiaBlocker(active2(), null, 1, 7)).toBe('tooMany');
    const full = { home: seats2 - 1, producedAt: T0, seq: 0 };
    expect(shipMilitiaBlocker(active2(), full, 1, 2)).toBe('noRoom');
    expect(shipMilitiaBlocker(active2(), full, 1, 1)).toBeNull();
    expect(shipMilitia(active2(), full, 1, 2, T0, 21)).toBeNull();
  });

  it('les places de l’île active comptent ceux déjà en mer vers elle', () => {
    const once = shipMilitia(active2(), null, 1, 5, T0, 21)!;
    expect(activeMilitiaRoom(once, null)).toBe(seats2 - 5);
    expect(shippableMilitia(once, null, 1)).toBe(1);
  });

  it('à l’arrivée, ils rejoignent la réserve de l’île active', () => {
    const sent = shipMilitia(active2(), null, 1, 3, T0, 21)!;
    expect(settleMilitiaSailings(sent, null, T0 + H)).toBeNull();
    const done = settleMilitiaSailings(sent, { home: 1, producedAt: T0, seq: 0 }, T0 + 2 * H)!;
    expect(done.reserve!.home).toBe(4);
    expect(done.map.sailings).toBeUndefined();
  });

  it('si le héros a changé d’île pendant la mer, ils accostent sur l’île visée, rangée', () => {
    const sail: Crossing = {
      from: 3,
      to: 1,
      bookedAt: T0,
      departAt: T0,
      arriveAt: T0 + 2 * H,
      ids: [],
      militia: 2,
    };
    const m = active2({ sailings: [sail] });
    const done = settleMilitiaSailings(m, { home: 1, producedAt: T0, seq: 0 }, T0 + 2 * H)!;
    expect(done.reserve!.home).toBe(1);
    expect(done.map.islands!['1']!.militia!.home).toBe(4);
  });

  it('les navigations de champions ne les règlent pas, et l’inverse', () => {
    const mil: Crossing = {
      from: 1,
      to: 2,
      bookedAt: T0,
      departAt: T0,
      arriveAt: T0 + H,
      ids: [],
      militia: 2,
    };
    const champ: Crossing = { ...mil, ids: ['a'], militia: undefined };
    const m = active2({ sailings: [mil, champ] });
    const champs = settleSailings(m, [], T0 + 2 * H)!;
    expect(champs.map.sailings).toEqual([mil]);
    const mils = settleMilitiaSailings(m, null, T0 + 2 * H)!;
    expect(mils.map.sailings).toEqual([champ]);
  });

  it('une traversée vers l’avant garde les miliciens en mer (pas les champions)', () => {
    const mil: Crossing = {
      from: 3,
      to: 1,
      bookedAt: T0,
      departAt: T0,
      arriveAt: T0 + 5 * H,
      ids: [],
      militia: 2,
    };
    const champ: Crossing = { ...mil, ids: ['a'], militia: undefined };
    const m1 = stored1();
    const map: ExpeditionMap = {
      ...m1,
      militia: undefined,
      crossing: { from: 1, to: 2, bookedAt: T0, departAt: T0, arriveAt: T0 + H, ids: [] },
      sailings: [mil, champ],
    };
    const land = landCrossing(map, T0 + H, 21, null);
    expect(land.map.sailings).toEqual([mil]);
  });
});
