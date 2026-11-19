import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  holdGainLabel,
  holdLoadable,
  isTimeExercise,
  workTonnage,
  logTonnage,
  bestHoldSet,
  detectHoldPRs,
  holdSetLabel,
  HOLD_RECORD_MIN_SEC,
} from '@/lib/loadedHold';
import { bestE1RM, bestSetE1RM, detectLiftPRs, personalRecords } from '@/lib/estimates';
import { compareSession, sessionTotals } from '@/lib/sessionCompare';
import { sessionXp } from '@/lib/athlete';
import { formatLastTime } from '@/lib/liveInsights';
import { prefillLoads } from '@/lib/livePrefill';
import { planNextSession, setAdvice, verdictLabel, instancesOf } from '@/lib/progression';
import type { LevelConfig, LoggedExercise, PerformedSet, Session, SessionLog } from '@/lib/types';

const cfg = { default_progression: 'double' } as LevelConfig;
const perf = (load: number, secs: number, diff = 2): PerformedSet => ({
  set: 1,
  load_kg: load,
  reps: secs,
  difficulty: diff as 2,
});

function holdPlan(id = 'ex_plank', added?: number): Session {
  return {
    schema_version: '1.0',
    type: 'session',
    id: 'plan',
    name: 'Séance A',
    source: 'engine',
    exercises: [
      {
        id,
        name: 'Gainage',
        muscle_primary: 'abdominaux',
        progression: 'fixed',
        rest_seconds: 60,
        target: {
          sets: 3,
          reps_min: 30,
          reps_max: 60,
          unit: 'time',
          load: 'bodyweight',
          ...(added === undefined ? {} : { added_kg: added }),
        },
      },
    ],
  } as unknown as Session;
}

function holdLog(id: string, sets: [number, number][], exId = 'ex_plank', day = 1): SessionLog {
  return {
    schema_version: '1.0',
    type: 'session_log',
    id,
    session_id: 'plan',
    started_at: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`,
    exercises: [
      {
        id: exId,
        name: 'Gainage',
        planned: { sets: sets.length, reps_min: 30, reps_max: 60, unit: 'time' },
        performed: sets.map(([l, s]) => perf(l, s)),
      },
    ],
  } as unknown as SessionLog;
}

const ex0 = (s: Session) => s.exercises[0]!;

describe('🧱 périmètre du lest', () => {
  it('planche, chaise et pont fessier tenu acceptent un lest, pas le gainage latéral ni le reste', () => {
    expect(holdLoadable('ex_plank')).toBe(true);
    expect(holdLoadable('ex_wall_sit')).toBe(true);
    expect(holdLoadable('ex_glute_bridge_hold')).toBe(true);
    // Le Superman tenu n'a pas de lest : rien à poser sur le dos.
    expect(holdLoadable('ex_superman_hold')).toBe(false);
    expect(holdLoadable('ex_plank_side')).toBe(false);
    expect(holdLoadable('ex_tn_plank')).toBe(false);
    expect(holdLoadable('squat')).toBe(false);
    expect(holdLoadable(null)).toBe(false);
  });

  it('isTimeExercise : unité temps, ou une tenue lestable même sans cible', () => {
    expect(isTimeExercise({ id: 'x', planned: { unit: 'time' } })).toBe(true);
    expect(isTimeExercise({ id: 'ex_plank', planned: {} })).toBe(true);
    expect(isTimeExercise({ id: 'squat', planned: { unit: 'reps' } })).toBe(false);
    expect(isTimeExercise({ id: 'squat' })).toBe(false);
  });
});

describe('🧱 e1RM, records, tonnage : un exo au temps n’a pas de force soulevée', () => {
  it('bestE1RM / bestSetE1RM : 10 kg × 60 s ne vaut PAS 30 kg de 1RM', () => {
    const p = [perf(10, 60)];
    expect(bestE1RM(p, true)).toBe(0);
    expect(bestSetE1RM(p, true)).toBeNull();
    // sans l'indicateur de temps, rien ne change pour un exo de force
    expect(bestE1RM([perf(100, 5)])).toBe(116.75);
  });

  it('detectLiftPRs ignore le lest d’une planche, garde les vrais records', () => {
    const prior = holdLog('a', [[5, 40]]);
    const cur = holdLog('b', [[20, 60]]);
    expect(detectLiftPRs(cur, [prior])).toEqual([]);
  });

  it('personalRecords : la planche lestée n’entre pas au mur des records de force', () => {
    const rows = [{ performedAt: '2026-11-02T10:00:00Z', log: holdLog('b', [[20, 60]]) }];
    expect(personalRecords(rows)).toEqual([]);
  });

  it('compareSession : pas de delta de force sur une tenue, et le tonnage l’ignore', () => {
    const prior = { performedAt: '2026-11-01T10:00:00Z', log: holdLog('a', [[5, 40]]) };
    const cur = { performedAt: '2026-11-08T10:00:00Z', log: holdLog('b', [[20, 60]]) };
    expect(compareSession(cur, [prior]).exercises).toEqual([]);
    expect(sessionTotals(cur.log).volume).toBe(0);
  });

  it('workTonnage / logTonnage : kg × reps pour la force, 0 pour une tenue', () => {
    expect(workTonnage([perf(50, 10), perf(50, 8)], false)).toBe(900);
    expect(workTonnage([perf(10, 60)], true)).toBe(0);
    expect(logTonnage(holdLog('a', [[10, 60]]))).toBe(0);
    const force = {
      exercises: [{ id: 'squat', name: 's', planned: {}, performed: [perf(50, 10)] }],
    } as unknown as SessionLog;
    expect(logTonnage(force)).toBe(500);
  });

  it('XP : AUCUNE XP pour le lest (la séance vaut pareil avec ou sans)', () => {
    const sans = holdLog('a', [[0, 60]]);
    const avec = holdLog('a', [[20, 60]]);
    expect(sessionXp(avec)).toBe(sessionXp(sans));
  });
});

describe('🏋️ l’indicateur propre au lest : record = lest max tenu ≥ plancher', () => {
  it('bestHoldSet : le plus lourd tenu assez longtemps, à égalité le plus long', () => {
    expect(bestHoldSet([perf(0, 90)])).toBeNull();
    // 20 kg tenus 5 s ne comptent pas : sous le plancher
    expect(bestHoldSet([perf(20, HOLD_RECORD_MIN_SEC - 1), perf(10, 40)])?.load_kg).toBe(10);
    expect(bestHoldSet([perf(10, 40), perf(10, 55), perf(5, 90)])?.reps).toBe(55);
  });

  it('detectHoldPRs : un premier passage lesté est une référence, la hausse du lest un record', () => {
    expect(detectHoldPRs(holdLog('b', [[10, 45]]), [])).toEqual([]);
    const prs = detectHoldPRs(holdLog('b', [[12.5, 45]]), [holdLog('a', [[10, 50]])]);
    expect(prs).toEqual([{ id: 'ex_plank', name: 'Gainage', load: 12.5, secs: 45, prevLoad: 10 }]);
    // même lest : pas de record
    expect(detectHoldPRs(holdLog('b', [[10, 60]]), [holdLog('a', [[10, 50]])])).toEqual([]);
  });

  it('détection indifférente à un exo qui n’est pas en secondes', () => {
    const force = {
      id: 'b',
      exercises: [{ id: 'squat', name: 's', planned: {}, performed: [perf(100, 40)] }],
    } as unknown as SessionLog;
    expect(detectHoldPRs(force, [force])).toEqual([]);
  });
});

describe('📊 tonnage des trophées (useProgress)', () => {
  it('useProgress passe par logTonnage : une planche lestée ne compte pas de secondes', () => {
    const src = fs.readFileSync('src/composables/useProgress.ts', 'utf8');
    expect(src).toContain('logTonnage(r.payload)');
    expect(src).not.toMatch(/load_kg \|\| 0\) \* \(s\.reps/);
    expect(
      logTonnage(
        holdLog('a', [
          [20, 60],
          [20, 60],
          [20, 60],
        ]),
      ),
    ).toBe(0);
  });
});

describe('🏷️ affichage « +X kg · N s »', () => {
  it('holdSetLabel et formatLastTime', () => {
    expect(holdSetLabel(0, 45)).toBe('45 s');
    expect(holdSetLabel(10, 45)).toBe('+10 kg · 45 s');
    expect(holdSetLabel(2.5, 45)).toBe('+2,5 kg · 45 s');
    expect(holdGainLabel(2.5)).toBe('+2,5 kg');
    expect(holdGainLabel(10.3 - 10.1)).toBe('+0,2 kg');
    expect(formatLastTime(perf(0, 45), { time: true, bodyweight: true })).toBe('45 s');
    expect(formatLastTime(perf(10, 45), { time: true, bodyweight: true })).toBe('+10 kg · 45 s');
  });

  it('verdictLabel d’une tenue dit « progresse en secondes »', () => {
    const v = { kind: 'hold', loadFrom: 5, loadTo: 5, window: 1 } as const;
    expect(verdictLabel(v, true).text).toBe('maintenu · progresse en secondes');
    expect(verdictLabel(v).text).toBe('maintenu · progresse en répétitions');
  });
});

describe('🧱 double progression en secondes (séance suivante)', () => {
  it('TOUTES les séries au haut de la fourchette → le lest monte de 2,5 kg', () => {
    const last = holdLog('l1', [
      [10, 60],
      [10, 60],
      [10, 60],
    ]);
    const { session, verdicts } = planNextSession(holdPlan('ex_plank', 10), last, cfg, []);
    expect(ex0(session).target.added_kg).toBe(12.5);
    expect(ex0(session).target.reps_min).toBe(30); // la durée repart au bas
    expect(ex0(session).target.reps_max).toBe(60);
    expect(verdicts[0]!.verdict.kind).toBe('up');
    expect(verdicts[0]!.time).toBe(true);
  });

  it('une série qui échoue → le lest ne monte pas', () => {
    const last = holdLog('l1', [
      [10, 60],
      [10, 45],
      [10, 60],
    ]);
    const { session, verdicts } = planNextSession(holdPlan('ex_plank', 10), last, cfg, []);
    expect(ex0(session).target.added_kg).toBe(10);
    expect(verdicts[0]!.verdict.kind).toBe('hold');
  });

  it('durci : moins de séries réalisées que prévu → le lest ne monte pas', () => {
    const last = holdLog('l1', [[10, 60]]); // 1 série sur 3 prévues
    const { session, verdicts } = planNextSession(holdPlan('ex_plank', 10), last, cfg, []);
    expect(ex0(session).target.added_kg).toBe(10);
    expect(verdicts[0]!.verdict.kind).toBe('hold');
  });

  it('une série faite à un lest plus léger que prévu ne compte pas comme atteinte', () => {
    const last = holdLog('l1', [
      [10, 60],
      [5, 60],
    ]);
    // dernier lest max = 10, mais une série sous 10 : on ne monte pas
    const { session } = planNextSession(holdPlan('ex_plank', 10), last, cfg, []);
    expect(ex0(session).target.added_kg).toBe(10);
  });

  it('le lest réellement porté est reporté dans le plan, même si le plan n’en avait pas', () => {
    const last = holdLog('l1', [[7.5, 40]]);
    const { session } = planNextSession(holdPlan('ex_plank'), last, cfg, []);
    expect(ex0(session).target.added_kg).toBe(7.5);
  });

  it('la chaise suit la même règle', () => {
    const last = holdLog(
      'l1',
      [
        [5, 60],
        [5, 60],
        [5, 60],
      ],
      'ex_wall_sit',
    );
    const { session } = planNextSession(holdPlan('ex_wall_sit', 5), last, cfg, []);
    expect(ex0(session).target.added_kg).toBe(7.5);
  });

  it('⚠️ un exo échangé ne lègue pas son lest à la planche', () => {
    const last = holdLog('l1', [[20, 60]], 'ex_pushup');
    (last.exercises[0] as LoggedExercise).swapped_from = 'ex_plank';
    const { session } = planNextSession(holdPlan('ex_plank'), last, cfg, []);
    expect(ex0(session).target.added_kg).toBeUndefined();
  });

  it('décharge planifiée : le lest baisse de 10 % et une série saute, comme les autres exos', () => {
    const last = holdLog('l1', [[10, 60]]);
    const { session, verdicts } = planNextSession(holdPlan('ex_plank', 10), last, cfg, [], {
      muscuSessionCount: 5,
      deloadEvery: 6,
    });
    expect(ex0(session).target.added_kg).toBe(9);
    expect(ex0(session).target.sets).toBe(2);
    expect(verdicts[0]!.verdict.kind).toBe('deload_planned');
  });

  it('SANS LEST : exactement comme avant (aucun lest posé, progression figée, aucun conseil)', () => {
    const last = holdLog('l1', [
      [0, 60],
      [0, 60],
      [0, 60],
    ]);
    const { session, verdicts } = planNextSession(holdPlan('ex_plank'), last, cfg, []);
    expect(ex0(session).target).toEqual(holdPlan('ex_plank').exercises[0]!.target);
    expect(verdicts[0]!.verdict.kind).toBe('none');
    // idem en décharge : figée, intacte
    const d = planNextSession(holdPlan('ex_plank'), last, cfg, [], {
      muscuSessionCount: 5,
      deloadEvery: 6,
    });
    expect(ex0(d.session).target).toEqual(holdPlan('ex_plank').exercises[0]!.target);
    expect(d.session.exercises[0]!.target.sets).toBe(3);
    expect(d.verdicts[0]!.verdict.kind).toBe('none');
  });

  it('une tenue NON lestable (gainage latéral) garde l’ancien comportement même avec load_kg > 0 dans un log', () => {
    const last = holdLog('l1', [[10, 60]], 'ex_plank_side');
    const { session, verdicts } = planNextSession(holdPlan('ex_plank_side'), last, cfg, []);
    expect(ex0(session).target.added_kg).toBeUndefined();
    expect(verdicts[0]!.verdict.kind).toBe('none');
  });
});

describe('🧱 séance libre : setAdvice d’une tenue lestée', () => {
  const range = { min: 30, max: 60 };
  const inst = (sets: [number, number][]) => instancesOf('ex_plank', [holdLog('a', sets)]);

  it('au haut de la fourchette partout : le lest monte, la durée repart à 30 s', () => {
    const a = setAdvice({
      instances: inst([
        [10, 60],
        [10, 60],
      ]),
      range,
      scheme: 'double',
      bodyweight: true,
      holdLoadable: true,
    });
    expect(a.load).toBe(12.5);
    expect(a.reps).toBe(30);
  });

  it('sinon : même lest, +5 s (pas +1 s), plafonné au haut', () => {
    const a = setAdvice({
      instances: inst([[10, 40]]),
      range,
      scheme: 'double',
      bodyweight: true,
      holdLoadable: true,
    });
    expect(a.load).toBe(10);
    expect(a.reps).toBe(45);
    const b = setAdvice({
      instances: inst([[10, 58]]),
      range,
      scheme: 'double',
      bodyweight: true,
      holdLoadable: true,
    });
    expect(b.reps).toBe(60);
  });

  it('sans lest à la dernière séance : l’ancien chemin (poids du corps, +1)', () => {
    const a = setAdvice({
      instances: inst([[0, 40]]),
      range,
      scheme: 'double',
      bodyweight: true,
      holdLoadable: true,
    });
    expect(a.load).toBe(0);
    expect(a.reps).toBe(41);
  });
});

describe('🏋️ préremplissage du lest', () => {
  it('reprend le dernier lest d’une planche, mais jamais pour un autre exo au poids du corps', () => {
    const sets = () => [{ load_kg: 0, done: false }];
    const plank = { id: 'ex_plank', bodyweight: true, sets: sets() };
    const pushup = { id: 'ex_pushup', bodyweight: true, sets: sets() };
    const logs = [holdLog('a', [[7.5, 45]]), holdLog('b', [[9, 45]], 'ex_pushup')];
    expect(prefillLoads([plank, pushup], logs)).toBe(1);
    expect(plank.sets[0]!.load_kg).toBe(7.5);
    expect(pushup.sets[0]!.load_kg).toBe(0);
  });
});
