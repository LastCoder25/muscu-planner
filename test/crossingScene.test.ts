import { describe, it, expect } from 'vitest';
import { ISLANDS } from '@/lib/archipelago';
import { crossingProgress, crossingTheme, islandRidge } from '@/lib/crossingScene';
import { ISLAND_STYLES } from '@/lib/islandTerrain';

const H = 3_600_000;
const c = { departAt: 10 * H, arriveAt: 12 * H };

describe('crossingProgress — où en est le bateau', () => {
  it('attend les troupes avant le départ, sans avancer', () => {
    const s = crossingProgress(c, 9 * H);
    expect(s.phase).toBe('waiting');
    expect(s.progress).toBe(0);
    expect(s.departInMs).toBe(H);
    expect(s.leftMs).toBe(3 * H);
  });
  it('avance en mer au prorata du temps', () => {
    const s = crossingProgress(c, 11 * H);
    expect(s.phase).toBe('sailing');
    expect(s.progress).toBeCloseTo(0.5);
    expect(s.leftMs).toBe(H);
    expect(s.departInMs).toBe(0);
  });
  it('accoste une fois l’heure passée, sans temps négatif', () => {
    const s = crossingProgress(c, 13 * H);
    expect(s.phase).toBe('docking');
    expect(s.progress).toBe(1);
    expect(s.leftMs).toBe(0);
  });
  it('l’avancement ne recule jamais', () => {
    let prev = -1;
    for (let t = 9 * H; t <= 13 * H; t += 600_000) {
      const p = crossingProgress(c, t).progress;
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

describe('crossingTheme — une scène par île', () => {
  it('chaque île a son ambiance, toutes différentes', () => {
    const moods = ISLANDS.map((i) => crossingTheme(i.id).mood);
    expect(new Set(moods).size).toBe(ISLANDS.length);
  });
  it('mer et terre viennent de la carte de l’île (pas une 2ᵉ palette)', () => {
    for (const i of ISLANDS) {
      const t = crossingTheme(i.id);
      expect(t.sea0).toBe(ISLAND_STYLES[i.id]!.sea0);
      expect(t.sea1).toBe(ISLAND_STYLES[i.id]!.sea1);
      expect(t.land).toBe(ISLAND_STYLES[i.id]!.land1);
    }
  });
});

describe('islandRidge — la silhouette de profil', () => {
  it('reste au-dessus de l’horizon et dans sa largeur', () => {
    for (const i of ISLANDS) {
      const nums = islandRidge(i.id, 100, 120, 168, 40)
        .match(/-?\d+(\.\d+)?/g)!
        .map(Number);
      const xs = nums.filter((_, k) => k % 2 === 0);
      const ys = nums.filter((_, k) => k % 2 === 1);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(100);
      expect(Math.max(...xs)).toBeLessThanOrEqual(220);
      expect(Math.max(...ys)).toBeLessThanOrEqual(168);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(128);
    }
  });
  it('chaque île a son propre profil', () => {
    const ridges = ISLANDS.map((i) => islandRidge(i.id, 0, 100, 100, 30));
    expect(new Set(ridges).size).toBe(ISLANDS.length);
  });
});
