import { describe, expect, it } from 'vitest';
import {
  deploymentPoints,
  deployRefLevel,
  MOVE_COST,
  planStations,
  reachTime,
  type DeploySpot,
  type DeployUnit,
} from '../src/lib/mapDeployment';
import { islandSpan, onIsland, LAND_MARGIN } from '../src/lib/islandShape';
import { EXPE } from '../src/lib/expedition';

// 🗺️ Une île en LIGNE : les points d'échantillon sont aux abscisses 0..10, chaque endroit a
// une abscisse, et un trajet vaut 10 min par unité de distance (l’ordre de grandeur du jeu).
const PTS = Array.from({ length: 11 }, (_, i) => i);
const u = (id: string, power: number, loc = 'base', hero = false): DeployUnit => ({
  id,
  power,
  loc,
  hero,
});
const spot = (id: string, seats = Infinity, more: Partial<DeploySpot> = {}): DeploySpot => ({
  id,
  seats,
  heroOk: true,
  ...more,
});
const line = (xs: Record<string, number>) => ({
  trip: (s: string, p: number) => 10 * Math.abs(xs[s]! - PTS[p]!),
});
const plan = (
  units: DeployUnit[],
  spots: DeploySpot[],
  xs: Record<string, number>,
  force: number,
) => planStations(units, spots, PTS.length, { force, deps: line(xs) });

describe('reachTime — le temps pour réunir la force sur un point', () => {
  const trips = new Map([
    ['A', [0, 4]],
    ['B', [3, 1]],
  ]);
  const order = [
    ['A', 'B'],
    ['B', 'A'],
  ];
  it('les endroits les plus proches d’abord, jusqu’à la force voulue', () => {
    // Point 0 : A (5) suffit à 0 min ; point 1 : B (2) ne suffit pas, A le complète à 4 min.
    expect(
      reachTime(
        new Map([
          ['A', 5],
          ['B', 2],
        ]),
        order,
        trips,
        5,
      ),
    ).toBe((0 + 4) / 2);
  });
  it('un endroit vide ne compte pas', () => {
    expect(reachTime(new Map([['A', 5]]), order, trips, 5)).toBe((0 + 4) / 2);
  });
  it('si tout le monde ne suffit pas, le temps est majoré d’autant', () => {
    // Il manque la moitié partout : point 0, 3 min × 14/7 ; point 1, 4 min × 14/7.
    expect(
      reachTime(
        new Map([
          ['A', 5],
          ['B', 2],
        ]),
        order,
        trips,
        14,
      ),
    ).toBe((6 + 8) / 2);
  });
});

describe('planStations — les plus forts aux meilleurs endroits', () => {
  it('le plus fort va là d’où il rejoint le plus vite l’île', () => {
    const r = plan(
      [u('fort', 10, 'bord'), u('faible', 1, 'bord')],
      [spot('bord'), spot('centre', 1)],
      { bord: 0, centre: 5 },
      10,
    );
    expect(r.spotOf.get('fort')).toBe('centre');
    expect(r.spotOf.get('faible')).toBe('bord');
  });

  it('un lieu central plein échange son faible contre un fort', () => {
    const r = plan(
      [u('fort', 10, 'bord'), u('faible', 1, 'centre')],
      [spot('bord'), spot('centre', 1)],
      { bord: 0, centre: 5 },
      10,
    );
    expect(r.spotOf.get('fort')).toBe('centre');
    expect(r.spotOf.get('faible')).toBe('bord');
  });

  it('deux bons endroits : les forces se répartissent pour couvrir toute l’île', () => {
    const r = plan(
      [u('a', 10), u('b', 10)],
      [spot('base'), spot('ouest', 1), spot('est', 1)],
      { base: 5, ouest: 2, est: 8 },
      10,
    );
    expect(new Set([r.spotOf.get('a'), r.spotOf.get('b')])).toEqual(new Set(['ouest', 'est']));
  });

  it('les places sont respectées, le héros en prend 2 et ne va que là où il peut', () => {
    const r = plan(
      [u('h', 20, 'base', true), u('a', 5)],
      [spot('base'), spot('poste', 1), spot('fort', 2, { heroOk: false })],
      { base: 0, poste: 5, fort: 5 },
      20,
    );
    expect(r.spotOf.get('h')).toBe('base');
    const used = new Map<string, number>();
    for (const x of [u('h', 20, 'base', true), u('a', 5)])
      used.set(r.spotOf.get(x.id)!, (used.get(r.spotOf.get(x.id)!) ?? 0) + (x.hero ? 2 : 1));
    expect(used.get('poste') ?? 0).toBeLessThanOrEqual(1);
    expect(used.get('fort') ?? 0).toBeLessThanOrEqual(2);
  });
});

describe('planStations — la défense en secondaire', () => {
  it('un lieu tenu qui se défend reçoit au moins un membre, le moins fort', () => {
    const r = plan(
      [u('fort', 10), u('moyen', 5), u('faible', 1)],
      [spot('base'), spot('mine', 3, { guard: true })],
      { base: 5, mine: 0 },
      10,
    );
    expect([...r.spotOf.values()].filter((s) => s === 'mine').length).toBeGreaterThanOrEqual(1);
    expect(r.spotOf.get('faible')).toBe('mine');
  });

  it('jamais un lieu gardé vidé pour en remplir un autre', () => {
    const r = plan(
      [u('seul', 10, 'mine')],
      [spot('base'), spot('mine', 3, { guard: true }), spot('jardin', 1, { guard: true })],
      { base: 5, mine: 0, jardin: 10 },
      10,
    );
    expect(r.spotOf.get('seul')).toBe('mine');
  });
});

describe('planStations — le moins de déplacements', () => {
  it('rien ne bouge quand le gain ne vaut pas le trajet', () => {
    // Deux endroits presque équivalents : gagner moins de MOVE_COST ne justifie pas un départ.
    const r = plan([u('a', 10, 'x')], [spot('x'), spot('y')], { x: 5 + MOVE_COST / 40, y: 5 }, 10);
    expect(r.moves).toEqual([]);
    expect(r.spotOf.get('a')).toBe('x');
  });

  it('les déplacements disent d’où et vers où', () => {
    const r = plan(
      [u('fort', 10, 'bord')],
      [spot('bord'), spot('centre')],
      { bord: 0, centre: 5 },
      10,
    );
    expect(r.moves.map((m) => [m.unit.id, m.from, m.to])).toEqual([['fort', 'bord', 'centre']]);
  });
});

describe('deploymentPoints — la terre de l’île', () => {
  it('tous les points sont sur la terre ferme, hors de la ville', () => {
    const pts = deploymentPoints(1, 1);
    expect(pts.length).toBeGreaterThan(50);
    for (const p of pts) {
      expect(onIsland(1, p.x, p.y, LAND_MARGIN)).toBe(true);
      const d = Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);
      expect(d).toBeGreaterThanOrEqual(EXPE.distMin);
      expect(d).toBeLessThanOrEqual(islandSpan(1));
    }
  });
});

describe('deployRefLevel — le niveau des lieux de référence', () => {
  it('le haut du rang du joueur, borné par l’île', () => {
    expect(deployRefLevel(33, 21, 40)).toBe(40); // Or noir : jusqu'au niveau 40
    expect(deployRefLevel(33, 21, 35)).toBe(35); // plafond de l'île
    expect(deployRefLevel(3, 21, 40)).toBe(21); // plancher de l'île
    expect(deployRefLevel(41, 1, Infinity)).toBe(50);
  });
});
