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

describe('↩️ nextHomecoming : le prochain voyage à revenir à son point de départ', () => {
  it('le retour le plus proche gagne, quel que soit l’ordre reçu', () => {
    const r = nextHomecoming(
      [trip('a', { homeAt: 5000, endsAt: 1500 }), trip('b', { homeAt: 3000, endsAt: 2500 })],
      NOW,
    );
    expect(r?.trip.key).toBe('b');
    expect(r?.at).toBe(3000);
  });
  // Override de la v1.246.0 (demandé : « pas la prochaine qui rentre à la base, celle qui
  // rentre à son lieu de départ ») : quitter un poste pour la base n'est pas un retour.
  it('un aller simple vers la base (poste quitté, héros à pied) ne compte pas', () => {
    const r = nextHomecoming(
      [trip('a', { homeAt: 5000 }), trip('walk', { toBase: true, back: true, endsAt: 2000 })],
      NOW,
    );
    expect(r?.trip.key).toBe('a');
    expect(r?.at).toBe(5000);
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
