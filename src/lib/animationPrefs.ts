// animationPrefs — 🎬 quelles animations plein écran se lancent TOUTES SEULES.
//
// Une préférence d'AFFICHAGE, par appareil (`localStorage`), jamais un état de jeu : désactiver
// une animation ne change ni le rapport, ni le butin, ni l'XP — le résultat est le même, il
// n'est simplement plus mis en scène d'office. Le bouton « Revoir » de chaque rapport reste.
// Tout est ACTIVÉ par défaut ; seul « 0 » éteint (une valeur inconnue ou un stockage
// indisponible ne doivent jamais couper une animation en silence).

export type AnimationKind = 'siege' | 'rift' | 'overflow' | 'fboss';

export interface AnimationOption {
  id: AnimationKind;
  emoji: string;
  label: string;
  hint: string;
}

export const ANIMATION_OPTIONS: readonly AnimationOption[] = [
  {
    id: 'siege',
    emoji: '🛡️',
    label: 'Défense de la base',
    hint: 'le siège rejoué à la résolution',
  },
  {
    id: 'rift',
    emoji: '🕳️',
    label: 'Failles, tanières et ruines',
    hint: 'incursions, duels de tanière, fouilles',
  },
  {
    id: 'overflow',
    emoji: '💥',
    label: 'Débordement de faille',
    hint: 'l’armée qui sort de la faille',
  },
  {
    id: 'fboss',
    emoji: '🐉',
    label: 'Boss entre amis',
    hint: 'les frappes des amis depuis ta dernière visite',
  },
];

export function animationKey(kind: AnimationKind): string {
  return `muscu:anim:${kind}`;
}

/** Activée sauf si la valeur stockée est exactement « 0 ». */
export function parseAnimationPref(raw: string | null): boolean {
  return raw !== '0';
}
