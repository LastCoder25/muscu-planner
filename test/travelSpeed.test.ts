import { describe, expect, it } from 'vitest';
import { EXPE, mineVeinGold, rewardTripHours, travelOneWayMin } from '@/lib/expedition';

/** 🏃 Les trajets durent 80 % de leur référence (v1.103), et les récompenses restent calées sur
 *  la référence : aller plus vite ne doit faire baisser ni l'or d'une mine, ni rien d'autre. */
describe('🏃 trajets plus rapides', () => {
  const ref = (level: number, d: number) =>
    (EXPE.travelOneWayMinMin + (EXPE.travelOneWayMaxMin - EXPE.travelOneWayMinMin) * d) *
    (1 + level * 0.02);

  it('un trajet dure 80 % de sa référence, à toute distance', () => {
    expect(EXPE.travelSpeed).toBe(0.8);
    for (const L of [0, 12, 40])
      for (const d of [0, 0.5, 1, 2.27])
        expect(travelOneWayMin(L, d)).toBe(Math.round(ref(L, d) * 0.8));
  });

  it('le trajet de récompense reste celui de référence (pas accéléré)', () => {
    for (const L of [1, 12, 40, 90])
      expect(rewardTripHours(L)).toBeCloseTo((2 * Math.round(ref(L, EXPE.rewardDist))) / 60, 6);
  });

  it("l'or d'une mine ne dépend pas du pas des voyages", () => {
    const before = mineVeinGold(30);
    const saved = EXPE.travelSpeed;
    (EXPE as { travelSpeed: number }).travelSpeed = 0.5;
    try {
      expect(mineVeinGold(30)).toBe(before);
    } finally {
      (EXPE as { travelSpeed: number }).travelSpeed = saved;
    }
  });
});
