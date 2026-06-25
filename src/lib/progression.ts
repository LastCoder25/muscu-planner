// progression.ts — moteur déterministe (le « sans IA ».)
// Entrée : le plan + le dernier bilan (+ historique pour les déloads) + level_config.
// Sortie : une nouvelle session, mêmes types qu'une séance générée par IA.
import type {
  Session, SessionLog, PlannedExercise, LevelConfig, Progression, ExerciseTarget,
} from './types';

const COMPOUND_INC = 2.5;   // kg, exos polyarticulaires
const ISOLATION_INC = 1.25; // kg, exos d'isolation
const ISOLATION_HINTS = ['biceps', 'triceps', 'épaule', 'deltoïde', 'mollet', 'avant-bras'];

function incrementFor(ex: PlannedExercise): number {
  const m = (ex.muscle_primary || '').toLowerCase();
  return ISOLATION_HINTS.some((h) => m.includes(h)) ? ISOLATION_INC : COMPOUND_INC;
}

function round(n: number, step = 0.25): number {
  return Math.round(n / step) * step;
}

function applyLoad(t: ExerciseTarget, fn: (l: number) => number): void {
  if (typeof t.load_kg === 'number') t.load_kg = Math.max(0, fn(t.load_kg));
  else if (typeof t.added_kg === 'number') t.added_kg = Math.max(0, fn(t.added_kg));
}

/**
 * Applique les règles de progression par exo et renvoie la prochaine séance.
 * `history` (logs antérieurs) sert uniquement à détecter les échecs répétés.
 */
export function nextSessionDeterministic(
  plan: Session,
  lastLog: SessionLog,
  cfg: LevelConfig,
  history: SessionLog[] = [],
): Session {
  const next: Session = structuredClone(plan);
  next.id = crypto.randomUUID();
  next.source = 'engine';
  next.created_at = new Date().toISOString();

  for (const ex of next.exercises) {
    const logged = lastLog.exercises.find((e) => e.id === ex.id || e.swapped_from === ex.id);
    if (!logged || logged.performed.length === 0) continue;

    const scheme: Progression = ex.progression || cfg.default_progression;
    if (scheme === 'fixed') continue;

    const t = ex.target;
    const sets = logged.performed;
    const meanDiff = sets.reduce((a, s) => a + s.difficulty, 0) / sets.length;
    const inc = incrementFor(ex);

    const failedBelowMin = sets.some((s) => s.reps < t.reps_min);
    const allHitMax = sets.every((s) => s.reps >= t.reps_max);
    const allHitMin = sets.every((s) => s.reps >= t.reps_min);

    // échec sous le minimum, deux séances de suite ?
    const prev = history
      .find((h) => h.id !== lastLog.id)
      ?.exercises.find((e) => e.id === ex.id || e.swapped_from === ex.id);
    const failedTwice = failedBelowMin && !!prev && prev.performed.some((s) => s.reps < t.reps_min);

    if (scheme === 'linear') {
      if (failedTwice) applyLoad(t, (l) => round(l * 0.9));        // deload −10 %
      else if (allHitMin) applyLoad(t, (l) => round(l + inc));     // +charge
      continue;
    }

    // double / rir (autorégulation via la note 1–4)
    if (allHitMax && meanDiff <= 2) {
      applyLoad(t, (l) => round(l + inc));   // +charge (on repart bas de fourchette à l'exécution)
    } else if (failedTwice) {
      applyLoad(t, (l) => round(l * 0.95));  // deload léger −5 %
    }
    // sinon : charge maintenue, la progression se fait en répétitions
  }

  return next;
}
