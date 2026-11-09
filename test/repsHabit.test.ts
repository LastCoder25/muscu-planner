import { describe, it, expect } from 'vitest';
import {
  HABIT_UPLIFT,
  exerciseRepDays,
  habitWeeklyReps,
  proposeRepsTarget,
  roundTarget,
  weeklyRepTotals,
  type RepDay,
} from '@/lib/repsHabit';
import type { ComboChallenge } from '@/lib/combo';
import type { Challenge } from '@/lib/challenges';
import type { LogEntry } from '@/lib/volume';

// Lundi 2026-11-09 : la semaine en cours. Les lundis précédents : 11-02, 10-26, 10-19, 10-12…
const TODAY = '2026-11-09';
const MONDAYS = ['2026-11-02', '2026-10-26', '2026-10-19', '2026-10-12', '2026-10-05'];
const day = (monday: string, reps: number): RepDay => ({ day: monday, reps });

describe('🧮 reps hebdomadaires : l’habitude', () => {
  it('une semaine = lundi → dimanche, la plus récente d’abord', () => {
    const t = weeklyRepTotals(
      [
        { day: '2026-11-02', reps: 10 },
        { day: '2026-11-08', reps: 5 }, // dimanche, même semaine
        { day: '2026-10-27', reps: 7 },
      ],
      TODAY,
    );
    expect(t).toEqual([15, 7]);
  });
  it('la semaine en cours (incomplète) n’entre pas dans l’habitude', () => {
    expect(weeklyRepTotals([day('2026-11-09', 100), day('2026-11-10', 100)], TODAY)).toEqual([]);
  });
  it('les semaines à 0 sont ignorées, pas comptées comme des zéros', () => {
    // Semaines actives : 11-02 (40) et 10-19 (60) ; 10-26 est vide → la médiane vaut 50, pas 40.
    const t = weeklyRepTotals([day(MONDAYS[0]!, 40), day(MONDAYS[2]!, 60)], TODAY);
    expect(t).toEqual([40, 60]);
    expect(habitWeeklyReps(t)).toBe(50);
  });
  it('médiane des 4 dernières semaines ACTIVES (la 5e plus ancienne est ignorée)', () => {
    // 4 plus récentes : 40, 50, 60, 100 → médiane 55 ; la 5e (1000) ne compte pas.
    const days = [40, 50, 60, 100, 1000].map((r, i) => day(MONDAYS[i]!, r));
    expect(habitWeeklyReps(weeklyRepTotals(days, TODAY))).toBe(55);
  });
  it('une médiane (pas une moyenne) : un pic isolé ne tire pas l’habitude', () => {
    const days = [48, 50, 52, 400].map((r, i) => day(MONDAYS[i]!, r));
    expect(habitWeeklyReps(weeklyRepTotals(days, TODAY))).toBe(51);
  });
  it('aucune semaine active : pas d’habitude', () => {
    expect(habitWeeklyReps([])).toBeNull();
  });
});

describe('🎯 l’objectif proposé', () => {
  const base = { today: TODAY, durationDays: 7, fallbackSets: 6, mid: 10 };
  it('habitude +10 %, arrondie proprement (48 → 52,8 → 55)', () => {
    expect(HABIT_UPLIFT).toBe(1.1);
    const p = proposeRepsTarget({ ...base, days: [day(MONDAYS[0]!, 48)] });
    expect(p).toEqual({ target: 55, habit: 48 });
  });
  it('mis au prorata d’un 360 plus court (4 jours : 48 × 1,1 × 4/7 = 30)', () => {
    const p = proposeRepsTarget({ ...base, durationDays: 4, days: [day(MONDAYS[0]!, 48)] });
    expect(p.target).toBe(30);
    expect(p.habit).toBe(48); // l'habitude affichée reste hebdomadaire
  });
  it('sans historique : séries × milieu de fourchette, et pas d’habitude affichée', () => {
    expect(proposeRepsTarget({ ...base, days: [] })).toEqual({ target: 60, habit: null });
    expect(proposeRepsTarget({ ...base, days: [], fallbackSets: 3.4, mid: 11.5 }).target).toBe(40);
  });
  it('seule la semaine en cours : pas d’historique exploitable → repli', () => {
    expect(proposeRepsTarget({ ...base, days: [day('2026-11-10', 90)] }).habit).toBeNull();
  });
  it('arrondi propre : unité sous 10, 5 jusqu’à 100, 10 au-delà, jamais 0', () => {
    expect(roundTarget(7.4)).toBe(7);
    expect(roundTarget(52.8)).toBe(55);
    expect(roundTarget(97)).toBe(95);
    expect(roundTarget(133)).toBe(130);
    expect(roundTarget(0)).toBe(1);
    expect(roundTarget(0.2)).toBe(1);
  });
});

describe('📚 d’où viennent les reps d’un exo', () => {
  const log = (performedAt: string, id: string, reps: number[], discipline?: string): LogEntry =>
    ({
      performedAt,
      log: {
        ...(discipline ? { discipline } : {}),
        exercises: [
          { id, name: id, performed: reps.map((r, i) => ({ set: i + 1, load_kg: 0, reps: r })) },
        ],
      },
    }) as unknown as LogEntry;
  const combo = {
    legs: [
      {
        exercise_id: 'ex_pullup',
        count_mode: 'reps',
        sets: [
          { date: '2026-11-03', reps: 1, mini: true },
          { date: '2026-11-03', reps: 2, mini: true },
        ],
      },
      { exercise_id: 'ex_plank', count_mode: 'time', sets: [{ date: '2026-11-03', reps: 60 }] },
      {
        exercise_id: 'ex_dips',
        count_mode: 'reps',
        sets: [
          { date: '2026-11-03', reps: 9, origin: { exercise_id: 'ex_pullup', done: { reps: 4 } } },
        ],
      },
    ],
  } as unknown as ComboChallenge;
  const challenge = {
    exercise_id: 'ex_pullup',
    unit: 'reps',
    config: {},
    progress: [{ date: '2026-11-04', done: 12 }],
  } as unknown as Challenge;
  const setsChallenge = {
    exercise_id: 'ex_pullup',
    unit: 'reps',
    config: { count_mode: 'sets' },
    progress: [{ date: '2026-11-05', done: 2, sets: [{ reps: 6 }, { reps: 5 }] }],
  } as unknown as Challenge;

  it('séances, 360 (reps exactes, série basculée à son exo d’origine) et challenges muscu', () => {
    const days = exerciseRepDays('ex_pullup', {
      logs: [log('2026-11-02', 'ex_pullup', [8, 8]), log('2026-11-02', 'ex_dips', [10])],
      combos: [combo],
      challenges: [challenge, setsChallenge],
    });
    const total = days.reduce((a, d) => a + d.reps, 0);
    // 16 (séance) + 3 (mini-séries) + 4 (série basculée, vraies reps d'origine) + 12 + 11.
    expect(total).toBe(46);
  });
  it('ni gainage (secondes), ni autre exo, ni séance de cardio', () => {
    expect(exerciseRepDays('ex_plank', { logs: [], combos: [combo], challenges: [] })).toEqual([]);
    expect(
      exerciseRepDays('ex_pullup', {
        logs: [log('2026-11-02', 'ex_pullup', [8], 'cardio')],
        combos: [],
        challenges: [],
      }),
    ).toEqual([]);
  });
});
