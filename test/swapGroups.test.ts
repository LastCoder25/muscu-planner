import { describe, expect, it } from 'vitest';
import { groupSwapRows, SWAP_BASE_KEY } from '@/lib/swapGroups';

const row = (fromId: string | null, where: string, pct: number, why: string | null = null) => ({
  fromId,
  where,
  pct,
  why,
});

describe('groupSwapRows — les remplaçants par lieu de départ', () => {
  it('un groupe par lieu, la base en tête même si un point fait mieux', () => {
    const g = groupSwapRows([
      row('mine', '⛏️ Mine', 90),
      row(null, 'base', 40),
      row('tour', '🗼 Tour', 60),
      row('mine', '⛏️ Mine', 70),
    ]);
    expect(g.map((x) => x.key)).toEqual([SWAP_BASE_KEY, 'mine', 'tour']);
    expect(g[1]!.rows.map((r) => r.pct)).toEqual([90, 70]);
    expect(g[1]!.label).toBe('⛏️ Mine');
  });

  it('les points se rangent par leur meilleur remplaçant DISPONIBLE', () => {
    const g = groupSwapRows([
      row('a', 'A', 99, 'plein'), // grisé : ne compte pas
      row('a', 'A', 30),
      row('b', 'B', 60),
    ]);
    expect(g.map((x) => x.key)).toEqual(['b', 'a']);
  });

  it('un groupe sans aucun disponible passe après ceux qui en ont', () => {
    const g = groupSwapRows([row('a', 'A', 99, 'plein'), row('b', 'B', 10)]);
    expect(g.map((x) => x.key)).toEqual(['b', 'a']);
    expect(g.map((x) => x.avail)).toEqual([1, 0]);
  });

  it('dans un groupe : disponibles d’abord, puis par tenue', () => {
    const [g] = groupSwapRows([
      row(null, 'base', 95, 'plein'),
      row(null, 'base', 40),
      row(null, 'base', 80),
    ]);
    expect(g!.rows.map((r) => [r.pct, r.why])).toEqual([
      [80, null],
      [40, null],
      [95, 'plein'],
    ]);
    expect(g!.avail).toBe(2);
  });

  it('rien ne se perd ni ne se duplique', () => {
    const rows = [row(null, 'b', 1), row('x', 'X', 2), row('x', 'X', 3), row('y', 'Y', 4, 'non')];
    const g = groupSwapRows(rows);
    expect(g.flatMap((x) => x.rows).length).toBe(rows.length);
  });
});
