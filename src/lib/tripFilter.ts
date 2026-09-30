/**
 * 🧭⚔️ LE FILTRE DE LA TUILE « EXPÉDITIONS » (demandé : « fusionne la tuile expéditions et
 * attaques, et rajoute un filtre expédition/attaques au-dessus des tuiles »). Voyages et armées
 * ennemies vivent dans la même rangée ; le filtre choisit ce qu'on regarde.
 *
 * ⏳ « Programmés » (2026-09-30, demandé : « un filtre pour les déplacements programmés en
 * attente et pas encore en cours ») : renforts et retours programmés, groupes d'une attaque
 * combinée qui attendent leur heure. « Expéditions » ne montre plus que ce qui est EN ROUTE.
 *
 * ⚠️ Un filtre qui ne montre plus rien se lit comme une liste vide, pas comme un filtre : quand
 * la catégorie choisie se vide (la dernière armée a frappé, le dernier voyage est rentré), on
 * retombe sur « Tout » au lieu de laisser une rangée vide.
 */
export type TripFilter = 'all' | 'trips' | 'planned' | 'attacks';

export function effectiveTripFilter(
  f: TripFilter,
  n: { trips: number; planned: number; attacks: number },
): TripFilter {
  if (f === 'all') return f;
  return n[f] === 0 ? 'all' : f;
}
