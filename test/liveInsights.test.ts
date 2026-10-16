import { describe, it, expect } from 'vitest';
import {
  formatLastTime,
  historicalBestE1RM,
  isNewRecord,
  lastTimeAt,
  lastTimeSets,
} from '@/lib/liveInsights';
import { restNotice, secondsLeft, shouldAskPermission, shouldSchedule } from '@/lib/restNotify';
import type { SessionLog } from '@/lib/types';

const log = (id: string, exId: string, sets: [number, number][]): SessionLog =>
  ({
    id,
    exercises: [
      {
        id: exId,
        name: exId,
        performed: sets.map(([l, r], i) => ({ set: i + 1, load_kg: l, reps: r, difficulty: 2 })),
      },
    ],
  }) as unknown as SessionLog;

describe('🕘 dernière fois, à la même position de série', () => {
  const logs = [
    log('b', 'squat', [
      [60, 12],
      [62.5, 10],
      [62.5, 8],
    ]),
    log('a', 'squat', [[100, 5]]),
  ];

  it('prend la séance la plus RÉCENTE de l’exercice', () => {
    expect(lastTimeSets('squat', logs).map((s) => s.load_kg)).toEqual([60, 62.5, 62.5]);
  });
  it('la 2e série se compare à la 2e d’hier', () => {
    expect(lastTimeAt(lastTimeSets('squat', logs), 2)).toMatchObject({ load_kg: 62.5, reps: 10 });
  });
  it('pas de repli quand hier avait moins de séries, ni sans historique', () => {
    expect(lastTimeAt(lastTimeSets('squat', logs), 4)).toBeNull();
    expect(lastTimeAt(lastTimeSets('jamais-fait', logs), 1)).toBeNull();
    expect(lastTimeAt(lastTimeSets('squat', logs), 0)).toBeNull();
  });
  it('suit un exo remplacé (swapped_from) comme le reste de l’app', () => {
    const l = log('c', 'goblet', [[20, 10]]);
    (l.exercises[0] as { swapped_from: string }).swapped_from = 'squat';
    expect(lastTimeSets('squat', [l])).toHaveLength(1);
  });
  it('formate charge, poids du corps, lest et secondes', () => {
    const s = { set: 1, load_kg: 42.5, reps: 12, difficulty: 2 } as never;
    expect(formatLastTime(s, { time: false, bodyweight: false })).toBe('42,5 kg × 12');
    expect(formatLastTime(s, { time: false, bodyweight: true })).toBe('+42,5 kg × 12');
    expect(formatLastTime({ ...(s as object), load_kg: 0 } as never, { time: false, bodyweight: true })).toBe(
      '12 reps',
    );
    expect(formatLastTime({ ...(s as object), reps: 45 } as never, { time: true, bodyweight: true })).toBe(
      '45 s',
    );
  });
});

describe('🏆 record en direct', () => {
  const logs = [log('a', 'bench', [[100, 5]])]; // e1RM 116,75 → 116,75
  const best = historicalBestE1RM('bench', logs);

  it('le meilleur 1RM passé est celui de l’historique', () => {
    expect(best).toBeGreaterThan(110);
    expect(historicalBestE1RM('rien', logs)).toBe(0);
  });
  it('le record est le meilleur de TOUTES les séances, pas de la dernière', () => {
    const l = [log('old', 'bench', [[100, 5]]), log('new', 'bench', [[60, 8]])];
    expect(historicalBestE1RM('bench', l)).toBe(best);
  });
  it('une série qui dépasse le record est un record', () => {
    expect(isNewRecord(best, { load_kg: 105, reps: 5 })).toBe(true);
  });
  it('égaler ou rester dessous n’est PAS un record', () => {
    expect(isNewRecord(best, { load_kg: 100, reps: 5 })).toBe(false);
    expect(isNewRecord(best, { load_kg: 90, reps: 5 })).toBe(false);
  });
  it('AUCUN record sans historique (première fois = référence)', () => {
    expect(isNewRecord(0, { load_kg: 200, reps: 10 })).toBe(false);
  });
  it('sans charge (poids du corps, temps) : jamais', () => {
    expect(isNewRecord(best, { load_kg: 0, reps: 30 })).toBe(false);
  });
  it('une seule fête par palier : la série doit aussi battre celles d’aujourd’hui', () => {
    const earlier = [{ load_kg: 105, reps: 5 }];
    expect(isNewRecord(best, { load_kg: 105, reps: 5 }, earlier)).toBe(false);
    expect(isNewRecord(best, { load_kg: 107.5, reps: 5 }, earlier)).toBe(true);
  });
});

describe('🔔 notification de fin de repos', () => {
  it('texte : exercice et série', () => {
    expect(restNotice('Squat', 'série 3')).toEqual({
      title: 'Repos terminé',
      body: 'Squat, série 3',
      tag: 'muscu-rest',
    });
  });
  it('demande la permission seulement si pas tranchée et pas coupée', () => {
    expect(shouldAskPermission('default', null)).toBe(true);
    expect(shouldAskPermission('default', '0')).toBe(false);
    expect(shouldAskPermission('denied', null)).toBe(false);
    expect(shouldAskPermission('granted', null)).toBe(false);
    expect(shouldAskPermission('unsupported', null)).toBe(false);
  });
  it('programme seulement si accordée et pas coupée', () => {
    expect(shouldSchedule('granted', null)).toBe(true);
    expect(shouldSchedule('granted', '1')).toBe(true);
    expect(shouldSchedule('granted', '0')).toBe(false);
    expect(shouldSchedule('denied', null)).toBe(false);
    expect(shouldSchedule('default', null)).toBe(false);
  });
  it('le décompte suit l’heure de fin (page figée puis réveillée)', () => {
    expect(secondsLeft(100_000, 40_000)).toBe(60);
    expect(secondsLeft(100_000, 99_001)).toBe(1);
    expect(secondsLeft(100_000, 130_000)).toBe(0);
  });
});
