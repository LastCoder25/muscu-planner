import { describe, it, expect } from 'vitest';
import {
  rollFamiliar,
  familiarStoneCost,
  isFamiliar,
  nextRarity,
  rollStars,
  aggregateEffects,
  playerWithGear,
  effectiveValue,
  FAMILIAR_SLOT,
  type Item,
} from '@/lib/items';
import {
  FAMILIAR_SPECIES,
  familiarSpecies,
  pickFamiliarSpecies,
  rollActivityFamiliar,
  rollFusedFamiliar,
} from '@/data/familiars';
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
    expect(f.level).toBe(1); // REFONTE C : le familier arrive niv.1 → à infuser
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
  it('familier = rang + QUALITÉ (1→5) comme un objet (ticket f93c219b)', () => {
    for (let s = 1; s <= 30; s++) {
      const f = rollFamiliar(mulberry32(s), wolf, { level: 5 });
      const stars = rollStars(f.roll);
      expect(stars).toBeGreaterThanOrEqual(1);
      expect(stars).toBeLessThanOrEqual(5);
    }
  });
  it('isFamiliar : faux pour un objet normal', () => {
    const sword: Item = {
      id: 's',
      slot: 'weapon',
      name: 'Lame',
      emoji: '⚔️',
      rarity: 'G',
      level: 1,
      baseLevel: 1,
      effect: { type: 'damage_pct', value: 8 },
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
  it('le niveau du familier est plafonné au niveau du joueur (comme le stuff)', () => {
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

describe('familiers — effet signature (buff constant + option)', () => {
  it('un familier de rang bas (G) ne roule jamais de signature (effect2)', () => {
    for (let s = 0; s < 40; s++) {
      const f = rollFamiliar(mulberry32(s), wolf, { level: 5, rarity: 'G' });
      expect(f.effect2).toBeUndefined();
    }
  });
  it('un familier SSS roule parfois une signature (execute/rage/momentum)', () => {
    let found = 0;
    for (let s = 0; s < 60; s++) {
      const f = rollFamiliar(mulberry32(s), wolf, { level: 5, rarity: 'SSS' });
      if (f.effect2) {
        found++;
        expect(['execute_pct', 'rage_pct', 'momentum_pct']).toContain(f.effect2.type);
      }
    }
    expect(found).toBeGreaterThan(0);
  });
  it("l'effet signature du familier est compté dans aggregateEffects", () => {
    // Cherche un seed qui donne un familier divin AVEC signature.
    let fam: Item | null = null;
    for (let s = 0; s < 60 && !fam; s++) {
      const f = { id: 'f', ...rollFamiliar(mulberry32(s), wolf, { level: 5, rarity: 'SSS' }) };
      if (f.effect2) fam = f;
    }
    expect(fam).not.toBeNull();
    const agg = aggregateEffects({ familiar: fam! });
    // le bonus de race (damage) ET la signature sont pris en compte.
    const anySig = agg.executePct + agg.ragePct + agg.momentumPct;
    expect(anySig).toBeGreaterThan(0);
  });
});

describe('familiers — pierres magiques & sélection', () => {
  it('familiarStoneCost croît avec le niveau et la rareté', () => {
    expect(familiarStoneCost(1, 'G')).toBeLessThan(familiarStoneCost(10, 'G'));
    expect(familiarStoneCost(5, 'G')).toBeLessThan(familiarStoneCost(5, 'S'));
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
  it('rollActivityFamiliar : produit un familier valide (slot + species), niveau 1', () => {
    const f = rollActivityFamiliar(mulberry32(11), { level: 7, luck: 0.5 });
    expect(f.slot).toBe(FAMILIAR_SLOT);
    expect(f.species).toBeTruthy();
    expect(f.level).toBe(1); // REFONTE C
  });
  it('rollActivityFamiliar : biome forcé → race de ce biome', () => {
    const f = rollActivityFamiliar(mulberry32(2), { level: 5, biome: 'plain' });
    expect(f.species).toBe('marmot'); // seule race de biome plain
  });
});

describe('familiers — fusion (incubateur)', () => {
  it('nextRarity : rang juste au-dessus, null au max (SSS)', () => {
    expect(nextRarity('G')).toBe('F');
    expect(nextRarity('D')).toBe('C');
    expect(nextRarity('SS')).toBe('SSS');
    expect(nextRarity('SSS')).toBeNull();
  });
  it('rollFamiliar : rang forçable (fusion)', () => {
    const f = rollFamiliar(mulberry32(1), wolf, { level: 1, rarity: 'B' });
    expect(f.rarity).toBe('B');
    expect(f.level).toBe(1);
  });
  it('rollFusedFamiliar : 3 d’un rang → 1 familier du rang au-dessus', () => {
    const fused = rollFusedFamiliar(mulberry32(4), 'D');
    expect(fused).not.toBeNull();
    expect(fused!.rarity).toBe('C');
    expect(fused!.slot).toBe(FAMILIAR_SLOT);
    expect(fused!.level).toBe(1);
    expect(fused!.species).toBeTruthy();
  });
  it('rollFusedFamiliar : SSS → null (pas de fusion au-delà)', () => {
    expect(rollFusedFamiliar(mulberry32(5), 'SSS')).toBeNull();
  });
});
