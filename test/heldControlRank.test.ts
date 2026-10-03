// 🎚️ Plus de filtre par RANG sur la carte (v1.35.1) : une île ne porte que deux rangs de lieux.
// Tous les lieux restent affichés quel que soit leur rang ou leur type (filtre de type retiré, v1.40.0).
import { describe, expect, it } from 'vitest';
import { usePoiFilters } from '@/composables/usePoiFilters';
import { mapPoisFor } from '@/lib/poiTypeFilter';
import type { Poi } from '@/lib/expedition';

const mine = {
  id: 'ctl_mine',
  type: 'control',
  level: 8,
  x: 0,
  y: 0,
  distNorm: 0.3,
  spawnedAt: 0,
  expiresAt: 9e15,
  control: { kind: 'mine', owner: 'enemy', garrison: [], retakes: 0, faction: 'bandits', size: 1 },
} as unknown as Poi;
const camp = { id: 'c1', type: 'camp', level: 25, x: 0, y: 0, distNorm: 0.5 } as unknown as Poi;
const low = { id: 'c2', type: 'camp', level: 2, x: 0, y: 0, distNorm: 0.2 } as unknown as Poi;

describe('🎚️ filtres de la carte : ni rang, ni type de lieu', () => {
  it('tous les lieux sont affichés, quels que soient leur rang et leur type', () => {
    const f = usePoiFilters();
    const pois = [mine, camp, low];
    expect(mapPoisFor(f.troopMode.value, pois, pois, new Set()).map((p) => p.id)).toEqual([
      'ctl_mine',
      'c1',
      'c2',
    ]);
    expect(Object.keys(f)).not.toContain('hiddenRanks');
    expect(Object.keys(f)).not.toContain('typeFilter');
    expect(Object.keys(f)).not.toContain('shownPois');
  });
});
