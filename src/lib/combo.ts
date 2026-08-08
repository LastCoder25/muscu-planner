// combo.ts — logique pure du Défi 360 (défi combiné hebdo full-body). Pur/testable.
// Métrique = reps ; XP façon séance : reps×REP_XP×poids-de-rep + tonnage/500
// (tonnage = reps × charge si renseignée) + prime de bouclage (volume × avance).
import { REP_XP } from './athlete';
import { daysBetweenIso } from './loginStreak';
import type { Level } from './types';

export interface ComboLegEntry {
  date: string; // YYYY-MM-DD
  reps: number;
}
export interface ComboLeg {
  slot: string;
  exercise_id: string;
  exercise_name: string;
  muscle_primary?: string | null;
  rep_weight: number; // poids de rep de l'exo (pour l'XP)
  target: number; // objectif de reps sur la semaine
  weight_kg?: number | null; // charge optionnelle → tonnage
  progress: ComboLegEntry[];
}
export interface ComboChallenge {
  id: string;
  name: string;
  start_date: string;
  duration_days: number;
  status: 'active' | 'done' | 'abandoned';
  legs: ComboLeg[];
}

/** Reps réalisées sur un exo (leg). */
export function legDone(leg: ComboLeg): number {
  return leg.progress.reduce((a, p) => a + (p.reps || 0), 0);
}
/** Reps restantes sur un exo. */
export function legRemaining(leg: ComboLeg): number {
  return Math.max(0, leg.target - legDone(leg));
}
export function legComplete(leg: ComboLeg): boolean {
  return legDone(leg) >= leg.target && leg.target > 0;
}

export function comboTargetTotal(c: ComboChallenge): number {
  return c.legs.reduce((a, l) => a + l.target, 0);
}
export function comboDoneTotal(c: ComboChallenge): number {
  return c.legs.reduce((a, l) => a + Math.min(legDone(l), l.target), 0);
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
  const dates = c.legs.flatMap((l) => l.progress.map((p) => p.date)).filter(Boolean);
  if (!dates.length) return 0;
  const last = dates.reduce((m, d) => (d > m ? d : m), dates[0]!);
  const daysUsed = daysBetweenIso(c.start_date, last) + 1;
  const saved = Math.max(0, c.duration_days - daysUsed);
  return saved / c.duration_days;
}

/** XP d'un ensemble de Défis 360 (façon séance + prime de bouclage). */
export function comboXpPoints(combos: ComboChallenge[]): number {
  return combos.reduce((a, c) => {
    let reps = 0;
    let tonnage = 0;
    let targetEffort = 0;
    for (const l of c.legs) {
      const d = legDone(l);
      reps += d * REP_XP * (l.rep_weight ?? 1);
      tonnage += d * (l.weight_kg ?? 0);
      targetEffort += l.target * (l.rep_weight ?? 1);
    }
    const bonus = comboComplete(c) ? 0.25 * targetEffort * (1 + comboEarlyFraction(c)) : 0;
    return a + Math.round(reps + tonnage / 500 + bonus);
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
 * Génère une SÉANCE TIME-BOXÉE à partir des reps RESTANTES : on ne prend PAS
 * toutes les reps manquantes — on remplit une séance de `minutes` (chaque série
 * = ~40 s d'exécution + `restSec` de repos), réparties en round-robin sur les
 * exos non finis (plus de temps → plus d'exos/séries). Pur/testable.
 */
export function buildComboSession(
  c: ComboChallenge,
  opts: { minutes: number; restSec: number },
): ComboSessionExo[] {
  const budget = comboSessionSetBudget(opts.minutes, opts.restSec);
  const exos = c.legs
    .map((l) => ({
      leg: l,
      remaining: legRemaining(l),
      perSet: Math.min(25, Math.max(8, Math.round(l.target / 4))),
      sets: [] as number[],
    }))
    .filter((e) => e.remaining > 0);
  let placed = 0;
  while (placed < budget && exos.some((e) => e.remaining > 0)) {
    for (const e of exos) {
      if (placed >= budget) break;
      if (e.remaining <= 0) continue;
      const s = Math.min(e.perSet, e.remaining);
      e.sets.push(s);
      e.remaining -= s;
      placed++;
    }
  }
  return exos
    .filter((e) => e.sets.length)
    .map((e) => ({
      exercise_id: e.leg.exercise_id,
      exercise_name: e.leg.exercise_name,
      weight_kg: e.leg.weight_kg ?? null,
      sets: e.sets,
    }));
}

/** Objectif de reps/semaine suggéré pour un emplacement (calibré « stimulant »).
 *  ~12-15 séries/semaine par groupe (hypertrophie) → volume relevé pour que la
 *  barre ne monte pas trop vite (essentiel 180, optionnel 120, avant niveau). */
export function suggestComboTarget(level: Level, essential: boolean): number {
  const base = essential ? 180 : 120;
  const f = level === 'debutant' ? 0.7 : level === 'avance' ? 1.4 : 1;
  return Math.round((base * f) / 5) * 5; // arrondi à 5
}
