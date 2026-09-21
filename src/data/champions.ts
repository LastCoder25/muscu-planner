/**
 * 🏅 LE ROSTER DES CHAMPIONS — 32 identités écrites à la main.
 *
 * 🎰 Refonte S/A/B (2026-09-21) : 16 champions **A** (les 4 premières vagues d'écriture) et
 * 16 **S** (les 4 dernières). Le B est le fond du tirage — une pièce d'équipement, jamais un
 * champion. Cf. `docs/superpowers/plans/2026-09-21-gacha-roadmap.md` et `src/lib/gacha.ts`.
 *
 * ## Ce qu'est un champion, et ce qu'il N'EST PAS
 *
 * Une **identité**, pas un métier ni un chemin. C'est la correction que la spec apporte :
 * les deux versions précédentes faisaient d'un champion un CHEMIN dans l'arbre des classes
 * — l'ancien système déguisé, où l'identité d'un champion était indéfinissable, donc les
 * **doublons** impossibles, donc l'Éveil, donc le cœur du gacha.
 *
 * ⚠️ **RIEN N'EST INVENTÉ ICI.** Chaque champ alimente quelque chose qui existe déjà :
 * - `lineage` → **quel équipement il porte** (`canWearAdvGear`, les 105 pièces en stock) ;
 * - `role` → les **4 rôles de convoi**, déjà appliqués par les caravanes ;
 * - `skills` → les **8 signatures**, que **`simulateCombat` sait déjà jouer** ;
 * - `form` → la répartition du budget de rareté, comme `advStats` la fait aujourd'hui.
 *
 * ## ⚠️ RÈGLE D'EXTENSION : on n'ajoute JAMAIS un champion en BAS
 *
 * La pyramide du genre pointe **en bas** : plus la rareté est haute, plus il y a de
 * personnages (une cinquantaine de 5★ contre une trentaine de 4★ chez Genshin). Ce n'est
 * pas un accident — la **haute rareté est la COLLECTION** (il en faut beaucoup pour qu'en
 * obtenir une précise reste un rêve), la **basse rareté est l'ENTRÉE** (elle doit rester
 * petite pour que les doublons tombent sans cesse).
 *
 * Ces 32 sont la **première vague** ; tout ajout ultérieur va **en haut**. Sans cette règle
 * écrite, quelqu'un ajoutera un jour des communs « pour étoffer le départ » et tuera
 * l'Éveil à l'endroit précis où il doit vivre.
 */

import type { EffectType } from '@/lib/items';
import type { AdvRole } from '@/lib/adventurers';
import type { Lineage } from '@/lib/advGear';

/** Un cran d'Éveil ÉCRIT : à la `n`-ième copie, telle signature gagne un niveau.
 *  ⚠️ AUCUN SYSTÈME NEUF — `AdvSkill` porte déjà un niveau par répétition (v0.757), et
 *  l'écran sait déjà l'afficher. Un cran qualitatif = +1 niveau de compétence. */
/** ⚠️ Pas exporté (`npm run dead`) : aucun importeur hors de ce module — `Champion` le
 *  porte, et c'est lui que le reste du code consomme. */
/** 🎰 Les lettres du gacha (refonte 2026-09-21, décidée par l'utilisateur : « les étoiles
 *  sont déjà prises dans l'app »). **S** = le sommet, **A** = le petit gain garanti tous les
 *  10, **B** = le fond du tirage — jamais un champion (une pièce d'équipement de lignée). */
export type ChampionGrade = 'S' | 'A';
export type PullGrade = ChampionGrade | 'B';
/** Du plus bas au plus haut. */
export const PULL_GRADES: readonly PullGrade[] = ['B', 'A', 'S'];
/** Couleurs du genre : bleu B, violet A, or S — la lueur qui précède la révélation. */
export const GRADE_COLOR: Record<PullGrade, string> = { S: '#ffc94a', A: '#b57bff', B: '#6fa8ff' };

interface AwakenStep {
  /** Rang d'Éveil où ce cran tombe (1 = première copie en trop). */
  at: number;
  /** La signature qui gagne un niveau. ⚠️ DOIT figurer dans `skills` (testé) : offrir un
   *  niveau à une compétence qu'il n'a pas ne se verrait nulle part. */
  skill: EffectType;
}

export interface Champion {
  id: string;
  name: string;
  /** Son VISAGE. ⚠️ Un gacha sans visage pour ses personnages n'en est pas un — et une
   *  `AdvClass` en a un depuis toujours, donc sans lui un champion s'afficherait 🧑 là
   *  où un aventurier s'affiche ⚔️. Tous DISTINCTS (testé) : c'est lui qui identifie un
   *  champion dans une grille de 32. */
  emoji: string;
  /** 🎰 Sa lettre de tirage, FIXE (refonte 2026-09-21) : **S** ou **A**. Il n'existe pas de
   *  champion B — le B est le fond du tirage (une pièce d'équipement). Ce que le champion
   *  peut PORTER suit son RANG (son niveau), jamais sa lettre. */
  grade: ChampionGrade;
  /** ⚠️ EXPLICITE, alors qu'elle se DÉDUISAIT de la classe racine du chemin : sans chemin,
   *  c'est elle qui décide de l'équipement. Une ligne, mais elle est porteuse. */
  lineage: Lineage;
  /** 0 ou 1 rôle de convoi. ⚠️ `null` est un choix, pas un oubli : un champion peut n'être
   *  qu'un combattant. */
  role: AdvRole | null;
  /** Répartition du budget de rareté sur 💪 / ❤️ / ⚡. */
  form: { p: number; e: number; a: number };
  /** 1 à 3 signatures, selon la rareté (1·1·2·2·2·3·3·3 — testé). */
  skills: EffectType[];
  /** 1 ou 2 crans écrits. Le reste de l'Éveil est un barème COMMUN (`gacha.ts`) : tout
   *  écrire, ce serait 6 crans × 32 champions = 192 effets à équilibrer, dont chacun peut
   *  casser le combat. */
  awaken: AwakenStep[];
}

const C = (
  id: string,
  name: string,
  emoji: string,
  grade: ChampionGrade,
  lineage: Lineage,
  role: AdvRole | null,
  form: [number, number, number],
  skills: EffectType[],
  awaken: AwakenStep[],
): Champion => ({
  id,
  name,
  emoji,
  grade,
  lineage,
  role,
  form: { p: form[0], e: form[1], a: form[2] },
  skills,
  awaken,
});

/**
 * ⚠️ **LA COUVERTURE LIGNÉE × RARETÉ EST LA CONTRAINTE D'ÉCRITURE À NE PAS RATER.**
 * 6 lignées × 8 raretés = 48 cases pour 32 places : toutes ne peuvent pas être remplies.
 * Chaque lignée est donc placée **délibérément** — jamais absente des trois plus hautes
 * raretés, sinon `capAdvGearToWearable` plafonnerait ses pièces très bas **pour toujours**,
 * et un tiers du stock d'équipement deviendrait mort. Un test le vérifie.
 */
export const CHAMPIONS: Champion[] = [
  // ── A (vague 1) — l'ENTRÉE. Petite par conception : c'est ici que les doublons pleuvent. ──
  C(
    'orsene',
    'Orsène le Baumier',
    '🌿',
    'A',
    'mage',
    'heal',
    [1, 2, 1],
    ['max_pv_pct'],
    [{ at: 2, skill: 'max_pv_pct' }],
  ),
  C(
    'boulin',
    'Boulin Grosse-Malle',
    '🧳',
    'A',
    'caravanier',
    'haul',
    [1, 3, 1],
    ['thorns_pct'],
    [{ at: 2, skill: 'thorns_pct' }],
  ),
  C(
    'fila',
    'Fila Pied-Leste',
    '👣',
    'A',
    'eclaireur',
    'speed',
    [1, 1, 3],
    ['crit_pct'],
    [{ at: 3, skill: 'crit_pct' }],
  ),
  C(
    'teck',
    'Teck l’Guetteur',
    '🔭',
    'A',
    'archer',
    'scout',
    [2, 1, 2],
    ['damage_pct'],
    [{ at: 2, skill: 'damage_pct' }],
  ),

  // ── A (vague 2) ──
  C(
    'sauge',
    'Mère Sauge',
    '🍵',
    'A',
    'caravanier',
    'heal',
    [1, 3, 1],
    ['lifesteal_pct'],
    [{ at: 2, skill: 'lifesteal_pct' }],
  ),
  C(
    'gorm',
    'Gorm Large-Dos',
    '🪵',
    'A',
    'homme_armes',
    'haul',
    [2, 3, 1],
    ['max_pv_pct'],
    [{ at: 3, skill: 'max_pv_pct' }],
  ),
  C(
    'sylve',
    'Sylve la Flèche',
    '🏹',
    'A',
    'archer',
    'speed',
    [2, 1, 3],
    ['damage_pct'],
    [{ at: 2, skill: 'damage_pct' }],
  ),
  C(
    'vig',
    'Vig Deux-Lunes',
    '🌘',
    'A',
    'eclaireur',
    'scout',
    [1, 2, 3],
    ['crit_pct'],
    [{ at: 3, skill: 'crit_pct' }],
  ),

  // ── A (vague 3) — deux signatures à partir d'ici. ──
  C(
    'anselme',
    'Anselme du Cloître',
    '📿',
    'A',
    'mage',
    'heal',
    [1, 3, 2],
    ['max_pv_pct', 'lifesteal_pct'],
    [{ at: 2, skill: 'lifesteal_pct' }],
  ),
  C(
    'barthe',
    'Barthe Porte-Enclume',
    '⚒️',
    'A',
    'guerrier',
    'haul',
    [3, 2, 1],
    ['damage_pct', 'thorns_pct'],
    [{ at: 3, skill: 'damage_pct' }],
  ),
  C(
    'zephyrine',
    'Zéphyrine',
    '🍃',
    'A',
    'eclaireur',
    'speed',
    [1, 1, 4],
    ['crit_pct', 'momentum_pct'],
    [{ at: 2, skill: 'momentum_pct' }],
  ),
  C(
    'verre',
    'Œil-de-Verre',
    '🔎',
    'A',
    'mage',
    'scout',
    [2, 2, 2],
    ['crit_pct', 'damage_pct'],
    [{ at: 3, skill: 'crit_pct' }],
  ),

  // ── A (vague 4) ──
  C(
    'lysandre',
    'Lysandre des Sources',
    '💧',
    'A',
    'mage',
    'heal',
    [1, 4, 2],
    ['lifesteal_pct', 'max_pv_pct'],
    [
      { at: 2, skill: 'lifesteal_pct' },
      { at: 4, skill: 'max_pv_pct' },
    ],
  ),
  C(
    'tessa',
    'Tessa la Meneuse',
    '🐪',
    'A',
    'caravanier',
    'haul',
    [2, 3, 2],
    ['max_pv_pct', 'thorns_pct'],
    [{ at: 3, skill: 'thorns_pct' }],
  ),
  C(
    'roan',
    'Roän Taille-Route',
    '🗡️',
    'A',
    'guerrier',
    'speed',
    [3, 2, 2],
    ['damage_pct', 'momentum_pct'],
    [{ at: 2, skill: 'momentum_pct' }],
  ),
  C(
    'miren',
    'Miren Sans-Bruit',
    '🤫',
    'A',
    'archer',
    'scout',
    [2, 1, 4],
    ['crit_pct', 'execute_pct'],
    [
      { at: 2, skill: 'crit_pct' },
      { at: 5, skill: 'execute_pct' },
    ],
  ),

  // ── S (vague 1) ──
  C(
    'ferrand',
    'Doyen Ferrand',
    '🕯️',
    'S',
    'caravanier',
    'heal',
    [1, 4, 2],
    ['lifesteal_pct', 'max_pv_pct'],
    [{ at: 3, skill: 'lifesteal_pct' }],
  ),
  C(
    'ursk',
    'Ursk Casse-Mur',
    '🔨',
    'S',
    'homme_armes',
    'haul',
    [3, 4, 1],
    ['thorns_pct', 'max_pv_pct'],
    [
      { at: 2, skill: 'thorns_pct' },
      { at: 4, skill: 'max_pv_pct' },
    ],
  ),
  C(
    'nive',
    'Nive des Cols',
    '🏔️',
    'S',
    'eclaireur',
    'speed',
    [2, 2, 4],
    ['momentum_pct', 'crit_pct'],
    [{ at: 2, skill: 'momentum_pct' }],
  ),
  C(
    'kaell',
    'Kaell Œil-Froid',
    '❄️',
    'S',
    'guerrier',
    'scout',
    [4, 2, 2],
    ['damage_pct', 'execute_pct'],
    [{ at: 3, skill: 'execute_pct' }],
  ),

  // ── S (vague 2) — trois signatures à partir d'ici. ──
  C(
    'ombrelune',
    'Ombrelune',
    '🌙',
    'S',
    'mage',
    'heal',
    [2, 4, 2],
    ['lifesteal_pct', 'max_pv_pct', 'rage_pct'],
    [
      { at: 2, skill: 'lifesteal_pct' },
      { at: 4, skill: 'rage_pct' },
    ],
  ),
  C(
    'tarn',
    'Tarn le Rempart',
    '🏯',
    'S',
    'guerrier',
    'haul',
    [3, 4, 1],
    ['thorns_pct', 'max_pv_pct', 'rage_pct'],
    [{ at: 3, skill: 'thorns_pct' }],
  ),
  C(
    'ysolde',
    'Ysolde Trait-Long',
    '🪶',
    'S',
    'archer',
    'speed',
    [3, 1, 4],
    ['damage_pct', 'crit_pct', 'momentum_pct'],
    [
      { at: 2, skill: 'crit_pct' },
      { at: 5, skill: 'momentum_pct' },
    ],
  ),
  C(
    'corvin',
    'Corvin des Brumes',
    '🐦‍⬛',
    'S',
    'eclaireur',
    'scout',
    [2, 2, 5],
    ['crit_pct', 'execute_pct', 'momentum_pct'],
    [{ at: 2, skill: 'execute_pct' }],
  ),

  // ── S (vague 3) ──
  C(
    'brume',
    'Vieille Brume',
    '🌫️',
    'S',
    'caravanier',
    'heal',
    [2, 5, 2],
    ['lifesteal_pct', 'max_pv_pct', 'thorns_pct'],
    [
      { at: 2, skill: 'lifesteal_pct' },
      { at: 4, skill: 'thorns_pct' },
    ],
  ),
  C(
    'molosse',
    'Molosse Porte-Monde',
    '🐗',
    'S',
    'homme_armes',
    'haul',
    [3, 5, 1],
    ['max_pv_pct', 'thorns_pct', 'rage_pct'],
    [{ at: 3, skill: 'rage_pct' }],
  ),
  C(
    'fulgur',
    'Fulgur',
    '🌩️',
    'S',
    'mage',
    'speed',
    [3, 2, 5],
    ['momentum_pct', 'crit_pct', 'damage_pct'],
    [
      { at: 2, skill: 'momentum_pct' },
      { at: 5, skill: 'damage_pct' },
    ],
  ),
  C(
    'nyx',
    'Nyx la Silencieuse',
    '🕸️',
    'S',
    'archer',
    'scout',
    [3, 2, 5],
    ['execute_pct', 'crit_pct', 'damage_pct'],
    [{ at: 2, skill: 'execute_pct' }],
  ),

  // ── S (vague 4) — le sommet. ⚠️ On n'ajoute qu'en S, jamais en A. ──
  C(
    'aurore',
    'Aurore Première',
    '🌅',
    'S',
    'mage',
    'heal',
    [3, 5, 3],
    ['lifesteal_pct', 'max_pv_pct', 'rage_pct'],
    [
      { at: 2, skill: 'lifesteal_pct' },
      { at: 4, skill: 'max_pv_pct' },
    ],
  ),
  C(
    'atlas',
    'Atlas des Cimes',
    '🗻',
    'S',
    'homme_armes',
    'haul',
    [4, 6, 1],
    ['thorns_pct', 'max_pv_pct', 'rage_pct'],
    [
      { at: 3, skill: 'thorns_pct' },
      { at: 5, skill: 'rage_pct' },
    ],
  ),
  C(
    'ventcourt',
    'Vent-Qui-Court',
    '🌪️',
    'S',
    'eclaireur',
    'speed',
    [3, 2, 6],
    ['momentum_pct', 'crit_pct', 'execute_pct'],
    [
      { at: 2, skill: 'momentum_pct' },
      { at: 4, skill: 'crit_pct' },
    ],
  ),
  C(
    'oeildumonde',
    'Œil du Monde',
    '🔱',
    'S',
    'guerrier',
    'scout',
    [5, 3, 3],
    ['damage_pct', 'execute_pct', 'crit_pct'],
    [
      { at: 2, skill: 'damage_pct' },
      { at: 5, skill: 'execute_pct' },
    ],
  ),
];

/** Index par id — une seule construction, lue par le tirage et par le Codex. */
export const CHAMPION_BY_ID = new Map(CHAMPIONS.map((c) => [c.id, c]));

/** Les champions d'une lettre. ⚠️ **LA TAILLE DE CE POOL EST LA VITESSE DE L'ÉVEIL** : un
 *  champion précis tombe à 1/N du taux de sa lettre. */
export function championsOf(grade: ChampionGrade): Champion[] {
  return CHAMPIONS.filter((c) => c.grade === grade);
}

/**
 * 📏 L'ÉTALON DES COMBATS, FIGÉ (refonte S/A, 2026-09-21).
 *
 * ⚠️ Toute la calibration des combats (route, camps, failles, sièges) se mesure contre trois
 * champions de référence « du rang du joueur ». Avant la refonte, c'étaient les trois
 * champions de la rareté du rang (un par axe dominant) ; les choisir désormais parmi les 16 S
 * change leurs FORMES (plus extrêmes), et mesuré, la route et les failles dérivaient de
 * 5 à 40 points au niveau 12. On fige donc les MÊMES trois par rang, avec le budget d'un S
 * (`GRADE_BUDGET.S` = 1 = le budget d'avant) : la calibration ne bouge pas d'un iota.
 *
 * ⚠️ Ce sont des champions SYNTHÉTIQUES (id `ref:…`, lettre S), jamais dans le roster ni
 * tirables : ils n'existent que pour mesurer. Calculés une fois depuis le roster d'avant.
 */
const REF_PICKS: readonly (readonly [string, string, string])[] = [
  ['teck', 'fila', 'boulin'],
  ['gorm', 'sylve', 'sauge'],
  ['barthe', 'zephyrine', 'anselme'],
  ['roan', 'miren', 'lysandre'],
  ['kaell', 'nive', 'ferrand'],
  ['tarn', 'corvin', 'ombrelune'],
  ['molosse', 'fulgur', 'brume'],
  ['oeildumonde', 'ventcourt', 'atlas'],
];
/** Les trois champions de référence de chaque RANG (index = `prestigeRankIndex`). */
export const REF_CHAMPIONS_BY_RANK: readonly Champion[][] = REF_PICKS.map((ids) =>
  ids.map((id) => ({ ...CHAMPION_BY_ID.get(id)!, id: `ref:${id}`, grade: 'S' as const })),
);
export const REF_CHAMPION_BY_ID = new Map(REF_CHAMPIONS_BY_RANK.flat().map((c) => [c.id, c]));
