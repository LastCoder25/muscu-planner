import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMBO_MAX_EXOS, COMBO_MIN_SETS_PER_EXO, comboExoMax } from '@/lib/combo';

describe('🎚️ nombre d’exos choisi par groupe (comboExoMax)', () => {
  it('borné par le volume : au moins 2 séries par exo', () => {
    expect(COMBO_MIN_SETS_PER_EXO).toBe(2);
    expect(comboExoMax(12, 20)).toBe(6);
    expect(comboExoMax(9, 20)).toBe(4);
    expect(comboExoMax(5, 20)).toBe(2);
  });
  it('borné par les exos réellement disponibles', () => {
    expect(comboExoMax(12, 3)).toBe(3);
    expect(comboExoMax(12, 1)).toBe(1);
  });
  it('plafond absolu, et toujours au moins 1 (même sans exo ni volume)', () => {
    expect(comboExoMax(100, 100)).toBe(COMBO_MAX_EXOS);
    expect(comboExoMax(0, 0)).toBe(1);
    expect(comboExoMax(1, 9)).toBe(1);
  });
});

describe('🎚️ écran de création du Défi 360', () => {
  const page = readFileSync(new URL('../src/pages/ComboNewPage.vue', import.meta.url), 'utf8');
  it('la Variété globale est remplacée par des pastilles par groupe', () => {
    expect(page).not.toMatch(/VARIETY_OPTS/);
    expect(page).toMatch(/Exercices par groupe/);
    expect(page).toMatch(/setExoCount\(s\.key, n\)/);
  });
  it('le choix prime sur la suggestion mais reste borné par le plafond du groupe', () => {
    expect(page).toMatch(/Math\.min\(chosen \?\? p\?\.nExos \?\? 1, max, cands\.length \|\| 1\)/);
    expect(page).toMatch(/comboExoMax\(p\?\.weeklySets \?\? 0, cands\.length\)/);
  });
});
