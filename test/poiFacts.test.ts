import { describe, it, expect } from 'vitest';
import { winClass } from '@/lib/poiFacts';

describe('🗂️ fiche d’un lieu — couleur de réussite', () => {
  it('vert dès 70 %, orange dès 35 %, rouge en dessous', () => {
    expect(winClass(100)).toBe('wp-good');
    expect(winClass(70)).toBe('wp-good');
    expect(winClass(69)).toBe('wp-mid');
    expect(winClass(35)).toBe('wp-mid');
    expect(winClass(34)).toBe('wp-bad');
    expect(winClass(0)).toBe('wp-bad');
  });
});
