import { describe, expect, it } from 'vitest';
import {
  CROSSING,
  islandChampions,
  landAdventurers,
  landCrossing,
  sailingBlocker,
  settleSailings,
  startCrossing,
  startSailing,
} from '@/lib/crossing';
import { archipelOn } from '@/lib/archipelago';
import type { Adventurer } from '@/lib/adventurers';
import { advanceWorld, createMap, type ExpeditionMap } from '@/lib/expedition';
import { boardFromFortress, FORTRESS_ID } from '@/lib/islandConquest';

/**
 * ⛵ OPTION A (décision de l'utilisateur, 2026-10-03) : la première traversée vers une île se
 * fait avec le héros ; ensuite des champions peuvent naviguer SANS lui entre îles visitées.
 */
const H = 3600_000;
const T0 = Date.UTC(2026, 9, 3, 10, 0, 0);
const adv = (id: string, extra: Partial<Adventurer> = {}): Adventurer =>
  ({ id, name: id, seed: 1, path: ['guerrier'], level: 5, xp: 0, ...extra }) as Adventurer;
const isl = (n: number): ExpeditionMap => ({
  ...createMap(42 + n, T0, 18, 3, undefined, archipelOn(n)),
});
/** L'île 1 active, l'île 2 déjà visitée (rangée). */
const twoIslands = (): ExpeditionMap => ({ ...isl(1), islands: { '2': isl(2) } });

describe('⛵ naviguer sans le héros', () => {
  it('jamais vers une île pas encore visitée : la première traversée se fait avec le héros', () => {
    expect(sailingBlocker(isl(1), 1, 2, ['a'], ['a'])).toBe('notVisited');
    expect(sailingBlocker(twoIslands(), 1, 2, ['a'], ['a'])).toBeNull();
  });
  it('refuse une liste vide, la même île, ou un champion qui n’est pas libre au départ', () => {
    const m = twoIslands();
    expect(sailingBlocker(m, 1, 2, [], ['a'])).toBe('empty');
    expect(sailingBlocker(m, 2, 2, ['a'], ['a'])).toBe('same');
    expect(sailingBlocker(m, 1, 2, ['a', 'b'], ['a'])).toBe('notHere');
  });
  it('part tout de suite, arrive 2 h après, sans toucher à la traversée du héros', () => {
    const m = startSailing(twoIslands(), 1, 2, ['a'], T0 + 1);
    expect(m.sailings).toHaveLength(1);
    expect(m.sailings![0]!.departAt).toBe(T0 + 1);
    expect(m.sailings![0]!.arriveAt).toBe(T0 + 1 + CROSSING.travelMs);
    expect(m.crossing).toBeUndefined();
    expect(m.archipel!.island).toBe(1);
  });
});

describe('⚓ arrivée d’une navigation', () => {
  it('rien d’arrivé : null (on n’écrit pas à vide)', () => {
    const m = startSailing(twoIslands(), 1, 2, ['a'], T0);
    expect(settleSailings(m, [adv('a')], T0 + H)).toBeNull();
  });
  it('vers une autre île : le champion y est désormais (elsewhere)', () => {
    const m = startSailing(twoIslands(), 1, 2, ['a'], T0);
    const r = settleSailings(m, [adv('a'), adv('b')], m.sailings![0]!.arriveAt)!;
    expect(r.advs.find((a) => a.id === 'a')!.elsewhere).toBe(2);
    expect(r.advs.find((a) => a.id === 'b')!.elsewhere).toBeUndefined();
    expect('sailings' in r.map).toBe(false);
  });
  it('vers l’île active : le champion revient « ici »', () => {
    const m = startSailing(twoIslands(), 2, 1, ['a'], T0);
    const r = settleSailings(m, [adv('a', { elsewhere: 2 })], m.sailings![0]!.arriveAt)!;
    expect(r.advs[0]!.elsewhere).toBeUndefined();
  });
  it('le héros débarque pendant la navigation : l’arrivée corrige où est le champion', () => {
    // RETOUR (2 → 1) : le héros part, le champion aussi (sans lui) ; le héros arrive d'abord.
    const on2: ExpeditionMap = { ...isl(2), islands: { '1': isl(1) } };
    let m = startSailing(on2, 2, 1, ['a'], T0 + 30 * 60_000);
    m = startCrossing(m, 1, [], T0);
    const land = landCrossing(m, m.crossing!.arriveAt, 18, undefined);
    expect(land.map.sailings).toHaveLength(1); // la navigation suit la carte active
    const advs = landAdventurers([adv('a')], land.crossing!);
    expect(advs[0]!.elsewhere).toBe(2); // provisoire : resté sur l'île quittée
    const r = settleSailings(land.map, advs, m.sailings![0]!.arriveAt)!;
    expect(r.advs[0]!.elsewhere).toBeUndefined(); // il arrive sur l'île 1, désormais active
  });
  it('vers l’île suivante, la navigation en cours n’a plus d’objet : son champion suit le héros', () => {
    let m = startSailing(twoIslands(), 1, 2, ['a'], T0 + 30 * 60_000);
    m = startCrossing(m, 2, [], T0);
    const land = landCrossing(m, m.crossing!.arriveAt, 18, undefined);
    expect(land.map.sailings).toBeUndefined();
    expect(landAdventurers([adv('a')], land.crossing!)[0]!.elsewhere).toBeUndefined();
  });
});

describe('🗺️ la navigation survit au tick', () => {
  it('advanceWorld garde les navigations en cours', () => {
    const m = startSailing(twoIslands(), 1, 2, ['a'], T0);
    expect(advanceWorld(m, T0 + 60_000, 18, 3).sailings).toEqual(m.sailings);
  });
});

describe('🏰 embarquer de la forteresse : seulement ceux choisis', () => {
  const withFort = (): ExpeditionMap => {
    const m = isl(1);
    const fort = {
      id: FORTRESS_ID,
      type: 'control',
      level: 10,
      x: 100,
      y: 60,
      distNorm: 0.5,
      spawnedAt: T0,
      expiresAt: 9e15,
      control: {
        kind: 'fortress',
        owner: 'player',
        garrison: ['a', 'b', 'mil:1'],
        hero: true,
        since: T0,
        collectedAt: T0,
        assault: false,
      },
    } as unknown as ExpeditionMap['pois'][number];
    return { ...m, pois: [...m.pois, fort] };
  };
  it('sans choix : toute la garnison et le héros (comportement d’avant)', () => {
    const r = boardFromFortress(withFort());
    expect(r.ids).toEqual(['a', 'b']);
    const f = r.map.pois.find((p) => p.id === FORTRESS_ID)!.control!;
    expect(f.garrison).toEqual(['mil:1']);
    expect(f.hero).toBeUndefined();
  });
  it('avec choix et sans le héros : les autres gardent la forteresse, le héros aussi', () => {
    const r = boardFromFortress(withFort(), new Set(['a']), false);
    expect(r.ids).toEqual(['a']);
    const f = r.map.pois.find((p) => p.id === FORTRESS_ID)!.control!;
    expect(f.garrison).toEqual(['b', 'mil:1']);
    expect(f.hero).toBe(true);
  });
});

describe('👥 champions libres sur une île', () => {
  it('l’active : sans elsewhere ; une rangée : son numéro ; jamais un posté, occupé ou blessé', () => {
    const advs = [
      adv('a'),
      adv('b', { elsewhere: 2 }),
      adv('c', { posted: 'ctl_mine' }),
      adv('d', { busyUntil: T0 + H }),
      adv('e', { elsewhere: 2, hurtUntil: T0 + H }),
    ];
    expect(islandChampions(advs, 1, 1, T0).map((a) => a.id)).toEqual(['a']);
    expect(islandChampions(advs, 2, 1, T0).map((a) => a.id)).toEqual(['b']);
  });
});
