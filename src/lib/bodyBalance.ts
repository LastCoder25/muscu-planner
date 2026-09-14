// bodyBalance.ts — ÉQUILIBRE DU CORPS : chaque groupe musculaire est-il travaillé à
// hauteur de SA cible ? (pur/testable, `today` passé par l'appelant)
//
// La question n'est pas « où en est mon Défi 360 » mais « mon corps est-il couvert » —
// toutes sources confondues (séances, Défi 360, challenges) — pour COMPLÉTER le 360 par
// des challenges sur les groupes en déficit.
//
// ⚠️ ON MESURE CE QUI EST ENGAGÉ, PAS SEULEMENT CE QUI EST FAIT. Sur la semaine en
// cours, un muscle vaut `max(objectif, réel)` : un 360 lancé lundi couvre déjà ses
// groupes (sinon, lundi matin, tout serait « en déficit »), et une séance en plus du
// plan compte quand même. Un déficit veut donc dire : « même si je tiens tout ce que
// j'ai prévu, ce muscle reste sous sa cible » — le moment où un challenge a du sens.
//
// ⚠️ LES SECONDAIRES COMPTENT (½ série, convention des « séries fractionnaires ») : sans
// eux, le développé couché ne créditerait pas les triceps, et le graphe réclamerait des
// bras qui travaillent déjà — le résultat le plus trompeur possible.
//
// ⚠️ LA CIBLE est celle du programme (`computeMuscleTargets` : objectif, niveau, sports,
// priorités) — jamais un ratio neutre, qui signalerait comme défaut une emphase voulue.
//
// Forme : chaque source (séances, 360, challenges) se traduit en ÉLÉMENTS de volume
// {jour, exo, muscle principal, séries} ; une seule boucle les crédite par muscle.
import type { Objective } from './types';
import { isMuscuLog, mondayOf, volumeState, type LogEntry, type VolumeState } from './volume';
import { legSets, legMode, legRepRange, type ComboChallenge, type ComboLeg } from './combo';
import { challengeTargetBetween, type Challenge } from './challenges';
import { repRangeForExercise, type RepRange } from './repScheme';
import { addDaysUtcIso } from './startDate';
import { normMuscle } from './muscles';
import { isCardioTrackChallenge } from '@/data/cardio';

/** Crédit d'une série pour un muscle SECONDAIRE (le principal vaut 1). */
const SECONDARY_CREDIT = 0.5;

/** Muscles secondaires d'un exercice (bibliothèque). Un exo inconnu (import IA) → rien. */
type SecondaryLookup = (exerciseId: string) => readonly string[] | null | undefined;

export type BalancePeriod = 'week' | 'weeks4';

export interface BalanceInput {
  /** Bilans de SÉANCE uniquement — le 360 et les challenges sont lus à la source
   *  (leurs séances synthétiques de `volume.ts` ignorent le mode reps). */
  sessions: readonly LogEntry[];
  combos: readonly ComboChallenge[];
  challenges: readonly Challenge[];
  /** Séries/semaine cibles par muscle (`computeMuscleTargets`). */
  targets: Readonly<Record<string, number>>;
  objective?: Objective | null;
  secondaries: SecondaryLookup;
  /** Jour d'entraînement (YYYY-MM-DD, local). */
  today: string;
}

export interface MuscleBalance {
  muscle: string;
  target: number;
  /** Séries réellement faites (par semaine en vue 4 semaines). */
  done: number;
  /** Séries retenues : `done` + ce qui est prévu cette semaine et pas encore fait. */
  value: number;
  /** value / target */
  pct: number;
  state: VolumeState;
}

type Tally = Record<string, number>;

/** Du volume attribué à un exo : `sets` séries (fractionnaires possibles) le jour `day`. */
interface VolumeItem {
  day: string;
  exerciseId: string;
  primary: string | null | undefined;
  sets: number;
}

/** Crédite `sets` séries : 1 au muscle principal, ½ à chaque secondaire distinct. */
export function creditSets(
  tally: Tally,
  primary: string | null | undefined,
  secondary: readonly string[] | null | undefined,
  sets: number,
): void {
  if (!(sets > 0)) return;
  const p = normMuscle(primary);
  if (p) tally[p] = (tally[p] ?? 0) + sets;
  const seen = new Set<string>([p]);
  for (const raw of secondary ?? []) {
    const s = normMuscle(raw);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    tally[s] = (tally[s] ?? 0) + sets * SECONDARY_CREDIT;
  }
}

/** Ce que vaut UNE série quand l'objectif est en reps/secondes : le milieu de la fourchette. */
function perSet(r: RepRange): number {
  return Math.max(1, (r.min + r.max) / 2);
}

// ── Sources → éléments de volume ────────────────────────────────────────────────

function sessionItems(sessions: readonly LogEntry[]): VolumeItem[] {
  const out: VolumeItem[] = [];
  for (const e of sessions) {
    if (!isMuscuLog(e.log)) continue;
    const day = e.performedAt.slice(0, 10);
    for (const ex of e.log.exercises ?? [])
      out.push({
        day,
        exerciseId: ex.id,
        primary: ex.muscle_primary,
        sets: ex.performed?.length ?? 0,
      });
  }
  return out;
}

/** Séries faites d'un exo du 360, en séries (une entrée = 1 série, ou ses reps ÷ fourchette). */
function legItems(leg: ComboLeg, objective?: Objective | null): VolumeItem[] {
  const unit = legMode(leg) === 'sets' ? 0 : perSet(legRepRange(leg, objective));
  return legSets(leg).map((s) => ({
    day: s.date.slice(0, 10),
    exerciseId: leg.exercise_id,
    primary: leg.muscle_primary,
    sets: unit ? (s.reps || 0) / unit : 1,
  }));
}

/** Une valeur d'un challenge (objectif ou réalisé, dans son unité) exprimée en SÉRIES. */
function challengeSets(c: Challenge, v: number, objective?: Objective | null): number {
  if (c.config.count_mode === 'sets') return v;
  const range = repRangeForExercise(objective, {
    time: c.unit === 'time',
    muscle_primary: c.muscle_primary,
  });
  return v / perSet(range);
}

function challengeItems(
  challenges: readonly Challenge[],
  objective?: Objective | null,
): VolumeItem[] {
  return challenges.flatMap((c) =>
    c.progress
      .filter((p) => p.done > 0)
      .map((p) => ({
        day: p.date.slice(0, 10),
        exerciseId: c.exercise_id,
        primary: c.muscle_primary,
        sets: challengeSets(c, p.done, objective),
      })),
  );
}

/** Séries PRÉVUES sur la semaine [start, end) par le Défi 360 et les challenges ACTIFS. */
function plannedItems(
  i: BalanceInput,
  challenges: readonly Challenge[],
  start: string,
  end: string,
): VolumeItem[] {
  const out: VolumeItem[] = [];
  // Le 360 est l'engagement de SA semaine : on compte son objectif dès qu'il est en
  // cours, quel que soit son jour de départ (le proratiser inventerait un déficit pour
  // un 360 lancé mercredi qu'on bouclera mardi prochain).
  // ⚠️ MOINS ce qui en a déjà été fait AVANT lundi : ces séries sont comptées dans les
  // semaines précédentes, les compter encore via l'objectif les ferait valoir deux fois.
  for (const c of i.combos) {
    if (c.status !== 'active') continue;
    for (const leg of c.legs) {
      const unit = legMode(leg) === 'sets' ? 1 : perSet(legRepRange(leg, i.objective));
      const before = legItems(leg, i.objective)
        .filter((it) => it.day < start)
        .reduce((a, it) => a + it.sets, 0);
      const sets = Math.max(0, leg.target / unit - before);
      out.push({ day: start, exerciseId: leg.exercise_id, primary: leg.muscle_primary, sets });
    }
  }
  for (const c of challenges) {
    if (c.status !== 'active') continue;
    const sets = challengeSets(c, challengeTargetBetween(c, start, end), i.objective);
    out.push({ day: start, exerciseId: c.exercise_id, primary: c.muscle_primary, sets });
  }
  return out;
}

/** Crédite par muscle les éléments dont le jour tombe dans [start, end). */
function tally(
  items: readonly VolumeItem[],
  secondaries: SecondaryLookup,
  start: string,
  end: string,
): Tally {
  const t: Tally = {};
  for (const it of items)
    if (it.day >= start && it.day < end)
      creditSets(t, it.primary, secondaries(it.exerciseId), it.sets);
  return t;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Équilibre du corps, trié du plus gros déficit au plus petit. Seuls les muscles qui
 *  ont une cible (> 0) apparaissent. */
export function bodyBalance(i: BalanceInput, period: BalancePeriod): MuscleBalance[] {
  const weeks = period === 'weeks4' ? 4 : 1;
  const monday = mondayOf(i.today);
  const nextMonday = addDaysUtcIso(monday, 7);
  const firstMonday = addDaysUtcIso(monday, -7 * (weeks - 1));

  const challenges = i.challenges.filter((c) => !isCardioTrackChallenge(c));
  const done = [
    ...sessionItems(i.sessions),
    ...i.combos.flatMap((c) => c.legs.flatMap((leg) => legItems(leg, i.objective))),
    ...challengeItems(challenges, i.objective),
  ];
  const cur = tally(done, i.secondaries, monday, nextMonday);
  const prev = tally(done, i.secondaries, firstMonday, monday);
  const planned = tally(
    plannedItems(i, challenges, monday, nextMonday),
    i.secondaries,
    monday,
    nextMonday,
  );

  const out: MuscleBalance[] = [];
  for (const [rawMuscle, target] of Object.entries(i.targets)) {
    if (!(target > 0)) continue;
    const m = normMuscle(rawMuscle);
    const real = cur[m] ?? 0;
    const before = prev[m] ?? 0;
    const value = round1((before + Math.max(real, planned[m] ?? 0)) / weeks);
    const pct = value / target;
    out.push({
      muscle: rawMuscle,
      target,
      done: round1((before + real) / weeks),
      value,
      pct,
      state: volumeState(pct),
    });
  }
  return out.sort((a, b) => a.pct - b.pct || b.target - a.target);
}
