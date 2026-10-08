import { describe, expect, it } from 'vitest';
import { navStep, navTripKeys, tripCatOf, type NavTrip } from '@/lib/tripNav';
import { ALL_TRIPS, type TripSelection } from '@/lib/tripFilter';
import { ALL_LEGS } from '@/lib/tripLegTiles';

const trip = (key: string, endsAt: number, extra: Partial<NavTrip> = {}): NavTrip => ({
  key,
  back: false,
  time: '',
  pct: 0,
  endsAt,
  ...extra,
});
const TRIPS: NavTrip[] = [
  trip('c', 300, { cat: 'reinf' }),
  trip('a', 100, { cat: 'trips' }),
  trip('p', 50, { pending: true, cat: 'reinf' }),
  trip('b', 200, { cat: 'raids' }),
];

describe('‹ › navTripKeys : les voyages du filtre actif, dans l’ordre de la rangée', () => {
  it('sans filtre : tous, rangés à l’heure de leur étape', () => {
    expect(navTripKeys(TRIPS, ALL_TRIPS, ALL_LEGS)).toEqual(['p', 'a', 'b', 'c']);
  });
  it('avec un filtre : seulement ce qu’il laisse voir', () => {
    const only: TripSelection = { mode: 'only', cats: ['reinf'] };
    expect(navTripKeys(TRIPS, only, ALL_LEGS)).toEqual(['c']);
  });
  it('un voyage programmé ne compte que dans « Programmés »', () => {
    expect(tripCatOf(TRIPS[2]!)).toBe('planned');
    const noPlanned: TripSelection = { mode: 'except', cats: ['planned'] };
    expect(navTripKeys(TRIPS, noPlanned, ALL_LEGS)).toEqual(['a', 'b', 'c']);
  });
  it('un voyage à deux étapes n’apparaît qu’une fois', () => {
    const two = trip('x', 10, {
      cat: 'trips',
      homeAt: 500,
      legs: { go: '→', back: '↩', detail: '' },
    });
    expect(navTripKeys([two, trip('y', 20, { cat: 'trips' })], ALL_TRIPS, ALL_LEGS)).toEqual([
      'x',
      'y',
    ]);
  });
  it('le filtre d’étape s’applique : « Retour » seul garde ceux dont le retour est à venir', () => {
    const two = trip('x', 10, {
      cat: 'trips',
      homeAt: 500,
      legs: { go: '→', back: '↩', detail: '' },
    });
    const goOnly = trip('y', 20, { cat: 'trips' });
    expect(navTripKeys([two, goOnly], ALL_TRIPS, new Set(['back']))).toEqual(['x']);
  });
});

describe('‹ › navStep', () => {
  it('avance et recule en boucle', () => {
    expect(navStep(['a', 'b', 'c'], 'a', 1)).toBe('b');
    expect(navStep(['a', 'b', 'c'], 'c', 1)).toBe('a');
    expect(navStep(['a', 'b', 'c'], 'a', -1)).toBe('c');
  });
  it('rien à parcourir avec un seul voyage, le premier si on est hors du filtre', () => {
    expect(navStep(['a'], 'a', 1)).toBeNull();
    expect(navStep(['a', 'b'], 'z', 1)).toBe('a');
    expect(navStep([], 'a', 1)).toBeNull();
  });
});
