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
 * part d'un seul cran et se cumule sur elle-même jusqu'au niveau 5, puis s'ÉLÈVE au cran
 * au-dessus (🌈, `SkillRef.up`, v1.252.0).
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

/** ⚠️ Aucune couleur n'est réservée à un rang (décision de l'utilisateur, v1.34.0) : un
 *  champion Bronze peut porter une compétence dorée. */
export const RUNE_INFO: Record<RuneTier, { emoji: string; label: string }> = {
  green: { emoji: '🟢', label: 'Rune verte' },
  blue: { emoji: '🔵', label: 'Rune bleue' },
  violet: { emoji: '🟣', label: 'Rune violette' },
  gold: { emoji: '🟠', label: 'Rune dorée' },
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
  /** Plafond de la valeur, en % : seulement pour une CHANCE qu'une élévation pousserait
   *  au-delà de 100 (⛑️ vert → doré, surchargé : 112 %). */
  cap?: number;
}

/** ⚠️ Un `Record` exhaustif : ajouter une compétence sans la décrire ne compile pas. */
export const SKILLS: Record<SkillId, SkillDef> = {
  speed: { tier: 'green', emoji: '🧭', name: 'Vitesse', what: 'trajet −{v} %', base: 5.5 },
  // ⛑️ Ex-🩺 Soin (2026-10-07) : il ÉVITE la blessure au lieu de raccourcir la convalescence.
  // L'id `care` reste : il est persisté dans les compétences des champions.
  care: {
    tier: 'green',
    emoji: '⛑️',
    name: 'Premiers secours',
    what: '{v} % de chances qu’un blessé de la troupe l’évite',
    base: 15,
    cap: 90,
  },
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

/** Niveau maximum d'une compétence PAR LES RUNES (tirage, fusion, don). */
export const SKILL_MAX_LEVEL = 5;
/**
 * ⚡ LA SURCHARGE (décision de l'utilisateur, 2026-10-12, remplace le « niveau 6 taillé »).
 * Le LAPIDAIRE (île 3) ne fait plus passer une compétence au niveau 6 : il SURCHARGE une
 * compétence déjà au niveau 5. Elle reste niveau 5 à l'écran (« 5⚡ », « surchargée ») et sa
 * valeur est multipliée par `OVERCLOCK_MULT`.
 *
 * ⚠️ STOCKÉE comme un niveau 6 (`level: 6`) : c'est la valeur que les champions taillés avant
 * portent déjà en base — aucune migration. Un niveau 6 n'est donc qu'un DRAPEAU, jamais un cran
 * de plus sur `LEVEL_CURVE` ; seuls `skillValue` et les libellés le lisent.
 */
export const SKILL_OVERCLOCK_LEVEL = 6;
/** ⚡ +50 % sur la valeur du niveau 5. L'ancien niveau 6 (+0,15 sur la courbe) ne valait que
 *  +5,6 % : imperceptible pour 1 à 7 jours de lapidaire. ×1,5, c'est plus que tout ce que
 *  les niveaux 2 à 5 ajoutent l'un après l'autre (+0,2 à +0,7), sans jamais doubler. */
export const OVERCLOCK_MULT = 1.5;

/** ⚡ La compétence est-elle surchargée ? */
export function isOverclocked(level: number): boolean {
  return Math.floor(level) >= SKILL_OVERCLOCK_LEVEL;
}

/**
 * 🌈 L'ÉLÉVATION (décision de l'utilisateur, 2026-10-21) : une compétence au niveau 5 peut
 * passer à la COULEUR AU-DESSUS, au niveau 1 (vert → bleu → violet → doré, sans limite sinon
 * le doré). Une compétence verte peut donc finir dorée ; une dorée n'a que la surcharge ⚡.
 *
 * ⚠️ La couleur est celle de L'EXEMPLAIRE : `up` = crans d'élévation au-dessus de sa couleur
 * de départ (`SKILLS[id].tier`), ABSENT = 0. C'est le seul champ ajouté : une compétence non
 * élevée s'écrit et vaut exactement comme avant (étalons des combats inchangés).
 */
export interface SkillRef {
  id: SkillId;
  level: number;
  up?: number;
}

/** Crans d'élévation encore possibles au-dessus de la couleur de départ. */
export function maxRise(id: SkillId): number {
  return RUNE_TIERS.length - 1 - RUNE_TIERS.indexOf(SKILLS[id].tier);
}

/** Les crans d'élévation d'un exemplaire, bornés (lecture défensive). */
export function riseOf(s: Pick<SkillRef, 'id' | 'up'>): number {
  const u = Math.floor(Number(s.up ?? 0));
  return Number.isFinite(u) ? Math.max(0, Math.min(maxRise(s.id), u)) : 0;
}

/** ⚠️ SOURCE UNIQUE : la couleur d'un EXEMPLAIRE (élévation comprise). */
export function skillTier(s: Pick<SkillRef, 'id' | 'up'>): RuneTier {
  return RUNE_TIERS[RUNE_TIERS.indexOf(SKILLS[s.id].tier) + riseOf(s)]!;
}

/** Deux exemplaires de la même compétence ET de la même couleur (seuls ceux-là fusionnent). */
export function sameSkill(a: Pick<SkillRef, 'id' | 'up'>, b: Pick<SkillRef, 'id' | 'up'>): boolean {
  return a.id === b.id && riseOf(a) === riseOf(b);
}

export type RiseBlock = 'level' | 'top';

export const RISE_BLOCK_LABEL: Record<RiseBlock, string> = {
  level: `au niveau ${SKILL_MAX_LEVEL} seulement`,
  top: 'déjà dorée : seule la surcharge ⚡ du lapidaire la fait monter',
};

/** ⚠️ SOURCE UNIQUE écran + store : ce qui empêche d'élever cet exemplaire. Une compétence
 *  surchargée (5⚡) peut s'élever : elle PERD sa surcharge (l'écran le dit). */
export function riseBlocker(s: SkillRef): RiseBlock | null {
  if (Math.floor(s.level) < SKILL_MAX_LEVEL) return 'level';
  return riseOf(s) >= maxRise(s.id) ? 'top' : null;
}

/** 🌈 La couleur où l'élévation mène cet exemplaire (la sienne s'il est déjà au sommet). */
export function riseTier(s: Pick<SkillRef, 'id' | 'up'>): RuneTier {
  return skillTier({ id: s.id, up: Math.min(maxRise(s.id), riseOf(s) + 1) });
}

/** L'exemplaire élevé : couleur au-dessus, niveau 1 (surcharge perdue). `null` si refusé. */
export function riseSkill<T extends SkillRef>(s: T): T | null {
  if (riseBlocker(s)) return null;
  return { ...s, level: 1, up: riseOf(s) + 1 };
}

/**
 * 🌈 SUR UN CHAMPION, LE NIVEAU 5 S'ÉLÈVE DE LUI-MÊME (décision de l'utilisateur, 2026-10-21 :
 * « quand on passe une compétence d'un champion au lvl 5, elle passe à la rareté au-dessus au
 * lvl 1 »). Toute compétence d'un champion au niveau 5 tout juste (ni surchargée ni dorée)
 * devient la couleur au-dessus, niveau 1. ⚠️ Une surchargée (5⚡) ne bouge pas : c'est le
 * travail du lapidaire, l'élever la ferait baisser ; elle garde le bouton 🌈. Au stock, rien
 * n'est automatique. `rose` : les compétences élevées (pour l'animation).
 */
export function autoRise<T extends SkillRef>(skills: readonly T[]): { skills: T[]; rose: T[] } {
  const rose: T[] = [];
  const out = skills.map((s) => {
    if (Math.floor(s.level) !== SKILL_MAX_LEVEL) return s;
    const next = riseSkill(s);
    if (!next) return s;
    rose.push(next);
    return next;
  });
  return { skills: out, rose };
}

/** Le niveau d'une compétence tel qu'on l'ÉCRIT : « 3 », ou « 5⚡ » si elle est surchargée. */
export function skillLevelTag(level: number): string {
  return isOverclocked(level) ? `${SKILL_MAX_LEVEL}⚡` : String(Math.floor(level));
}

/** La teinte d'une couleur de rune — source unique des écrans (fiche, portraits). */
export const RUNE_COLOR: Record<RuneTier, string> = {
  green: '#7bc86c',
  blue: '#5aa9ff',
  violet: '#b98cff',
  gold: '#ffb23f',
};

/** ⚠️ RENDEMENT DÉCROISSANT : multiplicateur de la valeur de base à chaque niveau. Chaque
 *  niveau apporte moins que le précédent (+0,7, +0,5, +0,3, +0,2) — cumuler reste un
 *  progrès sans jamais valoir une compétence d'un cran plus haut empilée à l'infini.
 *  La surcharge du lapidaire n'est PAS un cran de cette courbe (`OVERCLOCK_MULT`). */
export const LEVEL_CURVE: readonly number[] = [1, 1.7, 2.2, 2.5, 2.7];

/**
 * 🌈 La même courbe sur toute l'échelle des ÉLÉVATIONS (ligne = crans au-dessus de la couleur
 * de départ), en multiples de la valeur de base. La ligne 0 EST `LEVEL_CURVE`.
 * ⚠️ Deux garanties (testées) : (1) le niveau 1 d'une couleur vaut PLUS que le niveau 5 de la
 * précédente — élever ne fait jamais rien perdre (hors surcharge) ; (2) chaque couleur ajoute
 * moins que la précédente (+1, +0,75, +0,55) — une verte montée au doré plafonne à ×5, pas à
 * ×2,7⁴ (une Vitesse à « trajet −290 % »).
 */
const RISE_CURVE: readonly (readonly number[])[] = [
  LEVEL_CURVE,
  [3, 3.25, 3.45, 3.6, 3.7],
  [3.95, 4.15, 4.3, 4.4, 4.45],
  [4.65, 4.8, 4.9, 4.97, 5],
];

/** La valeur d'un exemplaire, en %, arrondie au dixième (élévation et surcharge comprises). */
export function skillValue(s: SkillRef): number {
  const l = Math.max(1, Math.min(SKILL_MAX_LEVEL, Math.floor(s.level)));
  const boost = isOverclocked(s.level) ? OVERCLOCK_MULT : 1;
  const def = SKILLS[s.id];
  const v = Math.round(def.base * RISE_CURVE[riseOf(s)]![l - 1]! * boost * 10) / 10;
  return def.cap === undefined ? v : Math.min(def.cap, v);
}

/** Ce que fait un exemplaire, valeur comprise, en virgule française
 *  (« 33 % de chances qu’un blessé de la troupe l’évite »). Source unique des écrans. */
export function skillEffectText(s: SkillRef): string {
  return SKILLS[s.id].what.replace('{v}', String(skillValue(s)).replace('.', ','));
}

const pct = (v: number) => `${String(v).replace('.', ',')} %`;

/** ⚡ Ce que la surcharge change, en clair : « 32,4 % → 48,6 % ». */
export function overclockGain(s: Pick<SkillRef, 'id' | 'up'>): string {
  const at = (level: number) => skillValue({ id: s.id, up: riseOf(s), level });
  return `${pct(at(SKILL_MAX_LEVEL))} → ${pct(at(SKILL_OVERCLOCK_LEVEL))}`;
}

/** 🌈 Ce que l'élévation change, en clair : « 32,4 % → 36 % » (surcharge perdue comprise). */
export function riseGain(s: SkillRef): string {
  const next = riseSkill(s);
  return next ? `${pct(skillValue(s))} → ${pct(skillValue(next))}` : '';
}

export function skillsOfTier(tier: RuneTier): SkillId[] {
  return SKILL_IDS.filter((id) => SKILLS[id].tier === tier);
}

/** Emplacements de compétence selon la lettre du champion. */
export const SKILL_SLOTS: Record<'A' | 'S' | 'X', number> = { A: 2, S: 3, X: 4 };

/** Une compétence portée par un champion (`up` : son élévation, cf. `SkillRef`). */
export type ChampSkill = SkillRef;

/**
 * Le TIRAGE d'une rune sur un champion : une compétence du cran, au hasard.
 *
 * ⚠️ Une compétence déjà au niveau maximum n'est JAMAIS tirée (décision de l'utilisateur :
 * « relance ») — la rune ne se perd pas sur un plafond que le joueur ne choisit pas. Retirer
 * ces compétences du tirage revient exactement à relancer jusqu'à en obtenir une autre.
 * `null` : tout le cran est au maximum chez ce champion, la rune ne peut pas lui être posée.
 */
function rollRuneSkill(
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
type RuneOutcome =
  /** Il la portait déjà : +1 niveau, aucun emplacement pris. */
  | { kind: 'stack'; skills: ChampSkill[] }
  /** Nouvelle, et un emplacement est libre : elle s'installe au niveau 1. */
  | { kind: 'new'; skills: ChampSkill[] }
  /** Nouvelle, et tous les emplacements sont pris : le joueur doit choisir (`replaceSkill`). */
  | { kind: 'full'; drawn: SkillId };

function applyRuneSkill(skills: readonly ChampSkill[], drawn: SkillId, slots: number): RuneOutcome {
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
function replaceSkill(
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

function ascensionRuneOdds(rankIndex: number): Record<RuneTier, number> {
  return toOdds(ASCENSION_ODDS[Math.max(0, Math.min(ASCENSION_ODDS.length - 1, rankIndex))]!);
}

function rollAscensionRune(rng: () => number, rankIndex: number): RuneTier {
  return pickTier(rng, ascensionRuneOdds(rankIndex));
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

function placeRuneOdds(p: PlaceRuneInput): Record<RuneTier, number> {
  const gap = placeGap(p.placeRankIndex, p.playerRankIndex);
  const mature =
    gap === 'above' && p.place === 'rift' && (p.maturity ?? 0) >= RUNE_PLACE.riftMatureAt;
  return toOdds(PLACE_ODDS[mature ? 'aboveMature' : gap]);
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
    return t ? [effectAsAggregate(t, skillValue(s))] : [];
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
  return sk.reduce((n, s) => n + (SKILL_COMBAT_EFFECT[s.id] ? skillValue(s) : 0), 0);
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

// ── 💾 LES COMPÉTENCES D'UN CHAMPION ────────────────────────────────────────────────────
//
// L'état du joueur (runes multicolores, compétences au stock) vit dans `runeBank.ts` depuis
// la bascule du 2026-09-30.

const isSkill = (s: unknown): s is SkillId => typeof s === 'string' && s in SKILLS;

/** Relecture défensive des compétences d'un champion : ids inconnus, doublons et niveaux
 *  hors bornes écartés ou ramenés dans [1, SKILL_OVERCLOCK_LEVEL] (le 6 = surchargée par le lapidaire). */
export function normalizeChampSkills(raw: unknown): ChampSkill[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<SkillId>();
  const out: ChampSkill[] = [];
  for (const s of raw as { id?: unknown; level?: unknown; up?: unknown }[]) {
    if (!s || !isSkill(s.id) || seen.has(s.id)) continue;
    seen.add(s.id);
    const lv = Math.floor(Number(s.level));
    out.push(
      withRise(
        {
          id: s.id,
          level: Math.max(1, Math.min(SKILL_OVERCLOCK_LEVEL, Number.isFinite(lv) ? lv : 1)),
        },
        s.up,
      ),
    );
  }
  return out;
}

/** Pose l'élévation lue (bornée) sur un exemplaire relu ; ABSENTE à 0, pour que les
 *  compétences non élevées s'écrivent exactement comme avant. */
export function withRise<T extends { id: SkillId }>(s: T, up: unknown): T & { up?: number } {
  const u = riseOf({ id: s.id, up: up as number });
  return u ? { ...s, up: u } : s;
}
