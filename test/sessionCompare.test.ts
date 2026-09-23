import { describe, it, expect } from 'vitest';
import { compareSession, deltaLabel, sessionTotals, type DatedLog } from '@/lib/sessionCompare';
import type { PerformedSet, SessionLog } from '@/lib/types';

const s = (load: number, reps: number): PerformedSet => ({
  set: 1,
  load_kg: load,
  reps,
  difficulty: 2,
});

function log(
  id: string,
  exos: { id: string; name?: string; sets: PerformedSet[] }[],
  opts: { sessionId?: string; minutes?: number } = {},
): SessionLog {
  const l: SessionLog = {
    schema_version: '1.0',
    type: 'session_log',
    id,
    exercises: exos.map((e) => ({
      id: e.id,
      name: e.name ?? e.id,
      planned: {},
      performed: e.sets,
    })),
  } as SessionLog;
  if (opts.sessionId) l.session_id = opts.sessionId;
  if (opts.minutes) l.duration_min = opts.minutes;
  return l;
}

const d = (at: string, l: SessionLog): DatedLog => ({ performedAt: at, log: l });

describe('sessionTotals — trois chiffres, une seule définition', () => {
  it('additionne le tonnage et compte les séries', () => {
    const t = sessionTotals(
      log('a', [
        { id: 'dc', sets: [s(100, 5), s(100, 5)] },
        { id: 'sq', sets: [s(80, 10)] },
      ]),
    );
    expect(t.volume).toBe(1800);
    expect(t.sets).toBe(3);
  });

  it('reprend la durée du bilan, zéro si absente', () => {
    expect(sessionTotals(log('a', [], { minutes: 62 })).minutes).toBe(62);
    expect(sessionTotals(log('a', [])).minutes).toBe(0);
  });
});

describe('compareSession — la séance : seulement le MÊME plan', () => {
  it('compare à la précédente séance du même plan', () => {
    const cur = d(
      '2026-03-10T18:00:00Z',
      log('c', [{ id: 'dc', sets: [s(100, 5)] }], { sessionId: 'p1', minutes: 60 }),
    );
    const old = d(
      '2026-03-03T18:00:00Z',
      log('o', [{ id: 'dc', sets: [s(90, 5)] }], { sessionId: 'p1', minutes: 55 }),
    );
    const r = compareSession(cur, [old]);
    expect(r.prev?.volume).toBe(450);
    expect(r.prev?.minutes).toBe(55);
    expect(r.prev?.daysSince).toBe(7);
  });

  it('IGNORE une séance d’un AUTRE plan : comparer un bas du corps à un haut n’a pas de sens', () => {
    const cur = d(
      '2026-03-10T18:00:00Z',
      log('c', [{ id: 'dc', sets: [s(100, 5)] }], { sessionId: 'p1' }),
    );
    const autre = d(
      '2026-03-09T18:00:00Z',
      log('o', [{ id: 'sq', sets: [s(200, 5)] }], { sessionId: 'p2' }),
    );
    expect(compareSession(cur, [autre]).prev).toBeUndefined();
  });

  it('une séance LIBRE n’a pas de comparaison de séance', () => {
    const cur = d('2026-03-10T18:00:00Z', log('c', [{ id: 'dc', sets: [s(100, 5)] }]));
    const old = d('2026-03-03T18:00:00Z', log('o', [{ id: 'dc', sets: [s(90, 5)] }]));
    const r = compareSession(cur, [old]);
    expect(r.prev).toBeUndefined();
    // ...mais l'exercice, lui, se compare quand même.
    expect(r.exercises).toHaveLength(1);
  });

  it('prend la PLUS RÉCENTE des séances antérieures du même plan', () => {
    const cur = d(
      '2026-03-10T18:00:00Z',
      log('c', [{ id: 'dc', sets: [s(100, 5)] }], { sessionId: 'p1' }),
    );
    const vieille = d(
      '2026-01-01T18:00:00Z',
      log('v', [{ id: 'dc', sets: [s(50, 5)] }], { sessionId: 'p1' }),
    );
    const recente = d(
      '2026-03-03T18:00:00Z',
      log('r', [{ id: 'dc', sets: [s(90, 5)] }], { sessionId: 'p1' }),
    );
    expect(compareSession(cur, [vieille, recente]).prev?.volume).toBe(450);
  });

  it('ne se compare ni à l’AVENIR ni à elle-même', () => {
    // ⚠️ Les deux tiennent à la MÊME règle : « strictement avant ». L'appelant passe tout
    // son historique, séance courante comprise — c'est la comparaison de date qui l'écarte,
    // pas un filtre d'id (qui serait redondant, et invérifiable).
    const cur = d(
      '2026-03-10T18:00:00Z',
      log('c', [{ id: 'dc', sets: [s(100, 5)] }], { sessionId: 'p1' }),
    );
    const futur = d(
      '2026-03-20T18:00:00Z',
      log('f', [{ id: 'dc', sets: [s(120, 5)] }], { sessionId: 'p1' }),
    );
    const r = compareSession(cur, [futur, cur]);
    expect(r.prev).toBeUndefined();
    expect(r.exercises).toHaveLength(0);
  });
});

describe('compareSession — l’exercice : la dernière fois, toutes séances confondues', () => {
  it('retrouve l’exercice dans une AUTRE séance', () => {
    const cur = d(
      '2026-03-10T18:00:00Z',
      log('c', [{ id: 'dc', name: 'Développé couché', sets: [s(100, 5)] }], { sessionId: 'p1' }),
    );
    const ailleurs = d(
      '2026-03-05T18:00:00Z',
      log('o', [{ id: 'dc', sets: [s(95, 6)] }], { sessionId: 'p2' }),
    );
    const e = compareSession(cur, [ailleurs]).exercises[0]!;
    expect(e.name).toBe('Développé couché');
    expect(e.load).toBe(100);
    expect(e.prevLoad).toBe(95);
    expect(e.prevReps).toBe(6);
    expect(e.daysSince).toBe(5);
  });

  it('compare la MEILLEURE série de chaque séance, pas la première', () => {
    const cur = d('2026-03-10T18:00:00Z', log('c', [{ id: 'dc', sets: [s(60, 12), s(100, 5)] }]));
    const old = d('2026-03-03T18:00:00Z', log('o', [{ id: 'dc', sets: [s(95, 5), s(50, 15)] }]));
    const e = compareSession(cur, [old]).exercises[0]!;
    expect(e.load).toBe(100);
    expect(e.prevLoad).toBe(95);
  });

  it('omet un exercice jamais fait avant : il n’y a rien à comparer', () => {
    const cur = d(
      '2026-03-10T18:00:00Z',
      log('c', [
        { id: 'dc', sets: [s(100, 5)] },
        { id: 'nouveau', sets: [s(40, 10)] },
      ]),
    );
    const old = d('2026-03-03T18:00:00Z', log('o', [{ id: 'dc', sets: [s(90, 5)] }]));
    expect(compareSession(cur, [old]).exercises.map((e) => e.id)).toEqual(['dc']);
  });

  it('omet un exercice sans charge : il n’a pas de comparaison de FORCE', () => {
    const cur = d('2026-03-10T18:00:00Z', log('c', [{ id: 'gainage', sets: [s(0, 60)] }]));
    const old = d('2026-03-03T18:00:00Z', log('o', [{ id: 'gainage', sets: [s(0, 45)] }]));
    expect(compareSession(cur, [old]).exercises).toHaveLength(0);
  });

  it('ne dépend pas de l’ordre dans lequel on lui passe l’historique', () => {
    const cur = d(
      '2026-03-10T18:00:00Z',
      log('c', [{ id: 'dc', sets: [s(100, 5)] }], { sessionId: 'p1' }),
    );
    const hist = [
      d('2026-01-01T18:00:00Z', log('v', [{ id: 'dc', sets: [s(50, 5)] }], { sessionId: 'p1' })),
      d('2026-03-03T18:00:00Z', log('r', [{ id: 'dc', sets: [s(90, 5)] }], { sessionId: 'p1' })),
    ];
    const a = compareSession(cur, hist);
    const b = compareSession(cur, [...hist].reverse());
    expect(a).toEqual(b);
    expect(a.exercises[0]!.prevLoad).toBe(90);
  });
});

describe('deltaLabel', () => {
  it('signe les gains et les pertes', () => {
    expect(deltaLabel(1800, 1460, 'kg')).toEqual({ text: '+340 kg', tone: 'up' });
    expect(deltaLabel(55, 60, 'min')).toEqual({ text: '-5 min', tone: 'down' });
  });

  it('dit l’égalité sans signe', () => {
    expect(deltaLabel(60, 60, 'min')).toEqual({ text: '= min', tone: 'same' });
  });
});
