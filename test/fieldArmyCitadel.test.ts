// 🏯 Les armées de reprise partent de LEUR citadelle (2026-09-30, demandé) : elles marchent en
// ligne droite de la citadelle au point, et ne se voient que sur la part de ce trajet qui est
// dans le rayon de détection.
import { describe, expect, it } from 'vitest';
import { entryPoint, retakeArmyPoi, syncFieldArmies } from '@/lib/fieldArmy';
import {
  captureControl,
  citadelIdOf,
  citadelIndexOf,
  controlIdOf,
  ensureControls,
} from '@/lib/controlPoints';
import { EXPE, createMap, warbandAt, type Poi } from '@/lib/expedition';

const H = 3_600_000;
const T = EXPE.town;
const at = 100 * H;
const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y);
const point = (x: number, y: number): Poi => ({
  id: 'ctl_mine',
  type: 'control',
  level: 30,
  x,
  y,
  distNorm: 0.3,
  spawnedAt: 0,
  expiresAt: 9e15,
  control: {
    kind: 'mine',
    owner: 'player',
    faction: 'bandits',
    size: 2,
    garrison: [],
    retakes: 1,
    attackAt: at,
  },
});
/** Le point de l'axe (x) et la position de l'armée sur son segment. */
const onSegment = (a: { x: number; y: number }, b: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.abs(dist(a, q) + dist(q, b) - dist(a, b)) < 1e-6;

describe('🏯 entryPoint', () => {
  it('rend l’entrée du trajet dans le cercle', () => {
    const e = entryPoint({ x: T.x + 60, y: T.y }, { x: T.x + 10, y: T.y }, 40)!;
    expect(e.x).toBeCloseTo(T.x + 40, 9);
    expect(e.y).toBeCloseTo(T.y, 9);
  });
  it('le départ lui-même s’il est déjà dedans', () => {
    expect(entryPoint({ x: T.x + 20, y: T.y }, { x: T.x + 10, y: T.y }, 40)).toEqual({
      x: T.x + 20,
      y: T.y,
    });
  });
  it('null si le trajet ne traverse pas le cercle', () => {
    expect(entryPoint({ x: T.x + 60, y: T.y + 60 }, { x: T.x + 60, y: T.y + 50 }, 20)).toBeNull();
  });
});

describe('🏯 l’armée part de sa citadelle', () => {
  const p = point(T.x + 30, T.y);
  const cit = { x: T.x + 20, y: T.y - 60 };
  const R = 50;
  it('elle entre dans le rayon sur la droite citadelle → point, et finit sur le point', () => {
    const a = retakeArmyPoi(p, 42, R, 200, at - 0.1 * H, 30, cit)!;
    expect(dist(a.from!, T)).toBeCloseTo(R, 6);
    expect(onSegment(cit, p, a.from!)).toBe(true);
    expect(dist(warbandAt(a, at), p)).toBeLessThan(0.01);
  });
  it('son préavis vaut le trajet visible, jamais moins que dans l’axe ville → point', () => {
    const from = entryPoint(cit, p, R)!;
    const lead = (dist(from, p) / 10) * H;
    expect(retakeArmyPoi(p, 42, R, 200, at - lead - H / 100, 30, cit)).toBeNull();
    expect(retakeArmyPoi(p, 42, R, 200, at - lead + H / 100, 30, cit)).not.toBeNull();
    expect(dist(from, p)).toBeGreaterThanOrEqual(R - 30 - 1e-9);
  });
  it('avec une grande détection, on la voit sortir de la citadelle', () => {
    const a = retakeArmyPoi(p, 42, 90, 200, at - 0.1 * H, 30, cit)!;
    expect(dist(a.from!, cit)).toBeLessThan(1e-9);
  });
  it('hors du rayon, toujours invisible', () => {
    expect(retakeArmyPoi(p, 42, 25, 200, at - 0.1 * H, 30, cit)).toBeNull();
  });
});

describe('🏯 sur la carte, chaque reprise part de la citadelle de son quart', () => {
  it('la trajectoire passe par la citadelle qui attaque le point', () => {
    const m0 = ensureControls(createMap(5, 0, 30, 1), 0, 30);
    const m1 = captureControl(m0, controlIdOf('mine'), ['a0'], 0, 7);
    const mine = m1.pois.find((q) => q.id === controlIdOf('mine'))!;
    const cit = m1.pois.find((q) => q.id === citadelIdOf(citadelIndexOf('mine')))!;
    const now = mine.control!.attackAt! - 0.05 * H;
    const m2 = syncFieldArmies(m1, { raid: null, detectR: 200, reach: 200, now, playerLevel: 30 });
    const army = m2.pois.find((q) => q.army?.targetId === controlIdOf('mine'))!;
    expect(army).toBeTruthy();
    expect(dist(army.from!, cit)).toBeLessThan(1e-6);
  });
});
