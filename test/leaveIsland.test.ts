import { describe, expect, it } from 'vitest';
import {
  applyMilitiaPlan,
  crossingBlocker,
  championsTravelling,
  landCrossing,
  leavingMilitiaPoints,
  startCrossing,
} from '@/lib/crossing';
import { archipelOn } from '@/lib/archipelago';
import { createMap, type ExpeditionMap, type Poi } from '@/lib/expedition';
import { FORTRESS_ID } from '@/lib/islandConquest';
import { militiaIn } from '@/lib/militia';

/**
 * ⛵ QUITTER UNE ÎLE VERS L'AVANT (2026-10-08, demandé par l'utilisateur) : le héros n'a pas
 * besoin d'être à la forteresse — tout le monde part, il embarque d'où il est — et on choisit
 * où la milice reste sur les lieux fixes de l'île quittée.
 */
const H = 3600_000;
const T0 = Date.UTC(2026, 9, 8, 10, 0, 0);

const point = (id: string, garrison: string[], extra: Record<string, unknown> = {}): Poi =>
  ({
    id,
    type: 'control',
    level: 10,
    x: 50,
    y: 50,
    distNorm: 0.3,
    spawnedAt: T0,
    expiresAt: 9e15,
    control: {
      kind: 'mine',
      owner: 'player',
      faction: 'bandits',
      size: 1,
      garrison,
      retakes: 0,
      since: T0,
      collectedAt: T0,
      ...extra,
    },
  }) as Poi;

function island1(pois: Poi[] = []): ExpeditionMap {
  const m = createMap(42, T0, 18, 3, undefined, archipelOn(1));
  return { ...m, archipel: { ...m.archipel!, destroyed: [FORTRESS_ID] }, pois };
}
const count = (m: ExpeditionMap, id: string) =>
  militiaIn(m.pois.find((p) => p.id === id)!.control!.garrison).length;

describe('⛵ quitter l’île : personne en trajet, mais pas besoin d’être à la forteresse', () => {
  const m = island1();
  const ok = { heroBusy: false, championsAway: 0 };
  it('héros posté n’importe où, aucun champion en route : on part', () => {
    expect(crossingBlocker(m, 2, ok)).toBeNull();
  });
  it('un héros en trajet (combat, marche, retour) retient le départ', () => {
    expect(crossingBlocker(m, 2, { ...ok, heroBusy: true })).toBe('heroBusy');
  });
  it('un champion en route retient le départ vers l’avant', () => {
    expect(crossingBlocker(m, 2, { ...ok, championsAway: 1 })).toBe('troopsAway');
  });
  it('un retour vers une île visitée attend les troupes, il n’est pas refusé', () => {
    const on2 = { ...m, archipel: { ...archipelOn(2) }, islands: { '1': m } } as ExpeditionMap;
    expect(crossingBlocker(on2, 1, { ...ok, championsAway: 2 })).toBeNull();
  });
  it('en route = busyUntil dans le futur ; posté en garnison ou sur une autre île, non', () => {
    const a = (id: string, x: Record<string, unknown>) =>
      ({ id, name: id, seed: 1, path: ['guerrier'], level: 5, xp: 0, ...x }) as never;
    const advs = [
      a('route', { busyUntil: T0 + H }),
      a('poste', { posted: 'ctl_a', busyUntil: 0 }),
      a('rentre', { busyUntil: T0 - 1 }),
      a('ailleurs', { elsewhere: 3, busyUntil: T0 + H }),
    ];
    expect(championsTravelling(advs, T0)).toBe(1);
  });
});

describe('🛡️ on choisit où reste la milice', () => {
  it('les places des champions qui partent comptent', () => {
    const map = island1([point('ctl_mine', ['champ1', 'champ2', 'mil:1'])]);
    const [p] = leavingMilitiaPoints(map, T0, 18);
    expect(p).toMatchObject({ id: 'ctl_mine', militia: 1, max: 5 });
  });
  it('retire d’abord, puis pose : la réserve libérée sert ailleurs', () => {
    const im: ExpeditionMap = {
      ...island1([point('ctl_a', ['mil:1', 'mil:2', 'mil:3']), point('ctl_b', [])]),
      militia: { home: 0, producedAt: T0, seq: 3 },
    };
    const out = applyMilitiaPlan(im, { ctl_a: 0, ctl_b: 3 }, T0, 18);
    expect(count(out, 'ctl_a')).toBe(0);
    expect(count(out, 'ctl_b')).toBe(3);
    expect(out.militia!.home).toBe(0);
  });
  it('pose au mieux quand la réserve est plus maigre que prévu', () => {
    const im: ExpeditionMap = {
      ...island1([point('ctl_a', [])]),
      militia: { home: 2, producedAt: T0, seq: 0 },
    };
    const out = applyMilitiaPlan(im, { ctl_a: 4 }, T0, 18);
    expect(count(out, 'ctl_a')).toBe(2);
  });
  it('appliqué au débarquement sur l’île quittée', () => {
    const map = island1([point('ctl_a', ['champ1']), point('ctl_b', ['mil:1'])]);
    const booked = startCrossing(map, 2, [], T0, 0, { ctl_a: 2, ctl_b: 0 });
    const l = landCrossing(booked, booked.crossing!.arriveAt, 18, {
      home: 3,
      producedAt: T0,
      seq: 3,
    });
    const left = l.map.islands!['1']!;
    expect(count(left, 'ctl_a')).toBe(2);
    expect(count(left, 'ctl_b')).toBe(0);
    expect(left.militia!.home).toBe(2);
  });
  it('un retour vers une île visitée n’emporte aucun plan', () => {
    const on2 = { ...island1(), archipel: archipelOn(2) } as ExpeditionMap;
    expect(startCrossing(on2, 1, [], T0, 0, { x: 1 }).crossing!.militiaPlan).toBeUndefined();
  });
});
