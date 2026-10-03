import { describe, expect, it } from 'vitest';
import {
  CROSSING,
  crossingBlocker,
  crossingDeparture,
  postponeCrossing,
  startCrossing,
} from '@/lib/crossing';
import { archipelOn } from '@/lib/archipelago';
import type { Adventurer } from '@/lib/adventurers';
import { createMap, type ExpeditionMap } from '@/lib/expedition';
import { FORTRESS_ID } from '@/lib/islandConquest';

/**
 * ⏳ Des troupes en marche vers un lieu fixe ne bloquent plus la réservation (signalé le
 * 2026-10-03 : « le héros est dispo et je ne peux pas envoyer depuis la forteresse ») : le départ
 * attend leur retour.
 */
const H = 3600_000;
const T0 = Date.UTC(2026, 9, 3, 19, 3);
const adv = (id: string): Adventurer =>
  ({ id, name: id, seed: 1, path: ['guerrier'], level: 5, xp: 0 }) as Adventurer;
const island1 = (): ExpeditionMap => {
  const m = createMap(42, T0, 18, 3, undefined, archipelOn(1));
  return { ...m, archipel: { ...m.archipel!, destroyed: [FORTRESS_ID] } };
};

describe('⏳ la traversée attend le retour des troupes', () => {
  it('le héros libre peut réserver, même avec des troupes en route', () => {
    expect(crossingBlocker(island1(), 2, { heroBusy: false })).toBeNull();
  });
  it('sans troupes dehors : l’heure pile suivante', () => {
    expect(crossingDeparture(T0, 0)).toBe(Date.UTC(2026, 9, 3, 20));
  });
  it('troupes de retour à 20 h 11 : départ à 21 h', () => {
    const back = Date.UTC(2026, 9, 3, 20, 11);
    expect(crossingDeparture(T0, back)).toBe(Date.UTC(2026, 9, 3, 21));
    const m = startCrossing(island1(), 2, ['a'], T0, back);
    expect(m.crossing!.departAt).toBe(Date.UTC(2026, 9, 3, 21));
    expect(m.crossing!.arriveAt).toBe(Date.UTC(2026, 9, 3, 21) + CROSSING.travelMs);
  });
  it('des troupes encore dehors à l’heure du départ le repoussent, embarqués compris', () => {
    const m = startCrossing(island1(), 2, ['a'], T0);
    const back = m.crossing!.departAt + 30 * 60_000;
    const r = postponeCrossing(m, [adv('a'), adv('b')], back)!;
    expect(r.map.crossing!.departAt).toBe(m.crossing!.departAt + H);
    expect(r.advs.find((x) => x.id === 'a')!.busyUntil).toBe(r.map.crossing!.arriveAt);
    expect(r.advs.find((x) => x.id === 'b')!.busyUntil).toBeUndefined();
  });
  it('rien à repousser : null (on n’écrit pas à vide)', () => {
    const m = startCrossing(island1(), 2, ['a'], T0);
    expect(postponeCrossing(m, [adv('a')], m.crossing!.departAt)).toBeNull();
    expect(postponeCrossing(island1(), [adv('a')], T0 + 5 * H)).toBeNull();
  });
});
