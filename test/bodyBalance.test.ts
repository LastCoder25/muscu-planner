import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeBoss } from './helpers/friendBoss';
import {
  balanceBarGeometry,
  bodyBalance,
  creditSets,
  doneSetsByWeek,
  doneVolume,
  muscleBreakdown,
  weekMuscleSeries,
  type BalanceInput,
  type BalancePeriod,
} from '@/lib/bodyBalance';
import type { LogEntry } from '@/lib/volume';
import type { SessionLog } from '@/lib/types';
import type { ComboChallenge, ComboLeg } from '@/lib/combo';
import type { Challenge } from '@/lib/challenges';
import { bossDayKey } from '@/composables/useMyBossDays';
import {
  bossAgendaEntries,
  type FriendBoss,
  type FriendBossHit,
  type FriendBossMember,
} from '@/lib/friendBoss';

// Mercredi : la semaine en cours va du lundi 14 au dimanche 20 septembre.
const TODAY = '2026-09-16';
const MONDAY = '2026-09-14';

const PRIMARIES: Record<string, string> = {
  bench: 'pectoraux',
  row: 'dos',
  ohp: 'épaules',
  plank: 'abdominaux',
  pushup: 'pectoraux',
};

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
    bossHits: [],
    targets: { pectoraux: 10, triceps: 6, épaules: 6, biceps: 6, dos: 10, abdominaux: 6 },
    objective: 'hypertrophie', // fourchette 8-12 → une série vaut 10 reps
    secondaries: (id) => SECONDARIES[id],
    primaries: (id) => PRIMARIES[id],
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

  it('les challenges tennis ne comptent pas (piste Tennis)', () => {
    const tennisCh = challenge({
      exercise_id: 'bench',
      config: { start: 30, discipline: 'tennis' },
      progress: [
        { day: 1, date: '2026-09-15', target: 30, done: 40, elapsed_sec: 0, completed: true },
      ],
    });
    const i = input({ challenges: [tennisCh] });
    expect(row(i, 'pectoraux').value).toBe(0);
    expect(weekMuscleSeries(i).real.pectoraux ?? 0).toBe(0);
    expect(weekMuscleSeries(i).challenges.pectoraux ?? 0).toBe(0);
    // Témoin : le même challenge en muscu, lui, compte.
    const muscu = input({ challenges: [{ ...tennisCh, config: { start: 30 } }] });
    expect(row(muscu, 'pectoraux').done).toBeGreaterThan(0);
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

describe('bodyBalance — 360 déjà dépassé avant lundi', () => {
  it("un objectif déjà atteint n'ôte rien : le reste négatif ne se soustrait pas", () => {
    const c: ComboChallenge = {
      ...combo([
        leg({
          exercise_id: 'x',
          muscle_primary: 'pectoraux',
          target: 4,
          sets: Array.from({ length: 6 }, () => ({ date: '2026-09-12', reps: 10 })),
        }),
      ]),
      start_date: '2026-09-11',
    };
    const i = input({
      combos: [c],
      sessions: [session('2026-09-15', [{ id: 'y', muscle: 'pectoraux', sets: 3 }])],
    });
    expect(row(i, 'pectoraux', 'week').value).toBe(3); // max(3 faites, reste −2 → rien)
    // Avec un autre objectif sur le même muscle, le reste négatif ne doit pas le rogner.
    const withChallenge = input({
      combos: [c],
      challenges: [challenge({ exercise_id: 'z', muscle_primary: 'pectoraux' })],
    });
    expect(row(withChallenge, 'pectoraux', 'week').value).toBe(21); // 7 × 30 reps ÷ 10, pas 19
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

describe('weekMuscleSeries — les 3 courbes de la semaine', () => {
  const week = (p: Partial<BalanceInput>) => weekMuscleSeries(input(p));

  it('réel : seulement du lundi au dimanche, secondaires à ½', () => {
    const s = week({
      sessions: [
        session('2026-09-15', [{ id: 'bench', muscle: 'pectoraux', sets: 4 }]),
        session('2026-09-13', [{ id: 'bench', muscle: 'pectoraux', sets: 9 }]), // dimanche d'avant
        session('2026-09-21', [{ id: 'bench', muscle: 'pectoraux', sets: 9 }]), // lundi d'après
      ],
    });
    expect(s.real).toEqual({ pectoraux: 4, triceps: 2, épaules: 2 });
  });

  it('réel : compte aussi les séries du 360 et des challenges de la semaine', () => {
    const s = week({
      combos: [
        combo([
          leg({
            exercise_id: 'x',
            muscle_primary: 'dos',
            sets: [{ date: '2026-09-15', reps: 10 }],
          }),
        ]),
      ],
      challenges: [
        challenge({
          exercise_id: 'y',
          muscle_primary: 'quadriceps',
          progress: [
            { day: 1, date: '2026-09-15', target: 30, done: 30, elapsed_sec: 0, completed: true },
          ],
        }),
      ],
    });
    expect(s.real).toEqual({ dos: 1, quadriceps: 3 });
  });

  it("objectif 360 : l'objectif COMPLET, sans déduire ce qui a été fait avant lundi", () => {
    const c: ComboChallenge = {
      ...combo([
        leg({
          exercise_id: 'bench',
          muscle_primary: 'pectoraux',
          target: 10,
          sets: Array.from({ length: 4 }, () => ({ date: '2026-09-12', reps: 10 })),
        }),
      ]),
      start_date: '2026-09-11',
    };
    expect(week({ combos: [c] }).combo).toEqual({ pectoraux: 10, triceps: 5, épaules: 5 });
    expect(week({ combos: [{ ...c, status: 'done' }] }).combo).toEqual({});
  });

  it('challenges : objectifs des actifs sur les 7 jours, cardio exclu, rien dans les autres courbes', () => {
    const s = week({
      challenges: [
        challenge({ exercise_id: 'row', muscle_primary: 'dos' }), // 7 × 30 reps ÷ 10
        challenge({ exercise_id: 'z', muscle_primary: 'dos', status: 'abandoned' }),
        challenge({ exercise_id: 'ex_ch_marche_course', unit: 'distance', muscle_primary: 'dos' }),
      ],
    });
    expect(s.challenges).toEqual({ dos: 21, biceps: 10.5 });
    expect(s.combo).toEqual({});
    expect(s.real).toEqual({});
  });
});

describe('doneVolume — une page, un compte de séries', () => {
  const NEXT_MONDAY = '2026-09-21';
  const mixed = () =>
    input({
      sessions: [session('2026-09-15', [{ id: 'bench', muscle: 'pectoraux', sets: 4 }])],
      combos: [
        combo([
          // 360 en mode reps : deux entrées de 25 reps = 5 séries (fourchette 8-12), PAS 2.
          leg({
            exercise_id: 'row',
            muscle_primary: 'dos',
            count_mode: 'reps',
            sets: [
              { date: '2026-09-15', reps: 25 },
              { date: '2026-09-16', reps: 25 },
            ],
          }),
          // gainage au temps : des secondes, jamais des « reps »
          leg({
            exercise_id: 'plank',
            muscle_primary: 'abdominaux',
            count_mode: 'time',
            sets: [{ date: '2026-09-16', reps: 90 }],
          }),
        ]),
      ],
      challenges: [
        challenge({
          exercise_id: 'ohp',
          exercise_name: 'Développé militaire',
          muscle_primary: 'épaules',
          config: { start: 3, count_mode: 'sets' },
          progress: [
            {
              day: 1,
              date: '2026-09-15',
              target: 3,
              done: 3,
              elapsed_sec: 0,
              completed: true,
              sets: [{ reps: 8 }, { reps: 8 }, { reps: 6 }],
            },
          ],
        }),
      ],
    });

  it('⚠️ LE CAS RÉEL : une entrée du 360 en mode reps compte ses reps ÷ fourchette, pas 1 série', () => {
    const v = doneVolume(mixed(), MONDAY, NEXT_MONDAY);
    expect(v.byExercise.find((e) => e.id === 'row')?.sets).toBe(5);
    // 4 (séance) + 5 (360 reps) + 2 (gainage 90 s ÷ 45) + 3 (challenge en séries)
    expect(v.totalSets).toBe(14);
  });

  it('la silhouette et le radar lisent le même relevé par muscle', () => {
    const i = mixed();
    expect(doneVolume(i, MONDAY, NEXT_MONDAY).byMuscle).toEqual(weekMuscleSeries(i).real);
  });

  it('le total compte chaque série une fois ; les secondaires ne sont crédités que par muscle', () => {
    const v = doneVolume(
      input({ sessions: [session('2026-09-15', [{ id: 'bench', muscle: 'pectoraux', sets: 4 }])] }),
      MONDAY,
      NEXT_MONDAY,
    );
    expect(v.totalSets).toBe(4);
    expect(v.byMuscle).toEqual({ pectoraux: 4, triceps: 2, épaules: 2 });
  });

  it('détail par exercice : nom, muscle normalisé, reps réelles (0 au temps), du plus travaillé au moins', () => {
    const v = doneVolume(mixed(), MONDAY, NEXT_MONDAY);
    expect(v.byExercise).toEqual([
      { id: 'row', name: 'row', muscle: 'dos', sets: 5, reps: 50 },
      { id: 'bench', name: 'bench', muscle: 'pectoraux', sets: 4, reps: 40 },
      { id: 'ohp', name: 'Développé militaire', muscle: 'épaules', sets: 3, reps: 22 },
      { id: 'plank', name: 'plank', muscle: 'abdominaux', sets: 2, reps: 0 },
    ]);
  });

  it('le muscle d’un exercice est normalisé : la variante en base rejoint le muscle de la silhouette', () => {
    const v = doneVolume(
      input({
        sessions: [session('2026-09-15', [{ id: 'ohp', muscle: 'Deltoïde antérieur', sets: 2 }])],
      }),
      MONDAY,
      NEXT_MONDAY,
    );
    expect(v.byExercise[0]!.muscle).toBe('épaules');
    // Ses secondaires « deltoïde antérieur » et « épaules » SONT son principal : pas recompté.
    expect(v.byMuscle.épaules).toBe(2);
  });

  it('borne haute exclue, borne basse incluse', () => {
    const i = input({
      sessions: [
        session(MONDAY, [{ id: 'bench', muscle: 'pectoraux', sets: 2 }]),
        session(NEXT_MONDAY, [{ id: 'bench', muscle: 'pectoraux', sets: 9 }]),
      ],
    });
    expect(doneVolume(i, MONDAY, NEXT_MONDAY).totalSets).toBe(2);
  });

  it('un challenge en reps compte ses reps faites ; un challenge au temps, aucune rep', () => {
    const day = {
      day: 1,
      date: '2026-09-15',
      target: 30,
      done: 30,
      elapsed_sec: 0,
      completed: true,
    };
    const reps = doneVolume(
      input({ challenges: [challenge({ exercise_id: 'row', progress: [day] })] }),
      MONDAY,
      NEXT_MONDAY,
    );
    expect(reps.byExercise[0]).toMatchObject({ sets: 3, reps: 30 });
    const time = doneVolume(
      input({ challenges: [challenge({ exercise_id: 'plank', unit: 'time', progress: [day] })] }),
      MONDAY,
      NEXT_MONDAY,
    );
    expect(time.byExercise[0]!.reps).toBe(0);
  });

  it('la tendance par semaine dit la même chose que le total de chaque semaine', () => {
    const i = input({
      ...mixed(),
      sessions: [
        ...mixed().sessions,
        session('2026-09-08', [{ id: 'bench', muscle: 'pectoraux', sets: 6 }]),
      ],
    });
    const weeks = ['2026-09-07', MONDAY, NEXT_MONDAY];
    expect(doneSetsByWeek(i, weeks)).toEqual([
      doneVolume(i, '2026-09-07', MONDAY).totalSets,
      doneVolume(i, MONDAY, NEXT_MONDAY).totalSets,
      0,
    ]);
    expect(doneSetsByWeek(i, weeks)).toEqual([6, 14, 0]);
  });
});

describe('balanceBarGeometry', () => {
  it('prévu < cible : la cible occupe toute la largeur', () => {
    const g = balanceBarGeometry(4, 6, 10);
    expect(g.targetPct).toBe(100);
    expect(g.donePct).toBe(40);
    expect(g.plannedPct).toBe(60);
  });

  it('prévu > cible : le prévu occupe toute la largeur, la cible recule', () => {
    const g = balanceBarGeometry(5, 15, 10);
    expect(g.plannedPct).toBe(100);
    expect(g.targetPct).toBeCloseTo((10 / 15) * 100, 6);
    expect(g.donePct).toBeCloseTo((5 / 15) * 100, 6);
  });

  it('jamais aucune valeur au-dessus de 100', () => {
    for (const [done, planned, target] of [
      [4, 6, 10],
      [5, 15, 10],
      [0, 0, 10],
      [50, 50, 1],
      [3, 2, 5], // fait > prévu (ne devrait pas arriver, mais reste sans dépassement)
      [20, 5, 10], // fait > cible ET > prévu : le fait seul doit rester plafonné
    ] as const) {
      const g = balanceBarGeometry(done, planned, target);
      expect(g.donePct).toBeLessThanOrEqual(100);
      expect(g.plannedPct).toBeLessThanOrEqual(100);
      expect(g.targetPct).toBeLessThanOrEqual(100);
    }
  });

  it('cible à 0 : pas de division par zéro', () => {
    const g = balanceBarGeometry(0, 0, 0);
    expect(g).toEqual({ donePct: 0, plannedPct: 0, targetPct: 0 });
    // Un prévu positif sans cible reste bornée, sans NaN.
    const g2 = balanceBarGeometry(2, 4, 0);
    expect(Number.isFinite(g2.donePct)).toBe(true);
    expect(Number.isFinite(g2.plannedPct)).toBe(true);
    expect(Number.isFinite(g2.targetPct)).toBe(true);
    expect(g2.plannedPct).toBe(100);
  });

  it('réel > cible sans prévu en plus (value = done)', () => {
    const g = balanceBarGeometry(12, 12, 10);
    expect(g.donePct).toBe(100);
    expect(g.plannedPct).toBe(100);
    expect(g.targetPct).toBeCloseTo((10 / 12) * 100, 6);
  });
});

describe('muscleBreakdown — le détail explique la barre', () => {
  const mixed = input({
    sessions: [
      session('2026-09-15', [{ id: 'bench', muscle: 'pectoraux', sets: 4 }]),
      session('2026-09-02', [{ id: 'row', muscle: 'dos', sets: 6 }]), // semaine −2
    ],
    combos: [
      combo([
        leg({
          exercise_id: 'bench',
          muscle_primary: 'pectoraux',
          target: 10,
          sets: [
            { date: '2026-09-14', reps: 10 },
            { date: '2026-09-15', reps: 10 },
          ],
        }),
        leg({
          exercise_id: 'row',
          muscle_primary: 'dos',
          target: 8,
          sets: [{ date: '2026-09-15', reps: 10 }],
        }),
      ]),
    ],
    challenges: [
      challenge({
        exercise_id: 'ohp',
        muscle_primary: 'épaules',
        config: { start: 3, count_mode: 'sets' },
        daily_targets: Array(7).fill(3),
        progress: [
          { day: 1, date: '2026-09-15', target: 3, done: 3, elapsed_sec: 0, completed: true },
        ],
      }),
    ],
  });

  it('pour chaque muscle et chaque période, la somme du détail vaut le « fait » de la ligne', () => {
    for (const period of ['week', 'weeks4'] as const)
      for (const r of bodyBalance(mixed, period)) {
        const sum = muscleBreakdown(mixed, r.muscle, period).reduce((a, c) => a + c.done, 0);
        expect(Math.round(sum * 10) / 10, `${r.muscle} ${period}`).toBe(r.done);
      }
  });

  it('un exo compte 1 pour son principal, ½ pour un secondaire, et garde sa source', () => {
    const tri = muscleBreakdown(mixed, 'triceps', 'week');
    const combo360 = tri.find((c) => c.source === 'combo' && c.exerciseId === 'bench')!;
    expect(combo360.share).toBe(0.5);
    expect(combo360.done).toBe(1); // 2 séries × ½
    expect(combo360.planned).toBe(5); // objectif 10 × ½
    expect(tri.find((c) => c.source === 'session')!.done).toBe(2); // 4 × ½
    expect(tri.find((c) => c.source === 'challenge')!.done).toBe(1.5); // 3 séries d'ohp × ½

    const pecs = muscleBreakdown(mixed, 'pectoraux', 'week');
    expect(pecs.map((c) => [c.source, c.share, c.done])).toEqual([
      ['session', 1, 4],
      ['combo', 1, 2],
    ]);
  });

  it('en vue 4 semaines, le fait est une moyenne par semaine', () => {
    const dos = muscleBreakdown(mixed, 'dos', 'weeks4');
    expect(dos.find((c) => c.source === 'session')!.done).toBe(1.5); // 6 ÷ 4
    expect(dos.find((c) => c.source === 'combo')!.done).toBe(0.25); // 1 ÷ 4
  });

  it('un muscle que rien ne travaille n’a pas de détail', () => {
    expect(muscleBreakdown(mixed, 'abdominaux', 'week')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🐉 LE BOSS ENTRE AMIS CREUSE SES AXES
//
// ⚠️ Ses reps comptaient DÉJÀ dans la piste Muscu, dans le Global, dans l'énergie et dans
// l'Agenda — mais ni `bodyBalance` ni `weekMuscleSeries` ne lisaient cette source, donc
// 300 pompes de boss ne creusaient AUCUN axe. Même famille que le trou de l'Agenda
// (v0.912) et celui des jours actifs (v0.755) : une source de sport ajoutée, un lecteur
// qui ne la connaît pas.
// ─────────────────────────────────────────────────────────────────────────────
describe('le boss entre amis', () => {
  const MOI = 'moi';
  const jour = (iso: string) => Date.parse(`${iso}T12:00:00`);

  const boss = (p: Partial<FriendBoss> = {}): FriendBoss =>
    makeBoss({
      ownerId: MOI,
      exerciseId: 'pushup',
      createdAt: jour(MONDAY),
      startAt: jour(MONDAY),
      hpTotal: 100_000,
      ...p,
    });
  const membre = (p: Partial<FriendBossMember> = {}): FriendBossMember => ({
    bossId: 'b1',
    userId: MOI,
    pseudo: 'Moi',
    status: 'accepted',
    units: 60,
    claimed: false,
    ...p,
  });
  const frappe = (units: number, iso = MONDAY, p: Partial<FriendBossHit> = {}): FriendBossHit => ({
    id: `h${units}-${iso}`,
    bossId: 'b1',
    userId: MOI,
    units,
    createdAt: jour(iso),
    ...p,
  });

  /** La chaîne RÉELLE : le groupement de l'Agenda, puis l'entrée des calculs de volume.
   *  ⚠️ `bossDayKey` est CELLE DE LA PRODUCTION, pas une clé de test : une copie écrite
   *  ici laisserait ces tests au vert le jour où la vraie clé change (fuseau, bascule à
   *  4 h) — le garde-fou que ce bloc prétend être ne garderait alors plus rien. */
  const hits = (b: FriendBoss, m: FriendBossMember[], h: FriendBossHit[]) =>
    bossAgendaEntries([b], m, h, MOI, bossDayKey);

  it('⚠️ LE DÉFAUT RÉPARÉ : 60 pompes de boss creusent l’axe des pectoraux', () => {
    const i = input({ bossHits: hits(boss(), [membre()], [frappe(40), frappe(20)]) });
    // 60 reps ÷ 10 (fourchette 8-12) = 6 séries au principal
    expect(row(i, 'pectoraux').done).toBeCloseTo(6, 5);
  });

  it('⚠️ et le RADAR de la semaine les somme aussi — c’était la demande', () => {
    const i = input({ bossHits: hits(boss(), [membre()], [frappe(60)]) });
    expect(weekMuscleSeries(i).real.pectoraux ?? 0).toBeCloseTo(6, 5);
  });

  it('les SECONDAIRES comptent ½, comme pour toute autre source', () => {
    const i = input({ bossHits: hits(boss({ exerciseId: 'bench' }), [membre()], [frappe(60)]) });
    expect(row(i, 'pectoraux').done).toBeCloseTo(6, 5);
    expect(row(i, 'triceps').done).toBeCloseTo(3, 5);
  });

  it('⚠️ le CONDITIONNEMENT est écarté : sa piste est le cardio, pas un muscle', () => {
    const i = input({
      bossHits: hits(boss({ family: 'conditioning' }), [membre()], [frappe(60)]),
    });
    expect(row(i, 'pectoraux').done).toBe(0);
  });

  it('⚠️ un boss au TEMPS se convertit en SECONDES, jamais en reps', () => {
    const gainage = boss({ family: 'core', exerciseId: 'plank', exerciseName: 'Gainage' });
    const i = input({ bossHits: hits(gainage, [membre()], [frappe(90)]) });
    // 90 s ÷ 45 (fourchette 30-60 s) = 2 séries — et non 90 ÷ 10 = 9
    expect(row(i, 'abdominaux').done).toBeCloseTo(2, 5);
  });

  it('un boss où je ne suis pas ACCEPTÉ ne creuse rien', () => {
    const i = input({
      bossHits: hits(boss(), [membre({ status: 'invited' })], [frappe(60)]),
    });
    expect(row(i, 'pectoraux').done).toBe(0);
  });

  it('les frappes d’un AUTRE joueur ne comptent pas pour moi', () => {
    const i = input({
      bossHits: hits(boss(), [membre()], [frappe(60, MONDAY, { userId: 'autre' })]),
    });
    expect(row(i, 'pectoraux').done).toBe(0);
  });

  it('un exo inconnu de la bibliothèque ne crédite aucun muscle plutôt que d’en inventer', () => {
    const i = input({ bossHits: hits(boss({ exerciseId: 'inconnu' }), [membre()], [frappe(60)]) });
    for (const r of bodyBalance(i, 'week')) expect(r.done).toBe(0);
  });

  it('le détail par muscle nomme le boss comme source', () => {
    const i = input({ bossHits: hits(boss(), [membre()], [frappe(60)]) });
    const d = muscleBreakdown(i, 'pectoraux', 'week');
    expect(d.map((x) => x.source)).toContain('boss');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔌 LE CÂBLAGE DU COMPOSABLE — qu'AUCUNE porte ne voit
//
// ⚠️ `bossHits` est un champ REQUIS, donc le compilateur garantit qu'il est PASSÉ. Il ne
// garantit pas qu'il est PEUPLÉ : si `ensureLoaded` oublie de charger les boss, la liste
// est vide, le graphe affiche zéro et tout reste VERT — le levier mort qui ne rougit
// jamais. `useBalanceInput` vit au-dessus des stores, hors du harnais : on lit sa source.
// ─────────────────────────────────────────────────────────────────────────────
describe('l’entrée partagée charge ce qu’elle lit', () => {
  const src = readFileSync('src/composables/useBalanceInput.ts', 'utf8');
  const bossSrc = readFileSync('src/composables/useMyBossDays.ts', 'utf8');

  it('⚠️ `ensureLoaded` charge les boss entre amis, sinon ils comptent zéro en silence', () => {
    // ⚠️ ON SUIT LA CHAÎNE ENTIÈRE, parce que le chargement passe par un intermédiaire
    // (`useMyBossDays`, partagé avec l'Agenda) : vérifier un seul des deux maillons
    // laisserait l'autre se casser en silence — et un boss non chargé compte ZÉRO sans
    // rien dire, ce qui est exactement le défaut que ce bloc garde.
    const bloc = src.slice(src.indexOf('function ensureLoaded'));
    expect(bloc, 'l’entrée ne demande pas le chargement des boss').toMatch(
      /bossDays\.ensureLoaded\(\)/,
    );
    expect(bossSrc, 'le composable ne charge rien').toMatch(/friendBoss\.fetchMine\(\)/);
  });

  it('⚠️ et les DEUX écrans lisent le même câblage — sinon ils divergent', () => {
    // L'Agenda et l'équilibre du corps montrent les mêmes frappes : le jour où
    // `bossAgendaEntries` gagne un filtre, il ne doit pas être ajouté à un seul appel.
    const agenda = readFileSync('src/pages/AgendaPage.vue', 'utf8');
    for (const [nom, code] of [
      ['l’entrée des calculs de volume', src],
      ['l’Agenda', agenda],
    ] as const) {
      expect(code, `${nom} n’utilise pas le câblage partagé`).toMatch(/useMyBossDays/);
      expect(code, `${nom} rappelle bossAgendaEntries de son côté`).not.toMatch(
        /bossAgendaEntries\(/,
      );
    }
  });

  it('et les deux tables de muscles viennent de la MÊME requête (aucun aller-retour de plus)', () => {
    expect(src).toMatch(/library\.fetchSecondaries\(\)/);
    // Le muscle principal ne se charge pas à part : `fetchSecondaries` le ramène aussi.
    expect(src).not.toMatch(/fetchPrimaries/);
  });
});
