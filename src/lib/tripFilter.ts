/**
 * 🧭⚔️ LE FILTRE DE LA TUILE « EXPÉDITIONS » (demandé : « fusionne la tuile expéditions et
 * attaques, et rajoute un filtre expédition/attaques au-dessus des tuiles »). Voyages et armées
 * ennemies vivent dans la même rangée ; le filtre choisit ce qu'on regarde.
 *
 * ⚠️ Un filtre qui ne montre plus rien se lit comme une liste vide, pas comme un filtre : quand
 * la catégorie choisie se vide (la dernière armée a frappé, le dernier voyage est rentré), on
 * retombe sur « Tout » au lieu de laisser une rangée vide.
 */
export type TripFilter = 'all' | 'trips' | 'attacks';

export function effectiveTripFilter(f: TripFilter, trips: number, attacks: number): TripFilter {
  if (f === 'trips' && trips === 0) return 'all';
  if (f === 'attacks' && attacks === 0) return 'all';
  return f;
}
