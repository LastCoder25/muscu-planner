import { describe, it, expect } from 'vitest';
import { groupGearByGrade, compareAdvGear, type AdvGear } from '@/lib/advGear';

/** 🗂️ Le stock d'équipement des champions rangé par lettre, comme le vivier. */
const piece = (id: string, grade: AdvGear['grade'], level: number): AdvGear =>
  ({
    id,
    grade,
    level,
    rarity: 'commun',
    slot: 'weapon',
    lineage: 'guerrier',
    name: id,
    emoji: '🗡️',
  }) as unknown as AdvGear;

describe('🗂️ stock rangé par lettre', () => {
  const stock = [
    piece('b1', 'B', 3),
    piece('s1', 'S', 2),
    piece('a1', 'A', 1),
    piece('b2', 'B', 9),
    piece('a2', 'A', 7),
  ];

  it('S puis A puis B, et rien ne se perd', () => {
    const g = groupGearByGrade(stock);
    expect(g.map((x) => x.grade)).toEqual(['S', 'A', 'B']);
    expect(g.flatMap((x) => x.gear.map((p) => p.id)).sort()).toEqual(
      stock.map((p) => p.id).sort(),
    );
    expect(g.every((x) => x.gear.every((p) => p.grade === x.grade))).toBe(true);
  });

  it('chaque groupe garde l’ordre du stock (compareAdvGear)', () => {
    for (const x of groupGearByGrade(stock))
      expect(x.gear).toEqual([...x.gear].sort(compareAdvGear));
    expect(groupGearByGrade(stock)[2]!.gear.map((p) => p.id)).toEqual(['b2', 'b1']);
  });

  it('une lettre absente n’a pas de séparateur', () => {
    expect(groupGearByGrade([piece('b', 'B', 1)]).map((x) => x.grade)).toEqual(['B']);
    expect(groupGearByGrade([])).toEqual([]);
  });

  it('une pièce SANS lettre (d’avant la v0.1001) se range en B au lieu de disparaître', () => {
    const vieille = { ...piece('old', 'B', 1), grade: undefined } as unknown as AdvGear;
    const g = groupGearByGrade([vieille, piece('a', 'A', 1)]);
    expect(g.map((x) => x.grade)).toEqual(['A', 'B']);
    expect(g[1]!.gear.map((p) => p.id)).toEqual(['old']);
  });

  it('ne trie pas la liste reçue en place', () => {
    const copy = [...stock];
    groupGearByGrade(stock);
    expect(stock).toEqual(copy);
  });
});
