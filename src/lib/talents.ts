// talents.ts — TALENTS (refonte B, 2026‑08‑16). Modèle ARPG : les talents DROPPENT
// (plus de choix 1-parmi-3), ont une RARETÉ, montent en niveau/rareté par INFUSION de
// doublons (XP), et on n'en ÉQUIPE qu'un nombre limité (swap libre). Bonus appliqués
// via AggregatedEffects (comme le gear/les familiers). Pur/testable.
import { emptyEffects, RANK_ORDER, type AggregatedEffects, type Rarity } from './items';

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

// Un talent POSSÉDÉ : DEUX axes indépendants (comme les familiers/objets) —
//  - `xp` (INFUSION de talents sacrifiés) → le TIER (rang G→SSS + qualité 1→5) ;
//  - `level` (PARCHEMINS 📜 de la Bibliothèque) → la magnitude (≤ niveau joueur).
export interface TalentInstance {
  id: string;
  code: string;
  xp: number; // infusion → tier (rang + qualité)
  level?: number; // parchemins → niveau (magnitude), défaut 1
  equipped?: boolean;
}

// ── Axe TIER (infusion) : xp cumulée → tier 0..49 = rang×5 + (qualité−1). Mêmes 50
// tiers que les objets/familiers. Un talent DROPPE au tier 0 (G1) et grimpe en
// SACRIFIANT d'autres talents (XP ∝ leur tier). ──
const MAX_TIER = 49;
/** XP pour passer du tier `tier` au suivant (croissant). */
export function talentXpForNextTier(tier: number): number {
  return 12 + Math.max(0, tier) * 4;
}
/** XP cumulée pour ATTEINDRE un tier (tier 0 = 0). */
export function talentTierFloor(tier: number): number {
  let sum = 0;
  for (let t = 0; t < Math.max(0, tier); t++) sum += talentXpForNextTier(t);
  return sum;
}
/** Tier 0..49 d'après l'XP d'infusion. */
export function talentTier(xp: number): number {
  let tier = 0;
  let remaining = Math.max(0, xp);
  while (tier < MAX_TIER && remaining >= talentXpForNextTier(tier)) {
    remaining -= talentXpForNextTier(tier);
    tier++;
  }
  return tier;
}
/** Progression 0..1 vers le prochain tier (barre d'infusion). */
export function talentTierProgress(xp: number): number {
  const tier = talentTier(xp);
  if (tier >= MAX_TIER) return 1;
  const into = Math.max(0, xp) - talentTierFloor(tier);
  return Math.min(1, into / talentXpForNextTier(tier));
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

// ── Axe NIVEAU (parchemins) : magnitude, plafonné au niveau JOUEUR (seul le sport
// rend plus fort). ──
/** Coût en PARCHEMINS 📜 pour passer du niveau `level` au suivant (croissant). */
export function talentLevelUpCost(level: number): number {
  return 3 + Math.max(1, level) * 2;
}
export function talentLevelOf(inst: TalentInstance): number {
  return Math.max(1, inst.level ?? 1);
}

// ── Magnitude : base × mult de TIER × mult de NIVEAU. Calibré pour que le MAX
// (SSS5, niveau = joueur) ≈ l'ancien plafond (~×4,9) → équilibrage combat préservé. ──
export function talentTierMult(tier: number): number {
  return 1 + Math.max(0, tier) * 0.02; // tier0 1,0 … tier49 ~1,98
}
export function talentLevelMult(level: number): number {
  return 1 + (Math.max(1, level) - 1) * 0.03; // niv.1 1,0 … niv.50 ~2,47
}
export function talentValue(def: TalentDef, tier: number, level: number): number {
  return def.base * talentTierMult(tier) * talentLevelMult(level);
}

/** Nombre d'emplacements de talents ÉQUIPÉS (1 tous les 5 niveaux JOUEUR). */
export function talentsEarned(playerLevel: number): number {
  return Math.floor(playerLevel / 5);
}

// ── Normalisation (rétro-compat) : ancien `string[]` de codes → instances équipées
// (tier 0, niveau 1). Les anciennes instances gardent leur xp (réinterprété en
// tier-xp) + niveau par défaut 1. ──
export function normalizeTalents(raw: unknown): TalentInstance[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t, i) => {
      if (typeof t === 'string')
        return { id: `legacy_${i}_${t}`, code: t, xp: 0, level: 1, equipped: true };
      const o = t as Partial<TalentInstance>;
      return {
        id: o.id ?? `t_${i}`,
        code: o.code ?? '',
        xp: o.xp ?? 0,
        level: o.level ?? 1,
        equipped: o.equipped,
      };
    })
    .filter((t) => BY_CODE.has(t.code));
}

/** Niveau EFFECTIF d'un talent : plafonné au niveau du joueur. */
export function effectiveTalentLevel(inst: TalentInstance, playerLevel = Infinity): number {
  return Math.min(talentLevelOf(inst), Math.max(1, playerLevel));
}

/** Cumule les effets des talents ÉQUIPÉS. Le niveau est PLAFONNÉ au niveau joueur. */
export function talentEffects(raw: unknown, playerLevel = Infinity): AggregatedEffects {
  const a = emptyEffects();
  for (const inst of normalizeTalents(raw)) {
    if (inst.equipped === false) continue; // seuls les équipés comptent
    const def = BY_CODE.get(inst.code);
    if (!def) continue;
    a[def.effectKey] += talentValue(def, tierOf(inst), effectiveTalentLevel(inst, playerLevel));
  }
  return a;
}

// ── Drop : un talent tombe au TIER 0 (G1), niveau 1. Le tier monte par INFUSION
// (sacrifice), le niveau par PARCHEMINS. Non équipé par défaut. ──
export function rollTalentDrop(
  rng: () => number,
  opts: { luck?: number; idSeed?: number } = {},
): TalentInstance {
  const def = TALENTS[Math.floor(rng() * TALENTS.length)]!;
  return { id: `tal_${opts.idSeed ?? Math.floor(rng() * 1e9)}`, code: def.code, xp: 0, level: 1 };
}

/** XP d'infusion qu'un talent SACRIFIÉ rend (∝ son tier) : G1 → 1 … SSS5 → 50. */
export function talentInfuseXp(consumed: TalentInstance): number {
  return 1 + tierOf(consumed);
}
