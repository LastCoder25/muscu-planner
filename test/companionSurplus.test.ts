import { describe, expect, it } from 'vitest';
import { familiarSurplus, relicSurplus, FAMILIAR_SLOT, type Item } from '@/lib/items';
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

function relic(id: string, power: string, extra: Partial<Item> = {}): Item {
  return {
    id,
    slot: 'relic',
    name: id,
    emoji: '🔮',
    rarity: 'rare',
    level: 10,
    baseLevel: 10,
    roll: 0.5,
    effect: { type: 'max_pv_pct', value: 0 },
    power: power as Item['power'],
    ...extra,
  };
}

describe('relicSurplus', () => {
  it('garde la meilleure de chaque pouvoir, vend les autres', () => {
    const inv = [
      relic('a', 'brasier', { roll: 0.2 }),
      relic('b', 'brasier', { roll: 0.9 }),
      relic('c', 'brasier', { roll: 0.5 }),
      relic('d', 'phenix', { roll: 0.1 }),
    ];
    expect(relicSurplus(null, inv).sort()).toEqual(['a', 'c']);
  });

  it('la portée reste même moins bonne, la meilleure du sac aussi', () => {
    const inv = [relic('b', 'brasier', { roll: 0.9 }), relic('c', 'brasier', { roll: 0.5 })];
    expect(relicSurplus(relic('eq', 'brasier', { roll: 0.1 }), inv)).toEqual(['c']);
  });

  it('si la portée est la meilleure, tout le sac du même pouvoir part', () => {
    const inv = [relic('b', 'brasier', { roll: 0.5 }), relic('c', 'brasier', { roll: 0.2 })];
    const eq = relic('eq', 'brasier', { roll: 0.99 });
    expect(relicSurplus(eq, inv).sort()).toEqual(['b', 'c']);
  });

  it('juge la FORCE réelle (rang et niveau d’objet compris)', () => {
    const inv = [
      relic('lo', 'brasier', { roll: 0.95, level: 1 }),
      relic('hi', 'brasier', { roll: 0.9, level: 80 }),
      relic('rk', 'phenix', { rarity: 'commun', roll: 0.99 }),
      relic('rk2', 'phenix', { rarity: 'epique', roll: 0 }),
    ];
    expect(relicSurplus(null, inv).sort()).toEqual(['lo', 'rk']);
  });

  it('la jauge rapide (Légendaire+) passe avant la force', () => {
    const inv = [
      relic('leg', 'brasier', { rarity: 'legendaire', roll: 0, level: 1 }),
      relic('epi', 'brasier', { rarity: 'epique', roll: 1, level: 100 }),
    ];
    expect(relicSurplus(null, inv)).toEqual(['epi']);
  });

  it('un 🔒 et une relique sans pouvoir ne sont jamais vendus', () => {
    const inv = [
      relic('b', 'brasier', { roll: 0.9 }),
      relic('c', 'brasier', { roll: 0.5, locked: true }),
      relic('x', 'inconnu'),
      relic('y', 'inconnu'),
    ];
    expect(relicSurplus(null, inv)).toEqual([]);
  });

  it('ignore ce qui n’est pas une relique', () => {
    const inv = [relic('b', 'brasier'), { ...relic('w', 'brasier'), slot: 'weapon' as const }];
    expect(relicSurplus(null, inv)).toEqual([]);
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
