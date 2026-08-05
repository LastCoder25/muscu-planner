import { describe, it, expect } from 'vitest';
import { talentsEarned, talentEffects, talentChoices, TALENTS } from '@/lib/talents';

describe('talentsEarned', () => {
  it('1 talent tous les 5 niveaux', () => {
    expect(talentsEarned(4)).toBe(0);
    expect(talentsEarned(5)).toBe(1);
    expect(talentsEarned(12)).toBe(2);
    expect(talentsEarned(20)).toBe(4);
  });
});

describe('talentEffects', () => {
  it('cumule les bonus (dégâts stackent)', () => {
    const e = talentEffects(['t_dmg', 't_dmg', 't_gold']);
    expect(e.damagePct).toBeCloseTo(0.2);
    expect(e.goldPct).toBeCloseTo(0.15);
  });
  it('ignore les codes inconnus', () => {
    expect(talentEffects(['nope']).damagePct).toBe(0);
  });
});

describe('talentChoices', () => {
  it('propose 3 talents, déterministe pour un index donné', () => {
    const a = talentChoices(0);
    const b = talentChoices(0);
    expect(a).toHaveLength(3);
    expect(a.map((t) => t.code)).toEqual(b.map((t) => t.code));
  });
  it('les 3 talents proposés sont distincts et existent', () => {
    const codes = talentChoices(2).map((t) => t.code);
    expect(new Set(codes).size).toBe(3);
    for (const code of codes) expect(TALENTS.some((t) => t.code === code)).toBe(true);
  });
});
