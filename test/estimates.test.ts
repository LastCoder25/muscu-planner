import { describe, it, expect } from 'vitest';
import { estimate1RM, bestE1RM, detectLiftPRs } from '@/lib/estimates';
import type { SessionLog, PerformedSet } from '@/lib/types';

const perf = (load: number, reps: number): PerformedSet => ({
  set: 1,
  load_kg: load,
  reps,
  difficulty: 2,
});

function mkLog(id: string, exos: { id: string; name: string; sets: PerformedSet[] }[]): SessionLog {
  return {
    schema_version: '1.0',
    type: 'session_log',
    id,
    exercises: exos.map((e) => ({
      id: e.id,
      name: e.name,
      planned: {},
      performed: e.sets,
    })),
  } as SessionLog;
}

describe('estimate1RM', () => {
  it('Epley : 1 rep = charge, 0 rep/charge = 0', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(0, 5)).toBe(0);
    expect(estimate1RM(100, 0)).toBe(0);
    expect(estimate1RM(100, 10)).toBeCloseTo(133.25, 1); // 100×(1+10/30)
  });
});

describe('bestE1RM', () => {
  it('renvoie le meilleur 1RM des séries', () => {
    expect(bestE1RM([perf(80, 8), perf(100, 3), perf(60, 12)])).toBe(estimate1RM(100, 3));
  });
});

describe('detectLiftPRs', () => {
  it('détecte un record battu (dépasse le meilleur antérieur)', () => {
    const current = mkLog('c', [{ id: 'dc', name: 'Développé couché', sets: [perf(100, 5)] }]);
    const priors = [mkLog('p1', [{ id: 'dc', name: 'Développé couché', sets: [perf(90, 5)] }])];
    const prs = detectLiftPRs(current, priors);
    expect(prs).toHaveLength(1);
    expect(prs[0]!.id).toBe('dc');
    expect(prs[0]!.e1rm).toBeGreaterThan(prs[0]!.prev);
    // gain arrondi à 0,1 kg : 116,75 − 105 = 11,75 → 11,8.
    expect(prs[0]!.gain).toBe(11.8);
  });
  it('PAS de record si égalé ou en dessous', () => {
    const current = mkLog('c', [{ id: 'dc', name: 'DC', sets: [perf(90, 5)] }]);
    const priors = [mkLog('p1', [{ id: 'dc', name: 'DC', sets: [perf(100, 5)] }])];
    expect(detectLiftPRs(current, priors)).toHaveLength(0);
  });
  it('PAS de record au premier passage (aucun antérieur > 0)', () => {
    const current = mkLog('c', [{ id: 'squat', name: 'Squat', sets: [perf(120, 5)] }]);
    expect(detectLiftPRs(current, [])).toHaveLength(0);
  });
  it('ignore les exos au poids du corps (1RM = 0)', () => {
    const current = mkLog('c', [{ id: 'pompe', name: 'Pompes', sets: [perf(0, 30)] }]);
    const priors = [mkLog('p1', [{ id: 'pompe', name: 'Pompes', sets: [perf(0, 20)] }])];
    expect(detectLiftPRs(current, priors)).toHaveLength(0);
  });
  it('meilleur antérieur = max sur TOUS les bilans précédents', () => {
    const current = mkLog('c', [{ id: 'dc', name: 'DC', sets: [perf(105, 3)] }]);
    const priors = [
      mkLog('p1', [{ id: 'dc', name: 'DC', sets: [perf(100, 3)] }]),
      mkLog('p2', [{ id: 'dc', name: 'DC', sets: [perf(110, 3)] }]), // meilleur antérieur
    ];
    // 105×3 < 110×3 → pas de record.
    expect(detectLiftPRs(current, priors)).toHaveLength(0);
  });
});
