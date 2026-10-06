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

/** 🧩 SÉLECTION MULTIPLE (v1.76.0, demandé : « des filtres qu'on clique pour les ajouter au
 *  filtre global et qu'on désélectionne pour les enlever ; cliquer sur Tout puis enlever ceux
 *  qu'on ne veut pas »). Deux façons de la dire, et la différence compte :
 *  - `except` = « tout SAUF… » : ce que donne « Tout ». Une catégorie qui APPARAÎT ensuite
 *    (une armée repérée, un renfort lancé) s'affiche d'office ;
 *  - `only` = « seulement… » : ce qu'on a construit pièce par pièce depuis une rangée vide.
 *  Une simple liste de catégories cochées ne saurait pas distinguer les deux. */
export type TripCat = Exclude<TripFilter, 'all'>;
export interface TripSelection {
  mode: 'except' | 'only';
  cats: TripCat[];
}
export const ALL_TRIPS: TripSelection = { mode: 'except', cats: [] };

export const tripCatOn = (sel: TripSelection, cat: TripCat): boolean =>
  sel.mode === 'except' ? !sel.cats.includes(cat) : sel.cats.includes(cat);

/** Toucher une catégorie la retire si elle est affichée, l'ajoute sinon. */
export function toggleTripCat(sel: TripSelection, cat: TripCat): TripSelection {
  const has = sel.cats.includes(cat);
  return { mode: sel.mode, cats: has ? sel.cats.filter((c) => c !== cat) : [...sel.cats, cat] };
}

/** « Tout » est allumé quand toutes les catégories PRÉSENTES le sont. */
export const allTripsOn = (sel: TripSelection, present: readonly TripCat[]): boolean =>
  present.every((c) => tripCatOn(sel, c));

/** Toucher « Tout » : tout afficher ; si tout l'est déjà, tout retirer (pour ne rajouter
 *  ensuite que ce qu'on veut). */
export const toggleAllTrips = (sel: TripSelection, present: readonly TripCat[]): TripSelection =>
  present.length > 0 && allTripsOn(sel, present) ? { mode: 'only', cats: [] } : ALL_TRIPS;

/** Les catégories affichées. ⚠️ Un filtre qui se vide TOUT SEUL (les catégories choisies
 *  n'ont plus rien : la dernière armée a frappé, le dernier voyage est rentré) retombe sur
 *  tout, au lieu d'une rangée vide qui se lirait comme « aucun voyage ». Une rangée vidée par
 *  le joueur (rien de coché), elle, reste vide. */
export function shownTripCats(sel: TripSelection, present: readonly TripCat[]): Set<TripCat> {
  const on = present.filter((c) => tripCatOn(sel, c));
  if (on.length === 0 && sel.mode === 'only' && sel.cats.length > 0) return new Set(present);
  return new Set(on);
}
