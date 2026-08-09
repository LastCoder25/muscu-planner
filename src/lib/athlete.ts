// athlete.ts — barèmes d'XP par séance. Le calcul de NIVEAU est unifié dans
// src/lib/levels.ts (computeLevel). Ici : combien rapporte une séance.
// Pur/testable, aucune dépendance Vue.
import type { SessionLog, Session, DrillLog, CardioLog } from './types';
import { activityIntensity, sportIntensity } from './statSignature';

// Le poids d'une activité cardio n'est PLUS un facteur arbitraire : il dérive de
// son INTENSITÉ (somme du vecteur de bénéfices, adossée au MET), normalisée par
// la course (intensité 100 → facteur 1). Cf. statSignature.ts. Marche 50→0.50,
// vélo 75→0.75, etc. → magnitudes préservées, ratios justifiés.

// Multiplicateur GLOBAL d'XP : accélère la progression (niveaux + énergie) pour
// tous. Appliqué à la SOURCE de chaque XP → niveaux, énergie et stats scalent
// ensemble, donc les stats-par-niveau (et l'équilibrage des monstres) restent
// identiques ; seule la vitesse de progression dans le temps change. Réglable.
export const XP_MULT = 2;
// Valeur d'une répétition (partagée séance ↔ challenge → parité). Réglable.
export const REP_XP = 0.2;
// Facteur d'assistance (poids du corps) : une rep ASSISTÉE (élastique/machine)
// vaut moins qu'une rep STRICTE → passer en strict = progression récompensée.
export const ASSIST_MULT = 0.6;
export function assistMult(assisted?: boolean | null): number {
  return assisted ? ASSIST_MULT : 1;
}
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
  return Math.round((dur * MUSCU_MIN_XP + reps * REP_XP + tonnage / 500) * XP_MULT);
}

/** XP d'une séance de tennis : présence + durée + drills réalisés + intensité. */
export function drillSessionXp(log: DrillLog): number {
  const done = (log.drills ?? []).filter((d) => d.done).length;
  const minutes = log.duration_min ?? 0;
  const intensity = (log.global_difficulty ?? 2) * 10;
  return Math.round((40 + minutes + done * 8 + intensity) * XP_MULT);
}

/** XP d'une sortie cardio : durée + distance (pondérées par l'activité — marche <
 *  vélo < course) + dénivelé (D+ ET D-, même poids, la descente sollicite d'autres
 *  muscles) + intensité (ressenti). Présence, dénivelé et ressenti restent à plein. */
export function cardioSessionXp(log: CardioLog): number {
  // Distance : à défaut de km saisis, on estime depuis les pas (~0,75 m/pas) →
  // une marche saisie en PAS rapporte quand même de l'XP.
  const km = log.distance_km ?? (log.steps ? log.steps * 0.00075 : 0);
  const dplus = log.elevation_m ?? 0;
  const dminus = log.descent_m ?? 0;
  const dur = log.duration_min ?? 0;
  const factor = activityIntensity(log.activity) / 100;
  // Charge portée (veste/sac lesté) : chaque kg = +3 % d'effort (plafonné +60 %)
  // → on valorise le poids sur l'activité (rucking).
  const loadMult = 1 + Math.min(20, Math.max(0, log.load_kg ?? 0)) * 0.03;
  // Dosage DOMINÉ PAR LA DURÉE (min×3 > km×2) : pro-endurance-fondamentale. Le
  // temps en zone est la vraie monnaie de la progression aérobie → une longue
  // sortie facile rapporte PLUS qu'une courte sortie rapide (on ne récompense
  // JAMAIS la vitesse, qui pousserait à sortir de la zone EF). La distance reste
  // un petit bonus ; le dénivelé (D+ ET D-) compte à plein.
  return Math.round((((km * 2 + dur * 3) * factor + (dplus + dminus) / 10) * loadMult) * XP_MULT);
}

/** XP d'un « autre sport » (log durée seule) : INTENSITÉ-scalé par le sport
 *  (course = 100 → dur×MUSCU_MIN_XP ; tennis 70 → ×0.7 ; yoga 30 → ×0.3…). Corrige
 *  l'ancien barème plat (toute activité = même XP/min quel que soit l'effort). */
export function otherSportXp(durationMin: number, sportName?: string | null): number {
  const dur = durationMin || 0;
  return Math.round(dur * MUSCU_MIN_XP * (sportIntensity(sportName) / 100) * XP_MULT);
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
  return Math.round((reps * REP_XP + tonnage / 500) * XP_MULT);
}
