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
 * Durée estimée d'une séance (minutes) : pour chaque série, temps de repos
 * + temps d'exécution. Exécution ≈ secondes pour le gainage (`unit:'time'`),
 * sinon ~3 s/rep (plancher 30 s). Compte les séries réelles (prescription si
 * présente, sinon `target.sets`). Inclut donc bien l'exécution, pas que les pauses.
 */
export function estimateDurationMin(session: Session): number {
  let sec = 0;
  for (const ex of session.exercises) {
    const nSets = ex.prescription?.length || ex.target.sets || 0;
    const rest = ex.rest_seconds ?? 90;
    const isTime = ex.target.unit === 'time';
    const repsAvg = ((ex.target.reps_min ?? 0) + (ex.target.reps_max ?? 0)) / 2 || 10;
    const exec = isTime ? repsAvg : Math.max(30, repsAvg * 3);
    sec += nSets * (rest + exec);
  }
  return Math.max(1, Math.round(sec / 60));
}
