import { describe, it, expect } from 'vitest';
import {
  streakBaseEnergy,
  dailyLoginEnergy,
  daysBetweenIso,
  advanceStreak,
} from '@/lib/loginStreak';

describe('streakBaseEnergy', () => {
  it('monte de J1=5 à J7=23 puis plafonne', () => {
    expect(streakBaseEnergy(1)).toBe(5);
    expect(streakBaseEnergy(4)).toBe(14);
    expect(streakBaseEnergy(7)).toBe(23);
    expect(streakBaseEnergy(30)).toBe(23); // plafonné au palier J7
  });
});

describe('dailyLoginEnergy (scaling niveau)', () => {
  it('niveau 1 = énergie de base', () => {
    expect(dailyLoginEnergy(7, 1)).toBe(23);
  });
  it('le niveau augmente le gain (+5 %/niveau)', () => {
    expect(dailyLoginEnergy(7, 10)).toBe(Math.round(23 * (1 + 9 * 0.05))); // 33
    expect(dailyLoginEnergy(1, 10)).toBeGreaterThan(dailyLoginEnergy(1, 1));
  });
});

describe('daysBetweenIso', () => {
  it('écart en jours indépendant du fuseau', () => {
    expect(daysBetweenIso('2026-01-05', '2026-01-06')).toBe(1);
    expect(daysBetweenIso('2026-01-05', '2026-01-05')).toBe(0);
    expect(daysBetweenIso('2026-01-31', '2026-02-02')).toBe(2);
  });
});

describe('advanceStreak', () => {
  it('premier claim → streak 1', () => {
    expect(advanceStreak(null, 999)).toEqual({ streak: 1, graceUsed: false });
  });
  it('jours consécutifs → +1', () => {
    expect(advanceStreak({ streak: 3, graceUsed: false }, 1)).toEqual({
      streak: 4,
      graceUsed: false,
    });
  });
  it('un jour manqué avec grâce dispo → continue et consomme la grâce', () => {
    expect(advanceStreak({ streak: 3, graceUsed: false }, 2)).toEqual({
      streak: 4,
      graceUsed: true,
    });
  });
  it('un jour manqué sans grâce → reset', () => {
    expect(advanceStreak({ streak: 4, graceUsed: true }, 2)).toEqual({
      streak: 1,
      graceUsed: false,
    });
  });
  it('deux jours manqués ou plus → reset', () => {
    expect(advanceStreak({ streak: 6, graceUsed: false }, 3)).toEqual({
      streak: 1,
      graceUsed: false,
    });
  });
  it('la grâce se recharge au début de la semaine suivante (J8)', () => {
    // grâce consommée en semaine 1, on enchaîne les jours consécutifs jusqu'à J8
    let s = advanceStreak({ streak: 7, graceUsed: true }, 1); // J8
    expect(s).toEqual({ streak: 8, graceUsed: false }); // rechargée
    // et un jour manqué en semaine 2 est alors toléré
    s = advanceStreak(s, 2);
    expect(s).toEqual({ streak: 9, graceUsed: true });
  });
});
