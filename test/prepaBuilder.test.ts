import { describe, it, expect } from 'vitest';
import { buildPrepaSession, type PrepaExerciseDef } from '@/lib/prepaBuilder';
import type { Profile } from '@/lib/types';

const LIB: PrepaExerciseDef[] = [
  {
    id: 'act1',
    name: 'Cercles bras',
    muscle_primary: 'épaules',
    equipment: 'poids_du_corps',
    equipment_required: [],
    difficulty: 1,
    unit: 'time',
    unilateral: false,
    tags: ['tennis', 'activation'],
  },
  {
    id: 'plyo1',
    name: 'Squats sautés',
    muscle_primary: 'quadriceps',
    equipment: 'poids_du_corps',
    equipment_required: [],
    difficulty: 2,
    unit: 'reps',
    unilateral: false,
    tags: ['tennis', 'pliometrie'],
  },
  {
    id: 'agi1',
    name: 'Pas chassés',
    muscle_primary: 'quadriceps',
    equipment: 'poids_du_corps',
    equipment_required: [],
    difficulty: 1,
    unit: 'time',
    unilateral: false,
    tags: ['tennis', 'agilite'],
  },
  {
    id: 'gain1',
    name: 'Gainage latéral',
    muscle_primary: 'abdominaux',
    equipment: 'poids_du_corps',
    equipment_required: [],
    difficulty: 1,
    unit: 'time',
    unilateral: true,
    tags: ['tennis', 'gainage'],
  },
  {
    id: 'pallof',
    name: 'Pallof',
    muscle_primary: 'abdominaux',
    equipment: 'bands',
    equipment_required: ['bands'],
    difficulty: 2,
    unit: 'time',
    unilateral: true,
    tags: ['tennis', 'rotation', 'gainage'],
  },
  {
    id: 'force1',
    name: 'SDT unijambe',
    muscle_primary: 'ischio-jambiers',
    equipment: 'poids_du_corps',
    equipment_required: [],
    difficulty: 2,
    unit: 'reps',
    unilateral: true,
    tags: ['tennis', 'force'],
  },
];

function profile(over: Partial<Profile> = {}): Profile {
  return {
    schema_version: '1.0',
    type: 'profile',
    identity: { name: 'T' },
    experience: { level: 'intermediaire' },
    objective: 'remise_en_forme',
    availability: { sessions_per_week: 3 },
    equipment: 'poids_du_corps',
    available_equipment: [],
    ...over,
  };
}

describe('buildPrepaSession', () => {
  it('null si bibliothèque vide', () => {
    expect(buildPrepaSession(profile(), [])).toBeNull();
  });

  it('génère une séance de prépa (discipline + source)', () => {
    const s = buildPrepaSession(profile(), LIB, { duration_min: 30 })!;
    expect(s.discipline).toBe('prepa_physique');
    expect(s.source).toBe('engine');
    expect(s.exercises.length).toBeGreaterThanOrEqual(3);
  });

  it('commence par une activation', () => {
    const s = buildPrepaSession(profile(), LIB, { duration_min: 30 })!;
    expect(s.exercises[0]!.id).toBe('act1');
  });

  it('exclut le Pallof sans élastique, l’inclut avec', () => {
    const sans = buildPrepaSession(profile(), LIB, { duration_min: 45 })!;
    expect(sans.exercises.some((e) => e.id === 'pallof')).toBe(false);
    const avec = buildPrepaSession(profile({ available_equipment: ['bands'] }), LIB, {
      duration_min: 45,
    })!;
    expect(avec.exercises.some((e) => e.id === 'pallof')).toBe(true);
  });

  it('pas de doublon d’exercice', () => {
    const s = buildPrepaSession(profile(), LIB, { duration_min: 45 })!;
    const ids = s.exercises.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('les exos au temps sont en secondes (≥ 20)', () => {
    const s = buildPrepaSession(profile(), LIB, { duration_min: 45 })!;
    for (const e of s.exercises) {
      if (e.target.unit === 'time') expect(e.target.reps_min).toBeGreaterThanOrEqual(20);
    }
  });
});
