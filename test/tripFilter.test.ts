import { describe, expect, it } from 'vitest';
import { effectiveTripFilter, poiTripCategory } from '@/lib/tripFilter';

const n = (trips: number, planned: number, attacks: number, reinf = 0, raids = 0) => ({
  trips,
  planned,
  attacks,
  reinf,
  raids,
});

describe('effectiveTripFilter', () => {
  it('garde le filtre choisi tant que sa catégorie a quelque chose', () => {
    expect(effectiveTripFilter('trips', n(2, 0, 0))).toBe('trips');
    expect(effectiveTripFilter('attacks', n(0, 0, 1))).toBe('attacks');
    expect(effectiveTripFilter('planned', n(0, 1, 0))).toBe('planned');
    expect(effectiveTripFilter('reinf', n(0, 0, 0, 1))).toBe('reinf');
    expect(effectiveTripFilter('raids', n(0, 0, 0, 0, 2))).toBe('raids');
    expect(effectiveTripFilter('all', n(0, 0, 0))).toBe('all');
  });
  it('retombe sur « Tout » quand la catégorie choisie se vide', () => {
    expect(effectiveTripFilter('trips', n(0, 1, 3))).toBe('all');
    expect(effectiveTripFilter('attacks', n(4, 1, 0))).toBe('all');
    expect(effectiveTripFilter('planned', n(4, 0, 2))).toBe('all');
    expect(effectiveTripFilter('reinf', n(4, 1, 2, 0, 3))).toBe('all');
    expect(effectiveTripFilter('raids', n(4, 1, 2, 3, 0))).toBe('all');
  });
});

describe('poiTripCategory', () => {
  it('ce qu’on combat pour le prendre est une attaque, une récolte une expédition', () => {
    for (const t of ['camp', 'lair', 'den', 'rift', 'warband', 'control'] as const)
      expect(poiTripCategory(t)).toBe('raids');
    for (const t of ['mine', 'well', 'ruins', 'plunder', 'vein', 'arena'] as const)
      expect(poiTripCategory(t)).toBe('trips');
  });
});
