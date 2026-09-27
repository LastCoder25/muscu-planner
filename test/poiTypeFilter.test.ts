import { describe, expect, it } from 'vitest';
import { POI_LABEL, type PoiType } from '../src/lib/expedition';
import {
  EMPTY_TYPE_FILTER,
  TYPE_ORDER,
  cycleType,
  effectiveTypeFilter,
  filterSummary,
  parseTypeFilter,
  typeMode,
  typeOptions,
  typeShown,
} from '../src/lib/poiTypeFilter';

const present: PoiType[] = ['mine', 'camp', 'rift'];

describe('le filtre par type de lieu', () => {
  it('connaît TOUS les types de lieu, une seule fois', () => {
    expect([...TYPE_ORDER].sort()).toEqual((Object.keys(POI_LABEL) as PoiType[]).sort());
    expect(new Set(TYPE_ORDER).size).toBe(TYPE_ORDER.length);
  });

  it('un toucher passe de affiché à seul, puis masqué, puis affiché', () => {
    let f = EMPTY_TYPE_FILTER;
    expect(typeMode(f, 'mine')).toBe('all');
    f = cycleType(f, 'mine', present);
    expect(typeMode(f, 'mine')).toBe('only');
    f = cycleType(f, 'mine', present);
    expect(typeMode(f, 'mine')).toBe('none');
    f = cycleType(f, 'mine', present);
    expect(typeMode(f, 'mine')).toBe('all');
  });

  it('« seul » l’emporte, et plusieurs types seuls se cumulent', () => {
    let f = cycleType(EMPTY_TYPE_FILTER, 'mine', present);
    expect(typeShown(f, 'mine')).toBe(true);
    expect(typeShown(f, 'camp')).toBe(false);
    f = cycleType(f, 'rift', present);
    expect(typeShown(f, 'rift')).toBe(true);
    expect(typeShown(f, 'mine')).toBe(true);
    expect(typeShown(f, 'camp')).toBe(false);
  });

  it('masqué retire le type, les autres restent', () => {
    const f = { only: [], hidden: ['camp'] as PoiType[] };
    expect(typeShown(f, 'camp')).toBe(false);
    expect(typeShown(f, 'mine')).toBe(true);
  });

  it('ne vide jamais la carte : on ne masque pas le dernier type visible', () => {
    let f = cycleType(EMPTY_TYPE_FILTER, 'mine', present); // mine seule
    f = cycleType(f, 'mine', ['mine']); // la masquer viderait une carte de mines
    expect(typeShown(f, 'mine')).toBe(true);
    expect(typeMode(f, 'mine')).toBe('all');
  });

  it('relit un état stocké en écartant l’inconnu et les conflits', () => {
    expect(parseTypeFilter({ only: ['mine', 'mine', 'dragon'], hidden: ['mine', 'camp'] })).toEqual(
      { only: ['mine'], hidden: ['camp'] },
    );
    expect(parseTypeFilter('n’importe quoi')).toEqual({ only: [], hidden: [] });
  });

  it('reprend l’ancien réglage des failles', () => {
    expect(parseTypeFilter(null, 'only')).toEqual({ only: ['rift'], hidden: [] });
    expect(parseTypeFilter(null, 'none')).toEqual({ only: [], hidden: ['rift'] });
    expect(parseTypeFilter(null, 'all')).toEqual({ only: [], hidden: [] });
  });

  it('une puce par type présent, dans l’ordre, comptée dans les rangs affichés', () => {
    const pois = [
      { type: 'camp' as PoiType, r: 1 },
      { type: 'mine' as PoiType, r: 0 },
      { type: 'mine' as PoiType, r: 1 },
    ];
    const opts = typeOptions(pois, (p) => (p as { r: number }).r === 1);
    expect(opts).toEqual([
      { type: 'mine', total: 2, inRanks: 1 },
      { type: 'camp', total: 1, inRanks: 1 },
    ]);
  });
});

describe('🎚️ le résumé des filtres repliés', () => {
  const R = [0, 1, 2];
  it('rien de filtré : tout affiché, pas actif', () => {
    expect(filterSummary(R, new Set(), EMPTY_TYPE_FILTER, present)).toEqual({
      active: false,
      text: 'tout affiché',
    });
  });
  it('rangs masqués et types seuls se lisent ensemble', () => {
    const s = filterSummary(R, new Set([2]), { only: ['mine', 'rift'], hidden: [] }, present);
    expect(s).toEqual({ active: true, text: '2/3 rangs · Mine, Faille seulement' });
  });
  it('« seuls » l’emporte : on ne compte pas les masqués derrière', () => {
    expect(filterSummary(R, new Set(), { only: ['mine'], hidden: ['camp'] }, present).text).toBe(
      'Mine seulement',
    );
    expect(filterSummary(R, new Set(), { only: [], hidden: ['camp'] }, present).text).toBe(
      'sans Camp',
    );
  });
  it('au-delà de deux types, un compte', () => {
    const f = { only: ['mine', 'camp', 'rift'] as PoiType[], hidden: [] };
    expect(filterSummary([0], new Set(), f, present).text).toBe('3 types seuls');
  });
  it('un rang ou un type mémorisé mais ABSENT de la carte ne filtre rien', () => {
    const s = filterSummary(R, new Set([7]), { only: [], hidden: ['arena'] }, present);
    expect(s).toEqual({ active: false, text: 'tout affiché' });
  });
});

describe('🗺️ le filtre effectif (types présents aujourd’hui)', () => {
  it('un type « seul » ABSENT ne masque plus toute la carte', () => {
    const f = effectiveTypeFilter({ only: ['arena'], hidden: [] }, present);
    expect(present.filter((t) => typeShown(f, t))).toEqual(present);
    // …et le résumé le dit : rien n’est filtré.
    expect(filterSummary([0], new Set(), { only: ['arena'], hidden: [] }, present).active).toBe(
      false,
    );
  });
  it('les types seuls présents restent seuls', () => {
    const f = effectiveTypeFilter({ only: ['arena', 'mine'], hidden: ['camp'] }, present);
    expect(f).toEqual({ only: ['mine'], hidden: ['camp'] });
    expect(present.filter((t) => typeShown(f, t))).toEqual(['mine']);
  });
});
