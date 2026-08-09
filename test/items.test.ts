import { describe, it, expect } from 'vitest';
import {
  aggregateEffects,
  playerWithGear,
  rollDrop,
  rollSetPiece,
  itemScore,
  effectiveValue,
  salvageValue,
  sellValue,
  upgradeCost,
  canUpgrade,
  investedDust,
  setCounts,
  setEffects,
  ITEM_SETS,
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
  it('effectiveValue grandit avec le niveau (+5 %/niv)', () => {
    const eff = { type: 'damage_pct' as const, value: 10 };
    expect(effectiveValue(eff, 1)).toBe(10);
    expect(effectiveValue(eff, 6)).toBe(Math.round(10 * (1 + 5 * 0.05))); // 13
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
      relic: item({ slot: 'relic', effect: { type: 'crit_pct', value: 6 } }),
    };
    const a = aggregateEffects(eq);
    expect(a.lifesteal).toBeCloseTo(0.1);
    expect(a.dmgReduction).toBe(0.5); // plafonné
    expect(a.critAdd).toBeCloseTo(0.06);
  });
});

describe('playerWithGear', () => {
  const stats = { puissance: 20, endurance: 30, agilite: 10 };
  // Base niveau 1 : pv = 100 + 15×1 + 30×10 = 415 ; dégâts = 6 + 10×1 + 20×1.2 = 40.
  const basePv = 100 + 15 * 1 + 30 * 10;
  const baseDmg = Math.round(6 + 10 * 1 + 20 * 1.2);
  it('sans équipement = combattant de base', () => {
    const c = playerWithGear('X', stats, {});
    expect(c.pv).toBe(basePv);
    expect(c.damage).toBe(baseDmg);
  });
  it('applique +PV, +dégâts, vol de vie, réduction', () => {
    const eq: Equipped = {
      weapon: item({ slot: 'weapon', effect: { type: 'damage_pct', value: 50 } }),
      armor: item({ slot: 'armor', effect: { type: 'max_pv_pct', value: 20 } }),
      relic: item({ slot: 'relic', effect: { type: 'crit_pct', value: 6 } }),
      accessory: item({ slot: 'accessory', effect: { type: 'gold_pct', value: 15 } }),
    };
    const c = playerWithGear('X', stats, eq);
    expect(c.pv).toBe(Math.round(basePv * 1.2));
    expect(c.damage).toBe(Math.round(baseDmg * 1.5));
  });
});

describe('rollDrop', () => {
  it('pas de butin si aucun monstre vaincu', () => {
    expect(rollDrop(() => 0, { cleared: true, defeated: 0 })).toBeNull();
  });
  it('rng haut → pas de drop', () => {
    expect(rollDrop(() => 0.99, { cleared: true, defeated: 3 })).toBeNull();
  });
  it('rng bas → drop légendaire au niveau du donjon (découplé du joueur)', () => {
    const d = rollDrop(() => 0, { cleared: true, defeated: 3, level: 6 });
    expect(d).not.toBeNull();
    expect(d!.rarity).toBe('legendary');
    expect(d!.level).toBe(6); // fixé par le donjon, pas par le joueur
    expect(d!.slot).toBe('weapon');
  });
  it('un objet de donjon a UNE seule stat (le set fait la différence)', () => {
    const d = rollDrop(() => 0.2, { cleared: true, defeated: 1, level: 5 });
    expect(d).not.toBeNull();
    expect(d!.effect).toBeDefined();
    expect(d!.effect2).toBeUndefined();
  });
  it('spread → le drop peut tomber SOUS le niveau du donjon, jamais au-dessus', () => {
    // rng=0.9 pour le tirage de niveau → base - floor(0.9*(spread+1))
    const d = rollDrop(() => 0.001, { cleared: true, defeated: 1, level: 8, spread: 2 });
    expect(d).not.toBeNull();
    expect(d!.level).toBeLessThanOrEqual(8);
    expect(d!.level).toBeGreaterThanOrEqual(6); // 8 - 2 au plus bas
  });
});

describe('itemScore', () => {
  it('classe par valeur d’effet', () => {
    const a = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 10 } });
    const b = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 25 } });
    expect(itemScore(b)).toBeGreaterThan(itemScore(a));
  });
});

describe('sets d’équipement', () => {
  const dragonPiece = (slot: Item['slot']): Item =>
    item({
      id: `d-${slot}`,
      slot,
      rarity: 'epic',
      effect: { type: 'damage_pct', value: 10 },
      setId: 'dragon',
    });

  it('setCounts compte les pièces par set', () => {
    const eq: Equipped = { weapon: dragonPiece('weapon'), armor: dragonPiece('armor') };
    expect(setCounts(eq).dragon).toBe(2);
  });

  it('aucun bonus de set en dessous de 2 pièces', () => {
    const eq: Equipped = { weapon: dragonPiece('weapon') };
    const e = setEffects(eq);
    expect(e.damagePct).toBe(0);
  });

  it('2 pièces → 1er palier actif (Dragon : +dégâts)', () => {
    const eq: Equipped = { weapon: dragonPiece('weapon'), armor: dragonPiece('armor') };
    const e = setEffects(eq);
    expect(e.damagePct).toBeGreaterThan(0);
    expect(e.critAdd).toBe(0); // palier 3 pièces pas encore atteint
  });

  it('4 pièces → tous les paliers Dragon actifs', () => {
    const eq: Equipped = {
      weapon: dragonPiece('weapon'),
      armor: dragonPiece('armor'),
      accessory: dragonPiece('accessory'),
      relic: dragonPiece('relic'),
    };
    const e = setEffects(eq);
    expect(e.damagePct).toBeGreaterThan(0);
    expect(e.critAdd).toBeGreaterThan(0);
    expect(e.lifesteal).toBeGreaterThan(0);
  });

  it('aggregateEffects inclut les bonus de set', () => {
    const eq: Equipped = { weapon: dragonPiece('weapon'), armor: dragonPiece('armor') };
    const withSet = aggregateEffects(eq).damagePct;
    const noSet = aggregateEffects({
      weapon: { ...dragonPiece('weapon'), setId: undefined },
      armor: { ...dragonPiece('armor'), setId: undefined },
    }).damagePct;
    expect(withSet).toBeGreaterThan(noSet);
  });

  it('le bonus de set grandit avec le niveau des pièces', () => {
    const lvl1: Equipped = {
      weapon: { ...dragonPiece('weapon'), level: 1 },
      armor: { ...dragonPiece('armor'), level: 1 },
    };
    const lvl10: Equipped = {
      weapon: { ...dragonPiece('weapon'), level: 10 },
      armor: { ...dragonPiece('armor'), level: 10 },
    };
    expect(setEffects(lvl10).damagePct).toBeGreaterThan(setEffects(lvl1).damagePct);
  });

  it('rollSetPiece produit toujours une pièce du set, au niveau plein du palier', () => {
    const piece = rollSetPiece(() => 0.3, { setId: 'dragon', level: 10 });
    expect(piece.setId).toBe('dragon');
    expect(piece.level).toBe(10); // niveau plein du palier (boss)
    expect(piece.baseLevel).toBe(10);
    expect(piece.name).toContain('Dragon');
    expect(piece.effect2).toBeUndefined(); // 1 stat + synergie de set (pas de 2e stat)
    expect(ITEM_SETS.some((s) => s.id === 'dragon')).toBe(true);
  });
  it('anti-doublon : preferSlot force le slot manquant', () => {
    const piece = rollSetPiece(() => 0.3, { setId: 'dragon', level: 10, preferSlot: 'relic' });
    expect(piece.slot).toBe('relic');
  });
});
