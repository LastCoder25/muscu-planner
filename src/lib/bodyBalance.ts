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
import type { Objective } from './types';
import { isMuscuLog, mondayOf, addDaysLocal, volumeState, type LogEntry } from './volume';
import {
  legSets,
  legMode,
  legRepRange,
  type ComboChallenge,
  type ComboLeg,
  type ComboSet,
} from './combo';
import type { Challenge } from './challenges';
import { repRangeForExercise, type RepRange } from './repScheme';
import { isCardioTrackChallenge } from '@/data/cardio';

/** Crédit d'une série pour un muscle SECONDAIRE (le principal vaut 1). */
export const SECONDARY_CREDIT = 0.5;

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
  state: 'low' | 'ok' | 'high';
}

type Tally = Record<string, number>;

// Variantes de nom présentes en base, rattachées au muscle qui porte la cible.
const MUSCLE_ALIASES: Record<string, string> = {
  'deltoïde antérieur': 'épaules',
  'deltoide anterieur': 'épaules',
};
/** Nom de muscle normalisé (minuscules, variantes rattachées) — source unique pour le
 *  graphe ET le filtre du wizard de challenge, qui doivent reconnaître les mêmes muscles. */
export function normMuscle(m: string | null | undefined): string {
  const k = (m ?? '').trim().toLowerCase();
  return MUSCLE_ALIASES[k] ?? k;
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

/** Milieu d'une fourchette : ce que vaut UNE série quand l'objectif est en reps/secondes. */
function perSet(r: RepRange): number {
  return Math.max(1, (r.min + r.max) / 2);
}

function inRange(day: string, start: string, end: string): boolean {
  return day >= start && day < end;
}

// ── Réel ────────────────────────────────────────────────────────────────────────

function sessionsDone(i: BalanceInput, start: string, end: string, tally: Tally): void {
  for (const e of i.sessions) {
    if (!inRange(e.performedAt.slice(0, 10), start, end) || !isMuscuLog(e.log)) continue;
    for (const ex of e.log.exercises ?? [])
      creditSets(tally, ex.muscle_primary, i.secondaries(ex.id), ex.performed?.length ?? 0);
  }
}

/** Valeur de séries d'un exo du 360 dans l'UNITÉ de son objectif (séries, reps ou secondes). */
function legValue(leg: ComboLeg, sets: readonly ComboSet[]): number {
  return legMode(leg) === 'sets' ? sets.length : sets.reduce((a, s) => a + (s.reps || 0), 0);
}
/** Ce que vaut UNE série dans l'unité de l'objectif de l'exo. */
function legUnit(leg: ComboLeg, objective?: Objective | null): number {
  return legMode(leg) === 'sets' ? 1 : perSet(legRepRange(leg, objective));
}

function combosDone(i: BalanceInput, start: string, end: string, tally: Tally): void {
  for (const c of i.combos)
    for (const leg of c.legs) {
      const sets = legSets(leg).filter((s) => inRange(s.date.slice(0, 10), start, end));
      const n = legValue(leg, sets) / legUnit(leg, i.objective);
      creditSets(tally, leg.muscle_primary, i.secondaries(leg.exercise_id), n);
    }
}

function challengeRange(c: Challenge, objective?: Objective | null): RepRange {
  return repRangeForExercise(objective, {
    time: c.unit === 'time',
    muscle_primary: c.muscle_primary,
  });
}
/** Une valeur du défi (objectif ou réalisé) exprimée en SÉRIES. */
function challengeSets(c: Challenge, v: number, objective?: Objective | null): number {
  return c.config.count_mode === 'sets' ? v : v / perSet(challengeRange(c, objective));
}
function muscuChallenges(i: BalanceInput): Challenge[] {
  return i.challenges.filter((c) => !isCardioTrackChallenge(c));
}

function challengesDone(i: BalanceInput, start: string, end: string, tally: Tally): void {
  for (const c of muscuChallenges(i))
    for (const p of c.progress) {
      if (!inRange(p.date.slice(0, 10), start, end) || !(p.done > 0)) continue;
      creditSets(
        tally,
        c.muscle_primary,
        i.secondaries(c.exercise_id),
        challengeSets(c, p.done, i.objective),
      );
    }
}

function doneIn(i: BalanceInput, start: string, end: string): Tally {
  const t: Tally = {};
  sessionsDone(i, start, end, t);
  combosDone(i, start, end, t);
  challengesDone(i, start, end, t);
  return t;
}

// ── Engagé (semaine en cours) ─────────────────────────────────────────────────

/** Séries PRÉVUES sur la semaine [start, end) par le Défi 360 et les challenges ACTIFS. */
function plannedIn(i: BalanceInput, start: string, end: string): Tally {
  const t: Tally = {};
  // Le 360 est l'engagement de SA semaine : on compte son objectif dès qu'il est en
  // cours, quel que soit son jour de départ (le proratiser inventerait un déficit pour
  // un 360 lancé mercredi qu'on bouclera mardi prochain).
  // ⚠️ MOINS ce qui en a déjà été fait AVANT lundi : ces séries sont comptées dans les
  // semaines précédentes, les compter encore via l'objectif les ferait valoir deux fois.
  for (const c of i.combos) {
    if (c.status !== 'active') continue;
    for (const leg of c.legs) {
      const before = legValue(
        leg,
        legSets(leg).filter((s) => s.date.slice(0, 10) < start),
      );
      const n = Math.max(0, leg.target - before) / legUnit(leg, i.objective);
      creditSets(t, leg.muscle_primary, i.secondaries(leg.exercise_id), n);
    }
  }
  for (const c of muscuChallenges(i)) {
    if (c.status !== 'active') continue;
    const v = challengeTargetIn(c, start, end);
    creditSets(t, c.muscle_primary, i.secondaries(c.exercise_id), challengeSets(c, v, i.objective));
  }
  return t;
}

/** Objectif du défi sur [start, end), dans son unité. Cumulé : pas de cible par jour
 *  (`daily_targets` à 0) → le total, au prorata des jours tombant dans la période. */
function challengeTargetIn(c: Challenge, start: string, end: string): number {
  let v = 0;
  for (let d = 0; d < c.duration_days; d++) {
    if (!inRange(addDaysLocal(c.start_date, d), start, end)) continue;
    v +=
      c.format === 'cumulative'
        ? (c.config.total ?? 0) / Math.max(1, c.duration_days)
        : (c.daily_targets[d] ?? 0);
  }
  return v;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Équilibre du corps, trié du plus gros déficit au plus petit. Seuls les muscles qui
 *  ont une cible (> 0) apparaissent. */
export function bodyBalance(i: BalanceInput, period: BalancePeriod): MuscleBalance[] {
  const monday = mondayOf(i.today);
  const nextMonday = addDaysLocal(monday, 7);
  const curDone = doneIn(i, monday, nextMonday);
  const curPlanned = plannedIn(i, monday, nextMonday);
  const prevDone: Tally = period === 'weeks4' ? doneIn(i, addDaysLocal(monday, -21), monday) : {};
  const weeks = period === 'weeks4' ? 4 : 1;

  const out: MuscleBalance[] = [];
  for (const [rawMuscle, target] of Object.entries(i.targets)) {
    if (!(target > 0)) continue;
    const m = normMuscle(rawMuscle);
    const real = curDone[m] ?? 0;
    const prev = prevDone[m] ?? 0;
    const retained = Math.max(real, curPlanned[m] ?? 0);
    const done = round1((prev + real) / weeks);
    const value = round1((prev + retained) / weeks);
    const pct = value / target;
    out.push({ muscle: rawMuscle, target, done, value, pct, state: volumeState(pct) });
  }
  return out.sort((a, b) => a.pct - b.pct || b.target - a.target);
}
