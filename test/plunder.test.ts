// 🏴‍☠️ La caravane pillée : rare, une à la fois, gardée par des bandits, beaucoup d'or.
import { describe, expect, it } from 'vitest';
import {
  EXPE,
  PLUNDER_GOLD_MULT,
  advanceWorld,
  createMap,
  harvestGold,
  harvestGuardOf,
  type Poi,
} from '@/lib/expedition';

const H = 3600_000;
const poi = (type: Poi['type'], id = 'p1'): Poi => ({
  id,
  type,
  level: 30,
  x: 100,
  y: 100,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
});

describe('🏴‍☠️ la caravane pillée', () => {
  // 20 cartes × 10 jours, relevées toutes les heures.
  const ids = new Set<string>();
  let present = 0;
  let samples = 0;
  let twoAtOnce = 0;
  for (let seed = 1; seed <= 20; seed++) {
    let m = createMap(seed * 7919, 0, 30, 30);
    for (let h = 1; h <= 240; h++) {
      m = advanceWorld(m, h * H, 30, 30);
      const p = m.pois.filter((x) => x.type === 'plunder');
      samples++;
      if (p.length) present++;
      if (p.length > 1) twoAtOnce++;
      for (const x of p) ids.add(x.id);
    }
  }

  it('est RARE : entre une tous les 5 jours et une par jour, présente moins de 12 % du temps', () => {
    const perDay = ids.size / 200;
    expect(perDay).toBeGreaterThan(0.2);
    expect(perDay).toBeLessThan(1);
    expect(present / samples).toBeLessThan(0.12);
  });
  it('jamais deux à la fois, et elle ne dure que quelques heures', () => {
    expect(twoAtOnce).toBe(0);
    expect(EXPE.lifespanMs.plunder).toBeLessThanOrEqual(8 * H);
  });
  it('gardée par des bandits, plus nombreux que ceux d’une mine', () => {
    for (let k = 0; k < 20; k++) {
      const g = harvestGuardOf(poi('plunder', 'c' + k))!;
      expect(g.faction).toBe('bandits');
      expect(g.size).toBeGreaterThanOrEqual(2);
    }
  });
  // ⚠️ AU MOINS : ses gardes, plus nombreux, montent aussi sa difficulté donc sa récompense.
  it('rend au moins PLUNDER_GOLD_MULT fois l’or d’une mine', () => {
    for (const L of [5, 30, 80]) {
      const mine = harvestGold({ ...poi('mine'), level: L }, L);
      const car = harvestGold({ ...poi('plunder'), level: L }, L);
      expect(car).toBeGreaterThanOrEqual(Math.round(mine * PLUNDER_GOLD_MULT));
      expect(PLUNDER_GOLD_MULT).toBeGreaterThan(1);
    }
  });
});
