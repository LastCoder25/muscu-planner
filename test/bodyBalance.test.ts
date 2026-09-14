import { describe, it, expect } from 'vitest';
import {
  bodyBalance,
  creditSets,
  SECONDARY_CREDIT,
  type BalanceInput,
  type BalancePeriod,
} from '@/lib/bodyBalance';
import type { LogEntry } from '@/lib/volume';
import type { SessionLog } from '@/lib/types';
import type { ComboChallenge, ComboLeg } from '@/lib/combo';
import type { Challenge } from '@/lib/challenges';

// Mercredi : la semaine en cours va du lundi 14 au dimanche 20 septembre.
const TODAY = '2026-09-16';
const MONDAY = '2026-09-14';

const SECONDARIES: Record<string, string[]> = {
  bench: ['triceps', 'épaules'],
  row: ['biceps'],
  ohp: ['deltoïde antérieur', 'triceps', 'triceps', 'épaules'],
  plank: [],
};

function session(date: string, exos: { id: string; muscle: string; sets: number }[]): LogEntry {
  const log = {
    schema_version: '1.0',
    type: 'session_log',
    id: `${date}-${exos.map((e) => e.id).join()}`,
    exercises: exos.map((e) => ({
      id: e.id,
      name: e.id,
      muscle_primary: e.muscle,
      planned: {},
      performed: Array.from({ length: e.sets }, (_, s) => ({
        set: s + 1,
        load_kg: 0,
        reps: 10,
        difficulty: 2 as const,
      })),
    })),
  } as SessionLog;
  return { performedAt: date, log };
}

function leg(p: Partial<ComboLeg> & { exercise_id: string; muscle_primary: string }): ComboLeg {
  return { slot: 'push', exercise_name: p.exercise_id, rep_weight: 1, target: 10, ...p };
}
function combo(legs: ComboLeg[], status: ComboChallenge['status'] = 'active'): ComboChallenge {
  return { id: 'c1', name: '360', start_date: MONDAY, duration_days: 7, status, legs };
}

function challenge(p: Partial<Challenge> & { exercise_id: string }): Challenge {
  const duration = p.duration_days ?? 7;
  return {
    id: `ch-${p.exercise_id}`,
    exercise_name: p.exercise_id,
    muscle_primary: 'pectoraux',
    unit: 'reps',
    format: 'fixed',
    duration_days: duration,
    start_date: MONDAY,
    config: { start: 30 },
    daily_targets: Array.from({ length: duration }, () => 30),
    progress: [],
    status: 'active',
    ...p,
  };
}

function input(p: Partial<BalanceInput>): BalanceInput {
  return {
    sessions: [],
    combos: [],
    challenges: [],
    targets: { pectoraux: 10, triceps: 6, épaules: 6, biceps: 6, dos: 10, abdominaux: 6 },
    objective: 'hypertrophie', // fourchette 8-12 → une série vaut 10 reps
    secondaries: (id) => SECONDARIES[id],
    today: TODAY,
    ...p,
  };
}
const row = (i: BalanceInput, muscle: string, period: BalancePeriod = 'week') => {
  const r = bodyBalance(i, period).find((x) => x.muscle === muscle);
  if (!r) throw new Error(`muscle absent : ${muscle}`);
  return r;
};

describe('creditSets', () => {
  it('1 série au principal, ½ à chaque secondaire', () => {
    const t: Record<string, number> = {};
    creditSets(t, 'pectoraux', ['triceps', 'épaules'], 4);
    expect(t).toEqual({ pectoraux: 4, triceps: 2, épaules: 2 });
    expect(SECONDARY_CREDIT).toBe(0.5);
  });

  it('rattache les variantes de nom et ne crédite pas deux fois le même muscle', () => {
    const t: Record<string, number> = {};
    // « deltoïde antérieur » = épaules ; triceps en double ; épaules répété via l'alias.
    creditSets(t, 'épaules', SECONDARIES.ohp, 2);
    expect(t).toEqual({ épaules: 2, triceps: 1 });
  });

  it('un exo sans secondaires connus ne crédite que son principal', () => {
    const t: Record<string, number> = {};
    creditSets(t, 'Dos', undefined, 3);
    expect(t).toEqual({ dos: 3 });
  });
});

describe('bodyBalance — réel', () => {
  it('les séances comptent avec leurs secondaires', () => {
    const i = input({
      sessions: [session('2026-09-15', [{ id: 'bench', muscle: 'pectoraux', sets: 4 }])],
    });
    expect(row(i, 'pectoraux').done).toBe(4);
    expect(row(i, 'triceps').done).toBe(2);
    expect(row(i, 'biceps').done).toBe(0);
  });

  it('un challenge en reps est converti en séries au milieu de la fourchette', () => {
    const i = input({
      challenges: [
        challenge({
          exercise_id: 'bench',
          status: 'done',
          progress: [
            { day: 1, date: '2026-09-15', target: 30, done: 40, elapsed_sec: 0, completed: true },
          ],
        }),
      ],
    });
    expect(row(i, 'pectoraux').done).toBe(4); // 40 reps ÷ 10
  });

  it('un challenge en séries compte ses séries telles quelles', () => {
    const i = input({
      challenges: [
        challenge({
          exercise_id: 'bench',
          status: 'done',
          config: { start: 3, count_mode: 'sets' },
          progress: [
            { day: 1, date: '2026-09-15', target: 3, done: 3, elapsed_sec: 0, completed: true },
          ],
        }),
      ],
    });
    expect(row(i, 'pectoraux').done).toBe(3);
  });

  it('un 360 en mode reps convertit ses reps en séries', () => {
    const c = combo(
      [
        leg({
          exercise_id: 'bench',
          muscle_primary: 'pectoraux',
          count_mode: 'reps',
          target: 100,
          sets: [
            { date: '2026-09-15', reps: 25 },
            { date: '2026-09-16', reps: 25 },
          ],
        }),
      ],
      'done',
    );
    expect(row(input({ combos: [c] }), 'pectoraux').done).toBe(5);
  });

  it('les challenges cardio ne comptent pas', () => {
    const i = input({
      challenges: [
        challenge({
          exercise_id: 'ex_ch_marche_course',
          unit: 'distance',
          muscle_primary: 'pectoraux',
          progress: [
            { day: 1, date: '2026-09-15', target: 5, done: 50, elapsed_sec: 0, completed: true },
          ],
        }),
      ],
    });
    expect(row(i, 'pectoraux').value).toBe(0);
  });
});

describe('bodyBalance — semaine : max(objectif, réel)', () => {
  const bench = (sets: string[]) =>
    leg({
      exercise_id: 'bench',
      muscle_primary: 'pectoraux',
      target: 10,
      sets: sets.map((date) => ({ date, reps: 10 })),
    });

  it("un 360 actif couvre son objectif avant d'être fait", () => {
    const r = row(
      input({ combos: [combo([bench(['2026-09-14', '2026-09-15', '2026-09-15'])])] }),
      'pectoraux',
    );
    expect(r.done).toBe(3);
    expect(r.value).toBe(10);
    expect(row(input({ combos: [combo([bench([])])] }), 'triceps').value).toBe(5);
  });

  it("le réel l'emporte quand il dépasse l'objectif", () => {
    const i = input({
      combos: [combo([bench(['2026-09-14', '2026-09-15', '2026-09-15'])])],
      sessions: [session('2026-09-16', [{ id: 'bench', muscle: 'pectoraux', sets: 12 }])],
    });
    expect(row(i, 'pectoraux').value).toBe(15);
  });

  it("un 360 terminé ou abandonné n'engage plus rien", () => {
    expect(row(input({ combos: [combo([bench([])], 'done')] }), 'pectoraux').value).toBe(0);
    expect(row(input({ combos: [combo([bench([])], 'abandoned')] }), 'pectoraux').value).toBe(0);
  });

  it('un challenge actif engage ses objectifs des jours de la semaine, convertis en séries', () => {
    // Lancé dimanche dernier : son jour 0 tombe AVANT lundi → hors semaine.
    const i = input({
      challenges: [
        challenge({ exercise_id: 'bench', start_date: '2026-09-13', duration_days: 10 }),
      ],
    });
    expect(row(i, 'pectoraux').value).toBe(21); // 7 jours × 30 reps ÷ 10
  });

  it('un gainage en secondes se convertit sur 30-60 s', () => {
    const i = input({
      challenges: [
        challenge({
          exercise_id: 'plank',
          muscle_primary: 'abdominaux',
          unit: 'time',
          daily_targets: Array(7).fill(90),
        }),
      ],
    });
    expect(row(i, 'abdominaux').value).toBe(14); // 630 s ÷ 45
  });

  it('un challenge cumulé engage son total au prorata des jours', () => {
    const i = input({
      challenges: [
        challenge({
          exercise_id: 'bench',
          format: 'cumulative',
          duration_days: 14,
          daily_targets: Array(14).fill(0),
          config: { start: 0, total: 1400 },
        }),
      ],
    });
    expect(row(i, 'pectoraux').value).toBe(70); // 7 jours × 100 reps ÷ 10
  });

  it('un challenge inactif ne planifie rien', () => {
    const i = input({ challenges: [challenge({ exercise_id: 'bench', status: 'abandoned' })] });
    expect(row(i, 'pectoraux').value).toBe(0);
  });
});

describe('bodyBalance — 4 semaines', () => {
  it('réel des 3 semaines précédentes + max(objectif, réel) de la semaine, par semaine', () => {
    const i = input({
      sessions: [
        session('2026-09-02', [{ id: 'x', muscle: 'pectoraux', sets: 8 }]), // semaine −2
        session('2026-08-20', [{ id: 'x', muscle: 'pectoraux', sets: 99 }]), // hors fenêtre
      ],
      combos: [combo([leg({ exercise_id: 'x', muscle_primary: 'pectoraux', target: 10 })])],
    });
    const r = row(i, 'pectoraux', 'weeks4');
    expect(r.done).toBe(2); // 8 ÷ 4
    expect(r.value).toBe(4.5); // (8 + 10) ÷ 4
  });

  it("ne compte pas deux fois les séries d'un 360 commencé la semaine d'avant", () => {
    const c: ComboChallenge = {
      ...combo([
        leg({
          exercise_id: 'x',
          muscle_primary: 'pectoraux',
          target: 10,
          sets: [
            ...Array.from({ length: 4 }, () => ({ date: '2026-09-12', reps: 10 })),
            ...Array.from({ length: 2 }, () => ({ date: '2026-09-15', reps: 10 })),
          ],
        }),
      ]),
      start_date: '2026-09-11',
    };
    expect(row(input({ combos: [c] }), 'pectoraux', 'weeks4').value).toBe(2.5); // (4 + 6) ÷ 4
    expect(row(input({ combos: [c] }), 'pectoraux', 'week').value).toBe(6); // il en reste 6
  });
});

describe('bodyBalance — lecture', () => {
  it('trie du plus gros déficit au plus petit et ignore les muscles sans cible', () => {
    const i = input({
      targets: { pectoraux: 10, dos: 10, mollets: 0 },
      sessions: [
        session('2026-09-15', [
          { id: 'row', muscle: 'dos', sets: 12 },
          { id: 'y', muscle: 'pectoraux', sets: 3 },
        ]),
      ],
    });
    const r = bodyBalance(i, 'week');
    expect(r.map((x) => x.muscle)).toEqual(['pectoraux', 'dos']);
    expect(r.map((x) => x.state)).toEqual(['low', 'ok']);
  });
});
