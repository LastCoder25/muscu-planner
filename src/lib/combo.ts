// combo.ts — logique pure du Défi 360 (défi combiné hebdo full-body). Pur/testable.
// Modèle SÉRIES : l'objectif d'un exo = un nombre de SÉRIES/semaine (repère
// hypertrophie), chaque série enregistrée porte ses reps + son poids. XP façon
// séance : Σ reps×REP_XP×poids-de-rep + tonnage/500 + prime de bouclage.
import { REP_XP, assistMult, XP_MULT, MUSCU_MIN_XP } from './athlete';
// ⚠️ La règle d'arrêt est COMMUNE aux deux familles de défis : un 360 n'est qu'un défi
// d'une autre forme, et l'utilisateur attend le même comportement (« on garde les séries
// faites s'il a été commencé, comme pour les challenges »).
import { stopPlan, type StopPlan } from './challenges';
import { daysBetweenIso } from './loginStreak';
import { localDayIso } from './localDay';
import { mulberry32 } from './combat';
import { bodyweightLoad } from './bodyweightLoad';
import { addDaysUtcIso } from './startDate';
import { COMBO_SLOTS, comboSlot, comboSlotRank, swapSlotsOf, variantFamilyKey } from '@/data/combo';
import type { Level, Objective, SportPractice } from './types';
import type { ComboChestRecord } from './comboChest';
import {
  repRangeFor,
  repRangeForExercise,
  correctForExercise,
  prescribedReps,
  TIME_RANGE,
  type RepRange,
} from './repScheme';

export interface ComboSet {
  date: string; // YYYY-MM-DD
  reps: number;
  weight?: number | null; // charge de la série (kg) — poids du corps = vide
  assisted?: boolean; // exo poids du corps fait assisté (élastique/machine) → XP ×0,6
  /** Heure de saisie (ISO) : distingue les séries enchaînées des séries étalées pour le
   *  conseil de charge. Absente des séries saisies avant la v0.1159. */
  at?: string;
  /** Série FAITE SUR UN AUTRE EXO puis basculée ici par un changement d'exo en cours de
   *  défi (`transferComboLeg`). Elle compte pour l'avancement et les paliers de l'exo qui
   *  la porte, mais son XP, son tonnage et ses muscles restent ceux de l'exo d'origine :
   *  sans cette trace, 3 séries de squat barre deviendraient rétroactivement 3 séries de
   *  fentes, et l'XP déjà versée changerait. Absente = faite sur l'exo qui la porte. */
  origin?: ComboSetOrigin;
}
/** Ce qu'une série déplacée garde de l'exo sur lequel elle a été faite. */
export interface ComboSetOrigin {
  exercise_id: string;
  exercise_name: string;
  muscle_primary?: string | null;
  rep_weight: number;
  /** Charge mémorisée de l'exo d'origine : une série sans charge propre la reprenait pour
   *  le tonnage (`s.weight ?? leg.weight_kg`). La garder rend l'XP identique au bit près. */
  weight_kg?: number | null;
  /** Ce qui a VRAIMENT été fait, quand la série a été convertie à la bascule (reps, charge
   *  et assistance de l'exo d'origine). La série, elle, porte les valeurs de l'exo cible :
   *  c'est ce qui compte pour l'avancement et ce qui s'affiche dans son suivi (12 dips
   *  deviennent 5 reps de développé couché). Absente = série basculée avant la conversion
   *  (v0.1386) : ses valeurs sont alors celles de l'exo d'origine. */
  done?: ComboSetWork;
}
/** Reps (ou secondes), charge et assistance d'une série. */
export interface ComboSetWork {
  reps: number;
  weight?: number | null;
  assisted?: boolean;
}
// Ancien format (reps cumulées/jour) — lu pour migration des défis existants.
interface ComboLegEntry {
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
  // Fourchette de reps CONSEILLÉE pour cet exo, FIGÉE à la création depuis l’objectif
  // d’entraînement (force / hypertrophie / endurance…) et corrigée par la nature de
  // l’exo (gainage → secondes, isolation → plancher relevé). Figée, et non relue du
  // profil à l’affichage : un 360 est le contrat de la semaine, il ne doit pas changer
  // sous les pieds du joueur qui édite son objectif en cours de route. Absente des 360
  // créés avant — cf. le repli de legRepRange.
  rep_min?: number;
  rep_max?: number;
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
  /** Contenu du coffre de fin, conservé au bouclage (migr. 0064). */
  chest?: ComboChestRecord | null;
  /** Réglages du défi. ⚠️ La colonne `config` jsonb existe déjà en base et était VIDE
   *  partout (mesuré) : y poser une marque ne demande aucune migration. */
  config?: ComboConfig | null;
}

interface ComboConfig {
  /** Le joueur a CLÔTURÉ lui-même (bouton retiré en v1.53 : le 360 se ferme seul à
   *  l'objectif). Encore lu pour les 360 clôturés ainsi avant. */
  closed_by_user?: boolean;
}

// Reps supposées par série pour l'estimation du volume planifié (prime de bouclage).
export const COMBO_PLAN_REPS = 10;

/** Retire UNE série précise (celle qu'on a touchée), pas forcément la dernière.
 *  Rend une NOUVELLE liste ; un index hors limites (négatif, trop grand, décimal) ne
 *  retire rien, par construction du filtre — un double tap sur une case qui vient de
 *  disparaître ne doit pas emporter la voisine. */
export function removeSetAt(sets: readonly ComboSet[], index: number): ComboSet[] {
  return sets.filter((_, i) => i !== index);
}
/** Corrige UNE série (la case touchée) : reps, charge et assistance changent, le JOUR reste
 *  celui où elle a été faite — c’est lui qui décide si elle compte dans les temps. Un index
 *  hors limites ne change rien. */
export function updateSetAt(
  sets: readonly ComboSet[],
  index: number,
  patch: { reps: number; weight: number | null; assisted: boolean },
): ComboSet[] {
  return sets.map((s, i) =>
    i === index
      ? { ...s, reps: patch.reps, weight: patch.weight ?? null, assisted: patch.assisted }
      : s,
  );
}

/** Séries réalisées (avec repli : convertit l'ancien `progress` en séries). */
export function legSets(leg: ComboLeg): ComboSet[] {
  if (leg.sets) return leg.sets;
  if (leg.progress)
    return leg.progress.map((p) => ({ date: p.date, reps: p.reps, weight: leg.weight_kg ?? null }));
  return [];
}
/** L'exo sur lequel une série a VRAIMENT été faite : son origine si elle a été basculée,
 *  sinon l'exo qui la porte. Source unique de l'XP, du tonnage, des muscles et de
 *  l'historique d'une série — tout lecteur qui lit `leg.rep_weight` ou `leg.exercise_id`
 *  pour une série doit passer par ici. */
export function setOrigin(leg: ComboLeg, s: ComboSet): ComboSetOrigin {
  return (
    s.origin ?? {
      exercise_id: leg.exercise_id,
      exercise_name: leg.exercise_name,
      muscle_primary: leg.muscle_primary ?? null,
      rep_weight: leg.rep_weight ?? 1,
      weight_kg: leg.weight_kg ?? null,
    }
  );
}
/** Ce qui a VRAIMENT été fait pendant une série : ses valeurs, ou celles d'origine si elle
 *  a été convertie à la bascule. Source unique de l'XP, du tonnage, des statistiques et de
 *  l'agenda — l'avancement, lui, lit la série telle qu'elle est posée sur l'exo. */
export function setWork(leg: ComboLeg, s: ComboSet): ComboSetWork {
  return setOrigin(leg, s).done ?? s;
}
/** Charge d'une série pour le tonnage (repli sur la charge mémorisée de SON exo). */
function setLoad(leg: ComboLeg, s: ComboSet): number {
  return setWork(leg, s).weight ?? setOrigin(leg, s).weight_kg ?? 0;
}
/**
 * 💪 LES REPS D'UNE SÉRIE EN « ÉQUIVALENT-REPS » (2026-10-10, demandé : « ma série de 5
 * tractions, très dure, rapporte bien moins que des séries faciles de 20 reps »).
 *
 * La part reps de l'XP payait le NOMBRE de reps : 20 ponts fessiers valaient plus de trois
 * fois 6 tractions, alors qu'une série menée près de l'échec est un stimulus comparable
 * qu'elle compte 6 ou 20 reps. On compresse donc en RACINE autour de la série de référence
 * (`COMBO_PLAN_REPS`, 10 reps) : 10 reps valent toujours 10, 6 en valent 7,7, 20 en valent
 * 14,1. Faire plus de reps paie encore, mais un exercice dur à reps basses n'est plus écrasé.
 * ⚠️ Pas pour les exos au TEMPS : leurs « reps » sont des secondes, barème à part.
 */
export function repsEquivalent(reps: number): number {
  if (!(reps > 0)) return 0;
  return COMBO_PLAN_REPS * Math.sqrt(reps / COMBO_PLAN_REPS);
}
/**
 * ⚠️ PAS RÉTROACTIF (2026-10-10, signalé : « mon niveau a baissé »). Appliquée à tout
 * l'historique, la racine retirait ~1 450 XP au compte (beaucoup de séries à 12-18 reps) et
 * le faisait redescendre d'un niveau. Seules les séries faites à partir de cette date
 * comptent en équivalent-reps ; les séries d'avant gardent le barème linéaire avec lequel
 * elles ont été jouées. Une date absente (série très ancienne) = barème d'avant.
 */
export const REPS_EQUIVALENT_FROM = '2026-10-11';
/** Reps d'une série telles que l'XP les compte : compressées (séries récentes), sauf au
 *  temps. */
function setRepUnits(leg: ComboLeg, reps: number, date?: string | null): number {
  if (legMode(leg) === 'time') return Math.max(0, reps);
  if (!date || date < REPS_EQUIVALENT_FROM) return Math.max(0, reps);
  return repsEquivalent(reps);
}
/** XP « reps » d'une série (pré-XP_MULT), sur ce qui a VRAIMENT été fait : reps (en
 *  équivalent-reps) × poids de rep de son exo d'origine × assistance. */
function setRepXp(leg: ComboLeg, s: ComboSet): number {
  const w = setWork(leg, s);
  return (
    setRepUnits(leg, w.reps || 0, s.date) *
    REP_XP *
    setOrigin(leg, s).rep_weight *
    assistMult(w.assisted)
  );
}
/** Tonnage d'une série (reps × charge), sur ce qui a vraiment été fait. La charge comprend
 *  la part du POIDS DU CORPS des polyarticulaires sans matériel (`bodyweightLoad`). */
function setTonnage(leg: ComboLeg, s: ComboSet, bodyKg?: number | null): number {
  const w = setWork(leg, s);
  const body = bodyweightLoad(setOrigin(leg, s).exercise_id, bodyKg, assistMult(w.assisted));
  return (w.reps || 0) * (setLoad(leg, s) + body);
}
/** Part de travail réel par unité comptée : 12 dips posés comme 5 reps de développé couché
 *  valent 12/5. 1 pour une série qui n'a pas été convertie. */
function workRatio(leg: ComboLeg, s: ComboSet): number {
  const w = setWork(leg, s).reps || 0;
  return s.reps > 0 ? w / s.reps : 1;
}
/** « ↪ Dips · 12 reps · 20 kg » : l'exo et les vraies valeurs d'une série basculée.
 *  `null` pour une série faite sur l'exo qui la porte. */
export function setOriginLabel(leg: ComboLeg, s: ComboSet): string | null {
  if (!s.origin) return null;
  const w = setWork(leg, s);
  const unit = legMode(leg) === 'time' ? 's' : 'reps';
  let t = `${s.origin.exercise_name} · ${w.reps} ${unit}`;
  if (w.weight) t += ` · ${w.weight} kg`;
  if (w.assisted) t += ' · assisté';
  return t;
}
/** Séries faites sur l'exo lui-même (sans celles basculées d'un autre) : c'est elles qui
 *  préremplissent la série suivante et nourrissent le conseil de charge — 40 kg de
 *  développé couché ne disent rien de la charge des dips. */
export function ownSets(leg: ComboLeg): ComboSet[] {
  return legSets(leg).filter((s) => !s.origin);
}
/** Nombre de séries faites. */
export function legSetsDone(leg: ComboLeg): number {
  return legSets(leg).length;
}
/**
 * 🛑 ARRÊTER UN DÉFI 360 : ce que ça doit faire, et comment le dire.
 *
 * ⚠️ DEUX ISSUES, ET LA DIFFÉRENCE COMPTE. Des séries déjà faites ont alimenté l’XP et
 * l’énergie : on ne peut pas les effacer sans retirer au joueur un effort réel, donc le
 * défi passe en **abandonné** et son travail reste compté. Un 360 VIERGE, lui, n’a rien
 * produit — le supprimer ne coûte rien à personne, et le laisser traîner en « abandonné »
 * salit un historique qu’on relit.
 *
 * ⚠️ C’EST EXACTEMENT LE CAS SIGNALÉ : un 360 créé par erreur (pour montrer à quoi ça
 * ressemble) doit **disparaître**, pas s’installer dans les archives.
 *
 * ⚠️ UNE SEULE DÉFINITION, LIBELLÉS COMPRIS. La règle vivait déjà dans l’écran de détail,
 * et elle y était CONTREDITE par le bouton voisin : le 🗑 supprimait un 360 vierge tandis
 * que « Abandonner », juste en dessous, l’archivait toujours. Deux contrôles pour une
 * action, deux résultats — et l’écran où l’on consulte réellement son défi (l’onglet
 * 🎯 Défi 360) n’en proposait aucun.
 */
export function comboStopPlan(c: ComboChallenge): StopPlan {
  // ⚠️ `legSetsDone` et non `legDone` : il compte les ENTRÉES, donc il voit la progression
  // dans les deux modes (séries ET reps, `legSets` repliant l’ancien `progress`). Avec
  // `legDone`, un exo en mode reps dont toutes les entrées valent 0 passerait pour vierge.
  return stopPlan(
    (c.legs ?? []).some((l) => legSetsDone(l) > 0),
    'ce Défi 360',
  );
}

/** Reps totales réalisées (pour l'XP / la séance générée). */
export function legReps(leg: ComboLeg): number {
  return legSets(leg).reduce((a, s) => a + (s.reps || 0), 0);
}
/** Mode de comptage de l'exo (défaut 'sets' pour les défis existants). */
export function legMode(leg: ComboLeg): ComboCountMode {
  return leg.count_mode ?? 'sets';
}

/** 📑 L'ORDRE D'AFFICHAGE DES EXOS D'UN DÉFI 360 : PAR GROUPE MUSCULAIRE (demandé par
 *  l'utilisateur), dans l'ordre des emplacements (`COMBO_SLOTS` : Poussée, Tirage, Squat,
 *  Charnière, Gainage, Biceps, Triceps, Épaules & mollets), puis ALPHABÉTIQUE dans chaque
 *  groupe. L'ancien « Bras » se range avec les bras, un emplacement inconnu en dernier
 *  (`comboSlotRank`).
 *
 *  ⚠️ L'ORDRE EST STABLE : il ne dépend PAS de l'avancement. Avant la v0.903 les écrans
 *  triaient par avancement, donc la liste se réordonnait PENDANT la saisie et on perdait sa
 *  place au milieu d'une séance. Un exo fini ne descend en bas que SANS filtre actif
 *  (`filterLegsByZone`, 'all'), et seulement une fois son objectif atteint.
 *
 *  ⚠️ NE RÉORDONNE JAMAIS `legs` — la copie est délibérée. La séance générée indexe les
 *  emplacements (`buildComboSessionFromCounts` reçoit un `counts` par exo, le runner
 *  numérote les séries) : trier la source déplacerait ce que le joueur a coché.
 *
 *  `localeCompare` en français : les accents se rangent comme on les lit, et `numeric`
 *  met « Pompes 2 » avant « Pompes 10 ». Source unique des trois écrans (fiche du 360,
 *  onglet 🎯, préparation de séance). */
export function legsByGroup<T extends { exercise_name: string; slot: string }>(
  legs: readonly T[],
): T[] {
  return [...legs].sort(
    (a, b) =>
      comboSlotRank(a.slot) - comboSlotRank(b.slot) ||
      a.exercise_name.localeCompare(b.exercise_name, 'fr', { numeric: true, sensitivity: 'base' }),
  );
}
/** Libellé de l'unité de l'objectif (séries / reps / sec) selon le mode.
 *
 *  ⚠️ NE PAS l'unifier avec `challengeValueUnit` (petits défis), malgré la ressemblance :
 *  ici « time » veut TOUJOURS dire des SECONDES au chrono, parce qu'un exo de SORTIE
 *  (marche/course/vélo) ne peut pas être un emplacement du 360 — les slots se mappent sur
 *  `muscle_primary`, et « cardio » n'en est pas un. Le mode vient du LEG, pas de l'unité
 *  de l'exercice : les deux fonctions ne répondent pas à la même question. */
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
  const s = ownSets(leg);
  return s.length ? (s[s.length - 1]!.weight ?? null) : (leg.weight_kg ?? null);
}
/** Reps de préremplissage : reps de la dernière série (sinon défaut). */
export function legLastReps(leg: ComboLeg, fallback = COMBO_PLAN_REPS): number {
  const s = ownSets(leg);
  return s.length ? s[s.length - 1]!.reps : fallback;
}
/** État « assisté » de préremplissage : celui de la dernière série. */
export function legLastAssisted(leg: ComboLeg): boolean {
  const s = ownSets(leg);
  return s.length ? !!s[s.length - 1]!.assisted : false;
}

/** Fourchette de reps conseillée d’un exo. Repli pour les 360 créés avant qu’elle
 *  existe : on recalcule depuis l’objectif passé en second (sinon le défaut du schéma).
 *  Ne renvoie JAMAIS null → aucun écran n’a de cas particulier à gérer. */
export function legRepRange(leg: ComboLeg, objective?: Objective | null): RepRange {
  const time = legMode(leg) === 'time';
  // Figée à la création, mais CORRIGÉE à la lecture pour les exos qui ont leur propre
  // fourchette (burpees, pompes…) : la valeur figée par une version d’avant était fausse.
  if (leg.rep_min != null && leg.rep_max != null)
    return time
      ? { min: leg.rep_min, max: leg.rep_max, rest: TIME_RANGE.rest }
      : correctForExercise(
          { min: leg.rep_min, max: leg.rep_max, rest: repRangeFor(objective).rest },
          leg.exercise_id,
        );
  return repRangeForExercise(objective, {
    time,
    muscle_primary: leg.muscle_primary,
    id: leg.exercise_id,
  });
}

/** Avancement global = MOYENNE des fractions de complétion par exo (mode-neutre :
 *  chaque exo compte pour 1, quel que soit son unité séries/reps → on peut mélanger).
 *  Au DIXIÈME près (demandé : le % exact). ⚠️ L’arrondi ne ment jamais aux bornes : un
 *  défi incomplet ne s’affiche pas 100 %, un défi entamé ne s’affiche pas 0 %. */
export function comboProgressPct(c: ComboChallenge): number {
  if (!c.legs.length) return 0;
  // ⚠️ Chaque exo est borné à 100 % : un exo d'avant la v1.53 qui a dépassé son objectif
  // ne compense pas le retard d'un autre (il n'y a plus de séries bonus).
  const frac = c.legs.reduce((a, l) => {
    if (l.target <= 0) return a;
    return a + Math.min(1, legDone(l) / l.target);
  }, 0);
  const exact = (frac / c.legs.length) * 100;
  const pct = Math.round(exact * 10) / 10;
  if (pct >= 100 && exact < 100) return 99.9;
  if (pct <= 0 && exact > 0) return 0.1;
  return pct;
}
/** Un pourcentage à la française, décimale seulement si besoin : 75 → « 75 », 66,7 → « 66,7 ». */
export function fmtPct(pct: number): string {
  return (Math.round(pct * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}
export function comboComplete(c: ComboChallenge): boolean {
  return c.legs.length > 0 && c.legs.every((l) => legComplete(l));
}

// ── 📅 LE DÉLAI ET LA FERMETURE (v0.825 ; décisions de l'utilisateur) ─────────────────
// Un 360 se ferme à sa DATE DE FIN, ou plus tôt dès que TOUS ses exos ont atteint leur
// objectif (v1.53 : plus de palier maximal à 120 % ni de séries en plus — qui veut en faire
// davantage lance un challenge à part).
//
// ⚠️ LA SAISIE RESTE OUVERTE APRÈS LA FIN, mais seules les séries FAITES DANS LES TEMPS
// comptent pour la prime et le coffre (choix de l'utilisateur, plutôt que figer la saisie).
// Sans ce filtre, un 360 bouclé en retard était payé comme à l'heure.

/** Dernier jour du défi (inclus), en UTC explicite. */
export function comboEndDate(c: ComboChallenge): string {
  return addDaysUtcIso(c.start_date, Math.max(1, c.duration_days) - 1);
}
/** Le défi tel qu'il était à sa date de fin : seules les séries faites dans les temps. */
export function comboInDeadline(c: ComboChallenge): ComboChallenge {
  return c.duration_days > 0 ? comboUpTo(c, comboEndDate(c)) : c;
}
/** Objectif atteint partout DANS LES TEMPS — le vrai « bouclé ». */
export function comboCompleteInTime(c: ComboChallenge): boolean {
  return comboComplete(comboInDeadline(c));
}
/** Le défi est-il FERMÉ : date de fin passée, ou tous les objectifs atteints dans les temps ? */
export function comboClosed(c: ComboChallenge, today: string): boolean {
  if (c.duration_days > 0 && today > comboEndDate(c)) return true;
  return comboCompleteInTime(c);
}
/** Le joueur a-t-il clôturé lui-même ? (v0.964) — privé : seul `comboNextStatus` s'en sert. */
function comboClosedByUser(c: ComboChallenge): boolean {
  return c.config?.closed_by_user === true;
}
/** Statut qu'un 360 doit porter après une saisie (ou au chargement). Un abandon est définitif.
 *
 *  ⚠️ **UNE DÉCISION DU JOUEUR NE SE RECALCULE PAS** (v0.964) : sans ce garde, un 360
 *  clôturé à l'objectif serait ROUVERT au chargement suivant par la règle de la v0.825,
 *  qui existe pour rattraper les 360 fermés à tort par une version d'avant. Les deux
 *  fermetures sont indistinguables par l'état seul — d'où la marque.
 *
 *  ⚠️ Et on NE rend PAS `done` terminal pour autant, alors que la mesure le permettrait
 *  (zéro 360 `done` dont la période court encore, en base le 2026-09-20) : une fermeture
 *  AUTOMATIQUE doit rester réversible, sinon corriger une série après coup — le geste
 *  que la v0.852 a ajouté — bloquerait la saisie pour toujours. */
export function comboNextStatus(c: ComboChallenge, today: string): ComboChallenge['status'] {
  if (c.status === 'abandoned') return 'abandoned';
  if (comboClosedByUser(c)) return 'done';
  return comboClosed(c, today) ? 'done' : 'active';
}
/** 🎯 LE DÉFI 360 EN COURS d'un joueur — SOURCE UNIQUE (v0.905). La règle vivait en TROIS
 *  exemplaires : le store, l'onglet 🎯 et l'écran d'avancement d'un ami.
 *
 *  ⚠️ `list` doit être triée du PLUS RÉCENT au plus ancien (`created_at desc`, ce que font
 *  les requêtes) : on rend le plus récent encore en cours. C'est ce que le propriétaire voit
 *  sur son propre écran, et un écran qui regarde son voisin doit montrer la même chose.
 *
 *  ⚠️ ON RECALCULE LE STATUT au lieu de lire le champ stocké. Le balayage de fermeture ne
 *  tourne QUE chez le propriétaire (`combo.fetchMine`) : le 360 d'un ami dont la période est
 *  passée reste « actif » en base tant qu'il n'a pas rouvert l'app, et il masque le nouveau.
 *  Signalé : « quand je regarde l'avancement du Défi 360 de Cypher, je ne vois pas son
 *  dernier en date mais l'ancien, déjà à 100 % » — il en avait bien DEUX en base. */
export function activeCombo<T extends ComboChallenge>(list: readonly T[], today: string): T | null {
  return list.find((c) => comboNextStatus(c, today) === 'active') ?? null;
}

/** Le coffre de fin ne récompense qu'un 360 BOUCLÉ dans les temps (choix de l'utilisateur :
 *  pas de coffre pour un 360 partiel) et jamais un abandon. */
export function comboChestEligible(c: ComboChallenge): boolean {
  return c.status !== 'abandoned' && comboCompleteInTime(c);
}

/** Fraction d'avance d'un Défi 360 terminé : jours gagnés / durée (0..~1).
 *  ⚠️ Mesurée au jour où l'objectif a été ATTEINT, pas à la dernière série (un 360 d'avant
 *  la v1.53 a pu recevoir des séries bonus après). */
function comboEarlyFraction(c: ComboChallenge): number {
  if (!comboComplete(c) || c.duration_days <= 0) return 0;
  const dates = [...new Set(c.legs.flatMap((l) => legSets(l).map((s) => s.date)))]
    .filter(Boolean)
    .sort();
  if (!dates.length) return 0;
  const last = dates.find((d) => comboComplete(comboUpTo(c, d))) ?? dates[dates.length - 1]!;
  const daysUsed = daysBetweenIso(c.start_date, last) + 1;
  const saved = Math.max(0, c.duration_days - daysUsed);
  return saved / c.duration_days;
}

// ── Objectifs À PALIERS (secondaire / principal) ──────────────────────────────
// Un exo a 2 paliers dérivés de sa cible (= le PRINCIPAL) : SECONDAIRE (plancher, une
// semaine chargée, 80 %) et PRINCIPAL (l'objectif). Chaque palier débloque une part
// CUMULÉE de la prime de bouclage de cet exo (fini le tout-ou-rien ; un exo à la traîne ne
// bloque plus les autres).
// ⚠️ PLUS DE PALIER MAXIMAL (120 %) NI DE SÉRIES EN PLUS (v1.53, décision de l'utilisateur) :
// un exo qui a atteint son objectif n'accepte plus de série ; qui veut en faire davantage
// lance un challenge à part. Mesuré avant de le retirer : un seul joueur l'utilisait.
const COMBO_TIER_SECONDARY = 0.8; // secondaire = 80 % de la cible
const COMBO_TIER_SHARE = { none: 0, secondary: 0.15, principal: 1 } as const;
export type ComboTier = keyof typeof COMBO_TIER_SHARE;

/** Palier atteint par un exo d'après son avancement (fait / cible). */
export function legTier(l: ComboLeg): ComboTier {
  if (l.target <= 0) return 'none';
  const frac = legDone(l) / l.target;
  if (frac >= 1) return 'principal';
  if (frac >= COMBO_TIER_SECONDARY) return 'secondary';
  return 'none';
}
/** Part CUMULÉE de la prime de l'exo débloquée par le palier atteint (0..1). */
export function legTierShare(l: ComboLeg): number {
  return COMBO_TIER_SHARE[legTier(l)];
}

/** 🔎 L'ÉTAPE EN COURS d'un exo — ce que les filtres du 360 regroupent. Étapes DISJOINTES,
 *  dans l'ordre des couleurs des cases :
 *  - `secondary` : les séries de base (argent) ne sont pas toutes faites ;
 *  - `principal` : il reste des séries JAUNES (objectif pas atteint) ;
 *  - `done`      : objectif atteint (`legComplete`), plus rien à saisir.
 *  Sur un petit objectif, le repère secondaire EST l'objectif : il n'y a pas de zone
 *  secondaire, l'exo commence directement en `principal`. */
export type LegStage = 'secondary' | 'principal' | 'done';
export function legStage(l: ComboLeg): LegStage {
  const t = legTier(l);
  if (t === 'principal') return 'done';
  if (t === 'secondary') return 'principal';
  const m = legTierMarks(l);
  return m.sec === m.principal ? 'principal' : 'secondary';
}

/** Repères AFFICHÉS des paliers d'un exo (nombre de séries/reps à atteindre).
 *
 *  `ceil` et NON `round` : atteindre le nombre affiché doit RÉELLEMENT décrocher le
 *  palier. Avec `round`, un objectif de 9 affichait « Sec. 7 » alors que 7/9 = 78 % < 80 %. */
export function legTierMarks(l: ComboLeg): { sec: number; principal: number } {
  const t = Math.max(0, l.target);
  return { sec: Math.max(1, Math.ceil(t * COMBO_TIER_SECONDARY)), principal: t };
}

/** Palier qu'une CASE de la barre de séries fait avancer (la n-ième série, n ≥ 1).
 *  C'est la COULEUR des cases qui dit le palier : la case « secondaire » est exactement celle
 *  qui débloque le palier secondaire (même source que `legTier`). `beyond` = une série au-delà
 *  de l'objectif, possible seulement sur un 360 d'avant la v1.53 (plus aucune ne s'ajoute). */
export type SegZone = 'secondary' | 'principal' | 'beyond';
export function legSegZone(l: ComboLeg, n: number): SegZone {
  const m = legTierMarks(l);
  if (n > m.principal) return 'beyond';
  // Sur un tout petit objectif le repère secondaire EST l'objectif : pas de zone secondaire.
  if (n > m.sec || m.sec === m.principal) return 'principal';
  return 'secondary';
}

/**
 * 📅 OÙ L’ON DEVRAIT EN ÊTRE, et ce que la barre doit en montrer.
 *
 * ⚠️ UN SEUL DRAPEAU SERVAIT À TROIS CHOSES, et il n’était juste que pour une.
 * `showOnTime` exigeait `onTimePct < 100` — écrit pour le TRAIT 🎯 (« à 100 %, il se
 * confond avec le bout de la barre »), puis réutilisé tel quel pour la ZONE ROSE et pour
 * la ligne « en retard ». Or le DERNIER JOUR l’attendu vaut exactement 100 : le rose
 * s’éteignait donc précisément le jour où tout ce qui reste EST du retard, et la ligne qui
 * l’annonce disparaissait avec lui. Signalé par l’utilisateur (« ça affiche bien en rose les
 * autres jours sauf le dernier »).
 *
 * ⚠️ DEUX ÉCRANS PEIGNAIENT LA MÊME BARRE, chacun sa copie (l’onglet 🎯 Défi 360 et
 * `ComboDetailPage`) — donc le même défaut deux fois. La règle vit ici, les écrans peignent.
 *
 * ⚠️ DATES EN UTC EXPLICITE : le projet s’est déjà fait décaler d’un jour en France par un
 * aller-retour local↔UTC (cf. `startDate.ts`).
 */
export interface ComboPace {
  /** Où l’on devrait en être (0..100). Vaut 100 le dernier jour. */
  onTimePct: number;
  /** Part réellement faite (0..100). */
  donePct: number;
  /** Le RETARD, à peindre en rose — 0 dès qu’on est dans les temps. */
  latePct: number;
  /** Le trait 🎯. ⚠️ Caché à 0 ET à 100 : il s’y confondrait avec un bord de barre. */
  showMark: boolean;
  /** La ligne « en avance / en retard ». Elle, doit rester au dernier jour. */
  showPace: boolean;
  state: 'ahead' | 'behind';
}
/** Rien à dire : pas de défi chargé. ⚠️ Dans la LIB, pas recopié par chaque écran —
 *  les deux qui peignent cette barre en avaient déjà chacun leur exemplaire. */
export const NO_PACE: ComboPace = {
  onTimePct: 0,
  donePct: 0,
  latePct: 0,
  showMark: false,
  showPace: false,
  state: 'ahead',
};

export function comboPace(c: ComboChallenge, today: string): ComboPace {
  const donePct = Math.max(0, Math.min(100, comboProgressPct(c)));
  const jours = Math.max(1, c.duration_days);
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.start_date}T00:00:00Z`);
  const ecoules = today < c.start_date ? 0 : Math.round(ms / 86400000) + 1;
  const onTimePct = Math.round((Math.max(0, Math.min(jours, ecoules)) / jours) * 100);
  const latePct = Math.max(0, onTimePct - donePct);
  return {
    onTimePct,
    donePct,
    latePct,
    showMark: onTimePct > 0 && onTimePct < 100,
    // ⚠️ Pas de `< 100` ici : c’était le défaut. On se tait quand le défi n’a pas commencé,
    // et quand il est bouclé — plus rien n’est en retard, la barre est pleine.
    showPace: c.status === 'active' && onTimePct > 0 && donePct < 100,
    state: donePct >= onTimePct ? 'ahead' : 'behind',
  };
}

/** 🎨 LA BARRE DU 360 PAR ZONE : de 0 à 100 %, la part des séries de base (argent, jusqu'à
 *  80 %) et de l'objectif (jaune, 80 → 100 %), SOMMÉES sur tous les exos. Chaque exo apporte
 *  ce qu'il a fait dans chaque zone, borné à son objectif.
 *
 *  Valeurs en % de la LARGEUR de la barre. ⚠️ Ce n'est PAS tout à fait le % affiché en gros
 *  (`comboProgressPct`, au dixième, qui ne ment pas aux bornes) : la barre montre OÙ en est
 *  chaque zone, le chiffre dit si l'objectif est bouclé. */
export function comboBarParts(c: ComboChallenge): { sec: number; obj: number } {
  const n = c.legs.length;
  if (!n) return { sec: 0, obj: 0 };
  let sec = 0,
    obj = 0;
  for (const l of c.legs) {
    if (l.target <= 0) continue;
    const f = Math.min(1, legDone(l) / l.target);
    sec += Math.min(f, COMBO_TIER_SECONDARY);
    obj += Math.max(0, f - COMBO_TIER_SECONDARY);
  }
  const w = (x: number) => (x / n) * 100;
  return { sec: w(sec), obj: w(obj) };
}

/** 🎨 LES DEUX BARRES DU 360 (secondaire · objectif), chacune en % de SA longueur.
 *
 *  ⚠️ LE ROSE = LE RETARD RÉEL (`comboPace`, en points d'objectif), RÉPARTI dans le vide de
 *  l'argent puis dans celui du jaune — jamais calculé barre par barre, sinon l'avance prise
 *  ailleurs ne réduisait pas le rose de l'argent.
 *
 *  Le trait « dans les temps » se pose au bout du rose quand on est en retard (c'est là qu'on
 *  devrait être), sinon à l'avancement attendu (`onTimePct`) sur l'échelle argent → jaune. */
export interface ComboBarSegment {
  id: 'sec' | 'obj';
  /** Longueur relative (80 · 20). */
  len: number;
  fill: number;
  late: number;
  mark: number | null;
}
/** 🔎 LES BARRES FILTRENT : toucher une barre ne garde que les exos qui y travaillent.
 *  L'argent tant que les séries de base d'un exo ne sont pas faites, le jaune ensuite.
 *  Un exo TERMINÉ (`legStage` 'done') n'est dans AUCUNE zone (`null`) : il n'y travaille
 *  plus, donc le filtre « Objectif » ne le montre pas (demandé). Il reste visible sans filtre. */
export type ComboBarZone = ComboBarSegment['id'];
export type ComboLegFilter = 'all' | ComboBarZone;
export function legBarZone(l: ComboLeg): ComboBarZone | null {
  const st = legStage(l);
  return st === 'done' ? null : st === 'secondary' ? 'sec' : 'obj';
}
/** Sans filtre (« all »), les exos TERMINÉS (objectif atteint, `legStage` 'done') passent en bas de la
 *  liste, chacun dans son ordre d'origine (demandé par l'utilisateur) : ce qui reste à faire
 *  est en tête. Avec un filtre, l'ordre par groupe est gardé tel quel. Copie, jamais en place. */
export function filterLegsByZone<T extends ComboLeg>(legs: readonly T[], f: ComboLegFilter): T[] {
  if (f !== 'all') return legs.filter((l) => legBarZone(l) === f);
  return [
    ...legs.filter((l) => legStage(l) !== 'done'),
    ...legs.filter((l) => legStage(l) === 'done'),
  ];
}

/** 🔎 Les CASES d'un exo qu'on montre sous un filtre de zone (demandé : « en filtrant secondaire
 *  ou objectif, n'afficher que les séries correspondantes »). Sans filtre : toutes, de 1 à
 *  `count`. « Secondaire » : les cases de la zone secondaire ; « Objectif » : celles de la zone
 *  principale. Les numéros restent ceux de la série (n ≥ 1) : libellés, corrections et « ＋ »
 *  visent toujours la bonne série. */
export function legSegNumbers(l: ComboLeg, count: number, f: ComboLegFilter): number[] {
  const all = Array.from({ length: Math.max(0, count) }, (_, i) => i + 1);
  if (f === 'all') return all;
  const zone: SegZone = f === 'sec' ? 'secondary' : 'principal';
  return all.filter((n) => legSegZone(l, n) === zone);
}

export function comboBarSegments(c: ComboChallenge, pace: ComboPace): ComboBarSegment[] {
  const done = comboBarParts(c);
  const secLen = COMBO_TIER_SECONDARY * 100;
  const objLen = (1 - COMBO_TIER_SECONDARY) * 100;
  let reste = Math.max(0, pace.latePct);
  const lateSec = Math.min(reste, Math.max(0, secLen - done.sec));
  reste -= lateSec;
  const lateObj = Math.min(reste, Math.max(0, objLen - done.obj));
  // Où poser le trait, en points d'objectif, et dans quelle barre.
  let mark: { id: 'sec' | 'obj'; at: number } | null = null;
  if (pace.showMark) {
    // Rose arrêté dans l'argent : le trait à son bout (l'avance prise dans le jaune le
    // décale avant l'attendu). Rose qui déborde dans le jaune : son bout tombe PILE sur
    // l'attendu (argent plein + jaune fait + rose = attendu), la règle générale suffit.
    if (lateSec > 0 && lateObj === 0) mark = { id: 'sec', at: done.sec + lateSec };
    else if (pace.onTimePct <= secLen) mark = { id: 'sec', at: pace.onTimePct };
    else mark = { id: 'obj', at: pace.onTimePct - secLen };
  }
  const seg = (id: 'sec' | 'obj', len: number, d: number, late: number) => ({
    id,
    len,
    fill: Math.min(100, (d / len) * 100),
    late: (late / len) * 100,
    mark: mark && mark.id === id && mark.at > 0 && mark.at < len ? (mark.at / len) * 100 : null,
  });
  return [seg('sec', secLen, done.sec, lateSec), seg('obj', objLen, done.obj, lateObj)];
}

/** Géométrie de la barre continue (modes REPS et DURÉE), rapportée à l'objectif : `fillPct`
 *  = la part faite. `overPct` ne sert qu'aux 360 d'avant la v1.53, qui ont pu dépasser
 *  l'objectif (l'échelle s'étend alors à ce qui a été fait). */
export function legBarGeometry(l: ComboLeg): {
  objPct: number;
  fillPct: number;
  overPct: number;
} {
  const scale = Math.max(l.target, legDone(l), 1);
  const objPct = Math.min(100, (Math.max(0, l.target) / scale) * 100);
  const donePct = Math.min(100, (Math.max(0, legDone(l)) / scale) * 100);
  return { objPct, fillPct: Math.min(donePct, objPct), overPct: Math.max(0, donePct - objPct) };
}

/** Effort PLANIFIÉ d'un exo jusqu'à sa cible (base de sa part de prime) = reps réelles
 *  des séries comptées × poids-de-rep, plan figé (COMBO_PLAN_REPS) pour les séries
 *  manquantes. Correctif 135fa252 : symétrique avec les petits défis (prime ∝ effort réel). */
function legPlannedEffort(l: ComboLeg): number {
  const sets = legSets(l);
  // ⚠️ Chaque série pèse le poids de rep de l'exo sur lequel elle a été FAITE (setOrigin) :
  // une série basculée d'un autre exo garde sa valeur. Sans série basculée, c'est
  // exactement l'ancien calcul (un seul poids de rep pour tout l'exo).
  const w = (s: ComboSet) => setOrigin(l, s).rep_weight;
  if (legMode(l) !== 'sets') {
    // Mode REPS/DURÉE : effort = reps (ou secondes) réalisées jusqu'à l'objectif.
    let left = l.target > 0 ? l.target : Infinity;
    let effort = 0;
    for (const s of sets) {
      if (left <= 0) break;
      const take = Math.min(s.reps || 0, left);
      // Une série convertie compte dans l'unité de la cible, mais son effort est celui qu'elle
      // a vraiment coûté (12 dips posés comme 5 reps valent 12 dips).
      // ⚠️ Compressé comme l'XP des séries (`setRepUnits`) : la prime suit le même barème.
      effort += setRepUnits(l, take * workRatio(l, s), s.date) * w(s);
      left -= take;
    }
    return effort;
  }
  const counted = l.target > 0 ? sets.slice(0, l.target) : sets;
  const done = counted.reduce(
    (a, s) => a + (setRepUnits(l, setWork(l, s).reps || 0, s.date) || COMBO_PLAN_REPS) * w(s),
    0,
  );
  const missing = Math.max(0, l.target - counted.length);
  return done + missing * COMBO_PLAN_REPS * (l.rep_weight ?? 1);
}

/** Prime de bouclage À PALIERS (pré-XP_MULT). Par exo : sa part de prime `0,25 ×
 *  effort planifié` × la part CUMULÉE du palier atteint (15 / 100 %). Remplace
 *  l'ancienne prime tout-ou-rien.
 *  Un 360 entièrement bouclé « en avance » est amplifié par (1 + fraction d'avance). */
/** Le défi est-il TERMINÉ — bouclé, ou sa période écoulée ? C'est ce moment qui déclenche
 *  le versement de la prime, et lui seul. `today` est passé pour rester pur (le projet
 *  s'est déjà fait piéger par un aller-retour local↔UTC sur les dates de défi). */
export function comboEnded(c: ComboChallenge, today = localDayIso(new Date())): boolean {
  if (comboCompleteInTime(c)) return true;
  if (c.duration_days <= 0) return false;
  return today > addDaysUtcIso(c.start_date, c.duration_days - 1);
}

export function comboTieredBonus(
  c: ComboChallenge,
  shareOf: (l: ComboLeg) => number = legTierShare,
  /** ⚠️ Jour courant, EXPLICITE. La prime dépend désormais de la date (elle ne tombe qu'à
   *  la fin du défi) : laisser la fonction lire l'horloge en douce la rendrait impossible
   *  à tester et sensible au fuseau — deux pièges que ce projet a déjà payés. Le défaut
   *  reste la date du jour pour les appelants qui n'ont rien à décider. */
  today = localDayIso(new Date()),
): number {
  // ⚠️ VERSÉE À LA FIN DU DÉFI (v0.717), pas au fil des séries. Avant, la prime tombait
  // par petits bouts à chaque série qui décrochait un palier : l'énergie montait en
  // continu et le bouclage n'était plus un moment, juste la dernière miette d'un
  // versement étalé.
  //
  // ⚠️ « LA FIN » = bouclé OU période écoulée — surtout pas « bouclé » seul. Un premier
  // essai ne payait qu'à la complétion : il rendait la prime TOUT-OU-RIEN et annulait
  // exactement ce que la v0.621 avait corrigé (un exo à la traîne faisait perdre tous les
  // autres). Deux tests l'ont refusé, à juste titre. Le bouclage PARTIEL reste donc
  // récompensé : à la fin de la semaine, on touche la prime des paliers atteints.
  // ⚠️ ABANDONNÉ = PAS DE PRIME (choix de l'utilisateur). L'XP des séries faites reste :
  // c'est du travail réel, et l'énergie qu'elle a donnée ne se reprend pas.
  if (c.status === 'abandoned') return 0;
  if (!comboEnded(c, today)) return 0;
  // Paliers et avance lus sur les séries faites DANS LES TEMPS.
  const d = comboInDeadline(c);
  const early = 1 + comboEarlyFraction(d);
  let sum = 0;
  for (const l of d.legs) {
    sum += 0.25 * legPlannedEffort(l) * shareOf(l);
  }
  return sum * early;
}

// Minutes de séance créditées par SÉRIE comptée (jusqu'à l'objectif). Le Défi 360
// REPRÉSENTE les séances muscu de la semaine, or `sessionXp` fait porter l'essentiel
// de l'XP par la DURÉE (durée×MUSCU_MIN_XP). Sans terme de durée, boucler son volume
// hebdo via le 360 ne rapportait que ~36 % d'une semaine loggée en séances (le même
// volume !). On crédite ~3,5 min de séance par série (exécution + repos), un cran sous
// une séance « pleine » (~4 min/série avec échauffement) → format efficace, honnête.
// PLAFONNÉ à l'objectif (comboCountedSets) : une série au-delà (360 d'avant la v1.53) ne
// rapporte que ses reps.
export const COMBO_SET_MIN = 3.5;

/** Séries d'UN exo comptées vers son objectif (mode-aware), plafonnées à sa cible. */
function legCountedSets(l: ComboLeg): number {
  if (legMode(l) !== 'sets') {
    // Reps ou durée → « séries » équivalentes, plafonnées à l'objectif. Le plafond se lit
    // dans l'unité de la cible, le crédit sur le travail réel (série convertie comprise).
    const work = legCountedWork(l).reduce((a, w) => a + w, 0);
    return Math.ceil(work / COMBO_PLAN_REPS - 1e-9);
  }
  const done = legSetsDone(l);
  return l.target > 0 ? Math.min(done, l.target) : done;
}
/** Mode reps/durée : le travail de chaque série retenu vers l'objectif (0 au-delà). */
function legCountedWork(l: ComboLeg): number[] {
  let left = l.target > 0 ? l.target : Infinity;
  return legSets(l).map((s) => {
    if (left <= 0) return 0;
    const take = Math.min(s.reps || 0, left);
    left -= take;
    return take * workRatio(l, s);
  });
}
/** La part de « série comptée » de CHAQUE série d'un exo (même ordre que `legSets`) : leur
 *  somme vaut exactement `legCountedSets(l)`. Sert à attribuer le terme de durée série par
 *  série, sans seconde règle de plafond. */
function legSetDurationShares(l: ComboLeg): number[] {
  const sets = legSets(l);
  const counted = legCountedSets(l);
  if (legMode(l) === 'sets') return sets.map((_, i) => (i < counted ? 1 : 0));
  const work = legCountedWork(l);
  const total = work.reduce((a, w) => a + w, 0);
  return work.map((w) => (total > 0 ? (w / total) * counted : 0));
}

/** Séries comptées vers l'objectif (mode-aware), plafonnées à la cible par exo. */
export function comboCountedSets(c: ComboChallenge): number {
  return c.legs.reduce((n, l) => n + legCountedSets(l), 0);
}

/** Minutes de séance équivalentes au volume bouclé (terme de durée de l'XP). */
export function comboImpliedMinutes(c: ComboChallenge): number {
  return comboCountedSets(c) * COMBO_SET_MIN;
}

/** Prime de bouclage (paliers) en XP — la MÊME valeur que celle déjà incluse dans
 *  comboXpPoints, isolée pour pouvoir l'AFFICHER (célébration de fin, historique
 *  d'énergie) au lieu de la noyer dans le total. */
export function comboBonusXp(c: ComboChallenge): number {
  return Math.round(comboTieredBonus(c) * XP_MULT);
}

export interface ComboDayXp {
  date: string; // YYYY-MM-DD
  effort: number; // reps + tonnage + durée impliquée, au prorata des séries du jour
  bonus: number; // prime de bouclage — portée par le DERNIER jour actif
}

/** Copie du défi ne gardant que les séries faites JUSQU'AU jour `date` inclus. */
function comboUpTo(c: ComboChallenge, date: string): ComboChallenge {
  return {
    ...c,
    legs: c.legs.map((l) => ({ ...l, sets: legSets(l).filter((s) => s.date <= date) })),
  };
}

/** Ventile l'XP d'un Défi 360 par JOUR (l'historique d'énergie est journalier).
 *  Méthode : on REJOUE l'état du défi jour après jour et on prend le DELTA. C'est la
 *  seule attribution fidèle, car la prime à paliers n'est PAS versée à la fin : chaque
 *  exo débloque sa part dès qu'il franchit un palier (80 % → 15 %, 100 % → 95 %), et le
 *  multiplicateur « fini en avance » ne tombe qu'au bouclage. La somme des jours vaut
 *  donc exactement comboXpPoints([c]).
 *  NB : un delta peut être négatif (une série sous les reps supposées baisse l'effort
 *  planifié) — l'appelant filtre les valeurs ≤ 0 à l'affichage. */
export function comboXpByDay(c: ComboChallenge, bodyKg?: number | null): ComboDayXp[] {
  const dates = [...new Set(c.legs.flatMap((l) => legSets(l).map((s) => s.date))).values()]
    .filter(Boolean)
    .sort();
  if (!dates.length) return [];
  const out: ComboDayXp[] = [];
  let prevTotal = 0;
  let prevBonus = 0;
  for (const date of dates) {
    const upTo = comboUpTo(c, date);
    const total = comboXpPoints([upTo], bodyKg);
    const bonus = comboBonusXp(upTo);
    out.push({ date, effort: total - prevTotal - (bonus - prevBonus), bonus: bonus - prevBonus });
    prevTotal = total;
    prevBonus = bonus;
  }
  return out;
}

/** Points BRUTS (pré-XP_MULT) des séries d'un défi : reps (équivalent-reps) et tonnage. */
function comboWorkPoints(c: ComboChallenge, bodyKg?: number | null): number {
  let reps = 0;
  let tonnage = 0;
  for (const l of c.legs) {
    for (const s of legSets(l)) {
      reps += setRepXp(l, s);
      tonnage += setTonnage(l, s, bodyKg);
    }
  }
  return reps + tonnage / 500;
}

/** Décompose l'XP d'UN Défi 360 : durée (volume bouclé), reps (+ tonnage), prime de
 *  bouclage (pour l'affichage sur les défis terminés). Mêmes formules que
 *  comboXpPoints. */
export function comboXpBreakdown(
  c: ComboChallenge,
  bodyKg?: number | null,
): {
  reps: number;
  duration: number;
  bonus: number;
  total: number;
} {
  const durationXp = Math.round(comboImpliedMinutes(c) * MUSCU_MIN_XP * XP_MULT);
  const repsXp = Math.round(comboWorkPoints(c, bodyKg) * XP_MULT);
  const bonusXp = comboBonusXp(c);
  return {
    reps: repsXp,
    duration: durationXp,
    bonus: bonusXp,
    total: repsXp + durationXp + bonusXp,
  };
}

/** XP d'un ensemble de Défis 360 (façon séance : durée + reps + prime de bouclage).
 *  `bodyKg` : poids du joueur, pour la charge des exos au poids du corps (sans lui, rien). */
export function comboXpPoints(combos: ComboChallenge[], bodyKg?: number | null): number {
  return combos.reduce((a, c) => {
    const duration = comboImpliedMinutes(c) * MUSCU_MIN_XP;
    // Prime À PALIERS (bouclage partiel récompensé).
    const bonus = comboTieredBonus(c);
    return a + Math.round((comboWorkPoints(c, bodyKg) + duration + bonus) * XP_MULT);
  }, 0);
}

/** Une ligne de l'Agenda : les séries d'UN exo (celui où elles ont été FAITES) un jour. */
export interface ComboExoDayXp {
  exerciseId: string;
  exerciseName: string;
  date: string;
  mode: ComboCountMode;
  /** Ce qui a vraiment été fait (série convertie : ses valeurs d'origine). */
  sets: ComboSet[];
  /** XP d'EFFORT de ces séries : durée créditée + reps + tonnage — hors prime de fin. */
  xp: number;
}

/**
 * 📅 L'XP d'un Défi 360 PAR EXO ET PAR JOUR (2026-10-10, signalé : l'Agenda annonçait
 * « 1 XP » pour une série de tractions qui en rapporte ~24). L'Agenda refaisait son propre
 * calcul, amputé du terme de DURÉE (l'essentiel de l'XP d'une série) et du ×XP_MULT.
 * ⚠️ Mêmes briques que `comboXpPoints` (`setRepXp`, `setTonnage`, `legSetDurationShares`) :
 * la somme des lignes vaut l'XP du défi hors prime, à l'arrondi de chaque ligne près.
 */
export function comboXpByExoDay(c: ComboChallenge, bodyKg?: number | null): ComboExoDayXp[] {
  const groups = new Map<string, ComboExoDayXp & { raw: number }>();
  for (const l of c.legs) {
    const shares = legSetDurationShares(l);
    legSets(l).forEach((s, i) => {
      if (!s.date) return;
      const o = setOrigin(l, s);
      const key = o.exercise_id + '|' + s.date;
      let g = groups.get(key);
      if (!g) {
        g = {
          exerciseId: o.exercise_id,
          exerciseName: o.exercise_name,
          date: s.date,
          mode: legMode(l),
          sets: [],
          xp: 0,
          raw: 0,
        };
        groups.set(key, g);
      }
      g.sets.push({ ...s, ...setWork(l, s) });
      g.raw +=
        setRepXp(l, s) +
        setTonnage(l, s, bodyKg) / 500 +
        (shares[i] ?? 0) * COMBO_SET_MIN * MUSCU_MIN_XP;
    });
  }
  return [...groups.values()].map(({ raw, ...g }) => ({ ...g, xp: Math.round(raw * XP_MULT) }));
}

export interface ComboSessionExo {
  exercise_id: string;
  exercise_name: string;
  weight_kg?: number | null;
  sets: number[]; // reps par série (ou SECONDES si `time`)
  time?: boolean; // exo de DURÉE (gainage) → chrono au lieu de reps/poids
  rep_min: number; // fourchette conseillée — affichée AVANT la série, sur l’en-tête de l’exo
  rep_max: number;
}

const COMBO_EXEC_SEC = 40; // durée d'exécution moyenne d'une série

/** Durée estimée (min) d'une séance de `sets` séries (exécution + repos) → affichage
 *  quand on choisit directement le nombre de séries. */
export function comboSessionDurationMin(sets: number, restSec: number): number {
  const perSet = COMBO_EXEC_SEC + Math.max(0, restSec);
  return Math.max(1, Math.round((sets * perSet) / 60));
}

/** Construit une séance à partir d'un nombre de séries CHOISI PAR EXO (indépendant).
 *  `counts` = { exercise_id: nb de séries }. Chaque série reprend les reps de la
 *  dernière faite, sinon le haut de la fourchette conseillée. Ordre = celui des legs
 *  du défi. Pur/testable. */
export function buildComboSessionFromCounts(
  c: ComboChallenge,
  counts: Record<string, number>,
  objective?: Objective | null,
): ComboSessionExo[] {
  const out: ComboSessionExo[] = [];
  for (const l of c.legs) {
    const n = Math.max(0, Math.floor(counts[l.exercise_id] ?? 0));
    if (n <= 0) continue;
    const range = legRepRange(l, objective);
    const reps = legLastReps(l, prescribedReps(range));
    out.push({
      exercise_id: l.exercise_id,
      exercise_name: l.exercise_name,
      weight_kg: legLastWeight(l),
      sets: Array.from({ length: n }, () => reps),
      time: legMode(l) === 'time',
      rep_min: range.min,
      rep_max: range.max,
    });
  }
  return out;
}

// ── ORDRE DES SÉRIES D'UNE SÉANCE (v0.861 ; demandé par l'utilisateur) ──
// « standard » : toutes les séries d'un exo, puis le suivant (A A A B B B).
// « alterné » : une série de chaque exo à tour de rôle (A B C A B C).
// « aléatoire » : alterné, mais l'ordre des exos est RE-MÉLANGÉ À CHAQUE TOUR (choix de
// l'utilisateur), sans jamais deux séries du même exo à la suite — y compris à la jonction
// entre deux tours. ⚠️ Seule exception, inévitable : quand il ne reste qu'UN exo (il avait
// plus de séries que les autres), ses dernières séries s'enchaînent, en alterné aussi.
// « par groupe » (v1.81) : la prochaine série est choisie EN DIRECT, sur l'exo dont les
// muscles sont les plus reposés (`pickFreshest`, lib/muscleFatigue) — elle dépend de l'heure
// des séries faites, donc elle ne se planifie pas d'avance. `comboSessionSteps` la traite
// comme « alterné » (même suite de repli, quand on ne connaît pas les muscles).
export type ComboSessionOrder = 'standard' | 'alternate' | 'shuffle' | 'muscle';

export const COMBO_SESSION_ORDERS: { id: ComboSessionOrder; label: string; hint: string }[] = [
  { id: 'standard', label: 'Standard', hint: 'Toutes les séries d’un exo, puis le suivant' },
  { id: 'alternate', label: 'Alterné', hint: 'Une série de chaque exo, à tour de rôle' },
  {
    id: 'shuffle',
    label: 'Aléatoire',
    hint: 'À tour de rôle, dans un ordre mélangé à chaque tour',
  },
  {
    id: 'muscle',
    label: 'Par groupe',
    hint: 'La prochaine série va aux muscles les plus reposés',
  },
];

/** Une série à faire : l'exo (index dans la séance) et le numéro de série dans cet exo. */
export interface ComboSessionStep {
  exo: number;
  set: number;
}

/** Tirage seedé (mulberry32) — la même graine redonne le même ordre : la séance ne se
 *  re-mélange pas à chaque rendu, ni quand on ajoute une série en cours de route. */
function orderRng(seed: number): () => number {
  return mulberry32(seed >>> 0 || 1);
}

/** L'ordre dans lequel faire les séries d'une séance. `sets[i]` = nombre de séries de
 *  l'exo `i`. ⚠️ Un tour ne dépend que des exos qui y participent : ajouter une série à un
 *  exo en pleine séance ne change pas l'ordre des tours déjà commencés. */
export function comboSessionSteps(
  sets: readonly number[],
  order: ComboSessionOrder,
  seed = 1,
): ComboSessionStep[] {
  const steps: ComboSessionStep[] = [];
  if (order === 'standard') {
    sets.forEach((n, exo) => {
      for (let set = 0; set < n; set++) steps.push({ exo, set });
    });
    return steps;
  }
  const rng = orderRng(seed);
  const rounds = Math.max(0, ...sets);
  for (let r = 0; r < rounds; r++) {
    const round = sets.map((n, exo) => (n > r ? exo : -1)).filter((exo) => exo >= 0);
    if (order === 'shuffle') {
      for (let i = round.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [round[i], round[j]] = [round[j]!, round[i]!];
      }
      // Jonction : le tour ne commence pas par l'exo qui vient de finir le précédent.
      const last = steps.at(-1)?.exo;
      if (round.length > 1 && round[0] === last) [round[0], round[1]] = [round[1]!, round[0]!];
    }
    for (const exo of round) steps.push({ exo, set: r });
  }
  return steps;
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
/** Groupes optionnels proposés à TOUS les niveaux (débutant compris). */
const ALWAYS_ON = new Set(['biceps', 'triceps']);
const SETS_PER_EXO = 5;

/** Volume hebdo de base par muscle (séries) selon le niveau (repère hypertrophie). */
function comboBaseWeekly(level: Level): number {
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
  biceps: 'biceps',
  triceps: 'triceps',
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
    biceps: 1.2,
    triceps: 1.2,
    shoulders: 1.15,
  },
  // Perf/fonctionnel : chaîne postérieure + gainage + composés ; moins d'isolation.
  perf: {
    push: 1.0,
    pull: 1.1,
    squat: 1.1,
    hinge: 1.2,
    core: 1.2,
    biceps: 0.8,
    triceps: 0.8,
    shoulders: 0.95,
  },
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
  const slots = COMBO_SLOTS.map((s) => s.key);
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
    // Les BRAS (biceps, triceps) sont TOUJOURS proposés (même en débutant) — un groupe
    // motivant qu'on ne veut pas laisser tomber en silence (ticket adbc5ff4). Les
    // autres accessoires (épaules/mollets) restent réservés à inter/avancé.
    const active = s.essential || ALWAYS_ON.has(s.key) || level !== 'debutant';
    if (!active) return { slot: s.key, active: false, nExos: 0, weeklySets: 0, setsPerExo: 0 };
    const mult = emphasis?.[s.key] ?? 1;
    const weeklySets = Math.max(3, Math.round(comboWeeklySets(level, volume, s.essential) * mult));
    // Nb d'exos = volume / ~5 séries, borné par le plafond de variété — accessoires
    // compris : c'est ce qui permet curl + curl marteau dans le même 360 (demandé).
    const wanted = Math.max(1, Math.round(weeklySets / SETS_PER_EXO));
    const nExos = Math.min(cap, wanted);
    const setsPerExo = Math.max(1, Math.round(weeklySets / nExos));
    return { slot: s.key, active: true, nExos, weeklySets, setsPerExo };
  });
}

// ── Export TEXTE détaillé d'un Défi 360 complet (partagé par ComboDetailPage ET
//    l'onglet Défi 360 de ChallengesPage → une seule source, pas de divergence). ──
function fmtDM(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
/** Texte détaillé du défi complet : entête (semaine, %, théorique) + chaque exo
 *  (cible/réalisé, paliers) avec le détail de chaque série faite (reps×poids / secondes).
 *  `today` = jour logique courant (pour l'avancement théorique). */
export function comboExportText(c: ComboChallenge, today: string): string {
  const end = addDaysUtcIso(c.start_date, c.duration_days - 1);
  const pct = comboProgressPct(c);
  let onTime = 0;
  if (today >= c.start_date && c.duration_days > 0) {
    const elapsed =
      Math.round(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.start_date}T00:00:00Z`)) / 86400000,
      ) + 1;
    onTime = Math.round((Math.max(0, Math.min(c.duration_days, elapsed)) / c.duration_days) * 100);
  }
  const showOnTime = c.status === 'active' && onTime > 0 && onTime < 100;
  const L: string[] = [];
  L.push(`🎯 Défi 360 — Semaine du ${fmtDM(c.start_date)} → ${fmtDM(end)}`);
  L.push(
    `Progression : ${fmtPct(pct)}%` +
      (showOnTime ? ` (théorique ${onTime}%)` : '') +
      (c.status === 'done' ? ' — bouclé ✅' : ''),
  );
  L.push('');
  for (const leg of c.legs) {
    const done = legDone(leg);
    const { sec } = legTierMarks(leg);
    L.push(
      `• ${leg.exercise_name}${leg.weight_kg ? ` (${leg.weight_kg} kg)` : ''} — ` +
        `${done}/${leg.target} ${legUnitLabel(leg)}${legComplete(leg) ? ' ✓' : ''}` +
        (done > leg.target ? ` (+${done - leg.target} en plus)` : ''),
    );
    L.push(`   paliers : sec. ${sec} · objectif ${leg.target}`);
    const sets = legSets(leg);
    if (sets.length) {
      const detail =
        legMode(leg) === 'time'
          ? sets
              .map((s) => {
                const o = setOriginLabel(leg, s);
                return o ? `${s.reps}s (↪ ${o})` : `${s.reps}s`;
              })
              .join(', ')
          : sets
              .map((s) => {
                const b = s.weight ? `${s.reps}×${s.weight}kg` : `${s.reps}`;
                const a = s.assisted ? `${b}·a` : b;
                const o = setOriginLabel(leg, s);
                return o ? `${a} (↪ ${o})` : a;
              })
              .join(', ');
      L.push(`   séries : ${detail}`);
    }
  }
  return L.join('\n');
}

// --- Conseil de charge par exo -----------------------------------------------
// Une série se fait à 1 à 3 reps de l’échec : on part de ce principe, donc les reps
// réalisées DISENT si la charge est bonne. Toucher le haut de la fourchette à 1-3 reps
// de l’échec = on pourrait en faire au-delà → trop léger, on conseille de monter. Rester
// sous le bas alors qu’on est déjà près de l’échec = trop lourd. Entre les deux, la charge
// est la bonne : on vise une rep de plus.
// ⚠️ On ne dit JAMAIS de combien monter : le pas dépend de l’exo (haltère, barre, lest).
//
// ⚠️ LE 360 N’A PAS DE SÉANCE : les séries s’étalent dans la journée. On ne suppose donc
// pas qu’une série plus faible que la précédente l’est par fatigue — sauf si elles sont
// ENCHAÎNÉES (moins de `LOAD_ADVICE.chainMin` d’écart, lu sur `ComboSet.at`) : un bloc
// enchaîné ne compte que par sa meilleure série. Une série sans heure (saisie avant) est
// un bloc à elle seule. Puis on lit les `window` derniers blocs à la charge actuelle, et
// il en faut `agree` dans le même sens pour monter ou alléger : une série faite très en
// forme, ou ratée en fin de journée, ne suffit pas à changer de charge.

export const LOAD_ADVICE = { chainMin: 20, window: 3, agree: 2 } as const;

type LoadCall = 'up' | 'hold' | 'down';
export interface LegLoadAdvice {
  /** Charge de référence (kg) — null au poids du corps sans lest. */
  weight: number | null;
  /** La dernière série était assistée : « monter » veut dire moins d’assistance. */
  assisted: boolean;
  call: LoadCall;
  /** Reps à viser à cette charge (pour « hold »), bas de fourchette sinon. */
  reps: number;
  /** Séries STRICTES encore sous la fourchette : on garde les strictes et on complète le
   *  volume à l’élastique — jamais « plus facile », ce serait défaire la progression. */
  topUp?: boolean;
}

/** Séries de référence : celles de ce 360, sinon celles du dernier 360 qui a fait cet exo. */
function adviceSets(leg: ComboLeg, history: ComboChallenge[]): ComboSet[] {
  // Séries faites sur CET exo seulement : une série basculée d'un autre exo ne dit rien
  // de la charge de celui-ci.
  const own = ownSets(leg).filter((s) => s.reps > 0);
  if (own.length) return own;
  const past = [...history].sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  for (const c of past) {
    for (const l of c.legs) {
      if (l === leg || l.exercise_id !== leg.exercise_id || legMode(l) === 'time') continue;
      const s = ownSets(l).filter((x) => x.reps > 0);
      if (s.length) return s;
    }
  }
  return [];
}

const loadOf = (s: ComboSet) => (s.weight && s.weight > 0 ? s.weight : null);

/** Deux séries sont enchaînées si elles ont une heure et moins de `chainMin` d’écart. */
function chained(a: ComboSet, b: ComboSet): boolean {
  if (!a.at || !b.at) return false;
  const gap = Date.parse(b.at) - Date.parse(a.at);
  return gap >= 0 && gap <= LOAD_ADVICE.chainMin * 60_000;
}

/** Blocs (meilleure série de chaque bloc enchaîné) à la charge de la dernière série. */
export function loadBlocks(sets: readonly ComboSet[]): number[] {
  const last = sets[sets.length - 1];
  if (!last) return [];
  const same = sets.filter((s) => loadOf(s) === loadOf(last) && !!s.assisted === !!last.assisted);
  const blocks: number[] = [];
  same.forEach((s, i) => {
    if (i > 0 && chained(same[i - 1]!, s))
      blocks[blocks.length - 1] = Math.max(blocks[blocks.length - 1]!, s.reps);
    else blocks.push(s.reps);
  });
  return blocks;
}

export function legLoadAdvice(
  leg: ComboLeg,
  history: ComboChallenge[],
  range: { min: number; max: number },
): LegLoadAdvice | null {
  if (legMode(leg) === 'time') return null; // gainage : des secondes, pas de charge
  const sets = adviceSets(leg, history);
  const last = sets[sets.length - 1];
  if (!last) return null; // jamais fait : rien à juger
  const recent = loadBlocks(sets).slice(-LOAD_ADVICE.window);
  const base = { weight: loadOf(last), assisted: !!last.assisted };
  if (recent.filter((r) => r >= range.max).length >= LOAD_ADVICE.agree)
    return { ...base, call: 'up', reps: range.min };
  // ⚠️ Tractions, dips… faits SANS aide ni lest sur un exo qu’on peut assister : être sous
  // la fourchette n’y est pas « trop lourd », c’est le cap qu’on est en train de franchir.
  // On vise une stricte de plus et on complète à l’élastique ; revenir à l’assistance
  // pour TOUTES ses séries défairait exactement ce qu’on vient de gagner.
  const best = Math.max(...recent);
  if (leg.assistable && base.weight === null && !base.assisted && best < range.min)
    return { ...base, call: 'hold', reps: best + 1, topUp: true };
  if (recent.filter((r) => r < range.min).length >= LOAD_ADVICE.agree)
    return { ...base, call: 'down', reps: range.min };
  // Ta meilleure série récente dit ce que tu fais frais ; les moins bonnes = fatigue passagère.
  return { ...base, call: 'hold', reps: Math.min(range.max, best + 1) };
}

// --- Changer d'exo en cours de défi ---------------------------------------------
// On quitte un exo pour un autre DU MÊME GROUPE : un exo déjà présent dans le défi, ou un
// exo neuf. L'exo quitté DISPARAÎT, et TOUT ce qu'il portait bascule sur la cible — son
// objectif et ses séries déjà faites. L'objectif du groupe est donc conservé, et la cible
// recalcule ses paliers (secondaire, objectif) sur l'objectif fusionné.
//
// ⚠️ LES SÉRIES BASCULÉES GARDENT LEUR ORIGINE (`ComboSet.origin`). Elles comptent pour
// l'avancement et les paliers de la cible, mais leur XP, leur tonnage et leurs muscles
// restent ceux de l'exo sur lequel elles ont été faites. Sans cette trace, l'historique
// mentirait et l'XP déjà versée changerait.

/** Un exo neuf à mettre à la place : ce que l'assistant de création pose sur un exo. */
export interface ComboNewExercise {
  exercise_id: string;
  exercise_name: string;
  muscle_primary?: string | null;
  rep_weight: number;
  /** Exo au TEMPS (gainage) : il ne peut remplacer qu'un exo au temps, et inversement. */
  time: boolean;
  assistable: boolean;
  rep_min: number;
  rep_max: number;
}

/** Vers quoi basculer : un exo déjà dans le défi (son id), ou un exo neuf. */
export type ComboTransferTarget = { leg: string } | { exercise: ComboNewExercise };

type ComboTransferBlock =
  | 'notActive'
  | 'noLeg'
  | 'sameLeg'
  | 'otherSlot'
  | 'modeMismatch'
  | 'alreadyIn';

export const COMBO_TRANSFER_BLOCK_LABEL: Record<ComboTransferBlock, string> = {
  notActive: 'Le défi n’est plus en cours.',
  noLeg: 'Exo introuvable dans le défi.',
  sameLeg: 'C’est déjà cet exo.',
  otherSlot: 'Seulement vers un exo du même groupe musculaire (ou des jambes entre elles).',
  modeMismatch: 'Les deux exos ne se comptent pas pareil (séries, reps ou durée).',
  alreadyIn: 'Ce mouvement est déjà dans ton défi.',
};

/** L'exo neuf appartient-il au groupe de l'exo quitté ? */
/** L'emplacement où poser un exo neuf de ce muscle, parmi ceux vers lesquels l'exo quitté
 *  peut basculer (son groupe, ou les jambes entre elles) — `null` si aucun. Un exo d'un
 *  emplacement inconnu (360 ancien) ne bascule que vers le même muscle. */
export function transferSlotFor(from: ComboLeg, muscle: string | null | undefined): string | null {
  if (!comboSlot(from.slot)) return muscle === from.muscle_primary ? from.slot : null;
  for (const key of swapSlotsOf(from.slot))
    if (comboSlot(key)?.muscles.includes(muscle ?? '')) return key;
  return null;
}

/** Pourquoi on ne peut pas basculer — `null` si c'est possible. Source unique de l'écran
 *  (qui ne propose pas l'impossible) et du store (qui le refuse quand même). */
export function comboTransferBlocker(
  c: ComboChallenge,
  fromId: string,
  to: ComboTransferTarget,
): ComboTransferBlock | null {
  if (c.status !== 'active') return 'notActive';
  const from = c.legs.find((l) => l.exercise_id === fromId);
  if (!from) return 'noLeg';
  if ('leg' in to) {
    if (to.leg === fromId) return 'sameLeg';
    const dest = c.legs.find((l) => l.exercise_id === to.leg);
    if (!dest) return 'noLeg';
    if (!swapSlotsOf(from.slot).includes(dest.slot)) return 'otherSlot';
    if (legMode(dest) !== legMode(from)) return 'modeMismatch';
    return null;
  }
  const e = to.exercise;
  if (e.exercise_id === fromId) return 'sameLeg';
  if (!transferSlotFor(from, e.muscle_primary)) return 'otherSlot';
  if (e.time !== (legMode(from) === 'time')) return 'modeMismatch';
  // Le même mouvement déjà présent AILLEURS dans le défi (l'exo quitté, lui, s'en va : on
  // peut passer des dips aux dips assistés).
  const fam = variantFamilyKey(e.exercise_id);
  if (c.legs.some((l) => l !== from && variantFamilyKey(l.exercise_id) === fam)) return 'alreadyIn';
  return null;
}

/** Ordre chronologique (jour, puis heure de saisie) : les séries fusionnées se lisent dans
 *  l'ordre où elles ont été faites. Tri stable → deux séries sans heure gardent leur ordre. */
function chrono(sets: ComboSet[]): ComboSet[] {
  return [...sets].sort((a, b) =>
    a.date !== b.date
      ? a.date < b.date
        ? -1
        : 1
      : (a.at ?? '') < (b.at ?? '')
        ? -1
        : (a.at ?? '') > (b.at ?? '')
          ? 1
          : 0,
  );
}

/** 🔁 CE QUE DEVIENNENT LES SÉRIES À LA BASCULE (demandé par l'utilisateur). 12 dips ne font
 *  pas 12 reps de développé couché : chaque série basculée prend des valeurs de l'exo cible,
 *  que le joueur corrige avant de valider, et garde ses vraies valeurs dans son origine
 *  (`done`) pour l'XP, le tonnage et les statistiques.
 *
 *  Valeurs proposées : celles de la DERNIÈRE série de la cible (reps, charge, assistance),
 *  sinon le milieu de sa fourchette conseillée, sans charge ni assistance. En mode reps ou
 *  durée, l'objectif suit la même règle : 60 reps à ~10 par série font 6 séries, donc
 *  6 × les reps proposées. En mode séries, l'objectif ne change pas (une série reste une
 *  série). Chaque valeur reste corrigeable. */
export interface ComboTransferPlan {
  /** Une entrée par série de l'exo quitté, dans l'ordre de `legSets`. */
  sets: ComboSetWork[];
  /** Objectif ajouté à la cible, dans son unité. */
  target: number;
}

const midOf = (min: number, max: number) => Math.max(1, Math.round((min + max) / 2));

/** Les valeurs proposées à la bascule (cf. `ComboTransferPlan`). Lève si c'est bloqué. */
export function comboTransferPlan(
  c: ComboChallenge,
  fromId: string,
  to: ComboTransferTarget,
  objective?: Objective | null,
): ComboTransferPlan {
  const block = comboTransferBlocker(c, fromId, to);
  if (block) throw new Error(COMBO_TRANSFER_BLOCK_LABEL[block]);
  const from = c.legs.find((l) => l.exercise_id === fromId)!;
  let base: ComboSetWork;
  if ('leg' in to) {
    const dest = c.legs.find((l) => l.exercise_id === to.leg)!;
    const last = legSets(dest).at(-1);
    const range = legRepRange(dest, objective);
    base = last
      ? {
          reps: last.reps,
          weight: last.weight ?? null,
          assisted: !!dest.assistable && !!last.assisted,
        }
      : { reps: midOf(range.min, range.max), weight: dest.weight_kg ?? null, assisted: false };
  } else {
    base = { reps: midOf(to.exercise.rep_min, to.exercise.rep_max), weight: null, assisted: false };
  }
  let target = from.target;
  if (legMode(from) !== 'sets' && from.target > 0) {
    const r = legRepRange(from, objective);
    target = Math.max(1, Math.round((from.target / midOf(r.min, r.max)) * base.reps));
  }
  return { sets: legSets(from).map(() => ({ ...base })), target };
}

/** Les exos du défi après la bascule. L'exo quitté disparaît ; la cible porte son objectif
 *  en plus du sien et toutes ses séries, converties selon `plan` (par défaut les valeurs
 *  proposées) et marquées de leur origine. Lève si c'est bloqué. */
export function transferComboLeg(
  c: ComboChallenge,
  fromId: string,
  to: ComboTransferTarget,
  plan: ComboTransferPlan = comboTransferPlan(c, fromId, to),
): ComboLeg[] {
  const block = comboTransferBlocker(c, fromId, to);
  if (block) throw new Error(COMBO_TRANSFER_BLOCK_LABEL[block]);
  const from = c.legs.find((l) => l.exercise_id === fromId)!;
  const fromSets = legSets(from);
  if (plan.sets.length !== fromSets.length)
    throw new Error('Les séries à basculer ne correspondent plus : rouvre le changement d’exo.');
  const assistable =
    'leg' in to
      ? !!c.legs.find((l) => l.exercise_id === to.leg)?.assistable
      : to.exercise.assistable;
  const moved = fromSets.map((s, i): ComboSet => {
    // Une série déjà basculée (bascule en chaîne) garde sa VRAIE origine et ses vraies
    // valeurs ; une série faite ici les fige avant d'être convertie.
    const o = setOrigin(from, s);
    const done: ComboSetWork = o.done ?? {
      reps: s.reps,
      weight: s.weight ?? null,
      assisted: !!s.assisted,
    };
    const p = plan.sets[i]!;
    const weight = p.weight != null && Number.isFinite(p.weight) && p.weight > 0 ? p.weight : null;
    return {
      ...s,
      reps: Math.max(0, Math.round(p.reps || 0)),
      weight,
      assisted: assistable && !!p.assisted,
      origin: { ...o, done },
    };
  });
  const addTarget = Math.max(0, Math.round(plan.target));

  if ('leg' in to) {
    return c.legs
      .filter((l) => l !== from)
      .map((l) => {
        if (l.exercise_id !== to.leg) return l;
        const next: ComboLeg = {
          ...l,
          target: l.target + addTarget,
          sets: chrono([...legSets(l), ...moved]),
        };
        delete next.progress; // ancien format : déjà converti par legSets
        return next;
      });
  }

  const e = to.exercise;
  const fresh: ComboLeg = {
    // Le groupe de l'exo neuf, pas celui du quitté : des squats remplacés par un soulevé de
    // terre roumain passent dans la Charnière.
    slot: transferSlotFor(from, e.muscle_primary) ?? from.slot,
    exercise_id: e.exercise_id,
    exercise_name: e.exercise_name,
    muscle_primary: e.muscle_primary ?? null,
    rep_weight: e.rep_weight,
    target: addTarget,
    count_mode: from.count_mode ?? 'sets',
    weight_kg: null,
    assistable: e.assistable,
    rep_min: e.rep_min,
    rep_max: e.rep_max,
    sets: moved,
  };
  // À la place de l'exo quitté : la liste garde son ordre.
  return c.legs.map((l) => (l === from ? fresh : l));
}
