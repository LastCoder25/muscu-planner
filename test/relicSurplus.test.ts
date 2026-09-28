import { describe, expect, it } from 'vitest';
import { relicSurplus, type Item } from '@/lib/items';

// 🔮 Vente automatique des reliques en trop : par pouvoir, la MEILLEURE et celle qu'on PORTE
// restent ; tout le reste part. (Les talents et familiers se fusionnent : companionFusion.)

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
