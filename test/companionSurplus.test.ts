import { describe, expect, it } from 'vitest';
import { familiarSurplus, FAMILIAR_SLOT, type Item } from '@/lib/items';
import { talentSurplus, talentTierFloor, type TalentInstance } from '@/lib/talents';

// Vente automatique des talents et familiers en trop : par catégorie, le MEILLEUR et celui
// qu'on PORTE restent ; tout le reste part.

function fam(id: string, species: string, value: number, extra: Partial<Item> = {}): Item {
  return {
    id,
    slot: FAMILIAR_SLOT,
    name: id,
    emoji: '🐾',
    rarity: 'commun',
    level: 1,
    baseLevel: 1,
    effect: { type: species === 'wolf' ? 'damage_pct' : 'max_pv_pct', value },
    species,
    ...extra,
  };
}

function tal(id: string, code: string, tier: number, extra: Partial<TalentInstance> = {}) {
  return { id, code, xp: talentTierFloor(tier), roll: 0.5, level: 1, ...extra };
}

describe('familiarSurplus', () => {
  it('garde le meilleur de chaque race, vend les autres', () => {
    const inv = [
      fam('a', 'wolf', 5),
      fam('b', 'wolf', 9),
      fam('c', 'wolf', 7),
      fam('d', 'deer', 4),
    ];
    expect(familiarSurplus(null, inv).sort()).toEqual(['a', 'c']);
  });

  it('le porté reste même moins bon, et le meilleur du sac reste aussi', () => {
    const inv = [fam('b', 'wolf', 9), fam('c', 'wolf', 7)];
    expect(familiarSurplus(fam('eq', 'wolf', 3), inv)).toEqual(['c']);
  });

  it('si le porté est le meilleur, tout le sac de la race part', () => {
    const inv = [fam('b', 'wolf', 9), fam('c', 'wolf', 7)];
    expect(familiarSurplus(fam('eq', 'wolf', 20), inv).sort()).toEqual(['b', 'c']);
  });

  it('juge la stat RÉELLE (niveau d’objet compris), pas la valeur brute', () => {
    const inv = [fam('lo', 'wolf', 10, { level: 1 }), fam('hi', 'wolf', 9.5, { level: 60 })];
    expect(familiarSurplus(null, inv)).toEqual(['lo']);
  });

  it('à stat égale, la signature ✦ l’emporte', () => {
    const sig = fam('sig', 'wolf', 8, { effect2: { type: 'execute_pct', value: 5 } });
    expect(familiarSurplus(null, [fam('plain', 'wolf', 8), sig])).toEqual(['plain']);
  });

  it('un 🔒 n’est jamais vendu', () => {
    const inv = [fam('b', 'wolf', 9), fam('c', 'wolf', 7, { locked: true })];
    expect(familiarSurplus(null, inv)).toEqual([]);
  });

  it('ignore ce qui n’est pas un familier', () => {
    const sword = { ...fam('s', 'wolf', 1), slot: 'weapon' as const, species: undefined };
    expect(familiarSurplus(null, [fam('b', 'wolf', 9), sword])).toEqual([]);
  });
});

describe('talentSurplus', () => {
  it('garde le meilleur de chaque talent, vend les autres', () => {
    const ts = [
      tal('a', 't_dmg', 3),
      tal('b', 't_dmg', 12),
      tal('c', 't_pv', 5),
      tal('d', 't_dmg', 7),
    ];
    expect(talentSurplus(ts).sort()).toEqual(['a', 'd']);
  });

  it('le talent équipé reste même moins bon', () => {
    const ts = [
      tal('eq', 't_dmg', 2, { equipped: true }),
      tal('b', 't_dmg', 12),
      tal('c', 't_dmg', 7),
    ];
    expect(talentSurplus(ts)).toEqual(['c']);
  });

  it('juge la magnitude réelle (niveau d’objet compris)', () => {
    const ts = [tal('lo', 't_dmg', 5, { level: 1 }), tal('hi', 't_dmg', 5, { level: 80 })];
    expect(talentSurplus(ts)).toEqual(['lo']);
  });

  it('un code inconnu n’est jamais vendu', () => {
    expect(talentSurplus([tal('x', 't_inconnu', 1), tal('y', 't_inconnu', 9)])).toEqual([]);
  });
});
