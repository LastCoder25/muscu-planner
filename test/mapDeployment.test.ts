import { describe, expect, it } from 'vitest';
import {
  balancedTeams,
  deploymentPoints,
  deployRefLevel,
  formTeams,
  placeTeams,
  planDeployment,
  trimMoves,
  type DeployUnit,
} from '../src/lib/mapDeployment';
import { islandSpan, onIsland, LAND_MARGIN } from '../src/lib/islandShape';
import { EXPE } from '../src/lib/expedition';

const u = (
  id: string,
  power: number,
  roles: string[] = [],
  loc = 'base',
  hero = false,
): DeployUnit => ({
  id,
  power,
  roles,
  loc,
  hero,
});
const sum = (t: DeployUnit[]) => t.reduce((s, x) => s + x.power, 0);

describe('balancedTeams — des équipes qui se valent', () => {
  it('équilibre la force', () => {
    const us = [10, 9, 8, 7, 6, 5, 4, 3].map((p, i) => u('c' + i, p));
    const ts = balancedTeams(us, 2);
    expect(ts.length).toBe(2);
    expect(Math.abs(sum(ts[0]!) - sum(ts[1]!))).toBeLessThanOrEqual(2);
  });

  it('répartit les compétences de soutien au lieu de les empiler', () => {
    // À force égale, le second soigneur part dans l'autre équipe.
    const us = [u('a', 10, ['care']), u('c', 10), u('b', 5, ['care']), u('d', 5)];
    const ts = balancedTeams(us, 2);
    for (const t of ts) expect(t.filter((x) => x.roles.includes('care')).length).toBe(1);
  });

  it('chaque unité est placée une fois', () => {
    const us = Array.from({ length: 11 }, (_, i) => u('c' + i, 20 - i));
    const ids = balancedTeams(us, 4)
      .flat()
      .map((x) => x.id)
      .sort();
    expect(ids).toEqual(us.map((x) => x.id).sort());
  });
});

describe('formTeams — le plus d’équipes qui passent le seuil', () => {
  // Une équipe gagne si sa force atteint 15.
  const win = (t: readonly DeployUnit[]) => (sum([...t]) >= 15 ? 1 : 0);
  it('fait autant d’équipes que possible', () => {
    const us = Array.from({ length: 9 }, (_, i) => u('c' + i, 5));
    const r = formTeams(us, 0.9, win);
    expect(r.below).toBe(false);
    expect(r.teams.length).toBe(3);
  });
  it('trop faible : une seule équipe, signalée', () => {
    const r = formTeams([u('a', 3), u('b', 3)], 0.9, win);
    expect(r.below).toBe(true);
    expect(r.teams.length).toBe(1);
  });
});

describe('placeTeams — couvrir l’île au plus vite', () => {
  // Une ligne : la base en 0, le lieu A en 100 ; des points de 0 à 100.
  const POS: Record<string, number> = { base: 0, A: 100 };
  const pts = Array.from({ length: 11 }, (_, i) => i * 10);
  const trip = (s: string, p: number) => Math.abs(POS[s]! - pts[p]!);

  it('deux équipes : une à chaque bout', () => {
    const r = placeTeams(
      [[u('a', 1)], [u('b', 1)]],
      [
        { id: 'base', seats: Infinity, heroOk: true },
        { id: 'A', seats: 5, heroOk: true },
      ],
      pts.length,
      trip,
    );
    expect([...r.spotOf].sort()).toEqual(['A', 'base']);
  });

  it('respecte les places, et le héros en prend deux', () => {
    const r = placeTeams(
      [[u('h', 9, [], 'base', true)], [u('b', 1)]],
      [
        { id: 'base', seats: Infinity, heroOk: true },
        { id: 'A', seats: 1, heroOk: true },
      ],
      pts.length,
      // Tout est près de A : sans la limite de places, le héros y irait.
      (s, p) => (s === 'A' ? p : 100 + p),
    );
    expect(r.spotOf[0]).toBe('base');
    expect(r.spotOf[1]).toBe('A');
  });

  it('un lieu interdit au héros ne reçoit pas son équipe', () => {
    const r = placeTeams(
      [[u('h', 9, [], 'base', true)]],
      [
        { id: 'base', seats: Infinity, heroOk: true },
        { id: 'A', seats: 5, heroOk: false },
      ],
      pts.length,
      (s, p) => (s === 'A' ? 0 : trip(s, p)),
    );
    expect(r.spotOf[0]).toBe('base');
  });

  it('plus d’équipes là où la zone est la plus lourde', () => {
    // A couvre presque tout (points loin de la base).
    const far = Array.from({ length: 10 }, (_, i) => 80 + i * 2);
    const r = placeTeams(
      [[u('a', 1)], [u('b', 1)], [u('c', 1)]],
      [
        { id: 'base', seats: Infinity, heroOk: true },
        { id: 'A', seats: 5, heroOk: true },
      ],
      far.length,
      (s, p) => Math.abs(POS[s]! - far[p]!),
    );
    expect(r.spotOf.filter((s) => s === 'A').length).toBeGreaterThanOrEqual(2);
  });

  it('à charge égale, l’équipe reste là où elle est', () => {
    const r = placeTeams(
      [[u('a', 1, [], 'A')]],
      [
        { id: 'base', seats: Infinity, heroOk: true },
        { id: 'A', seats: 5, heroOk: true },
      ],
      1,
      () => 10,
    );
    expect(r.spotOf[0]).toBe('A');
  });
});

describe('planDeployment — les déplacements', () => {
  it('ne déplace que ceux qui changent d’endroit', () => {
    const POS: Record<string, number> = { base: 0, A: 100 };
    const r = planDeployment(
      [u('a', 10, [], 'A'), u('b', 10, [], 'base')],
      [
        { id: 'base', seats: Infinity, heroOk: true },
        { id: 'A', seats: 5, heroOk: true },
      ],
      11,
      {
        threshold: 0.9,
        deps: {
          win: (t) => (sum([...t]) >= 10 ? 1 : 0),
          trip: (s, p) => Math.abs(POS[s]! - p * 10),
        },
      },
    );
    expect(r.teams.length).toBe(2);
    expect(r.moves).toEqual([]);
    expect(r.teams.reduce((s, t) => s + t.share, 0)).toBeCloseTo(1);
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

describe('trimMoves — le moins de déplacements possible', () => {
  const ok = () => true;
  it('deux lieux qui s’échangeraient deux membres équivalents ne bougent personne', () => {
    // A est à X mais affecté à l'équipe de Y, B est à Y mais affecté à l'équipe de X.
    const a = u('a', 10, [], 'X');
    const b = u('b', 10, [], 'Y');
    const t = trimMoves([[b], [a]], ['X', 'Y'], ok);
    expect(t[0]!.map((x) => x.id)).toEqual(['a']);
    expect(t[1]!.map((x) => x.id)).toEqual(['b']);
  });
  it('n’échange pas si une équipe passerait sous le seuil', () => {
    const a = u('a', 10, [], 'X');
    const b = u('b', 2, [], 'Y');
    const strongEnough = (team: readonly DeployUnit[]) => sum([...team]) >= 5;
    const t = trimMoves([[b, u('c', 9, [], 'X')], [a]], ['X', 'Y'], strongEnough);
    expect(t[1]!.map((x) => x.id)).toEqual(['a']);
  });
  it('ne met pas une compétence de soutien en double et ne touche jamais au héros', () => {
    const a = u('a', 10, ['care'], 'X');
    const b = u('b', 10, [], 'Y');
    const t = trimMoves([[b, u('c', 5, ['care'], 'X')], [a]], ['X', 'Y'], ok);
    expect(t[1]!.map((x) => x.id)).toEqual(['a']);
    const h = u('h', 30, [], 'X', true);
    const t2 = trimMoves([[u('d', 10, [], 'Y')], [h]], ['X', 'Y'], ok);
    expect(t2[1]!.map((x) => x.id)).toEqual(['h']);
  });
});

describe('planDeployment — sans déplacement inutile', () => {
  it('l’équilibrage mélange deux lieux, la répartition finale ne déplace personne', () => {
    // Équilibrées, les équipes sont [a1, b2] et [b1, a2] : chacune a un membre de chaque lieu.
    const us = [u('a1', 10, [], 'X'), u('b1', 9, [], 'Y'), u('a2', 8, [], 'X'), u('b2', 7, [], 'Y')];
    const spots = [
      { id: 'X', seats: 2, heroOk: true },
      { id: 'Y', seats: 2, heroOk: true },
    ];
    const p = planDeployment(us, spots, 4, {
      threshold: 0.5,
      deps: { win: (t) => (t.length >= 2 ? 1 : 0), trip: () => 10 },
    });
    expect(p.teams).toHaveLength(2);
    expect(p.moves).toEqual([]);
  });
});
