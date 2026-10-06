import { describe, expect, it } from 'vitest';
import { EXPE, nextStepAt, type Poi, type Voyage } from '@/lib/expedition';

// ⏱️ Demandé : « ordonne les tuiles d'expédition par délai de la prochaine étape ». Une
// attaque qui arrive dans 5 min et rentre dans 1 h passe devant une expédition qui rentre
// dans 30 min, jusqu'à sa résolution ; ensuite, c'est son retour qui compte.
const MIN = 60_000;
const poi = { id: 'c', type: 'camp', x: EXPE.town.x + 60, y: EXPE.town.y, level: 10 } as Poi;
const attack: Voyage = { poi, sentAt: 0, midAt: 5 * MIN, returnAt: 60 * MIN };
const expe: Voyage = { poi, sentAt: -40 * MIN, midAt: -10 * MIN, returnAt: 30 * MIN };
const order = (now: number) =>
  [
    { k: 'attaque', at: nextStepAt(attack, now) },
    { k: 'expédition', at: nextStepAt(expe, now) },
  ]
    .sort((x, y) => x.at - y.at)
    .map((t) => t.k);

describe('nextStepAt — l’heure de la prochaine étape d’un voyage', () => {
  it('à l’aller : la résolution sur place, pas le retour', () => {
    expect(nextStepAt(attack, 0)).toBe(5 * MIN);
    expect(order(0)).toEqual(['attaque', 'expédition']);
  });
  it('une fois résolue : son retour', () => {
    expect(nextStepAt(attack, 5 * MIN)).toBe(60 * MIN);
    expect(order(5 * MIN)).toEqual(['expédition', 'attaque']);
  });
  it('un retour plus proche que celui de l’autre repasse devant', () => {
    const quick: Voyage = { ...attack, returnAt: 20 * MIN };
    expect(nextStepAt(quick, 5 * MIN)).toBe(20 * MIN);
    expect(nextStepAt(quick, 5 * MIN)).toBeLessThan(nextStepAt(expe, 5 * MIN));
  });
  it('pas encore parti : son départ', () => {
    expect(nextStepAt({ ...attack, sentAt: 2 * MIN }, 0)).toBe(2 * MIN);
  });
  it('un demi-tour forcé à venir ne se voit pas (`shownVoyage`)', () => {
    const forced: Voyage = { poi, sentAt: 0, midAt: 30 * MIN, returnAt: 60 * MIN, turnBack: 1 / 3 };
    expect(nextStepAt(forced, 10 * MIN)).toBe(90 * MIN);
  });
});
