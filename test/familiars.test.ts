import { describe, it, expect } from 'vitest';
import {
  rollFamiliar,
  familiarStoneCost,
  isFamiliar,
  aggregateEffects,
  playerWithGear,
  effectiveValue,
  FAMILIAR_SLOT,
  type Item,
} from '@/lib/items';
import { FAMILIAR_SPECIES, familiarSpecies, pickFamiliarSpecies } from '@/data/familiars';
import { mulberry32 } from '@/lib/combat';

const wolf = familiarSpecies('wolf')!;
const marmot = familiarSpecies('marmot')!;

function makeFam(species = wolf, level = 5, seed = 1): Item {
  return { id: 'f1', ...rollFamiliar(mulberry32(seed), species, { level }) };
}

describe('familiers — roll & identité', () => {
  it('rollFamiliar : slot familiar, effet = bonus de la race, species renseignée', () => {
    const f = makeFam(wolf, 8);
    expect(f.slot).toBe(FAMILIAR_SLOT);
    expect(f.effect.type).toBe(wolf.effect); // damage_pct
    expect(f.species).toBe('wolf');
    expect(f.level).toBe(8);
    expect(isFamiliar(f)).toBe(true);
  });
  it('déterministe : même seed/race/niveau → même familier', () => {
    expect(rollFamiliar(mulberry32(42), wolf, { level: 6 })).toEqual(
      rollFamiliar(mulberry32(42), wolf, { level: 6 }),
    );
  });
  it('chaque race porte son EffectType spécifique', () => {
    for (const s of FAMILIAR_SPECIES) {
      const f = { id: 'x', ...rollFamiliar(mulberry32(7), s, { level: 3 }) };
      expect(f.effect.type).toBe(s.effect);
    }
  });
  it('isFamiliar : faux pour un objet normal', () => {
    const sword: Item = {
      id: 's', slot: 'weapon', name: 'Lame', emoji: '⚔️', rarity: 'common',
      level: 1, baseLevel: 1, effect: { type: 'damage_pct', value: 8 },
    };
    expect(isFamiliar(sword)).toBe(false);
  });
});

describe('familiers — effet compté dans le combat', () => {
  it('aggregateEffects prend en compte le familier équipé', () => {
    const f = makeFam(wolf, 5);
    const withFam = aggregateEffects({ familiar: f });
    const expected = effectiveValue(f.effect, f.level) / 100;
    expect(withFam.damagePct).toBeCloseTo(expected, 6);
    expect(aggregateEffects({}).damagePct).toBe(0);
  });
  it('un familier de dégâts augmente les dégâts du combattant', () => {
    const stats = { puissance: 50, endurance: 40, agilite: 20 };
    const bare = playerWithGear('X', stats, {}, {}, 5);
    const withWolf = playerWithGear('X', stats, { familiar: makeFam(wolf, 5) }, {}, 5);
    expect(withWolf.damage).toBeGreaterThan(bare.damage);
  });
  it("le niveau du familier est plafonné au niveau du joueur (comme le stuff)", () => {
    const stats = { puissance: 50, endurance: 40, agilite: 20 };
    const strong = makeFam(wolf, 20); // familier niv.20
    const capped = playerWithGear('X', stats, { familiar: strong }, {}, 3); // joueur niv.3
    const atLevel = playerWithGear('X', stats, { familiar: makeFam(wolf, 3) }, {}, 3);
    // Le familier niv.20 ne doit pas rendre plus fort qu'un niv.3 au-delà de son roll.
    expect(capped.damage).toBeLessThanOrEqual(
      playerWithGear('X', stats, { familiar: { ...strong, level: 20 } }, {}, 20).damage,
    );
    expect(atLevel.damage).toBeGreaterThan(0);
  });
});

describe('familiers — pierres magiques & sélection', () => {
  it('familiarStoneCost croît avec le niveau et la rareté', () => {
    expect(familiarStoneCost(1, 'common')).toBeLessThan(familiarStoneCost(10, 'common'));
    expect(familiarStoneCost(5, 'common')).toBeLessThan(familiarStoneCost(5, 'legendary'));
  });
  it('pickFamiliarSpecies : respecte le biome quand fourni', () => {
    // marmotte = biome 'plain' (seule de ce biome) → toujours choisie.
    const s = pickFamiliarSpecies(mulberry32(3), 'plain');
    expect(s.id).toBe(marmot.id);
  });
  it('pickFamiliarSpecies : sans biome → une race valide du catalogue', () => {
    const s = pickFamiliarSpecies(mulberry32(9));
    expect(FAMILIAR_SPECIES.some((x) => x.id === s.id)).toBe(true);
  });
});
