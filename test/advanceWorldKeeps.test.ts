import { describe, expect, it } from 'vitest';
import { archipelOn } from '@/lib/archipelago';
import { startCrossing } from '@/lib/crossing';
import { advanceWorld, createMap, type ExpeditionMap } from '@/lib/expedition';

/**
 * ⚠️ `advanceWorld` RECONSTRUIT la carte champ par champ, à chaque tick. Un champ qu'elle
 * n'écrit pas disparaît en silence au tick suivant — c'est ainsi qu'une traversée réservée
 * s'est évaporée (signalé par l'utilisateur le 2026-10-03 : les champions embarqués sont
 * redevenus libres sur l'île 1, et personne n'a jamais débarqué sur l'île 2).
 */
describe('advanceWorld garde ce qui ne lui appartient pas', () => {
  const T0 = Date.UTC(2026, 9, 3, 15, 10);
  const base = (): ExpeditionMap => ({ ...createMap(7, T0, 12, 1), archipel: archipelOn(1) });

  it('une traversée réservée survit au tick', () => {
    const m = startCrossing(base(), 2, ['a', 'b'], T0);
    const next = advanceWorld(m, T0 + 60_000, 12, 1);
    expect(next.crossing).toEqual(m.crossing);
  });

  it('les îles rangées, les citadelles mises de côté et le retour du héros survivent', () => {
    const stashed = base();
    const m: ExpeditionMap = {
      ...base(),
      islands: { '2': stashed },
      citadelStash: [stashed.pois[0]],
      heroReturnAt: T0 + 3_600_000,
    };
    const next = advanceWorld(m, T0 + 60_000, 12, 1);
    expect(next.islands).toEqual(m.islands);
    expect(next.citadelStash).toEqual(m.citadelStash);
    expect(next.heroReturnAt).toBe(m.heroReturnAt);
  });

  it('sans ces champs, aucune clé n’est ajoutée (la carte ne diffère pas à chaque tick)', () => {
    const next = advanceWorld(base(), T0 + 60_000, 12, 1);
    for (const k of ['crossing', 'islands', 'citadelStash', 'heroReturnAt', 'militia'])
      expect(k in next).toBe(false);
  });
});
