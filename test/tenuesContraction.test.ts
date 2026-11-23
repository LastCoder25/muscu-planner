// 🧱 Tenues de contraction (migration 0120) : 13 exos au temps. Le test lit la migration ET le
// client : une donnée sans image, sans consigne, hors famille ou rangée dans le mauvais emplacement
// du Défi 360 se verrait au premier tirage, pas à la compilation.
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exerciseFrames, exerciseImage } from '@/data/exerciseImages';
import { exerciseInstructions } from '@/data/exerciseInstructions';
import { COMBO_SLOTS, fractionableExercise, variantFamilyKey } from '@/data/combo';
import { holdLoadable } from '@/lib/loadedHold';

const sql = readFileSync(
  new URL('../supabase/migrations/0120_tenues_contraction.sql', import.meta.url),
  'utf8',
);
const row = (id: string) => sql.split('\n').find((l) => l.includes(`('${id}'`)) ?? '';

/** id → [muscle principal, emplacement du 360 attendu]. */
const HOLDS: Record<string, [string, string]> = {
  ex_curl_hold: ['biceps', 'biceps'],
  ex_curl_ez_hold: ['biceps', 'biceps'],
  ex_lateral_raise_hold: ['épaules', 'shoulders'],
  ex_squat_hold: ['quadriceps', 'squat'],
  ex_farmer_hold: ['dos', 'pull'],
  ex_knee_raise_hold: ['abdominaux', 'core'],
  ex_leg_raise_hold: ['abdominaux', 'core'],
  ex_hollow_hold: ['abdominaux', 'core'],
  ex_pushup_hold: ['pectoraux', 'push'],
  ex_chinup_hold: ['dos', 'pull'],
  ex_dead_hang: ['dos', 'pull'],
  ex_calf_raise_hold: ['mollets', 'shoulders'],
  ex_glute_bridge_single_hold: ['ischio-jambiers', 'hinge'],
};
const IDS = Object.keys(HOLDS);

describe('migration 0120', () => {
  it('13 lignes, toutes au temps, écartées des programmes générés, sans muscle secondaire', () => {
    expect(sql.match(/^ {2}\('ex_/gm)?.length).toBe(13);
    for (const id of IDS) {
      const r = row(id);
      expect(r, id).toContain("'time'");
      expect(r, id).toContain("'musculation', '{variante}'");
      expect(r, id).toContain("'{}', '"); // muscle_secondary vide : pas d'XP de plus qu'une planche
    }
  });
  it('rangées par leur muscle principal dans un emplacement du Défi 360', () => {
    for (const [id, [muscle, slot]] of Object.entries(HOLDS)) {
      expect(row(id), id).toContain(`'${muscle}'`);
      expect(COMBO_SLOTS.find((s) => s.muscles.includes(muscle))?.key, id).toBe(slot);
    }
  });
  it('matériel : barre de traction, haltères, barre Z — jamais exigé au-delà du nécessaire', () => {
    expect(row('ex_curl_hold')).toContain('{dumbbells}');
    expect(row('ex_curl_ez_hold')).toContain('{ez_bar}');
    expect(row('ex_lateral_raise_hold')).toContain('{dumbbells}');
    expect(row('ex_farmer_hold')).toContain('{dumbbells}');
    for (const id of ['ex_knee_raise_hold', 'ex_chinup_hold', 'ex_dead_hang']) {
      expect(row(id), id).toContain('{pullup_bar}');
    }
    for (const id of ['ex_squat_hold', 'ex_leg_raise_hold', 'ex_hollow_hold', 'ex_pushup_hold']) {
      expect(row(id), id).toContain("'poids_du_corps', '{}'");
    }
  });
  it('seul le pont à une jambe est unilatéral', () => {
    for (const id of IDS) {
      expect(row(id).includes("'time', true,"), id).toBe(id === 'ex_glute_bridge_single_hold');
    }
  });
  it('rejouable', () => {
    expect(sql).toContain('on conflict (id) do nothing');
  });
});

describe('côté client', () => {
  it('chaque exo a une illustration animée, dont le fichier existe, et une consigne', () => {
    for (const id of IDS) {
      const img = exerciseImage(id);
      expect(img, id).toBeTruthy();
      expect(exerciseFrames(id), id).toBeTruthy();
      expect(existsSync(new URL('../public' + img, import.meta.url)), id).toBe(true);
      expect(exerciseInstructions(id)?.steps.length, id).toBeGreaterThanOrEqual(2);
    }
  });
  it('une tenue est dans la famille de son mouvement (jamais avec sa version en reps)', () => {
    expect(variantFamilyKey('ex_curl_hold')).toBe(variantFamilyKey('ex_curl_dumbbell'));
    expect(variantFamilyKey('ex_curl_ez_hold')).toBe(variantFamilyKey('ex_curl_dumbbell'));
    expect(variantFamilyKey('ex_lateral_raise_hold')).toBe(variantFamilyKey('ex_lateral_raise'));
    expect(variantFamilyKey('ex_squat_hold')).toBe(variantFamilyKey('ex_bw_squat'));
    expect(variantFamilyKey('ex_pushup_hold')).toBe(variantFamilyKey('ex_pushup'));
    expect(variantFamilyKey('ex_chinup_hold')).toBe(variantFamilyKey('ex_pullup'));
    expect(variantFamilyKey('ex_knee_raise_hold')).toBe(variantFamilyKey('ex_hanging_leg_raise'));
    expect(variantFamilyKey('ex_leg_raise_hold')).toBe(variantFamilyKey('ex_leg_raise_floor'));
    expect(variantFamilyKey('ex_calf_raise_hold')).toBe(variantFamilyKey('ex_calf_raise_bw'));
    expect(variantFamilyKey('ex_glute_bridge_single_hold')).toBe(
      variantFamilyKey('ex_glute_bridge_single'),
    );
    // Deux mouvements voisins ne se confondent pas.
    expect(variantFamilyKey('ex_dead_hang')).toBe('ex_dead_hang');
    expect(variantFamilyKey('ex_hollow_hold')).not.toBe(variantFamilyKey('ex_leg_raise_floor'));
  });
  it('une tenue ne se FRACTIONNE jamais (30 s de tenue n’est pas un geste court)', () => {
    expect(fractionableExercise('ex_pushup')).toBe(true); // la version en reps, elle, le peut
    expect(fractionableExercise('ex_pullup')).toBe(true);
    expect(fractionableExercise('ex_pushup_hold')).toBe(false);
    expect(fractionableExercise('ex_chinup_hold')).toBe(false);
  });
  it('la charge tenue (stepper) : curl, élévation, squat et farmer — pas les tenues du poids du corps', () => {
    for (const id of [
      'ex_curl_hold',
      'ex_curl_ez_hold',
      'ex_lateral_raise_hold',
      'ex_squat_hold',
      'ex_farmer_hold',
    ]) {
      expect(holdLoadable(id), id).toBe(true);
    }
    for (const id of [
      'ex_knee_raise_hold',
      'ex_leg_raise_hold',
      'ex_hollow_hold',
      'ex_pushup_hold',
      'ex_chinup_hold',
      'ex_dead_hang',
      'ex_calf_raise_hold',
      'ex_glute_bridge_single_hold',
    ]) {
      expect(holdLoadable(id), id).toBe(false);
    }
  });
});
