// Patterns de mouvement pour l'animation d'exécution (src/components/ExerciseAnim.vue).
// Chaque pattern = un ancrage + deux poses (départ/repos → effort/contraction) que le
// composant interpole en ping-pong. Les 47 exos de la biblio pointent vers un pattern ;
// tout autre exo (prépa/cardio/challenge) retombe sur un pattern par muscle.
import type { Anchor, Pose } from '@/lib/figure';

// Accessoire tenu dans les mains (le mobilier — banc/siège/barres — est déduit de l'ancrage).
export type PropKind = 'none' | 'barbell' | 'dumbbell' | 'bar';

export interface Pattern {
  anchor: Anchor;
  a: Pose; // départ / haut / repos
  b: Pose; // effort / bas / contraction
  prop: PropKind;
  period?: number; // durée d'un aller (ms), défaut 900
}

// ── Catalogue de patterns ────────────────────────────────────────────────
export const PATTERNS: Record<string, Pattern> = {
  squat: {
    anchor: 'stand',
    prop: 'barbell',
    a: { torso: 8, shoulder: 150, elbow: 150, hip: 3, knee: 1 },
    b: { torso: 30, shoulder: 150, elbow: 150, hip: 74, knee: -30 },
  },
  hinge: {
    anchor: 'stand',
    prop: 'barbell',
    a: { torso: 6, shoulder: 6, elbow: 6, hip: 3, knee: 1 },
    b: { torso: 70, shoulder: 4, elbow: 4, hip: -16, knee: 10 },
  },
  lunge: {
    anchor: 'stand',
    prop: 'none',
    a: { torso: 6, shoulder: 8, elbow: 8, hip: 3, knee: 1 },
    b: { torso: 10, shoulder: 8, elbow: 8, hip: 55, knee: -55 },
  },
  calf_raise: {
    anchor: 'stand',
    prop: 'none',
    a: { torso: 4, shoulder: 6, elbow: 6, hip: 2, knee: 0 },
    b: { torso: 4, shoulder: 6, elbow: 6, hip: 2, knee: 0, rise: 7 },
    period: 650,
  },
  bench_press: {
    anchor: 'supine',
    prop: 'barbell',
    a: { torso: 0, shoulder: -90, elbow: -48, hip: 55, knee: 100 },
    b: { torso: 0, shoulder: -90, elbow: -90, hip: 55, knee: 100 },
  },
  chest_fly: {
    anchor: 'supine',
    prop: 'dumbbell',
    a: { torso: 0, shoulder: -55, elbow: -55, hip: 55, knee: 100 },
    b: { torso: 0, shoulder: -90, elbow: -86, hip: 55, knee: 100 },
  },
  overhead_press: {
    anchor: 'stand',
    prop: 'barbell',
    a: { torso: 4, shoulder: 120, elbow: 176, hip: 2, knee: 0 },
    b: { torso: 3, shoulder: 172, elbow: 178, hip: 2, knee: 0 },
  },
  lateral_raise: {
    anchor: 'stand',
    prop: 'dumbbell',
    a: { torso: 4, shoulder: 8, elbow: 10, hip: 2, knee: 0 },
    b: { torso: 4, shoulder: 92, elbow: 96, hip: 2, knee: 0 },
  },
  curl: {
    anchor: 'stand',
    prop: 'dumbbell',
    a: { torso: 5, shoulder: 8, elbow: 10, hip: 2, knee: 0 },
    b: { torso: 5, shoulder: 12, elbow: 150, hip: 2, knee: 0 },
  },
  triceps_ext: {
    anchor: 'stand',
    prop: 'none',
    a: { torso: 6, shoulder: 8, elbow: 150, hip: 2, knee: 0 },
    b: { torso: 6, shoulder: 8, elbow: 8, hip: 2, knee: 0 },
  },
  skullcrusher: {
    anchor: 'supine',
    prop: 'barbell',
    a: { torso: 0, shoulder: -90, elbow: -140, hip: 55, knee: 100 },
    b: { torso: 0, shoulder: -90, elbow: -90, hip: 55, knee: 100 },
  },
  pushup: {
    anchor: 'prone',
    prop: 'none',
    a: { torso: 0, shoulder: 90, elbow: 90, hip: 0, knee: 0 },
    b: { torso: -6, shoulder: 90, elbow: 120, hip: 0, knee: 0, rise: -9 },
  },
  plank: {
    anchor: 'prone',
    prop: 'none',
    a: { torso: 0, shoulder: 90, elbow: 90, hip: 0, knee: 0 },
    b: { torso: 0, shoulder: 90, elbow: 90, hip: 0, knee: 0, rise: -2 },
    period: 1400,
  },
  dip: {
    anchor: 'dip',
    prop: 'none',
    a: { torso: 12, shoulder: -6, elbow: -6, hip: -40, knee: -120 },
    b: { torso: 16, shoulder: -6, elbow: -42, hip: -40, knee: -120, rise: -8 },
  },
  pullup: {
    anchor: 'hang',
    prop: 'bar',
    a: { torso: 4, shoulder: 176, elbow: 178, hip: 8, knee: 24 },
    b: { torso: 6, shoulder: 150, elbow: 152, hip: 10, knee: 30 },
  },
  row_bent: {
    anchor: 'stand',
    prop: 'barbell',
    a: { torso: 55, shoulder: 4, elbow: 4, hip: 2, knee: 6 },
    b: { torso: 55, shoulder: -34, elbow: 24, hip: 2, knee: 6 },
  },
  leg_curl: {
    anchor: 'prone',
    prop: 'none',
    a: { torso: 0, shoulder: 180, elbow: 180, hip: 0, knee: 0 },
    b: { torso: 0, shoulder: 180, elbow: 180, hip: 0, knee: -80 },
  },
  leg_extension: {
    anchor: 'seated',
    prop: 'none',
    a: { torso: 6, shoulder: 40, elbow: 40, hip: 90, knee: -80 },
    b: { torso: 6, shoulder: 40, elbow: 40, hip: 90, knee: 8 },
  },
  glute_bridge: {
    anchor: 'supine',
    prop: 'none',
    a: { torso: 0, shoulder: 92, elbow: 92, hip: 120, knee: 55 },
    b: { torso: 0, shoulder: 92, elbow: 92, hip: 120, knee: 55, rise: 8 },
  },
  superman: {
    anchor: 'prone',
    prop: 'none',
    a: { torso: 0, shoulder: 180, elbow: 180, hip: 0, knee: 0 },
    b: { torso: 0, shoulder: 168, elbow: 168, hip: -12, knee: -8 },
    period: 1100,
  },
  hanging_leg_raise: {
    anchor: 'hang',
    prop: 'bar',
    a: { torso: 4, shoulder: 178, elbow: 178, hip: 6, knee: 8 },
    b: { torso: 4, shoulder: 178, elbow: 178, hip: 88, knee: 92 },
  },
};

// ── Mapping des exos de la biblio (47) → pattern ─────────────────────────
export const EXERCISE_PATTERN: Record<string, string> = {
  // Quadriceps / jambes
  ex_bw_squat: 'squat',
  ex_squat_barbell: 'squat',
  ex_band_squat: 'squat',
  ex_kb_goblet_squat: 'squat',
  ex_leg_press: 'squat',
  ex_bw_lunge: 'lunge',
  ex_leg_extension: 'leg_extension',
  // Ischios / charnière
  ex_romanian_deadlift: 'hinge',
  ex_kb_swing: 'hinge',
  ex_leg_curl: 'leg_curl',
  ex_glute_bridge: 'glute_bridge',
  // Mollets
  ex_calf_raise: 'calf_raise',
  ex_calf_raise_bw: 'calf_raise',
  // Pectoraux
  ex_bench_barbell: 'bench_press',
  ex_bench_dumbbell: 'bench_press',
  ex_incline_dumbbell: 'bench_press',
  ex_incline_machine: 'bench_press',
  ex_chest_fly_cable: 'chest_fly',
  ex_pec_deck: 'chest_fly',
  ex_pushup: 'pushup',
  ex_diamond_pushup: 'pushup',
  ex_dips: 'dip',
  ex_dips_assisted: 'dip',
  // Épaules
  ex_ohp_barbell: 'overhead_press',
  ex_shoulder_press_db: 'overhead_press',
  ex_kb_press: 'overhead_press',
  ex_pike_pushup: 'pushup',
  ex_lateral_raise: 'lateral_raise',
  ex_band_pull_apart: 'lateral_raise',
  ex_face_pull: 'lateral_raise',
  // Dos
  ex_pullup: 'pullup',
  ex_pullup_assisted: 'pullup',
  ex_lat_pulldown: 'pullup',
  ex_row_barbell: 'row_bent',
  ex_row_dumbbell: 'row_bent',
  ex_kb_row: 'row_bent',
  ex_band_row: 'row_bent',
  ex_seated_row: 'row_bent',
  ex_superman: 'superman',
  // Biceps
  ex_curl_barbell: 'curl',
  ex_curl_dumbbell: 'curl',
  ex_band_curl: 'curl',
  // Triceps
  ex_triceps_pushdown: 'triceps_ext',
  ex_band_pushdown: 'triceps_ext',
  ex_skullcrusher: 'skullcrusher',
  // Abdos
  ex_plank: 'plank',
  ex_hanging_leg_raise: 'hanging_leg_raise',
};

// Fallback par muscle_primary (exos prépa/cardio/challenge non mappés).
const MUSCLE_PATTERN: Record<string, string> = {
  pectoraux: 'pushup',
  dos: 'row_bent',
  épaules: 'overhead_press',
  biceps: 'curl',
  triceps: 'triceps_ext',
  quadriceps: 'squat',
  'ischio-jambiers': 'hinge',
  fessiers: 'glute_bridge',
  mollets: 'calf_raise',
  abdominaux: 'plank',
  lombaires: 'superman',
};

/** Clé de pattern pour un exo (id d'abord, muscle en secours) ; null si rien. */
export function patternKeyFor(id: string, muscle?: string | null): string | null {
  return EXERCISE_PATTERN[id] ?? (muscle ? (MUSCLE_PATTERN[muscle] ?? null) : null);
}

export function patternFor(id: string, muscle?: string | null): Pattern | null {
  const key = patternKeyFor(id, muscle);
  return key ? (PATTERNS[key] ?? null) : null;
}
