import { describe, it, expect } from 'vitest';
import {
  equipmentLabel,
  isUnloadedEquipment,
  pickerOrder,
  recentExerciseIds,
} from '@/lib/freePicker';

describe('🏋️ le sélecteur de la séance libre', () => {
  it('le matériel se lit en français, jamais en code', () => {
    expect(equipmentLabel('poids_du_corps')).toBe('poids du corps');
    expect(equipmentLabel('halteres')).toBe('haltères');
    expect(equipmentLabel('un_truc_neuf')).toBe('un truc neuf');
    expect(equipmentLabel(null)).toBe('');
  });

  it('⚠️ toutes les orthographes de l’élastique sont sans charge', () => {
    for (const c of ['poids_du_corps', 'élastique', 'elastique', 'bands'])
      expect(isUnloadedEquipment(c)).toBe(true);
    for (const c of ['barre', 'halteres', 'machine', null]) expect(isUnloadedEquipment(c)).toBe(false);
  });

  it('les exos récents, du plus récent, sans doublon', () => {
    const logs = [
      { exercises: [{ id: 'b' }, { id: 'c' }] },
      { exercises: [{ id: 'a' }, { id: 'b' }] },
    ];
    expect(recentExerciseIds(logs)).toEqual(['b', 'c', 'a']);
    expect(recentExerciseIds(logs, 2)).toEqual(['b', 'c']);
  });

  it('favoris, puis récents, puis le reste dans l’ordre reçu', () => {
    const lib = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    const out = pickerOrder(lib, ['d'], ['e', 'b']);
    expect(out.map((x) => x.ex.id)).toEqual(['d', 'e', 'b', 'a', 'c']);
    expect(out.map((x) => x.tag)).toEqual(['fav', 'recent', 'recent', null, null]);
    expect(lib.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']); // pas trié en place
  });
});
