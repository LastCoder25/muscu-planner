import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exerciseFrames, exerciseImage } from '@/data/exerciseImages';

// Les ids viennent du fichier source lui-même : un test qui recopierait la liste
// passerait au vert le jour où l'on ajoute un exo mal branché.
const SRC = readFileSync(resolve(__dirname, '../src/data/exerciseImages.ts'), 'utf8');
const IDS = [...SRC.matchAll(/^\s+(ex_\w+):\s*'\/exercises\//gm)].map((m) => m[1]!);
const onDisk = (url: string) => existsSync(resolve(__dirname, '../public' + url));

describe('illustrations d’exercices', () => {
  it('le fichier source déclare des illustrations', () => {
    expect(IDS.length).toBeGreaterThan(80);
  });

  it('chaque image référencée existe dans public/exercises', () => {
    const missing = IDS.filter((id) => !onDisk(exerciseImage(id)!));
    expect(missing).toEqual([]);
  });

  it('chaque animation a ses DEUX poses sur disque (sinon la bascule montre une image cassée)', () => {
    const broken = IDS.filter((id) => {
      const f = exerciseFrames(id);
      return f && !(onDisk(f[0]) && onDisk(f[1]));
    });
    expect(broken).toEqual([]);
  });

  it('les exos tennis solo ajoutés en v0.844 sont animés', () => {
    for (const id of [
      'ex_tn_tuck_jump',
      'ex_tn_single_leg_hop',
      'ex_tn_box_jump',
      'ex_tn_line_hops',
      'ex_tn_plank',
      'ex_tn_dead_bug',
      'ex_tn_reverse_lunge',
      'ex_tn_single_leg_calf',
      'ex_tn_band_external_rotation',
      'ex_tn_band_internal_rotation',
      'ex_tn_ytw',
      'ex_tn_wrist_curl',
      'ex_pp_leg_swings',
    ])
      expect(exerciseFrames(id), id).toBeDefined();
  });
  it('🧩 la barre EZ et les variantes d’exercices fidèles sont animées', () => {
    for (const id of [
      'ex_curl_ez',
      'ex_curl_reverse_ez',
      'ex_skullcrusher_ez',
      'ex_close_bench_ez',
      'ex_pushup_incline',
      'ex_pushup_decline',
      'ex_pushup_wide',
      'ex_dips_bench',
      'ex_lunge_walking',
      'ex_glute_bridge_single',
      'ex_hip_thrust',
      'ex_curl_concentration',
      'ex_curl_incline',
      'ex_curl_preacher_ez',
      'ex_arnold_press',
      'ex_lateral_raise_band',
      'ex_row_bent_supinated',
      'ex_upright_row',
      'ex_pullover_db',
      'ex_plank_side',
      'ex_dead_bug',
      'ex_bicycle_crunch',
      'ex_leg_raise_floor',
      'ex_chinup',
      'ex_pullup_neutral',
      'ex_pullup_wide',
    ])
      expect(exerciseFrames(id), id).toBeDefined();
  });
  it('🧩 variantes sans bon cliché : l’icône vaut mieux qu’une image fausse', () => {
    for (const id of [
      'ex_pushup_archer',
      'ex_squat_bulgarian',
      'ex_squat_pistol_assisted',
      'ex_squat_sumo',
      'ex_lunge_reverse',
      'ex_calf_raise_single',
      'ex_rdl_single',
    ])
      expect(exerciseImage(id), id).toBeUndefined();
  });
  it('pas d’image vaut mieux qu’une image fausse : ces exos n’ont pas de bon cliché', () => {
    // Tricep pushdown ≠ extension au-dessus de la tête, pompes pike ≠ pompes en poirier, rotation
    // élastique ≠ Pallof press. Les remettre exige une photo du BON mouvement.
    for (const id of ['ex_band_pushdown', 'ex_pike_pushup', 'ex_tn_band_forehand'])
      expect(exerciseImage(id), id).toBeUndefined();
  });
});
