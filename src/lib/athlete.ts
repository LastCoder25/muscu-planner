// athlete.ts — barèmes d'XP par séance. Le calcul de NIVEAU est unifié dans
// src/lib/levels.ts (computeLevel). Ici : combien rapporte une séance.
// Pur/testable, aucune dépendance Vue.
import type { SessionLog, Session, DrillLog, CardioLog, CardioActivity } from './types';

// Poids d'une activité cardio : la marche vaut nettement moins que la course
// (à distance/durée égale). Le dénivelé et le ressenti restent à plein (effort réel).
const ACTIVITY_XP_FACTOR: Record<CardioActivity, number> = {
  course: 1,
  trail: 1,
  course_tapis: 1,
  velo: 0.7,
  velo_appart: 0.6,
  rando: 0.55,
  marche: 0.4,
  marche_tapis: 0.4,
};

// Valeur d'une répétition (partagée séance ↔ challenge → parité). Réglable.
export const REP_XP = 0.2;
// Valeur d'une minute de séance muscu (la DURÉE porte l'essentiel de l'XP,
// pour que « durée seule » reste gratifiant ; reps/tonnage = petit bonus détail).
export const MUSCU_MIN_XP = 3;

/** XP d'une séance de muscu : durée (base, même sans détail) + reps + charge (bonus). */
export function sessionXp(log: SessionLog): number {
  let reps = 0;
  let tonnage = 0;
  for (const ex of log.exercises ?? []) {
    for (const s of ex.performed ?? []) {
      reps += s.reps || 0;
      tonnage += (s.load_kg || 0) * (s.reps || 0);
    }
  }
  const dur = log.duration_min ?? 0;
  return Math.round(dur * MUSCU_MIN_XP + reps * REP_XP + tonnage / 500);
}

/** XP d'une séance de tennis : présence + durée + drills réalisés + intensité. */
export function drillSessionXp(log: DrillLog): number {
  const done = (log.drills ?? []).filter((d) => d.done).length;
  const minutes = log.duration_min ?? 0;
  const intensity = (log.global_difficulty ?? 2) * 10;
  return Math.round(40 + minutes + done * 8 + intensity);
}

/** XP d'une sortie cardio : durée + distance (pondérées par l'activité — marche <
 *  vélo < course) + dénivelé (D+ ET D-, même poids, la descente sollicite d'autres
 *  muscles) + intensité (ressenti). Présence, dénivelé et ressenti restent à plein. */
export function cardioSessionXp(log: CardioLog): number {
  const km = log.distance_km ?? 0;
  const dplus = log.elevation_m ?? 0;
  const dminus = log.descent_m ?? 0;
  const dur = log.duration_min ?? 0;
  const factor = ACTIVITY_XP_FACTOR[log.activity] ?? 1;
  return Math.round((km * 10 + dur * 1.5) * factor + (dplus + dminus) / 10);
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
  return Math.round(reps * REP_XP + tonnage / 500);
}
