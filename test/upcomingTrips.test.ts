import { describe, expect, it } from 'vitest';
import { upcomingTrips, type NavTrip } from '@/lib/tripNav';
import { formatEta } from '@/lib/duration';

const trip = (key: string, extra: Partial<NavTrip> = {}): NavTrip => ({
  key,
  back: false,
  time: '',
  pct: 0,
  ...extra,
});
const NOW = 1000;
const keys = (l: { trip: NavTrip }[]) => l.map((r) => r.trip.key);

describe('↩️ upcomingTrips : les prochains retours', () => {
  it('les allers-retours, du plus proche au plus lointain, à leur heure de RETOUR', () => {
    const r = upcomingTrips(
      [trip('a', { homeAt: 5000, endsAt: 1500 }), trip('b', { homeAt: 3000, endsAt: 2500 })],
      NOW,
    );
    expect(keys(r.back)).toEqual(['b', 'a']);
    expect(r.back[0]!.at).toBe(3000);
  });
  it('trois au plus', () => {
    const many = [5, 2, 9, 4, 7].map((h) => trip('t' + h, { homeAt: h * 1000 }));
    expect(keys(upcomingTrips(many, NOW).back)).toEqual(['t2', 't4', 't5']);
  });
  // v1.246.0 (demandé : « celle qui rentre à son lieu de départ ») : quitter un poste pour la
  // base n'est pas un retour… c’est une ARRIVÉE chez nous (v1.257.0).
  it('un aller simple vers la base n’est pas un retour, c’est une arrivée', () => {
    const r = upcomingTrips(
      [trip('a', { homeAt: 5000 }), trip('walk', { toBase: true, back: true, endsAt: 2000 })],
      NOW,
    );
    expect(keys(r.back)).toEqual(['a']);
    expect(keys(r.arrive)).toEqual(['walk']);
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
    expect(keys(r.back)).toEqual(['a']);
    expect(r.arrive).toEqual([]);
  });
});

describe('📍 upcomingTrips : les prochaines arrivées sur un lieu allié', () => {
  it('renforts, garnisons et retours à la base, à leur ARRIVÉE, trois au plus', () => {
    const r = upcomingTrips(
      [
        trip('r1', { cat: 'reinf', endsAt: 6000 }),
        trip('base', { cat: 'reinf', toBase: true, endsAt: 2000 }),
        trip('r2', { cat: 'reinf', endsAt: 3000 }),
        trip('r3', { cat: 'reinf', endsAt: 9000 }),
      ],
      NOW,
    );
    expect(keys(r.arrive)).toEqual(['base', 'r2', 'r1']);
    expect(r.arrive[0]!.at).toBe(2000);
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
    expect(r.arrive).toEqual([]);
    expect(r.back).toEqual([]);
  });
  it('un aller-retour reste un retour, même renfort', () => {
    const r = upcomingTrips([trip('x', { cat: 'reinf', homeAt: 4000, endsAt: 2000 })], NOW);
    expect(keys(r.back)).toEqual(['x']);
    expect(r.arrive).toEqual([]);
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
