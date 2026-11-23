import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { comboTogglePick, type ComboPick } from '@/lib/combo';

const base = (over: Partial<ComboPick> = {}): ComboPick => ({
  exercise_ids: [],
  target: 6,
  setsTarget: 6,
  count_mode: 'sets',
  ...over,
});

describe('➕ choix libre des exos d’un groupe (comboTogglePick)', () => {
  it('ajoute puis retire un exo', () => {
    const a = comboTogglePick(base(), 'ex_row_barbell');
    expect(a.exercise_ids).toEqual(['ex_row_barbell']);
    const b = comboTogglePick(base({ exercise_ids: a.exercise_ids }), 'ex_row_barbell');
    expect(b.exercise_ids).toEqual([]);
  });
  it('les variantes d’un même mouvement se prennent ENSEMBLE (rowing barre + haltère, pompes + genoux)', () => {
    let p = base();
    for (const id of ['ex_row_barbell', 'ex_row_dumbbell', 'ex_band_row']) {
      p = { ...p, ...comboTogglePick(p, id) };
    }
    expect(p.exercise_ids).toEqual(['ex_row_barbell', 'ex_row_dumbbell', 'ex_band_row']);
    let q = base();
    for (const id of ['ex_pushup', 'ex_pushup_knees']) q = { ...q, ...comboTogglePick(q, id) };
    expect(q.exercise_ids).toEqual(['ex_pushup', 'ex_pushup_knees']);
  });
  it('aucun plafond : 9 exos dans un groupe', () => {
    let p = base({ target: 12, setsTarget: 12 });
    for (let i = 0; i < 9; i++) p = { ...p, ...comboTogglePick(p, 'ex_' + i) };
    expect(p.exercise_ids).toHaveLength(9);
  });
  it('en séries, le volume reste le même tant qu’il couvre 1 série par exo', () => {
    const p = comboTogglePick(base({ exercise_ids: ['a', 'b'] }), 'c');
    expect(p.target).toBe(6);
    expect(p.setsTarget).toBe(6);
  });
  it('en séries, le volume monte pour garder 1 série par exo', () => {
    const p = comboTogglePick(base({ exercise_ids: ['a', 'b', 'c', 'd', 'e', 'f'] }), 'g');
    expect(p.target).toBe(7);
    expect(p.setsTarget).toBe(7);
  });
  it('en répétitions, l’objectif n’est jamais touché', () => {
    const p = comboTogglePick(
      base({ count_mode: 'reps', target: 2, setsTarget: 1, exercise_ids: ['a', 'b'] }),
      'c',
    );
    expect(p.target).toBe(2);
    expect(p.setsTarget).toBe(1);
  });
  it('ne modifie pas son entrée', () => {
    const p = base({ exercise_ids: ['a'] });
    comboTogglePick(p, 'b');
    expect(p.exercise_ids).toEqual(['a']);
  });
});

describe('🎚️ écran de création du Défi 360', () => {
  const page = readFileSync(new URL('../src/pages/ComboNewPage.vue', import.meta.url), 'utf8');
  it('on ne demande plus le nombre d’exos : ni pastilles par groupe, ni plafond, ni « variante déjà choisie »', () => {
    expect(page).not.toMatch(/Exercices par groupe/);
    expect(page).not.toMatch(/setExoCount|exoWanted|exoMax|comboExoMax/);
    expect(page).not.toMatch(/suggestN|atCap|variantBlocked|variante déjà choisie/);
  });
  it('le choix d’un exo passe par la bascule libre', () => {
    expect(page).toMatch(/comboTogglePick\(p, exId\)/);
  });
});
