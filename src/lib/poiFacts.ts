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
