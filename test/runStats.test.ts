import { describe, it, expect } from 'vitest';
import { runAttempt, runSuccessPct, normalizeRunStats, successTier } from '@/lib/runStats';

describe('runStats — % de réussite réel (boss de palier)', () => {
  it('jamais tenté → null', () => {
    expect(runSuccessPct({}, 'golem')).toBeNull();
  });
  it('chaque tentative compte, gagnée ou perdue', () => {
    let s = runAttempt({}, 'golem', false);
    expect(s.golem).toEqual({ runs: 1, clears: 0 });
    expect(runSuccessPct(s, 'golem')).toBe(0);
    s = runAttempt(s, 'golem', true);
    s = runAttempt(s, 'golem', true);
    expect(s.golem).toEqual({ runs: 3, clears: 2 });
    expect(runSuccessPct(s, 'golem')).toBe(67);
  });
  it('les boss sont comptés séparément', () => {
    const s = runAttempt(runAttempt({}, 'golem', true), 'dragon', false);
    expect(runSuccessPct(s, 'golem')).toBe(100);
    expect(runSuccessPct(s, 'dragon')).toBe(0);
  });
  it('ne modifie pas les compteurs reçus', () => {
    const s = { golem: { runs: 1, clears: 1 } };
    runAttempt(s, 'golem', false);
    expect(s.golem).toEqual({ runs: 1, clears: 1 });
  });
  it('relit le JSONB défensivement, jamais plus de victoires que de tentatives', () => {
    expect(normalizeRunStats({ a: { runs: 2, clears: 5 }, b: 'x', c: { runs: 0 } })).toEqual({
      a: { runs: 2, clears: 2 },
    });
  });
  it('teinte commune : ≥ 70 vert, ≥ 40 orange, sinon rouge', () => {
    expect([successTier(70), successTier(69), successTier(40), successTier(39)]).toEqual([
      'ok',
      'mid',
      'mid',
      'bad',
    ]);
  });
});
