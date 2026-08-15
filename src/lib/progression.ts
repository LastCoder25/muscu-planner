// progression.ts — moteur déterministe (le « sans IA ».)
// Entrée : le plan + le dernier bilan (+ historique pour les déloads) + level_config.
// Sortie : une nouvelle session, mêmes types qu'une séance générée par IA.
import type {
  Session,
  SessionLog,
  PlannedExercise,
  LoggedExercise,
  LevelConfig,
  Progression,
  ExerciseTarget,
} from './types';

const COMPOUND_INC = 2.5; // kg, exos polyarticulaires
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

/** Options du moteur : cadence de décharge (deload) planifiée. */
export interface ProgressionOpts {
  /** Nb de séances muscu déjà réalisées (lastLog inclus) → sert au comptage deload. */
  muscuSessionCount?: number;
  /** Une séance sur `deloadEvery` est une décharge (défaut : désactivé si absent). */
  deloadEvery?: number;
}

/** Charge de travail max d'un exo loggé (kg). */
function topLoad(le: LoggedExercise): number {
  return le.performed.reduce((m, s) => Math.max(m, s.load_kg || 0), 0);
}
/** Meilleures reps d'un exo loggé. */
function topReps(le: LoggedExercise): number {
  return le.performed.reduce((m, s) => Math.max(m, s.reps || 0), 0);
}

/** Instances récentes d'un exo (la plus récente d'abord), lastLog inclus, dédupliquées. */
function recentInstances(
  ex: PlannedExercise,
  lastLog: SessionLog,
  history: SessionLog[],
): LoggedExercise[] {
  const logs = [lastLog, ...history.filter((h) => h.id !== lastLog.id)];
  const seen = new Set<string>();
  const out: LoggedExercise[] = [];
  for (const l of logs) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    const le = l.exercises.find((e) => e.id === ex.id || e.swapped_from === ex.id);
    if (le && le.performed.length) out.push(le);
  }
  return out;
}

const DELOAD_LOAD_MULT = 0.9; // −10 % de charge en semaine de décharge
const DELOAD_MARK = ' · Décharge';

/**
 * Applique les règles de progression par exo et renvoie la prochaine séance.
 * `history` (logs antérieurs, lastLog inclus, plus récent d'abord) sert à détecter les
 * plateaux sur PLUSIEURS séances. `opts` pilote la décharge planifiée.
 *
 * Détection de plateau (au-delà de l'échec 1-séance historique) :
 *  - échec sous le minimum sur ≥2 des 3 dernières séances → deload ;
 *  - STAGNATION : charge de travail identique ET meilleures reps qui ne progressent
 *    pas sur 3 séances, sans jamais atteindre reps_max → deload pour casser le palier.
 *
 * Décharge planifiée : si `opts.muscuSessionCount` est fourni et que la prochaine
 * séance tombe sur un multiple de `deloadEvery`, toute la séance est allégée
 * (−10 % de charge, −1 série/exo) et marquée « · Décharge ».
 */
export function nextSessionDeterministic(
  plan: Session,
  lastLog: SessionLog,
  cfg: LevelConfig,
  history: SessionLog[] = [],
  opts: ProgressionOpts = {},
): Session {
  // Clone JSON (la Session est de la donnée pure) : robuste face à un proxy
  // réactif Vue, que structuredClone refuse (« could not be cloned »).
  const next: Session = JSON.parse(JSON.stringify(plan));
  next.id = crypto.randomUUID();
  next.source = 'engine';
  next.created_at = new Date().toISOString();

  // Semaine de DÉCHARGE planifiée : allège toute la séance et court-circuite la
  // progression normale (récupération = supercompensation).
  const every = opts.deloadEvery ?? 0;
  const isDeload =
    typeof opts.muscuSessionCount === 'number' &&
    every > 0 &&
    (opts.muscuSessionCount + 1) % every === 0;
  if (isDeload) {
    for (const ex of next.exercises) {
      if ((ex.progression || cfg.default_progression) === 'fixed') continue;
      applyLoad(ex.target, (l) => round(l * DELOAD_LOAD_MULT));
      if (typeof ex.target.sets === 'number' && ex.target.sets > 1) ex.target.sets -= 1;
    }
    if (!next.name.includes(DELOAD_MARK)) next.name += DELOAD_MARK;
    return next;
  }

  for (const ex of next.exercises) {
    const logged = lastLog.exercises.find((e) => e.id === ex.id || e.swapped_from === ex.id);
    if (!logged || logged.performed.length === 0) continue;

    const scheme: Progression = ex.progression || cfg.default_progression;
    if (scheme === 'fixed') continue;

    const t = ex.target;
    const sets = logged.performed;
    const meanDiff = sets.reduce((a, s) => a + s.difficulty, 0) / sets.length;
    const inc = incrementFor(ex);

    const allHitMax = sets.every((s) => s.reps >= t.reps_max);
    const allHitMin = sets.every((s) => s.reps >= t.reps_min);

    // Fenêtre des 3 dernières séances de cet exo (lastLog en tête).
    const window = recentInstances(ex, lastLog, history).slice(0, 3);
    // Plateau 1 : échec sous le minimum sur ≥2 des 3 dernières séances.
    const failCount = window.filter((le) => le.performed.some((s) => s.reps < t.reps_min)).length;
    const failing = failCount >= 2;
    // Plateau 2 : stagnation — charge de travail identique ET meilleures reps qui ne
    // progressent pas sur 3 séances (et on n'atteint pas reps_max) → on est coincé.
    const loads = window.map(topLoad);
    const sameLoad = window.length >= 3 && loads.every((l) => Math.abs(l - loads[0]!) < 0.01);
    // « reps plates » = amplitude ≤ 1 rep sur les 3 séances (vraie stagnation, pas la
    // variance d'un mauvais jour ni une vraie progression en reps).
    const reps = window.map(topReps);
    const repsFlat = reps.length >= 3 && Math.max(...reps) - Math.min(...reps) <= 1;
    const stalled = sameLoad && repsFlat && !allHitMax;

    if (scheme === 'linear') {
      if (failing || stalled)
        applyLoad(t, (l) => round(l * 0.9)); // deload −10 %
      else if (allHitMin) applyLoad(t, (l) => round(l + inc)); // +charge
      continue;
    }

    // double / rir (autorégulation via la note 1–4)
    if (allHitMax && meanDiff <= 2) {
      applyLoad(t, (l) => round(l + inc)); // +charge (on repart bas de fourchette à l'exécution)
    } else if (failing || stalled) {
      applyLoad(t, (l) => round(l * 0.95)); // deload léger −5 %
    }
    // sinon : charge maintenue, la progression se fait en répétitions
  }

  return next;
}
