import { describe, it, expect } from 'vitest';
import { normMuscle } from '@/lib/muscles';
import {
  comboLegColor,
  muscleColor,
  isMuscuLog,
  mondayOf,
  comboLogEntries,
  challengeLogEntries,
  firstOfMonth,
  dayAfter,
  volumeState,
  VOLUME_LOW,
  VOLUME_HIGH,
  weeklyVolumeSeries,
  muscuSessionsInLastDays,
  muscuWeekStreak,
  type LogEntry,
} from '@/lib/volume';
import type { SessionLog } from '@/lib/types';

// Fabrique un bilan minimal : exos = [muscle, nbSéries, (charge, reps)].
function mkLog(
  exos: { muscle: string; sets: number; load?: number; reps?: number }[],
  discipline?: SessionLog['discipline'],
): SessionLog {
  return {
    schema_version: '1.0',
    type: 'session_log',
    id: crypto.randomUUID(),
    session_id: 'sess',
    ...(discipline ? { discipline } : {}),
    exercises: exos.map((e, i) => ({
      id: `ex${i}`,
      name: e.muscle,
      muscle_primary: e.muscle,
      planned: {},
      performed: Array.from({ length: e.sets }, (_, s) => ({
        set: s + 1,
        load_kg: e.load ?? 0,
        reps: e.reps ?? 10,
        difficulty: 2 as const,
      })),
    })),
  } as SessionLog;
}
const entry = (performedAt: string, log: SessionLog): LogEntry => ({ performedAt, log });

describe('isMuscuLog', () => {
  it('muscu = discipline absente ou "musculation" ; exclut prépa/cardio', () => {
    expect(isMuscuLog(mkLog([]))).toBe(true);
    expect(isMuscuLog(mkLog([], 'musculation'))).toBe(true);
    expect(isMuscuLog(mkLog([], 'prepa_physique'))).toBe(false);
    expect(isMuscuLog(mkLog([], 'autre_sport'))).toBe(false);
  });
});

/** Séries et reps faites sur un muscle dans des séances synthétiques. (Les tests lisaient
 *  `muscleVolumeInRange`, retirée : l'app compte désormais via `doneVolume`.) */
function volumeOf(es: LogEntry[], muscle: string): { sets: number; reps: number } {
  let sets = 0;
  let reps = 0;
  for (const e of es)
    for (const ex of e.log.exercises)
      if (ex.muscle_primary === muscle)
        for (const s of ex.performed) {
          sets++;
          reps += s.reps;
        }
  return { sets, reps };
}

describe('comboLogEntries', () => {
  it('convertit les séries du Défi 360 en séances muscu (une par jour actif)', () => {
    const combo = {
      id: 'c1',
      name: 'Défi 360',
      start_date: '2026-08-10',
      duration_days: 7,
      status: 'active' as const,
      legs: [
        {
          slot: 'push',
          exercise_id: 'ex_pushup',
          exercise_name: 'Pompes',
          muscle_primary: 'pectoraux',
          rep_weight: 1,
          target: 5,
          count_mode: 'sets' as const,
          sets: [
            { date: '2026-08-11', reps: 12 },
            { date: '2026-08-11', reps: 10 },
            { date: '2026-08-12', reps: 8 },
          ],
        },
        {
          slot: 'pull',
          exercise_id: 'ex_row',
          exercise_name: 'Rowing',
          muscle_primary: 'dos',
          rep_weight: 1,
          target: 5,
          count_mode: 'sets' as const,
          sets: [{ date: '2026-08-11', reps: 10, weight: 40 }],
        },
      ],
    };
    const es = comboLogEntries([combo]);
    expect(es).toHaveLength(2); // 11/08 et 12/08
    // pecto = 3 séries (12+10+8=30), dos = 1 série (10), charge conservée.
    expect(volumeOf(es, 'pectoraux')).toEqual({ sets: 3, reps: 30 });
    expect(volumeOf(es, 'dos')).toEqual({ sets: 1, reps: 10 });
    const row = es.flatMap((e) => e.log.exercises).find((x) => x.id === 'ex_row');
    expect(row?.performed[0]?.load_kg).toBe(40);
  });
});

describe('challengeLogEntries', () => {
  const mkChallenge = (over: Record<string, unknown>) => ({
    id: 'ch1',
    exercise_id: 'ex_shoulder_press',
    exercise_name: 'Développé épaules',
    muscle_primary: 'épaules',
    rep_weight: 1,
    unit: 'reps',
    format: 'fixed',
    duration_days: 7,
    start_date: '2026-08-10',
    config: {},
    daily_targets: [],
    status: 'active',
    progress: [],
    ...over,
  });
  it('convertit les séries d’un challenge muscu en volume (ticket 6e0b13f0)', () => {
    const ch = mkChallenge({
      progress: [
        {
          day: 0,
          date: '2026-08-11',
          target: 3,
          done: 22,
          elapsed_sec: 0,
          completed: false,
          sets: [
            { reps: 12, weight: 20 },
            { reps: 10, weight: 20 },
          ],
        },
        {
          day: 1,
          date: '2026-08-12',
          target: 3,
          done: 8,
          elapsed_sec: 0,
          completed: false,
          sets: [{ reps: 8, weight: 22 }],
        },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const es = challengeLogEntries([ch as any]);
    expect(es).toHaveLength(2);
    expect(volumeOf(es, 'épaules')).toEqual({ sets: 3, reps: 30 });
  });
  it('exclut les challenges cardio (pas de volume muscu)', () => {
    const ch = mkChallenge({
      exercise_id: 'ex_ch_marche_course',
      muscle_primary: null,
      progress: [
        {
          day: 0,
          date: '2026-08-11',
          target: 1,
          done: 1,
          elapsed_sec: 0,
          completed: false,
          sets: [{ reps: 0, sec: 1800 }],
        },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(challengeLogEntries([ch as any])).toHaveLength(0);
  });
  it('ignore les jours sans détail de série', () => {
    const ch = mkChallenge({
      progress: [
        { day: 0, date: '2026-08-11', target: 20, done: 20, elapsed_sec: 0, completed: true },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(challengeLogEntries([ch as any])).toHaveLength(0);
  });
});

describe('firstOfMonth / dayAfter', () => {
  it('bornes de période cohérentes', () => {
    expect(firstOfMonth('2026-08-20')).toBe('2026-08-01');
    expect(dayAfter('2026-08-20')).toBe('2026-08-21');
    expect(dayAfter('2026-08-31')).toBe('2026-09-01');
  });
});

describe('mondayOf', () => {
  it('renvoie le lundi de la semaine (dimanche inclus dans SA semaine)', () => {
    expect(mondayOf('2026-08-12')).toBe('2026-08-10'); // mer 12 → lun 10
    expect(mondayOf('2026-08-10')).toBe('2026-08-10'); // lundi
    expect(mondayOf('2026-08-16')).toBe('2026-08-10'); // dim 16 → lun 10
    expect(mondayOf('2026-08-17')).toBe('2026-08-17'); // lun suivant
  });
});

// (volumeVsTarget, remplacé par lib/bodyBalance, a été retiré ; ses seuils vivent ici.)
describe('volumeState', () => {
  it('classe bas / ok / haut selon le % de la cible, bornes incluses dans « ok »', () => {
    expect(volumeState(10 / 12)).toBe('ok');
    expect(volumeState(2 / 12)).toBe('low');
    expect(volumeState(20 / 12)).toBe('high');
    expect(volumeState(0)).toBe('low');
    expect(volumeState(VOLUME_LOW)).toBe('ok');
    expect(volumeState(VOLUME_HIGH)).toBe('ok');
    expect([VOLUME_LOW, VOLUME_HIGH]).toEqual([0.6, 1.3]);
  });
});

describe('weeklyVolumeSeries', () => {
  const entries = [
    entry('2026-08-10T10:00:00Z', mkLog([{ muscle: 'pectoraux', sets: 3, load: 40, reps: 10 }])),
    entry('2026-08-12T10:00:00Z', mkLog([{ muscle: 'dos', sets: 2, load: 50, reps: 10 }])),
    entry('2026-08-04T10:00:00Z', mkLog([{ muscle: 'pectoraux', sets: 4, load: 30, reps: 10 }])),
  ];
  it('agrège séries/tonnage/séances par semaine, ancienne d’abord', () => {
    const s = weeklyVolumeSeries(entries, 3, '2026-08-15');
    expect(s).toHaveLength(3);
    expect(s[2]!.weekStart).toBe('2026-08-10'); // semaine en cours en dernier
    expect(s[2]!.sets).toBe(5); // 3 + 2
    expect(s[2]!.sessions).toBe(2);
    expect(s[2]!.tonnage).toBe(3 * 40 * 10 + 2 * 50 * 10);
    expect(s[1]!.weekStart).toBe('2026-08-03');
    expect(s[1]!.sets).toBe(4);
  });
});

describe('muscuSessionsInLastDays', () => {
  it('compte les séances muscu récentes (fenêtre inclusive)', () => {
    const entries = [
      entry('2026-08-15T10:00:00Z', mkLog([{ muscle: 'pectoraux', sets: 1 }])),
      entry('2026-08-14T10:00:00Z', mkLog([{ muscle: 'dos', sets: 1 }])),
      entry('2026-07-01T10:00:00Z', mkLog([{ muscle: 'dos', sets: 1 }])), // hors fenêtre
      entry('2026-08-13T10:00:00Z', mkLog([{ muscle: 'dos', sets: 1 }], 'prepa_physique')), // exclu
    ];
    expect(muscuSessionsInLastDays(entries, 7, '2026-08-15')).toBe(2);
  });
});

describe('muscuWeekStreak', () => {
  it('compte les semaines consécutives actives (tolère la semaine en cours vide)', () => {
    const entries = [
      entry('2026-08-04T10:00:00Z', mkLog([{ muscle: 'pectoraux', sets: 1 }])), // semaine du 03/08
      entry('2026-07-28T10:00:00Z', mkLog([{ muscle: 'dos', sets: 1 }])), // semaine du 27/07
    ];
    // Semaine en cours (10/08) vide → part de la précédente (03/08) : 2 semaines.
    expect(muscuWeekStreak(entries, '2026-08-15')).toBe(2);
  });
  it('0 si aucune séance', () => {
    expect(muscuWeekStreak([], '2026-08-15')).toBe(0);
  });
});

describe('comboLegColor — le 360 parle la couleur de l’Équilibre du corps', () => {
  it('même couleur que muscleColor sur le muscle normalisé', () => {
    expect(comboLegColor({ muscle_primary: 'Pectoraux', slot: 'push' })).toBe(
      muscleColor('pectoraux'),
    );
    // Un alias de la base doit retrouver la couleur du groupe affiché, pas le gris par défaut.
    expect(comboLegColor({ muscle_primary: 'Deltoïde antérieur', slot: 'push' })).toBe(
      muscleColor(normMuscle('deltoïde antérieur')),
    );
    expect(muscleColor(normMuscle('deltoïde antérieur'))).not.toBe(muscleColor('inconnu'));
  });
  it('sans muscle enregistré, on se rabat sur l’emplacement', () => {
    expect(comboLegColor({ muscle_primary: null, slot: 'squat' })).toBe(muscleColor('quadriceps'));
    expect(comboLegColor({ slot: 'pull' })).toBe(muscleColor('dos'));
    expect(comboLegColor({ muscle_primary: '', slot: 'squat' })).not.toBe(muscleColor(''));
  });
});
