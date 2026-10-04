/**
 * 🏰 QUI EST À LA BASE, EN POINTS SOUS SON ICÔNE (demandé, 2026-10-04 : « comme pour les lieux
 * fixes, sous l'icône sur la carte, les points des champions présents et du héros »).
 *
 * Même langage que la garnison d'un lieu fixe (`garrisonDots`) : une lettre par point —
 * `h` le héros (en tête, il est à part), `c` un champion présent. Au-delà de `max` points la
 * rangée deviendrait plus large que la ville : on en montre `max` et on rend le reste (`more`),
 * affiché « +N » au bout de la rangée.
 */
export interface TownDots {
  dots: string;
  more: number;
}

/** Points au plus sous la ville (la rangée reste dans la largeur de l'enceinte). */
export const TOWN_DOTS_MAX = 8;

export function townDots(heroHome: boolean, champions: number, max = TOWN_DOTS_MAX): TownDots {
  const all = (heroHome ? 'h' : '') + 'c'.repeat(Math.max(0, Math.floor(champions)));
  return { dots: all.slice(0, max), more: Math.max(0, all.length - max) };
}
