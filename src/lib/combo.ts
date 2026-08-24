// combo.ts — logique pure du Défi 360 (défi combiné hebdo full-body). Pur/testable.
// Modèle SÉRIES : l'objectif d'un exo = un nombre de SÉRIES/semaine (repère
// hypertrophie), chaque série enregistrée porte ses reps + son poids. XP façon
// séance : Σ reps×REP_XP×poids-de-rep + tonnage/500 + prime de bouclage.
import { REP_XP, assistMult, XP_MULT, MUSCU_MIN_XP } from './athlete';
import { daysBetweenIso } from './loginStreak';
import type { Level, Objective, SportPractice } from './types';

export interface ComboSet {
  date: string; // YYYY-MM-DD
  reps: number;
  weight?: number | null; // charge de la série (kg) — poids du corps = vide
  assisted?: boolean; // exo poids du corps fait assisté (élastique/machine) → XP ×0,6
}
// Ancien format (reps cumulées/jour) — lu pour migration des défis existants.
export interface ComboLegEntry {
  date: string;
  reps: number;
}
// Mode de comptage d'un exo : par SÉRIES (target = nb de séries/sem, défaut), par
// REPS (target = total de reps/sem) ou par DURÉE (target = total de SECONDES/sem — gainage :
// les secondes sont stockées dans le champ `reps` de chaque série, comme les défis solo).
export type ComboCountMode = 'sets' | 'reps' | 'time';

export interface ComboLeg {
  slot: string;
  exercise_id: string;
  exercise_name: string;
  muscle_primary?: string | null;
  rep_weight: number; // poids de rep de l'exo (pour l'XP)
  target: number; // objectif : SÉRIES (mode 'sets') OU total REPS (mode 'reps') sur la sem
  count_mode?: ComboCountMode; // défaut 'sets' (rétro-compat)
  weight_kg?: number | null; // dernier poids utilisé → préremplissage de la prochaine série
  assistable?: boolean; // exo au poids du corps → propose l'option « assisté »
  sets?: ComboSet[]; // séries réalisées (modèle courant)
  progress?: ComboLegEntry[]; // legacy (migration)
}
export interface ComboChallenge {
  id: string;
  name: string;
  start_date: string;
  duration_days: number;
  status: 'active' | 'done' | 'abandoned';
  legs: ComboLeg[];
}

// Reps supposées par série pour l'estimation du volume planifié (prime de bouclage).
export const COMBO_PLAN_REPS = 10;

/** Séries réalisées (avec repli : convertit l'ancien `progress` en séries). */
export function legSets(leg: ComboLeg): ComboSet[] {
  if (leg.sets) return leg.sets;
  if (leg.progress)
    return leg.progress.map((p) => ({ date: p.date, reps: p.reps, weight: leg.weight_kg ?? null }));
  return [];
}
/** Nombre de séries faites. */
export function legSetsDone(leg: ComboLeg): number {
  return legSets(leg).length;
}
/** Reps totales réalisées (pour l'XP / la séance générée). */
export function legReps(leg: ComboLeg): number {
  return legSets(leg).reduce((a, s) => a + (s.reps || 0), 0);
}
/** Mode de comptage de l'exo (défaut 'sets' pour les défis existants). */
export function legMode(leg: ComboLeg): ComboCountMode {
  return leg.count_mode ?? 'sets';
}
/** Libellé de l'unité de l'objectif (séries / reps / sec) selon le mode. */
export function legUnitLabel(leg: ComboLeg): string {
  const m = legMode(leg);
  return m === 'reps' ? 'reps' : m === 'time' ? 'sec' : 'séries';
}
/** Avancement réalisé dans l'UNITÉ de l'objectif (séries faites, reps OU secondes cumulées).
 *  reps ET time somment le champ `reps` des séries (= reps, ou secondes en mode durée). */
export function legDone(leg: ComboLeg): number {
  return legMode(leg) === 'sets' ? legSetsDone(leg) : legReps(leg);
}
/** Restant avant l'objectif, dans l'unité du mode (séries ou reps). */
export function legRemaining(leg: ComboLeg): number {
  return Math.max(0, leg.target - legDone(leg));
}
export function legComplete(leg: ComboLeg): boolean {
  return leg.target > 0 && legDone(leg) >= leg.target;
}
/** Poids de préremplissage : dernier poids saisi (sinon poids de l'exo). */
export function legLastWeight(leg: ComboLeg): number | null {
  const s = legSets(leg);
  return s.length ? (s[s.length - 1]!.weight ?? null) : (leg.weight_kg ?? null);
}
/** Reps de préremplissage : reps de la dernière série (sinon défaut). */
export function legLastReps(leg: ComboLeg, fallback = COMBO_PLAN_REPS): number {
  const s = legSets(leg);
  return s.length ? s[s.length - 1]!.reps : fallback;
}
/** État « assisté » de préremplissage : celui de la dernière série. */
export function legLastAssisted(leg: ComboLeg): boolean {
  const s = legSets(leg);
  return s.length ? !!s[s.length - 1]!.assisted : false;
}

/** Avancement global = MOYENNE des fractions de complétion par exo (mode-neutre :
 *  chaque exo compte pour 1, quel que soit son unité séries/reps → on peut mélanger). */
export function comboProgressPct(c: ComboChallenge): number {
  if (!c.legs.length) return 0;
  const frac = c.legs.reduce((a, l) => {
    if (l.target <= 0) return a;
    return a + Math.min(1, legDone(l) / l.target);
  }, 0);
  return Math.round((frac / c.legs.length) * 100);
}
export function comboComplete(c: ComboChallenge): boolean {
  return c.legs.length > 0 && c.legs.every((l) => legComplete(l));
}

/** Fraction d'avance d'un Défi 360 terminé : jours gagnés / durée (0..~1). */
export function comboEarlyFraction(c: ComboChallenge): number {
  if (!comboComplete(c) || c.duration_days <= 0) return 0;
  const dates = c.legs.flatMap((l) => legSets(l).map((s) => s.date)).filter(Boolean);
  if (!dates.length) return 0;
  const last = dates.reduce((m, d) => (d > m ? d : m), dates[0]!);
  const daysUsed = daysBetweenIso(c.start_date, last) + 1;
  const saved = Math.max(0, c.duration_days - daysUsed);
  return saved / c.duration_days;
}

// Bonus de dépassement : l'XP des séries faites AU-DELÀ de l'objectif est
// re-bonifiée (en plus de son XP de base) → « en faire plus » est valorisé, pas
// juste compté. Pondéré par la part d'exos dépassés (`balance`) pour récompenser
// l'effort RÉPARTI sur le full-body plutôt que le bourrage d'un seul exo.
export const COMBO_SURPASS_MULT = 0.5;

/** Détail du dépassement d'un Défi 360 (séries au-delà de l'objectif). */
export function comboOverachievement(c: ComboChallenge): {
  extraXp: number; // XP de base des séries en plus
  legsOver: number; // nb d'exos ayant dépassé leur objectif
  totalLegs: number;
  balance: number; // legsOver / totalLegs (0..1)
  bonusXp: number; // bonus final (déjà × XP_MULT) → affichable
} {
  let extraXp = 0;
  let legsOver = 0;
  const totalLegs = c.legs.length;
  for (const l of c.legs) {
    const sets = legSets(l);
    // « done » dans l'unité du mode : nb de séries ('sets') ou total de reps ('reps').
    const done = legDone(l);
    if (l.target > 0 && done > l.target) {
      const legRepXp = sets.reduce(
        (s, st) => s + (st.reps || 0) * REP_XP * (l.rep_weight ?? 1) * assistMult(st.assisted),
        0,
      );
      extraXp += (legRepXp * (done - l.target)) / done; // part de l'effort au-delà de l'objectif
      legsOver++;
    }
  }
  const balance = totalLegs ? legsOver / totalLegs : 0;
  const bonusXp = Math.round(COMBO_SURPASS_MULT * extraXp * balance * XP_MULT);
  return { extraXp, legsOver, totalLegs, balance, bonusXp };
}

/** Base de la prime de bouclage = reps RÉELLES des séries comptées (jusqu'à l'objectif)
 *  × poids-de-rep, au lieu de `target × COMBO_PLAN_REPS` figé. Corrige la sous-évaluation
 *  du 360 (2026‑08‑15, ticket 135fa252) : avant, faire 20 reps/série au lieu de 10 ne
 *  changeait pas la prime → l'XP/rep chutait. Désormais symétrique avec les petits défis
 *  (prime ∝ effort réel). Fallback COMBO_PLAN_REPS pour une série sans reps saisies /
 *  un objectif non encore couvert (le helper n'est utilisé qu'au bouclage). */
export function comboTargetEffort(c: ComboChallenge): number {
  let sum = 0;
  for (const l of c.legs) {
    const sets = legSets(l);
    if (legMode(l) !== 'sets') {
      // Mode REPS/DURÉE : effort = reps (ou secondes) réalisées jusqu'à l'objectif.
      const reps = legReps(l);
      sum += Math.min(reps, l.target > 0 ? l.target : reps) * (l.rep_weight ?? 1);
    } else {
      const counted = l.target > 0 ? sets.slice(0, l.target) : sets;
      const reps = counted.reduce((a, s) => a + (s.reps || COMBO_PLAN_REPS), 0);
      const missing = Math.max(0, l.target - counted.length);
      sum += (reps + missing * COMBO_PLAN_REPS) * (l.rep_weight ?? 1);
    }
  }
  return sum;
}

// Minutes de séance créditées par SÉRIE comptée (jusqu'à l'objectif). Le Défi 360
// REPRÉSENTE les séances muscu de la semaine, or `sessionXp` fait porter l'essentiel
// de l'XP par la DURÉE (durée×MUSCU_MIN_XP). Sans terme de durée, boucler son volume
// hebdo via le 360 ne rapportait que ~36 % d'une semaine loggée en séances (le même
// volume !). On crédite ~3,5 min de séance par série (exécution + repos), un cran sous
// une séance « pleine » (~4 min/série avec échauffement) → format efficace, honnête.
// PLAFONNÉ à l'objectif (comboCountedSets) : pas de farm de séries vides au-delà du
// plan ; le dépassement passe par le bonus `surpass`, pas par la durée.
export const COMBO_SET_MIN = 3.5;

/** Séries comptées vers l'objectif (mode-aware), plafonnées à la cible par exo. */
export function comboCountedSets(c: ComboChallenge): number {
  let n = 0;
  for (const l of c.legs) {
    const byCount = legMode(l) !== 'sets'; // reps ou durée → convertit en « séries » équivalentes
    const done = byCount ? Math.ceil(legReps(l) / COMBO_PLAN_REPS) : legSetsDone(l);
    const targetSets = byCount ? Math.ceil(l.target / COMBO_PLAN_REPS) : l.target;
    n += targetSets > 0 ? Math.min(done, targetSets) : done;
  }
  return n;
}

/** Minutes de séance équivalentes au volume bouclé (terme de durée de l'XP). */
export function comboImpliedMinutes(c: ComboChallenge): number {
  return comboCountedSets(c) * COMBO_SET_MIN;
}

/** Décompose l'XP d'UN Défi 360 : durée (volume bouclé), reps (+ tonnage), prime de
 *  bouclage, dépassement (pour l'affichage sur les défis terminés). Mêmes formules que
 *  comboXpPoints. */
export function comboXpBreakdown(c: ComboChallenge): {
  reps: number;
  duration: number;
  bonus: number;
  surpass: number;
  total: number;
} {
  let reps = 0;
  let tonnage = 0;
  for (const l of c.legs) {
    for (const s of legSets(l)) {
      reps += (s.reps || 0) * REP_XP * (l.rep_weight ?? 1) * assistMult(s.assisted);
      tonnage += (s.reps || 0) * (s.weight ?? l.weight_kg ?? 0);
    }
  }
  const bonus = comboComplete(c) ? 0.25 * comboTargetEffort(c) * (1 + comboEarlyFraction(c)) : 0;
  const over = comboOverachievement(c);
  const durationXp = Math.round(comboImpliedMinutes(c) * MUSCU_MIN_XP * XP_MULT);
  const repsXp = Math.round((reps + tonnage / 500) * XP_MULT);
  const bonusXp = Math.round(bonus * XP_MULT);
  return {
    reps: repsXp,
    duration: durationXp,
    bonus: bonusXp,
    surpass: over.bonusXp,
    total: repsXp + durationXp + bonusXp + over.bonusXp,
  };
}

/** XP d'un ensemble de Défis 360 (façon séance : durée + reps + prime + dépassement). */
export function comboXpPoints(combos: ComboChallenge[]): number {
  return combos.reduce((a, c) => {
    let reps = 0;
    let tonnage = 0;
    for (const l of c.legs) {
      for (const s of legSets(l)) {
        reps += (s.reps || 0) * REP_XP * (l.rep_weight ?? 1) * assistMult(s.assisted);
        tonnage += (s.reps || 0) * (s.weight ?? l.weight_kg ?? 0);
      }
    }
    const duration = comboImpliedMinutes(c) * MUSCU_MIN_XP;
    const bonus = comboComplete(c) ? 0.25 * comboTargetEffort(c) * (1 + comboEarlyFraction(c)) : 0;
    const over = comboOverachievement(c);
    const surpass = COMBO_SURPASS_MULT * over.extraXp * over.balance;
    return a + Math.round((reps + tonnage / 500 + duration + bonus + surpass) * XP_MULT);
  }, 0);
}

export interface ComboSessionExo {
  exercise_id: string;
  exercise_name: string;
  weight_kg?: number | null;
  sets: number[]; // reps par série (ou SECONDES si `time`)
  time?: boolean; // exo de DURÉE (gainage) → chrono au lieu de reps/poids
}

export const COMBO_EXEC_SEC = 40; // durée d'exécution moyenne d'une série

/** Nb de séries qui tiennent dans une séance de `minutes` (exécution + repos). */
export function comboSessionSetBudget(minutes: number, restSec: number): number {
  const perSet = COMBO_EXEC_SEC + Math.max(0, restSec);
  return Math.max(1, Math.floor((minutes * 60) / perSet));
}

/** Durée estimée (min) d'une séance de `sets` séries (exécution + repos) → affichage
 *  quand on choisit directement le nombre de séries. */
export function comboSessionDurationMin(sets: number, restSec: number): number {
  const perSet = COMBO_EXEC_SEC + Math.max(0, restSec);
  return Math.max(1, Math.round((sets * perSet) / 60));
}

/**
 * Génère une SÉANCE à partir des SÉRIES restantes : on ne dump pas tout — on
 * remplit un BUDGET de séries (soit choisi directement via `sets`, soit déduit
 * d'un temps `minutes`), réparti en round-robin sur les exos dont il reste des
 * séries. Chaque série reprend les reps de la dernière faite (ou un défaut). Pur/testable.
 */
export function buildComboSession(
  c: ComboChallenge,
  opts: { minutes?: number; restSec: number; sets?: number; includeIds?: string[] },
): ComboSessionExo[] {
  const budget = opts.sets ?? comboSessionSetBudget(opts.minutes ?? 30, opts.restSec);
  // Sélection manuelle éventuelle : ne garder que les exos choisis (sinon tous).
  const include = opts.includeIds ? new Set(opts.includeIds) : null;
  const exos = c.legs
    .filter((l) => !include || include.has(l.exercise_id))
    .map((l) => {
      const reps = legLastReps(l);
      // Séries restantes à générer : direct en mode 'sets' ; en mode 'reps' on
      // convertit les reps restantes en nb de séries (à ~reps/série).
      const remaining =
        legMode(l) !== 'sets' ? Math.ceil(legRemaining(l) / Math.max(1, reps)) : legRemaining(l);
      return { leg: l, remaining, reps, sets: [] as number[] };
    })
    .filter((e) => e.remaining > 0);
  let placed = 0;
  while (placed < budget && exos.some((e) => e.remaining > 0)) {
    for (const e of exos) {
      if (placed >= budget) break;
      if (e.remaining <= 0) continue;
      e.sets.push(e.reps);
      e.remaining -= 1;
      placed++;
    }
  }
  return exos
    .filter((e) => e.sets.length)
    .map((e) => ({
      exercise_id: e.leg.exercise_id,
      exercise_name: e.leg.exercise_name,
      weight_kg: legLastWeight(e.leg),
      sets: e.sets,
      time: legMode(e.leg) === 'time',
    }));
}

/** Construit une séance à partir d'un nombre de séries CHOISI PAR EXO (indépendant).
 *  `counts` = { exercise_id: nb de séries }. Chaque série reprend les reps de la
 *  dernière faite (ou un défaut). Ordre = celui des legs du défi. Pur/testable. */
export function buildComboSessionFromCounts(
  c: ComboChallenge,
  counts: Record<string, number>,
): ComboSessionExo[] {
  const out: ComboSessionExo[] = [];
  for (const l of c.legs) {
    const n = Math.max(0, Math.floor(counts[l.exercise_id] ?? 0));
    if (n <= 0) continue;
    const reps = legLastReps(l);
    out.push({
      exercise_id: l.exercise_id,
      exercise_name: l.exercise_name,
      weight_kg: legLastWeight(l),
      sets: Array.from({ length: n }, () => reps),
      time: legMode(l) === 'time',
    });
  }
  return out;
}

/** Objectif de SÉRIES/semaine suggéré pour un emplacement (repère hypertrophie
 *  ~10-15 séries/muscle/sem). Essentiel ~12, optionnel ~9, ajusté au niveau. */
export function suggestComboTarget(level: Level, essential: boolean): number {
  const base = essential ? 12 : 9;
  const f = level === 'debutant' ? 0.75 : level === 'avance' ? 1.3 : 1;
  return Math.max(4, Math.round(base * f));
}

/** Suggère un objectif pour un exo à partir de l'HISTORIQUE : reprend le `target`
 *  du dernier Défi 360 contenant cet exo (converti si le mode diffère : séries↔reps
 *  via ~COMBO_PLAN_REPS reps/série). `null` si aucun historique. Pur/testable. */
export function suggestComboTargetFromHistory(
  exerciseId: string,
  mode: ComboCountMode,
  history: ComboChallenge[],
): number | null {
  // Le plus récent d'abord (start_date décroissant).
  const sorted = [...history].sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  for (const c of sorted) {
    const leg = c.legs.find((l) => l.exercise_id === exerciseId && l.target > 0);
    if (!leg) continue;
    const pastMode = legMode(leg);
    if (pastMode === mode) return leg.target;
    // Conversion approx entre unités (séries ↔ reps/secondes, ~COMBO_PLAN_REPS/série).
    return mode !== 'sets'
      ? leg.target * COMBO_PLAN_REPS
      : Math.max(1, Math.round(leg.target / COMBO_PLAN_REPS));
  }
  return null;
}

// --- Dimensionnement FULL-BODY par volume + variété ------------------------
// Le Défi 360 renforce TOUT le corps (tous les groupes), sans notion de séances
// ni de split (on fait ses séries quand on veut dans la semaine). Deux réglages
// honnêtes : le VOLUME (léger/modéré/intense → séries/groupe) et la VARIÉTÉ
// (peu/moyen/beaucoup → nb d'exos/groupe). Débutant : variété forcée à 1 exo et
// groupes accessoires exclus (le plus simple) ; inter/avancé : tout est ouvert.

export type ComboVolume = 'light' | 'moderate' | 'intense';
export type ComboVariety = 'low' | 'med' | 'high';
const VOLUME_MULT: Record<ComboVolume, number> = { light: 0.6, moderate: 1, intense: 1.4 };
// La variété est un PLAFOND d'exos/groupe ; le nombre réel découle du volume
// (on vise ~SETS_PER_EXO séries par exo → un gros volume = plus d'exos, jamais
// 13 séries d'un seul mouvement).
const VARIETY_CAP: Record<ComboVariety, number> = { low: 1, med: 2, high: 3 };
const SETS_PER_EXO = 5;

/** Volume hebdo de base par muscle (séries) selon le niveau (repère hypertrophie). */
export function comboBaseWeekly(level: Level): number {
  return level === 'debutant' ? 9 : level === 'avance' ? 15 : 12;
}
/** Séries/sem cible pour un groupe selon niveau + volume (essentiel ×1, accessoire ×0.7). */
export function comboWeeklySets(level: Level, volume: ComboVolume, essential = true): number {
  return Math.max(
    3,
    Math.round(comboBaseWeekly(level) * VOLUME_MULT[volume] * (essential ? 1 : 0.7)),
  );
}

// Zone du corps ciblée (pour les blessés ou ceux qui zappent une partie).
export type ComboZone = 'full' | 'haut' | 'bas';
const HAUT_MUSCLES = new Set(['pectoraux', 'dos', 'épaules', 'biceps', 'triceps']);
const BAS_MUSCLES = new Set(['quadriceps', 'ischio-jambiers', 'mollets', 'fessiers']);
/** Un muscle est-il dans la zone choisie ? Le tronc (abdos/lombaires) compte dans
 *  les deux (haut = tout sauf le bas ; bas = tout sauf le haut). */
export function comboMuscleInZone(muscle: string | null | undefined, zone: ComboZone): boolean {
  if (zone === 'full') return true;
  const m = muscle ?? '';
  return zone === 'haut' ? !BAS_MUSCLES.has(m) : !HAUT_MUSCLES.has(m);
}

export interface ComboSlotSpec {
  key: string;
  muscles: string[];
  essential: boolean;
}
export interface ComboSlotPlan {
  slot: string;
  active: boolean; // groupe inclus dans le défi
  nExos: number; // nb d'exos suggérés (variété)
  weeklySets: number; // séries/sem pour le groupe (total)
  setsPerExo: number; // séries/sem par exo (= weeklySets / nExos)
}

// ── Emphase par groupe : objectif physique + complémentarité avec les sports ──
// Le Défi 360 s'adapte : un objectif « sculpter » booste les groupes esthétiques ;
// les sports d'endurance (course/trail…) matraquant déjà les jambes, on RÉDUIT leur
// volume muscu (anti-surmenage) et on renforce le haut + fessiers/gainage. Pur.
export type ComboGoal = 'sculpt' | 'perf' | 'balanced';

// muscle_primary → emplacement du 360.
const MUSCLE_SLOT: Record<string, string> = {
  pectoraux: 'push',
  dos: 'pull',
  quadriceps: 'squat',
  'ischio-jambiers': 'hinge',
  fessiers: 'hinge',
  abdominaux: 'core',
  lombaires: 'core',
  biceps: 'arms',
  triceps: 'arms',
  épaules: 'shoulders',
  mollets: 'shoulders',
};
// Multiplicateur de volume par emplacement selon l'objectif.
const GOAL_SLOT_MULT: Record<ComboGoal, Record<string, number>> = {
  // Esthétique : haut du corps + fessiers + abdos ; jambes un cran plus bas.
  sculpt: {
    push: 1.15,
    pull: 1.15,
    squat: 0.9,
    hinge: 1.15,
    core: 1.1,
    arms: 1.2,
    shoulders: 1.15,
  },
  // Perf/fonctionnel : chaîne postérieure + gainage + composés ; moins d'isolation.
  perf: { push: 1.0, pull: 1.1, squat: 1.1, hinge: 1.2, core: 1.2, arms: 0.8, shoulders: 0.95 },
  balanced: {},
};
// Groupes musculaires déjà sollicités par un sport (nom → muscle_primary).
const SPORT_LOADS: Record<string, string[]> = {
  Course: ['quadriceps', 'ischio-jambiers', 'mollets'],
  Trail: ['quadriceps', 'ischio-jambiers', 'mollets'],
  Marche: ['quadriceps', 'mollets'],
  Randonnée: ['quadriceps', 'mollets'],
  Vélo: ['quadriceps'],
  "Vélo d'appart": ['quadriceps'],
  Tennis: ['épaules', 'abdominaux', 'quadriceps'],
  Padel: ['épaules', 'abdominaux'],
  Squash: ['épaules', 'abdominaux', 'quadriceps'],
  Badminton: ['épaules', 'abdominaux'],
  Natation: ['dos', 'épaules'],
  Football: ['quadriceps', 'ischio-jambiers'],
  Basket: ['quadriceps', 'mollets'],
  Aviron: ['dos', 'ischio-jambiers'],
  Escalade: ['dos', 'biceps'],
};

/** Objectif de profil → objectif de défi (préréglage). */
export function objectiveToGoal(o?: Objective | null): ComboGoal {
  if (o === 'force' || o === 'endurance') return 'perf';
  if (o === 'remise_en_forme') return 'balanced';
  return 'sculpt'; // hypertrophie / perte_de_gras / défaut
}

/** Poids de volume par emplacement : objectif × complémentarité sports × prioritaires.
 *  Borné [0.6, 1.45] pour rester raisonnable. Pur/testable. */
export function comboEmphasis(
  goal: ComboGoal,
  sports?: SportPractice[] | null,
  priorityMuscles?: string[] | null,
): Record<string, number> {
  const slots = ['push', 'pull', 'squat', 'hinge', 'core', 'arms', 'shoulders'];
  const w: Record<string, number> = {};
  for (const s of slots) w[s] = GOAL_SLOT_MULT[goal][s] ?? 1;
  // Sports : réduit les emplacements déjà chargés (∝ fréquence × intensité).
  for (const sp of sports ?? []) {
    const factor =
      (sp.sessions_per_week || 1) *
      (sp.intensity === 'elevee' ? 1.3 : sp.intensity === 'faible' ? 0.6 : 1);
    for (const m of SPORT_LOADS[sp.name] ?? []) {
      const slot = MUSCLE_SLOT[m];
      if (slot) w[slot]! *= 1 - Math.min(0.28, 0.05 * factor);
    }
  }
  // Muscles prioritaires (profil) : boost.
  for (const m of priorityMuscles ?? []) {
    const slot = MUSCLE_SLOT[m.trim().toLowerCase()];
    if (slot) w[slot]! *= 1.2;
  }
  for (const s of slots) w[s] = Math.round(Math.max(0.6, Math.min(1.45, w[s]!)) * 100) / 100;
  return w;
}

/**
 * Plan FULL-BODY : tous les groupes essentiels sont actifs (+ les accessoires,
 * hors débutant). Le VOLUME (séries/groupe) vient de `volume`, la VARIÉTÉ (nb
 * d'exos/groupe) de `variety` ; `emphasis` (optionnel) module le volume par
 * emplacement (objectif + sports). Pur/testable.
 */
export function suggestFullBodyPlan(
  level: Level,
  volume: ComboVolume,
  variety: ComboVariety,
  slots: ComboSlotSpec[],
  emphasis?: Record<string, number>,
): ComboSlotPlan[] {
  const cap = VARIETY_CAP[variety];
  return slots.map((s) => {
    // Le BRAS est TOUJOURS proposé (même en débutant) — les bras sont un groupe
    // motivant qu'on ne veut pas laisser tomber en silence (ticket adbc5ff4). Les
    // autres accessoires (épaules/mollets) restent réservés à inter/avancé.
    const active = s.essential || s.key === 'arms' || level !== 'debutant';
    if (!active) return { slot: s.key, active: false, nExos: 0, weeklySets: 0, setsPerExo: 0 };
    const mult = emphasis?.[s.key] ?? 1;
    const weeklySets = Math.max(3, Math.round(comboWeeklySets(level, volume, s.essential) * mult));
    // Nb d'exos = volume / ~5 séries, borné par le plafond de variété (accessoires : 1).
    const wanted = Math.max(1, Math.round(weeklySets / SETS_PER_EXO));
    const nExos = s.essential ? Math.min(cap, wanted) : 1;
    const setsPerExo = Math.max(1, Math.round(weeklySets / nExos));
    return { slot: s.key, active: true, nExos, weeklySets, setsPerExo };
  });
}
