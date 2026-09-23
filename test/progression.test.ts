import { describe, it, expect } from 'vitest';
import { nextSessionDeterministic, setAdvice, instancesOf, verdictLabel } from '@/lib/progression';
import type {
  Session,
  SessionLog,
  LevelConfig,
  PerformedSet,
  LoggedExercise,
} from '@/lib/types';

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

/* ─────────────────────────────────────────────────────────────────────────
   🏋️ UN EXERCICE SANS PLAN — la séance libre (v0.1105).
   ⚠️ Elle démarrait à 0 kg et 8 reps EN DUR, sans rien relire de la dernière
   fois : ni double progression, ni plateau, ni décharge ne s'y appliquaient.
   ───────────────────────────────────────────────────────────────────────── */
describe('setAdvice — servir un exercice qui n’a pas de cible', () => {
  const R = { min: 8, max: 12 };
  /** Une séance de cet exo : mêmes reps sur chaque série, à cette charge. */
  const inst = (load: number, reps: number[], diff = 2): LoggedExercise =>
    ({
      id: 'squat',
      name: 'Squat',
      muscle_primary: 'quadriceps',
      planned: { sets: reps.length },
      performed: reps.map((r, i) => ({ set: i + 1, load_kg: load, reps: r, difficulty: diff })),
    }) as LoggedExercise;

  const advice = (instances: LoggedExercise[], over: Partial<Parameters<typeof setAdvice>[0]> = {}) =>
    setAdvice({ instances, range: R, scheme: 'linear', musclePrimary: 'quadriceps', ...over });

  it('jamais fait : on ouvre en bas de fourchette, sans rien promettre', () => {
    const a = advice([]);
    expect(a.verdict.kind).toBe('none');
    expect(a.load).toBe(0);
    expect(a.reps).toBe(R.min);
    expect(a.range).toEqual(R);
  });

  it('⚠️ LA FOURCHETTE REÇUE EST CE QUI REND LE VERDICT SENSÉ : sans elle, tout set la « tient »', () => {
    // 6 reps, sous le minimum de 8 → on NE monte pas.
    expect(advice([inst(100, [6, 6, 6])]).verdict.kind).not.toBe('up');
    // La même séance jugée contre une fourchette 5–8 tient le minimum → on monte.
    expect(advice([inst(100, [6, 6, 6])], { range: { min: 5, max: 8 } }).verdict.kind).toBe('up');
  });

  it('objectif tenu → +2,5 kg, et on repart en BAS de fourchette (double progression)', () => {
    const a = advice([inst(100, [12, 12, 12])]);
    expect(a.verdict.kind).toBe('up');
    expect(a.load).toBe(102.5);
    expect(a.reps).toBe(R.min);
  });

  it('le pas suit le muscle : 1,25 kg sur de l’isolation', () => {
    const a = advice([inst(20, [12, 12])], { musclePrimary: 'biceps' });
    expect(a.load).toBe(21.25);
  });

  it('charge maintenue → une répétition de plus que la dernière fois, jamais au-delà du haut', () => {
    // 9 reps : au-dessus du min, en dessous du max → `hold` en double progression.
    const a = advice([inst(100, [9, 9, 9])], { scheme: 'double' });
    expect(a.verdict.kind).toBe('hold');
    expect(a.load).toBe(100);
    expect(a.reps).toBe(10);
    // ⚠️ LA BORNE DU HAUT NE S'ÉPROUVE QU'ICI : il faut une séance où la MEILLEURE série
    // touche déjà le sommet SANS que toutes le touchent — sinon le verdict est « up » et
    // les reps repartent en bas, donc la borne n'est jamais atteinte (mutation survivante).
    const top = advice([inst(100, [12, 12, 8])], { scheme: 'double' });
    expect(top.verdict.kind).toBe('hold');
    expect(top.reps).toBe(R.max);
  });

  it('⚠️ LE PLATEAU REMONTE JUSQU’ICI — c’est l’information que la séance libre n’avait jamais', () => {
    const w = [inst(100, [9, 9, 9]), inst(100, [9, 9, 9]), inst(100, [9, 9, 9])];
    const a = advice(w);
    expect(a.verdict.kind).toBe('plateau_stall');
    expect(a.verdict.window).toBe(3);
    expect(a.load).toBeLessThan(100);
    expect(a.reps).toBe(R.min); // la charge bouge → on repart en bas
  });

  it('échec sous le minimum sur deux séances sur trois → décharge', () => {
    const a = advice([inst(100, [6, 6]), inst(100, [6, 6]), inst(100, [10, 10])]);
    expect(a.verdict.kind).toBe('plateau_fail');
    expect(a.load).toBeLessThan(100);
  });

  it('⚠️ AU POIDS DU CORPS SANS LEST, LA CHARGE NE MONTE PAS — on progresse en répétitions', () => {
    const a = advice([inst(0, [12, 12, 12])], { bodyweight: true, musclePrimary: 'pectoraux' });
    expect(a.verdict.kind).toBe('hold');
    expect(a.load).toBe(0);
    expect(a.reps).toBeGreaterThan(12 - 1); // une rep de plus, bornée par le haut
    expect(verdictLabel(a.verdict).text).toContain('répétitions');
  });

  it('…mais un exercice LESTÉ garde sa progression en charge', () => {
    const a = advice([inst(10, [12, 12, 12])], { bodyweight: true, musclePrimary: 'dos' });
    expect(a.verdict.kind).toBe('up');
    expect(a.load).toBe(12.5);
  });

  it('progression figée (`fixed`) : aucun conseil de charge', () => {
    const a = advice([inst(100, [12, 12, 12])], { scheme: 'fixed' });
    expect(a.verdict.kind).toBe('none');
    expect(a.load).toBe(100);
  });
});

describe('instancesOf — les séances passées d’UN exercice', () => {
  const mkLog = (id: string, exId: string, swappedFrom: string | null = null): SessionLog =>
    ({
      schema_version: '1.0',
      type: 'session_log',
      id,
      session_id: 'plan',
      exercises: [
        {
          id: exId,
          name: exId,
          swapped_from: swappedFrom,
          planned: { sets: 1 },
          performed: [{ set: 1, load_kg: 50, reps: 10, difficulty: 2 }],
        },
      ],
    }) as SessionLog;

  it('garde l’ordre reçu (le plus récent d’abord) et ignore les bilans sans cet exo', () => {
    const got = instancesOf('squat', [mkLog('a', 'squat'), mkLog('b', 'bench'), mkLog('c', 'squat')]);
    expect(got).toHaveLength(2);
  });

  it('⚠️ UN EXERCICE ÉCHANGÉ COMPTE POUR CELUI QU’IL REMPLACE — la règle du moteur', () => {
    expect(instancesOf('squat', [mkLog('a', 'goblet', 'squat')])).toHaveLength(1);
  });

  it('⚠️ DÉDUPLIQUE PAR BILAN : le dernier bilan est passé deux fois par `recentInstances`', () => {
    const l = mkLog('a', 'squat');
    expect(instancesOf('squat', [l, l])).toHaveLength(1);
  });

  it('un exo présent mais sans série réalisée ne compte pas', () => {
    const l = mkLog('a', 'squat');
    (l.exercises[0] as { performed: unknown[] }).performed = [];
    expect(instancesOf('squat', [l])).toHaveLength(0);
  });
});
