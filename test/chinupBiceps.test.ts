import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMBO_SLOTS, fractionableExercise, variantFamilyKey } from '@/data/combo';
import { exerciseInstructions } from '@/data/exerciseInstructions';
import { exerciseFrames } from '@/data/exerciseImages';

// 💪 Tractions en supination, version BICEPS (migr. 0116) : la même traction que `ex_chinup`,
// mais rangée sous les biceps pour apparaître dans l'emplacement « Biceps » du Défi 360.
const ID = 'ex_chinup_biceps';
const sql = readFileSync(resolve(__dirname, '..', 'supabase/migrations/0116_chinup_biceps.sql'), 'utf8');

describe('💪 tractions en supination, version biceps', () => {
  it('la migration la range sous les BICEPS, en variante, avec la barre de traction', () => {
    expect(sql).toContain(`('${ID}'`);
    expect(sql).toMatch(/'biceps', '\{dos,avant_bras\}'/);
    expect(sql).toContain("'{pullup_bar}'");
    expect(sql).toContain("'{variante}'");
  });

  it('elle est proposée par l’emplacement « Biceps » du 360 (et pas rangée sous le dos)', () => {
    const muscleInSql = /\('ex_chinup_biceps', '[^']+', '([^']+)'/.exec(sql)?.[1];
    const slot = COMBO_SLOTS.find((s) => s.key === 'biceps');
    expect(muscleInSql).toBeDefined();
    expect(slot?.muscles).toContain(muscleInSql);
  });

  it('même mouvement que les tractions : jamais les deux dans un même emplacement', () => {
    expect(variantFamilyKey(ID)).toBe(variantFamilyKey('ex_pullup'));
    expect(variantFamilyKey(ID)).toBe(variantFamilyKey('ex_chinup'));
  });

  it('elle se fractionne (une traction toutes les N minutes) comme les autres tractions', () => {
    expect(fractionableExercise(ID)).toBe(true);
  });

  it('elle a ses instructions et ses deux poses d’illustration', () => {
    expect(exerciseInstructions(ID)?.steps.length).toBeGreaterThanOrEqual(3);
    const frames = exerciseFrames(ID);
    expect(frames).toBeDefined();
    for (const f of frames!)
      expect(existsSync(resolve(__dirname, '..', 'public', f.replace(/^\//, ''))), f).toBe(true);
  });
});
