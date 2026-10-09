import { describe, expect, it } from 'vitest';
import { legTileShown, tripCatOf, tripFilterCtx, tripLegOrder, type NavTrip } from '@/lib/tripNav';
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
/** Les voyages que la rangée montre, dans son ordre, chacun une fois. */
const shown = (trips: NavTrip[], sel: TripSelection, legs = ALL_LEGS) => {
  const ctx = tripFilterCtx(trips, 0, sel, legs);
  const out: string[] = [];
  for (const x of tripLegOrder(trips))
    if (legTileShown(x.trip, x.leg.leg, ctx) && !out.includes(x.trip.key)) out.push(x.trip.key);
  return out;
};

describe('🧭 tripNav : la rangée des voyages, sa règle de filtre et son ordre', () => {
  it('sans filtre : tous, rangés à l’heure de leur étape', () => {
    expect(shown(TRIPS, ALL_TRIPS)).toEqual(['p', 'a', 'b', 'c']);
  });
  it('avec un filtre : seulement ce qu’il laisse voir', () => {
    expect(shown(TRIPS, { mode: 'only', cats: ['reinf'] })).toEqual(['c']);
  });
  it('un voyage programmé ne compte que dans « Programmés »', () => {
    expect(tripCatOf(TRIPS[2]!)).toBe('planned');
    expect(shown(TRIPS, { mode: 'except', cats: ['planned'] })).toEqual(['a', 'b', 'c']);
  });
  // Un voyage en route : arrivée à 10, fouille jusqu'à 300, retour à 500.
  const phased = (): NavTrip =>
    trip('x', 10, {
      cat: 'trips',
      homeAt: 500,
      legs: {
        go: '→',
        back: '↩',
        detail: '',
        phases: [
          { leg: 'go', time: '', endsAt: 10, current: true, pct: 0 },
          { leg: 'dwell', time: '', endsAt: 300, current: false, pct: 0 },
          { leg: 'back', time: '', endsAt: 500, current: false, pct: 0 },
        ],
      },
    });
  it('chaque tuile d’étape se range à la fin de SON étape', () => {
    const order = tripLegOrder([phased(), trip('y', 20, { cat: 'trips' })]).map(
      (t) => `${t.trip.key}:${t.leg.leg}`,
    );
    expect(order).toEqual(['x:go', 'y:go', 'x:dwell', 'x:back']);
  });
  it('le filtre d’étape s’applique : « Retour » seul garde ceux dont le retour est à venir', () => {
    const two = phased();
    expect(shown([two, trip('y', 20, { cat: 'trips' })], ALL_TRIPS, new Set(['back']))).toEqual([
      'x',
    ]);
  });
});
