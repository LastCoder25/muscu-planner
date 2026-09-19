import { itemIconName } from '@/data/itemIcons';
import { rankStartLevel } from '@/lib/characterRank';
import { levelCost } from '@/lib/levels';
import { describe, it, expect } from 'vitest';
import {
  aggregateLines,
  rarityRank,
  gradeLabel,
  RARITY_LABEL,
  renameLegacyItem,
  itemNoun,
  type Rarity,
  weaponKind,
  wornSet,
  fxRarity,
  type FxRarity,
  emptyEffects,
  effectAsAggregate,
  compareFamiliars,
  groupBestFirst,
  groupRowVisible,
  aggregateEffects,
  playerWithGear,
  rollDrop,
  rollSetPiece,
  rollTier,
  ownRankChance,
  OWN_RANK,
  dropsPerLevel,
  rankCssVars,
  STAR_JET,
  jetStar,
  rollFamiliar,
  starOdds,
  RANK_COLOR,
  dropBand,
  dropBandLabel,
  dropPeakRank,
  prestigeRankIndex,
  RANK_ORDER,
  RARITY_MULT,
  RARITY_RANK,
  affixCountForRarity,
  fillSetPieceAffixes,
  rollItemLevel,
  rollJetValue,
  jetExp,
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
  canSell,
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
  itemLevelMult,
  rollJet,
  swapLoadoutGear,
  bestGearLoadout,
  elagueDomines,
  type Item,
  type Equipped,
  enchantMult,
  ENCHANT_MAX,
  VOIE_SETS,
  rollSetLegendaryProc,
  voieSetRoster,
  setSellLot,
  SET_BY_ID,
  effectBase,
} from '@/lib/items';
import { mulberry32, combatPower } from '@/lib/combat';
import { FAMILIAR_SPECIES } from '@/data/familiars';
import { pickBestTalents } from '@/lib/talents';
import { VOIES, voiePassiveEffects } from '@/lib/voies';
import { computeCharacter } from '@/lib/character';
import { cumXpForLevel } from '@/lib/proceduralContent';
import { HARVEST } from '@/lib/expedition';

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

describe('jet biaisé bas (haut jet rare, comme la rareté)', () => {
  it('rollJetValue : les jets BAS dominent, les hauts sont rares (sans luck)', () => {
    let hi = 0;
    let lo = 0;
    const N = 5000;
    for (let s = 1; s <= N; s++) {
      const j = rollJetValue(mulberry32(s * 3 + 1), 0);
      if (j >= 0.9) hi++;
      if (j <= 0.2) lo++;
    }
    expect(lo).toBeGreaterThan(hi * 2); // fourrage bas bien plus fréquent
    expect(hi / N).toBeLessThan(0.08); // jet ≥ 90 % rare (< 8 %, vs 10 % uniforme)
  });
  it('la luck augmente la fréquence des hauts jets', () => {
    const hiRate = (luck: number) => {
      let hi = 0;
      const N = 5000;
      for (let s = 1; s <= N; s++) if (rollJetValue(mulberry32(s * 7 + 1), luck) >= 0.8) hi++;
      return hi / N;
    };
    expect(hiRate(1)).toBeGreaterThan(hiRate(0));
  });
  it('jetExp : décroît avec la luck, borné ≥ 0,8', () => {
    expect(jetExp(0)).toBeGreaterThan(jetExp(1));
    expect(jetExp(1)).toBeGreaterThanOrEqual(0.8);
    expect(jetExp(0)).toBeGreaterThan(1); // sans luck, biais bas (exp > 1)
  });
});

describe('rollTier : le rang des objets s’ouvre sur la durée du rang (v0.894)', () => {
  const modeOf = (level: number, luck = 0, floorBonus = 0, playerLevel?: number) => {
    const c = new Array(RANK_ORDER.length).fill(0) as number[];
    for (let s = 1; s <= 3000; s++)
      c[
        RARITY_RANK[rollTier(mulberry32(s * 7 + level), level, luck, floorBonus, playerLevel).rank]
      ]!++;
    return c;
  };
  it('au rang Bronze (rien en dessous), tout tombe au rang du joueur', () => {
    for (const lv of [1, 5, 10]) expect(modeOf(lv, 0.4)[0]).toBe(3000);
  });
  it('⚠️ le rang du joueur est RARE, jamais nul dès le premier niveau, et monte avec la position', () => {
    for (const r of [1, 3, 5, 7]) {
      const start = rankStartLevel(r);
      // « Il y a une possibilité de drop du nouveau rang même au début, même si c'est bas. »
      expect(ownRankChance(start), `rang ${r} début`).toBeGreaterThan(0);
      expect(ownRankChance(start), `rang ${r} début`).toBeLessThan(0.02);
      expect(
        modeOf(start, 0.4)[r],
        `rang ${r} : du nouveau rang dès le 1er niveau`,
      ).toBeGreaterThan(0);
      let prev = ownRankChance(start);
      for (let pos = 1; pos < 10; pos++) {
        const p = ownRankChance(start + pos);
        expect(p, `rang ${r} pos ${pos}`).toBeGreaterThan(prev);
        prev = p;
      }
      expect(prev, `rang ${r} fin`).toBeLessThan(0.1);
      // Mesuré sur le tirage : la part du rang du joueur suit `ownRankChance`.
      const c = modeOf(start + 9, 0.4);
      expect(c[r]! / 3000).toBeCloseTo(ownRankChance(start + 9), 1);
      expect(c.indexOf(Math.max(...c)), `rang ${r} : le pic est le rang d’en dessous`).toBe(r - 1);
    }
  });
  it('⚠️ la part se rapporte aux DROPS D’UN NIVEAU : la même durée en niveaux à tous les rangs', () => {
    // Objets de SON rang attendus sur les 5 premiers niveaux d'un rang : identique à tous les
    // rangs (c'est ce qui fixe « complet vers la mi-rang » au niveau 15 comme au 75).
    const expected = (r: number) => {
      let s = 0;
      for (let pos = 0; pos < 5; pos++) {
        const L = rankStartLevel(r) + pos;
        s += ownRankChance(L) * dropsPerLevel(L);
      }
      return s;
    };
    // Le volume suit le coût du niveau (l'énergie EST l'XP de sport).
    expect(dropsPerLevel(60) / dropsPerLevel(30)).toBeCloseTo(levelCost(60) / levelCost(30), 9);
    for (const r of [2, 4, 6, 7]) expect(expected(r)).toBeCloseTo(expected(1), 6);
    expect(expected(3)).toBeCloseTo(5 * OWN_RANK.atStart + 10 * OWN_RANK.perPos, 6);
  });
  it('au-delà des 8 raretés (niveaux 81+), plus de gate', () => {
    expect(ownRankChance(85)).toBe(1);
  });
  it('⚠️ un objet de TON rang tire ses ÉTOILES selon la tienne ; un rang inférieur garde le jet d’avant', () => {
    const stars = (level: number, luck: number) => {
      const own = [0, 0, 0, 0, 0];
      const below: number[] = [];
      const r = prestigeRankIndex(level);
      for (let s = 1; s <= 20000; s++) {
        const t = rollTier(mulberry32(s * 13 + level), level, luck, 0, level);
        if (RARITY_RANK[t.rank] === r) own[jetStar(t.roll) - 1]!++;
        else below.push(t.roll);
      }
      const n = own.reduce((a, b) => a + b, 0);
      return { own: own.map((x) => x / Math.max(1, n)), n, below };
    };
    // Début de rang (★1) : du nouveau rang possible, mais tout en ★1.
    const start = stars(rankStartLevel(3), 0.4);
    expect(start.n).toBeGreaterThan(0);
    expect(start.own[0]).toBe(1);
    // Rang ★5 : ★5 majoritaire (60 % + chance), jamais au-dessus (trivial), ★4 > ★3.
    const end = stars(rankStartLevel(3) + 9, 0);
    expect(end.own[4]!).toBeCloseTo(STAR_JET.top, 1);
    expect(end.own[3]!).toBeGreaterThan(end.own[2]!);
    // Rang ★3 : jamais ★4 ni ★5.
    const mid = stars(rankStartLevel(3) + 5, 0.4);
    expect(mid.own[3]! + mid.own[4]!).toBe(0);
    // Le rang d'en dessous garde des jets hauts possibles (rang déjà bouclé).
    expect(Math.max(...start.below)).toBeGreaterThan(0.9);
    // ★1 du nouveau rang ≥ ★5 de l'ancien : les tranches se suivent (la motivation de monter).
    expect(rankRollMult('rare', 0)).toBeCloseTo(rankRollMult('magique', 1), 6);
  });
  it('⚠️ un donjon lâche son butin au moins à son niveau conseillé : le nouveau rang y est possible dès le 1er niveau', async () => {
    const { DUNGEONS } = await import('@/data/dungeons');
    for (const d of DUNGEONS) expect(d.dropLevel, d.id).toBeGreaterThanOrEqual(d.recoLevel);
    // Au niveau 31, le donjon de reco 31 peut donner le rang du joueur (il ne le pouvait pas).
    const d31 = DUNGEONS.find((d) => d.recoLevel === 31)!;
    expect(prestigeRankIndex(d31.dropLevel)).toBe(prestigeRankIndex(31));
  });
  it('au rang Bronze aussi, les étoiles suivent celles du joueur', () => {
    const t = rollTier(mulberry32(5), 1, 1, 0, 1);
    expect(jetStar(t.roll)).toBe(1);
  });
  it('les chances d’étoiles somment à 1, ★1 → 100 % de ★1, 81+ → pas de borne', () => {
    for (let L = 1; L <= 100; L++)
      expect(starOdds(L, 0.5).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(starOdds(21)[0]).toBe(1);
    expect(starOdds(85)[4]!).toBeCloseTo(STAR_JET.top, 9);
  });
  it('⚠️ JAMAIS au-dessus du rang du joueur, même avec toute la chance (v0.876)', () => {
    for (const lv of [5, 15, 35, 55, 75]) {
      for (const luck of [0, 1]) {
        const ref = prestigeRankIndex(lv);
        const c = modeOf(lv, luck, 2.2);
        expect(
          c.slice(ref + 1).reduce((x, y) => x + y, 0),
          `niv ${lv} luck ${luck}`,
        ).toBe(0);
      }
    }
  });
  it('la chance resserre la traîne sous le rang d’en dessous, sans toucher la part du rang', () => {
    const lv = 45;
    const r = prestigeRankIndex(lv);
    const deep = (luck: number) =>
      modeOf(lv, luck)
        .slice(0, r - 1)
        .reduce((x, y) => x + y, 0);
    expect(deep(0)).toBeGreaterThan(deep(1));
    expect(deep(1)).toBeGreaterThan(0); // du fourrage reste possible
    expect(modeOf(lv, 1)[r]! / 3000).toBeCloseTo(ownRankChance(lv), 1);
  });
  it('un contenu MOINS profond que son rang garde l’ancienne règle (son rang surtout)', () => {
    // Joueur 45 (Or noir) dans un contenu de niveau 25 (Or) : c'est Or qui est la référence,
    // et Or n'est pas le rang du joueur → pas de gate.
    const c = modeOf(25, 0.4, 0, 45);
    expect(c.indexOf(Math.max(...c))).toBe(prestigeRankIndex(25));
  });
  it('ANTI-RUNAWAY : contenu profond, joueur bas → jamais au-dessus du rang du JOUEUR', () => {
    const playerLevel = 19;
    const c = modeOf(85, 1, 0, playerLevel);
    expect(c.slice(prestigeRankIndex(playerLevel) + 1).reduce((x, y) => x + y, 0)).toBe(0);
  });
  it('un bonus de rang (Autel, boss) améliore le jet, jamais au-dessus', () => {
    const ref = prestigeRankIndex(50);
    const jet = (fb: number) => {
      let s = 0;
      for (let i = 1; i <= 2000; i++) s += rollTier(mulberry32(i * 3 + 1), 50, 0, fb, 50).roll;
      return s / 2000;
    };
    expect(jet(1.2)).toBeGreaterThan(jet(0) + 0.05);
    for (const fb of [0.35, 0.8, 2.2])
      expect(
        modeOf(50, 1, fb)
          .slice(ref + 1)
          .every((n) => n === 0),
      ).toBe(true);
  });
  it('jet CONTINU : le roll varie continûment (chasse au meilleur jet)', () => {
    const rolls = new Set<number>();
    for (let s = 1; s <= 200; s++) rolls.add(rollTier(mulberry32(s * 5 + 1), 30, 0.3).roll);
    expect(rolls.size).toBeGreaterThan(150);
  });
  it('bande de drop affichée en RANGS : pic = rang d’en dessous tant que le rang n’est pas ouvert', () => {
    const ri = (r: string) => RARITY_RANK[r as keyof typeof RARITY_RANK];
    for (const lv of [4, 12, 25, 60]) {
      const b = dropBand(lv, 0.4);
      expect(ri(b.lo.rank)).toBeLessThanOrEqual(ri(b.hi.rank));
      expect(ri(b.hi.rank)).toBe(prestigeRankIndex(lv));
    }
    expect(dropPeakRank(4)).toBe(RANK_ORDER[0]);
    expect(dropPeakRank(25)).toBe(RANK_ORDER[prestigeRankIndex(25) - 1]);
    expect(dropPeakRank(85, 20)).toBe(RANK_ORDER[prestigeRankIndex(20) - 1]);
    expect(dropBandLabel(35, 0)).toMatch(/Or/);
    expect(dropBandLabel(35, 0)).not.toMatch(/rare|epique|magique/);
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
  it('vente : le JET et le NIVEAU impactent le prix (même rang)', () => {
    const r = 'legendaire' as const;
    const lowJet = item({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 20 },
      rarity: r,
      roll: 0.1,
      level: 20,
    });
    const highJet = item({ ...lowJet, roll: 0.95 });
    expect(sellValue(highJet)).toBeGreaterThan(sellValue(lowJet)); // jet ↑ → prix ↑
    const deep = item({ ...lowJet, level: 60 });
    expect(sellValue(deep)).toBeGreaterThan(sellValue(lowJet)); // niveau d'objet ↑ → prix ↑
  });

  it('vente : jamais un objet 🔒, jamais un familier (il se cède à part)', () => {
    const fam = item({
      slot: 'familiar',
      effect: { type: 'damage_pct', value: 10 },
      rarity: 'legendaire',
    });
    const arme = item({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 10 },
      rarity: 'rare',
    });
    expect(canSell(fam)).toBe(false);
    expect(canSell(arme)).toBe(true);
    expect(canSell({ ...arme, locked: true })).toBe(false);
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
    expect(RARITY_RANK[d!.rarity]).toBeLessThanOrEqual(prestigeRankIndex(6) + 1);
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
  it('la stat PRINCIPALE d’une pièce de set est la majeure non plafonnée de son emplacement', () => {
    // v0.803 : le thème vit dans les PALIERS, plus dans les pièces. Crit et réduction sont
    // plafonnés au combat → une pièce qui les imposait gaspillait son emplacement.
    const attendu = {
      weapon: 'damage_pct',
      armor: 'max_pv_pct',
      accessory: 'damage_pct',
      relic: 'max_pv_pct',
    };
    for (const set of ITEM_SETS)
      for (const slot of ['weapon', 'armor', 'accessory', 'relic'] as const) {
        const piece = rollSetPiece(() => 0.5, { setId: set.id, level: 20, preferSlot: slot });
        expect(piece.effect.type, `${set.id} ${slot}`).toBe(attendu[slot]);
      }
  });
  it('la stat principale d’une pièce vaut ~0,7 × celle d’un drop de même rareté et même jet', () => {
    // v0.803 : mesuré, à valeur pleine un set complet battait 4 bons drops de +23 à +30 %.
    const baseOf = (it: { rarity: Item['rarity']; roll?: number; effect: { value: number } }) =>
      it.effect.value / rankRollMult(it.rarity, it.roll ?? 0);
    // Niveau 90 : les rangs y sont hauts, donc les valeurs assez grandes pour que l'arrondi au
    // dixième ne brouille pas le rapport (au niveau 30, rang Or depuis la v0.875, elles sont petites).
    let drop: number | null = null;
    for (let s = 1; s <= 400 && drop == null; s++) {
      const d = rollDrop(mulberry32(s), { cleared: true, defeated: 1, level: 90, playerLevel: 90 });
      if (d && d.slot === 'weapon' && d.effect.type === 'damage_pct' && d.effect.value > 20)
        drop = baseOf(d);
    }
    expect(drop).not.toBeNull();
    for (let s = 1; s <= 10; s++) {
      const p = rollSetPiece(mulberry32(s), {
        setId: BERS,
        level: 90,
        playerLevel: 90,
        preferSlot: 'weapon',
      });
      if (p.effect.value < 20) continue; // l’arrondi au dixième brouille les petites valeurs
      expect(baseOf(p) / drop!).toBeGreaterThan(0.65);
      expect(baseOf(p) / drop!).toBeLessThan(0.75);
    }
  });
  it('les paliers du set suivent aussi le NIVEAU D’OBJET des pièces, pas seulement leur rareté', () => {
    const at = (level: number): Equipped =>
      Object.fromEntries(
        (['weapon', 'armor', 'accessory', 'relic'] as const).map((s) => [
          s,
          { ...bersPiece(s), level },
        ]),
      ) as Equipped;
    const bas = setEffects(at(10), 'berserker');
    const haut = setEffects(at(90), 'berserker');
    // Arrondi des paliers au dixième : on vérifie le rapport à 0,05 près (sans ilvl il vaut 1, contre 1,46).
    expect(haut.lifesteal / bas.lifesteal).toBeCloseTo(itemLevelMult(90) / itemLevelMult(10), 1);
  });
  it('le 2ᵉ affixe d’une pièce de set est LIBRE, comme un drop (pas réservé au thème)', () => {
    const theme = new Set(ITEM_SETS.find((s) => s.id === BERS)!.tiers.map((t) => t.type));
    let hors = 0;
    let total = 0;
    for (let s = 1; s <= 200; s++) {
      const p = rollSetPiece(mulberry32(s), { setId: BERS, level: 40, luck: 0.9, playerLevel: 40 });
      if (!p.effect2) continue;
      total++;
      if (!theme.has(p.effect2.type)) hors++;
    }
    expect(total).toBeGreaterThan(20);
    expect(hors / total).toBeGreaterThan(0.3);
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
    // Niveau 25 (rang Or → 2 affixes) : sous le rang Or un drop n'a qu'un affixe, jamais signature.
    const deep = scan(25, 1).filter(hasSig);
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
    const sig = scan(25, 1).find((d) =>
      [d.effect, d.effect2, d.effect3].some((e) => e && SIG.includes(e.type)),
    );
    expect(sig).toBeTruthy();
    // ⚠️ v0.888 : l’OBJET d’abord, l’épithète ensuite — « Cuirasse « Élan Implacable » ».
    const m = /^(\S+) « (.+) »$/.exec(sig!.name);
    expect(m, sig!.name).toBeTruthy();
    expect(NAMED).toContain(m![2]);
  });
  it('⚠️ LE CAS RÉEL : un objet signature commence par le nom d’un objet de SON emplacement', () => {
    const NOUNS: Record<string, string[]> = {
      weapon: ['Lame', 'Hache', 'Masse', 'Dague', 'Fléau', 'Faux'],
      armor: ['Plastron', 'Cotte', 'Cuirasse', 'Harnois'],
      accessory: ['Anneau', 'Amulette', 'Talisman', 'Bracelet'],
      relic: ['Éclat', 'Totem', 'Sceau', 'Idole'],
    };
    let n = 0;
    for (const d of scan(40, 1)) {
      if (!d.name.includes('«')) continue;
      n++;
      expect(NOUNS[d.slot], d.name).toContain(itemNoun(d));
      expect(itemIconName(d), d.name).not.toBe('mdi-help-circle');
    }
    expect(n).toBeGreaterThan(0);
    // La forme d’arme suit l’épithète : une Guillotine reste une hache, la Faux une faux.
    expect(weaponKind({ name: 'Hache « Guillotine »' })).toBe('hache');
    expect(weaponKind({ name: 'Faux « Faux des Âmes »' })).toBe('faux');
  });
  it('un nom signature d’avant la v0.888 est renommé au chargement, sans rien toucher d’autre', () => {
    const old = {
      name: 'Déferlante',
      rarity: 'magique' as const,
      slot: 'accessory' as const,
      roll: 0.99,
    };
    const r = renameLegacyItem(old);
    expect(r.name).toBe('Bracelet « Déferlante »');
    expect(renameLegacyItem(r)).toEqual(r); // idempotent
    expect(renameLegacyItem({ ...old, slot: 'weapon' as const, name: 'Guillotine' }).name).toBe(
      'Hache « Guillotine »',
    );
    expect(renameLegacyItem({ ...old, name: 'Anneau d’or' }).name).toBe('Anneau d’or');
  });
  it('l’icône suit le NOM d’objet, jamais la stat : une hache à critique reste une hache', () => {
    expect(itemIconName({ slot: 'weapon', name: 'Hache d’or' })).toBe('mdi-axe-battle');
    expect(itemIconName({ slot: 'relic', name: 'Sceau d’argent' })).toBe('mdi-seal');
    expect(itemIconName({ slot: 'armor', name: 'Inconnu' })).toBe('mdi-shield');
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

describe('bestGearLoadout — jamais de PERTE de puissance (auto-équip)', () => {
  const g = (
    slot: Item['slot'],
    id: string,
    type: Item['effect']['type'],
    value: number,
  ): Item => ({
    id,
    slot,
    name: id,
    emoji: '🗡️',
    rarity: 'rare',
    level: 10,
    baseLevel: 10,
    effect: { type, value },
  });
  it('la puissance optimisée est ≥ la puissance actuelle, même avec un gros sac de candidats', () => {
    const stats = { puissance: 40, endurance: 40, agilite: 20 };
    const equipped: Equipped = {
      weapon: g('weapon', 'W_cur', 'max_pv_pct', 0.5),
      armor: g('armor', 'A_cur', 'dmg_reduction_pct', 0.35),
    };
    // 8 candidats par slot → l'objet équipé pourrait être « trimé » hors des top-K solo.
    const pool: Item[] = [];
    for (let i = 0; i < 8; i++) {
      pool.push(g('weapon', 'w' + i, 'damage_pct', 0.12 + i * 0.01));
      pool.push(g('armor', 'a' + i, 'crit_pct', 0.06 + i * 0.005));
    }
    const before = combatPower(playerWithGear('X', stats, equipped, {}, 10));
    const opt = bestGearLoadout('X', stats, equipped, pool, 10);
    const after = combatPower(playerWithGear('X', stats, opt, {}, 10));
    expect(after).toBeGreaterThanOrEqual(before);
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

describe('pieces de set — multi-affixe (correctif : les sets ne valaient jamais le stuff mixte)', () => {
  const setId = ITEM_SETS[0]!.id;
  const nAff = (it: { effect?: unknown; effect2?: unknown; effect3?: unknown }) =>
    [it.effect, it.effect2, it.effect3].filter(Boolean).length;

  it('rollSetPiece pose AUTANT d affixes que sa rarete l autorise (comme un drop)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const p = rollSetPiece(mulberry32(seed), {
        setId,
        level: 40,
        luck: 0.9,
        playerLevel: 40,
      });
      expect(nAff(p)).toBe(affixCountForRarity(p.rarity));
    }
  });

  it('l affixe PRINCIPAL ne depend pas du tirage (identite stable par emplacement)', () => {
    const vu = new Map<string, string>();
    for (let seed = 1; seed <= 20; seed++) {
      const p = rollSetPiece(mulberry32(seed), { setId, level: 30, playerLevel: 30 });
      const prev = vu.get(p.slot);
      if (prev) expect(p.effect.type).toBe(prev);
      vu.set(p.slot, p.effect.type);
      expect(['damage_pct', 'max_pv_pct']).toContain(p.effect.type);
    }
  });

  it('pas de doublon de type entre les affixes d une meme piece', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const p = rollSetPiece(mulberry32(seed), { setId, level: 40, luck: 0.9, playerLevel: 40 });
      const types = [p.effect, p.effect2, p.effect3].filter(Boolean).map((e) => e!.type);
      expect(new Set(types).size).toBe(types.length);
    }
  });

  describe('fillSetPieceAffixes (migration des pieces LEGACY a 1 affixe)', () => {
    const legacy = {
      id: 'itm-legacy-1',
      slot: 'weapon' as const,
      name: 'Lame · Set',
      emoji: '⚔️',
      rarity: 'mythique' as const,
      level: 25,
      roll: 0.6,
      setId,
      effect: { type: 'damage_pct' as const, value: 20 },
    };

    it('complete jusqu au compte de sa rarete', () => {
      const out = fillSetPieceAffixes(legacy);
      expect(nAff(out)).toBe(affixCountForRarity('mythique'));
      expect(out.effect).toEqual(legacy.effect); // l affixe d origine est preserve
    });

    it('DETERMINISTE : meme objet -> memes affixes (pas de re-tirage au rechargement)', () => {
      expect(fillSetPieceAffixes(legacy)).toEqual(fillSetPieceAffixes(legacy));
    });

    it('IDEMPOTENT : repasser dessus ne change plus rien', () => {
      const once = fillSetPieceAffixes(legacy);
      expect(fillSetPieceAffixes(once)).toEqual(once);
    });

    it('deux objets differents -> affixes differents (la graine suit l id)', () => {
      const a = fillSetPieceAffixes(legacy);
      const b = fillSetPieceAffixes({ ...legacy, id: 'itm-legacy-2' });
      expect(a.effect2 || a.effect3).toBeDefined();
      expect(b.effect2 || b.effect3).toBeDefined();
    });

    it('ne touche PAS un objet hors set', () => {
      const plain = { ...legacy, setId: undefined };
      expect(fillSetPieceAffixes(plain)).toEqual(plain);
    });
  });
});

describe('bestGearLoadout — le FAMILIER est optimise lui aussi', () => {
  const stats = { puissance: 200, endurance: 200, agilite: 150 };
  const mkFam = (id: string, value: number) => ({
    id,
    slot: 'familiar' as const,
    name: 'Fam ' + id,
    emoji: '🐺',
    rarity: 'rare' as const,
    level: 10,
    roll: 0.5,
    effect: { type: 'damage_pct' as const, value },
  });

  it('remplace un familier faible par un meilleur present dans le sac', () => {
    const weak = mkFam('f-weak', 2);
    const strong = mkFam('f-strong', 40);
    const out = bestGearLoadout('H', stats, { familiar: weak }, [strong], 20);
    expect(out.familiar?.id).toBe('f-strong');
  });

  it('garde le familier porte si le sac ne fait pas mieux (jamais de perte)', () => {
    const strong = mkFam('f-strong', 40);
    const weak = mkFam('f-weak', 2);
    const out = bestGearLoadout('H', stats, { familiar: strong }, [weak], 20);
    expect(out.familiar?.id).toBe('f-strong');
  });

  it('equipe un familier meme si aucun n etait porte', () => {
    const fam = mkFam('f1', 30);
    const out = bestGearLoadout('H', stats, {}, [fam], 20);
    expect(out.familiar?.id).toBe('f1');
  });
});

describe('pickBestTalents', () => {
  const mk = (id: string, code: string) => ({ id, code, xp: 0, equipped: false });

  it('choisit les meilleurs, dans la limite des emplacements', () => {
    const talents = [mk('a', 't_dmg'), mk('b', 't_pv'), mk('c', 't_crit')];
    const value: Record<string, number> = { a: 10, b: 5, c: 1 };
    const score = (ids: string[]) => ids.reduce((t, i) => t + (value[i] ?? 0), 0);
    expect(pickBestTalents(talents, 2, score).sort()).toEqual(['a', 'b']);
  });

  it('un seul talent par CODE (effets distincts)', () => {
    const talents = [mk('a1', 't_dmg'), mk('a2', 't_dmg'), mk('b', 't_pv')];
    const value: Record<string, number> = { a1: 10, a2: 9, b: 1 };
    const score = (ids: string[]) => ids.reduce((t, i) => t + (value[i] ?? 0), 0);
    const got = pickBestTalents(talents, 3, score);
    expect(got).toContain('a1');
    expect(got).not.toContain('a2'); // meme code que a1
    expect(got).toContain('b');
  });

  it('remplit les emplacements meme si rien n ameliore (un talent vaut mieux que rien)', () => {
    const talents = [mk('a', 't_dmg'), mk('b', 't_pv')];
    expect(pickBestTalents(talents, 2, () => 0)).toHaveLength(2);
  });

  it('aucun emplacement -> aucun talent', () => {
    expect(pickBestTalents([mk('a', 't_dmg')], 0, () => 99)).toEqual([]);
  });
});

describe('procs légendaires des pièces de SET — cohérents avec le thème (v0.701)', () => {
  // ⚠️ CE QUI EST VERROUILLÉ ICI. Jusqu'en v0.700, une pièce de set tirait son proc en ne
  // regardant que son EMPLACEMENT : mesuré, 94 % des pièces de set sont Légendaire+ au
  // niveau 70 (le proc est la norme) et 34 % seulement prolongeaient le thème du set. La
  // correction ne passe PAS par un assouplissement du tirage — laisser le thème primer sur
  // le slot donnait 87 % de sets avec un doublon, or `aggregateLegendaries` déduplique :
  // un nerf déguisé. Elle passe par un CATALOGUE complet : un proc par famille de stats et
  // par emplacement. Ces tests gardent cette complétude.
  it('⚠️ chaque proc DÉCLARE son écho — sans quoi il ne tomberait jamais sur un set', () => {
    for (const p of LEGENDARY_PROCS) {
      expect(p.echo.length, `${p.name} n’a pas d’écho`).toBeGreaterThan(0);
      expect(p.slots.length, `${p.name} n’a pas d’emplacement`).toBeGreaterThan(0);
    }
  });

  it('⚠️ AUCUN TROU : chaque (set × emplacement) a un proc dans son thème', () => {
    // C'est LA garantie. La matrice comptait 16 trous sur 32 avant la v0.701, et deux stats
    // de set n'avaient aucun proc : `damage_pct` (7 sets sur 8 !) et `momentum_pct`.
    const trous: string[] = [];
    for (const set of VOIE_SETS) {
      const stats = set.tiers.map((t) => t.type);
      for (const slot of SLOTS) {
        const ok = LEGENDARY_PROCS.some(
          (p) => p.slots.includes(slot) && p.echo.some((t) => stats.includes(t)),
        );
        if (!ok) trous.push(`${set.name} / ${slot}`);
      }
    }
    expect(trous, `trous : ${trous.join(' · ')}`).toEqual([]);
  });

  it('toute stat de set est couverte par au moins un proc', () => {
    const couvertes = new Set(LEGENDARY_PROCS.flatMap((p) => p.echo));
    for (const set of VOIE_SETS)
      for (const t of set.tiers.map((x) => x.type))
        expect(couvertes.has(t), `aucun proc ne prolonge ${t} (${set.name})`).toBe(true);
  });

  it('le proc tiré est TOUJOURS dans le thème du set, à tous les emplacements', () => {
    for (const set of VOIE_SETS) {
      const stats = set.tiers.map((t) => t.type);
      for (const slot of SLOTS) {
        for (let seed = 0; seed < 40; seed++) {
          const id = rollSetLegendaryProc(mulberry32(seed), slot, stats);
          const proc = LEGENDARY_PROCS.find((p) => p.id === id)!;
          expect(proc.slots).toContain(slot);
          expect(
            proc.echo.some((t) => stats.includes(t)),
            `${set.name}/${slot} → ${proc.name} hors thème`,
          ).toBe(true);
        }
      }
    }
  });

  it('⚠️ un set COMPLET donne 4 procs DISTINCTS — les doublons s’annuleraient', () => {
    // `aggregateLegendaries` renvoie un Set : deux pièces au même proc n'en valent qu'une.
    // C'est la raison pour laquelle on garde la liaison au slot (pools disjoints).
    for (const set of VOIE_SETS) {
      const stats = set.tiers.map((t) => t.type);
      for (let seed = 0; seed < 30; seed++) {
        const ids = SLOTS.map((slot) =>
          rollSetLegendaryProc(mulberry32(seed * 31 + 7), slot, stats),
        );
        expect(new Set(ids).size, `${set.name} (graine ${seed})`).toBe(SLOTS.length);
      }
    }
  });

  it('un set INCONNU retombe sur le pool de l’emplacement au lieu de rester sans proc', () => {
    const id = rollSetLegendaryProc(mulberry32(1), 'weapon', []);
    expect(LEGENDARY_PROCS.find((p) => p.id === id)!.slots).toContain('weapon');
  });
});

describe('roster d’un set de voie — la COLLECTION, pas ce qu’on ne porte pas (v0.707)', () => {
  // ⚠️ LE DÉFAUT CORRIGÉ. « Mes sets » listait la seule RÉSERVE, c'est-à-dire très
  // exactement les pièces qu'on ne portait PAS : un joueur équipé de deux pièces de sa
  // voie voyait son set amputé de ce qu'il avait de mieux. Et le compteur « x/4 » à côté,
  // lui, comptait DÉJÀ partout — la liste et le chiffre se contredisaient à l'écran.
  const SET = 'voie:berserker';
  const mk = (slot: ItemSlot, value: number, setId = SET, id = slot + value): Item =>
    ({
      id,
      slot,
      name: id,
      emoji: '🗡️',
      rarity: 'rare',
      level: 10,
      baseLevel: 10,
      effect: { type: 'damage_pct', value },
      setId,
    }) as Item;

  it('⚠️ VENDRE UN SET VEND AUSSI SES PIÈCES AU SAC (v0.806)', () => {
    // Signalé : « j’ai recyclé tout le set mais ça m’a laissé un item ». La carte montre le
    // roster (réserve + sac), le bouton ne fondait que la réserve.
    // v0.839 : la réserve porte aussi ses DOUBLONS — « tout le set » les fond avec lui.
    const reserve = { items: { weapon: mk('weapon', 10) }, spares: [mk('weapon', 3)] };
    const sac = [
      mk('armor', 20),
      mk('relic', 5, 'voie:gardien'),
      { ...mk('accessory', 7), locked: true },
    ];
    const { sold, keep } = setSellLot(SET, reserve, sac);
    expect(sold.map((i) => i.id).sort()).toEqual(['armor20', 'weapon10', 'weapon3']);
    // Le 🔒 ne fond pas ; une pièce d’un AUTRE set n’est pas concernée.
    expect(keep.map((i) => i.id)).toEqual(['accessory7']);
    // Ce qu’on PORTE n’est jamais dans le lot : il n’est ni en réserve ni au sac.
    expect(setSellLot(SET, undefined, []).sold).toEqual([]);
  });

  it('⚠️ une pièce PORTÉE figure dans le roster, et elle est marquée', () => {
    const r = voieSetRoster(SET, { weapon: mk('weapon', 20) }, undefined, []);
    expect(r.weapon?.worn).toBe(true);
    expect(r.weapon?.item.id).toBe('weapon20');
  });

  it('la MEILLEURE pièce gagne, où qu’elle soit — portée, en réserve ou au sac', () => {
    const porte = voieSetRoster(
      SET,
      { weapon: mk('weapon', 30) },
      { weapon: mk('weapon', 10) },
      [],
    );
    expect(porte.weapon?.item.id).toBe('weapon30');
    expect(porte.weapon?.worn).toBe(true);
    // …et l'inverse : une meilleure pièce en réserve prime, non marquée portée. C'est le
    // signal « tu portes moins bien que ce que tu as », qui n'existait pas avant.
    const reserve = voieSetRoster(
      SET,
      { weapon: mk('weapon', 10) },
      { weapon: mk('weapon', 30) },
      [],
    );
    expect(reserve.weapon?.item.id).toBe('weapon30');
    expect(reserve.weapon?.worn).toBe(false);
    const sac = voieSetRoster(SET, {}, undefined, [mk('armor', 25)]);
    expect(sac.armor?.item.id).toBe('armor25');
  });

  it('⚠️ le COMPTE est la taille du roster — liste et compteur ne peuvent plus diverger', () => {
    const r = voieSetRoster(
      SET,
      { weapon: mk('weapon', 20), armor: mk('armor', 15) },
      { relic: mk('relic', 12) },
      [mk('accessory', 9)],
    );
    expect(Object.keys(r).length).toBe(4); // 4/4 affiché ⇒ 4 objets listés
    expect(SLOTS.every((s) => !!r[s])).toBe(true);
  });

  it('les pièces d’un AUTRE set, et le familier, n’y entrent jamais', () => {
    const r = voieSetRoster(SET, { weapon: mk('weapon', 99, 'voie:gardien') }, undefined, [
      mk('familiar' as ItemSlot, 99),
      { ...mk('armor', 50, 'voie:vampire') },
    ]);
    expect(Object.keys(r)).toEqual([]);
  });

  it('un set dont on ne possède rien rend un roster vide (et non une erreur)', () => {
    expect(voieSetRoster('voie:inconnue', {}, undefined, [])).toEqual({});
  });
});

describe('roster : la pièce PORTÉE ne disparaît jamais (v0.708)', () => {
  // ⚠️ DÉFAUT CONSTATÉ SUR UN COMPTE RÉEL. Plastron Légendaire du Gardien PORTÉ, Cotte
  // Mythique du même set en RÉSERVE : la meilleure gagnait l'affichage et la pièce
  // équipée disparaissait purement et simplement de la carte. Le joueur voyait une pièce
  // non marquée et ne retrouvait plus son objet. Un écran de collection doit pouvoir dire
  // « tu portes ceci, tu as mieux là » — pas escamoter l'un des deux.
  const SET = 'voie:gardien';
  const mk = (slot: ItemSlot, value: number, id: string): Item =>
    ({
      id,
      slot,
      name: id,
      emoji: '🛡️',
      rarity: 'rare',
      level: 10,
      baseLevel: 10,
      effect: { type: 'damage_pct', value },
      setId: SET,
    }) as Item;

  it('⚠️ une meilleure pièce en réserve n’efface pas celle qu’on porte', () => {
    const porte = mk('armor', 10, 'plastron-porte');
    const r = voieSetRoster(SET, { armor: porte }, { armor: mk('armor', 30, 'cotte-reserve') }, []);
    expect(r.armor?.item.id).toBe('cotte-reserve'); // la meilleure s'affiche…
    expect(r.armor?.worn).toBe(false);
    expect(r.armor?.wornItem?.id).toBe('plastron-porte'); // …sans perdre l'équipée
  });

  it('pas d’écart à signaler quand c’est bien la portée qui est la meilleure', () => {
    const r = voieSetRoster(
      SET,
      { armor: mk('armor', 30, 'bonne') },
      { armor: mk('armor', 10, 'moins') },
      [],
    );
    expect(r.armor?.worn).toBe(true);
    expect(r.armor?.wornItem).toBeUndefined();
  });

  it('ni quand on ne porte rien de ce set sur l’emplacement', () => {
    const r = voieSetRoster(SET, {}, { armor: mk('armor', 30, 'reserve') }, []);
    expect(r.armor?.worn).toBe(false);
    expect(r.armor?.wornItem).toBeUndefined();
  });

  it('une pièce portée d’un AUTRE set ne se fait pas passer pour l’écart', () => {
    const autre = { ...mk('armor', 99, 'ailleurs'), setId: 'voie:vampire' } as Item;
    const r = voieSetRoster(SET, { armor: autre }, { armor: mk('armor', 10, 'reserve') }, []);
    expect(r.armor?.wornItem).toBeUndefined();
  });
});

describe('optimiseur : TOUTES les combinaisons, bonus de set et de voie compris (v0.710)', () => {
  // ⚠️ CE QUI EST VERROUILLÉ. L'utilisateur demandait que le meilleur stuff soit cherché en
  // tenant compte des bonus de SET et de VOIE — donc mono-set, bi-set (2+2, 3+1), demi-sets
  // croisés, ou mélange avec des objets hors set. Le balayage des 4 emplacements est
  // exhaustif, mais seulement PARMI LES CANDIDATS RETENUS : c'est le filtre qui décide de
  // ce qui est atteignable. Le test compare donc l'optimiseur à une FORCE BRUTE sur le même
  // pool — s'ils divergent, c'est que le filtre a jeté l'optimum.
  const stats = { puissance: 60, endurance: 50, agilite: 30 };
  const mkI = (slot: ItemSlot, type: string, value: number, setId?: string, id?: string): Item =>
    ({
      id: id ?? `${slot}-${setId ?? 'nu'}-${value}`,
      slot,
      name: 'x',
      emoji: '⚔️',
      rarity: 'rare',
      level: 20,
      baseLevel: 20,
      effect: { type, value },
      ...(setId ? { setId } : {}),
    }) as Item;

  /** Meilleure puissance atteignable, tous assemblages confondus (référence honnête). */
  function bruteForce(pool: Item[], voie: string | null): number {
    const by: Record<string, (Item | undefined)[]> = {};
    for (const s of SLOTS) by[s] = [...pool.filter((i) => i.slot === s), undefined];
    let best = 0;
    for (const w of by.weapon!)
      for (const a of by.armor!)
        for (const ac of by.accessory!)
          for (const r of by.relic!) {
            const eq: Equipped = {};
            if (w) eq.weapon = w;
            if (a) eq.armor = a;
            if (ac) eq.accessory = ac;
            if (r) eq.relic = r;
            best = Math.max(best, combatPower(playerWithGear('T', stats, eq, {}, 20, voie)));
          }
    return best;
  }

  it('⚠️ atteint l’OPTIMUM : aucun assemblage possible ne bat sa réponse', () => {
    // Pool volontairement piégeux : deux sets complets + des objets nus parfois meilleurs
    // pièce à pièce. La bonne réponse n'est évidente sur aucun emplacement isolé.
    const A = 'voie:berserker';
    const B = 'voie:gardien';
    const pool: Item[] = [
      mkI('weapon', 'damage_pct', 22, A),
      mkI('armor', 'max_pv_pct', 20, A),
      mkI('accessory', 'crit_pct', 14, A),
      mkI('relic', 'damage_pct', 18, A),
      mkI('weapon', 'damage_pct', 20, B),
      mkI('armor', 'dmg_reduction_pct', 16, B),
      mkI('accessory', 'crit_pct', 15, B),
      mkI('relic', 'max_pv_pct', 22, B),
      mkI('weapon', 'damage_pct', 26),
      mkI('armor', 'max_pv_pct', 25),
      mkI('accessory', 'crit_pct', 17),
      mkI('relic', 'damage_pct', 21),
    ];
    for (const voie of ['berserker', 'gardien', null]) {
      const best = bestGearLoadout('T', stats, {}, pool, 20, {}, voie);
      const got = combatPower(playerWithGear('T', stats, best, {}, 20, voie));
      expect(got, `voie ${voie}`).toBe(bruteForce(pool, voie));
    }
  });

  it('⚠️ un DEMI-SET croisé est trouvé quand il bat le set complet', () => {
    // 2 pièces de A + 2 de B : deux bonus 2-pièces, contre un seul set dont le capstone est
    // gaté par la voie. Sans un candidat de CHAQUE set sur CHAQUE emplacement, cet
    // assemblage serait tout simplement inatteignable.
    const A = 'voie:berserker';
    const B = 'voie:gardien';
    const pool: Item[] = [
      mkI('weapon', 'damage_pct', 20, A),
      mkI('armor', 'damage_pct', 20, A),
      mkI('accessory', 'damage_pct', 20, B),
      mkI('relic', 'damage_pct', 20, B),
    ];
    // On joue une TROISIÈME voie : aucun capstone ne s'applique, seuls les 2-pièces comptent.
    const best = bestGearLoadout('T', stats, {}, pool, 20, {}, 'assassin');
    const sets = new Set(SLOTS.map((s) => best[s]?.setId).filter(Boolean));
    expect(sets.size, 'les deux moitiés doivent être portées').toBe(2);
    expect(combatPower(playerWithGear('T', stats, best, {}, 20, 'assassin'))).toBe(
      bruteForce(pool, 'assassin'),
    );
  });

  it('la MEILLEURE pièce de chaque set survit au filtre, même avec beaucoup de sets', () => {
    // Le filtre gardait « jusqu'à 12 pièces de set » par ordre de puissance solo : au-delà,
    // des sets entiers pouvaient n'être représentés sur aucun emplacement.
    const pool: Item[] = [];
    for (const v of VOIE_SETS) {
      pool.push(mkI('weapon', 'damage_pct', 10, v.id, `w-${v.id}`));
      pool.push(mkI('weapon', 'damage_pct', 4, v.id, `w2-${v.id}`)); // doublon plus faible
    }
    const best = bestGearLoadout('T', stats, {}, pool, 20, {}, null);
    expect(best.weapon).toBeDefined();
    expect(combatPower(playerWithGear('T', stats, best, {}, 20, null))).toBe(
      bruteForce(pool, null),
    );
  });

  it('ne retire jamais une pièce sans mieux : l’auto-équip ne peut pas faire PERDRE', () => {
    const worn = mkI('weapon', 'damage_pct', 40, undefined, 'porte');
    const best = bestGearLoadout(
      'T',
      stats,
      { weapon: worn },
      [mkI('weapon', 'damage_pct', 5)],
      20,
      {},
      null,
    );
    expect(best.weapon?.id).toBe('porte');
  });
});

describe('« Porter ce set » : les pièces du set sont IMPOSÉES (v0.711)', () => {
  // ⚠️ RÉGRESSION CORRIGÉE. En ouvrant le pool à toutes les réserves (v0.710), « Porter ce
  // set » — qui ne forçait que la VOIE — s'est mis à rendre le meilleur build sur cette
  // voie, souvent sans une seule pièce du set demandé. Constaté sur un compte réel :
  // « Porter le set Frénétique » a équipé 2 Gardien + 1 Duelliste + 1 Berserker. Le chiffre
  // annoncé était juste ; c'est le bouton qui ne tenait pas sa promesse.
  const stats = { puissance: 60, endurance: 50, agilite: 30 };
  const mkI = (slot: ItemSlot, value: number, setId?: string, id?: string): Item =>
    ({
      id: id ?? `${slot}-${setId ?? 'nu'}-${value}`,
      slot,
      name: 'x',
      emoji: '⚔️',
      rarity: 'rare',
      level: 20,
      baseLevel: 20,
      effect: { type: 'damage_pct', value },
      ...(setId ? { setId } : {}),
    }) as Item;
  const SET = 'voie:frenetique';
  // Le set est VOLONTAIREMENT plus faible pièce à pièce que les objets nus : c'est le seul
  // cas qui prouve l'imposition — si le set gagnait, l'optimiseur le prendrait tout seul.
  const pool: Item[] = [
    mkI('weapon', 8, SET),
    mkI('armor', 8, SET),
    mkI('accessory', 8, SET),
    mkI('relic', 8, SET),
    mkI('weapon', 40),
    mkI('armor', 40),
    mkI('accessory', 40),
    mkI('relic', 40),
  ];

  it('⚠️ le set demandé est PORTÉ, même s’il est moins puissant', () => {
    const pin: Partial<Record<ItemSlot, Item>> = {};
    for (const sl of SLOTS) pin[sl] = pool.find((i) => i.slot === sl && i.setId === SET)!;
    const best = bestGearLoadout('T', stats, {}, pool, 20, {}, 'frenetique', pin);
    for (const sl of SLOTS) expect(best[sl]?.setId, `emplacement ${sl}`).toBe(SET);
  });

  it('sans imposition, l’optimiseur prend LIBREMENT le plus puissant', () => {
    // Le contraste qui donne son sens au test précédent : la même recherche sans `pin`
    // écarte le set. C'est exactement ce qui se passait sur le bouton.
    const best = bestGearLoadout('T', stats, {}, pool, 20, {}, 'frenetique');
    expect(SLOTS.every((sl) => best[sl]?.setId === SET)).toBe(false);
  });

  it('⚠️ le set s’impose MÊME quand l’équipement actuel est plus fort', () => {
    // Le cas RÉEL : le joueur porte déjà du bon stuff. Si la recherche garde le loadout
    // ACTUEL comme référence, elle le conserve — et le set demandé n'arrive jamais.
    const porte: Equipped = {};
    for (const sl of SLOTS) porte[sl] = mkI(sl, 60, undefined, 'fort-' + sl);
    const pin: Partial<Record<ItemSlot, Item>> = {};
    for (const sl of SLOTS) pin[sl] = pool.find((i) => i.slot === sl && i.setId === SET)!;
    const best = bestGearLoadout(
      'T',
      stats,
      porte,
      [...pool, ...(Object.values(porte) as Item[])],
      20,
      {},
      'frenetique',
      pin,
    );
    for (const sl of SLOTS) expect(best[sl]?.setId, 'emplacement ' + sl).toBe(SET);
  });

  it('les emplacements NON couverts par le set restent optimisés', () => {
    const partiel = [
      mkI('weapon', 8, SET),
      mkI('armor', 8, SET),
      mkI('accessory', 40),
      mkI('relic', 40),
      mkI('accessory', 5),
      mkI('relic', 5),
    ];
    const pin = { weapon: partiel[0]!, armor: partiel[1]! };
    const best = bestGearLoadout('T', stats, {}, partiel, 20, {}, 'frenetique', pin);
    expect(best.weapon?.setId).toBe(SET);
    expect(best.armor?.setId).toBe(SET);
    expect(best.accessory?.effect.value).toBe(40); // le reste au mieux
    expect(best.relic?.effect.value).toBe(40);
  });
});

describe('roster : le barème est celui du JEU, pas une somme d’affixes (v0.712)', () => {
  // ⚠️ CONSTATÉ SUR UN COMPTE RÉEL. `itemScore` additionne les affixes ; `combatPower`
  // arbitre tout le reste du jeu. Les deux se contredisent : une Lame à 107 d'itemScore
  // était PORTÉE par l'optimiseur à la place d'une Hache à 115, parce qu'elle vaut plus en
  // combat. La carte du set, qui classait à l'itemScore, mettait donc en avant la pièce que
  // l'optimiseur venait d'écarter — et celle qu'on porte semblait absente de son set.
  const SET = 'voie:duelliste';
  const mk = (slot: ItemSlot, type: string, value: number, id: string): Item =>
    ({
      id,
      slot,
      name: id,
      emoji: '🗡️',
      rarity: 'rare',
      level: 20,
      baseLevel: 20,
      effect: { type, value },
      setId: SET,
    }) as Item;

  it('⚠️ la pièce que le barème du jeu préfère l’emporte, même à itemScore plus BAS', () => {
    // « grosse somme » gagne à l'itemScore ; « utile » gagne au barème fourni.
    const grosseSomme = mk('weapon', 'gold_pct', 60, 'somme');
    const utile = mk('weapon', 'damage_pct', 30, 'utile');
    expect(itemScore(grosseSomme)).toBeGreaterThan(itemScore(utile));

    const parDefaut = voieSetRoster(SET, { weapon: utile }, { weapon: grosseSomme }, []);
    expect(parDefaut.weapon?.item.id, 'barème par défaut = itemScore').toBe('somme');

    // Barème « puissance » : ici on déclare simplement que `utile` vaut plus.
    const parPuissance = voieSetRoster(SET, { weapon: utile }, { weapon: grosseSomme }, [], (it) =>
      it.id === 'utile' ? 100 : 1,
    );
    expect(parPuissance.weapon?.item.id).toBe('utile');
    expect(parPuissance.weapon?.worn, 'et elle est marquée PORTÉE').toBe(true);
  });

  it('le barème sert aussi à départager deux pièces en réserve', () => {
    const a = mk('armor', 'damage_pct', 10, 'a');
    const b = mk('armor', 'damage_pct', 10, 'b');
    const r = voieSetRoster(SET, {}, { armor: a }, [b], (it) => (it.id === 'b' ? 2 : 1));
    expect(r.armor?.item.id).toBe('b');
  });
});

describe('⚠️ l’équipement conseillé est LOCALEMENT OPTIMAL', () => {
  // Deux écrans se contredisaient sur un compte réel : « ton équipement est déjà
  // optimal » d'un côté, une pastille « +30 » sur le sac de l'autre. C'est l'optimiseur
  // qui avait tort — il classait ses candidats en SOLO (la pièce portée SEULE), or porté
  // seul un objet perd tout ce qui le rend bon : les bonus de set de ses compagnons et
  // les stats qui se multiplient entre elles. Mesuré : une arme écartée valait +143.
  //
  // ⚠️ VIVIER ALÉATOIRE, et c'est délibéré : un vivier écrit à la main ne teste que le
  // piège qu'on a su imaginer. Un premier essai « bien construit » passait AUSSI avec le
  // code fautif — un test creux. Plusieurs graines variées, elles, l'attrapent.
  const stats = { puissance: 900, endurance: 900, agilite: 900 };
  const L = 28;
  const TYPES: EffectType[] = [
    'damage_pct',
    'max_pv_pct',
    'crit_pct',
    'dmg_reduction_pct',
    'lifesteal_pct',
  ];
  const SETS = [undefined, 'voie:berserker', 'voie:gardien', 'voie:vampire'];

  function vivier(seed: number): Item[] {
    const rng = mulberry32(seed);
    const out: Item[] = [];
    let n = 0;
    for (const s of SLOTS) {
      // ⚠️ Taille RÉALISTE : un compte réel porte 150+ objets par emplacement, et c’est
      // seulement à cette densité que le filtre top-K mord — avec 22, n’importe quel tri
      // retenait le gagnant, et les mutations passaient au vert.
      for (let k = 0; k < 70; k++) {
        const setId = SETS[Math.floor(rng() * SETS.length)];
        out.push({
          id: `i${seed}_${n++}`,
          name: 'x',
          slot: s,
          rarity: 'epique',
          level: 20 + Math.floor(rng() * 20),
          roll: rng(),
          effect: {
            type: TYPES[Math.floor(rng() * TYPES.length)]!,
            value: 8 + Math.round(rng() * 50),
          },
          ...(setId ? { setId } : {}),
        } as Item);
      }
    }
    return out;
  }

  it('⚠️ AUCUN échange d’UN SEUL objet ne gagne depuis le build conseillé', () => {
    // C'est la propriété que les deux écrans partagent : s'il existait un tel échange,
    // la pastille du sac l'annoncerait et l'optimiseur se contredirait.
    for (const seed of [1, 7, 42, 1234, 99991]) {
      const inv = vivier(seed);
      // ⚠️ ON PART D’UN BUILD PORTÉ, jamais d’un personnage nu : à vide, « en solo » et
      // « en contexte » sont IDENTIQUES par construction, et le tri fautif passait donc
      // inaperçu. C’est aussi le cas réel — on optimise un stuff qu’on a déjà.
      const porteDepart: Equipped = {};
      for (const sl of SLOTS) porteDepart[sl] = inv.find((i) => i.slot === sl)!;
      for (const voie of [null, 'berserker']) {
        const best = bestGearLoadout('T', stats, porteDepart, inv, L, {}, voie);
        const base = combatPower(playerWithGear('T', stats, best, {}, L, voie));
        const porte = new Set(SLOTS.map((s) => best[s]?.id).filter(Boolean));
        for (const it of inv) {
          if (porte.has(it.id)) continue;
          const p = combatPower(
            playerWithGear('T', stats, { ...best, [it.slot]: it }, {}, L, voie),
          );
          expect(
            p,
            `graine ${seed} voie ${voie} · ${it.slot} ${it.effect.type}`,
          ).toBeLessThanOrEqual(base);
        }
      }
    }
  });

  it('ne fait JAMAIS perdre de puissance : le porté reste toujours candidat', () => {
    const inv = vivier(3);
    const porte: Equipped = { weapon: inv.find((i) => i.slot === 'weapon')! };
    const best = bestGearLoadout('T', stats, porte, [], L, {}, 'berserker');
    expect(
      combatPower(playerWithGear('T', stats, best, {}, L, 'berserker')),
    ).toBeGreaterThanOrEqual(combatPower(playerWithGear('T', stats, porte, {}, L, 'berserker')));
  });
});

describe('⚠️ élagage par DOMINANCE : rapide SANS jamais perdre le gagnant', () => {
  // Le premier filtre gardait « les N meilleurs par score » et a JETÉ UN GAGNANT (+143
  // mesuré) : classer, c'est déjà supposer qu'on sait comparer deux objets de natures
  // différentes. La dominance ne compare que le comparable.
  const mk = (id: string, slot: ItemSlot, v: Record<string, number>, setId?: string): Item => {
    const e = Object.entries(v);
    return {
      id,
      name: 'x',
      slot,
      rarity: 'epique',
      level: 1,
      roll: 0,
      effect: { type: e[0]![0] as EffectType, value: e[0]![1]! },
      ...(e[1] ? { effect2: { type: e[1][0] as EffectType, value: e[1][1] } } : {}),
      ...(setId ? { setId } : {}),
    } as Item;
  };

  it('écarte ce qui est battu sur TOUS les axes', () => {
    const fort = mk('a', 'weapon', { damage_pct: 30, crit_pct: 10 });
    const faible = mk('b', 'weapon', { damage_pct: 20, crit_pct: 5 });
    const ids = elagueDomines([fort, faible]).map((i) => i.id);
    expect(ids).toContain('a');
    expect(ids).not.toContain('b');
  });

  it('⚠️ GARDE tout compromis : meilleur sur un axe, moins bon sur l’autre', () => {
    // C'est toute la différence avec un tri par score — le compromis est justement ce
    // qu'un classement écrase, et ce qui gagne une fois le reste du build en place.
    const a = mk('a', 'weapon', { damage_pct: 30, crit_pct: 5 });
    const b = mk('b', 'weapon', { damage_pct: 20, crit_pct: 25 });
    expect(elagueDomines([a, b])).toHaveLength(2);
  });

  it('⚠️ ne compare JAMAIS entre SETS différents', () => {
    // Une pièce plus faible d'un autre set peut gagner par son bonus de set.
    const fort = mk('a', 'weapon', { damage_pct: 30 }, 'voie:berserker');
    const faible = mk('b', 'weapon', { damage_pct: 20 }, 'voie:gardien');
    expect(elagueDomines([fort, faible])).toHaveLength(2);
  });

  it('⚠️ deux objets IDENTIQUES : on en garde UN, jamais zéro', () => {
    // Ils se dominent mutuellement — sans départage, les deux disparaîtraient.
    const a = mk('a', 'weapon', { damage_pct: 30 });
    const b = mk('b', 'weapon', { damage_pct: 30 });
    expect(elagueDomines([a, b])).toHaveLength(1);
  });

  it('ne mélange pas les emplacements', () => {
    const arme = mk('a', 'weapon', { damage_pct: 30 });
    const armure = mk('b', 'armor', { damage_pct: 20 });
    expect(elagueDomines([arme, armure])).toHaveLength(2);
  });
});

describe('⚠️ tri des familiers : la STAT PORTÉE tranche, pas le jet seul', () => {
  // Le défaut corrigé (signalé) : deux faucons de même rareté, stats différentes, et le
  // plus fort relégué en bas de liste. `tierIndexOf` classait sur rareté + jet et
  // IGNORAIT le niveau d'objet — pourtant 3ᵉ axe de magnitude depuis la v0.583.
  const fam = (id: string, o: Partial<Item> = {}): Item =>
    ({
      id,
      slot: 'familiar',
      name: o.name ?? 'Faucon',
      emoji: '🦅',
      rarity: o.rarity ?? 'legendaire',
      level: o.level ?? 1,
      baseLevel: 1,
      roll: o.roll ?? 0.5,
      effect: o.effect ?? { type: 'crit_pct', value: 10 },
      ...o,
    }) as Item;

  const order = (list: Item[]) => [...list].sort(compareFamiliars).map((f) => f.id);

  it('⚠️ à rareté et jet ÉGAUX, le NIVEAU D’OBJET départage — c’est le bug signalé', () => {
    // Même rareté, même jet, même valeur de base : seule l'ilvl diffère, donc seule la
    // stat affichée diffère. Le tri doit suivre la stat, pas l'ordre d'arrivée.
    const bas = fam('ilvl-bas', { level: 1 });
    const haut = fam('ilvl-haut', { level: 60 });
    expect(order([bas, haut])).toEqual(['ilvl-haut', 'ilvl-bas']);
    expect(order([haut, bas])).toEqual(['ilvl-haut', 'ilvl-bas']);
  });

  it('⚠️ un JET plus faible mais une STAT plus forte passe devant', () => {
    // C'est la différence entre classer sur un PROXY (le jet) et sur la vérité (la stat).
    const jetFort = fam('jet-fort', { roll: 0.99, effect: { type: 'crit_pct', value: 10 } });
    const statForte = fam('stat-forte', { roll: 0.1, effect: { type: 'crit_pct', value: 14 } });
    expect(order([jetFort, statForte])).toEqual(['stat-forte', 'jet-fort']);
  });

  it('la RARETÉ reste devant : ses bandes sont disjointes par construction', () => {
    const epique = fam('epique', { rarity: 'epique', effect: { type: 'crit_pct', value: 99 } });
    const leg = fam('legendaire', { effect: { type: 'crit_pct', value: 1 } });
    expect(order([epique, leg])).toEqual(['legendaire', 'epique']);
  });

  it('⚠️ à STAT égale, une SIGNATURE ✦ passe devant — elle ne se remplace par rien', () => {
    const nu = fam('nu');
    const sig = fam('signature', { effect2: { type: 'execute_pct', value: 7 } });
    expect(order([nu, sig])).toEqual(['signature', 'nu']);
  });

  it('à tout égal, le NOM départage — un ordre stable vaut mieux qu’un ordre au hasard', () => {
    const b = fam('b', { name: 'Bravo' });
    const a = fam('a', { name: 'Alpha' });
    expect(order([b, a])).toEqual(['a', 'b']);
  });
});

describe('📖 LIRE UN AGRÉGAT D’EFFETS', () => {
  // Ces lignes sont ce qui départage deux compagnons dans la Guilde : avant, on ne
  // voyait que l’icône du familier et son rang.

  it('⚠️ FRACTION → POURCENT : le piège qui a déjà coûté un facteur CENT', () => {
    // `AggregatedEffects` est en FRACTIONS, `effectLabelFor` attend des POURCENTS.
    const fx = { ...emptyEffects(), damagePct: 0.042 };
    expect(aggregateLines(fx)).toEqual(['+4,2% dégâts']);
    // Ni « +0% » (oubli du ×100), ni « +420% » (×100 en trop).
    const l = aggregateLines(fx)[0]!;
    expect(l).not.toContain('0,4%');
    expect(l).not.toContain('420');
  });

  it('⚠️ EXHAUSTIF : aucun canal ne disparaît en silence', () => {
    // Un canal muet, c’est un gain qu’on promet sans jamais l’afficher. La table de
    // lecture couvre `keyof AggregatedEffects` — ajouter un canal sans le nommer casse
    // la compilation ; ce test garde le versant runtime.
    const vide = emptyEffects();
    for (const key of Object.keys(vide) as (keyof typeof vide)[]) {
      const lignes = aggregateLines({ ...vide, [key]: 0.05 });
      expect(lignes, `canal ${key} muet`).toHaveLength(1);
      expect(lignes[0]).toContain('5');
    }
  });

  it('⚠️ L’ESQUIVE A SON LIBELLÉ PROPRE — elle n’a pas d’EffectType', () => {
    // Elle ne vient que des talents et des voies. Sans cas dédié, un talent d’esquive
    // confié à un aventurier n’afficherait rien du tout.
    expect(aggregateLines({ ...emptyEffects(), dodgeAdd: 0.035 })).toEqual(['+3,5% esquive']);
  });

  it('on se tait plutôt que de promettre un gain nul', () => {
    expect(aggregateLines(emptyEffects())).toEqual([]);
    // Un résidu qui s’afficherait « +0% » ne dit rien : on l’omet.
    expect(aggregateLines({ ...emptyEffects(), goldPct: 0.0003 })).toEqual([]);
  });

  it('plusieurs canaux se lisent ensemble, dans l’ordre du plus lourd', () => {
    const fx = { ...emptyEffects(), goldPct: 0.1, damagePct: 0.05, maxPvPct: 0.08 };
    expect(aggregateLines(fx)).toEqual(['+5% dégâts', '+8% PV', '+10% or']);
  });

  it('⚠️ IL LIT CE QUE LA LIB PRODUIT, pas un objet fabriqué à la main', () => {
    // Non-régression d’unité de bout en bout : la conversion de `effectAsAggregate`
    // (÷100) et celle d’`aggregateLines` (×100) doivent se compenser exactement.
    expect(aggregateLines(effectAsAggregate('crit_pct', 7.5))).toEqual(['+7,5% critique']);
  });
});

describe('🎆 RARETÉ → INTENSITÉ D’ANIMATION', () => {
  it('⚠️ LE SOMMET DE L’ÉCHELLE EST ATTEIGNABLE — il ne l’était plus', () => {
    // Les deux copies de cette fonction (AventurePage, ExpeditionPage) portaient des
    // seuils calés sur les DIX rangs G→SSS de la v0.438 (`i >= 9`). Depuis la refonte
    // en 8 raretés (v0.576), l'index ne monte plus qu'à 7 : la branche « divin » —
    // l'explosion — était INATTEIGNABLE et un drop primordial jouait l'animation d'un
    // légendaire. Un seuil en index absolu pourrit dès que l'échelle change de longueur.
    expect(fxRarity(RANK_ORDER[RANK_ORDER.length - 1]!)).toBe('divin');
    expect(fxRarity(RANK_ORDER[0]!)).toBe('common');
  });

  it('elle ne recule jamais quand la rareté monte', () => {
    const ordre: FxRarity[] = ['common', 'rare', 'epic', 'legendary', 'divin'];
    let vu = -1;
    for (const r of RANK_ORDER) {
      const i = ordre.indexOf(fxRarity(r));
      expect(i, `rareté ${r}`).toBeGreaterThanOrEqual(vu);
      vu = i;
    }
  });

  it('⚠️ elle emploie les CINQ crans, sinon la moitié de l’échelle est morte', () => {
    expect(new Set(RANK_ORDER.map(fxRarity)).size).toBe(5);
  });
});

describe('⚖️ ÉCHELLE DES PALIERS DE SET (v0.837) — ce qui rend les 8 sets équivalents', () => {
  const tier = (voie: string, pieces: number) =>
    SET_BY_ID[`voie:${voie}`]!.tiers.find((t) => t.pieces === pieces)!;
  it('à stat égale, les paliers ne valent pas pareil d’un set à l’autre', () => {
    // Berserker et Assassin portent tous deux l’exécution au 3-pièces : sans échelle, même
    // valeur. Mesuré : un palier d’exécution ne pèse presque rien, celui du Berserker est grossi.
    expect(tier('berserker', 3).type).toBe(tier('assassin', 3).type);
    expect(tier('berserker', 3).base / tier('assassin', 3).base).toBeCloseTo(1.6, 1);
    // Gardien et Colosse portent tous deux les dégâts au 2-pièces : le Gardien, dont les PV
    // et la réduction pèsent lourd en combat, est le plus réduit.
    expect(tier('gardien', 2).type).toBe(tier('colosse', 2).type);
    expect(tier('gardien', 2).base).toBeLessThan(tier('colosse', 2).base);
  });
  it('l’échelle vaut pour les trois paliers, capstone compris', () => {
    // Vampire (vol de vie au 4-pièces) grossi, Berserker (vol de vie au 2-pièces) aussi : les
    // deux restent au-dessus d’Assassin, qui porte la même stat au 2-pièces sans échelle.
    expect(tier('vampire', 4).type).toBe('lifesteal_pct');
    expect(tier('berserker', 2).base).toBeGreaterThan(tier('assassin', 2).base);
  });
});

describe('🧭 AFFINITÉ DE VOIE : porter la voie d’un set double ses bonus 2 et 3 pièces', () => {
  // Meilleure de 4 pièces tirées AU NIVEAU du joueur — ce qu'il porte réellement.
  const piece = (setId: string, slot: Item['slot'], seed: number, level = 40): Item => {
    const rng = mulberry32(seed);
    let best: Item | null = null;
    for (let k = 0; k < 4; k++) {
      const it = {
        ...rollSetPiece(rng, { setId, level, luck: 0.5, preferSlot: slot, playerLevel: level }),
        id: `${setId}-${slot}-${seed}-${k}`,
      } as Item;
      if (!best || itemScore(it) > itemScore(best)) best = it;
    }
    return best!;
  };
  const threeOf = (voie: string, seed = 1, level = 40): Equipped => ({
    weapon: piece(`voie:${voie}`, 'weapon', seed, level),
    armor: piece(`voie:${voie}`, 'armor', seed + 1, level),
    relic: piece(`voie:${voie}`, 'relic', seed + 2, level),
  });

  it('dans sa voie, les bonus 2 et 3 pièces valent le double (arrondi à 0,1 point près)', () => {
    const eq = threeOf('epineux');
    const own = setEffects(eq, 'epineux');
    const off = setEffects(eq, 'gardien');
    // Épineux : 2 pièces = dégâts, 3 pièces = PV.
    expect(off.damagePct).toBeGreaterThan(0);
    expect(off.maxPvPct).toBeGreaterThan(0);
    expect(Math.abs(own.damagePct - 2 * off.damagePct)).toBeLessThanOrEqual(0.0011);
    expect(Math.abs(own.maxPvPct - 2 * off.maxPvPct)).toBeLessThanOrEqual(0.0011);
  });

  it('hors de sa voie, un set ne perd rien : c’est un bonus, pas une pénalité', () => {
    const eq = threeOf('epineux');
    // Sans voie comme dans une autre voie : la valeur de base, identique.
    expect(setEffects(eq, 'gardien')).toEqual(setEffects(eq, null));
    expect(setEffects(eq, 'berserker')).toEqual(setEffects(eq, null));
  });

  it('le capstone 4 pièces n’est PAS doublé', () => {
    const eq: Equipped = {
      ...threeOf('epineux'),
      accessory: piece('voie:epineux', 'accessory', 9),
    };
    const tiers = SET_BY_ID['voie:epineux']!.tiers;
    const t2 = tiers.find((t) => t.pieces === 2)!;
    const t4 = tiers.find((t) => t.pieces === 4)!;
    // Le multiplicateur du set se relit sur le 2-pièces HORS voie (valeur de base, non doublée).
    const mult = (setEffects(eq, null).damagePct * 100) / t2.base;
    const capstone = setEffects(eq, 'epineux').thornsPct * 100;
    expect(capstone).toBeGreaterThan(0);
    expect(Math.abs(capstone - t4.base * mult)).toBeLessThanOrEqual(0.2);
  });

  it('avec 3 pièces du set d’une voie, CETTE voie donne la meilleure puissance', () => {
    // Le défaut signalé : 3 pièces Épineux, et l'optimiseur proposait une autre voie.
    // 288 cas (6 niveaux × 8 voies × 6 tirages, dont des pièces en retard de 15 niveaux).
    // Mesuré : sans affinité, la voie du set perdait 238 fois (Épineux 36/36) ; avec, 10 fois.
    // ⚠️ EXCEPTIONS CONNUES (v0.837, mesuré : 6 échecs sur 288, pertes ≤ 0,8 %) — Berserker :
    // son palier doublé porte du vol de vie, que la puissance plafonne ; Colosse : sa voie a le
    // MÊME passif que l'Épineux (PV) et son palier doublé est de la réduction, déjà près de son
    // plafond. Assassin, exception jusqu'en v0.835, n'échoue plus depuis que son passif est de
    // l'exécution (le critique était plafonné).
    const voies = VOIES.map((v) => v.id);
    const known = new Set(['berserker', 'colosse']);
    let fails = 0;
    let n = 0;
    for (const L of [20, 30, 45, 60, 75, 90]) {
      const s = cumXpForLevel(L) / 3;
      const stats = computeCharacter(s, s, s, 0);
      for (const V of voies) {
        for (let seed = 1; seed <= 6; seed++) {
          const rng = mulberry32(seed * 977 + L * 13 + V.length);
          const eq: Equipped = {};
          for (const slot of ['weapon', 'armor', 'relic'] as Item['slot'][]) {
            let b: Item | null = null;
            for (let k = 0; k < 1 + (seed % 4); k++) {
              const lvl = seed % 3 === 0 ? Math.max(1, L - 15) : L;
              const it = {
                ...rollSetPiece(rng, {
                  setId: `voie:${V}`,
                  level: lvl,
                  luck: 0.5,
                  preferSlot: slot,
                  playerLevel: L,
                }),
                id: `s${k}`,
              } as Item;
              if (!b || itemScore(it) > itemScore(b)) b = it;
            }
            eq[slot] = b!;
          }
          for (let k = 0; k < 300; k++) {
            const it = rollDrop(rng, {
              cleared: true,
              defeated: 3,
              level: L,
              luck: 0.5,
              playerLevel: L,
            });
            if (it && it.slot === 'accessory' && !it.setId) {
              eq.accessory = { ...it, id: 'acc' } as Item;
              break;
            }
          }
          const power = (v: string | null) =>
            combatPower(playerWithGear('h', stats, eq, voiePassiveEffects(v as never), L, v));
          const own = power(V);
          const best = Math.max(...[...voies.filter((x) => x !== V), null].map(power));
          n++;
          if (own < best) {
            fails++;
            // ⚠️ v0.875 (objets au rang du joueur) : aux niveaux 20-30 les pièces sont Bronze ou
            // Argent (un seul affixe) et Gardien/Vampire perdent parfois de peu (mesuré ≤ 1,4 %
            // depuis la v0.876, sans rang au-dessus). Hors liste connue, un échec doit rester marginal.
            if (!known.has(V))
              expect(1 - own / best, `${V} niv ${L} graine ${seed}`).toBeLessThan(0.02);
          }
        }
      }
    }
    // 6 % depuis la v0.876 (plus aucun rang au-dessus) : mesuré 15 échecs sur 288 (5,2 %),
    // tous marginaux (≤ 2 % de puissance, vérifié ci-dessus).
    // ⚠️ 8 % depuis la v0.894 (le rang du joueur s'ouvre sur la durée du rang : les pièces de
    // set tirées ici sont surtout du rang d'en dessous, un affixe de moins) : mesuré 20 échecs
    // sur 288 (6,9 %), toujours tous marginaux — l'écart de puissance reste vérifié ci-dessus.
    expect(fails / n).toBeLessThan(0.08);
  });
});

describe('🪓 L’AVATAR MONTRE L’ARME ET LE SET PORTÉS (v0.832)', () => {
  // Signalé : « j’ai une hache mais ça affiche une épée ». Aucun champ ne portait la forme :
  // elle vivait dans le NOM. Le test tire de VRAIS drops plutôt que des noms écrits à la main —
  // sinon il ne vérifierait que les cas que j’ai su imaginer.
  it('chaque nom d’arme réellement tiré donne sa forme — jamais l’épée par défaut', () => {
    const vus = new Set<string>();
    for (let s = 1; s <= 600; s++) {
      const d = rollDrop(mulberry32(s * 31 + 7), {
        cleared: true,
        defeated: 1,
        level: 40,
        luck: 0.5,
      });
      if (!d || d.slot !== 'weapon') continue;
      const noun = d.name.split(' ')[0]!;
      const k = weaponKind(d);
      vus.add(k);
      if (noun === 'Hache' || noun === 'Guillotine' || noun === 'Couperet')
        expect(k, d.name).toBe('hache');
      if (noun === 'Masse') expect(k, d.name).toBe('masse');
      if (noun === 'Dague') expect(k, d.name).toBe('dague');
      if (noun === 'Fléau') expect(k, d.name).toBe('fleau');
      if (noun === 'Faux') expect(k, d.name).toBe('faux');
    }
    // Les cinq formes de base sortent vraiment des tirages.
    for (const k of ['lame', 'hache', 'masse', 'dague', 'fleau']) expect(vus.has(k), k).toBe(true);
  });

  it('une pièce de set garde la forme de son nom (« Hache · Carapace… »)', () => {
    let vus = 0;
    for (let s = 1; s <= 200; s++) {
      const p = rollSetPiece(mulberry32(s * 17 + 3), {
        setId: 'voie:epineux',
        level: 30,
        preferSlot: 'weapon',
      });
      if (!p.name.startsWith('Hache')) continue;
      vus++;
      expect(weaponKind(p)).toBe('hache');
    }
    expect(vus).toBeGreaterThan(0);
  });

  it('sans nom (objet d’apparence, portrait d’aventurier) : une lame, sans planter', () => {
    expect(weaponKind(undefined)).toBe('lame');
    expect(weaponKind({})).toBe('lame');
    expect(weaponKind({ name: 'Bâton inconnu' })).toBe('lame');
  });

  it('🎨 chaque set de voie a SA couleur, et l’Épineux est vert', () => {
    const colors = VOIE_SETS.map((x) => x.color);
    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors).size).toBe(VOIE_SETS.length);
    const epine = VOIE_SETS.find((x) => x.id === 'voie:epineux')!.color!;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(epine.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r!);
    expect(g).toBeGreaterThan(b!);
  });

  it('le set porté : à partir de 2 pièces, le plus fourni, la voie départage', () => {
    const piece = (slot: 'weapon' | 'armor' | 'accessory' | 'relic', setId: string) =>
      ({
        id: slot + setId,
        slot,
        name: 'x',
        emoji: '',
        rarity: 'rare',
        level: 1,
        baseLevel: 1,
        setId,
        effect: { type: 'damage_pct', value: 1 },
      }) as never;
    expect(wornSet({ weapon: piece('weapon', 'voie:epineux') })).toBeNull();
    const deux = { weapon: piece('weapon', 'voie:epineux'), armor: piece('armor', 'voie:epineux') };
    expect(wornSet(deux)?.set.id).toBe('voie:epineux');
    expect(wornSet(deux)?.color).toBe(VOIE_SETS.find((x) => x.id === 'voie:epineux')!.color);
    const trois = {
      ...deux,
      accessory: piece('accessory', 'voie:gardien'),
      relic: piece('relic', 'voie:gardien'),
    };
    expect(wornSet(trois, 'gardien')?.set.id).toBe('voie:gardien');
    expect(wornSet(trois, 'epineux')?.set.id).toBe('voie:epineux');
    const plus = {
      ...deux,
      accessory: piece('accessory', 'voie:epineux'),
      relic: piece('relic', 'voie:gardien'),
    };
    expect(wornSet(plus, 'gardien')?.pieces).toBe(3);
  });
});

describe('🏅 FAMILIERS ET TALENTS SE LISENT EN RANG (v0.833)', () => {
  it('⚠️ un aventurier promu à son rang mène des compagnons de CE rang — sans table de conversion', async () => {
    // La promotion i tombe au début du rang i (PROMO_LEVELS = rankStartLevel), et la classe
    // gagnée vaut la rareté i : le nom affiché pour la rareté i doit donc être celui du rang
    // qu'affiche un aventurier fraîchement promu. Sinon « un Bronze mène un Bronze » ment.
    const { PROMO_LEVELS } = await import('@/lib/adventurers');
    const { characterRank } = await import('@/lib/characterRank');
    RANK_ORDER.forEach((r, i) => {
      expect(rarityRank(r).name, r).toBe(characterRank(PROMO_LEVELS[i]!).name);
    });
    expect(rarityRank('commun').name).toBe('Bronze');
    expect(rarityRank('inhabituel').name).toBe('Argent');
  });
  it('chaque rareté a son rang, sans collision', () => {
    const names = RANK_ORDER.map((r) => rarityRank(r).name);
    expect(new Set(names).size).toBe(RANK_ORDER.length);
  });
  it('⚠️ un objet prend la COULEUR de son rang, pas celle de l’ancienne rareté (v0.895)', async () => {
    for (const r of RANK_ORDER) expect(RANK_COLOR[r], r).toBe(rarityRank(r).color);
    expect(new Set(Object.values(RANK_COLOR)).size).toBe(RANK_ORDER.length);
    // Les classes r-*/p-* lisent --rank-<rareté>, posées au démarrage depuis RANK_COLOR : une
    // seule source. Le bloc global d'app.scss doit couvrir TOUTES les raretés.
    const vars = rankCssVars();
    for (const r of RANK_ORDER) expect(vars[`--rank-${r}`], r).toBe(RANK_COLOR[r]);
    const fs = await import('node:fs');
    const scss = fs.readFileSync('src/css/app.scss', 'utf8');
    const each = scss
      .match(/@each \$r in ([a-z, ]+)\{/)?.[1]
      ?.split(',')
      .map((x) => x.trim());
    expect(each).toEqual([...RANK_ORDER]);
  });
  it('tout ce qui porte un jet se lit en rang ET étoiles, FAMILIER COMPRIS (v0.907)', () => {
    const rare = rarityRank('rare').name;
    expect(gradeLabel({ rarity: 'rare', slot: 'weapon', roll: 0.5 })).toBe(`${rare} ★★★☆☆`);
    // ⚠️ Le familier en était EXCLU (v0.895) : son jet n'est pas tiré par l'étoile du joueur.
    // Mesuré, ses 5 étoiles restent discriminantes → une seule lecture dans tout le jeu.
    expect(gradeLabel({ rarity: 'rare', slot: 'familiar', roll: 0.5 })).toBe(`${rare} ★★★☆☆`);
    // Un objet d'avant le jet (pas de `roll`) garde son rang seul.
    expect(gradeLabel({ rarity: 'rare', slot: 'weapon' })).toBe(rare);
    expect(jetStar(0)).toBe(1);
    expect(jetStar(0.2)).toBe(2);
    expect(jetStar(1)).toBe(5);
  });
  it('les étoiles d’un familier restent discriminantes — sinon les afficher n’apprendrait rien', () => {
    // ⚠️ MESURE, pas une affirmation : le jet d'un familier vient de `rollJetValue` (biaisé
    // bas), pas de `rollStarJet`. Si tout tombait en ★1, l'étoile ne dirait rien.
    const draw = (luck: number) => {
      const stars = [0, 0, 0, 0, 0];
      const rng = mulberry32(99 + Math.round(luck * 10));
      const N = 6000;
      for (let i = 0; i < N; i++) {
        const f = rollFamiliar(rng, FAMILIAR_SPECIES[i % FAMILIAR_SPECIES.length]!, {
          level: 30,
          luck,
          playerLevel: 30,
        });
        stars[jetStar(f.roll) - 1]!++;
      }
      return stars.map((s) => s / N);
    };
    const s0 = draw(0);
    // Sans chance : le bas domine (★1 ~48 %) mais ★5 reste atteignable (~10 %).
    expect(s0[0]!).toBeGreaterThan(0.35);
    expect(s0[4]!).toBeGreaterThan(0.05);
    // La chance déplace la masse vers le haut — c'est ce qui donne du sens au farm.
    expect(draw(1)[4]!).toBeGreaterThan(s0[4]! + 0.08);
  });
  it('tout ce qui se porte se lit en rang, objets compris (v0.874)', () => {
    for (const r of RANK_ORDER) {
      expect(gradeLabel({ rarity: r }), r).toBe(rarityRank(r).name);
      expect(gradeLabel({ rarity: r }), r).not.toBe(RARITY_LABEL[r]);
    }
  });
  it('les noms d’objets ne nomment plus la rareté, anciens objets renommés', () => {
    const cfg = (name: string, rarity: Rarity) => renameLegacyItem({ name, rarity });
    expect(cfg('Cuirasse mythique', 'mythique').name).toBe('Cuirasse des dieux');
    expect(cfg('Lame héroïque', 'epique').name).toBe('Lame légendaire');
    expect(cfg('Anneau légendaire', 'legendaire').name).toBe('Anneau des demi-dieux');
    // Idempotent : un nom déjà renommé ne bouge plus, même quand le nouveau complément
    // (« légendaire » pour Épique) est l'ancien adjectif d'une AUTRE rareté.
    const once = cfg('Lame héroïque', 'epique');
    expect(renameLegacyItem(once)).toBe(once);
    // Noms sans adjectif (signature, pièce de set) : intacts, même objet rendu.
    const sig = { name: 'Guillotine', rarity: 'legendaire' as Rarity };
    expect(renameLegacyItem(sig)).toBe(sig);
    // Un nouveau drop ne nomme plus sa rareté.
    const rng = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const d = rollDrop(rng, { cleared: true, defeated: 1, level: 60, luck: 1, playerLevel: 60 });
      if (!d) continue;
      expect(renameLegacyItem(d)).toBe(d);
    }
  });
  it('le Chenil annonce son plafond dans la même langue que les familiers', async () => {
    const { companionRankLabel } = await import('@/lib/raid');
    expect(companionRankLabel(1)).toBe(rarityRank('commun').name);
    expect(companionRankLabel(71)).toBe(rarityRank('primordial').name);
    // Le Magique (Or) et non « Magique » : même langue que les familiers qu'il héberge.
    // (Chenil 21 = début du rang Or, le rang du joueur depuis la v0.857.)
    expect(companionRankLabel(21)).toBe(rarityRank('magique').name);
  });
});

describe('bases partagées avec l’équipement des aventuriers', () => {
  it('effectBase rend la base qu’un drop utilise', () => {
    expect(effectBase('damage_pct')).toBeGreaterThan(0);
    expect(effectBase('gold_pct')).toBe(14);
  });
});

describe('📚 exemplaires identiques rangés ensemble, du meilleur au pire (v0.862)', () => {
  type T = { id: string; k: string; v: number };
  const cmp = (a: T, b: T) => b.v - a.v;
  const items: T[] = [
    { id: 'a1', k: 'a', v: 3 },
    { id: 'b1', k: 'b', v: 9 },
    { id: 'a2', k: 'a', v: 7 },
    { id: 'c1', k: 'c', v: 1 },
    { id: 'b2', k: 'b', v: 2 },
    { id: 'a3', k: 'a', v: 5 },
  ];
  const out = groupBestFirst(items, (t) => t.k, cmp);

  it('les identiques sont CONTIGUS, chacun du meilleur au pire', () => {
    expect(out.map((g) => g.item.id)).toEqual(['b1', 'b2', 'a2', 'a3', 'a1', 'c1']);
  });

  it('les groupes sont ordonnés par leur MEILLEUR exemplaire, pas par leur taille', () => {
    // « a » a trois exemplaires, « b » deux : c’est le 9 de « b » qui passe devant le 7 de « a ».
    const heads = out.filter((g) => g.groupStart).map((g) => g.item.k);
    expect(heads).toEqual(['b', 'a', 'c']);
  });

  it('marque le début de chaque groupe et sa taille', () => {
    expect(out.map((g) => g.groupStart)).toEqual([true, false, true, false, false, true]);
    expect(out.map((g) => g.groupSize)).toEqual([2, 2, 3, 3, 3, 1]);
  });

  it('ne perd ni ne duplique rien', () => {
    expect(out.map((g) => g.item.id).sort()).toEqual(items.map((t) => t.id).sort());
    expect(groupBestFirst([], (t: T) => t.k, cmp)).toEqual([]);
  });

  it('stable à égalité parfaite : l’ordre d’entrée est gardé', () => {
    const eq: T[] = [
      { id: 'x', k: 'a', v: 1 },
      { id: 'y', k: 'a', v: 1 },
    ];
    expect(groupBestFirst(eq, (t) => t.k, cmp).map((g) => g.item.id)).toEqual(['x', 'y']);
  });
});

describe('🗂️ types repliés dans les listes de talents et de familiers', () => {
  const row = (groupKey: string, groupStart: boolean, groupSize: number) => ({
    groupKey,
    groupStart,
    groupSize,
  });

  it('la clé du groupe voyage avec chaque ligne', () => {
    // Sans elle, l'écran devrait recalculer « quel type ? » de son côté — deux définitions
    // pour la même liste.
    const g = groupBestFirst(
      [
        { k: 'loup', v: 2 },
        { k: 'ours', v: 1 },
        { k: 'loup', v: 9 },
      ],
      (x) => x.k,
      (a, b) => b.v - a.v,
    );
    expect(g.map((x) => x.groupKey)).toEqual(['loup', 'loup', 'ours']);
    expect(g.map((x) => x.item.v)).toEqual([9, 2, 1]);
    expect(g.map((x) => x.groupStart)).toEqual([true, false, true]);
  });

  it('replié : un type par ligne — le MEILLEUR reste, les autres se cachent', () => {
    const vide = new Set<string>();
    expect(groupRowVisible(row('loup', true, 3), vide)).toBe(true);
    expect(groupRowVisible(row('loup', false, 3), vide)).toBe(false);
  });

  it('déplié : tout le groupe apparaît', () => {
    expect(groupRowVisible(row('loup', false, 3), new Set(['loup']))).toBe(true);
    // Un AUTRE type déplié ne déplie pas celui-ci.
    expect(groupRowVisible(row('loup', false, 3), new Set(['ours']))).toBe(false);
  });

  it('⚠️ ON NE CACHE JAMAIS CE QU’ON PORTE, même replié et même pas le meilleur', () => {
    // L'exemplaire équipé n'est pas toujours en tête du groupe : le replier ferait
    // disparaître la seule ligne qui compte vraiment.
    expect(groupRowVisible(row('loup', false, 3), new Set(), true)).toBe(true);
  });

  it('un type à UN seul exemplaire n’a rien à replier', () => {
    expect(groupRowVisible(row('ours', true, 1), new Set())).toBe(true);
    expect(groupRowVisible(row('ours', false, 1), new Set())).toBe(true);
  });
});
