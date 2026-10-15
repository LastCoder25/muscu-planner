import { describe, expect, it } from 'vitest';
import { mondayOffset } from '@/lib/startDate';

describe('mondayOffset — calendrier du lundi au dimanche', () => {
  it('lundi 0, mercredi 2, dimanche 6', () => {
    expect(mondayOffset('2026-10-12')).toBe(0); // lundi
    expect(mondayOffset('2026-10-14')).toBe(2); // mercredi
    expect(mondayOffset('2026-10-18')).toBe(6); // dimanche
  });
  it('une semaine entière donne 0 à 6, chacun une fois', () => {
    const seen = ['12', '13', '14', '15', '16', '17', '18'].map((d) =>
      mondayOffset(`2026-10-${d}`),
    );
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it('date illisible → aucune case vide', () => {
    expect(mondayOffset('pas-une-date')).toBe(0);
  });
});
