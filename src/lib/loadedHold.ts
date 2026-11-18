// loadedHold.ts — le LEST sur les tenues statiques (planche, chaise).
// Pur (aucune dépendance Vue/Supabase).
//
// Un exo au temps (`unit:'time'`) mesure des SECONDES dans `reps`. Deux exos seulement
// acceptent un lest (un gilet, un disque sur les cuisses) : la planche et la chaise. Table
// EXPLICITE (patron de `HOLD_GAME_EXERCISES`) : jamais une heuristique sur l'unité, sinon
// le gainage latéral ou la corde à sauter proposeraient un lest.
//
// ⚠️ Ce lest n'est PAS de la force soulevée : « 10 kg × 60 s » n'a pas de 1RM (Epley y
// donnerait 30 kg, absurde) ni de tonnage (kg × secondes n'est pas des kg soulevés). Les
// exos au temps sortent donc du 1RM, des records de force et du tonnage ; le lest a son
// propre indicateur, `bestHoldSet` / `detectHoldPRs`, et ne rapporte aucune XP.
import type { PerformedSet, SessionLog } from './types';

/** Les tenues qui acceptent un lest. ⚠️ Le gainage latéral en est absent à dessein. */
const LOADABLE_HOLD_IDS: readonly string[] = [
  'ex_plank', // Gainage (planche)
  'ex_wall_sit', // Chaise
];

export function holdLoadable(exerciseId: string | null | undefined): boolean {
  return !!exerciseId && LOADABLE_HOLD_IDS.includes(exerciseId);
}

/** Un exercice loggé / en cours est-il mesuré en secondes ? (`planned.unit`, comme le
 *  reste de l'app ; la planche et la chaise le sont toujours, même si la cible est vide). */
export function isTimeExercise(ex: {
  id?: string;
  planned?: { unit?: 'reps' | 'time' | undefined } | null;
}): boolean {
  return ex.planned?.unit === 'time' || holdLoadable(ex.id);
}

/** Tonnage (kg soulevés) d'une liste de séries. Un exo au temps vaut 0 : des secondes ne
 *  sont pas des répétitions. Source unique des « volume » de l'app. */
export function workTonnage(sets: { load_kg?: number; reps?: number }[], timed: boolean): number {
  if (timed) return 0;
  return sets.reduce((a, s) => a + (s.load_kg || 0) * (s.reps || 0), 0);
}

/** Tonnage brut d'un bilan complet (historique, Muscu) : `workTonnage` exo par exo. */
export function logTonnage(log: SessionLog): number {
  return (log.exercises ?? []).reduce(
    (a, ex) => a + workTonnage(ex.performed ?? [], isTimeExercise(ex)),
    0,
  );
}

/** Durée minimale (s) pour qu'une tenue lestée compte au record : sans plancher, 20 kg
 *  tenus 3 secondes battraient 10 kg tenus une minute. = bas de la fourchette générée. */
export const HOLD_RECORD_MIN_SEC = 30;

/**
 * Le record de lest d'une tenue : la série au lest le PLUS LOURD parmi celles tenues au
 * moins `HOLD_RECORD_MIN_SEC` ; à lest égal, la plus LONGUE. `null` sans lest (poids du
 * corps) ou si aucune série lestée n'atteint le plancher.
 */
export function bestHoldSet(performed: PerformedSet[]): PerformedSet | null {
  let best: PerformedSet | null = null;
  for (const s of performed) {
    if (!(s.load_kg > 0) || !(s.reps >= HOLD_RECORD_MIN_SEC)) continue;
    if (!best || s.load_kg > best.load_kg || (s.load_kg === best.load_kg && s.reps > best.reps))
      best = s;
  }
  return best;
}

/** Un record de lest battu. */
export interface HoldPR {
  id: string;
  name: string;
  load: number; // lest (kg) de la série record
  secs: number; // sa durée
  prevLoad: number; // ancien meilleur lest (> 0)
}

/** Records de lest battus dans `current` par rapport aux bilans `priors` (current EXCLU).
 *  Comme `detectLiftPRs` : un premier passage lesté est une référence, pas un record. */
export function detectHoldPRs(current: SessionLog, priors: SessionLog[]): HoldPR[] {
  const prev = new Map<string, number>();
  for (const log of priors) {
    for (const ex of log.exercises ?? []) {
      if (!isTimeExercise(ex)) continue;
      const b = bestHoldSet(ex.performed ?? []);
      if (b && b.load_kg > (prev.get(ex.id) ?? 0)) prev.set(ex.id, b.load_kg);
    }
  }
  const out: HoldPR[] = [];
  const seen = new Set<string>();
  for (const ex of current.exercises ?? []) {
    if (seen.has(ex.id) || !isTimeExercise(ex)) continue;
    const b = bestHoldSet(ex.performed ?? []);
    const p = prev.get(ex.id) ?? 0;
    if (b && p > 0 && b.load_kg > p) {
      out.push({ id: ex.id, name: ex.name, load: b.load_kg, secs: b.reps, prevLoad: p });
      seen.add(ex.id);
    }
  }
  return out;
}

const fr = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** « 45 s » · « +10 kg · 45 s » (lest) — une série de tenue, pour tous les écrans. */
export function holdSetLabel(loadKg: number, secs: number): string {
  return loadKg > 0 ? `+${fr(loadKg)} kg · ${secs} s` : `${secs} s`;
}
