import { describe, expect, it } from 'vitest';
import {
  droppedLabel,
  parseLastTeam,
  restoreLastTeam,
  serializeLastTeam,
  type LastTeam,
} from '@/lib/lastTeam';

const last: LastTeam = { advs: ['a', 'b', 'c', 'd'], hero: true, supplies: ['boost5'] };
const base = {
  allIds: ['a', 'b', 'c', 'd'],
  poolIds: ['a', 'b', 'c', 'd'],
  max: 10,
  heroOk: true,
  stock: { boost5: 2 },
};

describe('restoreLastTeam', () => {
  it('reprend tout quand tout est disponible', () => {
    const r = restoreLastTeam(last, base);
    expect(r.advs).toEqual(['a', 'b', 'c', 'd']);
    expect(r.hero).toBe(true);
    expect(r.supplies).toEqual(['boost5']);
    expect(droppedLabel(r.dropped)).toBe('');
  });
  it('distingue disparu et indisponible', () => {
    const r = restoreLastTeam(last, { ...base, allIds: ['a', 'b', 'c'], poolIds: ['a', 'b'] });
    expect(r.advs).toEqual(['a', 'b']);
    expect(r.dropped).toMatchObject({ gone: 1, unavailable: 1, overCap: 0 });
  });
  it('respecte le plafond du lieu', () => {
    const r = restoreLastTeam(last, { ...base, max: 2 });
    expect(r.advs).toEqual(['a', 'b']);
    expect(r.dropped.overCap).toBe(2);
  });
  it('ne compte pas comme dépassement un indisponible', () => {
    const r = restoreLastTeam(last, { ...base, poolIds: ['c', 'd'], max: 1 });
    expect(r.advs).toEqual(['c']);
    expect(r.dropped).toMatchObject({ unavailable: 2, overCap: 1 });
  });
  it('laisse le héros de côté s’il est indisponible', () => {
    const r = restoreLastTeam(last, { ...base, heroOk: false });
    expect(r.hero).toBe(false);
    expect(r.dropped.hero).toBe(true);
    expect(droppedLabel(r.dropped)).toContain('héros');
  });
  it('ne pose pas le héros s’il n’en était pas', () => {
    const r = restoreLastTeam({ ...last, hero: false }, base);
    expect(r.hero).toBe(false);
    expect(r.dropped.hero).toBe(false);
  });
  it('écarte les consommables épuisés', () => {
    expect(restoreLastTeam(last, { ...base, stock: { boost5: 0 } }).supplies).toEqual([]);
    expect(restoreLastTeam(last, { ...base, stock: {} }).supplies).toEqual([]);
  });
  it('plafond nul : personne', () => {
    expect(restoreLastTeam(last, { ...base, max: 0 }).advs).toEqual([]);
  });
});

describe('parseLastTeam', () => {
  it('fait l’aller-retour', () => {
    expect(parseLastTeam(serializeLastTeam(last))).toEqual(last);
  });
  it('rejette le corrompu et le vide', () => {
    expect(parseLastTeam('pas du json')).toBeNull();
    expect(parseLastTeam(null)).toBeNull();
    expect(parseLastTeam('{"advs":[],"hero":false}')).toBeNull();
    expect(parseLastTeam('{"advs":"x"}')).toBeNull();
  });
  it('filtre les ids et consommables inconnus', () => {
    const t = parseLastTeam('{"advs":["a",3,"a"],"hero":false,"supplies":["zzz","boost5"]}');
    expect(t).toEqual({ advs: ['a'], hero: false, supplies: ['boost5'] });
  });
});
