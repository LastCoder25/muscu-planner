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

/**
 * 🏃 CORRECTIONS PAR EXERCICE (v0.1178) — la fourchette d'un OBJECTIF suppose une charge
 * qu'on règle. Or pour un exo au poids du corps la charge ne se règle pas : « force
 * 4-6 » donnait 4 à 6 pompes, 4 à 6 jumping jacks, 8 à 12 tours de corde. Deux familles :
 *
 *  - `fixed` : la fourchette NE DÉPEND PAS de l'objectif. Conditionnement (jumping jacks,
 *    corde, montées de genoux…) = volume, on compte large et on récupère peu ; pliométrie
 *    (sauts genoux-poitrine, bonds…) = QUALITÉ, peu de reps, repos long — la fatigue tue
 *    l'explosivité. Burpees entre les deux.
 *  - `floor` : poids du corps « facile » (pompes, squat, fentes, élastiques légers…) —
 *    l'objectif garde son sens (endurance → plus long), mais on RELÈVE la fourchette
 *    jusqu'à ce plancher, exactement comme l'isolation (`ISO_MIN`/`ISO_MAX`).
 *
 * Les exos DIFFICILES au poids du corps (tractions, dips, pompes diamant/piquées) n'y
 * sont PAS : 4-6 tractions en force a du sens. Un exo absent de la table garde la règle
 * de l'objectif. Clé = id de la bibliothèque (un test vérifie qu'il existe en base).
 */
export const EXERCISE_REPS: Record<
  string,
  { fixed?: RepRange; floor?: { min: number; max: number } }
> = {
  // — Conditionnement : volume, repos court.
  ex_jumping_jacks: { fixed: { min: 30, max: 50, rest: 30 } },
  ex_jump_rope: { fixed: { min: 60, max: 100, rest: 45 } },
  ex_high_knees: { fixed: { min: 30, max: 50, rest: 30 } },
  ex_mountain_climbers: { fixed: { min: 20, max: 40, rest: 30 } },
  ex_burpees: { fixed: { min: 8, max: 15, rest: 60 } },
  ex_squat_jump: { fixed: { min: 10, max: 20, rest: 45 } },
  // — Pliométrie / appuis (prépa tennis) : qualité, peu de reps, repos long.
  ex_pp_squat_jump: { fixed: { min: 6, max: 10, rest: 90 } },
  ex_tn_tuck_jump: { fixed: { min: 5, max: 8, rest: 90 } },
  ex_pp_broad_jump: { fixed: { min: 5, max: 8, rest: 90 } },
  ex_pp_lateral_bound: { fixed: { min: 8, max: 12, rest: 75 } },
  ex_tn_single_leg_hop: { fixed: { min: 6, max: 10, rest: 75 } },
  ex_pp_split_step: { fixed: { min: 5, max: 8, rest: 60 } },
  ex_tn_spider_drill: { fixed: { min: 3, max: 5, rest: 90 } },
  ex_tn_shadow_swing: { fixed: { min: 10, max: 15, rest: 45 } },
  // — Prévention épaule/poignet : léger et long, quel que soit l'objectif.
  ex_tn_band_external_rotation: { fixed: { min: 12, max: 15, rest: 45 } },
  ex_tn_band_internal_rotation: { fixed: { min: 12, max: 15, rest: 45 } },
  ex_tn_ytw: { fixed: { min: 8, max: 12, rest: 45 } },
  ex_tn_racket_pronation: { fixed: { min: 15, max: 20, rest: 30 } },
  ex_tn_wrist_curl: { fixed: { min: 15, max: 20, rest: 30 } },
  ex_pp_russian_twist: { fixed: { min: 20, max: 30, rest: 45 } },
  // — Poids du corps « facile » : plancher relevé.
  ex_pushup: { floor: { min: 8, max: 15 } },
  ex_pushup_knees: { floor: { min: 10, max: 20 } },
  ex_bw_squat: { floor: { min: 15, max: 25 } },
  ex_bw_lunge: { floor: { min: 10, max: 15 } },
  ex_tn_reverse_lunge: { floor: { min: 8, max: 12 } },
  ex_tn_lateral_lunge: { floor: { min: 8, max: 12 } },
  ex_pp_single_leg_rdl: { floor: { min: 8, max: 12 } },
  ex_glute_bridge: { floor: { min: 12, max: 20 } },
  ex_superman: { floor: { min: 12, max: 20 } },
  ex_crunch: { floor: { min: 15, max: 25 } },
  ex_tn_dead_bug: { floor: { min: 8, max: 12 } },
  ex_calf_raise_bw: { floor: { min: 15, max: 25 } },
  ex_tn_single_leg_calf: { floor: { min: 12, max: 20 } },
  ex_band_squat: { floor: { min: 15, max: 25 } },
  ex_band_row: { floor: { min: 12, max: 20 } },
  ex_band_curl: { floor: { min: 12, max: 20 } },
  ex_band_pushdown: { floor: { min: 12, max: 20 } },
  ex_band_pull_apart: { floor: { min: 15, max: 20 } },
  ex_tn_band_forehand: { floor: { min: 10, max: 15 } },
};

/** Applique la correction de l'exo (si elle existe) à une fourchette — celle de
 *  l'objectif, ou celle FIGÉE d'un Défi 360 : une fourchette figée était simplement
 *  fausse pour ces exos, on la corrige à la lecture comme le plancher d'isolation. */
export function correctForExercise(r: RepRange, id?: string | null): RepRange {
  const c = id ? EXERCISE_REPS[id] : undefined;
  if (!c) return { ...r };
  if (c.fixed) return { ...c.fixed };
  const fl = c.floor!;
  return { min: Math.max(r.min, fl.min), max: Math.max(r.max, fl.max), rest: r.rest };
}

export function repRangeFor(objective?: Objective | null): RepRange {
  return OBJECTIVE_SCHEME[objective ?? DEFAULT_OBJECTIVE] ?? OBJECTIVE_SCHEME[DEFAULT_OBJECTIVE];
}

/** Fourchette pour UN exercice : l'objectif, corrigé par la nature de l'exo
 *  (temps → secondes ; isolation → plancher relevé ; poids du corps /
 *  conditionnement / pliométrie → `EXERCISE_REPS`). */
export function repRangeForExercise(
  objective: Objective | null | undefined,
  exo: { time?: boolean; muscle_primary?: string | null; id: string | null },
): RepRange {
  if (exo.time) return { ...TIME_RANGE };
  const r = repRangeFor(objective);
  const base = isAccessoryMuscle(exo.muscle_primary)
    ? { min: Math.max(r.min, ISO_MIN), max: Math.max(r.max, ISO_MAX), rest: r.rest }
    : r;
  return correctForExercise(base, exo.id);
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
