import { describe, it, expect } from 'vitest';
import { oneWayLegs } from '@/lib/oneWayTrip';
import { arrivalSeats, militiaSeatsOf, seatsOf, type ControlState } from '@/lib/controlPoints';
import { tripLegTiles, tripTimeline } from '@/lib/tripLegTiles';

const H = 3_600_000;
// Une mine tenue : les places viennent du jeu, jamais d'un nombre écrit ici.
const mine = (o: Partial<ControlState> = {}): ControlState =>
  ({ kind: 'mine', owner: 'player', garrison: [], reinforcing: [], ...o }) as ControlState;

describe('🛡️ un trajet aller simple a ses étapes (frise)', () => {
  it('en route : une étape, avancement et temps restant, avec son icône', () => {
    const l = oneWayLegs(0, 2 * H, H, 'go', '🛡️')!;
    expect(l.steps).toHaveLength(1);
    expect(l.steps[0]).toMatchObject({ leg: 'go', current: true, pct: 50, icon: '🛡️' });
    expect(tripTimeline(l.steps)!.segs[0]!.label.startsWith('🛡️ ')).toBe(true);
  });
  it('pas encore parti : l’attente passe devant le trajet', () => {
    const l = oneWayLegs(2 * H, 3 * H, H, 'go')!;
    expect(l.steps.map((s) => s.leg)).toEqual(['wait', 'go']);
    expect(l.steps[0]!.current).toBe(true);
    expect(l.steps[1]!.current).toBe(false);
  });
  it('arrivé : plus d’étapes (la tuile disparaît avec le voyage)', () => {
    expect(oneWayLegs(0, H, H, 'go')).toBeNull();
  });
  it('un retour vers la base prend la frise lui aussi', () => {
    const legs = oneWayLegs(0, 2 * H, H, 'back', '🏠')!;
    const tiles = tripLegTiles({
      key: 'h1',
      time: '',
      pct: 50,
      back: true,
      toBase: true,
      legs,
    } as Parameters<typeof tripLegTiles>[0]);
    expect(tiles[0]).toMatchObject({ phased: true, back: true, icon: '🏠' });
  });
});

describe('🏰 les places du lieu à l’arrivée d’un renfort', () => {
  const champs = seatsOf('mine');
  it('tenues, les siennes, celles d’autres renforts, le reste libre', () => {
    const c = mine({
      garrison: ['a'],
      reinforcing: [
        { id: 'b', at: 9 },
        { id: 'c', at: 5 },
      ] as ControlState['reinforcing'],
    });
    const s = arrivalSeats(c, ['b'])!;
    expect(s.champ).toEqual({ total: champs, held: 1, mine: 1, other: 1, over: 0 });
    expect(s.mil).toBeUndefined();
  });
  it('le héros compte pour deux places, posté comme en route', () => {
    const posted = arrivalSeats(mine({ hero: true } as Partial<ControlState>), ['x'])!;
    expect(posted.champ!.held).toBe(2);
    const coming = arrivalSeats(mine(), [], true)!;
    expect(coming.champ!.mine).toBe(2);
  });
  it('des miliciens en trop pour leurs places : comptés « demi-tour »', () => {
    const room = militiaSeatsOf('mine');
    const ids = Array.from({ length: room + 2 }, (_, i) => `mil:${i}`);
    const s = arrivalSeats(mine(), ids)!;
    expect(s.mil).toMatchObject({ total: room, mine: room, over: 2 });
    expect(s.champ).toBeUndefined();
  });
  it('rien à montrer pour un lieu qui n’est pas à nous', () => {
    expect(arrivalSeats(mine({ owner: 'enemy' } as Partial<ControlState>), ['a'])).toBeNull();
  });
});
