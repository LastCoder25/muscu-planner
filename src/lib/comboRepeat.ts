// comboRepeat.ts — RELANCER LE DERNIER DÉFI 360, à l'identique (demandé : « pour ceux qui font
// toujours le même 360, qu'ils puissent relancer le dernier, le même, en choisissant la date de
// début »). Pur (aucune dépendance Vue/Supabase).
//
// On repart des exos ET des cibles du dernier défi terminé (ou abandonné), sans rien de ce qui
// s'est passé dedans : ni séries, ni coffre, ni clôture. On garde en revanche le dernier poids
// utilisé (la première série d'une nouvelle semaine se préremplit) et la fourchette de reps figée.
import { occupantsOf, exoAvailability, occupantReason } from '@/lib/exoExclusivity';
import { legLastWeight } from '@/lib/combo';
import type { ComboChallenge, ComboLeg } from '@/lib/combo';
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
