import { describe, it, expect } from 'vitest';
import {
  aggregateEffects,
  playerWithGear,
  rollDrop,
  rollSetPiece,
  rollTier,
  rankCeilingForLevel,
  RANK_ORDER,
  RARITY_MULT,
  RARITY_RANK,
  normRank,
  fullInfuseCost,
  infuseToMaxCost,
  itemScore,
  effectiveValue,
  salvageValue,
  sellValue,
  upgradeCost,
  canUpgrade,
  setCounts,
  setEffects,
  ITEM_SETS,
  forgeCost,
  forgeItem,
  rerollCost,
  craftSetCost,
  rerolledQuality,
  starQualityMult,
  rollStars,
  type Item,
  type Equipped,
} from '@/lib/items';
import { mulberry32 } from '@/lib/combat';

describe('rangs G→SSS : bandes disjointes', () => {
  it('RANK_MULT strictement croissant (un rang supérieur vaut toujours plus)', () => {
    for (let i = 1; i < RANK_ORDER.length; i++)
      expect(RARITY_MULT[RANK_ORDER[i]!]).toBeGreaterThan(RARITY_MULT[RANK_ORDER[i - 1]!]);
  });
  it('bandes DISJOINTES : meilleure qualité d’un rang < pire qualité du rang au-dessus', () => {
    for (let i = 1; i < RANK_ORDER.length; i++) {
      const topOfLower = RARITY_MULT[RANK_ORDER[i - 1]!] * starQualityMult(5);
      const bottomOfUpper = RARITY_MULT[RANK_ORDER[i]!] * starQualityMult(1);
      expect(bottomOfUpper).toBeGreaterThan(topOfLower);
    }
  });
  it('plafond SSS×qualité5 ≈ 3,98 (plafond de puissance ≈ divin d’avant)', () => {
    expect(RARITY_MULT.SSS * starQualityMult(5)).toBeGreaterThan(3.8);
    expect(RARITY_MULT.SSS * starQualityMult(5)).toBeLessThan(4.1);
  });
  it('normRank : mappe les anciennes raretés vers des rangs valides', () => {
    expect(normRank('divin')).toBe('SSS');
    expect(normRank('common')).toBe('F');
    expect(normRank('A')).toBe('A');
    expect(normRank(undefined)).toBe('G');
  });
});

describe('qualité (sous-rang 1→5)', () => {
  it('starQualityMult strictement croissant, de 1,0 à 1,10', () => {
    expect(starQualityMult(1)).toBe(1);
    expect(starQualityMult(5)).toBeCloseTo(1.1);
    for (let s = 2; s <= 5; s++) expect(starQualityMult(s)).toBeGreaterThan(starQualityMult(s - 1));
  });
  it('rollStars cohérent (roll → étoile)', () => {
    expect(rollStars(0.1)).toBe(1);
    expect(rollStars(0.9)).toBe(5);
  });
});

describe('rollTier : gate de profondeur', () => {
  it('rankCeilingForLevel : racine (rapide tôt, lent tard), SSS très tardif', () => {
    expect(rankCeilingForLevel(1)).toBe(1); // F
    expect(rankCeilingForLevel(6)).toBeGreaterThanOrEqual(2);
    expect(RANK_ORDER[rankCeilingForLevel(90)]).toBe('SSS');
    expect(rankCeilingForLevel(20)).toBeLessThan(9); // pas de SSS avant le très long terme
  });
  it('le rang tiré ne dépasse JAMAIS le plafond de la profondeur', () => {
    for (let level = 1; level <= 100; level += 7) {
      const ceil = rankCeilingForLevel(level);
      for (let s = 1; s <= 60; s++) {
        const { rank } = rollTier(mulberry32(s), level, 1, 0);
        expect(RARITY_RANK[rank]).toBeLessThanOrEqual(ceil);
      }
    }
  });
  it('contenu PROFOND → rangs plus hauts que contenu peu profond', () => {
    const avg = (level: number) => {
      let sum = 0;
      const N = 200;
      for (let s = 1; s <= N; s++) sum += RARITY_RANK[rollTier(mulberry32(s), level, 0.4).rank];
      return sum / N;
    };
    expect(avg(60)).toBeGreaterThan(avg(20));
    expect(avg(20)).toBeGreaterThan(avg(6));
  });
});

const item = (over: Partial<Item> & Pick<Item, 'slot' | 'effect'>): Item => ({
  id: over.id ?? 'i',
  name: 'X',
  emoji: '❔',
  rarity: over.rarity ?? 'G',
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
  it('upgradeCost croît avec le niveau ET le rang', () => {
    expect(upgradeCost(1, 'G')).toBeLessThan(upgradeCost(5, 'G'));
    expect(upgradeCost(3, 'S')).toBeGreaterThan(upgradeCost(3, 'G'));
  });
  it('canUpgrade : faux si poussière insuffisante ou au plafond', () => {
    const it = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 10 }, level: 2 });
    expect(canUpgrade(it, upgradeCost(2, 'G'), 10)).toBe(true);
    expect(canUpgrade(it, upgradeCost(2, 'G') - 1, 10)).toBe(false);
    expect(canUpgrade({ ...it, level: 5 }, 9999, 5)).toBe(false); // au plafond
  });
});

describe('recyclage / vente', () => {
  it('poussière et or croissent avec le rang', () => {
    const low = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 8 }, rarity: 'G' });
    const high = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 28 }, rarity: 'S' });
    expect(salvageValue(high)).toBeGreaterThan(salvageValue(low));
    expect(sellValue(high)).toBeGreaterThan(sellValue(low));
  });
  it('recyclage HISTORY-INDEPENDENT : ne dépend que du rang + niveau', () => {
    const rarity = 'D' as const;
    const dropped = item({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 10 },
      rarity,
      baseLevel: 5,
      level: 5,
    });
    const infused = item({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 10 },
      rarity,
      baseLevel: 1,
      level: 5,
    });
    expect(salvageValue(dropped)).toBe(salvageValue(infused));
    const base1 = salvageValue(item({ ...infused, level: 1 }));
    expect(salvageValue(infused)).toBe(base1 + Math.round(0.5 * fullInfuseCost(5, rarity)));
    expect(salvageValue(item({ ...infused, level: 10 }))).toBeGreaterThan(salvageValue(infused));
  });
});

describe('économie — infusion & coûts', () => {
  it('fullInfuseCost(1) = 0 et croît avec le niveau cible', () => {
    expect(fullInfuseCost(1, 'D')).toBe(0);
    expect(fullInfuseCost(5, 'D')).toBe(
      upgradeCost(1, 'D') + upgradeCost(2, 'D') + upgradeCost(3, 'D') + upgradeCost(4, 'D'),
    );
    expect(fullInfuseCost(10, 'D')).toBeGreaterThan(fullInfuseCost(5, 'D'));
  });
  it('infuseToMaxCost : du niveau actuel jusqu’au cap joueur', () => {
    const lvl1 = item({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 8 },
      rarity: 'G',
      baseLevel: 1,
      level: 1,
    });
    expect(infuseToMaxCost(lvl1, 1)).toBe(0);
    expect(infuseToMaxCost(lvl1, 5)).toBe(fullInfuseCost(5, 'G'));
    expect(infuseToMaxCost({ ...lvl1, level: 3 }, 5)).toBe(
      upgradeCost(3, 'G') + upgradeCost(4, 'G'),
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
    expect(a.dmgReduction).toBe(0.5);
    expect(a.critAdd).toBeCloseTo(0.06);
  });
  it('agrège les épines (thorns) et playerWithGear les propage', () => {
    const eq: Equipped = {
      armor: item({ slot: 'armor', level: 10, effect: { type: 'thorns_pct', value: 20 } }),
    };
    expect(aggregateEffects(eq).thornsPct).toBeGreaterThan(0);
    const c = playerWithGear('X', { puissance: 20, endurance: 30, agilite: 10 }, eq, {}, 10);
    expect(c.thorns).toBeGreaterThan(0);
  });
});

describe('playerWithGear', () => {
  const stats = { puissance: 20, endurance: 30, agilite: 10 };
  const basePv = 100 + 15 * 1 + 30 * 10;
  const baseDmg = Math.round(6 + 10 * 1 + 20 * 1.2);
  it('sans équipement = combattant de base', () => {
    const c = playerWithGear('X', stats, {});
    expect(c.pv).toBe(basePv);
    expect(c.damage).toBe(baseDmg);
  });
  it('applique +PV, +dégâts', () => {
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
  it('drop toujours NIVEAU 1 (refonte C), rang plafonné par la profondeur', () => {
    const d = rollDrop(() => 0, { cleared: true, defeated: 3, level: 6 });
    expect(d).not.toBeNull();
    expect(d!.level).toBe(1);
    expect(d!.baseLevel).toBe(1);
    expect(RARITY_RANK[d!.rarity]).toBeLessThanOrEqual(rankCeilingForLevel(6));
  });
  it('un objet de donjon a UNE seule stat (le set fait la différence)', () => {
    const d = rollDrop(() => 0.2, { cleared: true, defeated: 1, level: 5 });
    expect(d).not.toBeNull();
    expect(d!.effect).toBeDefined();
    expect(d!.effect2).toBeUndefined();
  });
  it('tout drop part du niveau 1, quel que soit le niveau du contenu', () => {
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
  it('chasse au loot : un donjon PROFOND lâche des rangs plus HAUTS (donc + de valeur)', () => {
    const shallow = rollDrop(() => 0, { cleared: true, defeated: 1, level: 5 })!;
    const deep = rollDrop(() => 0, { cleared: true, defeated: 1, level: 90 })!;
    expect(RARITY_RANK[deep.rarity]).toBeGreaterThan(RARITY_RANK[shallow.rarity]);
    expect(deep.effect.value).toBeGreaterThan(shallow.effect.value);
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
      rarity: 'B',
      effect: { type: 'damage_pct', value: 10 },
      setId: 'dragon',
    });

  it('setCounts compte les pièces par set', () => {
    const eq: Equipped = { weapon: dragonPiece('weapon'), armor: dragonPiece('armor') };
    expect(setCounts(eq).dragon).toBe(2);
  });
  it('aucun bonus de set en dessous de 2 pièces', () => {
    expect(setEffects({ weapon: dragonPiece('weapon') }).damagePct).toBe(0);
  });
  it('2 pièces → 1er palier actif (Dragon : +dégâts)', () => {
    const e = setEffects({ weapon: dragonPiece('weapon'), armor: dragonPiece('armor') });
    expect(e.damagePct).toBeGreaterThan(0);
    expect(e.critAdd).toBe(0);
  });
  it('4 pièces → tous les paliers Dragon actifs', () => {
    const e = setEffects({
      weapon: dragonPiece('weapon'),
      armor: dragonPiece('armor'),
      accessory: dragonPiece('accessory'),
      relic: dragonPiece('relic'),
    });
    expect(e.damagePct).toBeGreaterThan(0);
    expect(e.critAdd).toBeGreaterThan(0);
    expect(e.lifesteal).toBeGreaterThan(0);
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
    expect(piece.level).toBe(1);
    expect(piece.baseLevel).toBe(1);
    expect(piece.name).toContain('Dragon');
    expect(piece.effect2).toBeUndefined();
    expect(ITEM_SETS.some((s) => s.id === 'dragon')).toBe(true);
  });
  it('anti-doublon : preferSlot force le slot manquant', () => {
    const piece = rollSetPiece(() => 0.3, { setId: 'dragon', level: 10, preferSlot: 'relic' });
    expect(piece.slot).toBe('relic');
  });
});

describe('atelier de poussière (forge / reroll / craft)', () => {
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
  it('reroll de QUALITÉ : garde le type + le rang, ne touche que la valeur/étoiles', () => {
    const sword = item({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 8 },
      level: 5,
      roll: 0.1,
    });
    expect(rerollCost(sword)).toBeGreaterThan(0);
    const rq = rerolledQuality(mulberry32(2), sword);
    expect(rq.effect.type).toBe('damage_pct');
    expect(rq.effect.value).toBeGreaterThan(0);
    expect(rollStars(rq.roll)).toBeGreaterThanOrEqual(1);
  });
  it('craft de set : coût élevé qui monte avec le niveau', () => {
    expect(craftSetCost(10)).toBeGreaterThan(200);
    expect(craftSetCost(20)).toBeGreaterThan(craftSetCost(10));
  });
  it('coûts qui montent avec le NIVEAU + le rang (reroll)', () => {
    const lo = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 8 }, level: 3 });
    const hi = item({ ...lo, level: 20 });
    expect(rerollCost(hi)).toBeGreaterThan(rerollCost(lo));
    const high = item({ ...lo, rarity: 'A' });
    expect(rerollCost(high)).toBeGreaterThan(rerollCost(lo));
  });
});

describe('effets signature & payoff haut-rang (rollDrop)', () => {
  function scan(level: number, luck: number, n = 4000) {
    const drops = [];
    for (let s = 1; s <= n; s++) {
      const d = rollDrop(mulberry32(s), { cleared: true, defeated: 3, level, luck });
      if (d) drops.push(d);
    }
    return drops;
  }
  it('un objet SS/SSS roule un 2ᵉ effet distinct ; les rangs inférieurs non', () => {
    const drops = scan(80, 1); // contenu très profond → rangs SS/SSS possibles
    const high = drops.find((d) => RARITY_RANK[d.rarity] >= 8);
    expect(high).toBeTruthy();
    expect(high!.effect2).toBeTruthy();
    expect(high!.effect2!.type).not.toBe(high!.effect.type);
    for (const d of drops) if (RARITY_RANK[d.rarity] < 8) expect(d.effect2).toBeUndefined();
  });
  it('les effets signature n’apparaissent qu’en profondeur (gate de niveau)', () => {
    const SIG = new Set(['execute_pct', 'rage_pct', 'momentum_pct']);
    const low = scan(3, 1).filter((d) => SIG.has(d.effect.type));
    const deep = scan(20, 1).filter((d) => SIG.has(d.effect.type));
    expect(low).toHaveLength(0);
    expect(deep.length).toBeGreaterThan(0);
  });
  it('un objet à effet signature porte un nom évocateur', () => {
    const NAMED = [
      'Guillotine',
      'Couperet du Bourreau',
      'Faux des Âmes',
      'Déferlante',
      'Crescendo',
      'Élan Implacable',
      'Cœur du Berserk',
      'Fureur Écarlate',
      'Rage du Damné',
    ];
    const sig = scan(20, 1).find((d) =>
      ['execute_pct', 'rage_pct', 'momentum_pct'].includes(d.effect.type),
    );
    expect(sig).toBeTruthy();
    expect(NAMED).toContain(sig!.name);
  });
});
