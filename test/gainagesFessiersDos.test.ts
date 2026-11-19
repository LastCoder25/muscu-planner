// 🧱 Deux exos au temps de plus (migration 0119) : le pont fessier tenu (fessiers, emplacement
// Charnière) et le Superman tenu (dos, emplacement Tirage). Le test lit la migration ET le client :
// une donnée sans image, sans consigne ou hors famille se verrait au premier tirage.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exerciseFrames, exerciseImage } from '@/data/exerciseImages';
import { exerciseInstructions } from '@/data/exerciseInstructions';
import { COMBO_SLOTS, variantFamilyKey } from '@/data/combo';
import { holdMuscleLabel } from '@/lib/muscles';

const IDS = ['ex_glute_bridge_hold', 'ex_superman_hold'] as const;
const sql = readFileSync(
  new URL('../supabase/migrations/0119_gainages_fessiers_dos.sql', import.meta.url),
  'utf8',
);
const row = (id: string) => sql.split('\n').find((l) => l.includes(`('${id}'`)) ?? '';

describe('migration 0119', () => {
  it('deux exos au temps, au poids du corps, sans matériel, écartés des programmes générés', () => {
    for (const id of IDS) {
      const r = row(id);
      expect(r, id).toContain("'time'");
      expect(r, id).toContain("'poids_du_corps', '{}'");
      expect(r, id).toContain("'musculation', '{variante}'");
    }
  });
  it('rangés par leur muscle principal dans un emplacement du Défi 360', () => {
    const slotOf = (muscle: string) => COMBO_SLOTS.find((s) => s.muscles.includes(muscle))?.key;
    expect(row('ex_glute_bridge_hold')).toContain("'ischio-jambiers'");
    expect(slotOf('ischio-jambiers')).toBe('hinge');
    expect(row('ex_superman_hold')).toContain("'dos'");
    expect(slotOf('dos')).toBe('pull');
  });
  it('rejouable', () => {
    expect(sql).toContain('on conflict (id) do nothing');
  });
});

describe('côté client', () => {
  it('chaque exo a une illustration animée et une consigne', () => {
    for (const id of IDS) {
      expect(exerciseImage(id), id).toBeTruthy();
      expect(exerciseFrames(id), id).toBeTruthy();
      expect(exerciseInstructions(id)?.steps.length, id).toBeGreaterThanOrEqual(2);
    }
  });
  it('un exo tenu est dans la famille de son mouvement (jamais avec sa version en reps)', () => {
    expect(variantFamilyKey('ex_glute_bridge_hold')).toBe(variantFamilyKey('ex_glute_bridge'));
    expect(variantFamilyKey('ex_superman_hold')).toBe(variantFamilyKey('ex_superman'));
    expect(variantFamilyKey('ex_superman')).not.toBe(variantFamilyKey('ex_glute_bridge'));
  });
  it('la pastille dit « Fessiers » côté ischio/fessiers et « Dos »', () => {
    expect(holdMuscleLabel('ischio-jambiers')).toBe('Ischio / fessiers');
    expect(holdMuscleLabel('dos')).toBe('Dos');
  });
});
