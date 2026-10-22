import { describe, expect, it } from 'vitest';
import { upcomingTrips, type NavTrip, type TripEta } from '@/lib/tripNav';
import { formatEta } from '@/lib/duration';

const trip = (key: string, extra: Partial<NavTrip> = {}): NavTrip => ({
  key,
  back: false,
  time: '',
  pct: 0,
  ...extra,
});
const NOW = 1000;
const keys = (l: TripEta<NavTrip>[]) => l.map((r) => r.trip.key);
const backs = (l: TripEta<NavTrip>[]) => keys(l.filter((r) => !r.arrive));
const arrivals = (l: TripEta<NavTrip>[]) => keys(l.filter((r) => r.arrive));

describe('↩️ upcomingTrips : les prochains retours', () => {
  it('les allers-retours, du plus proche au plus lointain, à leur heure de RETOUR', () => {
    const r = upcomingTrips(
      [trip('a', { homeAt: 5000, endsAt: 1500 }), trip('b', { homeAt: 3000, endsAt: 2500 })],
      NOW,
    );
    expect(keys(r)).toEqual(['b', 'a']);
    expect(r[0]!.at).toBe(3000);
    expect(r[0]!.arrive).toBe(false);
  });
  it('trois au plus', () => {
    const many = [5, 2, 9, 4, 7].map((h) => trip('t' + h, { homeAt: h * 1000 }));
    expect(keys(upcomingTrips(many, NOW))).toEqual(['t2', 't4', 't5']);
  });
  // v1.246.0 (demandé : « celle qui rentre à son lieu de départ ») : quitter un poste pour la
  // base n'est pas un retour… c’est une ARRIVÉE chez nous (v1.257.0).
  it('un aller simple vers la base n’est pas un retour, c’est une arrivée', () => {
    const r = upcomingTrips(
      [trip('a', { homeAt: 5000 }), trip('walk', { toBase: true, back: true, endsAt: 2000 })],
      NOW,
    );
    expect(backs(r)).toEqual(['a']);
    expect(arrivals(r)).toEqual(['walk']);
  });
  it('un voyage programmé, pas encore parti, ne compte pas ; une heure passée non plus', () => {
    const r = upcomingTrips(
      [
        trip('p', { pending: true, homeAt: 1500 }),
        trip('old', { homeAt: 900 }),
        trip('a', { homeAt: 4000 }),
        trip('pr', { pending: true, cat: 'reinf', endsAt: 1500 }),
        trip('gone', { cat: 'reinf', endsAt: 900 }),
      ],
      NOW,
    );
    expect(keys(r)).toEqual(['a']);
  });
});

describe('📍 upcomingTrips : les prochaines arrivées sur un lieu allié', () => {
  it('renforts, garnisons et retours à la base, à leur ARRIVÉE', () => {
    const r = upcomingTrips(
      [
        trip('r1', { cat: 'reinf', endsAt: 6000 }),
        trip('base', { cat: 'reinf', toBase: true, endsAt: 2000 }),
        trip('r2', { cat: 'reinf', endsAt: 3000 }),
        trip('r3', { cat: 'reinf', endsAt: 9000 }),
      ],
      NOW,
    );
    expect(arrivals(r)).toEqual(['base', 'r2', 'r1']);
    expect(r[0]!.at).toBe(2000);
  });
  it('ni une traversée en mer, ni un aller vers un lieu ennemi', () => {
    const r = upcomingTrips(
      [
        trip('sea', { cat: 'trips', sea: { from: 1, to: 2 }, endsAt: 2000 }),
        trip('seaReinf', { cat: 'reinf', sea: { from: 1, to: 2 }, endsAt: 2000 }),
        trip('raid', { cat: 'raids', endsAt: 2000 }),
      ],
      NOW,
    );
    expect(r).toEqual([]);
  });
  it('un aller-retour reste un retour, même renfort', () => {
    const r = upcomingTrips([trip('x', { cat: 'reinf', homeAt: 4000, endsAt: 2000 })], NOW);
    expect(backs(r)).toEqual(['x']);
    expect(arrivals(r)).toEqual([]);
  });
});

// v1.269.0 (choisi : « une liste de 3 ») : plus 3 retours + 3 arrivées, mais les 3 plus
// proches en tout.
describe('📋 upcomingTrips : une seule liste de trois', () => {
  it('retours et arrivées mêlés par heure, trois en tout', () => {
    const r = upcomingTrips(
      [
        trip('b1', { homeAt: 2000 }),
        trip('a1', { cat: 'reinf', endsAt: 1500 }),
        trip('b2', { homeAt: 4000 }),
        trip('a2', { cat: 'reinf', endsAt: 3000 }),
        trip('b3', { homeAt: 5000 }),
      ],
      NOW,
    );
    expect(keys(r)).toEqual(['a1', 'b1', 'a2']);
    expect(r.map((x) => x.arrive)).toEqual([true, false, true]);
  });
});

// v1.268.0 (demandé : « hors garnison de miliciens ») : la milice ne fait que tenir des lieux,
// son va-et-vient noyait les retours des expéditions.
describe('🛡️ upcomingTrips : sans les troupes de miliciens seuls', () => {
  const MIL = ['mil:1', 'mil:2'];
  it('ni une garnison de miliciens qui arrive, ni des miliciens qui rentrent', () => {
    const r = upcomingTrips(
      [
        trip('milReinf', { cat: 'reinf', members: MIL, endsAt: 1500 }),
        trip('milHome', { cat: 'reinf', toBase: true, members: MIL, endsAt: 1600 }),
        trip('milBack', { members: MIL, homeAt: 1700 }),
        trip('champ', { cat: 'reinf', members: ['adv1'], endsAt: 5000 }),
      ],
      NOW,
    );
    expect(keys(r)).toEqual(['champ']);
  });
  it('une troupe mixte ou avec le héros compte', () => {
    const r = upcomingTrips(
      [
        trip('mixed', { cat: 'reinf', members: ['adv1', 'mil:1'], endsAt: 2000 }),
        trip('hero', { members: ['mil:1'], withHero: true, homeAt: 3000 }),
        trip('empty', { cat: 'reinf', toBase: true, members: [], endsAt: 2500 }),
      ],
      NOW,
    );
    expect(arrivals(r)).toEqual(['mixed', 'empty']);
    expect(backs(r)).toEqual(['hero']);
  });
});

describe('⏱️ formatEta : un compte à rebours serré', () => {
  it('sans espaces, mêmes coupures que le compte à rebours', () => {
    const S = 1000;
    const M = 60 * S;
    const H = 60 * M;
    expect(formatEta(42 * S)).toBe('42s');
    expect(formatEta(12 * M)).toBe('12m');
    expect(formatEta(3 * H + 5 * M)).toBe('3h05');
    expect(formatEta(26 * H + 30 * M)).toBe('1j2h');
    expect(formatEta(48 * H)).toBe('2j');
  });
});
