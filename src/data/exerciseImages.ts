// Généré : illustrations d'exercices (free-exercise-db, domaine public / Unlicense).
// Mappées sur nos exos ; bundlées dans public/exercises/. Voir scripts de génération.
export const EXERCISE_IMAGES: Record<string, string> = {
  ex_band_curl: '/exercises/ex_band_curl.jpg',
  ex_band_pull_apart: '/exercises/ex_band_pull_apart.jpg',
  ex_band_pushdown: '/exercises/ex_band_pushdown.jpg',
  ex_band_row: '/exercises/ex_band_row.jpg',
  ex_band_squat: '/exercises/ex_band_squat.jpg',
  ex_bench_barbell: '/exercises/ex_bench_barbell.jpg',
  ex_bench_dumbbell: '/exercises/ex_bench_dumbbell.jpg',
  ex_bw_lunge: '/exercises/ex_bw_lunge.jpg',
  ex_bw_squat: '/exercises/ex_bw_squat.jpg',
  ex_calf_raise: '/exercises/ex_calf_raise.jpg',
  ex_calf_raise_bw: '/exercises/ex_calf_raise_bw.jpg',
  ex_chest_fly_cable: '/exercises/ex_chest_fly_cable.jpg',
  ex_curl_barbell: '/exercises/ex_curl_barbell.jpg',
  ex_curl_dumbbell: '/exercises/ex_curl_dumbbell.jpg',
  ex_diamond_pushup: '/exercises/ex_diamond_pushup.jpg',
  ex_dips: '/exercises/ex_dips.jpg',
  ex_dips_assisted: '/exercises/ex_dips_assisted.jpg',
  ex_face_pull: '/exercises/ex_face_pull.jpg',
  ex_glute_bridge: '/exercises/ex_glute_bridge.jpg',
  ex_hanging_leg_raise: '/exercises/ex_hanging_leg_raise.jpg',
  ex_incline_dumbbell: '/exercises/ex_incline_dumbbell.jpg',
  ex_incline_machine: '/exercises/ex_incline_machine.jpg',
  ex_kb_goblet_squat: '/exercises/ex_kb_goblet_squat.jpg',
  ex_kb_press: '/exercises/ex_kb_press.jpg',
  ex_kb_row: '/exercises/ex_kb_row.jpg',
  ex_kb_swing: '/exercises/ex_kb_swing.jpg',
  ex_lat_pulldown: '/exercises/ex_lat_pulldown.jpg',
  ex_lateral_raise: '/exercises/ex_lateral_raise.jpg',
  ex_leg_curl: '/exercises/ex_leg_curl.jpg',
  ex_leg_extension: '/exercises/ex_leg_extension.jpg',
  ex_leg_press: '/exercises/ex_leg_press.jpg',
  ex_ohp_barbell: '/exercises/ex_ohp_barbell.jpg',
  ex_pec_deck: '/exercises/ex_pec_deck.jpg',
  ex_pike_pushup: '/exercises/ex_pike_pushup.jpg',
  ex_plank: '/exercises/ex_plank.jpg',
  ex_pullup: '/exercises/ex_pullup.jpg',
  ex_pullup_assisted: '/exercises/ex_pullup_assisted.jpg',
  ex_pushup: '/exercises/ex_pushup.jpg',
  ex_romanian_deadlift: '/exercises/ex_romanian_deadlift.jpg',
  ex_row_barbell: '/exercises/ex_row_barbell.jpg',
  ex_row_dumbbell: '/exercises/ex_row_dumbbell.jpg',
  ex_seated_row: '/exercises/ex_seated_row.jpg',
  ex_shoulder_press_db: '/exercises/ex_shoulder_press_db.jpg',
  ex_skullcrusher: '/exercises/ex_skullcrusher.jpg',
  ex_squat_barbell: '/exercises/ex_squat_barbell.jpg',
  ex_superman: '/exercises/ex_superman.jpg',
  ex_triceps_pushdown: '/exercises/ex_triceps_pushdown.jpg',
  // Conditionnement / challenge + machines + prépa physique (ajout 2026-08).
  ex_crunch: '/exercises/ex_crunch.jpg',
  ex_mountain_climbers: '/exercises/ex_mountain_climbers.jpg',
  ex_squat_jump: '/exercises/ex_squat_jump.jpg',
  ex_abductors: '/exercises/ex_abductors.jpg',
  ex_adductors: '/exercises/ex_adductors.jpg',
  ex_glute_machine: '/exercises/ex_glute_machine.jpg',
  ex_pp_arm_circles: '/exercises/ex_pp_arm_circles.jpg',
  ex_pp_broad_jump: '/exercises/ex_pp_broad_jump.jpg',
  ex_pp_lateral_bound: '/exercises/ex_pp_lateral_bound.jpg',
  ex_pp_medball_rot_throw: '/exercises/ex_pp_medball_rot_throw.jpg',
  ex_pp_medball_slam: '/exercises/ex_pp_medball_slam.jpg',
  ex_pp_pallof_press: '/exercises/ex_pp_pallof_press.jpg',
  ex_pp_russian_twist: '/exercises/ex_pp_russian_twist.jpg',
  ex_pp_side_plank: '/exercises/ex_pp_side_plank.jpg',
  ex_pp_squat_jump: '/exercises/ex_pp_squat_jump.jpg',
};

export function exerciseImage(id: string): string | undefined {
  return EXERCISE_IMAGES[id];
}

// Les 2 poses (départ/fin) d'un exo pour l'animation d'exécution (bascule 0↔1).
// public/exercises/<id>.jpg = pose 0 ; <id>-1.jpg = pose 1 (cf. scripts/fetch-exercise-frames.mjs).
export function exerciseFrames(id: string): [string, string] | undefined {
  const base = EXERCISE_IMAGES[id];
  return base ? [base, base.replace(/\.jpg$/, '-1.jpg')] : undefined;
}
