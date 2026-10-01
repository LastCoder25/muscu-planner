import { describe, expect, it } from 'vitest';
import { toggleOriginGroup } from '@/lib/combinedAttack';

describe('toggleOriginGroup — toucher un lieu coche ou décoche tous ses champions', () => {
  it('coche tous ceux du lieu, sans toucher aux autres lieux', () => {
    expect(toggleOriginGroup(['x'], ['a', 'b'], 10)).toEqual(['x', 'a', 'b']);
  });
  it('complète un lieu à moitié coché', () => {
    expect(toggleOriginGroup(['b', 'x'], ['a', 'b', 'c'], 10)).toEqual(['b', 'x', 'a', 'c']);
  });
  it('tous cochés : les décoche tous, les autres lieux restent', () => {
    expect(toggleOriginGroup(['a', 'x', 'b'], ['a', 'b'], 10)).toEqual(['x']);
  });
  it('ne dépasse jamais le plafond de l’équipe', () => {
    expect(toggleOriginGroup(['x'], ['a', 'b', 'c'], 2)).toEqual(['x', 'a']);
    expect(toggleOriginGroup(['x', 'y'], ['a'], 2)).toEqual(['x', 'y']);
  });
  it('un lieu vide ne change rien', () => {
    expect(toggleOriginGroup(['x'], [], 5)).toEqual(['x']);
  });
});
