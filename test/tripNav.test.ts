import { describe, expect, it } from 'vitest';
import { legTileShown, tripCatOf, tripFilterCtx, tripOrder, type NavTrip } from '@/lib/tripNav';
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
  for (const x of tripOrder(trips, 'home'))
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
  it('une tuile par voyage, celle de son étape EN COURS, rangée par son retour en ville', () => {
    // x finit son étape en cours AVANT y (10 contre 20) mais rentre APRÈS lui (500 contre 400).
    const order = tripOrder([phased(), trip('y', 20, { cat: 'trips', homeAt: 400 })], 'home').map(
      (t) => `${t.trip.key}:${t.leg.leg}`,
    );
    expect(order).toEqual(['y:go', 'x:go']);
  });
  it('le filtre d’étape lit l’étape EN COURS : « Retour » seul écarte un voyage encore à l’aller', () => {
    const two = phased();
    expect(
      shown([two, trip('y', 20, { cat: 'trips', back: true })], ALL_TRIPS, new Set(['back'])),
    ).toEqual(['y']);
  });
});

describe('⏱️ ordre des tuiles : le temps total avant le retour (demandé le 2026-10-09)', () => {
  it('un voyage qui rentre plus tôt passe devant, même si son étape en cours finit plus tard', () => {
    const order = tripOrder(
      [trip('long', 10, { homeAt: 900 }), trip('court', 50, { homeAt: 200 })],
      'home',
    ).map((t) => t.trip.key);
    expect(order).toEqual(['court', 'long']);
  });
  it('sans retour connu (renfort qui va se poster), il se range à son arrivée', () => {
    const order = tripOrder([trip('home', 10, { homeAt: 400 }), trip('poste', 300)], 'home').map(
      (t) => t.trip.key,
    );
    expect(order).toEqual(['poste', 'home']);
  });
});

describe('⏭️ ordre des tuiles : le temps avant la prochaine étape (2026-10-10, au choix)', () => {
  it('l’étape en cours qui finit le plus tôt passe devant, même si son voyage rentre plus tard', () => {
    const order = tripOrder(
      [trip('long', 10, { homeAt: 900 }), trip('court', 50, { homeAt: 200 })],
      'step',
    ).map((t) => t.trip.key);
    expect(order).toEqual(['long', 'court']);
  });
  it('chaque ordre range sur sa propre heure : le retour ou la fin de l’étape', () => {
    const trips = [trip('a', 10, { homeAt: 900 }), trip('b', 50, { homeAt: 200 })];
    expect(tripOrder(trips, 'home').map((t) => t.at)).toEqual([200, 900]);
    expect(tripOrder(trips, 'step').map((t) => t.at)).toEqual([10, 50]);
  });
});
describe('⏭️ un voyage à plusieurs étapes, rangé à la fin de son étape EN COURS', () => {
  it('x arrive à 10 (avant y à 20) mais rentre après lui : « étape » le met devant', () => {
    const x = trip('x', 10, {
      cat: 'trips',
      homeAt: 500,
    });
    const order = tripOrder([trip('y', 20, { homeAt: 400 }), x], 'step').map((t) => t.trip.key);
    expect(order).toEqual(['x', 'y']);
  });
});
