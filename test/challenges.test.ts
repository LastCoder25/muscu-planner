import { describe, it, expect } from 'vitest';
import {
  computeDailyTargets,
  challengeXpPoints,
  challengeStats,
  suggestConfig,
  type Challenge,
  type ChallengeConfig,
} from '@/lib/challenges';

const cfg = (over: Partial<ChallengeConfig> = {}): ChallengeConfig => ({ start: 10, ...over });

describe('computeDailyTargets', () => {
  it('fixed : objectif constant', () => {
    const t = computeDailyTargets('fixed', cfg({ start: 20 }), 5, '2026-01-05');
    expect(t).toEqual([20, 20, 20, 20, 20]);
  });

  it('progressive : start + increment×jour', () => {
    const t = computeDailyTargets('progressive', cfg({ start: 10, increment: 5 }), 4, '2026-01-05');
    expect(t).toEqual([10, 15, 20, 25]);
  });

  it('ramp : linéaire de start à peak', () => {
    const t = computeDailyTargets('ramp', cfg({ start: 10, peak: 20 }), 3, '2026-01-05');
    expect(t[0]).toBe(10);
    expect(t[2]).toBe(20);
    expect(t[1]).toBeGreaterThan(10);
    expect(t[1]).toBeLessThan(20);
  });

  it('cumulative : pas d’objectif journalier', () => {
    expect(computeDailyTargets('cumulative', cfg({ total: 1000 }), 4, '2026-01-05')).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('un jour de repos par semaine → exactement un 0 sur 7 jours', () => {
    const t = computeDailyTargets('fixed', cfg({ start: 30, rest_weekdays: [3] }), 7, '2026-01-05');
    expect(t.filter((x) => x === 0)).toHaveLength(1);
    expect(t.filter((x) => x === 30)).toHaveLength(6);
  });

  it('les objectifs sont des entiers ≥ 0', () => {
    const t = computeDailyTargets('pyramid', cfg({ start: 5, peak: 17 }), 7, '2026-01-05');
    for (const v of t) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

function challenge(over: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1',
    exercise_id: 'ex',
    exercise_name: 'Pompes',
    unit: 'reps',
    format: 'fixed',
    duration_days: 3,
    start_date: '2026-01-05',
    config: cfg({ start: 10 }),
    daily_targets: [10, 10, 10],
    progress: [],
    status: 'active',
    ...over,
  };
}

describe('challengeXpPoints', () => {
  it('reps cumulées + 25 par jour validé (défi actif)', () => {
    const c = challenge({
      progress: [
        { day: 0, date: '2026-01-05', target: 10, done: 10, elapsed_sec: 0, completed: true },
        { day: 1, date: '2026-01-06', target: 10, done: 7, elapsed_sec: 0, completed: false },
      ],
    });
    // reps = 17 ; jours validés = 1 → 25 ; actif → pas de prime. total = 42
    expect(challengeXpPoints([c])).toBe(42);
  });

  it('un défi au temps ne compte pas les reps (anti-farm chrono)', () => {
    const c = challenge({
      unit: 'time',
      progress: [
        { day: 0, date: '2026-01-05', target: 60, done: 60, elapsed_sec: 60, completed: true },
      ],
    });
    // reps = 0 (time) ; 1 jour validé → 25
    expect(challengeXpPoints([c])).toBe(25);
  });
});

describe('suggestConfig (distance / cardio)', () => {
  it('vélo : base ~20 km/j (intermédiaire)', () => {
    const c = suggestConfig('distance', 'intermediaire', 'fixed', 30, 'ex_ch_velo');
    expect(c.start).toBe(20);
    expect(c.max).toBe(20);
  });
  it('marche : base plus faible que le vélo', () => {
    const velo = suggestConfig('distance', 'intermediaire', 'fixed', 30, 'ex_ch_velo');
    const marche = suggestConfig('distance', 'intermediaire', 'fixed', 30, 'ex_ch_marche');
    expect(marche.start!).toBeLessThan(velo.start!);
  });
  it('progressif distance : increment ≥ 1', () => {
    const c = suggestConfig('distance', 'debutant', 'progressive', 30, 'ex_ch_course');
    expect(c.increment!).toBeGreaterThanOrEqual(1);
  });
});

describe('challengeStats', () => {
  it('calcule le total réalisé et le pourcentage', () => {
    const c = challenge({
      progress: [
        { day: 0, date: '2026-01-05', target: 10, done: 10, elapsed_sec: 0, completed: true },
        { day: 1, date: '2026-01-06', target: 10, done: 5, elapsed_sec: 0, completed: false },
      ],
    });
    const s = challengeStats(c);
    expect(s.totalDone).toBe(15);
    expect(s.completionPct).toBeGreaterThan(0);
    expect(s.completionPct).toBeLessThanOrEqual(100);
  });
});
