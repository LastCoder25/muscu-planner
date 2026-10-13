// 🏰 La garnison de la base en lignes de 5 sous la ville.
import { describe, expect, it } from 'vitest';
import { baseReturners, TOWN_ROW_SIZE, TOWN_ROWS_MAX, townDots } from '@/lib/townDots';

describe('🧭 partis, ils rentreront à la base', () => {
  it('en orange juste après les présents ; le héros en deux points `g` reliés', () => {
    expect(townDots(false, 1, 0, undefined, {}, { hero: true, champions: 2 })).toEqual({
      rows: ['ggcrr'],
      more: 0,
    });
    expect(townDots(true, 0, 1, undefined, {}, { champions: 4 })).toEqual({
      rows: ['hhrrr', 'r', 'm'],
      more: 0,
    });
  });
  it('le héros présent ne se dessine pas aussi « en route »', () => {
    expect(townDots(true, 0, 0, undefined, {}, { hero: true })).toEqual({ rows: ['hh'], more: 0 });
  });
  it('compte les occupés qui rentrent à la base, pas ceux qui reviennent sur un lieu tenu', () => {
    const now = 1000;
    const advs = [
      { id: 'a', busyUntil: 5000 }, // fouille des ruines, parti de la base
      { id: 'b', busyUntil: 5000 }, // sortie d'un lieu tenu : y revient
      { id: 'c', busyUntil: 5000, posted: 'ctl' }, // renfort en marche vers un poste
      { id: 'd', busyUntil: 5000, elsewhere: 2 }, // resté sur une autre île
      { id: 'e', busyUntil: 500 }, // déjà rentré
      { id: 'f' }, // à la base
    ];
    const pois = [
      { control: { owner: 'player', away: ['b'] } },
      { control: { owner: 'enemy', away: ['a'] } }, // un lieu perdu ne garde aucune place
    ];
    expect(baseReturners(advs, pois, now)).toBe(1);
  });
});

describe('townDots — lignes de 5', () => {
  it('le héros en tête, puis un point par champion présent', () => {
    expect(townDots(true, 3)).toEqual({ rows: ['hhccc'], more: 0 });
    expect(townDots(false, 2)).toEqual({ rows: ['cc'], more: 0 });
  });
  it('les miliciens en réserve ont leurs propres lignes, sous les champions', () => {
    expect(townDots(true, 1, 2)).toEqual({ rows: ['hhc', 'mm'], more: 0 });
    expect(townDots(false, 0, 3)).toEqual({ rows: ['mmm'], more: 0 });
    expect(townDots(true, 6, 3)).toEqual({ rows: ['hhccc', 'ccc', 'mmm'], more: 0 });
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
    expect(r.rows[0]!.slice(0, 2)).toBe('hh');
    expect(r.more).toBe(32 - TOWN_ROWS_MAX * TOWN_ROW_SIZE);
    expect(townDots(false, 12, 9, 3)).toEqual({ rows: ['ccccc', 'ccccc', 'cc'], more: 9 });
  });
  it('🤕 les blessés en boules rouges, sur leurs lignes, entre les présents et la milice', () => {
    expect(townDots(false, 2, 1, undefined, { hero: true, champions: 2 })).toEqual({
      rows: ['cc', 'www', 'm'],
      more: 0,
    });
    expect(townDots(true, 0, 0, undefined, { champions: 6 })).toEqual({
      rows: ['hh', 'wwwww', 'w'],
      more: 0,
    });
    // Comptés dans le reste quand les lignes manquent.
    expect(townDots(false, 10, 0, 2, { champions: 3 }).more).toBe(3);
  });
});
