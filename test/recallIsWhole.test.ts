import { describe, expect, it } from 'vitest';
import { recallIsWhole } from '@/lib/controlPoints';

describe('recallIsWhole — ramener la sélection vide-t-il le lieu ?', () => {
  it('le seul milicien présent, 4 champions en route : pas un rappel complet (bug Archives)', () => {
    expect(recallIsWhole({ onPoint: 1, turning: 0 }, { total: 5, away: 0 })).toBe(false);
  });

  it('le seul milicien présent, 4 champions en sortie : pas un rappel complet', () => {
    expect(recallIsWhole({ onPoint: 1, turning: 0 }, { total: 5, away: 4 })).toBe(false);
  });

  it('tout le monde sélectionné, sur place et en route : rappel complet', () => {
    expect(recallIsWhole({ onPoint: 1, turning: 4 }, { total: 5, away: 0 })).toBe(true);
    expect(recallIsWhole({ onPoint: 3, turning: 0 }, { total: 3, away: 0 })).toBe(true);
  });

  it('une partie seulement : rappel partiel', () => {
    expect(recallIsWhole({ onPoint: 2, turning: 0 }, { total: 3, away: 0 })).toBe(false);
  });

  it('seulement des demi-tours : jamais le rappel complet', () => {
    expect(recallIsWhole({ onPoint: 0, turning: 3 }, { total: 3, away: 0 })).toBe(false);
  });
});
