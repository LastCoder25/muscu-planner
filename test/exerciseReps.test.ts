import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  EXERCISE_REPS,
  OBJECTIVE_SCHEME,
  correctForExercise,
  repRangeForExercise,
} from '@/lib/repScheme';
import { legRepRange, type ComboLeg } from '@/lib/combo';
import type { Objective } from '@/lib/types';

const OBJECTIVES = Object.keys(OBJECTIVE_SCHEME) as Objective[];
const at = (o: Objective, id: string, muscle = 'quadriceps') =>
  repRangeForExercise(o, { time: false, muscle_primary: muscle, id });

describe('EXERCISE_REPS — la fourchette d’un exo au poids du corps', () => {
  it('le conditionnement ne dépend pas de l’objectif (jumping jacks, burpees)', () => {
    for (const o of OBJECTIVES) {
      expect(at(o, 'ex_jumping_jacks')).toEqual({ min: 30, max: 50, rest: 30 });
      expect(at(o, 'ex_burpees')).toEqual({ min: 8, max: 15, rest: 60 });
    }
  });

  it('une corde à sauter n’hérite pas du plancher d’isolation des mollets', () => {
    expect(at('force', 'ex_jump_rope', 'mollets').min).toBe(60);
  });

  it('la pliométrie reste courte, même en endurance', () => {
    expect(at('endurance', 'ex_tn_tuck_jump').max).toBeLessThanOrEqual(8);
  });

  it('les pompes : jamais 4 à 6, mais l’endurance garde sa fourchette longue', () => {
    expect(at('force', 'ex_pushup', 'pectoraux')).toMatchObject({ min: 8, max: 15, rest: 180 });
    expect(at('endurance', 'ex_pushup', 'pectoraux')).toMatchObject({ min: 15, max: 20 });
  });

  it('un exo difficile au poids du corps garde la règle de l’objectif (tractions en force)', () => {
    expect(at('force', 'ex_pullup', 'dos')).toMatchObject({ min: 4, max: 6 });
  });

  it('chaque correction est cohérente (min ≤ max, > 0)', () => {
    for (const [id, c] of Object.entries(EXERCISE_REPS)) {
      const r = c.fixed ?? c.floor!;
      expect(r.min, id).toBeGreaterThan(0);
      expect(r.min, id).toBeLessThanOrEqual(r.max);
      expect(!!c.fixed !== !!c.floor, id).toBe(true);
    }
  });

  it('chaque id de la table existe dans la bibliothèque (migrations)', () => {
    const dir = path.resolve(__dirname, '../supabase');
    const sql = [
      ...fs.readdirSync(path.join(dir, 'migrations')).map((f) => path.join(dir, 'migrations', f)),
      path.join(dir, 'seed.sql'),
    ]
      .filter((f) => fs.existsSync(f))
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n');
    for (const id of Object.keys(EXERCISE_REPS)) expect(sql.includes(`'${id}'`), id).toBe(true);
  });
});

describe('legRepRange — un Défi 360 figé avec une fourchette fausse est corrigé', () => {
  const leg = (exercise_id: string, rep_min: number, rep_max: number): ComboLeg =>
    ({
      slot: 'push',
      exercise_id,
      exercise_name: 'x',
      muscle_primary: 'pectoraux',
      rep_weight: 1,
      target: 10,
      progress: [],
      rep_min,
      rep_max,
    }) as unknown as ComboLeg;

  it('des burpees figés à 4-6 se lisent 8-15', () => {
    expect(legRepRange(leg('ex_burpees', 4, 6), 'force')).toMatchObject({ min: 8, max: 15 });
  });

  it('des pompes figées à 4-6 remontent au plancher', () => {
    expect(legRepRange(leg('ex_pushup', 4, 6), 'force')).toMatchObject({ min: 8, max: 15 });
  });

  it('un exo sans correction garde sa fourchette figée', () => {
    expect(legRepRange(leg('ex_bench_press', 4, 6), 'hypertrophie')).toMatchObject({
      min: 4,
      max: 6,
    });
  });

  it('correctForExercise sans id ne change rien', () => {
    expect(correctForExercise({ min: 4, max: 6, rest: 180 }, null)).toEqual({
      min: 4,
      max: 6,
      rest: 180,
    });
  });
});
