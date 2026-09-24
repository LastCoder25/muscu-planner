// ⬆️ Ce qu'un niveau de plus sur une structure ajoute à la puissance de la base (v0.1148).
import { describe, it, expect } from 'vitest';
import { defensePower, defenseUpgradeGain, type DefenseStructure } from '@/lib/raid';
import { refFighter } from '@/lib/proceduralContent';

const base = (lvl: number): DefenseStructure[] => [
  { typeId: 'wall', level: lvl },
  { typeId: 'turret', level: lvl },
  { typeId: 'watchtower', level: lvl },
];

describe('⬆️ defenseUpgradeGain', () => {
  const L = 30;
  const hero = refFighter(L);

  it('mur et tourelles : le niveau suivant AUGMENTE la puissance, mesurée comme le total', () => {
    for (const id of ['wall', 'turret'] as const) {
      const g = defenseUpgradeGain(base(20), id, L, hero, [])!;
      expect(g.before).toBe(defensePower(base(20), L, hero, []));
      const up = base(20).map((d) => (d.typeId === id ? { ...d, level: 21 } : d));
      expect(g.after).toBe(defensePower(up, L, hero, []));
      expect(g.after, id).toBeGreaterThan(g.before);
    }
  });

  it('une structure qui ne combat pas (Tour de guet) n’ajoute rien : c’est une information', () => {
    const g = defenseUpgradeGain(base(20), 'watchtower', L, hero, [])!;
    expect(g.after).toBe(g.before);
  });

  it('une structure pas encore bâtie : le gain de sa construction', () => {
    const sans: DefenseStructure[] = [{ typeId: 'wall', level: 20 }];
    const g = defenseUpgradeGain(sans, 'turret', L, hero, [])!;
    expect(g.after).toBe(defensePower([...sans, { typeId: 'turret', level: 1 }], L, hero, []));
  });

  it('déjà au niveau du joueur : rien à annoncer', () => {
    expect(defenseUpgradeGain(base(L), 'wall', L, hero, [])).toBeNull();
  });
});
