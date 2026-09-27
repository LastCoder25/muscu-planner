import { describe, it, expect } from 'vitest';
import { FOG_REVEAL, fogRevealPlan, fogRadiusAt, underFog, revealedCount } from '@/lib/fogReveal';
import { revealRadius } from '@/lib/expedition';

const TOWN = { x: 100, y: 100 };

describe('fogRevealPlan', () => {
  it('rien à la première ouverture (aucun rayon vu)', () => {
    expect(fogRevealPlan(null, 60)).toBeNull();
  });
  it('rien quand le rayon ne grandit pas, ou baisse', () => {
    expect(fogRevealPlan(60, 60)).toBeNull();
    expect(fogRevealPlan(60, 50)).toBeNull();
  });
  it('un niveau d’Avant-poste gagné se joue', () => {
    const p = fogRevealPlan(revealRadius(5), revealRadius(6));
    expect(p).not.toBeNull();
    expect(p!.from).toBe(revealRadius(5));
    expect(p!.to).toBe(revealRadius(6));
    expect(p!.ms).toBeGreaterThanOrEqual(FOG_REVEAL.baseMs);
  });
  it('un grand saut dure plus longtemps, sans dépasser le plafond', () => {
    const small = fogRevealPlan(40, 42)!;
    const big = fogRevealPlan(40, 70)!;
    expect(big.ms).toBeGreaterThan(small.ms);
    expect(fogRevealPlan(40, 400)!.ms).toBe(FOG_REVEAL.maxMs);
  });
});

describe('fogRadiusAt', () => {
  const plan = { from: 40, to: 60, ms: 2000 };
  it('part de l’ancien rayon et arrive au nouveau', () => {
    expect(fogRadiusAt(plan, 0)).toBe(40);
    expect(fogRadiusAt(plan, 2000)).toBe(60);
    expect(fogRadiusAt(plan, 9999)).toBe(60);
    expect(fogRadiusAt(plan, -5)).toBe(40);
  });
  it('monte sans jamais reculer, plus vite au début', () => {
    let prev = 40;
    for (let t = 0; t <= 2000; t += 100) {
      const r = fogRadiusAt(plan, t);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    expect(fogRadiusAt(plan, 1000)).toBeGreaterThan(50);
  });
});

describe('lieux sous le brouillard', () => {
  const pois = [
    { x: 130, y: 100 }, // 30
    { x: 100, y: 150 }, // 50
    { x: 155, y: 100 }, // 55
  ];
  it('un lieu reste caché tant que le front ne l’a pas dépassé', () => {
    expect(underFog(pois[1]!, TOWN, 45)).toBe(true);
    expect(underFog(pois[1]!, TOWN, 50)).toBe(false);
  });
  it('compte les lieux au-delà de l’ancien rayon', () => {
    expect(revealedCount(pois, TOWN, 40)).toBe(2);
    expect(revealedCount(pois, TOWN, 60)).toBe(0);
  });
});
