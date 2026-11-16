import { describe, it, expect } from 'vitest';
import {
  HOLD_BONUS,
  FRIEND_BOSS,
  holdBonusTier,
  holdBonusMult,
  holdEffectiveSeconds,
  holdRing,
  isHoldBoss,
  fmtBossPv,
  splitHit,
} from '@/lib/friendBoss';

describe('⏱️ bonus de temps du boss de gainage', () => {
  it('valeurs de contrôle (seules les secondes au-delà de 30 sont majorées)', () => {
    // exact : 30 → 30 · 45 → 46,5 · 60 → 64,5 · 90 → 105 · 120 → 151,5 · 180 → 262,5
    expect(holdEffectiveSeconds(30)).toBe(30);
    expect(holdEffectiveSeconds(45)).toBe(47);
    expect(holdEffectiveSeconds(60)).toBe(65);
    expect(holdEffectiveSeconds(90)).toBe(105);
    expect(holdEffectiveSeconds(120)).toBe(152);
    expect(holdEffectiveSeconds(180)).toBe(263);
  });

  it('en dessous de 30 s : aucune majoration', () => {
    expect(holdEffectiveSeconds(1)).toBe(1);
    expect(holdEffectiveSeconds(29)).toBe(29);
    expect(holdBonusTier(29.9)).toBe(0);
    expect(holdBonusMult(29.9)).toBe(1);
  });

  it('paliers : ×1,1 dès 30 s, +0,1 toutes les 15 s, plafond ×2 dès 165 s', () => {
    expect(holdBonusTier(30)).toBe(1);
    expect(holdBonusMult(30)).toBe(1.1);
    expect(holdBonusMult(44.9)).toBe(1.1);
    expect(holdBonusMult(45)).toBe(1.2);
    expect(holdBonusMult(60)).toBe(1.3);
    expect(holdBonusMult(164)).toBe(1.9);
    expect(holdBonusMult(165)).toBe(2);
    expect(holdBonusMult(10_000)).toBe(2);
  });

  it('au-delà de 180 s, chaque seconde vaut exactement 2', () => {
    expect(holdEffectiveSeconds(190) - holdEffectiveSeconds(180)).toBe(20);
    expect(holdEffectiveSeconds(300)).toBe(Math.round(262.5 + 240));
  });

  it('0, négatif, NaN, infini : 0, jamais un nombre étranger', () => {
    for (const v of [0, -5, NaN, Infinity, -Infinity]) {
      expect(holdEffectiveSeconds(v)).toBe(0);
      expect(holdBonusTier(v)).toBe(0);
    }
  });

  it('monotone, jamais en dessous des secondes brutes, entier', () => {
    let prev = 0;
    for (let s = 0; s <= 400; s++) {
      const e = holdEffectiveSeconds(s);
      expect(Number.isInteger(e)).toBe(true);
      expect(e).toBeGreaterThanOrEqual(prev);
      expect(e).toBeGreaterThanOrEqual(s);
      expect(e).toBeLessThanOrEqual(s * HOLD_BONUS.capMult);
      prev = e;
    }
  });

  it('l’anneau : 30 s pour le premier tour, puis des tours de 15 s', () => {
    expect(holdRing(0)).toEqual({ fraction: 0, left: 30 });
    expect(holdRing(20).left).toBe(10);
    expect(holdRing(30)).toEqual({ fraction: 0, left: 15 });
    expect(holdRing(37.5).fraction).toBe(0.5);
    expect(holdRing(50).left).toBe(10);
  });

  it('le chrono n’existe que pour un boss de gainage ET un exo en secondes', () => {
    expect(isHoldBoss('core', 'time')).toBe(true);
    expect(isHoldBoss('core', 'reps')).toBe(false);
    expect(isHoldBoss('core', null)).toBe(false);
    expect(isHoldBoss('push', 'time')).toBe(false);
  });

  it('une tenue très longue reste bornée par le plafond serveur d’une saisie', () => {
    // 2,5 parts de 300 s = 750 : au-delà, le serveur (et splitHit) coupe.
    const perHit = Math.floor(FRIEND_BOSS.shareUnits.core * FRIEND_BOSS.hitMaxShare);
    const eq = holdEffectiveSeconds(900);
    expect(eq).toBeGreaterThan(perHit);
    expect(splitHit('core', eq, 1e9, 0).accepted).toBe(perHit);
  });

  it('les nombres de dégâts ont une espace insécable (« 21 000 » ne se coupe jamais)', () => {
    expect(fmtBossPv(21000)).toBe('21 000');
    expect(fmtBossPv(1234567)).toBe('1 234 567');
    expect(fmtBossPv(999)).toBe('999');
  });
});
