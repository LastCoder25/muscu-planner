// 🪜 Variantes de planche (migration 0121) et échelle de difficulté. Le test lit la migration ET le
// client : une variante sans consigne, hors famille, hors échelle ou mal rangée se verrait au premier
// tirage, pas à la compilation.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMBO_SLOTS, variantFamilyKey } from '@/data/combo';
import { exerciseImage } from '@/data/exerciseImages';
import { exerciseInstructions } from '@/data/exerciseInstructions';
import {
  EXERCISE_LADDERS,
  LADDER_DOWN_SECS,
  LADDER_UP_SECS,
  ladderAdvice,
  ladderPosition,
} from '@/lib/exerciseLadder';

const sql = readFileSync(
  new URL('../supabase/migrations/0121_variantes_planche.sql', import.meta.url),
  'utf8',
);
const row = (id: string) => sql.split('\n').find((l) => l.includes(`('${id}'`)) ?? '';

const NEW_IDS = [
  'ex_plank_knees',
  'ex_plank_high',
  'ex_plank_feet',
  'ex_plank_long',
  'ex_plank_high_long',
  'ex_plank_side_hand',
];

describe('migration 0121', () => {
  it('6 lignes, au temps, abdominaux, sans muscle secondaire, écartées des programmes générés', () => {
    expect(sql.match(/^ {2}\('ex_/gm)?.length).toBe(6);
    for (const id of NEW_IDS) {
      const r = row(id);
      expect(r, id).toContain("'abdominaux', '{}'"); // muscle principal + secondaire vide
      expect(r, id).toContain("'time'");
      expect(r, id).toContain("'musculation', '{variante}'");
    }
  });
  it('seule la planche pieds surélevés exige du matériel (un banc) ; la latérale sur la main est unilatérale', () => {
    expect(row('ex_plank_feet')).toContain('{bench}');
    for (const id of NEW_IDS.filter((i) => i !== 'ex_plank_feet'))
      expect(row(id), id).toContain("'poids_du_corps', '{}'");
    expect(row('ex_plank_side_hand')).toContain("'time', true");
    expect(row('ex_plank_long')).toContain("'time', false");
  });
  it('difficulté croissante avec le levier', () => {
    const d = (id: string) => Number(/'poids_du_corps', '\{[^}]*\}', (\d),/.exec(row(id))?.[1]);
    expect(d('ex_plank_knees')).toBe(1);
    expect(d('ex_plank_long')).toBeGreaterThan(d('ex_plank_knees'));
    expect(d('ex_plank_high_long')).toBeGreaterThan(d('ex_plank_long'));
  });
});

describe('client', () => {
  it('toutes rangées dans l’emplacement Gainage du Défi 360 et dans la famille de la planche', () => {
    expect(COMBO_SLOTS.find((s) => s.muscles.includes('abdominaux'))?.key).toBe('core');
    for (const id of NEW_IDS) expect(variantFamilyKey(id), id).toBe(variantFamilyKey('ex_plank'));
  });
  it('chacune a ses consignes, et aucune image (l’icône vaut mieux qu’une photo fausse)', () => {
    for (const id of NEW_IDS) {
      const g = exerciseInstructions(id);
      expect(g?.steps.length, id).toBeGreaterThanOrEqual(3);
      expect(g?.tip, id).toBeTruthy();
      expect(exerciseImage(id), id).toBeUndefined();
    }
  });
});

describe('échelle de difficulté', () => {
  it('chaque exo de l’échelle existe en base ou dans la migration, une seule fois par échelle', () => {
    for (const rungs of EXERCISE_LADDERS) {
      const ids = rungs.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids)
        expect(id === 'ex_plank' || id === 'ex_plank_side' || !!row(id), id).toBe(true);
    }
    // Les 6 nouvelles sont toutes sur une échelle.
    for (const id of NEW_IDS) expect(ladderPosition(id), id).not.toBeNull();
  });
  it('position : cran, précédent, suivant ; aux extrémités, pas de voisin', () => {
    const base = ladderPosition('ex_plank');
    expect(base?.prev?.id).toBe('ex_plank_high');
    expect(base?.next?.id).toBe('ex_plank_feet');
    expect(ladderPosition('ex_plank_knees')?.prev).toBeNull();
    expect(ladderPosition('ex_plank_high_long')?.next).toBeNull();
    expect(ladderPosition('ex_curl_hold')).toBeNull();
    expect(ladderPosition(null)).toBeNull();
  });
  it('conseil : ≥ 60 s → cran suivant, < 20 s → cran précédent, entre les deux rien', () => {
    expect(ladderAdvice('ex_plank', LADDER_UP_SECS)).toEqual({
      kind: 'up',
      to: { id: 'ex_plank_feet', label: 'Pieds hauts' },
      best: 60,
    });
    expect(ladderAdvice('ex_plank', LADDER_UP_SECS - 1)).toBeNull();
    expect(ladderAdvice('ex_plank', LADDER_DOWN_SECS)).toBeNull();
    expect(ladderAdvice('ex_plank', LADDER_DOWN_SECS - 1)?.kind).toBe('down');
    expect(ladderAdvice('ex_plank', 15)?.to.id).toBe('ex_plank_high');
  });
  it('conseil : rien sans temps tenu, rien au-delà des extrémités, rien hors échelle', () => {
    expect(ladderAdvice('ex_plank', 0)).toBeNull();
    expect(ladderAdvice('ex_plank', null)).toBeNull();
    expect(ladderAdvice('ex_plank_high_long', 120)).toBeNull(); // déjà le plus dur
    expect(ladderAdvice('ex_plank_knees', 5)).toBeNull(); // déjà le plus facile
    expect(ladderAdvice('ex_curl_hold', 90)).toBeNull();
  });
});
