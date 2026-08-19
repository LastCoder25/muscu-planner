import { describe, it, expect } from 'vitest';
import { characterRank, rankStarStr, CHARACTER_RANKS } from '@/lib/characterRank';

describe('characterRank — rang de prestige (niveau → rang + étoile)', () => {
  it('niveau 1 = Bronze ★1 (départ)', () => {
    const r = characterRank(1);
    expect(r.name).toBe('Bronze');
    expect(r.star).toBe(1);
    expect(r.rankIndex).toBe(0);
  });

  it('1 étoile tous les 2 niveaux → niveau 10 = Bronze ★5', () => {
    expect(characterRank(3)).toMatchObject({ name: 'Bronze', star: 2 });
    expect(characterRank(5)).toMatchObject({ name: 'Bronze', star: 3 });
    expect(characterRank(7)).toMatchObject({ name: 'Bronze', star: 4 });
    expect(characterRank(9)).toMatchObject({ name: 'Bronze', star: 5 });
    expect(characterRank(10)).toMatchObject({ name: 'Bronze', star: 5 });
  });

  it('niveau 11 = Argent ★1 (rang suivant tous les 10 niveaux)', () => {
    expect(characterRank(11)).toMatchObject({ name: 'Argent', star: 1 });
    expect(characterRank(21)).toMatchObject({ name: 'Or', star: 1 });
  });

  it('niveau 100 = Tout-puissant ★5, plafonné au-delà', () => {
    expect(characterRank(91)).toMatchObject({ name: 'Tout-puissant', star: 1 });
    expect(characterRank(100)).toMatchObject({ name: 'Tout-puissant', star: 5 });
    expect(characterRank(150)).toMatchObject({ name: 'Tout-puissant', star: 5 });
    expect(characterRank(100).rankIndex).toBe(CHARACTER_RANKS.length - 1);
  });

  it('rangs monotones et bornés (niveau croissant → tier ne recule jamais)', () => {
    let prev = -1;
    for (let l = 1; l <= 110; l++) {
      const t = characterRank(l).tier;
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('rankStarStr : ★ pleines + ☆ vides sur 5', () => {
    expect(rankStarStr(1)).toBe('★☆☆☆☆');
    expect(rankStarStr(5)).toBe('★★★★★');
  });
});
