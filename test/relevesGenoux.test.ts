// 🦵 Relevés de genoux (migration 0123) : la version en reps et la version tenue au sol manquaient
// (seule la tenue suspendue existait). Le test lit la migration ET le client.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMBO_SLOTS, variantFamilyKey } from '@/data/combo';
import { exerciseImage } from '@/data/exerciseImages';
import { exerciseInstructions } from '@/data/exerciseInstructions';

const sql = readFileSync(new URL('../supabase/migrations/0123_releves_genoux.sql', import.meta.url), 'utf8');
const row = (id: string) => sql.split('\n').find((l) => l.includes(`('${id}'`)) ?? '';
const IDS = ['ex_knee_raise_floor', 'ex_knee_raise_floor_hold', 'ex_knee_raise_hanging'];

describe('migration 0123', () => {
  it('3 lignes, abdominaux, sans muscle secondaire, écartées des programmes générés', () => {
    expect(sql.match(/^ {2}\('ex_/gm)?.length).toBe(3);
    for (const id of IDS) {
      expect(row(id), id).toContain("'abdominaux', '{}'");
      expect(row(id), id).toContain("'musculation', '{variante}'");
    }
  });
  it('unités et matériel : reps au sol, tenue au sol, reps suspendu (barre de traction seule)', () => {
    expect(row('ex_knee_raise_floor')).toContain("'{}', 1, 'reps'");
    expect(row('ex_knee_raise_floor_hold')).toContain("'{}', 1, 'time'");
    expect(row('ex_knee_raise_hanging')).toContain("'{pullup_bar}', 2, 'reps'");
  });
});

describe('client', () => {
  it('dans l’emplacement Gainage du 360 et la famille des relevés de jambes', () => {
    expect(COMBO_SLOTS.find((s) => s.muscles.includes('abdominaux'))?.key).toBe('core');
    for (const id of IDS)
      expect(variantFamilyKey(id), id).toBe(variantFamilyKey('ex_leg_raise_floor'));
    expect(variantFamilyKey('ex_leg_raise_hold')).toBe(variantFamilyKey('ex_knee_raise_floor'));
  });
  it('consignes pour les trois ; seule la version suspendue reprend l’image du relevé suspendu', () => {
    for (const id of IDS) {
      expect(exerciseInstructions(id)?.steps.length, id).toBeGreaterThanOrEqual(3);
      expect(exerciseInstructions(id)?.tip, id).toBeTruthy();
    }
    expect(exerciseImage('ex_knee_raise_hanging')).toBe(exerciseImage('ex_hanging_leg_raise'));
    expect(exerciseImage('ex_knee_raise_floor')).toBeUndefined();
    expect(exerciseImage('ex_knee_raise_floor_hold')).toBeUndefined();
    expect(existsSync(new URL('../public/exercises/ex_hanging_leg_raise.jpg', import.meta.url))).toBe(true);
  });
  it('le changement d’exo explique pourquoi des exos manquent en bascule entière', () => {
    const sheet = readFileSync(new URL('../src/components/ComboSwapSheet.vue', import.meta.url), 'utf8');
    expect(sheet).toContain('data-test="sw-entry-hint"');
    expect(sheet).toContain("=== 'entryUnit'");
  });
});

describe('🧗 tenue jambes tendues SUSPENDU (migration 0124)', () => {
  const sql4 = readFileSync(new URL('../supabase/migrations/0124_tenue_jambes_suspendu.sql', import.meta.url), 'utf8');
  it('un exo au temps, abdominaux, difficulté 3, barre de traction seule, sans muscle secondaire', () => {
    const r = sql4.split('\n').find((l) => l.includes("('ex_leg_raise_hang_hold'")) ?? '';
    expect(r).toContain("'abdominaux', '{}'");
    expect(r).toContain("'{pullup_bar}', 3, 'time'");
    expect(r).toContain("'musculation', '{variante}'");
  });
  it('dans la famille des relevés de jambes, avec consignes et l’image du relevé suspendu', () => {
    expect(variantFamilyKey('ex_leg_raise_hang_hold')).toBe(variantFamilyKey('ex_leg_raise_hold'));
    expect(exerciseInstructions('ex_leg_raise_hang_hold')?.steps.length).toBeGreaterThanOrEqual(3);
    expect(exerciseInstructions('ex_leg_raise_hang_hold')?.tip).toBeTruthy();
    expect(exerciseImage('ex_leg_raise_hang_hold')).toBe(exerciseImage('ex_hanging_leg_raise'));
  });
});
