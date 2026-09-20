// bodyBalance.ts — ÉQUILIBRE DU CORPS : chaque groupe musculaire est-il travaillé à
// hauteur de SA cible ? (pur/testable, `today` passé par l'appelant)
//
// La question n'est pas « où en est mon Défi 360 » mais « mon corps est-il couvert » —
// toutes sources confondues (séances, Défi 360, challenges, boss entre amis) — pour COMPLÉTER le 360 par
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
// Forme : chaque source (séances, 360, challenges, boss) se traduit en ÉLÉMENTS de volume
// {jour, exo, muscle principal, séries} ; une seule boucle les crédite par muscle.
import type { Objective } from './types';
import { isMuscuLog, mondayOf, volumeState, type LogEntry, type VolumeState } from './volume';
import { legSets, legMode, legRepRange, type ComboChallenge, type ComboLeg } from './combo';
import { challengeTargetBetween, type Challenge } from './challenges';
import { repRangeForExercise, type RepRange } from './repScheme';
import { addDaysUtcIso } from './startDate';
import { normMuscle } from './muscles';
import { challengeLane } from './tennisTraining';
import { bossXpTrack, type BossAgendaEntry } from './friendBoss';

/** Crédit d'une série pour un muscle SECONDAIRE (le principal vaut 1). */
const SECONDARY_CREDIT = 0.5;

/** Muscles secondaires d'un exercice (bibliothèque). Un exo inconnu (import IA) → rien. */
type SecondaryLookup = (exerciseId: string) => readonly string[] | null | undefined;

/** Muscle PRINCIPAL d'un exercice (bibliothèque). ⚠️ Nécessaire pour le boss entre amis,
 *  seule source qui ne porte pas son muscle sur sa propre ligne (une séance le loggue, un
 *  challenge le stocke, un exo de 360 vient de son emplacement). Un exo inconnu → rien,
 *  et l'élément ne crédite alors aucun muscle plutôt que d'en inventer un. */
type PrimaryLookup = (exerciseId: string) => string | null | undefined;

export type BalancePeriod = 'week' | 'weeks4';

export interface BalanceInput {
  /** Bilans de SÉANCE uniquement — le 360 et les challenges sont lus à la source
   *  (leurs séances synthétiques de `volume.ts` ignorent le mode reps). */
  sessions: readonly LogEntry[];
  combos: readonly ComboChallenge[];
  challenges: readonly Challenge[];
  /** Frappes de boss entre amis, groupées par (boss, jour) — `bossAgendaEntries`.
   *  ⚠️ REQUIS comme tous les autres champs : une source de sport qu'on peut oublier
   *  finit par être oubliée, et le muscle travaillé disparaît du graphe sans bruit
   *  (leçon `ActivitySources`, v0.755 — le défaut que ce champ vient réparer). */
  bossHits: readonly BossAgendaEntry[];
  /** Séries/semaine cibles par muscle (`computeMuscleTargets`). */
  targets: Readonly<Record<string, number>>;
  objective?: Objective | null;
  secondaries: SecondaryLookup;
  primaries: PrimaryLookup;
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

/** Géométrie de la barre « Équilibre du corps » : le FAIT, le bord droit du PRÉVU
 *  (hachuré) et la CIBLE, tous en % de la largeur de la piste — jamais > 100.
 *
 *  ⚠️ LE MAXIMUM DE LA PISTE EST LE PLUS GRAND DES DEUX : `target` tant que le prévu ne
 *  le dépasse pas (la cible occupe alors 100 % de la largeur — sans quoi les hachures
 *  d'un muscle en plein dans les clous s'arrêteraient avant le bord, comme si le prévu
 *  était sous-évalué) ; `planned` dès qu'il excède la cible (le hachuré occupe alors
 *  100 % et la cible RECULE à `target / planned` — sinon les hachures débordaient de
 *  l'écran). Pur : ne connaît que les trois nombres qu'on lui donne. */
export interface BalanceBarGeometry {
  donePct: number;
  plannedPct: number;
  targetPct: number;
}
export function balanceBarGeometry(
  done: number,
  planned: number,
  target: number,
): BalanceBarGeometry {
  const max = Math.max(target, planned, 0);
  const pct = (n: number) => (max > 0 ? Math.max(0, Math.min(100, (n / max) * 100)) : 0);
  return { donePct: pct(done), plannedPct: pct(planned), targetPct: pct(target) };
}

type Tally = Record<string, number>;

/** D'où vient un élément de volume. */
export type BalanceSource = 'session' | 'combo' | 'challenge' | 'boss';

/** Du volume attribué à un exo : `sets` séries (fractionnaires possibles) le jour `day`. */
interface VolumeItem {
  source: BalanceSource;
  day: string;
  exerciseId: string;
  /** Nom affiché de l'exo (détail par exercice). */
  name: string;
  primary: string | null | undefined;
  sets: number;
  /** Répétitions réellement faites (0 pour un exo au temps : ce ne sont pas des reps). */
  reps: number;
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

/** Ce qu'une série de l'exo vaut pour le muscle `muscle` (normalisé) : 1 s'il en est le
 *  principal, ½ s'il en est un secondaire, 0 sinon — la règle de `creditSets`, lue pour
 *  UN muscle (le détail d'une ligne ne peut pas dire autre chose que sa barre). */
function muscleShare(
  muscle: string,
  primary: string | null | undefined,
  secondary: readonly string[] | null | undefined,
): number {
  const p = normMuscle(primary);
  if (p && p === muscle) return 1;
  return (secondary ?? []).some((raw) => normMuscle(raw) === muscle) ? SECONDARY_CREDIT : 0;
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
        source: 'session',
        day,
        exerciseId: ex.id,
        name: ex.name,
        primary: ex.muscle_primary,
        sets: ex.performed?.length ?? 0,
        reps: (ex.performed ?? []).reduce((a, s) => a + (s.reps || 0), 0),
      });
  }
  return out;
}

/** Séries faites d'un exo du 360, en séries (une entrée = 1 série, ou ses reps ÷ fourchette). */
function legItems(leg: ComboLeg, objective?: Objective | null): VolumeItem[] {
  const mode = legMode(leg);
  const unit = mode === 'sets' ? 0 : perSet(legRepRange(leg, objective));
  return legSets(leg).map((s) => ({
    source: 'combo' as const,
    day: s.date.slice(0, 10),
    exerciseId: leg.exercise_id,
    name: leg.exercise_name,
    primary: leg.muscle_primary,
    sets: unit ? (s.reps || 0) / unit : 1,
    reps: mode === 'time' ? 0 : s.reps || 0,
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

/**
 * 🐉 Les frappes de BOSS ENTRE AMIS, en éléments de volume. C'est du sport réel : ses reps
 * comptent déjà dans la piste Muscu (`friendBossXp`, v0.863), dans le Global, dans l'énergie
 * et dans l'Agenda (v0.912) — elles ne creusaient simplement aucun axe ici.
 *
 * ⚠️ **ON NE REGROUPE PAS UNE SECONDE FOIS** : `bossAgendaEntries` porte déjà la règle
 * « uniquement les boss où je suis ACCEPTÉ » et le groupement par jour. Une seconde
 * définition finirait par compter un boss que le total d’XP ignore.
 *
 * ⚠️ **LE CONDITIONNEMENT EST ÉCARTÉ** : sa piste est le CARDIO (`bossXpTrack`), comme les
 * challenges de conditionnement que `muscuChallenges` écarte déjà. Un graphe de muscles ne
 * doit pas créditer des burpees à un groupe musculaire.
 */
function bossItems(
  hits: readonly BossAgendaEntry[],
  primaries: PrimaryLookup,
  objective?: Objective | null,
): VolumeItem[] {
  const out: VolumeItem[] = [];
  for (const h of hits) {
    if (bossXpTrack(h.family) !== 'muscu' || h.total <= 0) continue;
    const primary = primaries(h.exerciseId);
    const range = repRangeForExercise(objective, { time: h.unit === 's', muscle_primary: primary });
    out.push({
      source: 'boss',
      day: h.day,
      exerciseId: h.exerciseId,
      name: h.title,
      primary,
      sets: h.total / perSet(range),
      reps: h.unit === 'reps' ? h.total : 0,
    });
  }
  return out;
}

function challengeItems(
  challenges: readonly Challenge[],
  objective?: Objective | null,
): VolumeItem[] {
  return challenges.flatMap((c) =>
    c.progress
      .filter((p) => p.done > 0)
      .map((p) => ({
        source: 'challenge' as const,
        day: p.date.slice(0, 10),
        exerciseId: c.exercise_id,
        name: c.exercise_name,
        primary: c.muscle_primary,
        sets: challengeSets(c, p.done, objective),
        reps: challengeReps(c, p),
      })),
  );
}

/** Répétitions faites un jour de challenge : le compteur en mode reps, la somme des séries
 *  en mode séries, rien pour un exo au temps (ce sont des secondes). */
function challengeReps(c: Challenge, p: Challenge['progress'][number]): number {
  if (c.unit !== 'reps') return 0;
  if (c.config.count_mode === 'sets') return (p.sets ?? []).reduce((a, s) => a + (s.reps || 0), 0);
  return p.done;
}

/** Objectif du Défi 360 ACTIF, en séries par exo, posé sur `day`, MOINS ce que `already`
 *  en retire (déjà fait, en séries).
 *  Le 360 est l'engagement de SA semaine : on compte son objectif dès qu'il est en cours,
 *  quel que soit son jour de départ (le proratiser inventerait un déficit pour un 360
 *  lancé mercredi qu'on bouclera mardi prochain). */
function comboItems(
  i: Pick<BalanceInput, 'combos' | 'objective'>,
  day: string,
  already: (leg: ComboLeg) => number,
): VolumeItem[] {
  return i.combos
    .filter((c) => c.status === 'active')
    .flatMap((c) =>
      c.legs.map((leg) => {
        const unit = legMode(leg) === 'sets' ? 1 : perSet(legRepRange(leg, i.objective));
        // Négatif si l'objectif est déjà dépassé : `creditSets` ignore toute valeur ≤ 0.
        const sets = leg.target / unit - already(leg);
        return {
          source: 'combo' as const,
          day,
          exerciseId: leg.exercise_id,
          name: leg.exercise_name,
          primary: leg.muscle_primary,
          sets,
          reps: 0,
        };
      }),
    );
}

/** L'objectif COMPLET du 360 : ce qu'il demande pour sa semaine. */
function comboWeeklyTargetItems(i: Pick<BalanceInput, 'combos' | 'objective'>, day: string) {
  return comboItems(i, day, () => 0);
}

/** Ce qu'il RESTE du 360 à partir de `start` : les séries faites avant sont déjà comptées
 *  ailleurs (semaines précédentes, ou jours d'avant lundi d'un 360 lancé en fin de semaine
 *  passée) — les recompter via l'objectif les ferait valoir deux fois. */
function comboRemainingItems(i: Pick<BalanceInput, 'combos' | 'objective'>, start: string) {
  return comboItems(i, start, (leg) =>
    legItems(leg, i.objective)
      .filter((it) => it.day < start)
      .reduce((a, it) => a + it.sets, 0),
  );
}

/** Objectifs des challenges muscu ACTIFS sur les jours de [start, end), en séries. */
function challengeTargetItems(
  i: Pick<BalanceInput, 'challenges' | 'objective'>,
  start: string,
  end: string,
): VolumeItem[] {
  return muscuChallenges(i.challenges)
    .filter((c) => c.status === 'active')
    .map((c) => ({
      source: 'challenge' as const,
      day: start,
      exerciseId: c.exercise_id,
      name: c.exercise_name,
      primary: c.muscle_primary,
      sets: challengeSets(c, challengeTargetBetween(c, start, end), i.objective),
      reps: 0,
    }));
}

/** Challenges qui comptent pour la musculation (sorties, conditionnement et tennis exclus). */
function muscuChallenges(challenges: readonly Challenge[]): Challenge[] {
  return challenges.filter((c) => challengeLane(c) === 'muscu');
}

/** Tout le volume RÉELLEMENT fait (séances, 360, challenges muscu), en éléments. */
function doneItems(i: Omit<BalanceInput, 'targets' | 'today'>): VolumeItem[] {
  return [
    ...sessionItems(i.sessions),
    ...i.combos.flatMap((c) => c.legs.flatMap((leg) => legItems(leg, i.objective))),
    ...challengeItems(muscuChallenges(i.challenges), i.objective),
    ...bossItems(i.bossHits, i.primaries, i.objective),
  ];
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
/** Bornes d'une période : la semaine en cours [monday, nextMonday), et le début de la
 *  fenêtre (`firstMonday`, 3 semaines plus tôt en vue 4 semaines). */
function periodBounds(today: string, period: BalancePeriod) {
  const weeks = period === 'weeks4' ? 4 : 1;
  const monday = mondayOf(today);
  return {
    weeks,
    monday,
    nextMonday: addDaysUtcIso(monday, 7),
    firstMonday: addDaysUtcIso(monday, -7 * (weeks - 1)),
  };
}

/** Ce qui est PRÉVU cette semaine : le reste du 360 actif et les objectifs des challenges. */
function plannedItems(i: BalanceInput, monday: string, nextMonday: string): VolumeItem[] {
  return [...comboRemainingItems(i, monday), ...challengeTargetItems(i, monday, nextMonday)];
}

export function bodyBalance(i: BalanceInput, period: BalancePeriod): MuscleBalance[] {
  const { weeks, monday, nextMonday, firstMonday } = periodBounds(i.today, period);

  const week = (items: readonly VolumeItem[]) => tally(items, i.secondaries, monday, nextMonday);
  const done = doneItems(i);
  const cur = week(done);
  const prev = tally(done, i.secondaries, firstMonday, monday);
  const planned = week(plannedItems(i, monday, nextMonday));

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

/** Une ligne du détail d'un muscle : un exercice d'une source. */
export interface BalanceContribution {
  exerciseId: string;
  name: string;
  source: BalanceSource;
  /** 1 si le muscle est le principal de l'exo, ½ s'il est un secondaire. */
  share: number;
  /** Séries créditées au muscle (moyenne par semaine en vue 4 semaines). */
  done: number;
  /** Séries créditées par ce qui est prévu cette semaine (360, challenges). */
  planned: number;
}

/** D'où viennent les séries d'un muscle : chaque exo, par source, avec ce qu'il crédite.
 *  ⚠️ LA SOMME DES `done` EST LE `done` DE LA LIGNE (même fenêtre, même règle de crédit,
 *  même moyenne) : sans ça, le détail qui doit expliquer la barre la contredirait. Trié du
 *  plus gros apport au plus petit. */
export function muscleBreakdown(
  i: BalanceInput,
  muscle: string,
  period: BalancePeriod,
): BalanceContribution[] {
  const m = normMuscle(muscle);
  const { weeks, monday, nextMonday, firstMonday } = periodBounds(i.today, period);
  const rows = new Map<string, BalanceContribution>();
  const add = (it: VolumeItem, field: 'done' | 'planned', value: number) => {
    const share = muscleShare(m, it.primary, i.secondaries(it.exerciseId));
    if (!share || !(value > 0)) return;
    const key = it.source + '|' + it.exerciseId;
    const row = rows.get(key) ?? {
      exerciseId: it.exerciseId,
      name: it.name,
      source: it.source,
      share,
      done: 0,
      planned: 0,
    };
    row[field] += value * share;
    rows.set(key, row);
  };
  for (const it of doneItems(i))
    if (it.day >= firstMonday && it.day < nextMonday) add(it, 'done', it.sets / weeks);
  for (const it of plannedItems(i, monday, nextMonday)) add(it, 'planned', it.sets);
  return [...rows.values()].sort((a, b) => b.done - a.done || b.planned - a.planned);
}

/** Les 3 courbes du radar de la SEMAINE EN COURS (lundi → dimanche), en séries par
 *  muscle normalisé — mêmes règles que `bodyBalance` (secondaires ½, conversions) :
 *  - `real` : ce qui a été fait (séances, 360, challenges) ;
 *  - `combo` : l'objectif COMPLET du Défi 360 actif (il représente la semaine : rien à
 *    déduire, aucune semaine précédente n'est additionnée ici) ;
 *  - `challenges` : ce que les challenges muscu actifs demandent sur ces 7 jours. */
export type WeekSeriesKey = 'real' | 'combo' | 'challenges';
export type WeekMuscleSeries = Record<WeekSeriesKey, Tally>;
export function weekMuscleSeries(i: Omit<BalanceInput, 'targets'>): WeekMuscleSeries {
  const monday = mondayOf(i.today);
  const nextMonday = addDaysUtcIso(monday, 7);
  const week = (items: readonly VolumeItem[]) => tally(items, i.secondaries, monday, nextMonday);
  return {
    real: week(doneItems(i)),
    combo: week(comboWeeklyTargetItems(i, monday)),
    challenges: week(challengeTargetItems(i, monday, nextMonday)),
  };
}

// ── Volume FAIT, pour les autres lectures « séries » d'une page ─────────────────
// ⚠️ UNE PAGE, UN COMPTE. Stats affichait les séries de la semaine, la silhouette et la
// tendance via les séances synthétiques de `volume.ts` (principaux seuls, une entrée du
// 360 en mode reps comptée comme UNE série) pendant que le radar et le graphe d'équilibre,
// juste à côté, convertissaient et créditaient les secondaires : deux chiffres pour la
// même semaine. Tout ce qui compte des SÉRIES par muscle passe désormais par ici.

interface ExerciseVolume {
  id: string;
  name: string;
  /** Muscle principal, normalisé. */
  muscle: string;
  sets: number;
  reps: number;
}

export interface DoneVolume {
  /** Séries par muscle normalisé — secondaires à ½, comme le radar. */
  byMuscle: Tally;
  /** Par exercice, du plus travaillé au moins travaillé. */
  byExercise: ExerciseVolume[];
  /** Séries réellement faites (chacune compte UNE fois, secondaires non recomptés). */
  totalSets: number;
}

/** Volume réellement fait (séances, 360, challenges muscu) sur [start, end). */
export function doneVolume(
  i: Omit<BalanceInput, 'targets' | 'today'>,
  start: string,
  end: string,
): DoneVolume {
  const items = doneItems(i).filter((it) => it.day >= start && it.day < end);
  const byExo = new Map<string, ExerciseVolume>();
  let total = 0;
  for (const it of items) {
    total += it.sets;
    const cur = byExo.get(it.exerciseId) ?? {
      id: it.exerciseId,
      name: it.name,
      muscle: normMuscle(it.primary),
      sets: 0,
      reps: 0,
    };
    cur.sets += it.sets;
    cur.reps += it.reps;
    byExo.set(it.exerciseId, cur);
  }
  const byExercise = [...byExo.values()]
    .map((e) => ({ ...e, sets: round1(e.sets) }))
    .filter((e) => e.sets > 0)
    .sort((a, b) => b.sets - a.sets);
  const byMuscle = tally(items, i.secondaries, start, end);
  for (const m of Object.keys(byMuscle)) byMuscle[m] = round1(byMuscle[m]!);
  return { byMuscle, byExercise, totalSets: round1(total) };
}

/** Séries réellement faites par semaine, pour chaque lundi de `weekStarts` (un seul passage). */
export function doneSetsByWeek(
  i: Omit<BalanceInput, 'targets' | 'today'>,
  weekStarts: readonly string[],
): number[] {
  const idx = new Map(weekStarts.map((w, k) => [w, k]));
  const out = weekStarts.map(() => 0);
  for (const it of doneItems(i)) {
    const k = idx.get(mondayOf(it.day));
    if (k !== undefined) out[k] = out[k]! + it.sets;
  }
  return out.map(round1);
}
