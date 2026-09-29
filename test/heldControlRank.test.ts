// 🏰 Un lieu fixe TENU est neutre : aucun filtre de rang ne le compte ni ne le cache.
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { usePoiFilters } from '@/composables/usePoiFilters';
import { poiRank } from '@/lib/poiRank';
import type { Poi } from '@/lib/expedition';

const mine = (owner: 'player' | 'enemy'): Poi =>
  ({
    id: 'ctl_mine',
    type: 'control',
    level: 8,
    x: 0,
    y: 0,
    distNorm: 0.3,
    spawnedAt: 0,
    expiresAt: 9e15,
    control: { kind: 'mine', owner, garrison: [], retakes: 0, faction: 'bandits', size: 1 },
  }) as unknown as Poi;
const camp = { id: 'c1', type: 'camp', level: 25, x: 0, y: 0, distNorm: 0.5 } as unknown as Poi;

describe('🏰 lieu tenu et filtres de rang', () => {
  it('tenu : il ne compte dans aucune pastille de rang, et masquer son rang ne le cache pas', () => {
    const pois = ref([mine('player'), camp]);
    const f = usePoiFilters(pois, (p) => poiRank(p).rankIndex);
    const r = poiRank(mine('player')).rankIndex;
    expect(f.rankOptions.value.map((o) => o.rankIndex)).not.toContain(r);
    f.hiddenRanks.value = new Set([r, poiRank(camp).rankIndex]);
    expect(f.shownPois.value.map((p) => p.id)).toEqual(['ctl_mine']);
  });
  it('ennemi : il garde son rang, et le filtre le cache', () => {
    const pois = ref([mine('enemy'), camp]);
    const f = usePoiFilters(pois, (p) => poiRank(p).rankIndex);
    const r = poiRank(mine('enemy')).rankIndex;
    expect(f.rankOptions.value.map((o) => o.rankIndex)).toContain(r);
    f.hiddenRanks.value = new Set([r]);
    expect(f.shownPois.value.map((p) => p.id)).toEqual(['c1']);
  });
});
