// athlete.ts — barèmes d'XP par séance. Le calcul de NIVEAU est unifié dans
// src/lib/levels.ts (computeLevel). Ici : combien rapporte une séance.
// Pur/testable, aucune dépendance Vue.
import type { SessionLog, Session, DrillLog, CardioLog } from './types';

/** XP d'une séance de muscu : présence + volume (reps) + charge + intensité (note 1–4). */
export function sessionXp(log: SessionLog): number {
  let reps = 0;
  let tonnage = 0;
  for (const ex of log.exercises ?? []) {
    for (const s of ex.performed ?? []) {
      reps += s.reps || 0;
      tonnage += (s.load_kg || 0) * (s.reps || 0);
    }
  }
  const intensity = (log.global_difficulty ?? 2) * 10; // 10 … 40
  return Math.round(50 + reps + tonnage / 100 + intensity);
}

/** XP d'une séance de tennis : présence + durée + drills réalisés + intensité. */
export function drillSessionXp(log: DrillLog): number {
  const done = (log.drills ?? []).filter((d) => d.done).length;
  const minutes = log.duration_min ?? 0;
  const intensity = (log.global_difficulty ?? 2) * 10;
  return Math.round(40 + minutes + done * 8 + intensity);
}

/** XP d'une sortie cardio : durée + distance + dénivelé (D+ ET D-, même poids —
 *  la descente sollicite d'autres muscles) + intensité (ressenti). */
export function cardioSessionXp(log: CardioLog): number {
  const km = log.distance_km ?? 0;
  const dplus = log.elevation_m ?? 0;
  const dminus = log.descent_m ?? 0;
  const dur = log.duration_min ?? 0;
  const intensity = (log.rpe ?? 2) * 10;
  return Math.round(40 + km * 10 + dur * 1.5 + (dplus + dminus) / 10 + intensity);
}

/** Estimation d'XP d'une séance PRÉVUE (avant de la faire) : même barème que
 *  `sessionXp` mais sur les objectifs planifiés (note d'effort supposée = 2). */
export function estimateSessionXp(session: Session): number {
  let reps = 0;
  let tonnage = 0;
  for (const ex of session.exercises ?? []) {
    if (ex.prescription?.length) {
      for (const p of ex.prescription) {
        reps += p.reps || 0;
        tonnage += (p.load_kg || 0) * (p.reps || 0);
      }
    } else {
      const t = ex.target;
      const avgReps = Math.round(((t.reps_min || 0) + (t.reps_max || 0)) / 2);
      const sets = t.sets || 0;
      reps += sets * avgReps;
      tonnage += sets * avgReps * (t.load_kg || 0);
    }
  }
  return Math.round(50 + reps + tonnage / 100 + 20);
}
