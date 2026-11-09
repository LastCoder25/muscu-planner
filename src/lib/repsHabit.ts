// repsHabit.ts — l'OBJECTIF PROPOSÉ à la création d'un Défi 360 pour un exo compté en reps ou
// en fractionné : tes reps hebdomadaires d'habitude. Pur/testable.
//
// Règle (décidée par l'utilisateur) : MÉDIANE des reps hebdomadaires de l'exo sur les 4
// dernières semaines ACTIVES (séances + Défis 360 + challenges muscu ; une semaine à 0 est
// ignorée), +10 %, arrondi propre. Sans historique : séries × milieu de fourchette.
import type { Challenge } from './challenges';
import { legSets, setOrigin, setWork, comboDayShare, legMode, type ComboChallenge } from './combo';
import { isMuscuLog, mondayOf, type LogEntry } from './volume';

/** Semaines actives lues pour l'habitude. */
const HABIT_WEEKS = 4;
/** Cap d'effort sur l'habitude : on propose un peu plus que ce qu'on fait déjà. */
export const HABIT_UPLIFT = 1.1;

export interface RepDay {
  day: string; // YYYY-MM-DD
  reps: number;
}

/** Les reps de UN exo, jour par jour, toutes sources muscu confondues. Les séances bouclées
 *  et le 360 se lisent à la source (pas via `comboLogEntries`, qui range les mini-séries en
 *  séries équivalentes : ici on veut les reps exactes). Le cardio et les exos au temps n'ont
 *  pas de reps. */
export function exerciseRepDays(
  exerciseId: string,
  src: {
    logs: readonly LogEntry[];
    combos: readonly ComboChallenge[];
    challenges: readonly Challenge[];
  },
): RepDay[] {
  const out: RepDay[] = [];
  for (const e of src.logs) {
    if (!isMuscuLog(e.log)) continue;
    for (const ex of e.log.exercises ?? []) {
      if (ex.id !== exerciseId) continue;
      const reps = (ex.performed ?? []).reduce((a, s) => a + (s.reps || 0), 0);
      if (reps > 0) out.push({ day: e.performedAt.slice(0, 10), reps });
    }
  }
  for (const c of src.combos) {
    for (const leg of c.legs) {
      if (legMode(leg) === 'time') continue;
      for (const s of legSets(leg)) {
        if (setOrigin(leg, s).exercise_id !== exerciseId) continue;
        const reps = setWork(leg, s).reps || 0;
        if (reps > 0 && s.date) out.push({ day: s.date.slice(0, 10), reps });
      }
    }
  }
  for (const ch of src.challenges) {
    if (ch.exercise_id !== exerciseId || ch.unit !== 'reps') continue;
    for (const p of ch.progress ?? []) {
      // Mode séries : la somme des reps des séries ; sinon le compteur du jour.
      const reps =
        ch.config.count_mode === 'sets'
          ? (p.sets ?? []).reduce((a, s) => a + (s.reps || 0), 0)
          : (p.done ?? 0);
      if (reps > 0 && p.date) out.push({ day: p.date.slice(0, 10), reps });
    }
  }
  return out;
}

/** Total de reps de chaque semaine ACTIVE (lundi → dimanche), la plus récente d'abord. La
 *  semaine de `today` est EXCLUE : incomplète, elle tirerait l'habitude vers le bas. Les
 *  semaines à 0 n'existent pas dans le résultat. */
export function weeklyRepTotals(days: readonly RepDay[], today: string): number[] {
  const current = mondayOf(today);
  const byWeek = new Map<string, number>();
  for (const d of days) {
    const w = mondayOf(d.day);
    if (w >= current) continue;
    byWeek.set(w, (byWeek.get(w) ?? 0) + d.reps);
  }
  return [...byWeek.entries()]
    .filter(([, reps]) => reps > 0)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([, reps]) => reps);
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Ce que tu fais d'habitude en une semaine : médiane des `HABIT_WEEKS` dernières semaines
 *  actives. `null` sans aucune semaine active. */
export function habitWeeklyReps(totals: readonly number[]): number | null {
  const last = totals.slice(0, HABIT_WEEKS);
  return last.length ? median(last) : null;
}

/** Arrondi « propre » d'un objectif : à l'unité sous 10, aux 5 jusqu'à 100, aux 10 au-delà.
 *  Jamais 0. */
export function roundTarget(n: number): number {
  if (!(n > 0)) return 1;
  if (n < 10) return Math.max(1, Math.round(n));
  if (n < 100) return Math.round(n / 5) * 5;
  return Math.round(n / 10) * 10;
}

export interface RepsProposal {
  /** Objectif proposé pour la durée du défi, en reps. */
  target: number;
  /** « tu fais d'habitude ~N reps par semaine » : null quand on se rabat sur la fourchette. */
  habit: number | null;
}

/** L'objectif proposé pour UN exo compté en reps : l'habitude +10 %, mise au prorata des jours
 *  du défi (3 à 7) et arrondie ; sans historique, `fallbackSets` (séries de la durée du défi)
 *  × `mid` (milieu de la fourchette de reps de l'exo). */
export function proposeRepsTarget(input: {
  days: readonly RepDay[];
  today: string;
  durationDays: number;
  fallbackSets: number;
  mid: number;
}): RepsProposal {
  const habit = habitWeeklyReps(weeklyRepTotals(input.days, input.today));
  if (habit === null)
    return { target: roundTarget(input.fallbackSets * Math.max(1, input.mid)), habit: null };
  return {
    target: roundTarget(habit * HABIT_UPLIFT * comboDayShare(input.durationDays)),
    habit: Math.round(habit),
  };
}

/** 🎯 Le défi d'APRÈS un défi Découverte : le total réalisé +10 % (la même règle que
 *  l'habitude), arrondi proprement, et toujours au moins une rep de plus. */
export function followUpTarget(total: number): number {
  if (!(total > 0)) return 10;
  return Math.max(roundTarget(total * HABIT_UPLIFT), Math.floor(total) + 1);
}
