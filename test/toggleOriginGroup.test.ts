import { describe, expect, it } from 'vitest';
import {
  originGroupState,
  originGroupsWithSomeone,
  toggleOriginGroup,
  toggleOriginGroupWithHero,
} from '@/lib/combinedAttack';

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

describe('« Tous » d’un lieu fixe où le héros est posté — il part avec ses champions', () => {
  it('coche le héros avec les champions du lieu', () => {
    expect(toggleOriginGroupWithHero(['x'], ['a', 'b'], 10, true, false)).toEqual({
      escort: ['x', 'a', 'b'],
      hero: true,
    });
  });
  it('lieu complet avec le héros : tout se décoche, héros compris', () => {
    expect(toggleOriginGroupWithHero(['a', 'x', 'b'], ['a', 'b'], 10, true, true)).toEqual({
      escort: ['x'],
      hero: false,
    });
  });
  it('champions cochés mais pas le héros : on complète au lieu de décocher', () => {
    expect(toggleOriginGroupWithHero(['a', 'b'], ['a', 'b'], 10, true, false)).toEqual({
      escort: ['a', 'b'],
      hero: true,
    });
  });
  it('le héros ne compte pas dans le plafond des champions', () => {
    expect(toggleOriginGroupWithHero([], ['a', 'b', 'c'], 2, true, false)).toEqual({
      escort: ['a', 'b'],
      hero: true,
    });
  });
  it('héros seul sur le lieu : « tous » le coche puis le décoche', () => {
    expect(toggleOriginGroupWithHero(['x'], [], 5, true, false)).toEqual({
      escort: ['x'],
      hero: true,
    });
    expect(toggleOriginGroupWithHero(['x'], [], 5, true, true)).toEqual({
      escort: ['x'],
      hero: false,
    });
  });
  it('héros ailleurs (ou à la base) : son choix ne bouge pas', () => {
    expect(toggleOriginGroupWithHero([], ['a'], 5, false, true)).toEqual({
      escort: ['a'],
      hero: true,
    });
    expect(toggleOriginGroupWithHero(['a'], ['a'], 5, false, false)).toEqual({
      escort: [],
      hero: false,
    });
  });
  it('l’état du lieu compte le héros posté comme un membre', () => {
    expect(originGroupState(['a', 'b'], ['a', 'b'], true, false)).toBe('some');
    expect(originGroupState(['a', 'b'], ['a', 'b'], true, true)).toBe('all');
    expect(originGroupState([], ['a'], true, false)).toBe('none');
    expect(originGroupState([], [], true, true)).toBe('all');
    expect(originGroupState(['a'], ['a'], false, false)).toBe('all');
  });
});

describe('originGroupsWithSomeone — un lieu sans personne sur place est caché', () => {
  const g = (id: string, n: number) => ({ id, advs: Array.from({ length: n }, (_, i) => i) });
  it('garde les lieux avec un champion prêt, cache les vides', () => {
    expect(originGroupsWithSomeone([g('base', 0), g('mine', 2), g('arsenal', 0)], null)).toEqual([
      g('mine', 2),
    ]);
  });
  it('garde le lieu (ou la base) où le héros se trouve, même sans champion', () => {
    expect(
      originGroupsWithSomeone([g('base', 0), g('arsenal', 0)], 'arsenal').map((x) => x.id),
    ).toEqual(['arsenal']);
    expect(
      originGroupsWithSomeone([g('base', 0), g('arsenal', 0)], 'base').map((x) => x.id),
    ).toEqual(['base']);
  });
  it('garde l’ordre de l’écran', () => {
    expect(
      originGroupsWithSomeone([g('c', 1), g('a', 0), g('b', 1)], 'a').map((x) => x.id),
    ).toEqual(['c', 'a', 'b']);
  });
});
