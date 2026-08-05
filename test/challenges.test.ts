import { describe, it, expect } from 'vitest';
import {
  computeDailyTargets,
  challengeXpPoints,
  challengeStats,
  suggestConfig,
  addContribution,
  challengeLiveBalance,
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

describe('addContribution (report cardio → défi)', () => {
  const distanceCh = () =>
    challenge({
      unit: 'distance',
      duration_days: 5,
      daily_targets: [5, 5, 5, 5, 5],
      config: cfg({ start: 5 }),
    });

  it('crée le jour et cumule la distance sur le bon index', () => {
    const p = addContribution(distanceCh(), '2026-01-07', 3); // jour 2
    expect(p).not.toBeNull();
    const e = p!.find((x) => x.day === 2)!;
    expect(e.done).toBe(3);
    expect(e.completed).toBe(false);
  });

  it("cumule sur un jour déjà entamé et valide dès l'objectif atteint", () => {
    const ch = distanceCh();
    ch.progress = [
      { day: 2, date: '2026-01-07', target: 5, done: 3, elapsed_sec: 0, completed: false },
    ];
    const p = addContribution(ch, '2026-01-07', 3);
    const e = p!.find((x) => x.day === 2)!;
    expect(e.done).toBe(6);
    expect(e.completed).toBe(true);
  });

  it('renvoie null hors plage ou pour une contribution nulle', () => {
    expect(addContribution(distanceCh(), '2026-01-04', 3)).toBeNull(); // avant le début
    expect(addContribution(distanceCh(), '2026-01-11', 3)).toBeNull(); // après la fin
    expect(addContribution(distanceCh(), '2026-01-06', 0)).toBeNull();
  });

  it('ne mute pas la progression d’origine', () => {
    const ch = distanceCh();
    addContribution(ch, '2026-01-05', 4);
    expect(ch.progress).toEqual([]);
  });
});

describe('challengeLiveBalance (avance/retard en direct)', () => {
  const day = (d: number, done: number, target = 10): DayProgressLite => ({
    day: d,
    date: `2026-01-0${5 + d}`,
    target,
    done,
    elapsed_sec: 0,
    completed: done >= target,
  });
  const fiveDay = (progress: DayProgressLite[]) =>
    challenge({ duration_days: 5, daily_targets: [10, 10, 10, 10, 10], progress });

  it('jours passés à l’objectif + surplus du jour → avance', () => {
    const ch = fiveDay([day(0, 10), day(1, 10), day(2, 15)]);
    expect(challengeLiveBalance(ch, '2026-01-07')).toBe(5); // +5 aujourd’hui
  });

  it('le jour en cours non fini ne crée pas de retard', () => {
    const ch = fiveDay([day(0, 10), day(1, 10), day(2, 4)]); // 4/10 en cours
    expect(challengeLiveBalance(ch, '2026-01-07')).toBe(0);
  });

  it('un jour CLÔTURÉ en déficit compte tout de suite', () => {
    const closed = {
      day: 2,
      date: '2026-01-07',
      target: 10,
      done: 4,
      elapsed_sec: 0,
      completed: false,
      closed: true,
    };
    const ch = fiveDay([day(0, 10), day(1, 10), closed]); // clôturé à 4/10 → −6
    expect(challengeLiveBalance(ch, '2026-01-07')).toBe(-6);
  });

  it('un jour passé manqué compte en retard', () => {
    const ch = fiveDay([day(0, 7), day(1, 10)]); // −3 la veille
    expect(challengeLiveBalance(ch, '2026-01-07')).toBe(-3);
  });

  it('cumulé : renvoie le solde global (réalisé − attendu au prorata)', () => {
    const ch = challenge({
      format: 'cumulative',
      duration_days: 5,
      daily_targets: [0, 0, 0, 0, 0],
      config: cfg({ total: 100 }),
      progress: [day(0, 30, 0), day(1, 20, 0)], // 50 réalisés ; attendu j2 = 40
    });
    expect(challengeLiveBalance(ch, '2026-01-07')).toBe(10);
  });
});

type DayProgressLite = {
  day: number;
  date: string;
  target: number;
  done: number;
  elapsed_sec: number;
  completed: boolean;
};

describe('challengeXpPoints', () => {
  it('total NON atteint : reps×0,2 seulement, pas de prime', () => {
    const c = challenge({
      progress: [
        { day: 0, date: '2026-01-05', target: 10, done: 10, elapsed_sec: 0, completed: true },
        { day: 1, date: '2026-01-06', target: 10, done: 7, elapsed_sec: 0, completed: false },
      ],
    });
    // total prévu 30, réalisé 17 < 30 → pas de prime. reps 17×0,2 = 3,4 → 3
    expect(challengeXpPoints([c])).toBe(3);
  });

  it('total ATTEINT : reps×0,2 + prime de complétion', () => {
    const c = challenge({
      progress: [
        { day: 0, date: '2026-01-05', target: 10, done: 10, elapsed_sec: 0, completed: true },
        { day: 1, date: '2026-01-06', target: 10, done: 10, elapsed_sec: 0, completed: true },
        { day: 2, date: '2026-01-07', target: 10, done: 10, elapsed_sec: 0, completed: true },
      ],
    });
    // reps 30×0,2 = 6 ; prime 0,25×30×(1+3/30=1,1) = 8,25 → total round(14,25) = 14
    expect(challengeXpPoints([c])).toBe(14);
  });

  it('un défi en temps ne compte pas les reps', () => {
    const c = challenge({
      unit: 'time',
      progress: [
        { day: 0, date: '2026-01-05', target: 10, done: 5, elapsed_sec: 5, completed: false },
      ],
    });
    // unit time → reps 0 ; total non atteint → 0
    expect(challengeXpPoints([c])).toBe(0);
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
