import { describe, expect, it } from 'vitest';
import { effectiveTripFilter } from '@/lib/tripFilter';

describe('effectiveTripFilter', () => {
  it('garde le filtre tant que sa catégorie a quelque chose', () => {
    expect(effectiveTripFilter('trips', 2, 0)).toBe('trips');
    expect(effectiveTripFilter('attacks', 0, 1)).toBe('attacks');
    expect(effectiveTripFilter('all', 0, 0)).toBe('all');
  });
  it('retombe sur « Tout » quand la catégorie choisie se vide', () => {
    expect(effectiveTripFilter('trips', 0, 3)).toBe('all');
    expect(effectiveTripFilter('attacks', 4, 0)).toBe('all');
  });
});
