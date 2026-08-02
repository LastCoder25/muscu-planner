import { describe, it, expect } from 'vitest';
import { computeLevel } from '@/lib/levels';

describe('computeLevel', () => {
  it('démarre au niveau 1 à 0 XP', () => {
    const l = computeLevel(0);
    expect(l.level).toBe(1);
    expect(l.xpIntoLevel).toBe(0);
    expect(l.xpForLevel).toBe(200); // coût niveau 1
    expect(l.progressPct).toBe(0);
  });

  it('passe au niveau 2 pile au coût du niveau 1 (200)', () => {
    expect(computeLevel(199).level).toBe(1);
    expect(computeLevel(200).level).toBe(2);
    expect(computeLevel(200).xpIntoLevel).toBe(0);
  });

  it('coût croissant : niveau 2 → 3 coûte 300', () => {
    // 200 (niv1) + 300 (niv2) = 500 pour atteindre niveau 3
    expect(computeLevel(499).level).toBe(2);
    expect(computeLevel(500).level).toBe(3);
  });

  it('le niveau est monotone croissant avec l’XP', () => {
    let prev = 0;
    for (let xp = 0; xp <= 5000; xp += 137) {
      const lvl = computeLevel(xp).level;
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });

  it('progressPct reste dans [0,100] et l’XP négative est bornée à 0', () => {
    const neg = computeLevel(-50);
    expect(neg.level).toBe(1);
    expect(neg.xp).toBe(0);
    for (const xp of [0, 150, 350, 1234, 9999]) {
      const p = computeLevel(xp).progressPct;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });
});
