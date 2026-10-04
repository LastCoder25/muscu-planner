/**
 * 🏰 QUI EST À LA BASE, EN POINTS SOUS SON ICÔNE (demandé, 2026-10-04 : « comme pour les lieux
 * fixes, sous l'icône sur la carte, les points des champions présents et du héros »).
 *
 * Même langage que la garnison d'un lieu fixe (`garrisonDots`) : une lettre par point —
 * `h` le héros (en tête, il est à part), `c` un champion présent, `m` un milicien en réserve
 * (signalé : « je ne vois pas les points de garnison sous la ville portuaire » — sur une île,
 * la garnison du village, c'est d'abord sa milice). Au-delà de `max` points la rangée
 * deviendrait plus large que la ville : on en montre `max` et on rend le reste (`more`),
 * affiché « +N » au bout de la rangée.
 */
export interface TownDots {
  dots: string;
  more: number;
}

/** Points au plus sous la ville (la rangée reste dans la largeur de l'enceinte). */
export const TOWN_DOTS_MAX = 8;

const count = (n: number) => Math.max(0, Math.floor(n));

export function townDots(
  heroHome: boolean,
  champions: number,
  militia = 0,
  max = TOWN_DOTS_MAX,
): TownDots {
  const all = (heroHome ? 'h' : '') + 'c'.repeat(count(champions)) + 'm'.repeat(count(militia));
  return { dots: all.slice(0, max), more: Math.max(0, all.length - max) };
}
