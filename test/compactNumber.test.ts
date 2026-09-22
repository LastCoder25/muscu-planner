import { describe, it, expect } from 'vitest';
import { compactNumber } from '@/lib/compactNumber';

describe('compactNumber — les puces de ressources tiennent sur une ligne', () => {
  it('le chiffre EXACT sous 10 000', () => {
    expect(compactNumber(0)).toBe('0');
    expect(compactNumber(45)).toBe('45');
    expect(compactNumber(9999)).toBe('9999');
  });
  it('k puis M, une décimale tant qu’elle apporte quelque chose', () => {
    expect(compactNumber(12_345)).toBe('12,3k');
    expect(compactNumber(12_000)).toBe('12k');
    expect(compactNumber(400_000)).toBe('400k');
    expect(compactNumber(4_200_000)).toBe('4,2M');
    expect(compactNumber(4_000_000)).toBe('4M');
    expect(compactNumber(57_300_000)).toBe('57,3M');
    expect(compactNumber(123_456_789)).toBe('123M');
  });
  it('⚠️ on TRONQUE : une réserve ne paraît jamais plus grosse qu’elle n’est', () => {
    expect(compactNumber(999_999)).toBe('999k');
    expect(compactNumber(19_999)).toBe('19,9k');
    expect(compactNumber(4_199_999)).toBe('4,1M');
  });
  it('au plus 5 caractères, signe compris jusqu’au milliard', () => {
    for (const n of [9999, 10_000, 99_999, 100_000, 999_999, 1_000_000, 99_999_999, 999_999_999])
      expect(compactNumber(n).length, String(n)).toBeLessThanOrEqual(5);
  });
  it('les négatifs (déficit d’énergie) gardent leur signe', () => {
    expect(compactNumber(-120)).toBe('−120');
    expect(compactNumber(-25_600)).toBe('−25,6k');
  });
});
