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
    what: 'survit à un coup fatal avec {v} % des PV',
    base: 15,
  },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

/** Niveau maximum d'une compétence. */
export const SKILL_MAX_LEVEL = 5;

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

// ── 🎁 D'OÙ VIENNENT LES RUNES (étape 2) ─────────────────────────────────────────────────
//
// ⚠️ Toujours NON BRANCHÉ : ces fonctions disent quelle rune une source DONNE. Le crédit au
// joueur arrivera avec les écrans, pour qu'aucune rune ne s'accumule sans usage possible.

/** Réglages des sources. ⚠️ À MESURER à l'étape 3 (rythme de runes par joueur-type). */
export const RUNE_SOURCES = {
  /** Maturité (0..1) à partir de laquelle une faille d'un rang au-dessus paie en doré.
   *  Mesuré 2026-09-27 : mûre, une faille +1 rang demande 5 à 8 champions de ton rang. */
  riftMatureAt: 0.5,
  /** Effort d'un Défi 360 (`chestEffortMult`, 0,7..1,5) à partir duquel il paie en bleu. */
  comboBlueAt: 1.25,
} as const;

/**
 * 🎲 Les chances de couleur d'une rune d'ASCENSION, selon le rang ATTEINT (index de
 * `CHARACTER_RANKS` : 1 = Argent … 9 = Tout-puissant). Plus le rang est haut, plus la rune a
 * de chances d'être haute. Chaque ligne somme à 1 (testé).
 */
const ASCENSION_ODDS: readonly (readonly [number, number, number, number])[] = [
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
  const row = ASCENSION_ODDS[Math.max(0, Math.min(ASCENSION_ODDS.length - 1, rankIndex))]!;
  return { green: row[0], blue: row[1], violet: row[2], gold: row[3] };
}

/** Tire la couleur d'une rune d'ascension (ou d'Éveil) au rang donné. */
export function rollAscensionRune(rng: () => number, rankIndex: number): RuneTier {
  const odds = ascensionRuneOdds(rankIndex);
  let r = rng();
  for (const t of RUNE_TIERS) {
    r -= odds[t];
    if (r < 0) return t;
  }
  // Arrondi flottant : la dernière couleur à probabilité non nulle.
  return [...RUNE_TIERS].reverse().find((t) => odds[t] > 0)!;
}

/** ✨ ÉVEIL : une rune offerte par cran (décision de l'utilisateur), tirée aux chances d'une
 *  ascension au RANG ACTUEL du champion — un doublon d'un champion haut placé vaut plus. */
export function rollAwakenRune(rng: () => number, currentRankIndex: number): RuneTier {
  return rollAscensionRune(rng, currentRankIndex);
}

/** 📖 Archives (lieu de récolte) : une rune verte, garantie. */
export const ARCHIVE_RUNE: RuneTier = 'green';

/**
 * 🕳️ La rune d'une faille REFERMÉE, selon sa difficulté réelle (décision de l'utilisateur) :
 * rang de la faille comparé au rang du joueur, en rangs de prestige.
 * - en dessous → verte · ton rang → bleue ;
 * - au-dessus : violette si elle est jeune, dorée si elle a mûri (`riftMatureAt`).
 * ⚠️ Une incursion RATÉE ne donne rien : c'est à l'appelant de ne pas appeler.
 */
export function riftRune(
  riftRankIndex: number,
  playerRankIndex: number,
  maturity: number,
): RuneTier {
  const gap = riftRankIndex - playerRankIndex;
  if (gap < 0) return 'green';
  if (gap === 0) return 'blue';
  return maturity >= RUNE_SOURCES.riftMatureAt ? 'gold' : 'violet';
}

/** 🐉 Boss entre amis : la rune du coffre selon le cran de difficulté. ⚠️ L'Échauffement ne
 *  paie rien — c'est le cran qu'on enchaînerait pour farmer (même règle que les tickets).
 *  ⚠️ Couvre TOUS les crans de `BOSS_TIERS` (testé) : un cran ajouté sans rune rougit. */
export const FRIEND_BOSS_RUNE: Record<string, RuneTier | null> = {
  echauffement: null,
  serieux: 'green',
  costaud: 'blue',
  brutal: 'violet',
  inhumain: 'gold',
};

/** 🎯 Défi 360 bouclé dans les temps : verte, bleue s'il était intense
 *  (`effortMult` = `chestEffortMult`, le facteur de son coffre). */
export function comboRune(effortMult: number): RuneTier {
  return effortMult >= RUNE_SOURCES.comboBlueAt ? 'blue' : 'green';
}
