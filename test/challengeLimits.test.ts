import { describe, it, expect } from 'vitest';
import {
  tokenCost,
  isAccessoryMuscle,
  usedTokens,
  remainingTokens,
  canAddChallenge,
  type LaneChallenge,
} from '@/lib/challengeLimits';

describe('tokenCost', () => {
  it('court/moyen/long', () => {
    expect(tokenCost(1)).toBe(1);
    expect(tokenCost(7)).toBe(1);
    expect(tokenCost(8)).toBe(2);
    expect(tokenCost(21)).toBe(2);
    expect(tokenCost(22)).toBe(3);
    expect(tokenCost(30)).toBe(3);
  });
});

describe('isAccessoryMuscle', () => {
  it('petits muscles = accessoire', () => {
    expect(isAccessoryMuscle('mollets')).toBe(true);
    expect(isAccessoryMuscle('abdominaux')).toBe(true);
    expect(isAccessoryMuscle('Biceps')).toBe(true); // insensible à la casse
    expect(isAccessoryMuscle('pectoraux')).toBe(false);
    expect(isAccessoryMuscle('quadriceps')).toBe(false);
    expect(isAccessoryMuscle(null)).toBe(false);
  });
});

const short = (): LaneChallenge => ({ accessory: false, durationDays: 7 }); // 1 jeton
const medium = (): LaneChallenge => ({ accessory: false, durationDays: 14 }); // 2 jetons
const long = (): LaneChallenge => ({ accessory: false, durationDays: 30 }); // 3 jetons
const acc = (): LaneChallenge => ({ accessory: true, durationDays: 30 });

describe('canAddChallenge (budget 4 jetons + 1 accessoire)', () => {
  it('voie vide : tout passe', () => {
    expect(canAddChallenge([], long())).toEqual({ ok: true });
  });
  it('1 mois + 1 court = 4 → OK (pas de lockout)', () => {
    expect(canAddChallenge([long()], short())).toEqual({ ok: true });
  });
  it('1 mois + 1 moyen = 5 → refus (jetons)', () => {
    expect(canAddChallenge([long()], medium())).toEqual({ ok: false, reason: 'tokens' });
  });
  it('pompes + squat (2 courts) → OK, reste de la place', () => {
    expect(usedTokens([short(), short()])).toBe(2);
    expect(remainingTokens([short(), short()])).toBe(2);
    expect(canAddChallenge([short(), short()], medium())).toEqual({ ok: true });
  });
  it('4 courts → plein ; 5e refusé', () => {
    const four = [short(), short(), short(), short()];
    expect(usedTokens(four)).toBe(4);
    expect(canAddChallenge(four, short())).toEqual({ ok: false, reason: 'tokens' });
  });
  it('accessoire gratuit même voie pleine, mais 1 seul', () => {
    const full = [short(), short(), short(), short()];
    expect(canAddChallenge(full, acc())).toEqual({ ok: true }); // gratuit malgré 4/4
    expect(canAddChallenge([acc()], acc())).toEqual({ ok: false, reason: 'accessory' });
  });
});
