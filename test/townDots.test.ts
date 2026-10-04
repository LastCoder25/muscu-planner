import { describe, expect, it } from 'vitest';
import { townDots, TOWN_DOTS_MAX } from '@/lib/townDots';

describe('townDots', () => {
  it('le héros en tête, puis un point par champion présent', () => {
    expect(townDots(true, 3)).toEqual({ dots: 'hccc', more: 0 });
    expect(townDots(false, 2)).toEqual({ dots: 'cc', more: 0 });
  });
  it('personne : aucun point', () => {
    expect(townDots(false, 0)).toEqual({ dots: '', more: 0 });
  });
  it('au-delà du plafond, le reste est compté à part, le héros jamais coupé', () => {
    const r = townDots(true, 20);
    expect(r.dots.length).toBe(TOWN_DOTS_MAX);
    expect(r.dots[0]).toBe('h');
    expect(r.more).toBe(21 - TOWN_DOTS_MAX);
  });
});
