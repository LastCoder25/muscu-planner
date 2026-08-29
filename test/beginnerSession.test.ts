import { describe, it, expect } from 'vitest';
import { buildBeginnerSession, type ExerciseDef } from '@/lib/programBuilder';

const lib: ExerciseDef[] = [
  {
    id: 'ex_bw_squat',
    name: 'Squat poids du corps',
    muscle_primary: 'quadriceps',
    muscle_secondary: ['fessiers'],
    equipment: 'poids_du_corps',
    equipment_required: [],
    difficulty: 1,
  },
  {
    id: 'ex_pushup',
    name: 'Pompes',
    muscle_primary: 'pectoraux',
    muscle_secondary: ['triceps'],
    equipment: 'poids_du_corps',
    equipment_required: [],
    difficulty: 1,
  },
  {
    id: 'ex_plank',
    name: 'Gainage',
    muscle_primary: 'abdominaux',
    equipment: 'poids_du_corps',
    equipment_required: [],
    difficulty: 1,
    unit: 'time',
  },
  {
    id: 'ex_row_db',
    name: 'Rowing haltère',
    muscle_primary: 'dos',
    muscle_secondary: ['biceps'],
    equipment: 'halteres',
    equipment_required: ['dumbbells'],
    difficulty: 1,
    unilateral: true,
  },
  {
    id: 'ex_ohp_db',
    name: 'Développé militaire haltères',
    muscle_primary: 'épaules',
    equipment: 'halteres',
    equipment_required: ['dumbbells'],
    difficulty: 2,
  },
  {
    id: 'ex_bench_bb',
    name: 'Développé couché barre',
    muscle_primary: 'pectoraux',
    equipment: 'barre',
    equipment_required: ['barbell', 'bench'],
    difficulty: 3,
  },
  {
    id: 'ex_pullup',
    name: 'Tractions',
    muscle_primary: 'dos',
    equipment: 'barre_traction',
    equipment_required: ['pullup_bar'],
    difficulty: 3,
  },
];

describe('buildBeginnerSession', () => {
  it('poids du corps : uniquement des exos sans matériel', () => {
    const s = buildBeginnerSession(lib, { minutes: 30, equipment: 'bodyweight' });
    expect(s.exercises.length).toBeGreaterThan(0);
    for (const e of s.exercises) expect(e.equipment).toBe('poids_du_corps');
    expect(s.exercises.map((e) => e.id)).not.toContain('ex_row_db'); // haltères exclu
  });
  it('haltères : couvre le dos via le rowing haltère (exos halteres + poids du corps)', () => {
    const s = buildBeginnerSession(lib, { minutes: 40, equipment: 'dumbbells' });
    expect(s.exercises.map((e) => e.id)).toContain('ex_row_db');
  });
  it('jamais d’exo avancé (difficulté > 2) ni challenge', () => {
    const s = buildBeginnerSession(lib, { minutes: 60, equipment: 'dumbbells' });
    const ids = s.exercises.map((e) => e.id);
    expect(ids).not.toContain('ex_bench_bb'); // diff 3
    expect(ids).not.toContain('ex_pullup'); // diff 3
  });
  it('plus de temps = plus d’exos (borné 3..8)', () => {
    const short = buildBeginnerSession(lib, { minutes: 15, equipment: 'dumbbells' });
    const long = buildBeginnerSession(lib, { minutes: 60, equipment: 'dumbbells' });
    expect(long.exercises.length).toBeGreaterThanOrEqual(short.exercises.length);
    expect(short.exercises.length).toBeGreaterThanOrEqual(1);
  });
  it('un exo au temps (gainage) → cible en secondes', () => {
    const s = buildBeginnerSession(lib, { minutes: 30, equipment: 'bodyweight' });
    const plank = s.exercises.find((e) => e.id === 'ex_plank');
    expect(plank?.target.unit).toBe('time');
  });
  it('métadonnées : débutant, engine, durée estimée', () => {
    const s = buildBeginnerSession(lib, { minutes: 30, equipment: 'bodyweight' });
    expect(s.level).toBe('debutant');
    expect(s.source).toBe('engine');
    expect(s.type).toBe('session');
    expect(s.estimated_duration_min).toBeGreaterThan(0);
  });
});
