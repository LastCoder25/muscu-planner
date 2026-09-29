// 🛡️⚔️ LA GARNISON PORTE UN TIERS DE LA DÉFENSE (v0.1370, demandé par l'utilisateur : « il
// faudrait que les miliciens et les champions aient un intérêt dans la défense », et « les
// champions devraient être plus forts que les miliciens, en tout cas au niveau max possible
// par le héros »). Mesuré avant : au niveau 90, UNE baliste frappait 25 fois plus fort que
// 5 champions au niveau du héros, et la garnison ne pesait que 6 % de la puissance passé le
// niveau 40.
import { describe, it, expect } from 'vitest';
import {
  RAID,
  defenseBreakdown,
  enceinteShareAt,
  guardRefUnit,
  guardUnits,
  militiaGuard,
  type DefenseStructure,
} from '@/lib/raid';
import { refChampionAdv } from '@/lib/caravan';
import { refFighter } from '@/lib/proceduralContent';

const NOW = 1_800_000_000_000;
const defs = (l: number): DefenseStructure[] => [
  { typeId: 'wall', level: l },
  { typeId: 'turret', level: l },
];
const champs = (n: number, lv: number) =>
  Array.from({ length: n }, (_, i) => ({ ...refChampionAdv(lv, i % 3), id: `c${i}` }));
/** Un champion de référence au niveau `lv`, en unité de siège chez un joueur de niveau `L`. */
const one = (L: number, lv: number) => guardUnits(L, champs(1, lv), 99, undefined, 0)[0]!;

describe('🛡️ la garnison au complet porte un tiers de la défense', () => {
  // ⚠️ HORS HÉROS : c'est la définition (la garnison face à l'enceinte) ; le héros dilue.
  it('garnison de référence au niveau du héros : ~1/3 de la puissance, à tous les niveaux', () => {
    for (const L of [30, 60, 90]) {
      const g = guardUnits(L, champs(RAID.guardRefUnits, L), 99, undefined, 0);
      const b = defenseBreakdown(defs(L), L, null, g, NOW);
      const part = b.parts.find((p) => p.id === 'garrison')!.power / b.power;
      expect(part, `niveau ${L}`).toBeGreaterThan(0.25);
      expect(part, `niveau ${L}`).toBeLessThan(0.42);
    }
  });

  it('la part ne FOND plus avec le niveau (elle suivait ~L face à une enceinte en ~L³)', () => {
    const part = (L: number) => {
      const g = guardUnits(L, champs(5, L), 99, undefined, 6);
      const b = defenseBreakdown(defs(L), L, refFighter(L), g, NOW);
      return b.parts.find((p) => p.id === 'garrison')!.power / b.power;
    };
    expect(part(90)).toBeGreaterThan(part(30) * 0.75);
  });

  it('au-delà de l’effectif de référence, rendement décroissant (pas de base imprenable)', () => {
    for (const L of [40, 80]) {
      const eq = (n: number) =>
        guardUnits(L, champs(n, L), 99, undefined, 0).reduce((s, u) => s + u.damage, 0);
      const ref = eq(RAID.guardRefUnits);
      // Cinq fois l'effectif de référence ne vaut pas cinq fois la garnison.
      expect(eq(RAID.guardRefUnits * 5)).toBeLessThan(ref * Math.pow(5, RAID.guardSoftExp) * 1.1);
      expect(eq(RAID.guardRefUnits * 5)).toBeGreaterThan(ref);
    }
  });
});

describe('⚔️ un champion au niveau du héros bat un milicien', () => {
  it('en PV et en dégâts, à tous les niveaux', () => {
    for (const L of [5, 12, 26, 40, 60, 90]) {
      const c = one(L, L);
      const m = militiaGuard(L, 1)[0]!;
      expect(c.pv, `niveau ${L}`).toBeGreaterThan(m.pv);
      expect(c.damage, `niveau ${L}`).toBeGreaterThan(m.damage);
    }
  });

  it('une fois la bascule faite, un milicien vaut la moitié de l’unité de référence', () => {
    for (const L of [RAID.enceinteTo, 60, 90]) {
      const u = guardRefUnit(L);
      const m = militiaGuard(L, 1)[0]!;
      expect(m.pv).toBeCloseTo(u.pv * 0.5, -1);
      expect(m.damage).toBeCloseTo(u.damage * 0.5, -1);
    }
  });

  it('le RETARD se paie : un champion à mi-niveau vaut moins qu’un champion à niveau', () => {
    for (const L of [40, 90]) {
      const haut = one(L, L);
      const bas = one(L, Math.round(L / 2));
      expect(bas.damage).toBeLessThan(haut.damage);
      expect(bas.pv).toBeLessThan(haut.pv);
    }
  });
});

describe('🌱 la bascule suit une rampe, l’apprentissage reste intact', () => {
  it('l’enceinte vaut 100 % jusqu’à enceinteFrom, puis descend jusqu’à enceinteK', () => {
    expect(enceinteShareAt(1)).toBe(1);
    expect(enceinteShareAt(RAID.enceinteFrom)).toBe(1);
    expect(enceinteShareAt(RAID.enceinteTo)).toBe(RAID.enceinteK);
    expect(enceinteShareAt(100)).toBe(RAID.enceinteK);
    const mid = enceinteShareAt((RAID.enceinteFrom + RAID.enceinteTo) / 2);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(RAID.enceinteK);
  });
});
