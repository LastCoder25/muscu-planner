import { describe, expect, it } from 'vitest';
import { nextHomecoming, type NavTrip } from '@/lib/tripNav';

const trip = (key: string, extra: Partial<NavTrip> = {}): NavTrip => ({
  key,
  back: false,
  time: '',
  pct: 0,
  ...extra,
});
const NOW = 1000;

describe('🏠 nextHomecoming : le prochain voyage à rentrer en ville', () => {
  it('le retour le plus proche gagne, quel que soit l’ordre reçu', () => {
    const r = nextHomecoming(
      [trip('a', { homeAt: 5000, endsAt: 1500 }), trip('b', { homeAt: 3000, endsAt: 2500 })],
      NOW,
    );
    expect(r?.trip.key).toBe('b');
    expect(r?.at).toBe(3000);
  });
  it('un retour vers la base sans heure de retour se lit à son arrivée', () => {
    const r = nextHomecoming(
      [trip('a', { homeAt: 5000 }), trip('walk', { toBase: true, back: true, endsAt: 2000 })],
      NOW,
    );
    expect(r?.trip.key).toBe('walk');
    expect(r?.at).toBe(2000);
  });
  it('un aller simple (renfort, traversée) ne rentre pas', () => {
    expect(nextHomecoming([trip('reinf', { endsAt: 1200 })], NOW)).toBeNull();
  });
  it('un voyage programmé, pas encore parti, ne compte pas', () => {
    const r = nextHomecoming(
      [trip('p', { pending: true, homeAt: 1500 }), trip('a', { homeAt: 4000 })],
      NOW,
    );
    expect(r?.trip.key).toBe('a');
  });
  it('un retour déjà passé ne compte plus', () => {
    expect(nextHomecoming([trip('a', { homeAt: 900 })], NOW)).toBeNull();
  });
});
