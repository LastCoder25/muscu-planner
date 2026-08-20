import { describe, it, expect } from 'vitest';
import {
  isMuscuLog,
  mondayOf,
  setsByMuscleInRange,
  muscleVolumeInRange,
  firstOfMonth,
  dayAfter,
  weeklySetsByMuscle,
  volumeVsTarget,
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

describe('muscleVolumeInRange', () => {
  it('agrège séries + reps par muscle ET par exo sur la période, exclut prépa/cardio', () => {
    const entries = [
      entry(
        '2026-08-11',
        mkLog([
          { muscle: 'pectoraux', sets: 3, reps: 10 },
          { muscle: 'dos', sets: 4, reps: 12 },
        ]),
      ),
      entry('2026-08-12', mkLog([{ muscle: 'pectoraux', sets: 2, reps: 8 }])),
      entry('2026-08-13', mkLog([{ muscle: 'pectoraux', sets: 5 }], 'prepa_physique')), // exclu
      entry('2026-07-30', mkLog([{ muscle: 'pectoraux', sets: 9 }])), // hors période
    ];
    const v = muscleVolumeInRange(entries, '2026-08-10', '2026-08-17');
    expect(v.byMuscle['pectoraux']).toEqual({ sets: 5, reps: 46 }); // 3×10 + 2×8
    expect(v.byMuscle['dos']).toEqual({ sets: 4, reps: 48 }); // 4×12
    expect(v.totalSets).toBe(9);
    // par exo : trié par séries décroissantes
    expect(v.byExo[0]!.sets).toBeGreaterThanOrEqual(v.byExo[1]!.sets);
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

describe('setsByMuscleInRange / weeklySetsByMuscle', () => {
  const entries = [
    entry(
      '2026-08-10T10:00:00Z',
      mkLog([
        { muscle: 'pectoraux', sets: 3 },
        { muscle: 'triceps', sets: 2 },
      ]),
    ),
    entry('2026-08-13T10:00:00Z', mkLog([{ muscle: 'pectoraux', sets: 2 }])),
    entry('2026-08-03T10:00:00Z', mkLog([{ muscle: 'pectoraux', sets: 4 }])), // semaine précédente
    entry('2026-08-12T10:00:00Z', mkLog([{ muscle: 'dos', sets: 5 }], 'prepa_physique')), // exclu
  ];
  it('somme les séries muscu par muscle dans la semaine en cours', () => {
    const w = weeklySetsByMuscle(entries, '2026-08-15');
    expect(w.pectoraux).toBe(5); // 3 + 2 (pas les 4 de la semaine d'avant)
    expect(w.triceps).toBe(2);
    expect(w.dos).toBeUndefined(); // prépa physique exclue
  });
  it('range explicite = borne haute exclusive', () => {
    const r = setsByMuscleInRange(entries, '2026-08-01', '2026-08-10');
    expect(r.pectoraux).toBe(4); // seul le 03/08
  });
});

describe('volumeVsTarget', () => {
  it('classe bas / ok / haut selon le % de la cible', () => {
    const done = { pectoraux: 10, dos: 2, biceps: 20 };
    const targets = { pectoraux: 12, dos: 12, biceps: 12, quadriceps: 12 };
    const r = volumeVsTarget(done, targets);
    const by = Object.fromEntries(r.map((x) => [x.muscle, x.state]));
    expect(by.pectoraux).toBe('ok'); // 10/12 = 83 %
    expect(by.dos).toBe('low'); // 2/12 = 17 %
    expect(by.biceps).toBe('high'); // 20/12 = 167 %
    expect(by.quadriceps).toBe('low'); // 0/12
    // Les plus en retard d'abord.
    expect(r[0]!.muscle).toBe('quadriceps');
  });
  it('ignore les muscles sans cible', () => {
    expect(volumeVsTarget({ mollets: 5 }, { mollets: 0 })).toHaveLength(0);
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
