// comboRepeat.ts — RELANCER LE DERNIER DÉFI 360, à l'identique (demandé : « pour ceux qui font
// toujours le même 360, qu'ils puissent relancer le dernier, le même, en choisissant la date de
// début »). Pur (aucune dépendance Vue/Supabase).
//
// On repart des exos ET des cibles du dernier défi terminé (ou abandonné), sans rien de ce qui
// s'est passé dedans : ni séries, ni coffre, ni clôture. On garde en revanche le dernier poids
// utilisé (la première série d'une nouvelle semaine se préremplit) et la fourchette de reps figée.
import { occupantsOf, exoAvailability, occupantReason } from '@/lib/exoExclusivity';
import { COMBO_HOLD_SEC, comboMode, legIsHold, legLastWeight, legMode } from '@/lib/combo';
import type { ComboChallenge, ComboCountMode, ComboLeg, ComboMode } from '@/lib/combo';
import type { Challenge } from '@/lib/challenges';

/** Ce que le magasin sait créer (cf. `NewCombo` du store) : le défi, sans identifiant ni statut. */
export interface RepeatInput {
  name: string;
  start_date: string;
  duration_days: number;
  legs: ComboLeg[];
  config?: ComboChallenge['config'];
}

/** Le dernier défi à proposer de relancer : le plus récent (date de départ) parmi ceux qui ne
 *  sont plus en cours et qui avaient des exos. null s'il n'y en a pas. Copie, jamais en place. */
export function lastRepeatable<T extends ComboChallenge>(list: readonly T[]): T | null {
  let best: T | null = null;
  for (const c of list) {
    if (c.status === 'active' || !c.legs?.length) continue;
    if (!best || c.start_date > best.start_date) best = c;
  }
  return best;
}

export interface RepeatSummary {
  exos: number;
  /** Groupes musculaires (emplacements) distincts. */
  groups: number;
  days: number;
  /** Les noms, dans l'ordre du défi. */
  names: string[];
}

export function repeatSummary(c: ComboChallenge): RepeatSummary {
  return {
    exos: c.legs.length,
    groups: new Set(c.legs.map((l) => l.slot)).size,
    days: c.duration_days,
    names: c.legs.map((l) => l.exercise_name),
  };
}

/** Le même défi, vierge, qui démarre à `startDate`. Les séries, l'ancien historique de saisie et
 *  les drapeaux de fin disparaissent ; le dernier poids et le dernier lest restent. */
export function comboRepeatInput(last: ComboChallenge, startDate: string): RepeatInput {
  const legs: ComboLeg[] = last.legs.map((l) => {
    const copy: ComboLeg = { ...l, weight_kg: legLastWeight(l), sets: [] };
    // Ni l'historique de saisie d'avant, ni le mode fractionné hérité (champs optionnels).
    delete copy.progress;
    delete copy.fractional;
    return copy;
  });
  const input: RepeatInput = {
    name: last.name || 'Défi 360',
    start_date: startDate,
    duration_days: last.duration_days,
    legs,
  };
  if (last.config) {
    const rest = { ...last.config };
    delete rest.closed_by_user; // la clôture manuelle d'avant ne se reprend pas
    if (Object.keys(rest).length) input.config = rest;
  }
  return input;
}

/** Ce qui empêche de relancer : un exo du dernier défi est pris par un challenge actif (un exo est
 *  soit en challenge, soit en 360). Renvoie la première raison, ou null si tout est libre. */
export function repeatBlocker(
  last: ComboChallenge,
  activeChallenges: readonly Challenge[],
): string | null {
  const occupants = occupantsOf(activeChallenges, []);
  for (const l of last.legs) {
    const b = exoAvailability(l.exercise_id, occupants).classic;
    if (b) return `${l.exercise_name} : ${occupantReason(b)}`;
  }
  return null;
}

// ── ✏️ « AJUSTER AVANT » : le dernier défi, remis dans l'écran de création au bilan ─────────────
// (demandé : « avant de vraiment le relancer, remettre le bilan des exercices et de la répartition,
// au cas où on veuille légèrement modifier »). On ne recopie pas les jambes : on reconstitue les
// CHOIX que l'écran de création sait lire (exos par groupe, volume du groupe, répartition, poids).

/** Un groupe tel que l'écran de création le stocke (même forme que ses `picks`). */
interface RepeatPick {
  exercise_ids: string[];
  /** Volume du groupe : séries (ou total de reps en mode reps) sur la durée du défi. */
  target: number;
  /** Le même volume en SÉRIES (repli quand on repasse de reps à séries). */
  setsTarget: number;
  weight_kg: number | null;
  count_mode: ComboCountMode;
  /** ⏱️ Les exos AU TEMPS du groupe qui se comptent en SÉRIES de tenues (les autres, en durée). */
  holdSets?: string[];
  /** La répartition entre exos du dernier défi, reprise telle quelle (mode par exercice). */
  alloc?: Record<string, number>;
}

export interface RepeatDraft {
  duration: number;
  mode: ComboMode;
  /** Par emplacement. Un groupe sans aucun exo encore disponible est absent. */
  picks: Record<string, RepeatPick>;
  /** Noms des exos du dernier défi qu'on ne peut plus reprendre (retirés, pris par un challenge…). */
  missing: string[];
}

/** Part d'un exo dans son groupe, dans l'unité de l'écran de création : séries (une tenue =
 *  `COMBO_HOLD_SEC` secondes par série en durée ; une tenue comptée en séries vaut sa cible
 *  telle quelle) ou reps. Au moins 1. */
function legShare(l: ComboLeg): number {
  return Math.max(1, Math.round(l.count_mode === 'time' ? l.target / COMBO_HOLD_SEC : l.target));
}

/** Le dernier défi, en choix de l'écran de création. `available` = les exos qu'on peut encore
 *  prendre (dans la bibliothèque et libres de tout challenge). Pur ; ne modifie pas `last`. */
export function comboRepeatDraft(
  last: ComboChallenge,
  available: ReadonlySet<string>,
): RepeatDraft {
  const mode = comboMode(last);
  const missing: string[] = [];
  const bySlot = new Map<string, ComboLeg[]>();
  for (const l of last.legs) {
    if (!available.has(l.exercise_id)) {
      missing.push(l.exercise_name);
      continue;
    }
    bySlot.set(l.slot, [...(bySlot.get(l.slot) ?? []), l]);
  }
  const picks: Record<string, RepeatPick> = {};
  for (const [slot, legs] of bySlot) {
    const ids = legs.map((l) => l.exercise_id);
    const firstLoaded = legs.find((l) => !legIsHold(l));
    const weight = firstLoaded ? legLastWeight(firstLoaded) : null;
    if (mode === 'group') {
      const target = Math.max(1, last.config?.groups?.find((g) => g.slot === slot)?.target ?? 1);
      picks[slot] = {
        exercise_ids: ids,
        target,
        setsTarget: target,
        weight_kg: weight,
        count_mode: 'sets',
      };
      continue;
    }
    const alloc: Record<string, number> = {};
    for (const l of legs) alloc[l.exercise_id] = legShare(l);
    const reps = legs.some((l) => l.count_mode === 'reps');
    const holdSets = legs
      .filter((l) => legMode(l) === 'sets' && l.hold === true)
      .map((l) => l.exercise_id);
    const target = Object.values(alloc).reduce((a, b) => a + b, 0);
    // Le volume en séries : un exo compté en reps vaut (reps / milieu de sa fourchette) séries.
    const setsTarget = reps
      ? legs.reduce((a, l) => {
          if (l.count_mode !== 'reps') return a + legShare(l);
          const mid = ((l.rep_min ?? 8) + (l.rep_max ?? 12)) / 2;
          return a + Math.max(1, Math.round(l.target / mid));
        }, 0)
      : target;
    picks[slot] = {
      exercise_ids: ids,
      target,
      setsTarget,
      weight_kg: weight,
      count_mode: reps ? 'reps' : 'sets',
      ...(holdSets.length ? { holdSets } : {}),
      alloc,
    };
  }
  return { duration: last.duration_days, mode, picks, missing };
}
