// Génère les 2 poses (départ/fin) de chaque exo depuis free-exercise-db
// (domaine public / Unlicense) → public/exercises/<id>.jpg (pose 0) + <id>-1.jpg (pose 1).
// Usage : node scripts/fetch-exercise-frames.mjs
// Ces images animent l'exécution (bascule 0↔1) via src/components/ExerciseAnim.vue.
import { writeFileSync, mkdirSync } from 'node:fs';
const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
// exo interne → dossier source (free-exercise-db)
const MAP = {
  "ex_band_curl": "Close-Grip_EZ-Bar_Curl_with_Band",
  "ex_band_pull_apart": "Band_Pull_Apart",
  "ex_band_pushdown": "Speed_Band_Overhead_Triceps",
  "ex_band_row": "Seated_Cable_Rows",
  "ex_band_squat": "Squats_-_With_Bands",
  "ex_bench_barbell": "Barbell_Bench_Press_-_Medium_Grip",
  "ex_bench_dumbbell": "Dumbbell_Bench_Press",
  "ex_bw_lunge": "Bodyweight_Walking_Lunge",
  "ex_bw_squat": "Bodyweight_Squat",
  "ex_calf_raise": "Standing_Calf_Raises",
  "ex_calf_raise_bw": "Rocking_Standing_Calf_Raise",
  "ex_chest_fly_cable": "Flat_Bench_Cable_Flyes",
  "ex_curl_barbell": "Barbell_Curl",
  "ex_curl_dumbbell": "Dumbbell_Alternate_Bicep_Curl",
  "ex_diamond_pushup": "Close-Grip_Push-Up_off_of_a_Dumbbell",
  "ex_dips": "Dips_-_Triceps_Version",
  "ex_dips_assisted": "Dip_Machine",
  "ex_face_pull": "Face_Pull",
  "ex_glute_bridge": "Single_Leg_Glute_Bridge",
  "ex_hanging_leg_raise": "Hanging_Leg_Raise",
  "ex_incline_dumbbell": "Incline_Dumbbell_Press",
  "ex_incline_machine": "Leverage_Incline_Chest_Press",
  "ex_kb_goblet_squat": "Goblet_Squat",
  "ex_kb_press": "Alternating_Kettlebell_Press",
  "ex_kb_row": "Alternating_Kettlebell_Row",
  "ex_kb_swing": "One-Arm_Kettlebell_Swings",
  "ex_lat_pulldown": "Wide-Grip_Lat_Pulldown",
  "ex_lateral_raise": "Seated_Side_Lateral_Raise",
  "ex_leg_curl": "Lying_Leg_Curls",
  "ex_leg_extension": "Leg_Extensions",
  "ex_leg_press": "Leg_Press",
  "ex_ohp_barbell": "Standing_Military_Press",
  "ex_pec_deck": "Butterfly",
  "ex_pike_pushup": "Handstand_Push-Ups",
  "ex_plank": "Plank",
  "ex_pullup": "Pullups",
  "ex_pullup_assisted": "Band_Assisted_Pull-Up",
  "ex_pushup": "Pushups",
  "ex_romanian_deadlift": "Romanian_Deadlift",
  "ex_row_barbell": "Bent_Over_Barbell_Row",
  "ex_row_dumbbell": "One-Arm_Dumbbell_Row",
  "ex_seated_row": "Seated_Cable_Rows",
  "ex_shoulder_press_db": "Dumbbell_One-Arm_Shoulder_Press",
  "ex_skullcrusher": "Lying_Close-Grip_Barbell_Triceps_Extension_Behind_The_Head",
  "ex_squat_barbell": "Barbell_Full_Squat",
  "ex_superman": "Superman",
  "ex_triceps_pushdown": "Reverse_Grip_Triceps_Pushdown",
  "ex_crunch": "Cross-Body_Crunch",
  "ex_mountain_climbers": "Mountain_Climbers",
  "ex_squat_jump": "Freehand_Jump_Squat",
  "ex_abductors": "Thigh_Abductor",
  "ex_adductors": "Thigh_Adductor",
  "ex_glute_machine": "Glute_Kickback",
  "ex_pp_arm_circles": "Arm_Circles",
  "ex_pp_broad_jump": "Standing_Long_Jump",
  "ex_pp_lateral_bound": "Lateral_Bound",
  "ex_pp_medball_rot_throw": "Standing_Cable_Wood_Chop",
  "ex_pp_medball_slam": "Overhead_Slam",
  "ex_pp_pallof_press": "Pallof_Press",
  "ex_pp_russian_twist": "Russian_Twist",
  "ex_pp_side_plank": "Side_Bridge",
  "ex_pp_squat_jump": "Freehand_Jump_Squat"
};
mkdirSync('public/exercises', { recursive: true });
let ok = 0, fail = 0;
for (const [id, src] of Object.entries(MAP)) {
  for (const [frame, out] of [[0, id + '.jpg'], [1, id + '-1.jpg']]) {
    try {
      const r = await fetch(BASE + src + '/' + frame + '.jpg');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync('public/exercises/' + out, buf);
      ok++;
    } catch (e) {
      console.log('FAIL', id, frame, src, e.message);
      fail++;
    }
  }
}
console.log('done — ok', ok, 'fail', fail);
