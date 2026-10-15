import { describe, it, expect } from 'vitest';
import { savedRunSummary, savedRuns, RESUME_MAX_AGE_MS } from '@/lib/liveResume';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const run = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    session_id: 's1',
    name: 'Haut du corps',
    started_at: new Date(NOW - 3600_000).toISOString(),
    exIndex: 0,
    exercises: [
      {
        sets: [
          { done: true, warmup: true },
          { done: true },
          { done: false },
        ],
      },
      { sets: [{ done: false }] },
    ],
    ...over,
  });

describe('▶️ reprendre une séance de programme depuis l’accueil', () => {
  it('résume une séance interrompue, approches exclues', () => {
    const r = savedRunSummary('muscu:live:s1', run(), NOW);
    expect(r).toEqual({ sessionId: 's1', name: 'Haut du corps', startedAt: NOW - 3600_000, done: 1, total: 3 });
  });

  it('⚠️ la séance libre a sa propre carte : jamais deux fois', () => {
    expect(savedRunSummary('muscu:live:free', run({ session_id: 'free', free: true }), NOW)).toBeNull();
  });

  it('⚠️ les autres clés du même préfixe ne sont pas des séances', () => {
    expect(savedRunSummary('muscu:live:loadstep', '2.5', NOW)).toBeNull();
    expect(savedRunSummary('muscu:live:s1', '{pas du json', NOW)).toBeNull();
    // Une clé qui ne correspond pas à son contenu n'est pas reprise (elle ouvrirait autre chose).
    expect(savedRunSummary('muscu:live:s2', run(), NOW)).toBeNull();
    expect(savedRunSummary('autre:s1', run(), NOW)).toBeNull();
  });

  it('⚠️ une séance trop vieille ne se propose plus', () => {
    const vieille = run({ started_at: new Date(NOW - RESUME_MAX_AGE_MS - 1).toISOString() });
    expect(savedRunSummary('muscu:live:s1', vieille, NOW)).toBeNull();
    const recente = run({ started_at: new Date(NOW - RESUME_MAX_AGE_MS + 60_000).toISOString() });
    expect(savedRunSummary('muscu:live:s1', recente, NOW)).not.toBeNull();
  });

  it('la plus récente d’abord', () => {
    const a = run({ session_id: 'a', started_at: new Date(NOW - 7200_000).toISOString() });
    const b = run({ session_id: 'b', started_at: new Date(NOW - 600_000).toISOString() });
    const list = savedRuns(
      [
        ['muscu:live:a', a],
        ['muscu:live:b', b],
        ['muscu:theme', 'dark'],
      ],
      NOW,
    );
    expect(list.map((r) => r.sessionId)).toEqual(['b', 'a']);
  });
});
