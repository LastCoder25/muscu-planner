// liveInsights.ts — ce que la séance live sait de « la dernière fois » et des records.
// Pur (aucune dépendance Vue/Supabase) ; consommé par SessionLivePage.
//
// ⚠️ UNE SEULE SOURCE D'HISTORIQUE : celle du préremplissage de charge (`livePrefill`) —
// `instancesOf` sur les bilans de `logs.fetchAll` (du plus récent au plus ancien). Pas de
// seconde requête, pas de second calcul de « la dernière séance de cet exercice ».
import { bestE1RM, estimate1RM } from './estimates';
import { instancesOf } from './progression';
import type { PerformedSet, SessionLog } from './types';

/** Les séries de travail de la DERNIÈRE séance où cet exercice a été fait (vide si jamais). */
export function lastTimeSets(exerciseId: string, logs: SessionLog[]): PerformedSet[] {
  return instancesOf(exerciseId, logs)[0]?.performed ?? [];
}

/**
 * La perf de la dernière fois à la MÊME POSITION de série (`position` = rang 1-based parmi
 * les séries de TRAVAIL : la 2ᵉ série d'aujourd'hui se compare à la 2ᵉ d'hier).
 *
 * ⚠️ Pas de repli sur « la dernière série d'hier » quand hier en avait moins : une 4ᵉ série
 * comparée à la 3ᵉ ferait mentir la pastille. `null` = rien à montrer.
 */
export function lastTimeAt(last: PerformedSet[], position: number): PerformedSet | null {
  if (position < 1) return null;
  return last[position - 1] ?? null;
}

/** « 42,5 kg × 12 » · « 12 reps » (poids du corps) · « 45 s » (exo en temps) · « +10 kg × 8 » (lest). */
export function formatLastTime(set: PerformedSet, opts: { time: boolean; bodyweight: boolean }) {
  const fr = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  if (opts.time) return `${fr(set.reps)} s`;
  if (!(set.load_kg > 0)) return `${set.reps} reps`;
  return `${opts.bodyweight ? '+' : ''}${fr(set.load_kg)} kg × ${set.reps}`;
}

/** Le meilleur 1RM estimé (Epley) de toutes les séances passées de cet exercice ; 0 = jamais. */
export function historicalBestE1RM(exerciseId: string, logs: SessionLog[]): number {
  let best = 0;
  for (const ex of instancesOf(exerciseId, logs)) best = Math.max(best, bestE1RM(ex.performed));
  return best;
}

/**
 * Cette série, qu'on vient de valider, bat-elle le record de l'exercice ?
 *
 *  - Le record est le 1RM estimé (Epley, `estimate1RM`) — le MÊME critère que le mur de
 *    records et que le Bilan (`detectLiftPRs`) : l'écran live ne peut pas féliciter ce que
 *    le Bilan ne confirmerait pas.
 *  - ⚠️ PAS DE RECORD SANS HISTORIQUE : `historyBest` = 0 (première séance de l'exercice,
 *    ou exercice sans charge) → faux. Une première fois n'est pas un record, c'est une
 *    référence (même règle que `detectLiftPRs`).
 *  - ⚠️ ON NE FÊTE QU'UNE FOIS PAR SÉANCE ET PAR PALIER : la série doit aussi battre les
 *    séries DÉJÀ validées aujourd'hui (`earlierSets`), sinon trois séries identiques à
 *    100 kg × 5 déclencheraient trois « nouveau record ».
 *  - Exercice en temps ou poids du corps sans lest : 1RM = 0 → jamais de record de force.
 *  - Les séries d'approche ne sont jamais passées ici (l'appelant ne donne que du travail).
 */
export function isNewRecord(
  historyBest: number,
  set: { load_kg: number; reps: number },
  earlierSets: { load_kg: number; reps: number }[] = [],
): boolean {
  if (!(historyBest > 0)) return false;
  const e = estimate1RM(set.load_kg, set.reps);
  if (e <= historyBest) return false;
  for (const s of earlierSets) if (estimate1RM(s.load_kg, s.reps) >= e) return false;
  return true;
}
