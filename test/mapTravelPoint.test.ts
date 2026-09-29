import { describe, it, expect } from 'vitest';
import { EXPE, MAP_RIM, mapTravelPoint, travelPosition } from '@/lib/expedition';

const town = EXPE.town;
// La tour de guet réelle du signalement : ~32 unités de la ville, 1 h de trajet.
const poi = { x: 87, y: 71 } as never;
const dist = (a: { x: number; y: number }) => Math.hypot(a.x - town.x, a.y - town.y);
const trip = { poi, sentAt: 0, midAt: 3_600_000, returnAt: 3_600_000 };

describe('mapTravelPoint — le voyageur se dessine hors de la ville', () => {
  it('au départ il est au BORD de la ville, pas en son centre (caché dessous)', () => {
    const at = travelPosition(trip, 0);
    expect(dist(mapTravelPoint(at, poi))).toBeCloseTo(MAP_RIM.town, 5);
  });
  it('à mi-chemin il est à mi-distance entre les deux bords', () => {
    const at = travelPosition(trip, 1_800_000);
    const D = dist(poi);
    expect(dist(mapTravelPoint(at, poi))).toBeCloseTo(
      MAP_RIM.town + 0.5 * (D - MAP_RIM.town - MAP_RIM.poi),
      5,
    );
  });
  it('à 46 % du trajet il est sorti de la ville (le cas signalé)', () => {
    const at = travelPosition(trip, 0.46 * 3_600_000);
    expect(dist(mapTravelPoint(at, poi))).toBeGreaterThan(MAP_RIM.town + 5);
  });
  it('à l’arrivée il touche le lieu sans le recouvrir, sur la même droite', () => {
    const p = mapTravelPoint(travelPosition(trip, 3_599_999), poi);
    expect(dist(p)).toBeCloseTo(dist(poi) - MAP_RIM.poi, 2);
    const cross = (p.x - town.x) * (71 - town.y) - (p.y - town.y) * (87 - town.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });
  it('au retour, l’avancement décroît vers la ville', () => {
    const rt = { poi, sentAt: 0, midAt: 1000, returnAt: 2000 };
    const a = dist(mapTravelPoint(travelPosition(rt, 1200), poi));
    const b = dist(mapTravelPoint(travelPosition(rt, 1800), poi));
    expect(b).toBeLessThan(a);
  });
  it('un lieu collé à la ville garde la position brute', () => {
    const near = { x: 105, y: 100 } as never;
    const at = { x: 102, y: 100 };
    expect(mapTravelPoint(at, near)).toEqual(at);
  });
});
