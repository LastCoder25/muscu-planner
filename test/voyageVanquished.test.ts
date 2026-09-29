import { describe, expect, it } from 'vitest';
import { voyageVanquished } from '@/lib/expedition';

const v = (win: boolean, extra: { turnBack?: number; outTurn?: number } = {}) => ({
  midAt: 1000,
  ...(extra.turnBack !== undefined ? { turnBack: extra.turnBack } : {}),
  outcome: { win, ...(extra.outTurn !== undefined ? { turnBack: extra.outTurn } : {}) },
});

describe('voyageVanquished — un lieu terrassé se grise dès le rapport', () => {
  it('pas avant d’avoir atteint le lieu, même gagné d’avance', () => {
    expect(voyageVanquished(v(true), 999)).toBe(false);
  });
  it('dès l’arrivée (midAt) si le combat est gagné', () => {
    expect(voyageVanquished(v(true), 1000)).toBe(true);
    expect(voyageVanquished(v(true), 5000)).toBe(true);
  });
  it('jamais sur une défaite : l’ennemi tient toujours', () => {
    expect(voyageVanquished(v(false), 5000)).toBe(false);
  });
  it('jamais sur un demi-tour, qu’il soit porté par le voyage ou par l’issue', () => {
    expect(voyageVanquished(v(true, { turnBack: 0.4 }), 5000)).toBe(false);
    expect(voyageVanquished(v(true, { outTurn: 0.4 }), 5000)).toBe(false);
  });
});
