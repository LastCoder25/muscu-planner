// talents.ts — TALENTS (refonte B, 2026‑08‑16). Modèle ARPG : les talents DROPPENT
// (plus de choix 1-parmi-3), ont une RARETÉ, montent en niveau/rareté par INFUSION de
// doublons (XP), et on n'en ÉQUIPE qu'un nombre limité (swap libre). Bonus appliqués
// via AggregatedEffects (comme le gear/les familiers). Pur/testable.
import {
  emptyEffects,
  enchantMult,
  itemLevelMult,
  rollItemLevel,
  RANK_ORDER,
  rankRollMult,
  rollJet,
  rollCompanionTier,
  companionDropRank,
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
  enchant?: number; // +N magnitude (gamble), défaut 0 — vestige (plus utilisé)
  level?: number; // NIVEAU d'objet (ilvl) : magnitude scalée comme les objets (v0.592), défaut 1
  equipped?: boolean;
}

// ── GRADE : `xp` (fixé au drop) → tier 0..49 = rang×5 + (qualité−1). Mêmes 50 tiers
// que les objets/familiers. Le tier ne bouge plus après le drop. ──
const MAX_TIER = RANK_ORDER.length * 5 - 1; // 8 raretés × 5 crans − 1
/** XP pour passer du tier `tier` au suivant — sert à ENCODER le tier de drop. */
function talentXpForNextTier(tier: number): number {
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
  return RANK_ORDER[Math.min(RANK_ORDER.length - 1, Math.floor(Math.max(0, tier) / 5))]!;
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
// JET du talent (0..1) : `roll` s'il existe, sinon dérivé de l'ancienne qualité (rétro-compat).
export function talentRollOf(inst: TalentInstance): number {
  return inst.roll ?? (talentQuality(tierOf(inst)) - 0.5) / 5;
}
/** Jet affiché (0..100 %) du talent. */
export function talentJetOf(inst: TalentInstance): number {
  return rollJet(talentRollOf(inst));
}
function enchantOf(inst: TalentInstance): number {
  return Math.max(0, inst.enchant ?? 0);
}

// ── Magnitude UNIFORME avec les objets (2026‑08‑20, ticket f7e389e4) : le GRADE suit la
// MÊME courbe géométrique que les objets — `RARITY_MULT[rang] × starQualityMult(qualité)`
// (spread ×4,4 de G à SSS) → un rang supérieur est NETTEMENT meilleur (fini l'ancienne
// courbe de tier plate `1+tier×0,02` où D5 ≈ E3 au centième près). Les bas grades sont
// plus faibles (comme un objet commun), ce qui donne du sens à la chasse au grade. ──
// Facteur appliqué aux `base` du catalogue (gardées lisibles).
// ⚠️ 0,5 → 0,9 (v0.848, mesuré ; demandé : « autant de poids au talent qu'au familier »).
// Depuis qu'on n'en équipe plus qu'UN (v0.845), le talent apportait moitié moins que le
// familier. Mesuré sur une progression réaliste (butin des 15 derniers niveaux, meilleure
// voie, familier dressé à 30 % du niveau), gain de puissance talent / familier à ×1 :
// +5,6/+11,6 % (niv 20) · +5,1/+8,2 (35) · +5,7/+7,3 (50) · +6,2/+13,1 (70) · +6,5/+11,7 (90).
// Les deux s'égalisent vers ×2,0 / ×1,7 / ×1,3 / ×2,0 / ×1,8 → ×1,8 retenu.
const GRADE_BASE_SCALE = 0.9;
// Magnitude = base × intervalle du RANG selon le JET (rankRollMult) × enchant — UNIFORME
// avec les objets/familiers (refonte v0.574 : plus de qualité ★, le jet balaie l'intervalle).
export function talentValue(
  def: TalentDef,
  tier: number,
  enchant: number,
  roll = 0,
  level = 1,
): number {
  return (
    def.base *
    GRADE_BASE_SCALE *
    rankRollMult(talentRank(tier), roll) *
    enchantMult(enchant) *
    itemLevelMult(level) // ilvl : farmé plus profond = plus fort (comme les objets)
  );
}

/** Niveau joueur à partir duquel le personnage peut équiper son talent. */
export const TALENT_SLOT_LEVEL = 5;
/** Nombre MAXIMAL de talents équipés, à tout niveau. */
const TALENT_MAX_SLOTS = 1;

/** Nombre d'emplacements de talents ÉQUIPÉS : **UN SEUL**, à partir du niveau 5.
 *  ⚠️ C'était 1 tous les 5 niveaux (20 au niveau 100). Mesuré le 2026-09-14 : les talents
 *  étaient le plus gros levier de puissance hors objets (−15 à −19 % si retirés) et
 *  n'étaient attendus par AUCUN calibrage de difficulté — ils faisaient tomber le mur
 *  anti-emballement. Décision de l'utilisateur, avant tout rééquilibrage. Toute la règle
 *  vit ici : store, équipement conseillé, écran et auto-équipement lisent cette fonction. */
export function talentsEarned(playerLevel: number): number {
  return playerLevel >= TALENT_SLOT_LEVEL ? TALENT_MAX_SLOTS : 0;
}

// (Infusion de grade retirée, ticket 0ec48637 : talents = drops purs, vendus en or.)

// ── Normalisation (rétro-compat) : ancien `string[]` de codes → instances équipées.
// Les anciennes instances gardent leur xp (tier) et leur roll (jet). ──
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
        enchant: o.enchant ?? 0, // vestige (l'infusion talents a été retirée)
        // NIVEAU d'objet (ilvl, v0.592) : réutilise le champ `level` (l'ancien axe parchemins,
        // retiré depuis longtemps, ne coexiste plus). Défaut 1 pour les talents pré-ilvl.
        level: o.level ?? 1,
        equipped: o.equipped,
      };
    })
    .filter((t) => BY_CODE.has(t.code));
}

/** Effets des talents ÉQUIPÉS du héros (grade + enchant), **plafonnés à `TALENT_MAX_SLOTS`**.
 *  ⚠️ LE PLAFOND VIT ICI, À LA LECTURE, et pas seulement dans un rognage d'écran : un compte
 *  d'avant la règle « un seul talent » garde plusieurs talents équipés tant que l'Aventure
 *  ne les a pas rognés, et le Labyrinthe, la carte d'expédition ou l'optimiseur calculaient
 *  sa puissance avec TOUS — le même héros aurait valu autre chose selon l'écran d'entrée.
 *  Départage déterministe : les premiers équipés (le rognage, lui, garde le plus puissant). */
export function talentEffects(raw: unknown): AggregatedEffects {
  return effectsOfTalents(
    normalizeTalents(raw)
      .filter((t) => t.equipped === true)
      .slice(0, TALENT_MAX_SLOTS),
  );
}

/**
 * Le même cumul, sur des instances DÉJÀ normalisées.
 *
 * ⚠️ Il existe parce que `advTalentEffects` re-normalisait un pool qui l’était déjà, une
 * fois PAR LIGNE de l’écran de la Guilde — ~74 passages de `normalizeTalents` par rendu
 * pour reproduire à l’identique ce que l’appelant tenait en main. La normalisation reste
 * obligatoire à la FRONTIÈRE (le JSONB peut porter l’ancien format `string[]`) ; elle n’a
 * simplement rien à faire une seconde fois à l’intérieur.
 */
export function effectsOfTalents(list: TalentInstance[]): AggregatedEffects {
  const a = emptyEffects();
  for (const inst of list) {
    // ⚠️ `=== true`, PAS `!== false` — c'était LE défaut, et il gonflait la puissance de
    // 85 % sur un compte réel (79 talents possédés, 74 comptés, 5 emplacements).
    // `rollTalentDrop` ne posait AUCUN champ `equipped`, donc chaque talent jamais tombé
    // comptait à vie, sans limite de place. Tous les autres lecteurs — les gardes de
    // `equipTalent`, le compteur d'emplacements, l'auto-correction — lisent déjà
    // `t.equipped` en truthy : ce lecteur-ci était le seul hors de pas, et c'est lui qui
    // calcule la puissance. Les talents LEGACY (ancien `string[]`) restent équipés :
    // `normalizeTalents` leur pose `equipped: true` explicitement.
    if (inst.equipped !== true) continue;
    const def = BY_CODE.get(inst.code);
    if (!def) continue;
    a[def.effectKey] += talentValue(
      def,
      tierOf(inst),
      enchantOf(inst),
      talentRollOf(inst),
      inst.level ?? 1,
    );
  }
  return a;
}

// ── Drop : le RANG est plafonné au RANG DU JOUEUR, borné par le contenu (v0.857, comme les
// familiers via `rollCompanionTier`) : son rang le plus souvent, jamais au-dessus (v0.876).
// Le JET garde la `luck`. Non équipé par défaut. ──
export function rollTalentDrop(
  rng: () => number,
  opts: {
    level?: number;
    luck?: number;
    idSeed?: number;
    playerLevel?: number; // rang plafonné au rang du joueur (échelle de prestige)
  } = {},
): TalentInstance {
  // Tirage UNIFORME (toutes les voies équitablement — la voie n'oriente pas les drops).
  const def = TALENTS[Math.floor(rng() * TALENTS.length)]!;
  const { rank, roll } = rollCompanionTier(
    rng,
    companionDropRank(opts.level ?? 1, opts.playerLevel),
    opts.luck ?? 0,
  );
  // NIVEAU d'objet (ilvl) comme les objets/familiers : pyramide centrée sur min(contenu, joueur).
  const center =
    opts.playerLevel != null ? Math.min(opts.level ?? 1, opts.playerLevel) : (opts.level ?? 1);
  return {
    id: `tal_${opts.idSeed ?? Math.floor(rng() * 1e9)}`,
    code: def.code,
    xp: talentTierFloor(RANK_ORDER.indexOf(rank) * 5), // encode le RANG (part qualité vestigiale)
    roll, // JET fixé au drop
    enchant: 0,
    level: rollItemLevel(rng, center, opts.luck ?? 0),
    // ⚠️ EXPLICITE : un talent qui tombe n'est pas équipé. L'omettre laissait le champ
    // `undefined`, que chaque lecteur interprétait à sa façon — la source du défaut.
    equipped: false,
  };
}

/** Choisit les talents à équiper (au plus `maxSlots`) : les plus PUISSANTS selon un score
 *  fourni par l'appelant (la puissance de combat du build), un par CODE (effets distincts).
 *  Glouton : à chaque tour, le talent qui donne le meilleur score.
 *  ⚠️ SOURCE UNIQUE des trois choix de talents — équipement conseillé 🪄 (store), bouton
 *  « talents conseillés » et rognage de l'excédent (page). Ils avaient deux algorithmes
 *  qui se contredisaient sur un talent sans poids en puissance (l'un vidait la case,
 *  l'autre la remplissait), ce qui les faisait se défaire l'un l'autre.
 *  ⚠️ ON REMPLIT les emplacements même sans gain : un talent d'or reste mieux qu'une case
 *  vide (et c'est ce qui garde le rognage sans perte : on ne retire que l'EXCÉDENT).
 *  Le départage par puissance remplace un tri par « magnitude » : +10 % d'or et +10 % de
 *  dégâts ne se comparent pas. Pur — le scoring est injecté. */
export function pickBestTalents(
  talents: TalentInstance[],
  maxSlots: number,
  score: (ids: string[]) => number,
): string[] {
  const pool = normalizeTalents(talents);
  const chosen: string[] = [];
  const usedCodes = new Set<string>();
  while (chosen.length < maxSlots) {
    let best: TalentInstance | null = null;
    let bestScore = -Infinity;
    for (const t of pool) {
      if (usedCodes.has(t.code) || chosen.includes(t.id)) continue;
      const p = score([...chosen, t.id]);
      if (p > bestScore) {
        bestScore = p;
        best = t;
      }
    }
    if (!best) break; // plus aucun talent (d'un code libre) à poser
    chosen.push(best.id);
    usedCodes.add(best.code);
  }
  return chosen;
}
