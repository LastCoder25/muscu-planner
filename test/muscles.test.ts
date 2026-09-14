import { describe, it, expect } from 'vitest';
import { normMuscle, muscleRole } from '@/lib/muscles';

describe('normMuscle', () => {
  it('minuscules, espaces retirés, variantes rattachées', () => {
    expect(normMuscle('  Pectoraux ')).toBe('pectoraux');
    expect(normMuscle('Deltoïde antérieur')).toBe('épaules');
    expect(normMuscle(null)).toBe('');
  });
});

describe('muscleRole', () => {
  const bench = {
    muscle_primary: 'pectoraux',
    muscle_secondary: ['triceps', 'deltoïde antérieur'],
  };

  it('principal, secondaire ou absent', () => {
    expect(muscleRole(bench, 'Pectoraux')).toBe('primary');
    expect(muscleRole(bench, 'triceps')).toBe('secondary');
    expect(muscleRole(bench, 'dos')).toBeNull();
  });

  it('reconnaît un secondaire écrit sous une variante', () => {
    expect(muscleRole(bench, 'épaules')).toBe('secondary');
  });

  it("un muscle vide n'est jamais reconnu, même sur un exo sans muscle", () => {
    expect(muscleRole({ muscle_primary: null }, '')).toBeNull();
  });
});
