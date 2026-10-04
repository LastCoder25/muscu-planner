import { describe, expect, it } from 'vitest';
import { CROSSING, nextCrossingDeparture, seaTrips } from '@/lib/crossing';
import type { Crossing } from '@/lib/expedition';

const H = 3_600_000;
const cross = (bookedAt: number, departAt: number, to = 2): Crossing => ({
  from: 1,
  to,
  bookedAt,
  departAt,
  arriveAt: departAt + CROSSING.travelMs,
  ids: ['a'],
});

describe('seaTrips', () => {
  it('montre la traversée du héros, puis les navigations', () => {
    const t0 = 10 * H + 600_000;
    const dep = nextCrossingDeparture(t0) + 30 * 60_000; // retenue par des troupes
    const out = seaTrips({ crossing: cross(t0, dep), sailings: [cross(t0, dep, 3)] }, t0);
    expect(out.map((x) => [x.key.slice(0, 3), x.hero, x.waiting])).toEqual([
      ['sea', true, true],
      ['sai', false, true],
    ]);
    expect(out[0]!.delayed).toBe(true);
    // Partie dans la minute de la réservation : pas un retard.
    expect(seaTrips({ crossing: cross(t0, t0 + 5_000) }, t0)[0]!.delayed).toBe(false);
  });

  it('un départ repoussé après la réservation se dit, la mer dure toujours 2 h', () => {
    const t0 = 19 * H + 1_635_000;
    const [t] = seaTrips({ crossing: cross(t0, 22 * H) }, t0);
    expect(t!.delayed).toBe(true);
    expect(t!.crossing.arriveAt - t!.crossing.departAt).toBe(CROSSING.travelMs);
  });

  it('avancement en mer, puis disparition à l’arrivée', () => {
    const c = cross(0, H);
    expect(seaTrips({ crossing: c }, H + CROSSING.travelMs / 2)[0]!.pct).toBeCloseTo(0.5);
    expect(seaTrips({ crossing: c }, c.arriveAt)).toEqual([]);
  });
});
