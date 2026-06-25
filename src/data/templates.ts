// templates.ts — programmes prêts à l'emploi pour débutants.
// Les ids d'exos référencent la bibliothèque (supabase/seed.sql).
// À l'insertion, l'app assigne un nouvel id + user_id (les templates ici n'ont pas de user).
import type { Session, Level } from './../lib/types';
import { SCHEMA_VERSION } from './../lib/types';

type Template = Omit<Session, 'id'> & { template_id: string; min_sessions_per_week: number };

// Full-Body débutant, progression linéaire, 3 séries, focus polyarticulaire.
export const TEMPLATES: Template[] = [
  {
    template_id: 'fb_beginner_a',
    schema_version: SCHEMA_VERSION,
    type: 'session',
    name: 'Full-Body A',
    split: 'full_body',
    objective: 'remise_en_forme',
    level: 'debutant',
    estimated_duration_min: 50,
    source: 'template',
    min_sessions_per_week: 2,
    exercises: [
      ex('ex_squat_barbell', 'Squat barre', 'quadriceps', 'barre', 3, 8, 10, 20),
      ex('ex_bench_dumbbell', 'Développé couché haltères', 'pectoraux', 'halteres', 3, 8, 10, 12),
      ex('ex_seated_row', 'Tirage horizontal', 'dos', 'machine', 3, 10, 12, 25),
      ex('ex_shoulder_press_db', 'Développé épaules haltères', 'épaules', 'halteres', 3, 10, 12, 8),
      ex('ex_leg_curl', 'Leg curl', 'ischio-jambiers', 'machine', 3, 10, 12, 20),
      core('ex_plank', 'Gainage'),
    ],
  },
  {
    template_id: 'fb_beginner_b',
    schema_version: SCHEMA_VERSION,
    type: 'session',
    name: 'Full-Body B',
    split: 'full_body',
    objective: 'remise_en_forme',
    level: 'debutant',
    estimated_duration_min: 50,
    source: 'template',
    min_sessions_per_week: 2,
    exercises: [
      ex('ex_leg_press', 'Presse à cuisses', 'quadriceps', 'machine', 3, 10, 12, 40),
      ex('ex_incline_machine', 'Développé incliné machine', 'pectoraux', 'machine', 3, 8, 10, 20),
      ex('ex_lat_pulldown', 'Tirage vertical', 'dos', 'machine', 3, 10, 12, 30),
      ex('ex_lateral_raise', 'Élévations latérales', 'épaules', 'halteres', 3, 12, 15, 6),
      ex('ex_romanian_deadlift', 'Soulevé de terre roumain', 'ischio-jambiers', 'barre', 3, 8, 10, 30),
      core('ex_hanging_leg_raise', 'Relevé de jambes suspendu'),
    ],
  },
  {
    template_id: 'fb_beginner_c',
    schema_version: SCHEMA_VERSION,
    type: 'session',
    name: 'Full-Body C',
    split: 'full_body',
    objective: 'remise_en_forme',
    level: 'debutant',
    estimated_duration_min: 50,
    source: 'template',
    min_sessions_per_week: 3,
    exercises: [
      ex('ex_squat_barbell', 'Squat barre', 'quadriceps', 'barre', 3, 8, 10, 20),
      ex('ex_pushup', 'Pompes', 'pectoraux', 'poids_du_corps', 3, 8, 12, 0),
      ex('ex_row_dumbbell', 'Rowing haltère', 'dos', 'halteres', 3, 10, 12, 14),
      ex('ex_curl_dumbbell', 'Curl haltères', 'biceps', 'halteres', 3, 10, 12, 8),
      ex('ex_triceps_pushdown', 'Extension triceps poulie', 'triceps', 'poulie', 3, 12, 15, 20),
      ex('ex_calf_raise', 'Mollets debout', 'mollets', 'machine', 3, 12, 15, 40),
    ],
  },
];

/** Matcher déterministe : choisit les templates selon les dispos (extensible). */
export function suggestTemplates(level: Level, sessionsPerWeek: number): Template[] {
  if (level !== 'debutant') return [];
  return TEMPLATES.filter((t) => t.min_sessions_per_week <= sessionsPerWeek);
}

// helpers ──────────────────────────────────────────────
function ex(
  id: string, name: string, muscle: string, equipment: string,
  sets: number, repsMin: number, repsMax: number, loadKg: number,
) {
  return {
    id, name, muscle_primary: muscle, equipment,
    progression: 'linear' as const, rest_seconds: 120,
    target: { sets, reps_min: repsMin, reps_max: repsMax, load_kg: loadKg },
  };
}
function core(id: string, name: string) {
  return {
    id, name, muscle_primary: 'abdominaux', equipment: 'poids_du_corps',
    progression: 'fixed' as const, rest_seconds: 60,
    target: { sets: 3, reps_min: 30, reps_max: 60, load: 'bodyweight' as const },
  };
}
