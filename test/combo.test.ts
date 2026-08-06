import { describe, it, expect } from 'vitest';
import {
  legDone,
  legRemaining,
  comboComplete,
  comboProgressPct,
  comboXpPoints,
  suggestComboTarget,
  type ComboChallenge,
  type ComboLeg,
} from '@/lib/combo';

const leg = (over: Partial<ComboLeg> = {}): ComboLeg => ({
  slot: 'push',
  exercise_id: 'ex_pushup',
  exercise_name: 'Pompes',
  rep_weight: 1,
  target: 100,
  progress: [],
  ...over,
});
const combo = (legs: ComboLeg[], over: Partial<ComboChallenge> = {}): ComboChallenge => ({
  id: 'c',
  name: 'Défi 360',
  start_date: '2026-01-05',
  duration_days: 7,
  status: 'active',
  legs,
  ...over,
});

describe('legs', () => {
  it('done / remaining / complete', () => {
    const l = leg({
      target: 100,
      progress: [
        { date: '2026-01-05', reps: 40 },
        { date: '2026-01-06', reps: 30 },
      ],
    });
    expect(legDone(l)).toBe(70);
    expect(legRemaining(l)).toBe(30);
  });
});

describe('comboComplete / progress', () => {
  it('complet seulement si TOUS les exos atteignent leur cible', () => {
    const done = leg({ target: 50, progress: [{ date: '2026-01-05', reps: 50 }] });
    const notDone = leg({
      slot: 'pull',
      exercise_id: 'ex_pullup',
      target: 50,
      progress: [{ date: '2026-01-05', reps: 20 }],
    });
    expect(comboComplete(combo([done]))).toBe(true);
    expect(comboComplete(combo([done, notDone]))).toBe(false);
    expect(comboProgressPct(combo([done, notDone]))).toBe(70); // (50+20)/100
  });
});

describe('comboXpPoints', () => {
  it('XP = reps×0,2×poids + tonnage/500 + prime si bouclé', () => {
    // 1 exo, cible 100, fait 100 le jour 0 → complet + avance
    const c = combo([leg({ target: 100, progress: [{ date: '2026-01-05', reps: 100 }] })]);
    expect(comboXpPoints([c])).toBeGreaterThan(0);
  });
  it('le tonnage (charge renseignée) augmente l’XP', () => {
    const light = combo([
      leg({ target: 50, weight_kg: 0, progress: [{ date: '2026-01-05', reps: 50 }] }),
    ]);
    const loaded = combo([
      leg({ target: 50, weight_kg: 20, progress: [{ date: '2026-01-05', reps: 50 }] }),
    ]);
    expect(comboXpPoints([loaded])).toBeGreaterThan(comboXpPoints([light]));
  });
  it('bouclé en avance rapporte plus que bouclé au dernier jour (même volume)', () => {
    const early = combo([leg({ target: 100, progress: [{ date: '2026-01-05', reps: 100 }] })]);
    const late = combo([leg({ target: 100, progress: [{ date: '2026-01-11', reps: 100 }] })]);
    expect(comboXpPoints([early])).toBeGreaterThan(comboXpPoints([late]));
  });
});

describe('suggestComboTarget', () => {
  it('essentiel > optionnel ; avancé > débutant', () => {
    expect(suggestComboTarget('intermediaire', true)).toBeGreaterThan(
      suggestComboTarget('intermediaire', false),
    );
    expect(suggestComboTarget('avance', true)).toBeGreaterThan(
      suggestComboTarget('debutant', true),
    );
  });
});
