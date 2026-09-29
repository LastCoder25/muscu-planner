import { formatDurationMin } from './duration';

/** 🗂️ Une ligne de la fiche d'un lieu (`PoiCard`) : une pastille « icône libellé : valeur ».
 *  ⚠️ Les VALEURS sont calculées par la page, avec les `computed` que l'envoi applique :
 *  ce module ne porte que la forme et la couleur de réussite. */
export interface PoiFact {
  /** Trajet / réussite : rangés ensemble sur leur propre ligne. */
  go?: true;
  icon: string;
  label: string;
  value: string;
  cls?: string;
  title?: string;
}

/** La teinte d'une chance de réussite (en %) : ≥ 70 vert, ≥ 35 orange, sinon rouge. */
export function winClass(pct: number): string {
  return pct >= 70 ? 'wp-good' : pct >= 35 ? 'wp-mid' : 'wp-bad';
}

/**
 * 🏰 QUI RENTRE d'un assaut sur un point fixe. Pris, le point garde ceux qu'on y poste : ne
 * rentrent que le héros et les champions EN PLUS des places. Raté, tout le monde rentre. Le
 * retour dure autant que l'aller (règle du store : `returnAt = midAt + leg`).
 * `champions` = champions envoyés, `seats` = places en garnison qu'ils peuvent occuper.
 */
export function controlReturnNote(
  legMin: number,
  hero: boolean,
  champions: number,
  seats: number,
): string {
  const extra = Math.max(0, champions - Math.max(0, seats));
  const who = [
    hero ? 'le héros' : '',
    extra ? `${extra} champion${extra > 1 ? 's' : ''} en trop` : '',
  ]
    .filter(Boolean)
    .join(' et ');
  const won = who
    ? `pris, ${who} rentre${(hero ? 1 : 0) + extra > 1 ? 'nt' : ''}`
    : 'pris, tous y restent';
  return `Retour en ${formatDurationMin(legMin)} : tout le monde si l'assaut échoue · ${won}`;
}
