// talents.ts — TALENTS (refonte B, 2026‑08‑16). Modèle ARPG : les talents DROPPENT
// (plus de choix 1-parmi-3), ont une RARETÉ, montent en niveau/rareté par INFUSION de
// doublons (XP), et on n'en ÉQUIPE qu'un nombre limité (swap libre). Bonus appliqués
// via AggregatedEffects (comme le gear/les familiers). Pur/testable.
import { emptyEffects, type AggregatedEffects, type Rarity } from './items';

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
  { code: 't_dmg', name: 'Force brute', desc: 'dégâts', icon: '🗡️', effectKey: 'damagePct', base: 0.08 },
  { code: 't_pv', name: 'Robustesse', desc: 'PV max', icon: '❤️', effectKey: 'maxPvPct', base: 0.08 },
  { code: 't_crit', name: 'Précision', desc: 'critique', icon: '🎯', effectKey: 'critAdd', base: 0.04 },
  { code: 't_dodge', name: 'Vivacité', desc: 'esquive', icon: '💨', effectKey: 'dodgeAdd', base: 0.035 },
  { code: 't_leech', name: 'Sangsue', desc: 'vol de vie', icon: '🩸', effectKey: 'lifesteal', base: 0.04 },
  { code: 't_armor', name: 'Cuirasse', desc: 'réduction de dégâts', icon: '🛡️', effectKey: 'dmgReduction', base: 0.045 },
  { code: 't_gold', name: 'Cupidité', desc: 'or gagné', icon: '🪙', effectKey: 'goldPct', base: 0.1 },
  { code: 't_thorns', name: 'Épines', desc: 'dégâts renvoyés', icon: '🌵', effectKey: 'thornsPct', base: 0.06 },
  { code: 't_execute', name: 'Bourreau', desc: 'achève les ennemis affaiblis', icon: '⚔️', effectKey: 'executePct', base: 0.1 },
  { code: 't_rage', name: 'Berserk', desc: 'plus fort à basse vie', icon: '🔥', effectKey: 'ragePct', base: 0.1 },
  { code: 't_momentum', name: 'Élan', desc: 'dégâts cumulés au combat', icon: '🌀', effectKey: 'momentumPct', base: 0.05 },
];

const BY_CODE = new Map(TALENTS.map((t) => [t.code, t]));
export function talentByCode(code: string): TalentDef | undefined {
  return BY_CODE.get(code);
}

// Un talent POSSÉDÉ : instance avec sa barre d'XP (infusion de doublons) et son état
// équipé. Le niveau et la rareté se dérivent de l'XP.
export interface TalentInstance {
  id: string;
  code: string;
  xp: number;
  equipped?: boolean;
}

// ── Courbe XP → niveau → rareté ──
// Coût pour passer du niveau `level` au suivant (croissant).
export function talentXpForNext(level: number): number {
  return 20 + Math.max(1, level) * 10;
}
/** XP cumulée nécessaire pour ATTEINDRE un niveau (niveau 1 = 0). */
export function talentXpFloor(level: number): number {
  let sum = 0;
  for (let L = 1; L < Math.max(1, level); L++) sum += talentXpForNext(L);
  return sum;
}
/** Niveau d'un talent d'après son XP cumulée. */
export function talentLevel(xp: number): number {
  let level = 1;
  let remaining = Math.max(0, xp);
  while (remaining >= talentXpForNext(level)) {
    remaining -= talentXpForNext(level);
    level++;
  }
  return level;
}
/** Progression 0..1 vers le niveau suivant (pour la barre d'XP). */
export function talentXpProgress(xp: number): number {
  const level = talentLevel(xp);
  const into = Math.max(0, xp) - talentXpFloor(level);
  return Math.min(1, into / talentXpForNext(level));
}

// Rareté = palier de niveau (tous les 5 niveaux). 1-4 commun … 20+ divin.
const RARITY_TIERS: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'divin'];
export function talentRarity(level: number): Rarity {
  return RARITY_TIERS[Math.min(RARITY_TIERS.length - 1, Math.floor((Math.max(1, level) - 1) / 5))]!;
}
/** Niveau de départ d'un talent qui droppe à une rareté donnée. */
export function startLevelForRarity(r: Rarity): number {
  return RARITY_TIERS.indexOf(r) * 5 + 1; // common→1, rare→6, epic→11, legendary→16, divin→21
}

// Effet d'un talent = base × multiplicateur de niveau (+8 %/niveau, comme le gear).
export function talentLevelMult(level: number): number {
  return 1 + (Math.max(1, level) - 1) * 0.08;
}
export function talentValue(def: TalentDef, level: number): number {
  return def.base * talentLevelMult(level);
}

/** Nombre d'emplacements de talents ÉQUIPÉS (1 tous les 5 niveaux). */
export function talentsEarned(level: number): number {
  return Math.floor(level / 5);
}

// ── Normalisation (rétro-compat) : les anciens talents étaient un `string[]` de codes
// (tous actifs, niveau 1). On les convertit en instances équipées niveau 1. ──
export function normalizeTalents(raw: unknown): TalentInstance[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t, i) => {
    if (typeof t === 'string') return { id: `legacy_${i}_${t}`, code: t, xp: 0, equipped: true };
    const o = t as Partial<TalentInstance>;
    return { id: o.id ?? `t_${i}`, code: o.code ?? '', xp: o.xp ?? 0, equipped: o.equipped };
  }).filter((t) => BY_CODE.has(t.code));
}

/** Niveau EFFECTIF d'un talent : plafonné au niveau du joueur (comme le gear —
 *  « seul le sport rend plus fort » : un talent ne dépasse jamais ton niveau). */
export function effectiveTalentLevel(xp: number, playerLevel = Infinity): number {
  return Math.min(talentLevel(xp), Math.max(1, playerLevel));
}

/** Cumule les effets des talents ÉQUIPÉS (accepte l'ancien format `string[]` ou les
 *  instances ; `normalizeTalents` gère les deux). Le niveau est PLAFONNÉ au niveau du
 *  joueur (`playerLevel`) → pas de power creep au-delà du sport. */
export function talentEffects(raw: unknown, playerLevel = Infinity): AggregatedEffects {
  const a = emptyEffects();
  for (const inst of normalizeTalents(raw)) {
    if (inst.equipped === false) continue; // seuls les équipés comptent
    const def = BY_CODE.get(inst.code);
    if (!def) continue;
    a[def.effectKey] += talentValue(def, effectiveTalentLevel(inst.xp, playerLevel));
  }
  return a;
}

// ── Drop : un talent tombe TOUJOURS au niveau 1 (commun). La rareté n'est PAS tirée
// au drop — elle se GAGNE en infusant des doublons (le niveau monte → la rareté monte).
// Code aléatoire dans le catalogue. Non équipé par défaut. ──
export function rollTalentDrop(
  rng: () => number,
  opts: { luck?: number; idSeed?: number } = {},
): TalentInstance {
  const def = TALENTS[Math.floor(rng() * TALENTS.length)]!;
  return { id: `tal_${opts.idSeed ?? Math.floor(rng() * 1e9)}`, code: def.code, xp: 0 };
}

/** XP rendue en infusant (consommant) un talent dans un autre (∝ son investissement). */
export function talentInfuseXp(consumed: TalentInstance): number {
  return 20 + talentXpFloor(talentLevel(consumed.xp)) + Math.round(consumed.xp * 0.25);
}
