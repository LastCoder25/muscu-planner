import { describe, expect, it } from 'vitest';
import {
  ALL_TRIPS,
  allTripsOn,
  poiTripCategory,
  shownTripCats,
  toggleAllTrips,
  toggleTripCat,
  tripCatOn,
  tripCatPillOn,
  type TripCat,
  type TripSelection,
} from '@/lib/tripFilter';

const PRESENT: TripCat[] = ['trips', 'raids', 'reinf', 'attacks'];
const shown = (sel: Parameters<typeof shownTripCats>[0], present = PRESENT) =>
  [...shownTripCats(sel, present)].sort();

describe('filtre combinable des voyages', () => {
  it('« Tout » au départ : toutes les catégories présentes sont affichées', () => {
    expect(shown(ALL_TRIPS)).toEqual([...PRESENT].sort());
    expect(allTripsOn(ALL_TRIPS, PRESENT)).toBe(true);
  });
  it('depuis « Tout », toucher UNE catégorie l’ISOLE ; les touchers suivants ajoutent ou retirent', () => {
    const seul = toggleTripCat(ALL_TRIPS, 'attacks', PRESENT);
    expect(shown(seul)).toEqual(['attacks']);
    expect(allTripsOn(seul, PRESENT)).toBe(false);
    const deux = toggleTripCat(seul, 'trips', PRESENT);
    expect(shown(deux)).toEqual(['attacks', 'trips']);
    expect(shown(toggleTripCat(deux, 'attacks', PRESENT))).toEqual(['trips']);
  });
  it('isole aussi depuis un « Tout » reconstruit pièce par pièce', () => {
    const plein: TripSelection = { mode: 'only', cats: [...PRESENT] };
    expect(shown(toggleTripCat(plein, 'reinf', PRESENT))).toEqual(['reinf']);
  });
  it('éteindre la DERNIÈRE catégorie allumée retire le filtre : tout revient', () => {
    const seul = toggleTripCat(ALL_TRIPS, 'raids', PRESENT);
    expect(toggleTripCat(seul, 'raids', PRESENT)).toEqual(ALL_TRIPS);
    // Une seule catégorie présente : rien à isoler ni à éteindre, tout reste affiché.
    expect(shown(toggleTripCat(ALL_TRIPS, 'trips', ['trips']), ['trips'])).toEqual(['trips']);
  });
  it('une pastille n’est allumée QUE quand elle filtre : sous « Tout », aucune', () => {
    for (const c of PRESENT) expect(tripCatPillOn(ALL_TRIPS, c, PRESENT)).toBe(false);
    const seul = toggleTripCat(ALL_TRIPS, 'raids', PRESENT);
    expect(PRESENT.filter((c) => tripCatPillOn(seul, c, PRESENT))).toEqual(['raids']);
    // Toucher une pastille ALLUMÉE l’éteint toujours (signalé : elle isolait).
    const deux = toggleTripCat(seul, 'trips', PRESENT);
    for (const c of PRESENT.filter((x) => tripCatPillOn(deux, x, PRESENT)))
      expect(tripCatOn(toggleTripCat(deux, c, PRESENT), c)).toBe(false);
  });
  it('« Tout » allumé le retire entièrement ; on AJOUTE ensuite ce qu’on veut', () => {
    const vide = toggleAllTrips(ALL_TRIPS, PRESENT);
    expect(shown(vide)).toEqual([]);
    const combo = toggleTripCat(toggleTripCat(vide, 'trips', PRESENT), 'reinf', PRESENT);
    expect(shown(combo)).toEqual(['reinf', 'trips']);
    expect(shown(toggleTripCat(combo, 'trips', PRESENT))).toEqual(['reinf']);
  });
  it('« Tout » éteint le rallume entièrement', () => {
    const partiel: TripSelection = { mode: 'except', cats: ['raids'] };
    expect(toggleAllTrips(partiel, PRESENT)).toEqual(ALL_TRIPS);
  });
  it('une catégorie qui APPARAÎT s’affiche sous « tout sauf », pas sous « seulement »', () => {
    const sauf: TripSelection = { mode: 'except', cats: ['raids'] };
    const seul = toggleTripCat(toggleAllTrips(ALL_TRIPS, PRESENT), 'trips', PRESENT);
    const plus: TripCat[] = [...PRESENT, 'planned'];
    expect(shownTripCats(sauf, plus).has('planned')).toBe(true);
    expect(shownTripCats(seul, plus).has('planned')).toBe(false);
  });
  it('un choix qui se vide TOUT SEUL retombe sur tout ; vidé par le joueur, il reste vide', () => {
    const seul = toggleTripCat(toggleAllTrips(ALL_TRIPS, PRESENT), 'attacks', PRESENT);
    expect(shown(seul, ['trips', 'reinf'])).toEqual(['reinf', 'trips']);
    expect(shown(toggleAllTrips(ALL_TRIPS, PRESENT), ['trips', 'reinf'])).toEqual([]);
  });
});

describe('poiTripCategory', () => {
  it('ce qu’on combat pour le prendre est une attaque, une récolte une expédition', () => {
    for (const t of ['camp', 'lair', 'den', 'rift', 'warband', 'control'] as const)
      expect(poiTripCategory(t)).toBe('raids');
    for (const t of ['mine', 'well', 'ruins', 'plunder', 'vein', 'arena'] as const)
      expect(poiTripCategory(t)).toBe('trips');
  });
});
