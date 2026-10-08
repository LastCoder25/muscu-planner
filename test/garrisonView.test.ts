import { describe, expect, it } from 'vitest';
import { garrisonCells } from '@/lib/garrisonView';

const base = {
  hero: null,
  heroSeats: 2,
  garrison: [] as string[],
  reinforcing: [] as { id: string }[],
  away: [] as string[],
  cap: 5,
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
    expect(kinds(g.mil)).toEqual(['mil', 'mil', 'route']);
  });

  it('les places libres ouvertes aux champions vont aux titulaires, le reste à la milice', () => {
    // Camp : 3 places de champion, 5 au total ; 1 champion posté.
    const g = garrisonCells({ ...base, garrison: ['a1'], champFree: 2 });
    expect(kinds(g.champ)).toEqual(['adv', 'free', 'free']);
    expect(kinds(g.mil)).toEqual(['free', 'free']);
  });

  it('le héros compte pour 2 places', () => {
    const g = garrisonCells({ ...base, hero: 'posted', champFree: 1 });
    expect(kinds(g.champ)).toEqual(['hero', 'free']);
    expect(kinds(g.mil)).toEqual(['free', 'free']);
  });

  it('plein de miliciens sur des places de champion : une case « un champion peut venir »', () => {
    const g = garrisonCells({
      ...base,
      garrison: ['mil:1', 'mil:2', 'mil:3', 'mil:4', 'mil:5'],
      champFree: 3,
    });
    expect(kinds(g.champ)).toEqual(['bump']);
    expect(kinds(g.mil)).toEqual(['mil', 'mil', 'mil', 'mil', 'mil']);
  });

  it('une place de champion libre suffit : pas de case « bump » en plus', () => {
    const g = garrisonCells({ ...base, garrison: ['a1', 'mil:1', 'mil:2', 'mil:3'], champFree: 4 });
    expect(kinds(g.champ)).toEqual(['adv', 'free']);
  });

  it('sans milicien, aucune case « bump »', () => {
    const g = garrisonCells({ ...base, garrison: ['a1', 'a2', 'a3', 'a4', 'a5'], champFree: 0 });
    expect(g.champ.some((c) => c.kind === 'bump')).toBe(false);
    expect(g.mil).toEqual([]);
  });

  it('« bump » exige un milicien à déloger, même si des places de champion restent annoncées', () => {
    // Plein de champions en sortie : leurs places gardées ne se libèrent pas pour un autre.
    const g = garrisonCells({
      ...base,
      garrison: ['a1', 'a2'],
      away: ['a3', 'a4', 'a5'],
      champFree: 2,
    });
    expect(g.champ.some((c) => c.kind === 'bump')).toBe(false);
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
