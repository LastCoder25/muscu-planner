// tennisTraining.ts — ENTRAÎNEMENT TENNIS en solo : challenges tennis (pur/testable).
// Exos faisables SEUL, avec ou sans matériel ; XP versée à la piste Tennis ; challenges
// tennis dans une 3ᵉ voie de jetons. (Le Défi 360 Tennis a été retiré en v0.846.)
//
// ⚠️ UN EXO TENNIS SE RECONNAÎT À SES DONNÉES, PAS À SON ID : catégorie `prepa_physique`
// + tag `tennis`. Ajouter un exo ne demande qu'une ligne en base.
import { isCardioTrackChallenge } from '@/data/cardio';
import type { Challenge } from './challenges';

type Tagged = { category?: string | null; tags?: readonly string[] | null };

/** Exo d'entraînement tennis (bibliothèque prépa physique, tag `tennis`). */
export function isTennisExercise(e: Tagged): boolean {
  return e.category === 'prepa_physique' && !!e.tags?.includes('tennis');
}

// ── Trois voies de jetons pour les challenges ───────────────────────────────────

export type ChallengeLane = 'muscu' | 'cardio' | 'tennis';

/** Voie d'un challenge. ⚠️ Le cardio passe en premier : une sortie reste une sortie. */
export function challengeLane(
  c: Pick<Challenge, 'unit' | 'exercise_id'> & { config?: Pick<Challenge['config'], 'discipline'> },
): ChallengeLane {
  if (isCardioTrackChallenge(c)) return 'cardio';
  return c.config?.discipline === 'tennis' ? 'tennis' : 'muscu';
}

/** Voie d'un exo qu'on s'apprête à mettre en challenge (sans ligne en base). */
export function exerciseLane(e: Tagged & { id: string }, cardio: boolean): ChallengeLane {
  if (cardio) return 'cardio';
  return isTennisExercise(e) ? 'tennis' : 'muscu';
}
