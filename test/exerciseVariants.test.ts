import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildBeginnerSession, buildProgram, type ExerciseDef } from '@/lib/programBuilder';
import { variantFamilyKey } from '@/data/combo';
import { exerciseInstructions } from '@/data/exerciseInstructions';
import type { Profile } from '@/lib/types';

// Les variantes ajoutées par la migration 0112 : on les relit DANS le fichier, pour qu'une
// variante ajoutée au SQL sans ses instructions ni sa famille fasse échouer ce test.
const sql = readFileSync(
  resolve(__dirname, '..', 'supabase/migrations/0112_variantes_exercices.sql'),
  'utf8',
);
const ids = [...sql.matchAll(/^ {2}\('(ex_[a-z0-9_]+)'/gm)].map((m) => m[1]!);

// Variantes qui n'ont VOLONTAIREMENT pas de famille (mouvement sans autre version dans la biblio).
const ALONE = new Set(['ex_upright_row', 'ex_pullover_db', 'ex_dead_bug']);

describe('🧩 variantes d’exercices (migration 0112)', () => {
  it('la migration en pose 29, sans doublon, toutes étiquetées « variante »', () => {
    expect(ids).toHaveLength(29);
    expect(new Set(ids).size).toBe(ids.length);
    expect((sql.match(/'\{variante\}'/g) ?? []).length).toBe(ids.length);
  });

  it.each(ids)('« %s » a ses instructions et sa famille', (id) => {
    const g = exerciseInstructions(id);
    expect(g?.steps.length, `instructions de ${id}`).toBeGreaterThanOrEqual(3);
    if (!ALONE.has(id)) expect(variantFamilyKey(id), `famille de ${id}`).not.toBe(id);
  });

  it('chaque famille nouvelle garde son exercice de base en tête', () => {
    expect(variantFamilyKey('ex_pushup_archer')).toBe('ex_pushup');
    expect(variantFamilyKey('ex_chinup')).toBe('ex_pullup');
    expect(variantFamilyKey('ex_squat_bulgarian')).toBe('ex_bw_lunge');
    expect(variantFamilyKey('ex_hip_thrust')).toBe('ex_glute_bridge');
    expect(variantFamilyKey('ex_plank_side')).toBe('ex_plank');
  });
});

describe('🧩 les variantes ne réécrivent pas les programmes générés', () => {
  const base: ExerciseDef = {
    id: 'ex_pushup',
    name: 'Pompes',
    muscle_primary: 'pectoraux',
    muscle_secondary: ['triceps'],
    equipment: 'poids_du_corps',
    equipment_required: [],
    difficulty: 1,
  };
  // Une variante plus « riche » (plus de muscles secondaires, même niveau) l'emporterait au tri.
  const variant: ExerciseDef = {
    id: 'ex_pushup_incline',
    name: 'Pompes inclinées',
    muscle_primary: 'pectoraux',
    muscle_secondary: ['triceps', 'épaules', 'abdominaux'],
    equipment: 'poids_du_corps',
    equipment_required: [],
    difficulty: 1,
    tags: ['variante'],
  };

  it('séance débutant : jamais la variante', () => {
    const s = buildBeginnerSession([variant, base], { minutes: 40, equipment: 'bodyweight' });
    const got = s.exercises.map((e) => e.id);
    expect(got).toContain('ex_pushup');
    expect(got).not.toContain('ex_pushup_incline');
  });

  it('programme généré : jamais la variante', () => {
    const profile = {
      identity: { name: 'T' },
      experience: { level: 'debutant' },
      objective: 'hypertrophie',
      availability: { sessions_per_week: 3 },
      equipment: 'poids_du_corps',
      available_equipment: [],
    } as unknown as Profile;
    const sessions = buildProgram(profile, [variant, base]);
    const got = sessions.flatMap((s) => s.exercises.map((e) => e.id));
    expect(got).not.toContain('ex_pushup_incline');
  });

  it('sans le tag, la même variante est bien préférée (le garde-fou est le tag)', () => {
    const untagged = { ...variant, tags: [] };
    const s = buildBeginnerSession([untagged, base], { minutes: 40, equipment: 'bodyweight' });
    expect(s.exercises.map((e) => e.id)).toContain('ex_pushup_incline');
  });
});

describe('🧩 choix manuels : les variantes passent après les exercices de base', () => {
  it('le Défi 360 et le changement d’exercice trient les variantes en dernier', () => {
    const page = readFileSync(resolve(__dirname, '..', 'src/pages/ComboNewPage.vue'), 'utf8');
    const swap = readFileSync(
      resolve(__dirname, '..', 'src/components/ComboSwapSheet.vue'),
      'utf8',
    );
    expect(page).toContain("tags?.includes('variante')");
    expect(swap).toContain("tags?.includes('variante')");
  });
});
