// repScheme.ts — la fourchette de reps « idéale » selon l'OBJECTIF d'entraînement.
// SOURCE UNIQUE : cette table existait déjà, privée dans programBuilder (elle
// dimensionne les séances générées). Le Défi 360 en a besoin aussi → on l'extrait
// ici plutôt que de la recopier : deux copies divergent à la première retouche.
// Pur/testable, aucune dépendance (feuille : types + challengeLimits, eux-mêmes feuilles).
import type { Objective } from './types';
import { isAccessoryMuscle } from './challengeLimits';

export interface RepRange {
  min: number;
  max: number;
  rest: number; // repos conseillé entre séries (secondes)
}

/** Repères classiques par objectif : lourd et court en force, long et léger en endurance. */
export const OBJECTIVE_SCHEME: Record<Objective, RepRange> = {
  force: { min: 4, max: 6, rest: 180 },
  hypertrophie: { min: 8, max: 12, rest: 90 },
  endurance: { min: 15, max: 20, rest: 45 },
  remise_en_forme: { min: 10, max: 15, rest: 75 },
  perte_de_gras: { min: 12, max: 15, rest: 60 },
};

/** Objectif retenu quand le profil n'en porte pas (le plus courant, et le plus neutre). */
export const DEFAULT_OBJECTIVE: Objective = 'hypertrophie';

/** Exo au TEMPS (gainage) : la fourchette est en SECONDES, pas en reps — un
 *  gainage « 4-6 » n'a aucun sens. Mêmes valeurs que les séances générées. */
export const TIME_RANGE: RepRange = { min: 30, max: 60, rest: 45 };

// ⚠️ Un exo d'ISOLATION (biceps, mollets, abdos…) ne se travaille pas à 4-6 reps,
// quel que soit l'objectif : la charge utile y est trop faible et le risque
// articulaire trop haut pour du très lourd. On relève donc le PLANCHER de la
// fourchette — une règle d'une ligne — au lieu d'ajouter une seconde table par
// objectif, qui divergerait de la première.
const ISO_MIN = 8;
const ISO_MAX = 12;

export function repRangeFor(objective?: Objective | null): RepRange {
  return OBJECTIVE_SCHEME[objective ?? DEFAULT_OBJECTIVE] ?? OBJECTIVE_SCHEME[DEFAULT_OBJECTIVE];
}

/** Fourchette pour UN exercice : l'objectif, corrigé par la nature de l'exo
 *  (temps → secondes ; isolation → plancher relevé). */
export function repRangeForExercise(
  objective: Objective | null | undefined,
  exo: { time?: boolean; muscle_primary?: string | null },
): RepRange {
  if (exo.time) return { ...TIME_RANGE };
  const r = repRangeFor(objective);
  if (!isAccessoryMuscle(exo.muscle_primary)) return { ...r };
  return { min: Math.max(r.min, ISO_MIN), max: Math.max(r.max, ISO_MAX), rest: r.rest };
}

/** « 8–12 reps » / « 30–60 s » — libellé partagé par tous les écrans qui l'affichent. */
export function repRangeLabel(r: { min: number; max: number }, time = false): string {
  return time ? `${r.min}–${r.max} s` : `${r.min}–${r.max} reps`;
}

/** Reps à PRESCRIRE pour une série (préremplissage, séance générée) : le HAUT de la
 *  fourchette — c'est la cible qu'on vise avant de monter la charge (double
 *  progression), et c'est déjà ce que fait le conseil dérivé de l'historique. */
export function prescribedReps(r: { min: number; max: number }): number {
  return r.max;
}
