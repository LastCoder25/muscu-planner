// 🏰 La garnison de la base en lignes de 5 sous la ville.
import { describe, expect, it } from 'vitest';
import { TOWN_ROW_SIZE, TOWN_ROWS_MAX, townDots } from '@/lib/townDots';

describe('townDots — lignes de 5', () => {
  it('le héros en tête, puis un point par champion présent', () => {
    expect(townDots(true, 3)).toEqual({ rows: ['hccc'], more: 0 });
    expect(townDots(false, 2)).toEqual({ rows: ['cc'], more: 0 });
  });
  it('les miliciens en réserve ont leurs propres lignes, sous les champions', () => {
    expect(townDots(true, 1, 2)).toEqual({ rows: ['hc', 'mm'], more: 0 });
    expect(townDots(false, 0, 3)).toEqual({ rows: ['mmm'], more: 0 });
    expect(townDots(true, 6, 3)).toEqual({ rows: ['hcccc', 'cc', 'mmm'], more: 0 });
  });
  it('jamais plus de 5 points par ligne', () => {
    expect(townDots(true, 13, 11).rows.every((r) => r.length <= TOWN_ROW_SIZE)).toBe(true);
  });
  it('personne : aucune ligne', () => {
    expect(townDots(false, 0)).toEqual({ rows: [], more: 0 });
  });
  it('au-delà des lignes permises, le reste est compté à part, le héros jamais coupé', () => {
    const r = townDots(true, 30);
    expect(r.rows.length).toBe(TOWN_ROWS_MAX);
    expect(r.rows[0]![0]).toBe('h');
    expect(r.more).toBe(31 - TOWN_ROWS_MAX * TOWN_ROW_SIZE);
    expect(townDots(false, 12, 9, 3)).toEqual({ rows: ['ccccc', 'ccccc', 'cc'], more: 9 });
  });
  it('🤕 les blessés en boules rouges, sur leurs lignes, entre les présents et la milice', () => {
    expect(townDots(false, 2, 1, undefined, { hero: true, champions: 2 })).toEqual({
      rows: ['cc', 'www', 'm'],
      more: 0,
    });
    expect(townDots(true, 0, 0, undefined, { champions: 6 })).toEqual({
      rows: ['h', 'wwwww', 'w'],
      more: 0,
    });
    // Comptés dans le reste quand les lignes manquent.
    expect(townDots(false, 10, 0, 2, { champions: 3 }).more).toBe(3);
  });
});
