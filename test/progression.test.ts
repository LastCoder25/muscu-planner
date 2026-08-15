import { describe, it, expect } from 'vitest';
import { nextSessionDeterministic } from '@/lib/progression';
import type { Session, SessionLog, LevelConfig, PerformedSet } from '@/lib/types';

const cfg = { default_progression: 'linear' } as LevelConfig;

function plan(load: number, sets = 3, repsMin = 8, repsMax = 12): Session {
  return {
    schema_version: '1.0',
    type: 'session',
    id: 'plan',
    name: 'Séance A',
    source: 'engine',
    exercises: [
      {
        id: 'squat',
        name: 'Squat',
        muscle_primary: 'quadriceps',
        target: { sets, reps_min: repsMin, reps_max: repsMax, load_kg: load },
      },
    ],
  } as unknown as Session;
}

const perf = (load: number, reps: number): PerformedSet => ({
  set: 1,
  load_kg: load,
  reps,
  difficulty: 2,
});

function log(id: string, load: number, reps: number[], sets = reps.length): SessionLog {
  return {
    schema_version: '1.0',
    type: 'session_log',
    id,
    session_id: 'plan',
    exercises: [
      {
        id: 'squat',
        name: 'Squat',
        muscle_primary: 'quadriceps',
        planned: { sets },
        performed: reps.map((r) => perf(load, r)),
      },
    ],
  } as SessionLog;
}

const loadOf = (s: Session) => s.exercises[0]!.target.load_kg!;
const setsOf = (s: Session) => s.exercises[0]!.target.sets!;

describe('progression — charge & deload réactif', () => {
  it('linéaire : tout au-dessus du min → +2,5 kg (composé)', () => {
    const next = nextSessionDeterministic(plan(100), log('l', 100, [12, 12, 12]), cfg);
    expect(loadOf(next)).toBe(102.5);
  });

  it('plateau : échec sous le min sur 2 des 3 dernières séances → deload −10 %', () => {
    const last = log('l3', 100, [6, 8, 8]); // échec (6 < 8)
    const hist = [last, log('l2', 100, [10, 10, 10]), log('l1', 100, [7, 8, 8])]; // l1 échec aussi
    const next = nextSessionDeterministic(plan(100), last, cfg, hist);
    expect(loadOf(next)).toBe(90); // 2/3 en échec → deload
  });

  it('un seul échec sur 3 → PAS de deload', () => {
    const last = log('l3', 100, [6, 8, 8]);
    const hist = [last, log('l2', 100, [10, 10, 10]), log('l1', 100, [10, 10, 10])];
    const next = nextSessionDeterministic(plan(100), last, cfg, hist);
    // pas d'échec répété, mais pas tout au min non plus (6<8) → charge maintenue
    expect(loadOf(next)).toBe(100);
  });

  it('stagnation : même charge et reps plates sur 3 séances (jamais au max) → deload', () => {
    const last = log('l3', 100, [9, 9, 9]);
    const hist = [last, log('l2', 100, [9, 9, 9]), log('l1', 100, [9, 9, 9])];
    const next = nextSessionDeterministic(plan(100), last, cfg, hist);
    expect(loadOf(next)).toBe(90); // coincé → on casse le palier
  });

  it('progression en reps (double) n’est PAS traitée comme une stagnation', () => {
    const dbl = { default_progression: 'double' } as LevelConfig;
    const last = log('l3', 100, [11, 11, 11]); // reps en hausse
    const hist = [last, log('l2', 100, [10, 10, 10]), log('l1', 100, [9, 9, 9])];
    const next = nextSessionDeterministic(plan(100), last, dbl, hist);
    expect(loadOf(next)).toBe(100); // charge maintenue, on progresse en reps
  });
});

describe('progression — décharge planifiée', () => {
  it('la Nᵉ séance (multiple de deloadEvery) est allégée : −10 % charge, −1 série, marquée', () => {
    // 5 séances faites, deloadEvery=6 → la prochaine (6ᵉ) est une décharge.
    const next = nextSessionDeterministic(plan(100, 3), log('l', 100, [12, 12, 12]), cfg, [], {
      muscuSessionCount: 5,
      deloadEvery: 6,
    });
    expect(loadOf(next)).toBe(90);
    expect(setsOf(next)).toBe(2);
    expect(next.name).toContain('Décharge');
  });

  it('hors cadence de décharge : progression normale', () => {
    const next = nextSessionDeterministic(plan(100, 3), log('l', 100, [12, 12, 12]), cfg, [], {
      muscuSessionCount: 3,
      deloadEvery: 6,
    });
    expect(loadOf(next)).toBe(102.5); // +2,5, pas de décharge
    expect(next.name).not.toContain('Décharge');
  });

  it('sans muscuSessionCount : jamais de décharge (rétro-compat)', () => {
    const next = nextSessionDeterministic(plan(100, 3), log('l', 100, [12, 12, 12]), cfg);
    expect(next.name).not.toContain('Décharge');
    expect(setsOf(next)).toBe(3);
  });
});
