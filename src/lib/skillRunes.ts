/**
 * 🔮 RUNES DE COMPÉTENCE — ÉTAPE 1 : LA MÉCANIQUE (2026-09-27).
 *
 * Spec : `docs/superpowers/specs/2026-09-27-runes-competences.md`, décisions de l'utilisateur.
 *
 * ⚠️ **PAS ENCORE BRANCHÉ** : aucun champion ne porte ces compétences, aucune source ne donne
 * de rune. Même découpage que `siegeBattle.ts` et les failles : la lib d'abord, testée, puis
 * les sources, la calibration, la migration et les écrans.
 *
 * Le principe : un champion reçoit ses compétences par des RUNES que le joueur gagne et pose
 * où il veut. Une rune tire une compétence au hasard DANS SON CRAN ; chaque compétence
 * n'existe que dans un seul cran et se cumule sur elle-même jusqu'au niveau 5.
 *
 * ⚠️ Les VALEURS sont des points de départ : elles seront fixées par la mesure (routes, camps,
 * failles, sièges, puits d'or, débit de mana) avant d'être lues par le jeu.
 */

import { mulberry32 } from './combat';
import type { PoiType } from './expedition';
import {
  effectAsAggregate,
  emptyEffects,
  mergeEffects,
  type AggregatedEffects,
  type EffectType,
} from './items';

/** Les 4 crans, du plus bas au plus haut. ⚠️ Désignés par une COULEUR : « Bronze/Or » sont
 *  les rangs, « B/A/S » les lettres du gacha, « ticket » les 🎟️ d'invocation. */
export type RuneTier = 'green' | 'blue' | 'violet' | 'gold';
export const RUNE_TIERS: readonly RuneTier[] = ['green', 'blue', 'violet', 'gold'];

export const RUNE_INFO: Record<RuneTier, { emoji: string; label: string; minRank: number }> = {
  green: { emoji: '🟢', label: 'Rune verte', minRank: 0 },
  blue: { emoji: '🔵', label: 'Rune bleue', minRank: 0 },
  // ⚠️ Le garde-fou « rareté ≤ rang » du jeu (équipement, familiers) : un champion fraîchement
  // tiré ne devient pas un monstre en une rune. Indices de `CHARACTER_RANKS` (1 = Argent).
  violet: { emoji: '🟣', label: 'Rune violette', minRank: 1 },
  gold: { emoji: '🟠', label: 'Rune dorée', minRank: 2 },
};

export type SkillId =
  // 🟢 utilitaire
  | 'speed'
  | 'care'
  | 'haul'
  | 'scout'
  // 🔵 soutien
  | 'pv'
  | 'damage'
  | 'reduction'
  | 'mentor'
  // 🟣 combat
  | 'crit'
  | 'lifesteal'
  | 'thorns'
  | 'execute'
  | 'rage'
  | 'momentum'
  // 🟠 sommet
  | 'plunder'
  | 'riftSealer'
  | 'firstBlood'
  | 'secondWind';

export interface SkillDef {
  tier: RuneTier;
  emoji: string;
  name: string;
  /** Ce que fait la compétence, en clair — `{v}` est remplacé par sa valeur. */
  what: string;
  /** Valeur au niveau 1, en % (les niveaux suivants suivent `LEVEL_CURVE`). */
  base: number;
}

/** ⚠️ Un `Record` exhaustif : ajouter une compétence sans la décrire ne compile pas. */
export const SKILLS: Record<SkillId, SkillDef> = {
  speed: { tier: 'green', emoji: '🧭', name: 'Vitesse', what: 'trajet −{v} %', base: 5.5 },
  care: { tier: 'green', emoji: '🩺', name: 'Soin', what: 'convalescence −{v} %', base: 15 },
  haul: { tier: 'green', emoji: '🐫', name: 'Cargaison', what: 'cargaison +{v} %', base: 8 },
  scout: { tier: 'green', emoji: '👁️', name: 'Repérage', what: 'embuscades −{v} %', base: 8 },

  pv: { tier: 'blue', emoji: '❤️', name: 'PV', what: 'PV +{v} %', base: 8 },
  damage: { tier: 'blue', emoji: '⚔️', name: 'Dégâts', what: 'dégâts +{v} %', base: 8 },
  reduction: { tier: 'blue', emoji: '🛡️', name: 'Réduction', what: 'dégâts subis −{v} %', base: 4 },
  mentor: { tier: 'blue', emoji: '🎓', name: 'Mentor', what: 'XP de l’équipe +{v} %', base: 7.5 },

  crit: { tier: 'violet', emoji: '💥', name: 'Critique', what: 'critique +{v} %', base: 12 },
  lifesteal: {
    tier: 'violet',
    emoji: '🩸',
    name: 'Vol de vie',
    what: 'vol de vie +{v} %',
    base: 12,
  },
  thorns: { tier: 'violet', emoji: '🌵', name: 'Épines', what: 'épines +{v} %', base: 12 },
  execute: { tier: 'violet', emoji: '🪓', name: 'Exécution', what: 'exécution +{v} %', base: 12 },
  rage: { tier: 'violet', emoji: '🔥', name: 'Rage', what: 'rage +{v} %', base: 12 },
  momentum: { tier: 'violet', emoji: '🌀', name: 'Élan', what: 'élan +{v} %', base: 12 },

  plunder: {
    tier: 'gold',
    emoji: '🧲',
    name: 'Pillard',
    what: '{v} % de chances d’une seconde cargaison',
    base: 11,
  },
  riftSealer: {
    tier: 'gold',
    emoji: '🕳️',
    name: 'Scelleur de failles',
    what: 'mana +{v} % en refermant une faille',
    base: 15,
  },
  firstBlood: {
    tier: 'gold',
    emoji: '⚡',
    name: 'Premier sang',
    what: 'dégâts +{v} % au premier tour',
    base: 37,
  },
  secondWind: {
    tier: 'gold',
    emoji: '✨',
    name: 'Second souffle',
    what: 'le coup fatal perd {v} % de ses dégâts, une fois',
    base: 15,
  },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

/** Niveau maximum d'une compétence. */
export const SKILL_MAX_LEVEL = 5;

/** La teinte d'une couleur de rune — source unique des écrans (fiche, portraits). */
export const RUNE_COLOR: Record<RuneTier, string> = {
  green: '#7bc86c',
  blue: '#5aa9ff',
  violet: '#b98cff',
  gold: '#ffb23f',
};

/** ⚠️ RENDEMENT DÉCROISSANT : multiplicateur de la valeur de base à chaque niveau. Chaque
 *  niveau apporte moins que le précédent (+0,7, +0,5, +0,3, +0,2) — cumuler reste un
 *  progrès sans jamais valoir une compétence d'un cran plus haut empilée à l'infini. */
export const LEVEL_CURVE: readonly number[] = [1, 1.7, 2.2, 2.5, 2.7];

/** La valeur d'une compétence à un niveau donné, en %, arrondie au dixième. */
export function skillValue(id: SkillId, level: number): number {
  const l = Math.max(1, Math.min(SKILL_MAX_LEVEL, Math.floor(level)));
  return Math.round(SKILLS[id].base * LEVEL_CURVE[l - 1]! * 10) / 10;
}

export function skillsOfTier(tier: RuneTier): SkillId[] {
  return SKILL_IDS.filter((id) => SKILLS[id].tier === tier);
}

/** Emplacements de compétence selon la lettre du champion. */
export const SKILL_SLOTS: Record<'A' | 'S' | 'X', number> = { A: 2, S: 3, X: 4 };

/** Une compétence portée par un champion. */
export interface ChampSkill {
  id: SkillId;
  level: number;
}

/** Le rang du champion permet-il de poser cette rune ? */
export function canUseRune(tier: RuneTier, championRankIndex: number): boolean {
  return championRankIndex >= RUNE_INFO[tier].minRank;
}

/**
 * Le TIRAGE d'une rune sur un champion : une compétence du cran, au hasard.
 *
 * ⚠️ Une compétence déjà au niveau maximum n'est JAMAIS tirée (décision de l'utilisateur :
 * « relance ») — la rune ne se perd pas sur un plafond que le joueur ne choisit pas. Retirer
 * ces compétences du tirage revient exactement à relancer jusqu'à en obtenir une autre.
 * `null` : tout le cran est au maximum chez ce champion, la rune ne peut pas lui être posée.
 */
export function rollRuneSkill(
  rng: () => number,
  tier: RuneTier,
  skills: readonly ChampSkill[],
): SkillId | null {
  const maxed = new Set(skills.filter((s) => s.level >= SKILL_MAX_LEVEL).map((s) => s.id));
  const pool = skillsOfTier(tier).filter((id) => !maxed.has(id));
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
}

/** Ce que la compétence tirée fait au champion, avant toute décision du joueur. */
export type RuneOutcome =
  /** Il la portait déjà : +1 niveau, aucun emplacement pris. */
  | { kind: 'stack'; skills: ChampSkill[] }
  /** Nouvelle, et un emplacement est libre : elle s'installe au niveau 1. */
  | { kind: 'new'; skills: ChampSkill[] }
  /** Nouvelle, et tous les emplacements sont pris : le joueur doit choisir (`replaceSkill`). */
  | { kind: 'full'; drawn: SkillId };

export function applyRuneSkill(
  skills: readonly ChampSkill[],
  drawn: SkillId,
  slots: number,
): RuneOutcome {
  const i = skills.findIndex((s) => s.id === drawn);
  if (i >= 0) {
    const next = skills.map((s, k) =>
      k === i ? { ...s, level: Math.min(SKILL_MAX_LEVEL, s.level + 1) } : { ...s },
    );
    return { kind: 'stack', skills: next };
  }
  if (skills.length < slots)
    return { kind: 'new', skills: [...skills.map((s) => ({ ...s })), { id: drawn, level: 1 }] };
  return { kind: 'full', drawn };
}

/**
 * La DÉCISION du joueur quand tous les emplacements sont pris.
 *
 * `replaceIndex` : l'emplacement à remplacer — la nouvelle compétence y arrive AU NIVEAU 1,
 * l'ancienne et ses niveaux sont perdus. `null` : il garde ses compétences, et la rune est
 * PERDUE (décision de l'utilisateur : refuser, c'est de l'optimisation — la rendre serait trop
 * facile). Dans les deux cas la rune est consommée.
 */
export function replaceSkill(
  skills: readonly ChampSkill[],
  drawn: SkillId,
  replaceIndex: number | null,
): ChampSkill[] {
  const copy = skills.map((s) => ({ ...s }));
  if (replaceIndex === null || replaceIndex < 0 || replaceIndex >= copy.length) return copy;
  copy[replaceIndex] = { id: drawn, level: 1 };
  return copy;
}

// ── 🎁 D'OÙ VIENNENT LES RUNES (étape 2, révisée 2026-09-27) ────────────────────────────
//
// Décisions de l'utilisateur : une rune GARANTIE à chaque ascension et à chaque cran d'Éveil ;
// partout ailleurs, une CHANCE — mais UNIQUEMENT sur les LIEUX de la carte (camps, repaires,
// récoltes, failles, bandes). Ni sièges, ni donjons, ni boss, ni Labyrinthe, ni défis. L'arène
// n'en fait pas partie : elle se joue avec le héros seul, et les runes servent aux champions.
//
// ⚠️ Toujours NON BRANCHÉ : ces fonctions disent ce qu'une source DONNE. Le crédit au joueur
// arrivera avec les écrans, pour qu'aucune rune ne s'accumule sans usage possible.

/** Une distribution de couleurs : [vert, bleu, violet, doré], somme 1. */
type Odds = readonly [number, number, number, number];

function toOdds(row: Odds): Record<RuneTier, number> {
  return { green: row[0], blue: row[1], violet: row[2], gold: row[3] };
}

/** Tire une couleur dans une distribution. */
export function pickTier(rng: () => number, odds: Record<RuneTier, number>): RuneTier {
  let r = rng();
  for (const t of RUNE_TIERS) {
    r -= odds[t];
    if (r < 0) return t;
  }
  // Arrondi flottant : la plus haute couleur à probabilité non nulle.
  return [...RUNE_TIERS].reverse().find((t) => odds[t] > 0)!;
}

/**
 * 🎲 ASCENSION : les chances de couleur selon le rang ATTEINT (index de `CHARACTER_RANKS` :
 * 1 = Argent … 9 = Tout-puissant). Plus le rang est haut, plus la rune a de chances d'être
 * haute. Chaque ligne somme à 1 (testé).
 */
const ASCENSION_ODDS: readonly Odds[] = [
  [1, 0, 0, 0], // 0 — Bronze : on n'y « monte » pas, garde-fou
  [0.8, 0.2, 0, 0], // 1 — Argent
  [0.65, 0.3, 0.05, 0],
  [0.5, 0.35, 0.13, 0.02],
  [0.4, 0.35, 0.2, 0.05],
  [0.3, 0.35, 0.27, 0.08],
  [0.2, 0.33, 0.35, 0.12],
  [0.12, 0.3, 0.4, 0.18],
  [0.08, 0.25, 0.42, 0.25],
  [0.05, 0.2, 0.45, 0.3], // 9 — Tout-puissant
];

export function ascensionRuneOdds(rankIndex: number): Record<RuneTier, number> {
  return toOdds(ASCENSION_ODDS[Math.max(0, Math.min(ASCENSION_ODDS.length - 1, rankIndex))]!);
}

export function rollAscensionRune(rng: () => number, rankIndex: number): RuneTier {
  return pickTier(rng, ascensionRuneOdds(rankIndex));
}

/**
 * ✨ ÉVEIL : une rune par cran, couleur tirée selon la LETTRE du champion et le CRAN atteint
 * (décision de l'utilisateur, option B + C). L'Éveil est la part « gacha » du système : c'est
 * la rareté du personnage et l'acharnement à le compléter qui paient, pas son niveau — déjà
 * récompensé par l'ascension. Au cran 1 et au cran 6, deux distributions ; entre les deux, on
 * INTERPOLE (une interpolation de distributions somme toujours à 1).
 */
const AWAKEN_ODDS: Record<'A' | 'S' | 'X', { first: Odds; last: Odds }> = {
  A: { first: [0.75, 0.22, 0.03, 0], last: [0.45, 0.35, 0.17, 0.03] },
  S: { first: [0.5, 0.33, 0.14, 0.03], last: [0.2, 0.35, 0.32, 0.13] },
  X: { first: [0.3, 0.35, 0.26, 0.09], last: [0.1, 0.3, 0.38, 0.22] },
};
/** Cran d'Éveil maximum lu par l'interpolation (`AWAKEN.max` côté champions). */
const AWAKEN_LAST_STEP = 6;

export function awakenRuneOdds(grade: 'A' | 'S' | 'X', step: number): Record<RuneTier, number> {
  const { first, last } = AWAKEN_ODDS[grade];
  const t = (Math.max(1, Math.min(AWAKEN_LAST_STEP, step)) - 1) / (AWAKEN_LAST_STEP - 1);
  return toOdds(first.map((v, i) => v + (last[i]! - v) * t) as unknown as Odds);
}

export function rollAwakenRune(rng: () => number, grade: 'A' | 'S' | 'X', step: number): RuneTier {
  return pickTier(rng, awakenRuneOdds(grade, step));
}

/** Les lieux de la carte qui peuvent lâcher une rune. ⚠️ EXHAUSTIF par construction : un
 *  type de lieu ajouté sans dire s'il donne des runes ne compile pas. Exclus : l'arène (héros
 *  seul, les runes servent aux champions) et l'épave (legacy, plus jamais générée). */
export const RUNE_PLACE_OK: Record<PoiType, boolean> = {
  mine: true,
  camp: true,
  lair: true,
  arena: false,
  well: true,
  shrine: true,
  archive: true,
  wreck: false,
  rift: true,
  mana_mine: true,
  warband: true,
  ruins: true,
  fallen: true,
  den: true,
  plunder: true,
  vein: true,
  control: true,
};

/** Où se situe le lieu par rapport au joueur, en rangs de prestige. */
export type PlaceGap = 'below' | 'equal' | 'above';

function placeGap(placeRankIndex: number, playerRankIndex: number): PlaceGap {
  const d = placeRankIndex - playerRankIndex;
  return d < 0 ? 'below' : d === 0 ? 'equal' : 'above';
}

/**
 * Réglages des lieux. ⚠️ À MESURER (cible : ~0,7 rune par jour pour un joueur régulier, soit
 * un build complet vers la moitié de la partie).
 */
export const RUNE_PLACE = {
  /** Chance qu'un lieu RÉUSSI lâche une rune, selon sa difficulté. */
  chance: { below: 0.02, equal: 0.05, above: 0.12 } as Record<PlaceGap, number>,
  /** Une faille refermée vaut treize combats et un gardien : sa chance est multipliée. */
  riftChanceMult: 2,
  /** Maturité (0..1) à partir de laquelle une faille AU-DESSUS tire aux chances « mûre ». */
  riftMatureAt: 0.5,
} as const;

/** La couleur d'une rune tombée sur un lieu : de base 70 / 22 / 7 / 1 %, décalée vers le haut
 *  quand le lieu est dur. ⚠️ Plus la couleur est haute, plus elle est rare — partout. */
const PLACE_ODDS: Record<PlaceGap | 'aboveMature', Odds> = {
  below: [0.85, 0.13, 0.02, 0],
  equal: [0.7, 0.22, 0.07, 0.01],
  above: [0.45, 0.33, 0.18, 0.04],
  aboveMature: [0.25, 0.35, 0.28, 0.12],
};

export interface PlaceRuneInput {
  place: PoiType;
  placeRankIndex: number;
  playerRankIndex: number;
  /** Maturité de la faille (0..1). Ignorée pour les autres lieux. */
  maturity?: number;
}

export function placeRuneChance(p: PlaceRuneInput): number {
  if (!RUNE_PLACE_OK[p.place]) return 0;
  const base = RUNE_PLACE.chance[placeGap(p.placeRankIndex, p.playerRankIndex)];
  return Math.min(1, base * (p.place === 'rift' ? RUNE_PLACE.riftChanceMult : 1));
}

export function placeRuneOdds(p: PlaceRuneInput): Record<RuneTier, number> {
  const gap = placeGap(p.placeRankIndex, p.playerRankIndex);
  const mature =
    gap === 'above' && p.place === 'rift' && (p.maturity ?? 0) >= RUNE_PLACE.riftMatureAt;
  return toOdds(PLACE_ODDS[mature ? 'aboveMature' : gap]);
}

/** Un lieu RÉUSSI : `null` s'il ne lâche rien, sinon la couleur de la rune. ⚠️ Une mission
 *  ratée ne donne rien — c'est à l'appelant de ne pas appeler. */
export function rollPlaceRune(rng: () => number, p: PlaceRuneInput): RuneTier | null {
  if (rng() >= placeRuneChance(p)) return null;
  return pickTier(rng, placeRuneOdds(p));
}

// ── ⚔️ CE QU'UNE COMPÉTENCE FAIT EN COMBAT (étape 3) ─────────────────────────────────────

/** Les compétences qui se traduisent en effet de combat, et lequel. ⚠️ Ce sont les effets
 *  que `simulateCombat` sait déjà jouer (`EffectType`) : aucune mécanique nouvelle. Les rôles
 *  de convoi (🟢, 🎓) et les dorées (Pillard, Scelleur, Premier sang, Second souffle) ont
 *  leur propre câblage, hors de ce tableau. */
export const SKILL_COMBAT_EFFECT: Partial<Record<SkillId, EffectType>> = {
  pv: 'max_pv_pct',
  damage: 'damage_pct',
  reduction: 'dmg_reduction_pct',
  crit: 'crit_pct',
  lifesteal: 'lifesteal_pct',
  thorns: 'thorns_pct',
  execute: 'execute_pct',
  rage: 'rage_pct',
  momentum: 'momentum_pct',
};

/** Les effets de combat des compétences d'un champion (valeur au niveau porté). */
export function runeCombatEffects(skills: readonly ChampSkill[]): AggregatedEffects {
  const list = skills.flatMap((s) => {
    const t = SKILL_COMBAT_EFFECT[s.id];
    return t ? [effectAsAggregate(t, skillValue(s.id, s.level))] : [];
  });
  return list.length ? mergeEffects(...list) : emptyEffects();
}

// ── 📏 LE BUILD MOYEN DES CHAMPIONS DE RÉFÉRENCE (étape 3) ───────────────────────────────
//
// Toute la calibration des combats (routes, camps, failles) se dimensionne sur des champions
// de RÉFÉRENCE. Ils portent désormais le build de runes qu'un joueur régulier aurait à leur
// rang, au rythme MESURÉ (§ 5 de la spec) : ~1 rune d'ascension par rang, plus
// `REF_BUILD.extBase + REF_BUILD.extPerRank × rang` runes de lieux.

const REF_BUILD = {
  /** Runes de LIEUX par champion et par rang (mesuré : ~0,8 au rang 1 → ~2,5 au rang 9). */
  extBase: 0.7,
  extPerRank: 0.2,
  /** Mélange des difficultés des lieux faits : dessous / ton rang / au-dessus. */
  gapBelow: 0.25,
  gapAbove: 0.15,
  /** Builds simulés pour trouver le build MÉDIAN. */
  samples: 200,
} as const;

/** La politique du joueur de référence : si les emplacements sont pleins, il remplace la
 *  compétence du cran le plus bas quand la nouvelle est d'un cran strictement plus haut,
 *  sinon il refuse (la rune est perdue). */
function giveRune(
  rng: () => number,
  sk: ChampSkill[],
  tier: RuneTier,
  slots: number,
): ChampSkill[] {
  const id = rollRuneSkill(rng, tier, sk);
  if (!id) return sk;
  const o = applyRuneSkill(sk, id, slots);
  if (o.kind !== 'full') return o.skills;
  const rank = (s: ChampSkill) => RUNE_TIERS.indexOf(SKILLS[s.id].tier);
  let worst = 0;
  for (let i = 1; i < sk.length; i++) if (rank(sk[i]!) < rank(sk[worst]!)) worst = i;
  return RUNE_TIERS.indexOf(tier) > rank(sk[worst]!) ? replaceSkill(sk, id, worst) : sk;
}

/** Un build simulé : les runes reçues du rang 0 au rang `rankIndex`. */
function simulateBuild(rng: () => number, rankIndex: number, slots: number): ChampSkill[] {
  let sk: ChampSkill[] = [];
  for (let k = 0; k <= rankIndex; k++) {
    if (k >= 1) sk = giveRune(rng, sk, rollAscensionRune(rng, k), slots);
    let e = REF_BUILD.extBase + REF_BUILD.extPerRank * k;
    while (e > 0) {
      if (rng() < Math.min(1, e)) {
        const x = rng();
        const gap = x < REF_BUILD.gapBelow ? -1 : x < 1 - REF_BUILD.gapAbove ? 0 : 1;
        const tier = pickTier(
          rng,
          placeRuneOdds({ place: 'camp', placeRankIndex: 3 + gap, playerRankIndex: 3 }),
        );
        sk = giveRune(rng, sk, tier, slots);
      }
      e -= 1;
    }
  }
  return sk;
}

/** La « valeur de combat » d'un build : somme des valeurs de ses compétences de combat.
 *  Sert seulement à choisir le build MÉDIAN. */
function combatScore(sk: readonly ChampSkill[]): number {
  return sk.reduce((n, s) => n + (SKILL_COMBAT_EFFECT[s.id] ? skillValue(s.id, s.level) : 0), 0);
}

const refBuildCache = new Map<string, ChampSkill[]>();

/**
 * Le build MÉDIAN d'un champion de référence au rang `rankIndex` (déterministe, mis en
 * cache). `variant` distingue les trois champions d'une escorte de référence (graines
 * différentes), pour qu'ils ne portent pas tous exactement la même chose.
 */
export function referenceRuneBuild(rankIndex: number, slots: number, variant = 0): ChampSkill[] {
  const key = `${rankIndex}:${slots}:${variant}`;
  const hit = refBuildCache.get(key);
  if (hit) return hit.map((s) => ({ ...s }));
  const rng = mulberry32(1 + rankIndex * 131 + slots * 17 + variant * 7919);
  const builds = Array.from({ length: REF_BUILD.samples }, () =>
    simulateBuild(rng, rankIndex, slots),
  ).sort((a, b) => combatScore(a) - combatScore(b));
  // ⚠️ SANS LES DORÉES : ce sont des coups de chance (1 à 12 % des runes), et un seul
  // Premier sang ou Second souffle chez un étalon déplaçait toute une bande de difficulté
  // (mesuré : trio de référence sur route calme au niveau 70, 91 % → 99 %). L'étalon est le
  // joueur MÉDIAN ; une dorée est un bonus au-dessus de lui. L'emplacement qu'elle prenait
  // reste vide, exactement comme avant que les dorées n'agissent.
  const med = builds[Math.floor(builds.length / 2)]!.filter((k) => SKILLS[k.id].tier !== 'gold');
  refBuildCache.set(key, med);
  return med.map((s) => ({ ...s }));
}

// ── 💾 L'ÉTAT DES RUNES D'UN JOUEUR (étape 4) ─────────────────────────────────────────────
//
// `characters.runes` (jsonb, migr. 0094). Le STOCK compte les runes non posées par couleur ;
// `pending` garde une compétence TIRÉE qui attend la décision du joueur (tous les
// emplacements pris, compétence nouvelle) — persistée, sinon un rechargement la relancerait.

/** Une rune tirée qui attend « remplacer ou garder ». */
interface PendingRune {
  advId: string;
  tier: RuneTier;
  drawn: SkillId;
}

export interface RuneState {
  stock: Record<RuneTier, number>;
  pending: PendingRune | null;
  /** Version de la compensation versée aux champions d'avant les runes (0 = pas versée). */
  comp: number;
}

/** Version courante de la compensation : on ne la verse qu'une fois. */
export const RUNE_COMP_VERSION = 1;

const isTier = (t: unknown): t is RuneTier => RUNE_TIERS.includes(t as RuneTier);
const isSkill = (s: unknown): s is SkillId => typeof s === 'string' && s in SKILLS;

/** Relecture DÉFENSIVE d'un JSONB : tout ce qui n'a pas la bonne forme est écarté. */
export function normalizeRuneState(raw: unknown): RuneState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const st = (r.stock && typeof r.stock === 'object' ? r.stock : {}) as Record<string, unknown>;
  const stock = { green: 0, blue: 0, violet: 0, gold: 0 };
  for (const t of RUNE_TIERS) {
    const n = Number(st[t]);
    stock[t] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  const p = r.pending as Record<string, unknown> | null | undefined;
  const pending =
    p && typeof p.advId === 'string' && isTier(p.tier) && isSkill(p.drawn)
      ? { advId: p.advId, tier: p.tier, drawn: p.drawn }
      : null;
  const comp = Number(r.comp);
  return { stock, pending, comp: Number.isFinite(comp) ? comp : 0 };
}

/** Relecture défensive des compétences d'un champion : ids inconnus, doublons et niveaux
 *  hors bornes écartés ou ramenés dans [1, SKILL_MAX_LEVEL]. */
export function normalizeChampSkills(raw: unknown): ChampSkill[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<SkillId>();
  const out: ChampSkill[] = [];
  for (const s of raw as { id?: unknown; level?: unknown }[]) {
    if (!s || !isSkill(s.id) || seen.has(s.id)) continue;
    seen.add(s.id);
    const lv = Math.floor(Number(s.level));
    out.push({
      id: s.id,
      level: Math.max(1, Math.min(SKILL_MAX_LEVEL, Number.isFinite(lv) ? lv : 1)),
    });
  }
  return out;
}

/** Ajoute des runes au stock (rend un NOUVEL état). */
export function addRunes(state: RuneState, tiers: readonly RuneTier[]): RuneState {
  if (!tiers.length) return state;
  const stock = { ...state.stock };
  for (const t of tiers) stock[t] += 1;
  return { ...state, stock };
}

/** Graine stable d'une chaîne (FNV-1a) — la compensation doit être la même à chaque essai. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0 || 1;
}

/**
 * 🎁 LA COMPENSATION des champions d'avant les runes (décision de l'utilisateur) : chacun
 * reçoit les runes qu'il aurait gagnées — une par rang d'ascension ouvert et une par cran
 * d'Éveil passé, aux MÊMES chances que les sources. Graine = l'id du champion : rejouer la
 * compensation donne exactement les mêmes couleurs. Elle va au STOCK, jamais posée d'office.
 */
export function compensationRunes(
  champs: readonly { id: string; grade: 'A' | 'S' | 'X'; ascended: number; awaken: number }[],
): RuneTier[] {
  const out: RuneTier[] = [];
  for (const c of champs) {
    const rng = mulberry32(hashStr(`runes:${c.id}`));
    for (let r = 1; r <= c.ascended; r++) out.push(rollAscensionRune(rng, r));
    for (let s = 1; s <= c.awaken; s++) out.push(rollAwakenRune(rng, c.grade, s));
  }
  return out;
}
