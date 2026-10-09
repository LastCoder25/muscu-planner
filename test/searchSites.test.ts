import { describe, expect, it } from 'vitest';
import { searchSites, travelPosition, type Voyage } from '@/lib/expedition';

const H = 3_600_000;
const POI = { id: 'v1', x: 140, y: 60 } as Voyage['poi'];
/** Aller 1 h, fouille 2 h, retour 1 h. */
const VOY = { poi: POI, sentAt: 0, midAt: 3 * H, returnAt: 4 * H, dwellMs: 2 * H } as Voyage;

describe('🔍 progression de la fouille', () => {
  it('absente pendant l’aller, puis de 0 à 1 pendant la fouille, absente au retour', () => {
    expect(travelPosition(VOY, 0.5 * H).searchFrac).toBeUndefined();
    expect(travelPosition(VOY, 1 * H).searchFrac).toBe(0);
    expect(travelPosition(VOY, 2 * H).searchFrac).toBeCloseTo(0.5);
    expect(travelPosition(VOY, 2.9 * H).searchFrac).toBeCloseTo(0.95);
    expect(travelPosition(VOY, 3.5 * H).searchFrac).toBeUndefined();
  });
  it('un voyage sans fouille n’en a jamais', () => {
    const v = { ...VOY, dwellMs: 0 } as Voyage;
    for (const t of [0, 1, 2, 2.99, 3.5].map((x) => x * H))
      expect(travelPosition(v, t).searchFrac).toBeUndefined();
  });
});

describe('🔍 lieux en fouille sur la carte', () => {
  it('seuls ceux qui fouillent, cumulés par lieu', () => {
    const sites = searchSites([
      { key: 'a', poi: POI, pos: { searching: true, searchFrac: 0.2 }, count: 2 },
      { key: 'b', poi: POI, pos: { searching: true, searchFrac: 0.6 }, count: 1 },
      { key: 'c', poi: { id: 'z', x: 1, y: 2 }, pos: { searching: false }, count: 3 },
    ]);
    expect(sites).toEqual([{ poiId: 'v1', x: 140, y: 60, frac: 0.6, count: 3, keys: ['a', 'b'] }]);
  });
  it('rien quand personne ne fouille', () => {
    expect(searchSites([{ key: 'a', poi: POI, pos: {}, count: 1 }])).toEqual([]);
  });
});
