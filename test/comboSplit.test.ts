import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { comboNudgeShare, comboSplit, comboTogglePick, type ComboPick } from '@/lib/combo';

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const pick = (over: Partial<ComboPick> = {}): ComboPick => ({
  exercise_ids: ['a', 'b', 'c'],
  target: 8,
  setsTarget: 8,
  count_mode: 'sets',
  ...over,
});

describe('🍰 répartition du volume entre les exos (comboSplit)', () => {
  it('par défaut : parts égales, le reste aux premiers, somme exacte', () => {
    expect(comboSplit(8, ['a', 'b', 'c'])).toEqual({ a: 3, b: 3, c: 2 });
    expect(comboSplit(9, ['a', 'b', 'c'])).toEqual({ a: 3, b: 3, c: 3 });
    expect(comboSplit(5, ['a'])).toEqual({ a: 5 });
  });
  it('au prorata d’une répartition choisie, somme exacte', () => {
    expect(comboSplit(12, ['a', 'b'], { a: 6, b: 2 })).toEqual({ a: 9, b: 3 });
    for (const t of [7, 10, 13, 29]) {
      expect(sum(comboSplit(t, ['a', 'b', 'c'], { a: 5, b: 1, c: 2 }))).toBe(t);
    }
  });
  it('jamais sous le minimum, même si le total est trop petit', () => {
    expect(comboSplit(2, ['a', 'b', 'c', 'd'])).toEqual({ a: 1, b: 1, c: 1, d: 1 });
    const r = comboSplit(6, ['a', 'b'], { a: 50, b: 1 });
    expect(r.b).toBeGreaterThanOrEqual(1);
    expect(sum(r)).toBe(6);
  });
  it('le plancher qui dépasse le total est repris sur la plus grosse part', () => {
    expect(comboSplit(5, ['a', 'b', 'c'], { a: 10, b: 1, c: 1 })).toEqual({ a: 3, b: 1, c: 1 });
  });
  it('un exo sans poids prend la part moyenne des autres', () => {
    expect(comboSplit(12, ['a', 'b', 'c'], { a: 4, b: 4 })).toEqual({ a: 4, b: 4, c: 4 });
  });
  it('rien à répartir sans exo', () => {
    expect(comboSplit(8, [])).toEqual({});
  });
});

describe('✏️ ajuster la part d’un exo (comboNudgeShare)', () => {
  it('+1 série sur un exo : le groupe grossit d’autant, les autres gardent leur part', () => {
    const r = comboNudgeShare(pick(), 'c', 1, 1);
    expect(r.alloc).toEqual({ a: 3, b: 3, c: 3 });
    expect(r.target).toBe(9);
    expect(r.setsTarget).toBe(9);
  });
  it('−1 série sur un exo', () => {
    const r = comboNudgeShare(pick(), 'a', -1, 1);
    expect(r.alloc).toEqual({ a: 2, b: 3, c: 2 });
    expect(r.target).toBe(7);
  });
  it('jamais sous 1 pas', () => {
    const r = comboNudgeShare(pick({ target: 3 }), 'a', -1, 1);
    expect(r.alloc!.a).toBe(1);
  });
  it('en reps : pas de 10, l’objectif en séries n’est pas touché', () => {
    const p = pick({ count_mode: 'reps', target: 90, setsTarget: 8 });
    const r = comboNudgeShare(p, 'a', 1, 10);
    expect(r.alloc).toEqual({ a: 40, b: 30, c: 30 });
    expect(r.target).toBe(100);
    expect(r.setsTarget).toBe(8);
  });
});

describe('🔁 la répartition choisie survit à l’ajout / au retrait d’un exo', () => {
  it('sans répartition choisie, rien n’est mémorisé', () => {
    expect(comboTogglePick(pick(), 'd').alloc).toBeUndefined();
  });
  it('retirer un exo rend sa part aux autres, le volume du groupe reste', () => {
    const p = pick({ target: 12, alloc: { a: 6, b: 4, c: 2 } });
    const r = comboTogglePick(p, 'c');
    expect(r.exercise_ids).toEqual(['a', 'b']);
    expect(r.target).toBe(12);
    expect(sum(r.alloc!)).toBe(12);
    expect(r.alloc!.a).toBeGreaterThan(r.alloc!.b!);
  });
  it('ajouter un exo lui donne une part moyenne, le volume du groupe reste', () => {
    const p = pick({ exercise_ids: ['a', 'b'], target: 10, alloc: { a: 7, b: 3 } });
    const r = comboTogglePick(p, 'c');
    expect(r.target).toBe(10);
    expect(sum(r.alloc!)).toBe(10);
    expect(r.alloc!.c).toBeGreaterThanOrEqual(1);
    expect(r.alloc!.a).toBeGreaterThan(r.alloc!.b!);
  });
});

describe('🧾 l’écran de création câble la répartition', () => {
  const page = readFileSync(new URL('../src/pages/ComboNewPage.vue', import.meta.url), 'utf8');
  it('chaque exo est créé avec SA part, pas une moyenne', () => {
    expect(page).toMatch(/const split = shares\(slot\.key\)/);
    expect(page).toMatch(/split\[exId\] \?\? 1/);
    expect(page).not.toMatch(/perExo\(/);
  });
  it('le récap propose la répartition et son retour à parts égales', () => {
    expect(page).toMatch(/nudgeShare\(key, e\.id, -1\)/);
    expect(page).toMatch(/nudgeShare\(key, e\.id, 1\)/);
    expect(page).toMatch(/À parts égales/);
  });
});
