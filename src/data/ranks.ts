// Rangs façon manga (F → SSS) : ordre + couleurs, partagés par la carte de rang,
// le badge d'accueil et l'animation de montée de rang. Les seuils XP vivent dans
// lib/challenges.ts (LEVEL_BANDS) ; ici c'est l'habillage.
export const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'] as const;

export const RANK_COLORS: Record<string, string> = {
  F: '#8a8a8a',
  E: '#7bc86c',
  D: '#4db6ac',
  C: '#5aa9e6',
  B: '#b57bff',
  A: '#ffb23f',
  S: '#ff6a45',
  SS: '#ffd23f',
  SSS: '#ffd23f',
};

export function rankColor(title: string): string {
  return RANK_COLORS[title] ?? '#8a8a8a';
}
export function rankIndex(title: string): number {
  return (RANKS as readonly string[]).indexOf(title);
}
