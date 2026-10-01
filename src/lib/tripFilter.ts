import type { PoiType } from '@/lib/expedition';

/**
 * 🧭⚔️ LE FILTRE DE LA TUILE « EXPÉDITIONS » (demandé : « fusionne la tuile expéditions et
 * attaques, et rajoute un filtre expédition/attaques au-dessus des tuiles »). Voyages et armées
 * ennemies vivent dans la même rangée ; le filtre choisit ce qu'on regarde.
 *
 * ⏳ « Programmés » (2026-09-30, demandé : « un filtre pour les déplacements programmés en
 * attente et pas encore en cours ») : renforts et retours programmés, groupes d'une attaque
 * combinée qui attendent leur heure. Les autres filtres ne montrent que ce qui est EN ROUTE.
 *
 * 🛡️🗡️ « Renforts » et « Mes attaques » (2026-10-01, demandé : « un filtre pour les renforts
 * et les attaques du joueur, séparés ») : les voyages en route se rangent en trois catégories
 * (`TripCategory`), et les armées ENNEMIES gardent leur propre filtre.
 *
 * ⚠️ Un filtre qui ne montre plus rien se lit comme une liste vide, pas comme un filtre : quand
 * la catégorie choisie se vide (la dernière armée a frappé, le dernier voyage est rentré), on
 * retombe sur « Tout » au lieu de laisser une rangée vide.
 */
export type TripFilter = 'all' | 'trips' | 'reinf' | 'raids' | 'planned' | 'attacks';

/** Ce qu'est un voyage EN ROUTE : une expédition (récolte, fouille, arène), un déplacement
 *  de garnison (renfort, transfert, retour d'un lieu fixe) ou une attaque du joueur. */
export type TripCategory = 'trips' | 'reinf' | 'raids';

/** ⚠️ Exhaustif par construction : un nouveau type de lieu doit dire s'il s'attaque. On
 *  ATTAQUE ce qu'on va combattre pour le prendre ou l'abattre ; un lieu de récolte gardé
 *  (ruines, caravane pillée) reste une expédition — on y va pour ce qu'il rend. */
const POI_TRIP_CATEGORY: Record<PoiType, Exclude<TripCategory, 'reinf'>> = {
  mine: 'trips',
  well: 'trips',
  shrine: 'trips',
  archive: 'trips',
  wreck: 'trips',
  mana_mine: 'trips',
  ruins: 'trips',
  fallen: 'trips',
  plunder: 'trips',
  vein: 'trips',
  arena: 'trips',
  camp: 'raids',
  lair: 'raids',
  den: 'raids',
  rift: 'raids',
  warband: 'raids',
  control: 'raids',
};

/** La catégorie d'un voyage vers un lieu (hors renforts, qui se disent à part). */
export const poiTripCategory = (type: PoiType): Exclude<TripCategory, 'reinf'> =>
  POI_TRIP_CATEGORY[type] ?? 'trips';

export function effectiveTripFilter(
  f: TripFilter,
  n: Record<Exclude<TripFilter, 'all'>, number>,
): TripFilter {
  if (f === 'all') return f;
  return n[f] === 0 ? 'all' : f;
}
