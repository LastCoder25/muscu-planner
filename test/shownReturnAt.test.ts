import { describe, expect, it } from 'vitest';
import { shownReturnAt, type Poi, type Voyage } from '@/lib/expedition';
import { tripOrder } from '@/lib/tripNav';

const MIN = 60_000;
const poi = { id: 'p', type: 'archive', x: 0, y: 0, level: 1 } as Poi;

describe('shownReturnAt — le retour tel qu’affiché, qui range l’ordre « ↩ Retour »', () => {
  // Cas signalé : un demi-tour tiré au départ (turnBack 0,5) — stocké, l'aller vaut 9 min et le
  // retour à 18 min ; affiché, l'aller vaut 18 min et le retour à 36.
  const turned: Voyage = { poi, sentAt: 0, midAt: 9 * MIN, returnAt: 18 * MIN, turnBack: 0.5 };
  const plain: Voyage = { poi, sentAt: 0, midAt: 5 * MIN, returnAt: 30 * MIN };

  it('avant le demi-tour, le retour est celui du voyage complet', () => {
    expect(shownReturnAt(turned, 5 * MIN)).toBe(36 * MIN);
  });
  it('une fois le demi-tour atteint, c’est le retour réel', () => {
    expect(shownReturnAt(turned, 10 * MIN)).toBe(18 * MIN);
  });
  it('sans demi-tour, rien ne change', () => {
    expect(shownReturnAt(plain, 5 * MIN)).toBe(30 * MIN);
  });
  it('une tuile sur le retour, plus proche de la ville, passe devant le demi-tour à venir', () => {
    const now = 5 * MIN;
    const tile = (key: string, back: boolean, homeAt: number) => ({
      key,
      back,
      time: '',
      pct: 0,
      homeAt,
    });
    const order = tripOrder(
      [tile('demi-tour', false, shownReturnAt(turned, now)), tile('retour', true, 20 * MIN)],
      'home',
    );
    expect(order.map((x) => x.key)).toEqual(['retour', 'demi-tour']);
  });
});
