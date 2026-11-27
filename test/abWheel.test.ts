// 🛞 Roue abdominale (migration 0122) : un nouvel atome de matériel et 2 exos. Le test lit la
// migration ET le client : un atome non cochable, un exo sans consigne ou hors famille se verrait
// au premier tirage, pas à la compilation.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMBO_SLOTS, variantFamilyKey } from '@/data/combo';
import { exerciseFrames, exerciseImage } from '@/data/exerciseImages';
import { exerciseInstructions } from '@/data/exerciseInstructions';
import { EQUIPMENT_ITEMS } from '@/data/profileOptions';
import { emptyProfileForm, formToProfile, profileToForm } from '@/lib/profileForm';

const sql = readFileSync(
  new URL('../supabase/migrations/0122_roue_abdominale.sql', import.meta.url),
  'utf8',
);
const row = (id: string) => sql.split('\n').find((l) => l.includes(`('${id}'`)) ?? '';
const IDS = ['ex_ab_wheel_knees', 'ex_ab_wheel'];

describe('migration 0122', () => {
  it('2 lignes, en répétitions, abdominaux, sans muscle secondaire, matériel = la roue seule', () => {
    expect(sql.match(/^ {2}\('ex_/gm)?.length).toBe(2);
    for (const id of IDS) {
      const r = row(id);
      expect(r, id).toContain("'abdominaux', '{}'");
      expect(r, id).toContain("'{ab_wheel}'");
      expect(r, id).toContain("'reps'");
      expect(r, id).toContain("'musculation', '{variante}'");
    }
    expect(row('ex_ab_wheel_knees')).toContain("'{ab_wheel}', 2,");
    expect(row('ex_ab_wheel')).toContain("'{ab_wheel}', 3,");
  });
});

describe('client', () => {
  it('le matériel est cochable au profil et survit au rechargement', () => {
    expect(EQUIPMENT_ITEMS.map((o) => o.value)).toContain('ab_wheel');
    const form = {
      ...emptyProfileForm(),
      name: 'Test',
      available_equipment: ['ab_wheel'] as never,
    };
    expect(profileToForm(formToProfile(form)).available_equipment).toEqual(['ab_wheel']);
  });
  it('rangés dans l’emplacement Gainage du Défi 360, dans une famille à part', () => {
    expect(COMBO_SLOTS.find((s) => s.muscles.includes('abdominaux'))?.key).toBe('core');
    expect(variantFamilyKey('ex_ab_wheel')).toBe(variantFamilyKey('ex_ab_wheel_knees'));
    expect(variantFamilyKey('ex_ab_wheel')).not.toBe(variantFamilyKey('ex_crunch'));
  });
  it('consignes pour les deux ; photo animée pour les deux', () => {
    for (const id of IDS) {
      expect(exerciseInstructions(id)?.steps.length, id).toBeGreaterThanOrEqual(3);
      expect(exerciseInstructions(id)?.tip, id).toBeTruthy();
    }
    expect(exerciseFrames('ex_ab_wheel_knees')).toBeDefined();
    expect(existsSync(new URL('../public/exercises/ex_ab_wheel_knees.jpg', import.meta.url))).toBe(
      true,
    );
    expect(
      existsSync(new URL('../public/exercises/ex_ab_wheel_knees-1.jpg', import.meta.url)),
    ).toBe(true);
    // La version debout n'a pas de cliché propre : elle reprend celui de la roue sur les genoux (v1.369.0).
    expect(exerciseImage('ex_ab_wheel')).toBe(exerciseImage('ex_ab_wheel_knees'));
  });
});
