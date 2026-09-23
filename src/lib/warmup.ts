// warmup.ts — séries d'APPROCHE d'un exercice chargé (montée en charge avant le travail).
//
// ⚠️ Nuance sur « jamais persistées » : c'est vrai de la BASE, pas du `localStorage`. Le run
// en cours y est écrit entier par `live.persist`, approches comprises — sinon reprendre une
// séance au milieu d'une montée en charge redemanderait les approches déjà faites.
//
// ⚠️ ELLES SONT DÉRIVÉES, JAMAIS ÉCRITES EN BASE. Une approche n'est qu'un pourcentage de la
// charge de travail : la stocker, c'est se condamner à la recalculer à chaque fois que la
// charge bouge (progression, deload, décharge planifiée) — et à la voir diverger le jour où
// un chemin oublie de le faire. Dérivée, elle suit toute seule, et `nextSessionDeterministic`
// n'a RIEN à en savoir.
//
// ⚠️ ELLES NE COMPTENT NULLE PART : ni XP, ni tonnage, ni séries par muscle, ni équilibre du
// corps, ni records, ni moteur de progression. La garantie n'est PAS un filtre répété chez les
// 12 lecteurs de `performed` (ils divergeraient) : c'est que les approches n'entrent JAMAIS
// dans le `SessionLog` — `live.buildLog` les écarte, point de passage unique. Tout lecteur,
// présent ou futur, est donc correct par construction.
//
// Pourquoi pas le champ `prescription` : il met l'exercice en mode « charges propres à chaque
// série » (`LiveExercise.prescribed`), ce qui DÉSACTIVE le report de charge sur les séries de
// travail. Les approches sont donc un bloc à part, en tête des séries.
import type { PlannedExercise, PrescribedSet } from './types';

export const WARMUP = {
  /** Sous cette charge de travail, aucune approche : on ne s'échauffe pas à 4 kg. */
  minLoad: 20,
  /** Repos entre deux approches : court, ce n'est pas du travail. */
  restSec: 60,
  /** Pas d'arrondi des charges (kg). 2,5 = le plus petit disque qu'on met des deux côtés. */
  step: 2.5,
} as const;

/**
 * Paliers, du plus lourd au plus léger : le premier dont `from` est atteint gagne.
 * Plus la charge de travail est lourde, plus la montée compte de marches.
 * Les reps DESCENDENT à mesure que la charge monte (on prépare, on ne fatigue pas).
 */
const TIERS: { from: number; pcts: number[]; reps: number[] }[] = [
  { from: 70, pcts: [0.45, 0.65, 0.85], reps: [8, 5, 3] },
  { from: 40, pcts: [0.5, 0.75], reps: [8, 5] },
  { from: WARMUP.minLoad, pcts: [0.55], reps: [8] },
];

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

/**
 * Séries d'approche d'un exercice planifié. Vide si l'exercice ne s'échauffe pas
 * à la charge : gainage (`unit:'time'`), poids du corps, ou charge trop légère.
 *
 * Garanties (testées) : charges STRICTEMENT croissantes, toujours sous la charge de
 * travail, jamais nulles, et reps décroissantes.
 */
export function warmupSets(ex: PlannedExercise): WarmupSet[] {
  const t = ex.target;
  // Chaque série a sa charge propre (pyramide importée d'une IA) : l'auteur a écrit la
  // montée lui-même, et elle commence souvent léger. On ne s'en mêle pas — même retenue
  // que `propagateLoad`, qui s'abstient sur un exercice prescrit.
  if (ex.prescription?.length) return [];
  // Le gainage se compte en secondes : une « approche » à 50 % n'y veut rien dire.
  if (t.unit === 'time') return [];
  // Poids du corps : il n'y a pas de charge à monter (le lest éventuel reste marginal).
  if (t.load === 'bodyweight') return [];

  const work = t.load_kg ?? 0;
  const tier = TIERS.find((x) => work >= x.from);
  if (!tier) return [];

  // ⚠️ AUCUN GARDE DÉFENSIF ICI, et c'est délibéré. Trois y avaient été écrits par réflexe
  // (« jamais au-dessus de la charge de travail », « strictement croissant », « jamais
  // nulle ») : mesurés, ils sont ARITHMÉTIQUEMENT INATTEIGNABLES avec ces paliers — écart
  // minimal de 10 kg entre deux approches, ratio maximal de 0,867, charge la plus faible à
  // 10 kg. Un garde qu'aucune valeur réelle n'atteint donne la confiance sans la couverture
  // (cf. le plafond de réduction, v0.751/0.753/0.922). Les trois propriétés vivent donc dans
  // `test/warmup.test.ts`, qui BALAIE toute la plage de charges : un palier futur mal réglé
  // (0,9/0,95, ou un `from` sous le pas de la barre) fera rougir les tests, là où un `if`
  // l'aurait avalé en silence.
  return tier.pcts.map((pct, i) => ({
    reps: tier.reps[i]!,
    load_kg: roundTo(work * pct, WARMUP.step),
    rest_seconds: WARMUP.restSec,
  }));
}

/** Une approche a TOUJOURS sa charge et son repos — `warmupSets` les pose tous les deux.
 *  ⚠️ Le dire au TYPE plutôt que le rattraper par des replis `??` chez les appelants :
 *  deux d'entre eux en portaient, tous deux inatteignables (la famille de gardes dormants
 *  que ce fichier documente plus bas). Une propriété prouvée vaut mieux qu'une propriété
 *  rattrapée. `WarmupSet[]` reste assignable partout où `PrescribedSet[]` est attendu. */
export type WarmupSet = Required<PrescribedSet>;

/** Une série qui COMPTE : du travail, pas de l'échauffement. */
export function isWorkSet(s: { warmup?: boolean }): boolean {
  return !s.warmup;
}

/**
 * Les séries de TRAVAIL d'un exercice en cours.
 *
 * ⚠️ SOURCE UNIQUE DE « QU'EST-CE QUI COMPTE ». Le LOG est protégé par un point de passage
 * unique (`buildLog` écarte les approches), mais `LiveExercise.sets`, lui, les contient —
 * et SEPT endroits ré-exprimaient chacun la règle à leur façon (volume, exDone, report de
 * charge, première série, buildLog, et deux gardes « il reste au moins une série »).
 *
 * ⚠️ L'UN D'EUX ÉTAIT FAUX, et il a fallu une revue pour le voir : `removeSet` gardait
 * `sets.length <= 1`, qui voulait dire « on garde au moins une série » et disait depuis
 * les approches « au moins une série OU approche ». Sur un exercice à 3 approches, on
 * pouvait donc supprimer les 3 séries de TRAVAIL : l'exercice ne se terminait alors
 * jamais (`exDone` sur une liste de travail vide) et sortait du log sans une seule série.
 * Le drapeau fuit dans TOUT invariant exprimé sur `sets` — d'où cette partition nommée.
 */
export function workSets<T extends { warmup?: boolean }>(sets: T[]): T[] {
  return sets.filter(isWorkSet);
}

/** Index de la 1re série de TRAVAIL (−1 s'il n'y en a pas) : elle porte la charge de référence. */
export function firstWorkIndex(sets: { warmup?: boolean }[]): number {
  return sets.findIndex(isWorkSet);
}

/**
 * Rang d'une série DANS SA PROPRE SUITE (1-based) : les approches se comptent entre
 * elles, les séries de travail entre elles. Sans ça, un exercice à 2 approches afficherait
 * ses séries de travail « 3 à 6 » — on aurait ajouté un échauffement et le joueur croirait
 * avoir gagné deux séries. Générale : ne suppose pas que les approches sont en tête.
 */
export function setOrdinal(sets: { warmup?: boolean }[], i: number): number {
  const warm = !!sets[i]?.warmup;
  let n = 0;
  for (let j = 0; j <= i && j < sets.length; j++) if (!!sets[j]!.warmup === warm) n++;
  return n;
}

/** Temps (secondes) que les approches ajoutent à un exercice — pour la durée estimée. */
export function warmupSeconds(ex: PlannedExercise): number {
  const sides = ex.unilateral ? 2 : 1;
  let sec = 0;
  for (const s of warmupSets(ex)) {
    // Même modèle d'exécution que `estimateDurationMin` : ~4 s par rep, et les deux
    // côtés d'un unilatéral.
    sec += s.rest_seconds + s.reps * 4 * sides;
  }
  return sec;
}
