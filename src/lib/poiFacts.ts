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
 * rentrent que le héros et les champions EN PLUS des places, à LEUR pas (`wonMin`, souvent
 * plus court : le héros seul marche plus vite que l'équipe). Raté, tout le monde rentre, au
 * pas de toute l'équipe (`lostMin`, la durée de l'aller) — règle du store (`returnLegs`).
 * `champions` = champions envoyés, `seats` = places en garnison qu'ils peuvent occuper.
 */
export function controlReturnNote(
  lostMin: number,
  wonMin: number,
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
    ? `pris, ${who} rentre${(hero ? 1 : 0) + extra > 1 ? 'nt' : ''} en ${formatDurationMin(wonMin)}`
    : 'pris, tous y restent';
  return `Retour : tout le monde en ${formatDurationMin(lostMin)} si l'assaut échoue · ${won}`;
}

/** La valeur de la pastille « ↩️ Retour » d'un assaut : « pris / raté » quand ils diffèrent
 *  (« — » si personne ne rentre après une prise), sinon la seule durée. */
export function controlReturnValue(lostMin: number, wonMin: number): string {
  if (wonMin >= lostMin) return formatDurationMin(lostMin);
  return `${wonMin > 0 ? formatDurationMin(wonMin) : '—'} / ${formatDurationMin(lostMin)}`;
}
