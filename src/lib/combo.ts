// combo.ts — logique pure du Défi 360 (défi combiné hebdo full-body). Pur/testable.
// Modèle SÉRIES : l'objectif d'un exo = un nombre de SÉRIES/semaine (repère
// hypertrophie), chaque série enregistrée porte ses reps + son poids. XP façon
// séance : Σ reps×REP_XP×poids-de-rep + tonnage/500 + prime de bouclage.
import { REP_XP, assistMult, XP_MULT } from './athlete';
import { daysBetweenIso } from './loginStreak';
import type { Level } from './types';

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
export interface ComboLeg {
  slot: string;
  exercise_id: string;
  exercise_name: string;
  muscle_primary?: string | null;
  rep_weight: number; // poids de rep de l'exo (pour l'XP)
  target: number; // objectif de SÉRIES sur la semaine
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
/** Séries restantes avant l'objectif. */
export function legRemaining(leg: ComboLeg): number {
  return Math.max(0, leg.target - legSetsDone(leg));
}
export function legComplete(leg: ComboLeg): boolean {
  return leg.target > 0 && legSetsDone(leg) >= leg.target;
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

export function comboTargetTotal(c: ComboChallenge): number {
  return c.legs.reduce((a, l) => a + l.target, 0);
}
export function comboDoneTotal(c: ComboChallenge): number {
  return c.legs.reduce((a, l) => a + Math.min(legSetsDone(l), l.target), 0);
}
export function comboProgressPct(c: ComboChallenge): number {
  const tgt = comboTargetTotal(c);
  return tgt > 0 ? Math.min(100, Math.round((comboDoneTotal(c) / tgt) * 100)) : 0;
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
    const done = sets.length;
    if (l.target > 0 && done > l.target) {
      const legRepXp = sets.reduce(
        (s, st) => s + (st.reps || 0) * REP_XP * (l.rep_weight ?? 1) * assistMult(st.assisted),
        0,
      );
      extraXp += (legRepXp * (done - l.target)) / done; // part des séries en plus
      legsOver++;
    }
  }
  const balance = totalLegs ? legsOver / totalLegs : 0;
  const bonusXp = Math.round(COMBO_SURPASS_MULT * extraXp * balance * XP_MULT);
  return { extraXp, legsOver, totalLegs, balance, bonusXp };
}

/** Décompose l'XP d'UN Défi 360 : reps (+ tonnage), prime de bouclage, dépassement
 *  (pour l'affichage sur les défis terminés). Mêmes formules que comboXpPoints. */
export function comboXpBreakdown(c: ComboChallenge): {
  reps: number;
  bonus: number;
  surpass: number;
  total: number;
} {
  let reps = 0;
  let tonnage = 0;
  let targetEffort = 0;
  for (const l of c.legs) {
    for (const s of legSets(l)) {
      reps += (s.reps || 0) * REP_XP * (l.rep_weight ?? 1) * assistMult(s.assisted);
      tonnage += (s.reps || 0) * (s.weight ?? l.weight_kg ?? 0);
    }
    targetEffort += l.target * COMBO_PLAN_REPS * (l.rep_weight ?? 1);
  }
  const bonus = comboComplete(c) ? 0.25 * targetEffort * (1 + comboEarlyFraction(c)) : 0;
  const over = comboOverachievement(c);
  const repsXp = Math.round((reps + tonnage / 500) * XP_MULT);
  const bonusXp = Math.round(bonus * XP_MULT);
  return {
    reps: repsXp,
    bonus: bonusXp,
    surpass: over.bonusXp,
    total: repsXp + bonusXp + over.bonusXp,
  };
}

/** XP d'un ensemble de Défis 360 (façon séance + prime de bouclage + dépassement). */
export function comboXpPoints(combos: ComboChallenge[]): number {
  return combos.reduce((a, c) => {
    let reps = 0;
    let tonnage = 0;
    let targetEffort = 0;
    for (const l of c.legs) {
      for (const s of legSets(l)) {
        reps += (s.reps || 0) * REP_XP * (l.rep_weight ?? 1) * assistMult(s.assisted);
        tonnage += (s.reps || 0) * (s.weight ?? l.weight_kg ?? 0);
      }
      // Volume planifié ≈ séries × reps supposées × poids-de-rep.
      targetEffort += l.target * COMBO_PLAN_REPS * (l.rep_weight ?? 1);
    }
    const bonus = comboComplete(c) ? 0.25 * targetEffort * (1 + comboEarlyFraction(c)) : 0;
    const over = comboOverachievement(c);
    const surpass = COMBO_SURPASS_MULT * over.extraXp * over.balance;
    return a + Math.round((reps + tonnage / 500 + bonus + surpass) * XP_MULT);
  }, 0);
}

export interface ComboSessionExo {
  exercise_id: string;
  exercise_name: string;
  weight_kg?: number | null;
  sets: number[]; // reps par série
}

export const COMBO_EXEC_SEC = 40; // durée d'exécution moyenne d'une série

/** Nb de séries qui tiennent dans une séance de `minutes` (exécution + repos). */
export function comboSessionSetBudget(minutes: number, restSec: number): number {
  const perSet = COMBO_EXEC_SEC + Math.max(0, restSec);
  return Math.max(1, Math.floor((minutes * 60) / perSet));
}

/**
 * Génère une SÉANCE TIME-BOXÉE à partir des SÉRIES restantes : on ne dump pas
 * tout — on remplit une séance de `minutes` (chaque série = ~40 s + repos),
 * répartie en round-robin sur les exos dont il reste des séries. Chaque série
 * reprend les reps de la dernière série faite (ou un défaut). Pur/testable.
 */
export function buildComboSession(
  c: ComboChallenge,
  opts: { minutes: number; restSec: number },
): ComboSessionExo[] {
  const budget = comboSessionSetBudget(opts.minutes, opts.restSec);
  const exos = c.legs
    .map((l) => ({
      leg: l,
      remaining: legRemaining(l), // séries restantes
      reps: legLastReps(l),
      sets: [] as number[],
    }))
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
    }));
}

/** Objectif de SÉRIES/semaine suggéré pour un emplacement (repère hypertrophie
 *  ~10-15 séries/muscle/sem). Essentiel ~12, optionnel ~9, ajusté au niveau. */
export function suggestComboTarget(level: Level, essential: boolean): number {
  const base = essential ? 12 : 9;
  const f = level === 'debutant' ? 0.75 : level === 'avance' ? 1.3 : 1;
  return Math.max(4, Math.round(base * f));
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
const VARIETY_EXOS: Record<ComboVariety, number> = { low: 1, med: 2, high: 3 };

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

/**
 * Plan FULL-BODY : tous les groupes essentiels sont actifs (+ les accessoires,
 * hors débutant). Le VOLUME (séries/groupe) vient de `volume`, la VARIÉTÉ (nb
 * d'exos/groupe) de `variety` (les accessoires restent à 1 exo). Pur/testable.
 */
export function suggestFullBodyPlan(
  level: Level,
  volume: ComboVolume,
  variety: ComboVariety,
  slots: ComboSlotSpec[],
): ComboSlotPlan[] {
  const nWanted = VARIETY_EXOS[variety];
  return slots.map((s) => {
    const active = s.essential || level !== 'debutant';
    if (!active) return { slot: s.key, active: false, nExos: 0, weeklySets: 0, setsPerExo: 0 };
    const weeklySets = comboWeeklySets(level, volume, s.essential);
    const nExos = s.essential ? nWanted : 1;
    const setsPerExo = Math.max(1, Math.round(weeklySets / nExos));
    return { slot: s.key, active: true, nExos, weeklySets, setsPerExo };
  });
}
