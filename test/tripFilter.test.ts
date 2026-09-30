import { describe, expect, it } from 'vitest';
import { effectiveTripFilter } from '@/lib/tripFilter';

const n = (trips: number, planned: number, attacks: number) => ({ trips, planned, attacks });

describe('effectiveTripFilter', () => {
  it('garde le filtre choisi tant que sa catégorie a quelque chose', () => {
    expect(effectiveTripFilter('trips', n(2, 0, 0))).toBe('trips');
    expect(effectiveTripFilter('attacks', n(0, 0, 1))).toBe('attacks');
    expect(effectiveTripFilter('planned', n(0, 1, 0))).toBe('planned');
    expect(effectiveTripFilter('all', n(0, 0, 0))).toBe('all');
  });
  it('retombe sur « Tout » quand la catégorie choisie se vide', () => {
    expect(effectiveTripFilter('trips', n(0, 1, 3))).toBe('all');
    expect(effectiveTripFilter('attacks', n(4, 1, 0))).toBe('all');
    expect(effectiveTripFilter('planned', n(4, 0, 2))).toBe('all');
  });
});
