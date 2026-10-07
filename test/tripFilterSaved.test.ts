import { describe, expect, it } from 'vitest';
import {
  ALL_TRIPS,
  parseTripFilters,
  serializeTripFilters,
  tripFiltersKey,
} from '@/lib/tripFilter';

describe('filtres de voyages mémorisés', () => {
  it('aller-retour : ce qui est écrit se relit à l’identique', () => {
    const raw = serializeTripFilters({ mode: 'only', cats: ['raids', 'attacks'] }, ['back']);
    expect(parseTripFilters(raw)).toEqual({
      sel: { mode: 'only', cats: ['raids', 'attacks'] },
      legs: ['back'],
    });
  });
  it('une rangée vidée par le joueur reste vide', () => {
    const raw = serializeTripFilters({ mode: 'only', cats: [] }, []);
    expect(parseTripFilters(raw)).toEqual({ sel: { mode: 'only', cats: [] }, legs: [] });
  });
  it('rien d’enregistré ou illisible → tout afficher', () => {
    for (const raw of [null, '', '{', '"x"', '{"sel":{"mode":"bof"}}'])
      expect(parseTripFilters(raw)).toEqual({ sel: ALL_TRIPS, legs: ['go', 'back'] });
  });
  it('les catégories et étapes inconnues sont écartées', () => {
    const raw = JSON.stringify({
      sel: { mode: 'except', cats: ['trips', 'zzz'] },
      legs: ['go', 7],
    });
    expect(parseTripFilters(raw)).toEqual({
      sel: { mode: 'except', cats: ['trips'] },
      legs: ['go'],
    });
  });
  it('une clé par compte', () => {
    expect(tripFiltersKey('a')).not.toBe(tripFiltersKey('b'));
  });
});
