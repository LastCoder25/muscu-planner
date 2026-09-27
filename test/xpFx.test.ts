import { describe, it, expect } from 'vitest';
import { xpRing, xpSegments, XP_KIND_COLOR } from '@/composables/useXpFx';

const lv = (level: number, progressPct: number, xp?: number) => ({ level, progressPct, xp });

describe('xpRing — un anneau depuis deux relevés de niveau', () => {
  it('le gain est la différence d’XP des deux relevés', () => {
    const r = xpRing('muscu', '🏋️', 'Muscu', lv(3, 40, 1000), lv(3, 70, 1142));
    expect(r.gain).toBe(142);
    expect(r.color).toBe(XP_KIND_COLOR.muscu);
  });
  it('un gain donné par l’appelant prime (tuile en minutes)', () => {
    const r = xpRing('cardio', '🏃', 'Course', lv(2, 10, 60), lv(2, 30, 90), 210);
    expect(r.gain).toBe(210);
  });
  it('pas de gain sans XP connue, ni pour un gain nul', () => {
    expect(xpRing('tennis', '🎾', 'Tennis', lv(1, 0), lv(1, 5)).gain).toBeUndefined();
    expect(xpRing('tennis', '🎾', 'Tennis', lv(1, 0, 5), lv(1, 0, 5)).gain).toBeUndefined();
  });
  it('chaque piste a sa couleur, distincte des autres', () => {
    const c = Object.values(XP_KIND_COLOR);
    expect(new Set(c).size).toBe(c.length);
  });
});

describe('xpSegments — l’arc ne recule jamais', () => {
  const ring = (fl: number, fp: number, tl: number, tp: number) =>
    xpRing('global', '🌍', 'Global', lv(fl, fp), lv(tl, tp));
  it('sans montée de niveau : un seul tronçon, avant → après', () => {
    expect(xpSegments(ring(3, 40, 3, 70))).toEqual([{ from: 40, to: 70 }]);
  });
  it('un niveau franchi : jusqu’au bout, puis de zéro à l’après', () => {
    expect(xpSegments(ring(3, 40, 4, 20))).toEqual([
      { from: 40, to: 100 },
      { from: 0, to: 20 },
    ]);
  });
  it('plusieurs niveaux : un tour complet au milieu, pas un par niveau', () => {
    expect(xpSegments(ring(3, 40, 7, 20))).toEqual([
      { from: 40, to: 100 },
      { from: 0, to: 100 },
      { from: 0, to: 20 },
    ]);
  });
  it('chaque tronçon avance', () => {
    for (const s of xpSegments(ring(2, 90, 5, 10))) expect(s.to).toBeGreaterThanOrEqual(s.from);
  });
});
