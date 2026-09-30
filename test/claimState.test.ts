// 📬 « Récupérer le butin » ne s'affiche qu'une fois le groupe rentré (signalé par l'utilisateur :
// le bouton était là pendant le retour, et un clic ne faisait rien).
import { describe, expect, it } from 'vitest';
import { claimState, isClaimable, type ExpeditionMessage } from '@/lib/expedition';

const msg = (over: Partial<ExpeditionMessage>): ExpeditionMessage =>
  ({ id: 'm', resolvedAt: 1000, claimAt: 5000, claimed: false, ...over }) as ExpeditionMessage;

describe('📬 état d’un rapport', () => {
  it('rapport arrivé, groupe encore sur la route : on attend, pas de bouton', () => {
    expect(claimState(msg({}), 3000)).toBe('wait');
  });
  it('groupe rentré : le butin se prend', () => {
    expect(claimState(msg({}), 5000)).toBe('claim');
  });
  it('déjà encaissé, ou rapport d’avant l’encaissement manuel : rien à prendre', () => {
    expect(claimState(msg({ claimed: true }), 9000)).toBe('done');
    expect(claimState(msg({ claimed: undefined }), 9000)).toBe('done');
  });
  it('⚠️ « à prendre » veut dire exactement ce que l’encaissement accepte', () => {
    for (const now of [0, 4999, 5000, 9000])
      for (const claimed of [false, true, undefined])
        expect(claimState(msg({ claimed }), now) === 'claim').toBe(isClaimable(msg({ claimed }), now));
  });
});
