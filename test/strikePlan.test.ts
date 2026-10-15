import { describe, expect, it } from 'vitest';
import { FRIEND_BOSS, STRIKE_TIERS, strikePlan, strikeReps } from '../src/lib/friendBoss';

const dmg = (reps: number) => reps * FRIEND_BOSS.damagePerUnit;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe('paliers de frappe du boss entre amis', () => {
  it('le palier monte avec le nombre de reps', () => {
    expect(strikePlan(dmg(1)).style).toBe('orb');
    expect(strikePlan(dmg(4)).style).toBe('orb');
    expect(strikePlan(dmg(5)).style).toBe('fire');
    expect(strikePlan(dmg(9)).style).toBe('fire');
    expect(strikePlan(dmg(10)).style).toBe('storm');
    expect(strikePlan(dmg(19)).style).toBe('storm');
    expect(strikePlan(dmg(20)).style).toBe('laser');
    expect(strikePlan(dmg(39)).style).toBe('laser');
    expect(strikePlan(dmg(40)).style).toBe('meteor');
    expect(strikePlan(dmg(150)).style).toBe('meteor');
  });

  it('orbes et boules de feu : un projectile par rep', () => {
    expect(strikePlan(dmg(3)).hits).toHaveLength(3);
    expect(strikePlan(dmg(7)).hits).toHaveLength(7);
  });

  it("au-delà, un nombre FIXE d'impacts : l'animation ne s'allonge pas", () => {
    expect(strikePlan(dmg(10)).hits).toHaveLength(strikePlan(dmg(19)).hits.length);
    expect(strikePlan(dmg(20)).hits).toHaveLength(strikePlan(dmg(39)).hits.length);
    expect(strikePlan(dmg(40)).hits).toHaveLength(1);
    expect(strikePlan(dmg(500)).hits).toHaveLength(1);
    // Durée des impacts bornée quel que soit le volume.
    for (const r of [1, 5, 9, 10, 25, 60, 300]) {
      const p = strikePlan(dmg(r));
      expect(p.hits.length * p.gapMs).toBeLessThanOrEqual(2500);
    }
  });

  it('la somme des impacts vaut toujours la frappe', () => {
    for (const d of [0, 999, 2_500, 7_000, 13_333, 27_001, 123_456]) {
      expect(sum(strikePlan(d).hits)).toBe(d);
    }
  });

  it('un boss de gainage compte en secondes : 4 s valent une rep', () => {
    expect(strikeReps(dmg(60), 'core')).toBe(15);
    expect(strikePlan(dmg(60), 'core').style).toBe('storm');
    expect(strikePlan(dmg(60), 'push').style).toBe('meteor');
    // 20 s de gainage = 5 reps = 5 boules de feu, pas 20.
    expect(strikePlan(dmg(20), 'core').hits).toHaveLength(5);
  });

  it('les paliers sont triés et commencent à 1 rep', () => {
    expect(STRIKE_TIERS[0]!.from).toBe(1);
    for (let i = 1; i < STRIKE_TIERS.length; i++) {
      expect(STRIKE_TIERS[i]!.from).toBeGreaterThan(STRIKE_TIERS[i - 1]!.from);
    }
  });
});
