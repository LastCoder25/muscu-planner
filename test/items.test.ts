import { describe, it, expect } from 'vitest';
import {
  aggregateEffects,
  playerWithGear,
  rollDrop,
  itemScore,
  effectiveValue,
  salvageValue,
  sellValue,
  upgradeCost,
  canUpgrade,
  investedDust,
  type Item,
  type Equipped,
} from '@/lib/items';

const item = (over: Partial<Item> & Pick<Item, 'slot' | 'effect'>): Item => ({
  id: over.id ?? 'i',
  name: 'X',
  emoji: '❔',
  rarity: over.rarity ?? 'common',
  level: over.level ?? 1,
  baseLevel: over.baseLevel ?? 1,
  ...over,
});

describe('niveaux d’objet', () => {
  it('effectiveValue grandit avec le niveau (+10 %/niv)', () => {
    const eff = { type: 'damage_pct' as const, value: 10 };
    expect(effectiveValue(eff, 1)).toBe(10);
    expect(effectiveValue(eff, 6)).toBe(Math.round(10 * (1 + 5 * 0.1))); // 15
  });
  it('upgradeCost croît avec le niveau ET la rareté', () => {
    expect(upgradeCost(1, 'common')).toBeLessThan(upgradeCost(5, 'common'));
    expect(upgradeCost(3, 'legendary')).toBeGreaterThan(upgradeCost(3, 'common'));
  });
  it('canUpgrade : faux si poussière insuffisante ou au plafond', () => {
    const it = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 10 }, level: 2 });
    expect(canUpgrade(it, upgradeCost(2, 'common'), 10)).toBe(true);
    expect(canUpgrade(it, upgradeCost(2, 'common') - 1, 10)).toBe(false);
    expect(canUpgrade({ ...it, level: 5 }, 9999, 5)).toBe(false); // au plafond
  });
});

describe('recyclage / vente', () => {
  it('poussière et or croissent avec la rareté', () => {
    const common = item({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 8 },
      rarity: 'common',
    });
    const legendary = item({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 28 },
      rarity: 'legendary',
    });
    expect(salvageValue(legendary)).toBeGreaterThan(salvageValue(common));
    expect(sellValue(legendary)).toBeGreaterThan(sellValue(common));
  });
  it('le recyclage rembourse la poussière investie (niveaux payés)', () => {
    const rarity = 'rare' as const;
    const invested = upgradeCost(3, rarity) + upgradeCost(4, rarity); // 3→4 et 4→5
    const it = item({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 10 },
      rarity,
      baseLevel: 3, // obtenu niveau 3
      level: 5, // monté à 5
    });
    expect(investedDust(it)).toBe(invested);
    // salvage = base rareté + investi ; on ne rembourse PAS les niveaux non payés (1→3)
    expect(salvageValue(it)).toBe(salvageValue(item({ ...it, level: 3 })) + invested);
  });
});

describe('aggregateEffects', () => {
  it('somme les effets et plafonne la réduction de dégâts à 50 %', () => {
    const eq: Equipped = {
      weapon: item({ slot: 'weapon', effect: { type: 'lifesteal_pct', value: 10 } }),
      armor: item({ slot: 'armor', effect: { type: 'dmg_reduction_pct', value: 80 } }),
      relic: item({ slot: 'relic', effect: { type: 'first_strike', value: 1 } }),
    };
    const a = aggregateEffects(eq);
    expect(a.lifesteal).toBeCloseTo(0.1);
    expect(a.dmgReduction).toBe(0.5); // plafonné
    expect(a.firstStrike).toBe(true);
  });
});

describe('playerWithGear', () => {
  const stats = { puissance: 20, endurance: 30, agilite: 10 };
  it('sans équipement = combattant de base', () => {
    const c = playerWithGear('X', stats, {});
    expect(c.pv).toBe(100 + 30 * 10);
    expect(c.damage).toBe(Math.round(20 * 1.5));
  });
  it('applique +PV, +dégâts, premier coup, vol de vie, réduction', () => {
    const eq: Equipped = {
      weapon: item({ slot: 'weapon', effect: { type: 'damage_pct', value: 50 } }),
      armor: item({ slot: 'armor', effect: { type: 'max_pv_pct', value: 20 } }),
      relic: item({ slot: 'relic', effect: { type: 'first_strike', value: 1 } }),
      accessory: item({ slot: 'accessory', effect: { type: 'gold_pct', value: 15 } }),
    };
    const c = playerWithGear('X', stats, eq);
    expect(c.pv).toBe(Math.round(400 * 1.2)); // 480
    expect(c.damage).toBe(Math.round(30 * 1.5)); // base 30 × 1.5
    expect(c.initiative).toBe(9999); // first strike
  });
});

describe('rollDrop', () => {
  it('pas de butin si aucun monstre vaincu', () => {
    expect(rollDrop(() => 0, { playerLevel: 5, cleared: true, defeated: 0 })).toBeNull();
  });
  it('rng haut → pas de drop', () => {
    expect(rollDrop(() => 0.99, { playerLevel: 5, cleared: true, defeated: 3 })).toBeNull();
  });
  it('rng bas → drop légendaire, démarre au niveau 1', () => {
    const d = rollDrop(() => 0, { playerLevel: 4, cleared: true, defeated: 3 });
    expect(d).not.toBeNull();
    expect(d!.rarity).toBe('legendary');
    expect(d!.level).toBe(1); // les objets montent ensuite via la Poussière
    expect(d!.slot).toBe('weapon');
  });
});

describe('itemScore', () => {
  it('classe par valeur d’effet', () => {
    const a = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 10 } });
    const b = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 25 } });
    expect(itemScore(b)).toBeGreaterThan(itemScore(a));
  });
});
