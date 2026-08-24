import { describe, it, expect } from 'vitest';
import {
  aggregateEffects,
  playerWithGear,
  rollDrop,
  rollSetPiece,
  rollTier,
  dropBand,
  dropBandLabel,
  dropPeakRank,
  rankCeilingForLevel,
  RANK_ORDER,
  RARITY_MULT,
  RARITY_RANK,
  affixCountForRarity,
  rollItemLevel,
  rollLegendaryProc,
  legendaryOf,
  aggregateLegendaries,
  LEGENDARY_PROCS,
  LEGENDARY_MIN_RANK,
  magicFindLuck,
  SLOTS,
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
  rankRollMult,
  rollJet,
  swapLoadoutGear,
  type Item,
  type Equipped,
  enchantMult,
  ENCHANT_MAX,
} from '@/lib/items';
import { mulberry32 } from '@/lib/combat';
import { VOIES } from '@/lib/voies';

describe('rangs G→SSS + intervalle de jet (refonte v0.574)', () => {
  it('RANK_MULT strictement croissant (plancher d’un rang < plancher du suivant)', () => {
    for (let i = 1; i < RANK_ORDER.length; i++)
      expect(RARITY_MULT[RANK_ORDER[i]!]).toBeGreaterThan(RARITY_MULT[RANK_ORDER[i - 1]!]);
  });
  it('rankRollMult : le jet balaie TOUT l’intervalle du rang (plancher → plancher suivant)', () => {
    for (let i = 0; i < RANK_ORDER.length - 1; i++) {
      const r = RANK_ORDER[i]!;
      expect(rankRollMult(r, 0)).toBeCloseTo(RARITY_MULT[r]); // jet 0 = plancher du rang
      // jet 100 % ≈ plancher du rang SUIVANT (chevauchement voulu : excellent bas-rang ≈ mauvais rang+1)
      expect(rankRollMult(r, 1)).toBeCloseTo(RARITY_MULT[RANK_ORDER[i + 1]!]);
      expect(rankRollMult(r, 0.5)).toBeGreaterThan(rankRollMult(r, 0)); // monotone en jet
    }
  });
  it('plafond SSS (jet 100 %) ≈ 4,2 (plafond de puissance)', () => {
    expect(rankRollMult('primordial', 1)).toBeGreaterThan(4);
    expect(rankRollMult('primordial', 1)).toBeLessThan(4.5);
  });
  it('normRank : mappe les anciennes raretés vers des rangs valides', () => {
    expect(normRank('divin')).toBe('primordial');
    expect(normRank('common')).toBe('commun');
    expect(normRank('SSS')).toBe('primordial'); // legacy rang → rareté
    expect(normRank('legendaire')).toBe('legendaire');
    expect(normRank(undefined)).toBe('commun');
  });
});

describe('jet (0..100 %)', () => {
  it('rollJet : roll → pourcentage', () => {
    expect(rollJet(0)).toBe(0);
    expect(rollJet(0.79)).toBe(79);
    expect(rollJet(1)).toBe(100);
    expect(rollJet(undefined)).toBe(0);
  });
});

describe('rollTier : pyramide de rareté centrée sur le niveau', () => {
  it('rankCeilingForLevel : racine (rapide tôt, lent tard), Primordial très tardif', () => {
    expect(rankCeilingForLevel(1)).toBe(0); // Commun
    expect(rankCeilingForLevel(20)).toBeGreaterThanOrEqual(3);
    expect(RANK_ORDER[rankCeilingForLevel(90)]).toBe('primordial');
    expect(rankCeilingForLevel(20)).toBeLessThan(7); // pas de Primordial avant le très long terme
  });
  it('PIC de la pyramide = rang du niveau (mode = rankCeilingForLevel)', () => {
    for (const lv of [10, 20, 40, 60]) {
      const c = new Array(10).fill(0) as number[];
      for (let s = 1; s <= 3000; s++) c[RARITY_RANK[rollTier(mulberry32(s * 7 + lv), lv).rank]]!++;
      const modal = c.indexOf(Math.max(...c));
      expect(modal).toBe(rankCeilingForLevel(lv));
    }
  });
  it('pyramide : traîne BASSE (fourrage) large ET pointe HAUTE (jackpot) rare autour du pic', () => {
    const lv = 40;
    const center = rankCeilingForLevel(lv);
    let below = 0;
    let above = 0;
    const N = 4000;
    for (let s = 1; s <= N; s++) {
      const r = RARITY_RANK[rollTier(mulberry32(s * 3 + 1), lv, 0.3).rank];
      if (r < center) below++;
      if (r > center) above++;
    }
    expect(below / N).toBeGreaterThan(0.15); // fourrage présent (rangs inférieurs)
    expect(above / N).toBeGreaterThan(0.02); // on PEUT drop au-dessus (façon ARPG)
    expect(below).toBeGreaterThan(above); // traîne basse plus large que la pointe haute
  });
  it('CAP anti-runaway : le rang reste centré sur le JOUEUR (+2 max), pas sur le donjon', () => {
    // Contenu très profond (85) mais joueur bas niveau (19) → le centre = min(85,19) = 19,
    // le rang ne peut dépasser ceiling(19) + 2 (borne douce du jackpot), jamais SSS.
    const playerLevel = 19;
    const capCeil = Math.min(9, rankCeilingForLevel(playerLevel) + 2);
    for (let s = 1; s <= 200; s++) {
      const d = rollDrop(mulberry32(s * 13 + 1), {
        cleared: true,
        defeated: 1,
        level: 85,
        luck: 1,
        playerLevel,
      });
      if (d) expect(RARITY_RANK[d.rarity]).toBeLessThanOrEqual(capCeil);
    }
    // Le centre suit le JOUEUR (min contenu/joueur) : un bas-niveau en donjon profond
    // reste centré sur SON rang (le pic ≈ ceiling(joueur)), pas sur celui du donjon.
    const c = new Array(10).fill(0) as number[];
    for (let s = 1; s <= 2000; s++) {
      const d = rollDrop(mulberry32(s * 5 + 7), {
        cleared: true,
        defeated: 1,
        level: 85,
        luck: 0.3,
        playerLevel,
      });
      if (d) c[RARITY_RANK[d.rarity]]!++;
    }
    expect(c.indexOf(Math.max(...c))).toBe(rankCeilingForLevel(playerLevel));
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
  it('jet CONTINU : le roll varie continûment (chasse au meilleur jet)', () => {
    const rolls = new Set<number>();
    for (let s = 1; s <= 200; s++) rolls.add(rollTier(mulberry32(s * 5 + 1), 30, 0.3).roll);
    expect(rolls.size).toBeGreaterThan(150); // continu (pas de crans discrets)
  });
  it('luck : épaissit la pointe HAUTE (plus de sur-rang) sans casser le cap joueur', () => {
    const overRate = (luck: number) => {
      const lv = 30;
      const center = rankCeilingForLevel(lv);
      let over = 0;
      const N = 4000;
      for (let s = 1; s <= N; s++)
        if (RARITY_RANK[rollTier(mulberry32(s * 11 + 1), lv, luck).rank] > center) over++;
      return over / N;
    };
    expect(overRate(0.8)).toBeGreaterThan(overRate(0));
    // centre joueur respecté même à luck 1 (contenu profond, joueur bas) : ≤ ceiling(20)+2
    const cap = Math.min(9, rankCeilingForLevel(20) + 2);
    for (let s = 1; s <= 300; s++)
      expect(RARITY_RANK[rollTier(mulberry32(s), 40, 1, 0, 20).rank]).toBeLessThanOrEqual(cap);
  });
  it('dropBand : bande cohérente (lo ≤ hi) et qui monte avec le niveau', () => {
    const ri = (r: string) => RARITY_RANK[r as keyof typeof RARITY_RANK];
    for (const lv of [4, 12, 25, 60]) {
      const b = dropBand(lv, 0.4);
      expect(ri(b.lo.rank)).toBeLessThanOrEqual(ri(b.hi.rank));
    }
    expect(ri(dropBand(30, 0.4).hi.rank)).toBeGreaterThan(ri(dropBand(12, 0.4).hi.rank));
    expect(ri(dropBand(20, 0.9).hi.rank)).toBeGreaterThanOrEqual(ri(dropBand(20, 0).hi.rank));
    expect(typeof dropBandLabel(12, 0.5)).toBe('string');
  });
  it('dropPeakRank = rang le plus probable (pic = ceiling de min(contenu, joueur))', () => {
    for (const lv of [10, 20, 40, 60])
      expect(dropPeakRank(lv)).toBe(RANK_ORDER[rankCeilingForLevel(lv)]);
    // capé par le joueur : contenu profond, joueur bas → pic sur le rang du JOUEUR
    expect(dropPeakRank(85, 0, 0, 20)).toBe(RANK_ORDER[rankCeilingForLevel(20)]);
  });
});

const item = (over: Partial<Item> & Pick<Item, 'slot' | 'effect'>): Item => ({
  id: over.id ?? 'i',
  name: 'X',
  emoji: '❔',
  rarity: over.rarity ?? 'commun',
  level: over.level ?? 1,
  baseLevel: over.baseLevel ?? 1,
  ...over,
});

describe('niveaux d’objet', () => {
  it('effectiveValue grandit avec le niveau de l’objet (ilvl, +0,6 %/niv)', () => {
    const eff = { type: 'damage_pct' as const, value: 10 };
    expect(effectiveValue(eff, 1)).toBe(10);
    expect(effectiveValue(eff, 51)).toBe(Math.round(10 * (1 + 50 * 0.006))); // 13
    expect(effectiveValue(eff, 100)).toBeGreaterThan(effectiveValue(eff, 50)); // monotone
  });
  it('upgradeCost croît avec le niveau ET le rang', () => {
    expect(upgradeCost(1, 'commun')).toBeLessThan(upgradeCost(5, 'commun'));
    expect(upgradeCost(3, 'legendaire')).toBeGreaterThan(upgradeCost(3, 'commun'));
  });
  it('canUpgrade : faux si poussière insuffisante ou au plafond', () => {
    const it = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 10 }, level: 2 });
    expect(canUpgrade(it, upgradeCost(2, 'commun'), 10)).toBe(true);
    expect(canUpgrade(it, upgradeCost(2, 'commun') - 1, 10)).toBe(false);
    expect(canUpgrade({ ...it, level: 5 }, 9999, 5)).toBe(false); // au plafond
  });
});

describe('recyclage / vente', () => {
  it('poussière et or croissent avec le rang', () => {
    const low = item({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 8 },
      rarity: 'commun',
    });
    const high = item({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 28 },
      rarity: 'legendaire',
    });
    expect(salvageValue(high)).toBeGreaterThan(salvageValue(low));
    expect(sellValue(high)).toBeGreaterThan(sellValue(low));
  });
  it('recyclage/vente : poussière & or ∝ RANG (enchant retiré)', () => {
    const rarity = 'magique' as const;
    const base = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 10 }, rarity });
    // rang plus haut → plus de poussière ET plus d'or (base de rang, plus d'axe enchant)
    const higher = item({ ...base, rarity: 'legendaire' });
    expect(salvageValue(higher)).toBeGreaterThan(salvageValue(base));
    expect(sellValue(higher)).toBeGreaterThan(sellValue(base));
  });
});

describe('économie — infusion & coûts', () => {
  it('fullInfuseCost(1) = 0 et croît avec le niveau cible', () => {
    expect(fullInfuseCost(1, 'magique')).toBe(0);
    expect(fullInfuseCost(5, 'magique')).toBe(
      upgradeCost(1, 'magique') +
        upgradeCost(2, 'magique') +
        upgradeCost(3, 'magique') +
        upgradeCost(4, 'magique'),
    );
    expect(fullInfuseCost(10, 'magique')).toBeGreaterThan(fullInfuseCost(5, 'magique'));
  });
  it('infuseToMaxCost : du niveau actuel jusqu’au cap joueur', () => {
    const lvl1 = item({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 8 },
      rarity: 'commun',
      baseLevel: 1,
      level: 1,
    });
    expect(infuseToMaxCost(lvl1, 1)).toBe(0);
    expect(infuseToMaxCost(lvl1, 5)).toBe(fullInfuseCost(5, 'commun'));
    expect(infuseToMaxCost({ ...lvl1, level: 3 }, 5)).toBe(
      upgradeCost(3, 'commun') + upgradeCost(4, 'commun'),
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
  it('rang plafonné (anti-runaway) + ilvl cohérent (pyramide bornée)', () => {
    let d: Item | null = null;
    for (let s = 1; d == null && s <= 50; s++)
      d = rollDrop(mulberry32(s), { cleared: true, defeated: 3, level: 6, playerLevel: 6 });
    expect(d).not.toBeNull();
    expect(RARITY_RANK[d!.rarity]).toBeLessThanOrEqual(Math.min(9, rankCeilingForLevel(6) + 2));
    // ilvl = pyramide centrée sur min(6,6)=6, bornée à +9 max (luck) et floorée à 1.
    expect(d!.level).toBeGreaterThanOrEqual(1);
    expect(d!.level).toBeLessThanOrEqual(6 + 9);
    expect(d!.baseLevel).toBe(d!.level);
  });
  it('nombre d’affixes = affixCountForRarity (multi-affixe, Phase 2)', () => {
    for (let s = 1; s <= 200; s++) {
      const d = rollDrop(mulberry32(s), { cleared: true, defeated: 3, level: 60, luck: 1 });
      if (!d) continue;
      const n = affixCountForRarity(d.rarity);
      const got = 1 + (d.effect2 ? 1 : 0) + (d.effect3 ? 1 : 0);
      expect(got).toBe(n);
      // affixes distincts
      const types = [d.effect.type, d.effect2?.type, d.effect3?.type].filter(Boolean);
      expect(new Set(types).size).toBe(types.length);
    }
  });
  it('ilvl = pyramide centrée sur min(contenu, joueur), bornée', () => {
    for (const level of [1, 8, 20, 40]) {
      for (let s = 1; s <= 12; s++) {
        const d = rollDrop(mulberry32(s), {
          cleared: true,
          defeated: 1,
          level,
          playerLevel: level,
        });
        if (d) {
          expect(d.level).toBeGreaterThanOrEqual(1);
          expect(d.level).toBeLessThanOrEqual(level + 9); // borne haute (luck max)
          expect(d.baseLevel).toBe(d.level);
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
  it('tiers d’affixe : #1 toujours MAJEUR, #2 SECONDAIRE, #3 MINEUR', () => {
    const MAJOR = new Set(['damage_pct', 'max_pv_pct', 'dmg_reduction_pct', 'crit_pct']);
    const SECONDARY = new Set([
      'lifesteal_pct',
      'thorns_pct',
      'execute_pct',
      'rage_pct',
      'momentum_pct',
    ]);
    const MINOR = new Set(['gold_pct', 'magic_find_pct', 'regen_pct', 'initiative_pct']);
    for (let s = 1; s <= 400; s++) {
      const d = rollDrop(mulberry32(s), { cleared: true, defeated: 1, level: 60, luck: 1 });
      if (!d) continue;
      expect(MAJOR.has(d.effect.type)).toBe(true); // affixe #1 = majeur
      if (d.effect2) expect(SECONDARY.has(d.effect2.type)).toBe(true); // #2 = secondaire
      if (d.effect3) expect(MINOR.has(d.effect3.type)).toBe(true); // #3 = mineur
    }
  });
  it('tier majeur dispo dès le niveau 1 (crit/réduction ne sont plus gatés)', () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 400; s++) {
      const d = rollDrop(mulberry32(s), { cleared: true, defeated: 1, level: 1, luck: 1 });
      if (d) seen.add(d.effect.type);
    }
    // au niveau 1, on voit plusieurs stats majeures (dont crit/réduction, désormais du core).
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
  it('les stats MINEURES ne tombent que sur l’affixe #3 (Épique+), jamais en #1/#2', () => {
    const MINOR = new Set(['gold_pct', 'magic_find_pct', 'regen_pct', 'initiative_pct']);
    for (let s = 1; s <= 400; s++) {
      const d = rollDrop(mulberry32(s), { cleared: true, defeated: 1, level: 60, luck: 1 });
      if (!d) continue;
      expect(MINOR.has(d.effect.type)).toBe(false);
      if (d.effect2) expect(MINOR.has(d.effect2.type)).toBe(false);
    }
  });
});

describe('itemScore', () => {
  it('classe par valeur d’effet', () => {
    const a = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 10 } });
    const b = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 25 } });
    expect(itemScore(b)).toBeGreaterThan(itemScore(a));
  });
});

// Sets de VOIE (v0.565) : 8 sets, thème = stats de la voie ; le 4-pièces est un CAPSTONE
// gaté par la voie du joueur. Le set Berserker = [damage(capstone/4pc), execute(3pc), lifesteal(2pc)].
describe('sets d’équipement (voie)', () => {
  const BERS = 'voie:berserker';
  const bersPiece = (slot: Item['slot']): Item =>
    item({
      id: `b-${slot}`,
      slot,
      rarity: 'epique',
      effect: { type: 'damage_pct', value: 10 },
      setId: BERS,
    });
  const fullBers = (): Equipped => ({
    weapon: bersPiece('weapon'),
    armor: bersPiece('armor'),
    accessory: bersPiece('accessory'),
    relic: bersPiece('relic'),
  });

  it('setCounts compte les pièces par set', () => {
    const eq: Equipped = { weapon: bersPiece('weapon'), armor: bersPiece('armor') };
    expect(setCounts(eq)[BERS]).toBe(2);
  });
  it('aucun bonus de set en dessous de 2 pièces', () => {
    const e = setEffects({ weapon: bersPiece('weapon') }, 'berserker');
    expect(e.damagePct + e.lifesteal + e.executePct).toBe(0);
  });
  it('2 pièces → 1er palier actif (2-pièces = vol de vie)', () => {
    const e = setEffects({ weapon: bersPiece('weapon'), armor: bersPiece('armor') }, 'berserker');
    expect(e.lifesteal).toBeGreaterThan(0);
    expect(e.damagePct).toBe(0); // le capstone (4pc) n'est pas encore là
  });
  it('4 pièces + voie CORRESPONDANTE → capstone (4pc dégâts) actif', () => {
    const e = setEffects(fullBers(), 'berserker');
    expect(e.lifesteal).toBeGreaterThan(0); // 2pc
    expect(e.executePct).toBeGreaterThan(0); // 3pc
    expect(e.damagePct).toBeGreaterThan(0); // 4pc CAPSTONE
  });
  it('4 pièces mais voie DIFFÉRENTE → capstone NON appliqué (2/3pc seulement)', () => {
    const e = setEffects(fullBers(), 'gardien');
    expect(e.lifesteal).toBeGreaterThan(0); // 2pc (stats brutes pour tous)
    expect(e.executePct).toBeGreaterThan(0); // 3pc
    expect(e.damagePct).toBe(0); // capstone gaté par la voie → rien
  });
  it('sans voie → capstone jamais appliqué', () => {
    expect(setEffects(fullBers()).damagePct).toBe(0);
  });
  it('le bonus de set grandit avec le RANG des pièces (boss plus profond)', () => {
    const low: Equipped = {
      weapon: { ...bersPiece('weapon'), rarity: 'magique' },
      armor: { ...bersPiece('armor'), rarity: 'magique' },
    };
    const high: Equipped = {
      weapon: { ...bersPiece('weapon'), rarity: 'legendaire' },
      armor: { ...bersPiece('armor'), rarity: 'legendaire' },
    };
    expect(setEffects(high, 'berserker').lifesteal).toBeGreaterThan(
      setEffects(low, 'berserker').lifesteal,
    );
  });
  it('rollSetPiece produit toujours une pièce du set (ilvl pyramide)', () => {
    const piece = rollSetPiece(() => 0.3, { setId: BERS, level: 10, playerLevel: 10 });
    expect(piece.setId).toBe(BERS);
    expect(piece.level).toBeGreaterThanOrEqual(1);
    expect(piece.level).toBeLessThanOrEqual(10 + 9); // ilvl borné
    expect(piece.baseLevel).toBe(piece.level);
    expect(piece.name).toContain('Berserker');
    expect(ITEM_SETS.some((s) => s.id === BERS)).toBe(true);
  });
  it('anti-doublon : preferSlot force le slot manquant', () => {
    const piece = rollSetPiece(() => 0.3, { setId: BERS, level: 10, preferSlot: 'relic' });
    expect(piece.slot).toBe('relic');
  });
  it('la stat d’une pièce appartient au THÈME du set (pas aléatoire hors-thème)', () => {
    const bers = ITEM_SETS.find((s) => s.id === BERS)!;
    const theme = new Set(bers.tiers.map((t) => t.type));
    for (const slot of ['weapon', 'armor', 'accessory', 'relic'] as const) {
      const piece = rollSetPiece(() => 0.5, { setId: BERS, level: 20, preferSlot: slot });
      expect(theme.has(piece.effect.type)).toBe(true);
    }
  });
  it('un set de voie existe pour CHAQUE voie (lien voie↔set, ids `voie:<id>`)', () => {
    for (const v of VOIES) expect(ITEM_SETS.some((s) => s.id === `voie:${v.id}`)).toBe(true);
    expect(ITEM_SETS).toHaveLength(VOIES.length);
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
  it('reroll du JET : garde le type + le rang, ne touche que la valeur/le jet', () => {
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
    expect(rq.roll).toBeGreaterThanOrEqual(0);
    expect(rq.roll).toBeLessThanOrEqual(1);
  });
  it('craft de set : coût élevé qui monte avec le niveau', () => {
    expect(craftSetCost(10)).toBeGreaterThan(200);
    expect(craftSetCost(20)).toBeGreaterThan(craftSetCost(10));
  });
  it('coûts qui montent avec le NIVEAU + le rang (reroll)', () => {
    const lo = item({ slot: 'weapon', effect: { type: 'damage_pct', value: 8 }, level: 3 });
    const hi = item({ ...lo, level: 20 });
    expect(rerollCost(hi)).toBeGreaterThan(rerollCost(lo));
    const high = item({ ...lo, rarity: 'legendaire' });
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
  it('affixes selon la rareté : Commun/Inhabituel 1, Magique/Rare 2, Épique+ 3', () => {
    const drops = scan(80, 1); // large éventail de raretés
    for (const d of drops) {
      const got = 1 + (d.effect2 ? 1 : 0) + (d.effect3 ? 1 : 0);
      expect(got).toBe(affixCountForRarity(d.rarity));
      if (d.effect2) expect(d.effect2.type).not.toBe(d.effect.type);
      if (d.effect3) {
        expect(d.effect3.type).not.toBe(d.effect.type);
        expect(d.effect3.type).not.toBe(d.effect2!.type);
      }
    }
    // il existe bien des objets à 3 affixes (Épique+) dans un contenu profond.
    expect(drops.some((d) => d.effect3)).toBe(true);
  });
  it('les effets signature n’apparaissent qu’en profondeur (gate de niveau)', () => {
    const SIG = new Set(['execute_pct', 'rage_pct', 'momentum_pct']);
    const hasSig = (d: Item) => [d.effect, d.effect2, d.effect3].some((e) => e && SIG.has(e.type));
    const low = scan(3, 1).filter(hasSig);
    const deep = scan(20, 1).filter(hasSig);
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
    const SIG = ['execute_pct', 'rage_pct', 'momentum_pct'];
    const sig = scan(20, 1).find((d) =>
      [d.effect, d.effect2, d.effect3].some((e) => e && SIG.includes(e.type)),
    );
    expect(sig).toBeTruthy();
    expect(NAMED).toContain(sig!.name);
  });
});

describe('swapLoadoutGear — ranger / échanger un set (4 slots gear, familier intact)', () => {
  const mk = (slot: string, name: string): Item =>
    ({
      id: name,
      slot,
      name,
      emoji: '🗡️',
      rarity: 'magique',
      level: 1,
      effect: { type: 'damage_pct', value: 10 },
    }) as unknown as Item;

  it('loadout vide + équipé plein → « ranger » : le joueur devient nu, le loadout garde le stuff', () => {
    const equipped: Equipped = {
      weapon: mk('weapon', 'W'),
      armor: mk('armor', 'legendaire'),
      familiar: mk('familiar', 'inhabituel'),
    };
    const { equipped: eq, loadoutItems: lo } = swapLoadoutGear(equipped, {});
    // Les 4 slots gear sont vidés, le familier RESTE équipé.
    expect(eq.weapon).toBeUndefined();
    expect(eq.armor).toBeUndefined();
    expect(eq.familiar?.name).toBe('inhabituel');
    expect(lo.weapon?.name).toBe('W');
    expect(lo.armor?.name).toBe('legendaire');
    expect(lo.familiar).toBeUndefined(); // le familier n'est jamais rangé
  });

  it('swap deux sets : ce qu’on portait passe dans le loadout, on porte le loadout', () => {
    const equipped: Equipped = { weapon: mk('weapon', 'W1') };
    const stored: Equipped = { weapon: mk('weapon', 'W2'), armor: mk('armor', 'A2') };
    const { equipped: eq, loadoutItems: lo } = swapLoadoutGear(equipped, stored);
    expect(eq.weapon?.name).toBe('W2');
    expect(eq.armor?.name).toBe('A2');
    expect(lo.weapon?.name).toBe('W1');
    expect(lo.armor).toBeUndefined();
  });
});

describe('enchant — vestige de migration (moteur retiré, ticket 7acb1e7c)', () => {
  it('enchantMult : croît linéairement, plafonné au cap FIXE', () => {
    expect(enchantMult(0)).toBe(1);
    expect(enchantMult(3)).toBeCloseTo(1.99, 2); // zone sûre garantie ≈ ×2 (baseline)
    expect(enchantMult(5)).toBeGreaterThan(enchantMult(3));
    expect(enchantMult(ENCHANT_MAX + 5)).toBe(enchantMult(ENCHANT_MAX)); // clampé
  });
});

describe('niveau d’objet — 3ᵉ axe de magnitude (v0.583)', () => {
  it('rollItemLevel : pyramide centrée sur le niveau, bornée (jamais loin au-dessus)', () => {
    const center = 30;
    let below = 0;
    let above = 0;
    let hiMax = 0;
    const N = 4000;
    for (let s = 1; s <= N; s++) {
      const il = rollItemLevel(mulberry32(s * 7 + 1), center, 0.3);
      expect(il).toBeGreaterThanOrEqual(1);
      expect(il).toBeLessThanOrEqual(center + 9); // borne haute dure
      if (il < center) below++;
      if (il > center) above++;
      hiMax = Math.max(hiMax, il);
    }
    expect(below).toBeGreaterThan(0); // fourrage (sous ton niveau)
    expect(above).toBeGreaterThan(0); // chance (au-dessus)
    expect(below).toBeGreaterThan(above); // traîne basse plus large que la pointe haute
  });
  it('la luck (magic find) épaissit la pointe HAUTE de l’ilvl', () => {
    const center = 30;
    const meanIl = (luck: number) => {
      let sum = 0;
      const N = 3000;
      for (let s = 1; s <= N; s++) sum += rollItemLevel(mulberry32(s * 11 + 1), center, luck);
      return sum / N;
    };
    expect(meanIl(1)).toBeGreaterThan(meanIl(0));
  });
  it('un objet de MÊME rareté/jet mais d’ilvl supérieur donne une stat plus forte', () => {
    const mk = (level: number): Item => ({
      id: 'x',
      slot: 'weapon',
      name: 'Lame',
      emoji: '⚔️',
      rarity: 'legendaire',
      level,
      baseLevel: level,
      effect: { type: 'damage_pct', value: 20 },
    });
    const low = aggregateEffects({ weapon: mk(20) }).damagePct;
    const high = aggregateEffects({ weapon: mk(60) }).damagePct;
    expect(high).toBeGreaterThan(low); // ilvl plus haut = plus fort (re-farm profond = upgrade)
  });
});

describe('stats mineures (tier « or », v0.581)', () => {
  const mk = (type: Item['effect']['type'], value: number): Item => ({
    id: 'x',
    slot: 'accessory',
    name: 'A',
    emoji: '💍',
    rarity: 'epique',
    level: 1,
    baseLevel: 1,
    effect: { type, value },
  });
  it('magicFindLuck : borné (≤ 0,25) même avec beaucoup de magic find', () => {
    const eq = { weapon: mk('magic_find_pct', 200) };
    expect(magicFindLuck(eq)).toBeLessThanOrEqual(0.25);
    expect(magicFindLuck(eq)).toBeGreaterThan(0);
    expect(magicFindLuck({})).toBe(0);
  });
  it('régén : plafonnée à +30 % et posée sur le combattant', () => {
    const eq = { armor: mk('regen_pct', 500) };
    const c = playerWithGear('X', { puissance: 20, endurance: 20, agilite: 10 }, eq, {}, 8);
    expect(c.regen).toBe(0.3); // plafond
    expect(
      playerWithGear('X', { puissance: 20, endurance: 20, agilite: 10 }, {}, {}, 8).regen,
    ).toBeUndefined();
  });
  it('initiative : multiplie l’initiative de base', () => {
    const stats = { puissance: 20, endurance: 20, agilite: 30 };
    const bare = playerWithGear('X', stats, {}, {}, 8);
    const withInit = playerWithGear('X', stats, { relic: mk('initiative_pct', 50) }, {}, 8);
    expect(withInit.initiative).toBeGreaterThan(bare.initiative);
  });
  it('les stats mineures n’augmentent PAS la puissance de combat brute', () => {
    const stats = { puissance: 40, endurance: 30, agilite: 20 };
    const bare = playerWithGear('X', stats, {}, {}, 8);
    const gold = playerWithGear('X', stats, { accessory: mk('gold_pct', 40) }, {}, 8);
    // or = pur éco → pv/dégâts/crit identiques (pas de gonflage de puissance).
    expect(gold.pv).toBe(bare.pv);
    expect(gold.damage).toBe(bare.damage);
    expect(gold.crit).toBe(bare.crit);
  });
});

describe('effets légendaires (Phase 3)', () => {
  it('rollLegendaryProc : renvoie un proc dont les slots incluent le slot demandé', () => {
    for (const slot of SLOTS) {
      const id = rollLegendaryProc(mulberry32(3), slot);
      expect(id).toBeTruthy();
      const proc = LEGENDARY_PROCS.find((p) => p.id === id)!;
      expect(proc.slots).toContain(slot);
    }
  });
  it('seuls les objets Légendaire+ portent un proc légendaire', () => {
    let legendaries = 0;
    for (let s = 1; s <= 600; s++) {
      const d = rollDrop(mulberry32(s), { cleared: true, defeated: 3, level: 90, luck: 1 });
      if (!d) continue;
      if (d.legendary) {
        legendaries++;
        expect(RARITY_RANK[d.rarity]).toBeGreaterThanOrEqual(LEGENDARY_MIN_RANK);
        expect(legendaryOf(d)).toBeTruthy();
      } else {
        // pas de proc → soit rareté < Légendaire, soit tirage sans proc (aucun n'existe hors slot)
        // (tous les slots ont ≥1 proc → un Légendaire+ a TOUJOURS un proc)
        expect(RARITY_RANK[d.rarity]).toBeLessThan(LEGENDARY_MIN_RANK);
      }
    }
    expect(legendaries).toBeGreaterThan(0); // un contenu profond en produit
  });
  it('aggregateLegendaries : collecte les procs de l’équipement + playerWithGear les propage', () => {
    const wpn: Item = {
      id: 'w',
      slot: 'weapon',
      name: 'Lame',
      emoji: '⚔️',
      rarity: 'legendaire',
      level: 1,
      baseLevel: 1,
      effect: { type: 'damage_pct', value: 10 },
      legendary: 'initiative',
    };
    const set = aggregateLegendaries({ weapon: wpn });
    expect(set.has('initiative')).toBe(true);
    const c = playerWithGear(
      'X',
      { puissance: 30, endurance: 20, agilite: 10 },
      { weapon: wpn },
      {},
      8,
    );
    expect(c.procs?.has('initiative')).toBe(true);
    // équipement sans légendaire → pas de procs
    expect(
      playerWithGear('X', { puissance: 30, endurance: 20, agilite: 10 }, {}, {}, 8).procs,
    ).toBeUndefined();
  });
});
