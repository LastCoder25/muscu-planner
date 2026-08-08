import { describe, it, expect } from 'vitest';
import { BOSSES } from '@/data/bosses';
import { SET_BY_ID } from '@/lib/items';

describe('BOSSES (boss de palier)', () => {
  it('chaque boss référence un set existant', () => {
    for (const b of BOSSES) {
      expect(SET_BY_ID[b.setId], `set manquant pour ${b.id}`).toBeDefined();
    }
  });
  it('un set unique par boss (chacun le sien)', () => {
    const setIds = BOSSES.map((b) => b.setId);
    expect(new Set(setIds).size).toBe(BOSSES.length);
  });
  it('paliers croissants (5/10/15…) et drop au niveau du palier', () => {
    for (let i = 0; i < BOSSES.length; i++) {
      expect(BOSSES[i]!.unlockLevel).toBe((i + 1) * 5);
      expect(BOSSES[i]!.dropLevel).toBe(BOSSES[i]!.unlockLevel);
    }
  });
  it('difficulté croissante (dégâts + puissance de combat)', () => {
    // Les dégâts montent toujours ; le PV brut peut baisser sur l'Archidémon
    // (glass cannon : moins de PV, énormément de dégâts) → on vérifie la
    // PUISSANCE globale (pv × dégâts), qui elle reste strictement croissante.
    for (let i = 1; i < BOSSES.length; i++) {
      expect(BOSSES[i]!.combatant.damage).toBeGreaterThan(BOSSES[i - 1]!.combatant.damage);
      const powerPrev = BOSSES[i - 1]!.combatant.pv * BOSSES[i - 1]!.combatant.damage;
      const power = BOSSES[i]!.combatant.pv * BOSSES[i]!.combatant.damage;
      expect(power).toBeGreaterThan(powerPrev);
    }
  });
});
