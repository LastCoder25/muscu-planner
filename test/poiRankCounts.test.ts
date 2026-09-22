import { describe, it, expect } from 'vitest';
import { poiRankCounts } from '@/lib/expedition';
import { characterRank } from '@/lib/characterRank';

describe('poiRankCounts — les options du filtre de difficulté de la carte', () => {
  it('compte les lieux par rang, du plus bas au plus haut', () => {
    const pois = [{ level: 35 }, { level: 3 }, { level: 8 }, { level: 15 }];
    expect(poiRankCounts(pois)).toEqual([
      { rankIndex: 0, count: 2 },
      { rankIndex: 1, count: 1 },
      { rankIndex: 3, count: 1 },
    ]);
  });
  it('lit le rang comme la pastille du lieu (characterRank)', () => {
    for (let lvl = 1; lvl <= 100; lvl += 7)
      expect(poiRankCounts([{ level: lvl }])[0]!.rankIndex).toBe(characterRank(lvl).rankIndex);
  });
  it('ne propose que les rangs présents, et aucun sur une carte vide', () => {
    expect(poiRankCounts([])).toEqual([]);
    const total = poiRankCounts([{ level: 1 }, { level: 50 }, { level: 90 }]);
    expect(total.every((o) => o.count > 0)).toBe(true);
  });
});
