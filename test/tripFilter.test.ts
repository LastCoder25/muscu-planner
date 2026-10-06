import { describe, expect, it } from 'vitest';
import {
  ALL_TRIPS,
  allTripsOn,
  poiTripCategory,
  shownTripCats,
  toggleAllTrips,
  toggleTripCat,
  type TripCat,
} from '@/lib/tripFilter';

const PRESENT: TripCat[] = ['trips', 'raids', 'reinf', 'attacks'];
const shown = (sel: Parameters<typeof shownTripCats>[0], present = PRESENT) =>
  [...shownTripCats(sel, present)].sort();

describe('filtre combinable des voyages', () => {
  it('« Tout » au départ : toutes les catégories présentes sont affichées', () => {
    expect(shown(ALL_TRIPS)).toEqual([...PRESENT].sort());
    expect(allTripsOn(ALL_TRIPS, PRESENT)).toBe(true);
  });
  it('depuis « Tout », toucher une catégorie la RETIRE, la retoucher la remet', () => {
    const sans = toggleTripCat(ALL_TRIPS, 'attacks');
    expect(shown(sans)).toEqual(['raids', 'reinf', 'trips']);
    expect(allTripsOn(sans, PRESENT)).toBe(false);
    expect(shown(toggleTripCat(sans, 'attacks'))).toEqual([...PRESENT].sort());
  });
  it('« Tout » allumé le retire entièrement ; on AJOUTE ensuite ce qu’on veut', () => {
    const vide = toggleAllTrips(ALL_TRIPS, PRESENT);
    expect(shown(vide)).toEqual([]);
    const combo = toggleTripCat(toggleTripCat(vide, 'trips'), 'reinf');
    expect(shown(combo)).toEqual(['reinf', 'trips']);
    expect(shown(toggleTripCat(combo, 'trips'))).toEqual(['reinf']);
  });
  it('« Tout » éteint le rallume entièrement', () => {
    const partiel = toggleTripCat(ALL_TRIPS, 'raids');
    expect(toggleAllTrips(partiel, PRESENT)).toEqual(ALL_TRIPS);
  });
  it('une catégorie qui APPARAÎT s’affiche sous « tout sauf », pas sous « seulement »', () => {
    const sauf = toggleTripCat(ALL_TRIPS, 'raids');
    const seul = toggleTripCat(toggleAllTrips(ALL_TRIPS, PRESENT), 'trips');
    const plus: TripCat[] = [...PRESENT, 'planned'];
    expect(shownTripCats(sauf, plus).has('planned')).toBe(true);
    expect(shownTripCats(seul, plus).has('planned')).toBe(false);
  });
  it('un choix qui se vide TOUT SEUL retombe sur tout ; vidé par le joueur, il reste vide', () => {
    const seul = toggleTripCat(toggleAllTrips(ALL_TRIPS, PRESENT), 'attacks');
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
