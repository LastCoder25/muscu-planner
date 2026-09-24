import { describe, it, expect } from 'vitest';
import { DUST } from '@/lib/gachaReveal';
import { stepDust, grainAlpha, MAX_GRAINS, type Grain } from '@/lib/sigilDust';
import { mulberry32 } from '@/lib/combat';

describe('✨ LA POUSSIÈRE — plus c’est rare, plus c’est spectaculaire', () => {
  it('l’or l’emporte sur le violet sur TOUS les réglages', () => {
    const a = DUST.A;
    const s = DUST.S;
    expect(s.rate).toBeGreaterThan(a.rate * 2);
    expect(s.life[0]).toBeGreaterThan(a.life[0]);
    expect(s.life[1]).toBeGreaterThan(a.life[1]);
    expect(s.size[0]).toBeGreaterThan(a.size[0]);
    expect(s.size[1]).toBeGreaterThan(a.size[1]);
    expect(s.stars).toBeGreaterThan(a.stars);
    expect(s.twinkle).toBeGreaterThan(a.twinkle);
    expect(s.flares).toBeGreaterThan(a.flares);
  });

  it('une boule sème à son débit, reliquat compris : 1 s à 60 images = `rate` grains', () => {
    for (const grade of ['A', 'S'] as const) {
      const acc: number[] = [];
      let n = 0;
      const rng = mulberry32(7);
      for (let f = 0; f < 60; f++) {
        const before = 0;
        const out = stepDust([], [{ x: 0, y: 0, grade }], acc, 1 / 60, 1, rng);
        n += out.length - before;
      }
      expect(Math.abs(n - DUST[grade].rate)).toBeLessThanOrEqual(1);
    }
  });

  it('rien ne sème sans source, et les grains s’éteignent au bout de leur vie', () => {
    const rng = mulberry32(3);
    let grains: Grain[] = stepDust([], [{ x: 0, y: 0, grade: 'S' }], [], 1, 1, rng);
    expect(grains.length).toBeGreaterThan(0);
    for (let f = 0; f < 200; f++) grains = stepDust(grains, [], [], 1 / 60, 1, rng);
    expect(grains).toHaveLength(0);
  });

  it('le nombre de grains vivants reste plafonné', () => {
    const rng = mulberry32(5);
    const sources = Array.from({ length: 40 }, () => ({ x: 0, y: 0, grade: 'S' as const }));
    let grains: Grain[] = [];
    const acc: number[] = [];
    for (let f = 0; f < 120; f++) grains = stepDust(grains, sources, acc, 1 / 60, 1, rng);
    expect(grains.length).toBeLessThanOrEqual(MAX_GRAINS);
  });

  it('un grain naît discret, scintille, puis s’éteint', () => {
    const g: Grain = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      age: 0,
      life: 1,
      size: 4,
      star: false,
      grade: 'S',
      phase: 0,
    };
    expect(grainAlpha(g, 0)).toBe(0);
    expect(grainAlpha({ ...g, age: 0.5 }, 0)).toBeGreaterThan(0);
    expect(grainAlpha({ ...g, age: 1 }, 0)).toBe(0);
  });
});
