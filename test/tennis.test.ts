import { describe, it, expect } from 'vitest';
import { hasCourtDiagram, formatDrillTarget } from '@/data/tennis';

describe('hasCourtDiagram', () => {
  it('vrai pour les patterns de trajectoire', () => {
    for (const pattern of ['diagonale', 'croise', 'longue_ligne', 'decroise', 'montee_volee']) {
      expect(hasCourtDiagram({ pattern })).toBe(true);
    }
  });
  it('vrai pour service / volée / fond de court', () => {
    expect(hasCourtDiagram({ category: 'service_retour' })).toBe(true);
    expect(hasCourtDiagram({ shot: 'service' })).toBe(true);
    expect(hasCourtDiagram({ category: 'volee' })).toBe(true);
    expect(hasCourtDiagram({ category: 'fond_de_court' })).toBe(true);
  });
  it('faux pour échauffement / déplacement / retour au calme sans coup', () => {
    expect(hasCourtDiagram({ category: 'echauffement' })).toBe(false);
    expect(hasCourtDiagram({ category: 'deplacement' })).toBe(false);
    expect(hasCourtDiagram({ category: 'retour_au_calme' })).toBe(false);
  });
});

describe('formatDrillTarget', () => {
  it('balles / temps / reps', () => {
    expect(formatDrillTarget('balls', 30, 2)).toBe('30 balles × 2');
    expect(formatDrillTarget('time', 300, 1)).toBe('5 min');
    expect(formatDrillTarget('reps', 12, 3)).toBe('12 reps × 3');
  });
});
