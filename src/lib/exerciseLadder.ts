// exerciseLadder.ts — ÉCHELLES DE DIFFICULTÉ des exos au temps déclinés par levier (migr. 0121).
// Pur (aucune dépendance Vue/Supabase).
//
// Une échelle = les versions d'un même mouvement rangées de la plus facile à la plus dure. Elle
// ne change RIEN au comptage (une tenue reste des secondes, sans muscle secondaire, sans XP de
// plus) : elle sert à dire au sportif où il en est et quel cran essayer ensuite.
//
// ⚠️ Ordre INDICATIF : la difficulté réelle dépend du gabarit (les mains en avant pèsent plus sur
// une personne aux bras longs). Un cran d'écart se traite à 20-30 s, pas à la durée du cran d'avant.

export interface LadderRung {
  id: string;
  /** Libellé court pour une pastille. */
  label: string;
}

export const EXERCISE_LADDERS: readonly (readonly LadderRung[])[] = [
  // Planche de face : de plus en plus de levier.
  [
    { id: 'ex_plank_knees', label: 'Genoux' },
    { id: 'ex_plank_high', label: 'Mains' },
    { id: 'ex_plank', label: 'Coudes' },
    { id: 'ex_plank_feet', label: 'Pieds hauts' },
    { id: 'ex_plank_long', label: 'Coudes avancés' },
    { id: 'ex_plank_high_long', label: 'Mains avancées' },
  ],
  // Planche latérale : sur l'avant-bras, puis sur la main.
  [
    { id: 'ex_plank_side', label: 'Coude' },
    { id: 'ex_plank_side_hand', label: 'Main' },
  ],
];

/** Durée tenue (s) à partir de laquelle on propose le cran suivant. */
export const LADDER_UP_SECS = 60;
/** Durée (s) en dessous de laquelle on propose le cran précédent. */
export const LADDER_DOWN_SECS = 20;
/** Durée d'attaque conseillée sur un cran neuf (s). */
export const LADDER_START_SECS = 20;

export interface LadderPosition {
  rungs: readonly LadderRung[];
  /** Index du cran courant. */
  at: number;
  prev: LadderRung | null;
  next: LadderRung | null;
}

/** Où se situe cet exo sur son échelle (null : il n'en a pas). */
export function ladderPosition(exerciseId: string | null | undefined): LadderPosition | null {
  if (!exerciseId) return null;
  for (const rungs of EXERCISE_LADDERS) {
    const at = rungs.findIndex((r) => r.id === exerciseId);
    if (at >= 0) return { rungs, at, prev: rungs[at - 1] ?? null, next: rungs[at + 1] ?? null };
  }
  return null;
}

export type LadderAdvice =
  | { kind: 'up'; to: LadderRung; best: number }
  | { kind: 'down'; to: LadderRung; best: number };

/** Le conseil d'après le MEILLEUR temps tenu sur cet exo : ≥ 60 s → cran suivant, < 20 s → cran
 *  précédent, sinon rien (on reste). Sans temps tenu (0 ou inconnu), pas de conseil. */
export function ladderAdvice(
  exerciseId: string | null | undefined,
  bestSecs: number | null | undefined,
): LadderAdvice | null {
  const pos = ladderPosition(exerciseId);
  const best = Math.round(bestSecs ?? 0);
  if (!pos || best <= 0) return null;
  if (best >= LADDER_UP_SECS && pos.next) return { kind: 'up', to: pos.next, best };
  if (best < LADDER_DOWN_SECS && pos.prev) return { kind: 'down', to: pos.prev, best };
  return null;
}
