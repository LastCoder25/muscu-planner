/**
 * 🏰 QUI EST À LA BASE, EN POINTS SOUS SON ICÔNE (demandé, 2026-10-04 : « comme pour les lieux
 * fixes, sous l'icône sur la carte, les points des champions présents et du héros »).
 *
 * Même langage que la garnison d'un lieu fixe (`garrisonDotRows`) : une lettre par point —
 * `h` le héros (en tête, il est à part), `c` un champion présent, `m` un milicien en réserve
 * (signalé : « je ne vois pas les points de garnison sous la ville portuaire » — sur une île,
 * la garnison du village, c'est d'abord sa milice).
 *
 * ⚫⚫ EN LIGNES DE 5 (demandé, 2026-10-06 : « des lignes de 5 boules pour la garnison de la
 * base ») : le héros et les champions d'abord, les miliciens sur leurs propres lignes, comme
 * sous un lieu fixe. La base n'a pas de places : aucune case vide n'est dessinée. Au-delà de
 * `maxRows` lignes, le reste est rendu (`more`), affiché « +N » au bout de la dernière ligne.
 */
export interface TownDots {
  rows: string[];
  more: number;
}

/** Points par ligne sous la ville. */
export const TOWN_ROW_SIZE = 5;
/** Lignes au plus (la garnison ne descend pas sur le reste de la carte). */
export const TOWN_ROWS_MAX = 4;

const count = (n: number) => Math.max(0, Math.floor(n));
const chunk = (s: string, n: number) =>
  Array.from({ length: Math.ceil(s.length / n) }, (_, i) => s.slice(i * n, (i + 1) * n));

/**
 * 🤕 À L'INFIRMERIE, EN BOULES ROUGES (demandé, 2026-10-07 : « quand des unités, des champions
 * ou le héros sont à l'infirmerie, les noter sous la base avec des boules rouges »). `w` = un
 * blessé (le héros d'abord), sur ses propres lignes, entre les présents et la milice. Un
 * milicien ne va jamais à l'infirmerie (il meurt) : il n'a pas de boule rouge.
 */
export interface TownHurt {
  hero?: boolean;
  champions?: number;
}

export function townDots(
  heroHome: boolean,
  champions: number,
  militia = 0,
  maxRows = TOWN_ROWS_MAX,
  hurt: TownHurt = {},
): TownDots {
  const champs = (heroHome ? 'h' : '') + 'c'.repeat(count(champions));
  const sick = 'w'.repeat((hurt.hero ? 1 : 0) + count(hurt.champions ?? 0));
  const mil = 'm'.repeat(count(militia));
  const shown = [
    ...chunk(champs, TOWN_ROW_SIZE),
    ...chunk(sick, TOWN_ROW_SIZE),
    ...chunk(mil, TOWN_ROW_SIZE),
  ].slice(0, maxRows);
  return {
    rows: shown,
    more: champs.length + sick.length + mil.length - shown.join('').length,
  };
}
