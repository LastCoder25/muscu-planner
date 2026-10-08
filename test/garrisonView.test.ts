import { describe, expect, it } from 'vitest';
import { garrisonCells } from '@/lib/garrisonView';

// 🏰 Deux réserves séparées (2026-10-08) : la garnison d'un point = ses places de champion PLUS
// ses places de milice (`garrisonCap`). Camp d'entraînement : 3 + 5 = 8. Mine : 5 + 5 = 10.
const base = {
  hero: null,
  heroSeats: 2,
  garrison: [] as string[],
  reinforcing: [] as { id: string }[],
  away: [] as string[],
  cap: 8,
  champFree: 3,
};
const kinds = (cells: { kind: string }[]) => cells.map((c) => c.kind);

describe('garrisonCells — titulaires et milice séparés', () => {
  it('range champions et miliciens dans leur groupe, renforts compris', () => {
    const g = garrisonCells({
      ...base,
      garrison: ['a1', 'mil:1', 'a2', 'mil:2'],
      reinforcing: [{ id: 'mil:3' }, { id: 'a3' }],
      champFree: 0,
    });
    expect(kinds(g.champ)).toEqual(['adv', 'adv', 'route']);
    expect(kinds(g.mil)).toEqual(['mil', 'mil', 'route', 'free', 'free']);
  });

  it('les places libres de champion vont aux titulaires, celles de milice à la milice', () => {
    // Camp : 3 places de champion, 5 de milice ; 1 champion posté.
    const g = garrisonCells({ ...base, garrison: ['a1'], champFree: 2 });
    expect(kinds(g.champ)).toEqual(['adv', 'free', 'free']);
    expect(kinds(g.mil)).toEqual(['free', 'free', 'free', 'free', 'free']);
  });

  it('des miliciens ne prennent jamais une place de champion', () => {
    // Camp plein de miliciens : les 3 places de champion restent ouvertes.
    const g = garrisonCells({
      ...base,
      garrison: ['mil:1', 'mil:2', 'mil:3', 'mil:4', 'mil:5'],
      champFree: 3,
    });
    expect(kinds(g.champ)).toEqual(['free', 'free', 'free']);
    expect(kinds(g.mil)).toEqual(['mil', 'mil', 'mil', 'mil', 'mil']);
  });

  it('le héros compte pour 2 places de champion', () => {
    // Mine : 5 + 5 ; le héros posté laisse 3 places de champion.
    const g = garrisonCells({ ...base, cap: 10, hero: 'posted', champFree: 3 });
    expect(kinds(g.champ)).toEqual(['hero', 'free', 'free', 'free']);
    expect(kinds(g.mil)).toEqual(['free', 'free', 'free', 'free', 'free']);
  });

  it('champions au complet : il reste les places de milice', () => {
    const g = garrisonCells({
      ...base,
      cap: 10,
      garrison: ['a1', 'a2', 'a3', 'a4', 'a5'],
      champFree: 0,
    });
    expect(kinds(g.champ)).toEqual(['adv', 'adv', 'adv', 'adv', 'adv']);
    expect(kinds(g.mil)).toEqual(['free', 'free', 'free', 'free', 'free']);
  });

  it('sans place de milice (objectif) : aucune case de milice', () => {
    const g = garrisonCells({ ...base, cap: 5, garrison: ['a1', 'a2'], champFree: 3 });
    expect(kinds(g.champ)).toEqual(['adv', 'adv', 'free', 'free', 'free']);
    expect(g.mil).toEqual([]);
  });

  it('sans limite (la forteresse) : une seule place libre, de champion', () => {
    const g = garrisonCells({ ...base, cap: Infinity, garrison: ['a1'], champFree: 99 });
    expect(kinds(g.champ)).toEqual(['adv', 'free']);
    expect(g.mil).toEqual([]);
  });

  it('les sortants restent dans les titulaires', () => {
    const g = garrisonCells({ ...base, away: ['a9'], champFree: 2 });
    expect(kinds(g.champ)).toEqual(['away', 'free', 'free']);
  });
});
