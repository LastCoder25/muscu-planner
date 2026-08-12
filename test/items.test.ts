import { describe, it, expect } from 'vitest';
import {
  aggregateEffects,
  playerWithGear,
  rollDrop,
  rollSetPiece,
  commonDecayForLevel,
  fullInfuseCost,
  infuseToMaxCost,
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
  forgeCost,
  forgeItem,
  rerollCost,
  rerolledEffect,
  craftSetCost,
  type Item,
  type Equipped,
} from '@/lib/items';
import { mulberry32 } from '@/lib/combat';

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
  it('recyclage HISTORY-INDEPENDENT (refonte C) : ne dépend que de rareté + niveau', () => {
    const rarity = 'rare' as const;
    // Deux objets AU MÊME NIVEAU se recyclent PAREIL, quel que soit leur baseLevel
    // (un droppé niv.5 = un niv.1 infusé →5). Fin de l'incohérence « bête ».
    const dropped = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 10 }, rarity, baseLevel: 5, level: 5 });
    const infused = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 10 }, rarity, baseLevel: 1, level: 5 });
    expect(salvageValue(dropped)).toBe(salvageValue(infused));
    // = base rareté (= salvage d'un niv.1) + 50 % du coût de construction 1→niveau.
    const base1 = salvageValue(item({ ...infused, level: 1 }));
    expect(salvageValue(infused)).toBe(base1 + Math.round(0.5 * fullInfuseCost(5, rarity)));
    // Un niveau plus haut rend plus (le coût cumulé monte).
    expect(salvageValue(item({ ...infused, level: 10 }))).toBeGreaterThan(salvageValue(infused));
  });
});

describe('économie C — infusion & coûts', () => {
  it('upgradeCost croît avec le niveau et la rareté', () => {
    expect(upgradeCost(1, 'common')).toBeLessThan(upgradeCost(10, 'common'));
    expect(upgradeCost(5, 'divin')).toBeGreaterThan(upgradeCost(5, 'common'));
  });
  it('fullInfuseCost(1) = 0 et croît avec le niveau cible', () => {
    expect(fullInfuseCost(1, 'rare')).toBe(0);
    expect(fullInfuseCost(5, 'rare')).toBe(
      upgradeCost(1, 'rare') + upgradeCost(2, 'rare') + upgradeCost(3, 'rare') + upgradeCost(4, 'rare'),
    );
    expect(fullInfuseCost(10, 'rare')).toBeGreaterThan(fullInfuseCost(5, 'rare'));
  });
  it('infuseToMaxCost : du niveau actuel jusqu’au cap joueur', () => {
    const lvl1 = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 8 }, rarity: 'common', baseLevel: 1, level: 1 });
    expect(infuseToMaxCost(lvl1, 1)).toBe(0); // déjà au cap
    expect(infuseToMaxCost(lvl1, 5)).toBe(fullInfuseCost(5, 'common'));
    expect(infuseToMaxCost({ ...lvl1, level: 3 }, 5)).toBe(
      upgradeCost(3, 'common') + upgradeCost(4, 'common'),
    );
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
  it('rng bas → drop de la rareté ULTIME (divin), toujours NIVEAU 1 (refonte C)', () => {
    const d = rollDrop(() => 0, { cleared: true, defeated: 3, level: 6 });
    expect(d).not.toBeNull();
    expect(d!.rarity).toBe('divin'); // rng=0 → tier le plus rare
    expect(d!.level).toBe(1); // REFONTE C : identité pure, la puissance se construit
    expect(d!.baseLevel).toBe(1);
    expect(d!.slot).toBe('weapon');
  });
  it('un objet de donjon a UNE seule stat (le set fait la différence)', () => {
    const d = rollDrop(() => 0.2, { cleared: true, defeated: 1, level: 5 });
    expect(d).not.toBeNull();
    expect(d!.effect).toBeDefined();
    expect(d!.effect2).toBeUndefined();
  });
  it('REFONTE C : tout drop part du niveau 1, quel que soit le niveau du contenu', () => {
    for (const level of [1, 8, 20, 40]) {
      for (let s = 1; s <= 12; s++) {
        const d = rollDrop(mulberry32(s), { cleared: true, defeated: 1, level });
        if (d) {
          expect(d.level).toBe(1);
          expect(d.baseLevel).toBe(1);
        }
      }
    }
  });
  it('variance de roll ±20 % : rng=0 → valeur × 0.8 (weapon/dégâts divin = round(8×3.8×0.8))', () => {
    const d = rollDrop(() => 0, { cleared: true, defeated: 1, level: 6 });
    expect(d!.effect.type).toBe('damage_pct');
    expect(d!.effect.value).toBe(Math.round(8 * 3.8 * 0.8)); // = 24
  });
  it('pool progressif : au niveau 1, aucune stat exotique (crit/vol de vie/réduction)', () => {
    const exotic = new Set(['crit_pct', 'lifesteal_pct', 'dmg_reduction_pct']);
    for (let s = 1; s <= 80; s++) {
      const d = rollDrop(mulberry32(s), { cleared: true, defeated: 1, level: 1 });
      if (d) expect(exotic.has(d.effect.type)).toBe(false);
    }
  });
  it('pool progressif : le crit peut tomber une fois débloqué (niv ≥ 5)', () => {
    let sawCrit = false;
    for (let s = 1; s <= 300 && !sawCrit; s++) {
      const d = rollDrop(mulberry32(s), { cleared: true, defeated: 1, level: 10, luck: 1 });
      if (d?.effect.type === 'crit_pct') sawCrit = true;
    }
    expect(sawCrit).toBe(true);
  });
});

describe('raretés — communs progressifs (commonDecay)', () => {
  it('commonDecayForLevel : borné [0,1] et croissant', () => {
    expect(commonDecayForLevel(1)).toBe(0);
    expect(commonDecayForLevel(2)).toBe(0);
    expect(commonDecayForLevel(24)).toBe(1);
    expect(commonDecayForLevel(100)).toBe(1);
    expect(commonDecayForLevel(12)).toBeGreaterThan(commonDecayForLevel(6));
  });
  it('les communs REVIENNENT au-dessus du niveau 5 (plus de couperet)', () => {
    let sawCommon = false;
    for (let s = 1; s <= 200 && !sawCommon; s++) {
      const d = rollDrop(mulberry32(s), { cleared: true, defeated: 1, level: 10 });
      if (d?.rarity === 'common') sawCommon = true;
    }
    expect(sawCommon).toBe(true);
  });
  it('moins de communs sur un donjon HAUT niveau que BAS niveau', () => {
    const commonShare = (level: number): number => {
      let n = 0;
      let common = 0;
      for (let s = 1; s <= 600; s++) {
        const d = rollDrop(mulberry32(s), { cleared: true, defeated: 1, level });
        if (d) {
          n++;
          if (d.rarity === 'common') common++;
        }
      }
      return n ? common / n : 0;
    };
    expect(commonShare(3)).toBeGreaterThan(commonShare(22));
    expect(commonShare(22)).toBeGreaterThan(0); // jamais zéro (les communs subsistent)
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

  it('rollSetPiece produit toujours une pièce du set, au NIVEAU 1 (refonte C)', () => {
    const piece = rollSetPiece(() => 0.3, { setId: 'dragon', level: 10 });
    expect(piece.setId).toBe('dragon');
    expect(piece.level).toBe(1); // REFONTE C : identité (set) niv.1 → à infuser
    expect(piece.baseLevel).toBe(1);
    expect(piece.name).toContain('Dragon');
    expect(piece.effect2).toBeUndefined(); // 1 stat + synergie de set (pas de 2e stat)
    expect(ITEM_SETS.some((s) => s.id === 'dragon')).toBe(true);
  });
  it('anti-doublon : preferSlot force le slot manquant', () => {
    const piece = rollSetPiece(() => 0.3, { setId: 'dragon', level: 10, preferSlot: 'relic' });
    expect(piece.slot).toBe('relic');
  });
});

describe('atelier de poussière (forge / reroll / infusion / craft)', () => {
  it('forge : ciblé coûte plus que l’aléatoire, et ça monte avec le niveau', () => {
    expect(forgeCost(10, true)).toBeGreaterThan(forgeCost(10, false));
    expect(forgeCost(20, false)).toBeGreaterThan(forgeCost(5, false));
  });
  it('forge : objet neuf au niveau demandé, slot respecté si ciblé', () => {
    const it = forgeItem(mulberry32(1), { level: 8, slot: 'weapon' });
    expect(it.slot).toBe('weapon');
    expect(it.level).toBe(8);
    expect(it.effect.value).toBeGreaterThan(0);
  });
  it('reroll : nouvel effet valide pour le slot, coût > 0', () => {
    const sword = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 8 }, level: 5 });
    expect(rerollCost(sword)).toBeGreaterThan(0);
    const eff = rerolledEffect(mulberry32(2), sword);
    expect(['damage_pct', 'crit_pct', 'lifesteal_pct']).toContain(eff.type);
  });
  it('craft de set : coût élevé qui monte avec le niveau', () => {
    expect(craftSetCost(10)).toBeGreaterThan(200);
    expect(craftSetCost(20)).toBeGreaterThan(craftSetCost(10));
  });
  it('coûts qui montent avec le NIVEAU + la rareté (forge/reroll)', () => {
    expect(forgeCost(20, false)).toBeGreaterThan(forgeCost(5, false));
    const lo = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 8 }, level: 3 });
    const hi = item({ ...lo, level: 20 });
    expect(rerollCost(hi)).toBeGreaterThan(rerollCost(lo));
    const epic = item({ ...lo, rarity: 'epic' });
    expect(rerollCost(epic)).toBeGreaterThan(rerollCost(lo)); // rareté enchérit
  });
});

describe('effets signature & payoff divin (rollDrop)', () => {
  // Balaye des seeds déterministes et collecte les drops correspondants.
  function scan(level: number, luck: number, n = 4000) {
    const drops = [];
    for (let s = 1; s <= n; s++) {
      const d = rollDrop(mulberry32(s), { cleared: true, defeated: 3, level, luck });
      if (d) drops.push(d);
    }
    return drops;
  }

  it('un DIVIN roule un 2ᵉ effet distinct (double affixe) ; les autres non', () => {
    const drops = scan(20, 1); // luck haute → des divins apparaissent
    const divin = drops.find((d) => d.rarity === 'divin');
    expect(divin).toBeTruthy();
    expect(divin!.effect2).toBeTruthy();
    expect(divin!.effect2!.type).not.toBe(divin!.effect.type);
    // Aucune rareté sous divin ne porte de 2ᵉ effet.
    for (const d of drops) if (d.rarity !== 'divin') expect(d.effect2).toBeUndefined();
  });

  it('les effets signature n’apparaissent qu’en profondeur (gate de niveau)', () => {
    const SIG = new Set(['execute_pct', 'rage_pct', 'momentum_pct']);
    const low = scan(3, 1).filter((d) => SIG.has(d.effect.type));
    const deep = scan(20, 1).filter((d) => SIG.has(d.effect.type));
    expect(low).toHaveLength(0); // < niv.12 → jamais de signature
    expect(deep.length).toBeGreaterThan(0); // profond → on en trouve
  });

  it('un objet à effet signature porte un nom évocateur (pas « … mythique »)', () => {
    const NAMED = ['Guillotine', 'Couperet du Bourreau', 'Faux des Âmes', 'Déferlante',
      'Crescendo', 'Élan Implacable', 'Cœur du Berserk', 'Fureur Écarlate', 'Rage du Damné'];
    const sig = scan(20, 1).find((d) =>
      ['execute_pct', 'rage_pct', 'momentum_pct'].includes(d.effect.type),
    );
    expect(sig).toBeTruthy();
    expect(NAMED).toContain(sig!.name);
  });
})
