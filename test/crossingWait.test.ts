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
 * attend leur retour. ⛵ Plus d'heure pile (v1.46.0) : sans troupes dehors, on part tout de suite.
 */
const H = 3600_000;
const T0 = Date.UTC(2026, 9, 3, 19, 3);
const adv = (id: string): Adventurer =>
  ({ id, name: id, seed: 1, path: ['guerrier'], level: 5, xp: 0 }) as Adventurer;
const island1 = (): ExpeditionMap => {
  const m = createMap(42, T0, 18, 3, undefined, archipelOn(1));
  return { ...m, archipel: { ...m.archipel!, destroyed: [FORTRESS_ID] } };
};

describe('⏳ la traversée attend le retour des troupes, sinon part tout de suite', () => {
  it('le héros libre peut réserver, même avec des troupes en route', () => {
    expect(crossingBlocker(island1(), 2, { heroBusy: false, heroWalking: false })).toBeNull();
  });
  it('sans troupes dehors : départ immédiat, pas à l’heure pile', () => {
    expect(crossingDeparture(T0, 0)).toBe(T0);
  });
  it('troupes de retour à 20 h 11 : départ à 20 h 11', () => {
    const back = Date.UTC(2026, 9, 3, 20, 11);
    expect(crossingDeparture(T0, back)).toBe(back);
    const m = startCrossing(island1(), 2, ['a'], T0, back);
    expect(m.crossing!.departAt).toBe(back);
    expect(m.crossing!.arriveAt).toBe(back + CROSSING.travelMs);
  });
  it('des troupes encore dehors à l’heure du départ le repoussent, embarqués compris', () => {
    const back0 = T0 + H;
    const m = startCrossing(island1(), 2, ['a'], T0, back0);
    const back = back0 + 30 * 60_000;
    const r = postponeCrossing(m, [adv('a'), adv('b')], back, T0 + 10 * 60_000)!;
    expect(r.map.crossing!.departAt).toBe(back);
    expect(r.advs.find((x) => x.id === 'a')!.busyUntil).toBe(r.map.crossing!.arriveAt);
    expect(r.advs.find((x) => x.id === 'b')!.busyUntil).toBeUndefined();
  });
  it('des troupes rentrées plus tôt AVANCENT le départ, jusqu’à maintenant', () => {
    // Une traversée réservée sur l’ancienne heure pile, plus personne dehors : elle part.
    const m = startCrossing(island1(), 2, ['a'], T0, T0 + H);
    const now = T0 + 5 * 60_000;
    const r = postponeCrossing(m, [adv('a')], 0, now)!;
    expect(r.map.crossing!.departAt).toBe(now);
    expect(r.map.crossing!.arriveAt).toBe(now + CROSSING.travelMs);
  });
  it('un bateau déjà parti ne bouge plus', () => {
    const m = startCrossing(island1(), 2, ['a'], T0);
    expect(postponeCrossing(m, [adv('a')], T0 + 5 * H, T0 + 60_000)).toBeNull();
  });
  it('rien à recaler : null (on n’écrit pas à vide)', () => {
    const back = T0 + H;
    const m = startCrossing(island1(), 2, ['a'], T0, back);
    expect(postponeCrossing(m, [adv('a')], back, T0 + 60_000)).toBeNull();
    expect(postponeCrossing(island1(), [adv('a')], T0 + 5 * H, T0)).toBeNull();
  });
});
