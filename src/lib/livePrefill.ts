// 🏋️ PRÉREMPLIR LA CHARGE D'UNE SÉANCE DE PROGRAMME depuis la dernière fois (audit 2026-10-15).
//
// Un programme tout juste généré n'a pas de charge : chaque série démarrait à 0 kg, et il
// fallait remonter la charge à coups de ＋2,5 à chaque exercice, alors que l'app sait ce
// qu'on a soulevé la dernière fois. « Appliquer la progression » (Bilan) reporte déjà les
// poids — mais seulement si on passe par le Bilan.
//
// ⚠️ ON NE TOUCHE QU'À CE QUI EST VIDE : un exercice dont une charge est déjà posée (plan,
// progression appliquée, pyramide importée), au poids du corps, ou dont une série est déjà
// faite garde ses valeurs. On ne réécrit jamais une décision du joueur ni du moteur.
import type { SessionLog } from './types';
import { instancesOf } from './progression';

interface PrefillSet {
  load_kg: number;
  done: boolean;
  warmup?: boolean;
}
interface PrefillExercise {
  id: string;
  bodyweight: boolean;
  prescribed?: boolean;
  sets: PrefillSet[];
}

/** La charge de travail de la dernière séance de cet exercice : la plus FRÉQUENTE (à égalité,
 *  la plus lourde). ⚠️ Pas la plus lourde tout court : sur une pyramide, ce serait le sommet,
 *  et on démarrerait chaque série à la charge d'une seule. `null` si rien d'exploitable. */
export function lastWorkLoad(exerciseId: string, logs: SessionLog[]): number | null {
  const last = instancesOf(exerciseId, logs)[0];
  if (!last) return null;
  const count = new Map<number, number>();
  for (const s of last.performed) {
    if (!(s.load_kg > 0)) continue;
    count.set(s.load_kg, (count.get(s.load_kg) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [load, n] of count) {
    if (n > bestN || (n === bestN && best !== null && load > best)) {
      best = load;
      bestN = n;
    }
  }
  return best;
}

/** Pose la charge de la dernière séance sur les séries de travail VIDES. Mute les séries et
 *  rend le nombre d'exercices préremplis (0 = rien à faire, rien à sauvegarder). Les logs
 *  sont attendus du plus récent au plus ancien (ordre de `logs.fetchAll`). */
export function prefillLoads(exercises: PrefillExercise[], logs: SessionLog[]): number {
  let changed = 0;
  for (const ex of exercises) {
    if (ex.bodyweight || ex.prescribed) continue;
    const work = ex.sets.filter((s) => !s.warmup);
    if (!work.length || work.some((s) => s.done || s.load_kg > 0)) continue;
    const load = lastWorkLoad(ex.id, logs);
    if (load === null) continue;
    for (const s of work) s.load_kg = load;
    changed++;
  }
  return changed;
}
