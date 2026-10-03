import { describe, expect, it } from 'vitest';
import {
  CROSSING,
  boardTravellers,
  crossingBlocker,
  crossingTravellers,
  fortressReward,
  landAdventurers,
  landCrossing,
  landingChestMessage,
  nextCrossingDeparture,
  openIslands,
  produceIslandMilitia,
  startCrossing,
  visitedIslands,
} from '@/lib/crossing';
import { archipelOn, islandById } from '@/lib/archipelago';
import { advUnavailableReason, type Adventurer } from '@/lib/adventurers';
import { createMap, type ExpeditionMap } from '@/lib/expedition';
import { FORTRESS_ID } from '@/lib/islandConquest';
import { GACHA } from '@/lib/gacha';
import { characterRank } from '@/lib/characterRank';
import { militiaCap } from '@/lib/militia';

const H = 3600_000;
const T0 = Date.UTC(2026, 9, 2, 10, 0, 0);

function island1(destroyed: string[] = []): ExpeditionMap {
  const m = createMap(42, T0, 18, 3, undefined, archipelOn(1));
  return { ...m, archipel: { ...m.archipel!, destroyed } };
}
const adv = (id: string, extra: Partial<Adventurer> = {}): Adventurer =>
  ({ id, name: id, seed: 1, path: ['guerrier'], level: 5, xp: 0, ...extra }) as Adventurer;
const free = { heroBusy: false, troopsMoving: false };

describe('⛵ départs à l’heure pile', () => {
  it('le prochain départ est l’heure pile suivante, ou maintenant pile', () => {
    expect(nextCrossingDeparture(T0)).toBe(T0);
    expect(nextCrossingDeparture(T0 + 1)).toBe(T0 + H);
    expect(nextCrossingDeparture(T0 + H - 1)).toBe(T0 + H);
  });
});

describe('⛵ îles ouvertes', () => {
  it('seule l’île 1 tant que sa forteresse tient, la 2 dès qu’elle tombe', () => {
    expect(openIslands(island1())).toEqual([1]);
    expect(openIslands(island1([FORTRESS_ID]))).toEqual([1, 2]);
  });
  it('une île rangée reste ouverte (on retraverse dans les deux sens)', () => {
    const m = { ...island1(), islands: { '3': { ...island1(), archipel: archipelOn(3) } } };
    expect(visitedIslands(m)).toEqual([1, 3]);
    expect(openIslands(m)).toContain(3);
  });
  it('hors archipel, rien', () => {
    expect(openIslands(createMap(1, T0, 10, 3))).toEqual([]);
  });
});

describe('⛵ refus de traverser', () => {
  const m = island1([FORTRESS_ID]);
  it('île fermée, même île, héros pris, troupes en route, déjà en mer', () => {
    expect(crossingBlocker(island1(), 2, free)).toBe('locked');
    expect(crossingBlocker(m, 1, free)).toBe('same');
    expect(crossingBlocker(m, 3, free)).toBe('locked');
    expect(crossingBlocker(m, 2, { ...free, heroBusy: true })).toBe('heroBusy');
    expect(crossingBlocker(m, 2, { ...free, troopsMoving: true })).toBe('troopsMoving');
    expect(crossingBlocker(startCrossing(m, 2, [], T0), 2, free)).toBe('atSea');
    expect(crossingBlocker(m, 2, free)).toBeNull();
  });
});

describe('⛵ qui embarque', () => {
  it('tous les champions libres, jamais les postés, en route, blessés ou ailleurs', () => {
    const advs = [
      adv('a'),
      adv('b', { posted: 'ctl_x' }),
      adv('c', { busyUntil: T0 + H }),
      adv('d', { hurtUntil: T0 + H }),
      adv('e', { elsewhere: 2 }),
      adv('f', { busyUntil: T0 - 1 }),
    ];
    expect(crossingTravellers(advs, T0)).toEqual(['a', 'f']);
  });
  it('les embarqués sont occupés jusqu’à l’arrivée (2 h après le départ)', () => {
    const m = startCrossing(island1([FORTRESS_ID]), 2, ['a'], T0 + 1);
    expect(m.crossing!.departAt).toBe(T0 + H);
    expect(m.crossing!.arriveAt).toBe(T0 + H + CROSSING.travelMs);
    const b = boardTravellers([adv('a'), adv('z')], m.crossing!);
    expect(b[0]!.busyUntil).toBe(m.crossing!.arriveAt);
    expect(b[1]!.busyUntil).toBeUndefined();
  });
});

describe('⚓ débarquer', () => {
  const start = { ...island1([FORTRESS_ID]), citadelStash: [] };
  const booked = startCrossing(start, 2, ['a'], T0);
  const arrive = booked.crossing!.arriveAt;
  it('rien avant l’arrivée', () => {
    const l = landCrossing(booked, arrive - 1, 30, undefined);
    expect(l.crossing).toBeNull();
    expect(l.map).toBe(booked);
  });
  it('l’île quittée est rangée telle quelle, l’île 2 naît peuplée à son rang', () => {
    const l = landCrossing(booked, arrive, 30, undefined);
    expect(l.firstTime).toBe(true);
    expect(l.map.crossing).toBeUndefined();
    expect(l.map.archipel!.island).toBe(2);
    expect(l.map.archipel!.levelFloor).toBe(21);
    expect(l.map.pois.length).toBeGreaterThan(0);
    expect(l.map.citadelStash).toEqual([]);
    const left = l.map.islands!['1']!;
    expect(left.pois).toEqual(start.pois);
    expect(left.archipel!.destroyed).toEqual([FORTRESS_ID]);
    expect(left.islands).toBeUndefined();
    expect(left.crossing).toBeUndefined();
  });
  it('retraverser rend l’île 1 intacte et range l’île 2', () => {
    const on2 = landCrossing(booked, arrive, 30, undefined).map;
    const back = startCrossing(on2, 1, [], arrive + 10);
    const l = landCrossing(back, back.crossing!.arriveAt, 30, undefined);
    expect(l.firstTime).toBe(false);
    expect(l.map.archipel!.island).toBe(1);
    expect(l.map.pois).toEqual(start.pois);
    expect(l.map.islands!['2']!.pois).toEqual(on2.pois);
    expect(l.map.islands!['1']).toBeUndefined();
  });
  it('les champions : embarqués et attendus redeviennent « ici », les autres restent', () => {
    const c = booked.crossing!;
    const out = landAdventurers(
      [adv('a'), adv('p', { posted: 'x' }), adv('w', { elsewhere: 2 }), adv('o', { elsewhere: 3 })],
      c,
    );
    expect(out.map((a) => a.elsewhere)).toEqual([undefined, 1, undefined, 3]);
  });
  it('un champion resté ailleurs est indisponible ici', () => {
    expect(advUnavailableReason(adv('x', { elsewhere: 1 }), T0)).toBe('away');
    expect(advUnavailableReason(adv('x'), T0)).toBeNull();
  });
});

describe('🛡️ une réserve de milice par île', () => {
  const start = island1([FORTRESS_ID]);
  const booked = startCrossing(start, 2, [], T0);
  const arrive = booked.crossing!.arriveAt;
  const mil1 = { home: 4, producedAt: T0, seq: 9 };
  it('la milice ne traverse pas : rangée avec l’île 1, l’île 2 démarre vide', () => {
    const l = landCrossing(booked, arrive, 30, mil1);
    expect(l.militia).toEqual({ home: 0, producedAt: arrive, seq: 0 });
    expect(l.map.islands!['1']!.militia).toEqual(mil1);
    expect(l.map.militia).toBeUndefined();
  });
  it('au retour, la réserve de l’île 1 revient, celle de l’île 2 est rangée', () => {
    const on2 = landCrossing(booked, arrive, 30, mil1);
    const mil2 = { home: 1, producedAt: arrive, seq: 1 };
    const back = startCrossing(on2.map, 1, [], arrive + 10);
    const l = landCrossing(back, back.crossing!.arriveAt, 30, mil2);
    expect(l.militia).toEqual(mil1);
    expect(l.map.militia).toBeUndefined();
    expect(l.map.islands!['2']!.militia).toEqual(mil2);
  });
  it('la Caserne produit pour l’île rangée, bornée par son plafond', () => {
    const on2 = landCrossing(booked, arrive, 30, { home: 0, producedAt: T0, seq: 0 }).map;
    const later = produceIslandMilitia(on2, 10, T0 + 48 * H);
    const home = later.islands!['1']!.militia!.home;
    expect(home).toBeGreaterThan(0);
    expect(home).toBeLessThanOrEqual(militiaCap(10));
    expect(produceIslandMilitia(on2, 0, T0 + 48 * H)).toBe(on2);
    expect(produceIslandMilitia(later, 10, T0 + 48 * H)).toBe(later);
  });
});

describe('🎁 récompenses', () => {
  it('premier débarquement : 10 tirages en pierres de mana, dérivés du prix', () => {
    const m = landingChestMessage(islandById(2)!, T0);
    expect(m.mana).toBe(CROSSING.firstLandingPulls * GACHA.pullCost);
    expect(m.tickets).toBe(10);
    expect(m.claimed).toBe(false);
  });
  it('forteresse abattue : un coffre une seule fois, sceaux au rang max de l’île', () => {
    expect(fortressReward(island1(), T0)).toBeNull();
    const r = fortressReward(island1([FORTRESS_ID]), T0)!;
    expect(r.msg.seals).toEqual({
      kind: 'champion',
      rank: characterRank(20).rankIndex,
      n: CROSSING.fortressSeals,
    });
    expect(r.msg.runes).toBe(CROSSING.fortressRunesBase + 1);
    expect(fortressReward(r.map, T0 + 1)).toBeNull();
  });
});
