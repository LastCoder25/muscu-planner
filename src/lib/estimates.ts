// estimates.ts — estimation de force (1RM) à partir des séries réalisées.
// Pur (aucune dépendance Vue/Supabase). Consommé par le Bilan (Étape 4.1)
// et l'affichage de tendances. Formule d'Epley.
import type { PerformedSet } from './types';

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
