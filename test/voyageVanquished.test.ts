import { describe, expect, it } from 'vitest';
import {
  placeTaken,
  voyageFailure,
  voyageVanquished,
  type PartyResult,
} from '@/lib/expedition';

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

describe('placeTaken — une embuscade perdue au RETOUR ne rend pas le lieu', () => {
  const pr = (x: Record<string, unknown>) => x as unknown as PartyResult;
  it('gardes abattus puis cargaison écornée au retour : le lieu est pris, il quitte la carte', () => {
    const o = { win: false, party: pr({ roadLost: true }) };
    expect(placeTaken(o)).toBe(true);
    expect(voyageVanquished({ midAt: 1000, outcome: o }, 2000)).toBe(true);
    expect(voyageFailure({ midAt: 1000, outcome: o }, 2000)).toBeNull();
  });
  it('un demi-tour à l’aller n’a jamais atteint le lieu', () => {
    const o = { win: false, turnBack: 0.5, party: pr({ roadLost: true, turnedBack: true }) };
    expect(placeTaken(o)).toBe(false);
    expect(placeTaken({ ...o, turnBack: undefined })).toBe(false);
    expect(voyageFailure({ midAt: 1000, outcome: o }, 2000)).toBe('turned');
  });
  it('repoussés par les gardes : rien n’est pris, le lieu reste à réattaquer', () => {
    const o = { win: false, party: pr({}) };
    expect(placeTaken(o)).toBe(false);
    expect(voyageVanquished({ midAt: 1000, outcome: o }, 2000)).toBe(false);
    expect(voyageFailure({ midAt: 1000, outcome: o }, 2000)).toBe('lost');
  });
});
