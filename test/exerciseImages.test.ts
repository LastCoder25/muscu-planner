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
      'ex_tn_band_forehand',
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
});
