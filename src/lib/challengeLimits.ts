// challengeLimits.ts — combien de défis on peut mener de front (pur, testé).
// Modèle « jetons par durée » : chaque défi coûte 1 à 3 jetons selon sa durée,
// budget par voie (Muscu / Cardio). Les petits exos d'isolation (« accessoires »)
// ne coûtent pas de jeton mais occupent 1 emplacement dédié (1 max par voie).

export const CHALLENGE_TOKEN_BUDGET = 4;

// Petits muscles d'isolation → défi « accessoire » (mollets, gainage/abdos, bras).
// Le slot accessoire étant unique par voie, être inclusif ne change que QUEL exo
// est gratuit, pas le nombre simultané.
export const ACCESSORY_MUSCLES = ['mollets', 'abdominaux', 'biceps', 'triceps'];

/** Coût en jetons selon la durée : court ≤7 j = 1, moyen 8–21 j = 2, long ≥22 j = 3. */
export function tokenCost(durationDays: number): 1 | 2 | 3 {
  if (durationDays <= 7) return 1;
  if (durationDays <= 21) return 2;
  return 3;
}

/** Un défi sur ce muscle est-il « accessoire » (gratuit en jetons) ? */
export function isAccessoryMuscle(muscle?: string | null): boolean {
  return !!muscle && ACCESSORY_MUSCLES.includes(muscle.trim().toLowerCase());
}

export interface LaneChallenge {
  accessory: boolean;
  durationDays: number;
}

/** Jetons consommés par les défis NON accessoires d'une voie. */
export function usedTokens(activeSameLane: LaneChallenge[]): number {
  return activeSameLane
    .filter((c) => !c.accessory)
    .reduce((s, c) => s + tokenCost(c.durationDays), 0);
}
/** Nombre de défis accessoires actifs d'une voie. */
export function accessoryCount(activeSameLane: LaneChallenge[]): number {
  return activeSameLane.filter((c) => c.accessory).length;
}
/** Jetons encore disponibles dans une voie. */
export function remainingTokens(activeSameLane: LaneChallenge[]): number {
  return Math.max(0, CHALLENGE_TOKEN_BUDGET - usedTokens(activeSameLane));
}

export type AddDenyReason = 'tokens' | 'accessory';

/** Peut-on ajouter ce défi dans sa voie (déjà filtrée à la même voie) ? */
export function canAddChallenge(
  activeSameLane: LaneChallenge[],
  candidate: LaneChallenge,
): { ok: true } | { ok: false; reason: AddDenyReason } {
  if (candidate.accessory) {
    return accessoryCount(activeSameLane) >= 1 ? { ok: false, reason: 'accessory' } : { ok: true };
  }
  if (usedTokens(activeSameLane) + tokenCost(candidate.durationDays) > CHALLENGE_TOKEN_BUDGET) {
    return { ok: false, reason: 'tokens' };
  }
  return { ok: true };
}
