// talents.ts — TALENTS (refonte B, 2026‑08‑16). Modèle ARPG : les talents DROPPENT
// (plus de choix 1-parmi-3), ont une RARETÉ, montent en niveau/rareté par INFUSION de
// doublons (XP), et on n'en ÉQUIPE qu'un nombre limité (swap libre). Bonus appliqués
// via AggregatedEffects (comme le gear/les familiers). Pur/testable.
import {
  emptyEffects,
  enchantMult,
  RANK_ORDER,
  rankRollMult,
  rollJet,
  rollTier,
  type AggregatedEffects,
  type Rarity,
} from './items';

// Définition catalogue : un talent = une clé d'effet + une magnitude de BASE (niv.1),
// qui grandit avec le niveau (talentLevelMult). Élargi de 5 → 11 (un par effet).
export interface TalentDef {
  code: string;
  name: string;
  desc: string;
  icon: string;
  effectKey: keyof AggregatedEffects;
  base: number; // magnitude au niveau 1
}

export const TALENTS: TalentDef[] = [
  {
    code: 't_dmg',
    name: 'Force brute',
    desc: 'dégâts',
    icon: '🗡️',
    effectKey: 'damagePct',
    base: 0.08,
  },
  {
    code: 't_pv',
    name: 'Robustesse',
    desc: 'PV max',
    icon: '❤️',
    effectKey: 'maxPvPct',
    base: 0.08,
  },
  {
    code: 't_crit',
    name: 'Précision',
    desc: 'critique',
    icon: '🎯',
    effectKey: 'critAdd',
    base: 0.04,
  },
  {
    code: 't_dodge',
    name: 'Vivacité',
    desc: 'esquive',
    icon: '💨',
    effectKey: 'dodgeAdd',
    base: 0.035,
  },
  {
    code: 't_leech',
    name: 'Sangsue',
    desc: 'vol de vie',
    icon: '🩸',
    effectKey: 'lifesteal',
    base: 0.04,
  },
  {
    code: 't_armor',
    name: 'Cuirasse',
    desc: 'réduction de dégâts',
    icon: '🛡️',
    effectKey: 'dmgReduction',
    base: 0.045,
  },
  {
    code: 't_gold',
    name: 'Cupidité',
    desc: 'or gagné',
    icon: '🪙',
    effectKey: 'goldPct',
    base: 0.1,
  },
  {
    code: 't_thorns',
    name: 'Épines',
    desc: 'dégâts renvoyés',
    icon: '🌵',
    effectKey: 'thornsPct',
    base: 0.06,
  },
  {
    code: 't_execute',
    name: 'Bourreau',
    desc: 'achève les ennemis affaiblis',
    icon: '⚔️',
    effectKey: 'executePct',
    base: 0.1,
  },
  {
    code: 't_rage',
    name: 'Berserk',
    desc: 'plus fort à basse vie',
    icon: '🔥',
    effectKey: 'ragePct',
    base: 0.1,
  },
  {
    code: 't_momentum',
    name: 'Élan',
    desc: 'dégâts cumulés au combat',
    icon: '🌀',
    effectKey: 'momentumPct',
    base: 0.05,
  },
];

const BY_CODE = new Map(TALENTS.map((t) => [t.code, t]));
export function talentByCode(code: string): TalentDef | undefined {
  return BY_CODE.get(code);
}

// Un talent POSSÉDÉ — UNIFORME avec les objets/familiers : son GRADE (rang G→SSS +
// qualité 1→5, encodé par `xp` = tier) est FIXÉ au drop (gaté par la profondeur), et
// sa magnitude se monte en l'ENCHANTANT (`enchant` +N, gamble aux parchemins 📜 /
// protections 🛡️). Plus d'axe niveau (parchemins→magnitude) ni d'infusion de tier.
export interface TalentInstance {
  id: string;
  code: string;
  xp: number; // encode le RANG (via le tier ; la part qualité est vestigiale) — fixé au drop
  roll?: number; // JET (0..1) : position de la stat dans l'intervalle du rang (refonte v0.574)
  enchant?: number; // +N magnitude (gamble), défaut 0
  equipped?: boolean;
}

// ── GRADE : `xp` (fixé au drop) → tier 0..49 = rang×5 + (qualité−1). Mêmes 50 tiers
// que les objets/familiers. Le tier ne bouge plus après le drop. ──
const MAX_TIER = 49;
/** XP pour passer du tier `tier` au suivant — sert à ENCODER le tier de drop. */
export function talentXpForNextTier(tier: number): number {
  return 12 + Math.max(0, tier) * 4;
}
/** XP cumulée pour ATTEINDRE un tier (tier 0 = 0) — encode le tier au drop. */
export function talentTierFloor(tier: number): number {
  let sum = 0;
  for (let t = 0; t < Math.max(0, tier); t++) sum += talentXpForNextTier(t);
  return sum;
}
/** Tier 0..49 d'après l'XP encodée. */
export function talentTier(xp: number): number {
  let tier = 0;
  let remaining = Math.max(0, xp);
  while (tier < MAX_TIER && remaining >= talentXpForNextTier(tier)) {
    remaining -= talentXpForNextTier(tier);
    tier++;
  }
  return tier;
}
/** Rang (G→SSS) d'un tier — mêmes rangs que les objets. */
export function talentRank(tier: number): Rarity {
  return RANK_ORDER[Math.min(9, Math.floor(Math.max(0, tier) / 5))]!;
}
/** Qualité (1→5) d'un tier. */
export function talentQuality(tier: number): number {
  return (Math.max(0, Math.min(MAX_TIER, tier)) % 5) + 1;
}
export function tierOf(inst: TalentInstance): number {
  return talentTier(inst.xp);
}
export function talentRankOf(inst: TalentInstance): Rarity {
  return talentRank(tierOf(inst));
}
export function talentQualityOf(inst: TalentInstance): number {
  return talentQuality(tierOf(inst));
}
// JET du talent (0..1) : `roll` s'il existe, sinon dérivé de l'ancienne qualité (rétro-compat).
export function talentRollOf(inst: TalentInstance): number {
  return inst.roll ?? (talentQuality(tierOf(inst)) - 0.5) / 5;
}
/** Jet affiché (0..100 %) du talent. */
export function talentJetOf(inst: TalentInstance): number {
  return rollJet(talentRollOf(inst));
}
export function enchantOf(inst: TalentInstance): number {
  return Math.max(0, inst.enchant ?? 0);
}

// ── Magnitude UNIFORME avec les objets (2026‑08‑20, ticket f7e389e4) : le GRADE suit la
// MÊME courbe géométrique que les objets — `RARITY_MULT[rang] × starQualityMult(qualité)`
// (spread ×4,4 de G à SSS) → un rang supérieur est NETTEMENT meilleur (fini l'ancienne
// courbe de tier plate `1+tier×0,02` où D5 ≈ E3 au centième près). Les `base` du catalogue
// sont divisées par 2 pour PRÉSERVER le plafond combat : (base/2)×RARITY_MULT[SSS]×q5×
// enchantMult(12) ≈ base_avant × 9,8 (= l'ancien max). Conséquence assumée : les bas grades
// sont plus faibles (comme un objet G), ce qui donne du sens à la chasse au grade. ──
// Facteur qui divise les `base` du catalogue (gardées lisibles) pour préserver le plafond.
const GRADE_BASE_SCALE = 0.5;
// Magnitude = base × intervalle du RANG selon le JET (rankRollMult) × enchant — UNIFORME
// avec les objets/familiers (refonte v0.574 : plus de qualité ★, le jet balaie l'intervalle).
export function talentValue(def: TalentDef, tier: number, enchant: number, roll = 0): number {
  return def.base * GRADE_BASE_SCALE * rankRollMult(talentRank(tier), roll) * enchantMult(enchant);
}

/** Nombre d'emplacements de talents ÉQUIPÉS (1 tous les 5 niveaux JOUEUR). */
export function talentsEarned(playerLevel: number): number {
  return Math.floor(playerLevel / 5);
}

// (Infusion de grade retirée, ticket 0ec48637 : talents = drops purs, vendus en or.)

// ── Normalisation (rétro-compat) : ancien `string[]` de codes → instances équipées
// (tier 0, +0). Les anciennes instances gardent leur xp (tier) ; leur `level`
// (ancien axe parchemins) est CONVERTI en enchant équivalent (magnitude préservée). ──
function talentLevelToEnchant(level: number): number {
  // Ancien mult de niveau valait 1 + (level−1)×0,03 ; enchant vaut 1 + N×0,33.
  return Math.max(0, Math.min(12, Math.round(((Math.max(1, level) - 1) * 0.03) / 0.33)));
}
export function normalizeTalents(raw: unknown): TalentInstance[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t, i) => {
      if (typeof t === 'string')
        return { id: `legacy_${i}_${t}`, code: t, xp: 0, enchant: 0, equipped: true };
      const o = t as Partial<TalentInstance> & { level?: number };
      const xp = o.xp ?? 0;
      return {
        id: o.id ?? `t_${i}`,
        code: o.code ?? '',
        xp,
        // JET : `roll` s'il existe ; sinon dérivé de l'ancienne qualité (rétro-compat).
        roll: o.roll ?? (talentQuality(talentTier(xp)) - 0.5) / 5,
        enchant: o.enchant ?? (o.level !== undefined ? talentLevelToEnchant(o.level) : 0),
        equipped: o.equipped,
      };
    })
    .filter((t) => BY_CODE.has(t.code));
}

/** Cumule les effets des talents ÉQUIPÉS (grade + enchant). */
export function talentEffects(raw: unknown): AggregatedEffects {
  const a = emptyEffects();
  for (const inst of normalizeTalents(raw)) {
    if (inst.equipped === false) continue; // seuls les équipés comptent
    const def = BY_CODE.get(inst.code);
    if (!def) continue;
    a[def.effectKey] += talentValue(def, tierOf(inst), enchantOf(inst), talentRollOf(inst));
  }
  return a;
}

// ── Drop : le RANG+QUALITÉ (grade) est GATÉ par la profondeur du contenu (comme les
// objets/familiers via `rollTier`) — un talent d'un donjon/boss profond tombe à un
// grade plus haut, biaisé par la `luck`. La magnitude démarre à +0 et monte en
// l'ENCHANTANT. Non équipé par défaut. ──
export function rollTalentDrop(
  rng: () => number,
  opts: {
    level?: number;
    luck?: number;
    floorBonus?: number;
    idSeed?: number;
    playerLevel?: number; // cap anti-runaway : rang plafonné à playerLevel + marge
  } = {},
): TalentInstance {
  // Tirage UNIFORME (toutes les voies équitablement — la voie n'oriente pas les drops).
  const def = TALENTS[Math.floor(rng() * TALENTS.length)]!;
  // RANG = pyramide centrée sur min(niveau contenu, niveau joueur) → `playerLevel` cale le
  // centre et plafonne le rang (anti-runaway) ; le JET (roll) balaie l'intervalle du rang.
  const { rank, roll } = rollTier(
    rng,
    opts.level ?? 1,
    opts.luck ?? 0,
    opts.floorBonus ?? 0,
    opts.playerLevel,
  );
  return {
    id: `tal_${opts.idSeed ?? Math.floor(rng() * 1e9)}`,
    code: def.code,
    xp: talentTierFloor(RANK_ORDER.indexOf(rank) * 5), // encode le RANG (part qualité vestigiale)
    roll, // JET fixé au drop
    enchant: 0,
  };
}
