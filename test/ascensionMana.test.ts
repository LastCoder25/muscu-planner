import { describe, expect, it } from 'vitest';
import { ascensionMana } from '@/lib/ascension';
import { GACHA } from '@/lib/gacha';
import { CHARACTER_RANKS } from '@/lib/characterRank';

describe('💠 récompense d’ascension', () => {
  it('monte avec le rang visé, dérivée du prix d’un tirage', () => {
    expect(ascensionMana(1)).toBe(Math.round(GACHA.pullCost / 10));
    expect(ascensionMana(9)).toBe(Math.round((GACHA.pullCost * 9) / 10));
    for (let r = 2; r < CHARACTER_RANKS.length; r++)
      expect(ascensionMana(r)).toBeGreaterThan(ascensionMana(r - 1));
  });

  it('une ascension ne paie jamais un tirage entier', () => {
    for (let r = 1; r < CHARACTER_RANKS.length; r++)
      expect(ascensionMana(r)).toBeLessThan(GACHA.pullCost);
  });

  it('toute la carrière d’un champion reste « quelques » tirages (≤ 5)', () => {
    let total = 0;
    for (let r = 1; r < CHARACTER_RANKS.length; r++) total += ascensionMana(r);
    expect(total / GACHA.pullCost).toBeLessThanOrEqual(5);
    expect(total / GACHA.pullCost).toBeGreaterThan(3);
  });

  it('un rang hors échelle est borné, jamais négatif', () => {
    expect(ascensionMana(-3)).toBe(0);
    expect(ascensionMana(99)).toBe(ascensionMana(CHARACTER_RANKS.length - 1));
  });
});
