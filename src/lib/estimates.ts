// estimates.ts — estimation de force (1RM) à partir des séries réalisées.
// Pur (aucune dépendance Vue/Supabase). Consommé par le Bilan (Étape 4.1)
// et l'affichage de tendances. Formule d'Epley.
import type { PerformedSet, Session } from './types';

function round(n: number, step = 0.25): number {
  return Math.round(n / step) * step;
}

/** 1RM estimé (Epley) : load * (1 + reps/30). reps<=0 → 0 ; reps===1 → load. */
export function estimate1RM(loadKg: number, reps: number): number {
  if (loadKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return round(loadKg);
  return round(loadKg * (1 + reps / 30));
}

/** Meilleur 1RM estimé parmi les séries réalisées (ignore les séries sans charge). */
export function bestE1RM(performed: PerformedSet[]): number {
  let best = 0;
  for (const s of performed) {
    const e = estimate1RM(s.load_kg, s.reps);
    if (e > best) best = e;
  }
  return best;
}

/**
 * Durée estimée d'une séance (minutes). Pour chaque série : repos + exécution
 * (≈ secondes pour le gainage `unit:'time'`, sinon ~4 s/rep, plancher 30 s).
 * + ~1 min de mise en place par exercice (installation / réglage de la charge)
 * + ~5 min d'échauffement général. Compte les séries réelles (prescription si
 * présente). Bien plus réaliste qu'un simple cumul des pauses.
 */
const WARMUP_SEC = 5 * 60;
const SETUP_PER_EXERCISE_SEC = 60;

export function estimateDurationMin(session: Session): number {
  if (session.exercises.length === 0) return 1;
  let sec = WARMUP_SEC;
  for (const ex of session.exercises) {
    const exRest = ex.rest_seconds ?? 90;
    const isTime = ex.target.unit === 'time';
    const repsAvg = ((ex.target.reps_min ?? 0) + (ex.target.reps_max ?? 0)) / 2 || 10;
    const exec = isTime ? repsAvg : Math.max(30, repsAvg * 4);
    const sides = ex.unilateral ? 2 : 1; // unilatéral : exécution des deux côtés
    sec += SETUP_PER_EXERCISE_SEC;
    if (ex.prescription?.length) {
      // Repos propre à chaque série (pyramide importée : repos croissant).
      for (const p of ex.prescription) sec += (p.rest_seconds ?? exRest) + exec * sides;
    } else {
      sec += (ex.target.sets || 0) * (exRest + exec * sides);
    }
  }
  return Math.max(1, Math.round(sec / 60));
}
