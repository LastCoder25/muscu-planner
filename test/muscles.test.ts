import { describe, it, expect } from 'vitest';
import { normMuscle, muscleRole, regionTotals, MUSCLE_REGIONS } from '@/lib/muscles';

describe('regionTotals', () => {
  it('additionne les muscles de chaque région, dans l’ordre des régions', () => {
    expect(MUSCLE_REGIONS.map((r) => r.key)).toEqual([
      'Poitrine',
      'Épaules',
      'Bras',
      'Jambes',
      'Core',
      'Dos',
    ]);
    const t = regionTotals({
      pectoraux: 4,
      biceps: 1,
      avant_bras: 0.5, // variante de base → avant-bras
      Quadriceps: 3, // clé non normalisée
      fessiers: 1.5,
      'deltoïde antérieur': 2, // → épaules
      lombaires: 9, // sans région : ignoré
    });
    expect(t).toEqual([4, 2, 1.5, 4.5, 0, 0]);
  });
});

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
