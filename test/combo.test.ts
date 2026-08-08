import { describe, it, expect } from 'vitest';
import {
  legDone,
  legRemaining,
  comboComplete,
  comboProgressPct,
  comboXpPoints,
  suggestComboTarget,
  buildComboSession,
  comboSessionSetBudget,
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

describe('buildComboSession (time-boxée)', () => {
  const bigCombo = () =>
    combo([
      leg({ slot: 'push', exercise_id: 'a', target: 400 }),
      leg({ slot: 'pull', exercise_id: 'b', target: 400 }),
      leg({ slot: 'squat', exercise_id: 'c', target: 400 }),
    ]);
  it('ne prend PAS toutes les reps : le volume dépend du temps', () => {
    const short = buildComboSession(bigCombo(), { minutes: 15, restSec: 60 });
    const long = buildComboSession(bigCombo(), { minutes: 45, restSec: 60 });
    const totReps = (s: ReturnType<typeof buildComboSession>) =>
      s.reduce((a, e) => a + e.sets.reduce((b, r) => b + r, 0), 0);
    expect(totReps(long)).toBeGreaterThan(totReps(short));
    // et bien moins que le total restant (1200)
    expect(totReps(long)).toBeLessThan(1200);
  });
  it('le budget de séries = durée / (exécution + repos)', () => {
    expect(comboSessionSetBudget(15, 60)).toBe(9); // 900s / 100s
    expect(comboSessionSetBudget(30, 60)).toBe(18);
  });
  it('exclut les exos déjà finis', () => {
    const c = combo([
      leg({
        slot: 'push',
        exercise_id: 'a',
        target: 50,
        progress: [{ date: '2026-01-05', reps: 50 }],
      }),
      leg({ slot: 'pull', exercise_id: 'b', target: 100 }),
    ]);
    const s = buildComboSession(c, { minutes: 30, restSec: 60 });
    expect(s.map((e) => e.exercise_id)).toEqual(['b']);
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
