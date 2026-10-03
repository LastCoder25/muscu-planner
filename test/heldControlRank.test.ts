// 🎚️ Plus de filtre par RANG sur la carte (v1.35.1) : une île ne porte que deux rangs de lieux.
// Tous les lieux restent affichés quel que soit leur rang ; seuls les types les filtrent.
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { usePoiFilters } from '@/composables/usePoiFilters';
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

describe('🎚️ filtres de la carte : aucun filtre de rang', () => {
  it('tous les lieux sont affichés, quel que soit leur rang', () => {
    const f = usePoiFilters(ref([mine, camp, low]));
    expect(f.shownPois.value.map((p) => p.id)).toEqual(['ctl_mine', 'c1', 'c2']);
    expect(Object.keys(f)).not.toContain('hiddenRanks');
  });
});
