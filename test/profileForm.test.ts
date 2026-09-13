import { describe, it, expect } from 'vitest';
import { emptyProfileForm, formToProfile, profileToForm } from '@/lib/profileForm';
import { EQUIPMENT_ITEMS } from '@/data/profileOptions';

describe('matériel du profil', () => {
  const roundTrip = (items: string[]) => {
    const form = { ...emptyProfileForm(), name: 'Test', available_equipment: items as never };
    return profileToForm(formToProfile(form)).available_equipment;
  };

  it('tout matériel proposé à l’écran survit à l’enregistrement puis au rechargement', () => {
    // `migrateEquipment` jette au rechargement ce qu'il ne connaît pas : une option ajoutée à
    // l'écran sans l'être à la liste valide serait cochée… puis perdue en silence.
    const all = EQUIPMENT_ITEMS.map((o) => o.value);
    expect(roundTrip(all).sort()).toEqual([...all].sort());
  });

  it('le rameur et le sac de frappe sont proposés et conservés', () => {
    const values = EQUIPMENT_ITEMS.map((o) => o.value);
    expect(values).toContain('rower');
    expect(values).toContain('punching_bag');
    expect(roundTrip(['rower', 'punching_bag'])).toEqual(['rower', 'punching_bag']);
  });

  it('un atome inconnu reste écarté', () => {
    expect(roundTrip(['rower', 'trampoline'])).toEqual(['rower']);
  });

  it('le cardio et le combat ne font pas passer le profil pour une salle équipée', () => {
    // Le résumé grossier pilote la génération de programme : un rameur n'est pas une barre.
    const p = formToProfile({
      ...emptyProfileForm(),
      name: 'T',
      available_equipment: ['rower', 'punching_bag'],
    });
    expect(p.equipment).toBe('poids_du_corps');
  });
});
