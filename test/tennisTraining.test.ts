import { describe, it, expect } from 'vitest';
import { challengeLane, exerciseLane, isTennisExercise } from '@/lib/tennisTraining';
import type { Challenge } from '@/lib/challenges';

const tennisEx = (tags: string[]) => ({ category: 'prepa_physique', tags: ['tennis', ...tags] });

describe('exos tennis', () => {
  it('un exo tennis = prépa physique + tag tennis', () => {
    expect(isTennisExercise(tennisEx([]))).toBe(true);
    expect(isTennisExercise({ category: 'prepa_physique', tags: ['padel'] })).toBe(false);
    expect(isTennisExercise({ category: 'musculation', tags: ['tennis'] })).toBe(false);
    expect(isTennisExercise({ category: null, tags: null })).toBe(false);
  });
});

describe('trois voies de jetons', () => {
  const ch = (p: Partial<Challenge>) =>
    ({ unit: 'reps', exercise_id: 'ex_pp_squat_jump', config: { start: 10 }, ...p }) as Challenge;

  it('un challenge tennis vit dans la voie tennis', () => {
    expect(challengeLane(ch({ config: { start: 10, discipline: 'tennis' } }))).toBe('tennis');
    expect(challengeLane(ch({}))).toBe('muscu');
  });

  it('⚠️ une sortie reste une sortie, même marquée tennis', () => {
    expect(
      challengeLane(ch({ unit: 'distance', config: { start: 5, discipline: 'tennis' } })),
    ).toBe('cardio');
    expect(challengeLane(ch({ exercise_id: 'ex_burpees' }))).toBe('cardio');
  });

  it('voie d’un exo avant création', () => {
    expect(exerciseLane({ id: 'x', ...tennisEx([]) }, false)).toBe('tennis');
    expect(exerciseLane({ id: 'x', ...tennisEx([]) }, true)).toBe('cardio');
    expect(exerciseLane({ id: 'x', category: 'musculation', tags: [] }, false)).toBe('muscu');
  });
});
