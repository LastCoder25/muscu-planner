import { describe, expect, it } from 'vitest';
import {
  EXPE,
  shownVoyage,
  travelPosition,
  tripLegs,
  voyageProgress,
  type Poi,
  type Voyage,
} from '@/lib/expedition';

// 🔙 Signalé : « sur l'attaque de la mine par les champions, un temps de trajet restant pas
// cohérent avec la distance ». Le voyage stocké d'une embuscade perdue à l'aller s'arrête au
// tiers du chemin : le compteur annonçait donc un aller 3 fois trop court pour la distance.
const MIN = 60_000;
const poi = { id: 'm', type: 'mine', x: EXPE.town.x + 60, y: EXPE.town.y, level: 30 } as Poi;
/** Aller complet de 90 min, demi-tour forcé au tiers → 30 min stockées de chaque côté. */
const forced: Voyage = { poi, sentAt: 0, midAt: 30 * MIN, returnAt: 60 * MIN, turnBack: 1 / 3 };

describe('shownVoyage — un demi-tour forcé ne se voit pas avant d’avoir eu lieu', () => {
  it('avant l’embuscade : le voyage COMPLET, sur la durée que la distance demande', () => {
    const pos = travelPosition(forced, 10 * MIN);
    expect(pos.phase).toBe('outbound');
    expect(pos.remainToObjectiveMs).toBeCloseTo(80 * MIN);
    expect(pos.remainTotalMs).toBeCloseTo(170 * MIN);
    expect(tripLegs(forced, 10 * MIN)!.detail).toBe('Arrivée dans 1 h 20 · retour en 1 h 30');
    expect(voyageProgress(forced, 10 * MIN).mid).toBeCloseTo(0.5);
  });

  it('le marqueur ne saute pas à l’embuscade : il est pile au point de demi-tour', () => {
    const before = travelPosition(forced, 30 * MIN - 1);
    const after = travelPosition(forced, 30 * MIN);
    expect(after.phase).toBe('return');
    expect(before.x).toBeCloseTo(after.x, 3);
    expect(before.y).toBeCloseTo(after.y, 3);
    expect(after.x).toBeCloseTo(EXPE.town.x + 20, 3);
  });

  it('après l’embuscade : le vrai retour, depuis le point de demi-tour', () => {
    expect(travelPosition(forced, 40 * MIN).remainTotalMs).toBe(20 * MIN);
    expect(tripLegs(forced, 40 * MIN)!.back).toBe('20 min');
  });

  it('un voyage sans demi-tour, ou un rappel déjà fait, reste tel quel', () => {
    const plain: Voyage = { poi, sentAt: 0, midAt: 30 * MIN, returnAt: 60 * MIN };
    expect(shownVoyage(plain, 10 * MIN)).toBe(plain);
    // Un rappel pose `midAt = now` : il est déjà passé, jamais gommé.
    const recalled: Voyage = { poi, sentAt: 0, midAt: 10 * MIN, returnAt: 20 * MIN, turnBack: 0.2 };
    expect(shownVoyage(recalled, 10 * MIN)).toBe(recalled);
  });
});
