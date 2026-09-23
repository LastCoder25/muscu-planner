import { describe, it, expect } from 'vitest';
import {
  exerciseProgression,
  planNextSession,
  verdictLabel,
  type ProgressionKind,
} from '@/lib/progression';
import type {
  ExerciseTarget,
  LevelConfig,
  LoggedExercise,
  PerformedSet,
  Session,
} from '@/lib/types';

const perf = (load: number, reps: number, difficulty = 2): PerformedSet => ({
  set: 1,
  load_kg: load,
  reps,
  difficulty: difficulty as PerformedSet['difficulty'],
});

/** Une séance de cet exercice : mêmes reps sur chaque série. */
function seance(load: number, reps: number[], difficulty = 2): LoggedExercise {
  return {
    id: 'squat',
    name: 'Squat',
    planned: {},
    performed: reps.map((r) => perf(load, r, difficulty)),
  };
}

const cible = (load: number): ExerciseTarget => ({
  sets: 3,
  reps_min: 8,
  reps_max: 12,
  load_kg: load,
});

function verdict(
  scheme: 'linear' | 'double' | 'fixed',
  instances: LoggedExercise[],
  load = 100,
  increment = 2.5,
) {
  return exerciseProgression({ target: cible(load), scheme, increment, instances });
}

describe('exerciseProgression — le moteur DIT ce qu’il décide', () => {
  it('monte la charge quand l’objectif est tenu (linéaire : le minimum partout)', () => {
    const v = verdict('linear', [seance(100, [8, 8, 8])]);
    expect(v.kind).toBe<ProgressionKind>('up');
    expect(v.loadFrom).toBe(100);
    expect(v.loadTo).toBe(102.5);
  });

  it('monte la charge en double progression quand le HAUT est atteint sans forcer', () => {
    const v = verdict('double', [seance(100, [12, 12, 12], 2)]);
    expect(v.kind).toBe<ProgressionKind>('up');
    expect(v.loadTo).toBe(102.5);
  });

  it('maintient quand le haut est atteint mais que ça a coûté cher', () => {
    // Note d'effort 4 → on ne monte pas, la progression se fait en répétitions.
    const v = verdict('double', [seance(100, [12, 12, 12], 4)]);
    expect(v.kind).toBe<ProgressionKind>('hold');
    expect(v.loadTo).toBe(v.loadFrom);
  });

  it('ANNONCE le plateau par échec : sous le minimum sur 2 des 3 dernières', () => {
    const v = verdict('linear', [
      seance(100, [6, 6, 6]),
      seance(100, [7, 7, 7]),
      seance(100, [9, 9, 9]),
    ]);
    expect(v.kind).toBe<ProgressionKind>('plateau_fail');
    expect(v.loadTo).toBe(90); // −10 % en linéaire
    expect(v.window).toBe(3);
  });

  it('ANNONCE la stagnation : même charge, reps plates, sans atteindre le haut', () => {
    const v = verdict('linear', [
      seance(100, [9, 9, 9]),
      seance(100, [9, 9, 9]),
      seance(100, [10, 10, 10]),
    ]);
    expect(v.kind).toBe<ProgressionKind>('plateau_stall');
    expect(v.loadTo).toBe(90);
  });

  it('la stagnation allège MOINS en double progression qu’en linéaire', () => {
    const plates = [seance(100, [9, 9, 9]), seance(100, [9, 9, 9]), seance(100, [10, 10, 10])];
    expect(verdict('linear', plates).loadTo).toBe(90); // −10 %
    expect(verdict('double', plates).loadTo).toBe(95); // −5 %
  });

  it('ne crie pas au plateau sur une seule séance ratée', () => {
    const v = verdict('linear', [
      seance(100, [6, 6, 6]),
      seance(100, [9, 9, 9]),
      seance(100, [10, 10, 10]),
    ]);
    expect(v.kind).not.toBe<ProgressionKind>('plateau_fail');
  });

  it('ne crie pas à la stagnation quand les répétitions progressent vraiment', () => {
    const v = verdict('linear', [
      seance(100, [11, 11, 11]),
      seance(100, [9, 9, 9]),
      seance(100, [8, 8, 8]),
    ]);
    expect(v.kind).not.toBe<ProgressionKind>('plateau_stall');
  });

  it('ne décide rien sans historique, ni sur une progression figée', () => {
    expect(verdict('linear', []).kind).toBe<ProgressionKind>('none');
    expect(verdict('fixed', [seance(100, [12, 12, 12])]).kind).toBe<ProgressionKind>('none');
  });

  it('dit sur COMBIEN de séances il s’appuie', () => {
    expect(verdict('linear', [seance(100, [9, 9, 9])]).window).toBe(1);
    expect(verdict('linear', [seance(100, [9, 9, 9]), seance(100, [9, 9, 9])]).window).toBe(2);
    // Jamais plus de 3, même avec un historique plus long.
    expect(verdict('linear', Array(7).fill(seance(100, [9, 9, 9]))).window).toBe(3);
  });
});

describe('planNextSession — le verdict et la charge ne peuvent pas se contredire', () => {
  function plan(load: number): Session {
    return {
      schema_version: '1.0',
      type: 'session',
      id: 'p',
      name: 'Séance A',
      source: 'engine',
      exercises: [
        {
          id: 'squat',
          name: 'Squat',
          muscle_primary: 'quadriceps',
          target: cible(load),
        },
      ],
    } as unknown as Session;
  }
  function log(id: string, load: number, reps: number[]) {
    return {
      schema_version: '1.0',
      type: 'session_log',
      id,
      exercises: [seance(load, reps)],
    } as unknown as import('@/lib/types').SessionLog;
  }
  const cfg = { default_progression: 'linear' } as LevelConfig;

  it('applique EXACTEMENT la charge que le verdict annonce', () => {
    // ⚠️ C'est l'invariant qui compte : l'écran affichera le verdict, la séance portera
    // la charge. S'ils divergent, l'app annonce autre chose que ce qu'elle fait.
    const cas: [string, number[], number[][]][] = [
      ['montée', [8, 8, 8], []],
      [
        'échec',
        [6, 6, 6],
        [
          [7, 7, 7],
          [9, 9, 9],
        ],
      ],
      [
        'stagnation',
        [9, 9, 9],
        [
          [9, 9, 9],
          [10, 10, 10],
        ],
      ],
      ['maintien', [9, 9, 9], []],
    ];
    for (const [nom, derniere, avant] of cas) {
      const hist = avant.map((r, i) => log(`h${i}`, 100, r));
      const p = planNextSession(plan(100), log('last', 100, derniere), cfg, hist);
      const v = p.verdicts[0]!;
      expect(p.verdicts, nom).toHaveLength(1);
      expect(p.session.exercises[0]!.target.load_kg, `${nom} → ${v.verdict.kind}`).toBe(
        v.verdict.loadTo,
      );
    }
  });

  it('nomme l’exercice, pour que l’écran puisse le dire', () => {
    const p = planNextSession(plan(100), log('last', 100, [8, 8, 8]), cfg);
    expect(p.verdicts[0]!.name).toBe('Squat');
    expect(p.verdicts[0]!.id).toBe('squat');
  });

  it('annonce la décharge PLANIFIÉE, et l’applique', () => {
    const p = planNextSession(plan(100), log('last', 100, [8, 8, 8]), cfg, [], {
      muscuSessionCount: 9,
      deloadEvery: 10,
    });
    expect(p.verdicts[0]!.verdict.kind).toBe<ProgressionKind>('deload_planned');
    expect(p.session.exercises[0]!.target.load_kg).toBe(90);
    expect(p.session.exercises[0]!.target.load_kg).toBe(p.verdicts[0]!.verdict.loadTo);
    expect(p.session.name).toContain('Décharge');
  });

  it('une progression FIGÉE n’est pas allégée par la décharge planifiée', () => {
    const p0 = plan(100);
    (p0.exercises[0] as { progression?: string }).progression = 'fixed';
    const p = planNextSession(p0, log('last', 100, [8, 8, 8]), cfg, [], {
      muscuSessionCount: 9,
      deloadEvery: 10,
    });
    expect(p.verdicts[0]!.verdict.kind).toBe<ProgressionKind>('none');
    expect(p.session.exercises[0]!.target.load_kg).toBe(100);
  });
});

describe('verdictLabel — dire le verdict, sans le reconstruire', () => {
  const v = (kind: ProgressionKind, from: number, to: number, window = 3) => ({
    kind,
    loadFrom: from,
    loadTo: to,
    window,
  });

  it('une montée se lit comme un gain', () => {
    const l = verdictLabel(v('up', 100, 102.5));
    expect(l.text).toBe('+2.5 kg');
    expect(l.tone).toBe('up');
  });

  it('un PLATEAU dit sur combien de séances il porte — c’est l’info qui manquait', () => {
    expect(verdictLabel(v('plateau_fail', 100, 90)).text).toContain('3 séances');
    expect(verdictLabel(v('plateau_stall', 100, 95)).text).toContain('3 séances');
  });

  it('un plateau n’a PAS le ton d’une décharge programmée : ce n’est pas la même nouvelle', () => {
    expect(verdictLabel(v('plateau_fail', 100, 90)).tone).toBe('warn');
    expect(verdictLabel(v('plateau_stall', 100, 95)).tone).toBe('warn');
    expect(verdictLabel(v('deload_planned', 100, 90, 0)).tone).toBe('down');
  });

  it('la décharge dit qu’elle était PROGRAMMÉE', () => {
    expect(verdictLabel(v('deload_planned', 100, 90, 0)).text).toContain('programmée');
  });

  it('un maintien explique qu’on progresse en répétitions', () => {
    const l = verdictLabel(v('hold', 100, 100));
    expect(l.text).toContain('répétitions');
    expect(l.tone).toBe('same');
  });

  it('porte toujours le delta en kg quand la charge bouge', () => {
    for (const k of [
      'up',
      'plateau_fail',
      'plateau_stall',
      'deload_planned',
    ] as ProgressionKind[]) {
      expect(verdictLabel(v(k, 100, 90)).text, k).toContain('kg');
    }
  });
});
