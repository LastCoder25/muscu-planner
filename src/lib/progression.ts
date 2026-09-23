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

/** La charge de travail d'une cible — kg, ou lest pour un exercice au poids du corps.
 *  ⚠️ Écrite TROIS fois avant cette revue, dont DEUX dans la seule branche de décharge
 *  (avant et après mutation). Et ce diff venait justement d'en supprimer le jumeau de
 *  `BilanPage`. Une notion, un endroit — mais PRIVÉE : les trois copies vivaient toutes
 *  dans ce fichier, donc l'exporter n'élargissait la surface publique pour personne.
 *  `npm run dead` l'a dit dans la foulée. */
function loadOf(t: ExerciseTarget): number {
  return t.load_kg ?? t.added_kg ?? 0;
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

/** Ce que le moteur a DÉCIDÉ pour un exercice, et pourquoi. */
export type ProgressionKind =
  | 'up' // objectif tenu → on monte la charge
  | 'hold' // on maintient : la progression se fait en répétitions
  | 'plateau_fail' // échec sous le minimum sur ≥2 des 3 dernières séances
  | 'plateau_stall' // stagnation : même charge, reps plates, sans atteindre le haut
  | 'deload_planned' // semaine de décharge programmée
  | 'none'; // rien à décider (pas de données, ou progression figée)

export interface ExerciseVerdict {
  kind: ProgressionKind;
  loadFrom: number;
  loadTo: number; // égal à loadFrom quand la charge ne bouge pas
  /** Séances de cet exercice réellement observées (≤ 3) — dit la confiance du verdict. */
  window: number;
}

/**
 * Comment DIRE un verdict. ⚠️ En lib et non dans l'écran : le Bilan reconstruisait le
 * delta en comparant l'avant et l'après, et devinait la décharge en cherchant « Décharge »
 * dans le NOM de la séance — deux déductions là où le moteur avait déjà la réponse.
 *
 * `tone` : 'up' (on monte) · 'warn' (plateau — c'est l'information qui manquait) ·
 * 'down' (décharge programmée, qui n'est pas un échec) · 'same' (rien à signaler).
 *
 * ⚠️ NE DÉLÈGUE PAS à `deltaLabel` (sessionCompare), qui formate pourtant le même « +X kg »
 * sur le MÊME écran — et c'est délibéré : `round()` travaille ici au pas de 0,25 kg, donc
 * un delta vaut 0,25 / 0,75 / −4,75… que l'arrondi au dixième de `deltaLabel` afficherait
 * « −4,8 kg ». Une charge réelle ne doit pas être arrondie pour ressembler à un tonnage.
 * Même refus motivé que les trois copies d'`offensePerRound` : elles se ressemblent, elles
 * ne font pas la même chose.
 */
export function verdictLabel(v: ExerciseVerdict): { text: string; tone: string } {
  const d = Math.round((v.loadTo - v.loadFrom) * 100) / 100;
  const kg = `${d > 0 ? '+' : ''}${d} kg`;
  switch (v.kind) {
    case 'up':
      return { text: kg, tone: 'up' };
    case 'plateau_fail':
      return { text: `${kg} · sous l'objectif sur ${v.window} séances`, tone: 'warn' };
    case 'plateau_stall':
      return { text: `${kg} · ${v.window} séances au même point`, tone: 'warn' };
    case 'deload_planned':
      return { text: `${kg} · décharge programmée`, tone: 'down' };
    case 'hold':
      return { text: 'maintenu · progresse en répétitions', tone: 'same' };
    default:
      return { text: 'maintenu', tone: 'same' };
  }
}

/**
 * LA DÉCISION, pour UN exercice. Extraite de `nextSessionDeterministic` pour deux
 * raisons, et c'est le même besoin vu par deux bouts :
 *
 * 1. Le moteur SAIT dire « tu tournes en rond depuis 3 séances » et ne le disait jamais :
 *    le verdict était calculé, utilisé pour baisser la charge, puis JETÉ. Ce qui sortait,
 *    c'était un plan à 47,5 kg au lieu de 50, sans un mot.
 * 2. `nextSessionDeterministic` exige un `plan: Session`, donc elle ne vit que dans le
 *    circuit séance générée → bilan → séance suivante. Le Défi 360 et la séance libre,
 *    eux, n'ont pas de plan : ils ne POUVAIENT pas l'appeler, et se contentaient de
 *    reprendre la dernière série. Double progression, détection de plateau et décharge
 *    ne s'appliquaient donc jamais à la façon dont on s'entraîne réellement.
 *
 * ⚠️ ET CE SECOND USAGE N'EST PAS ENCORE ACQUIS — l'extraction a été faite à la frontière
 * de l'appelant ACTUEL, pas du concept. Une séance libre construit `planned: {sets: 0,
 * reps_min: 0, reps_max: 0}` (`live.addExercise`), donc `allHitMin`/`allHitMax` y sont
 * trivialement vrais et le verdict serait « up » à CHAQUE série. La servir demande une
 * fourchette de reps dérivée — `repRangeFor` (repScheme.ts) existe pour ça. À faire.
 *
 * ⚠️ UNE SEULE RÈGLE : `nextSessionDeterministic` l'appelle désormais au lieu de refaire
 * le calcul. Deux implémentations auraient fini par rendre deux verdicts sur la même
 * série — le défaut que ce projet documente à répétition.
 *
 * `instances` = les dernières séances de CET exercice, la plus récente en tête (la
 * première fait foi pour les répétitions réalisées ; les 3 premières servent au plateau).
 */
export function exerciseProgression(input: {
  target: ExerciseTarget;
  scheme: Progression;
  increment: number;
  instances: LoggedExercise[];
}): ExerciseVerdict {
  const { target: t, scheme, increment: inc, instances } = input;
  const from = loadOf(t);
  // Fenêtre des 3 dernières séances de cet exercice — déclarée AVANT la fabrique : sinon
  // celle-ci doit réécrire sa taille en `Math.min(instances.length, 3)`, soit la MÊME
  // quantité exprimée de deux façons, ce qui finit toujours par diverger.
  const window = instances.slice(0, 3);
  /** UNE fabrique de verdict : sans `to`, la charge ne bouge pas. ⚠️ On n'arrondit PAS
   *  `from` (une charge saisie à la main peut ne pas tomber sur le pas de 0,25), sinon le
   *  test `loadTo !== loadFrom` de `planNextSession` déclencherait une écriture inutile. */
  const mk = (kind: ProgressionKind, to?: number): ExerciseVerdict => ({
    kind,
    loadFrom: from,
    loadTo: to === undefined ? from : round(to),
    window: window.length,
  });

  const last = instances[0];
  if (!last || last.performed.length === 0) return mk('none');
  if (scheme === 'fixed') return mk('none');

  const sets = last.performed;
  const meanDiff = sets.reduce((a, s) => a + s.difficulty, 0) / sets.length;
  const allHitMax = sets.every((s) => s.reps >= t.reps_max);
  const allHitMin = sets.every((s) => s.reps >= t.reps_min);

  // Plateau 1 : échec sous le minimum sur ≥2 des 3 dernières séances.
  const failing = window.filter((le) => le.performed.some((s) => s.reps < t.reps_min)).length >= 2;
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
    if (failing) return mk('plateau_fail', from * 0.9);
    if (stalled) return mk('plateau_stall', from * 0.9);
    if (allHitMin) return mk('up', from + inc);
    return mk('hold');
  }

  // double / rir (autorégulation via la note 1–4)
  if (allHitMax && meanDiff <= 2) return mk('up', from + inc);
  if (failing) return mk('plateau_fail', from * 0.95);
  if (stalled) return mk('plateau_stall', from * 0.95);
  // sinon : charge maintenue, la progression se fait en répétitions
  return mk('hold');
}

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
  return planNextSession(plan, lastLog, cfg, history, opts).session;
}

/** Le verdict d'un exercice, avec de quoi le nommer à l'écran. */
export interface NamedVerdict {
  id: string;
  name: string;
  verdict: ExerciseVerdict;
}

/** La séance suivante, ET le POURQUOI de chaque charge. */
export interface ProgressionPlan {
  session: Session;
  verdicts: NamedVerdict[];
}

/**
 * Même moteur que `nextSessionDeterministic`, mais qui rend AUSSI ce qu'il a décidé,
 * exercice par exercice. ⚠️ Les deux ne peuvent pas diverger : `nextSessionDeterministic`
 * n'est plus qu'une lecture de celle-ci.
 */
export function planNextSession(
  plan: Session,
  lastLog: SessionLog,
  cfg: LevelConfig,
  history: SessionLog[] = [],
  opts: ProgressionOpts = {},
): ProgressionPlan {
  // Clone JSON (la Session est de la donnée pure) : robuste face à un proxy
  // réactif Vue, que structuredClone refuse (« could not be cloned »).
  const next: Session = JSON.parse(JSON.stringify(plan));
  next.id = crypto.randomUUID();
  next.source = 'engine';
  next.created_at = new Date().toISOString();
  const verdicts: NamedVerdict[] = [];

  // Semaine de DÉCHARGE planifiée : allège toute la séance et court-circuite la
  // progression normale (récupération = supercompensation).
  const every = opts.deloadEvery ?? 0;
  const isDeload =
    typeof opts.muscuSessionCount === 'number' &&
    every > 0 &&
    (opts.muscuSessionCount + 1) % every === 0;
  if (isDeload) {
    for (const ex of next.exercises) {
      const figee = (ex.progression || cfg.default_progression) === 'fixed';
      const from = ex.target.load_kg ?? ex.target.added_kg ?? 0;
      if (!figee) {
        applyLoad(ex.target, (l) => round(l * DELOAD_LOAD_MULT));
        if (typeof ex.target.sets === 'number' && ex.target.sets > 1) ex.target.sets -= 1;
      }
      verdicts.push({
        id: ex.id,
        name: ex.name,
        verdict: {
          kind: figee ? 'none' : 'deload_planned',
          loadFrom: from,
          loadTo: ex.target.load_kg ?? ex.target.added_kg ?? 0,
          window: 0,
        },
      });
    }
    if (!next.name.includes(DELOAD_MARK)) next.name += DELOAD_MARK;
    return { session: next, verdicts };
  }

  for (const ex of next.exercises) {
    // ⚠️ La décision vit dans `exerciseProgression` — ici on ne fait que l'APPLIQUER.
    // La dupliquer rendrait deux verdicts possibles sur la même série.
    const v = exerciseProgression({
      target: ex.target,
      scheme: ex.progression || cfg.default_progression,
      increment: incrementFor(ex),
      instances: recentInstances(ex, lastLog, history),
    });
    verdicts.push({ id: ex.id, name: ex.name, verdict: v });
    if (v.loadTo !== v.loadFrom) applyLoad(ex.target, () => v.loadTo);
  }

  return { session: next, verdicts };
}
