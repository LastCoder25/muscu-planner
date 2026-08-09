import { describe, it, expect } from 'vitest';
import {
  legSetsDone,
  legReps,
  legRemaining,
  legComplete,
  legLastReps,
  legLastWeight,
  comboComplete,
  comboProgressPct,
  comboXpPoints,
  comboOverachievement,
  suggestComboTarget,
  suggestComboPlan,
  type ComboSlotSpec,
  buildComboSession,
  comboSessionSetBudget,
  legSets,
  type ComboChallenge,
  type ComboLeg,
  type ComboSet,
} from '@/lib/combo';

const set = (reps: number, weight?: number, date = '2026-01-05'): ComboSet => ({
  date,
  reps,
  weight: weight ?? null,
});
const leg = (over: Partial<ComboLeg> = {}): ComboLeg => ({
  slot: 'push',
  exercise_id: 'ex_pushup',
  exercise_name: 'Pompes',
  rep_weight: 1,
  target: 4, // séries/semaine
  sets: [],
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

describe('legs (modèle séries)', () => {
  it('séries faites / restantes / complet', () => {
    const l = leg({ target: 4, sets: [set(10), set(8)] });
    expect(legSetsDone(l)).toBe(2);
    expect(legRemaining(l)).toBe(2);
    expect(legComplete(l)).toBe(false);
    expect(legReps(l)).toBe(18);
  });
  it('préremplissage : dernière série (reps + poids)', () => {
    const l = leg({ sets: [set(10, 40), set(8, 45)] });
    expect(legLastReps(l)).toBe(8);
    expect(legLastWeight(l)).toBe(45);
  });
  it('repli : ancien format `progress` converti en séries', () => {
    const legacy = leg({
      sets: undefined,
      weight_kg: 30,
      progress: [
        { date: '2026-01-05', reps: 12 },
        { date: '2026-01-06', reps: 10 },
      ],
    });
    expect(legSetsDone(legacy)).toBe(2);
    expect(legSets(legacy)[0]!.weight).toBe(30);
  });
});

describe('comboComplete / progression', () => {
  it('complet seulement si TOUS les exos atteignent leurs séries', () => {
    const done = leg({ target: 3, sets: [set(10), set(10), set(10)] });
    const notDone = leg({ slot: 'pull', exercise_id: 'ex_pullup', target: 3, sets: [set(8)] });
    expect(comboComplete(combo([done]))).toBe(true);
    expect(comboComplete(combo([done, notDone]))).toBe(false);
    // (3 + 1) / (3 + 3) = 66 %
    expect(comboProgressPct(combo([done, notDone]))).toBe(67);
  });
});

describe('comboXpPoints', () => {
  it('XP > 0 quand des séries sont faites', () => {
    const c = combo([leg({ target: 3, sets: [set(10), set(10), set(10)] })]);
    expect(comboXpPoints([c])).toBeGreaterThan(0);
  });
  it('le poids par série augmente l’XP (tonnage)', () => {
    const light = combo([leg({ target: 3, sets: [set(10), set(10), set(10)] })]);
    const loaded = combo([leg({ target: 3, sets: [set(10, 40), set(10, 40), set(10, 40)] })]);
    expect(comboXpPoints([loaded])).toBeGreaterThan(comboXpPoints([light]));
  });
  it('une série assistée vaut moins qu’une série stricte', () => {
    const strict = combo([leg({ target: 1, sets: [{ date: '2026-01-05', reps: 10 }] })]);
    const assisted = combo([
      leg({ target: 1, sets: [{ date: '2026-01-05', reps: 10, assisted: true }] }),
    ]);
    expect(comboXpPoints([assisted])).toBeLessThan(comboXpPoints([strict]));
  });
  it('bouclé en avance rapporte plus que bouclé tard (même volume)', () => {
    const early = combo([
      leg({ target: 2, sets: [set(10, 0, '2026-01-05'), set(10, 0, '2026-01-05')] }),
    ]);
    const late = combo([
      leg({ target: 2, sets: [set(10, 0, '2026-01-05'), set(10, 0, '2026-01-11')] }),
    ]);
    expect(comboXpPoints([early])).toBeGreaterThan(comboXpPoints([late]));
  });
  it('dépasser l’objectif rapporte un bonus (au-delà de l’XP de base des reps)', () => {
    // Même objectif (2), mais l’un a fait 4 séries (2 en plus) → bonus de dépassement.
    const exact = combo([leg({ target: 2, sets: [set(10), set(10)] })]);
    const over = combo([leg({ target: 2, sets: [set(10), set(10), set(10), set(10)] })]);
    const baseGain = comboXpPoints([over]) - comboXpPoints([exact]);
    // Sans bonus, 2 séries en plus vaudraient 2×10×0.2×XP_MULT = 8 pts. Avec bonus, plus.
    expect(baseGain).toBeGreaterThan(8);
    expect(comboOverachievement(over).bonusXp).toBeGreaterThan(0);
  });
});

describe('comboOverachievement', () => {
  it('balance = part d’exos dépassés (anti-spam d’un seul exo)', () => {
    const oneOfTwo = combo([
      leg({ slot: 'push', exercise_id: 'a', target: 2, sets: [set(10), set(10), set(10)] }),
      leg({ slot: 'pull', exercise_id: 'b', target: 2, sets: [set(10), set(10)] }),
    ]);
    const bothOver = combo([
      leg({ slot: 'push', exercise_id: 'a', target: 2, sets: [set(10), set(10), set(10)] }),
      leg({ slot: 'pull', exercise_id: 'b', target: 2, sets: [set(10), set(10), set(10)] }),
    ]);
    expect(comboOverachievement(oneOfTwo).balance).toBeCloseTo(0.5);
    expect(comboOverachievement(bothOver).balance).toBeCloseTo(1);
    expect(comboOverachievement(bothOver).bonusXp).toBeGreaterThan(
      comboOverachievement(oneOfTwo).bonusXp,
    );
  });
});

describe('buildComboSession (time-boxée, en séries)', () => {
  const bigCombo = () =>
    combo([
      leg({ slot: 'push', exercise_id: 'a', target: 40 }),
      leg({ slot: 'pull', exercise_id: 'b', target: 40 }),
      leg({ slot: 'squat', exercise_id: 'c', target: 40 }),
    ]);
  it('plus de temps = plus de séries, mais pas tout', () => {
    const short = buildComboSession(bigCombo(), { minutes: 15, restSec: 60 });
    const long = buildComboSession(bigCombo(), { minutes: 45, restSec: 60 });
    const nbSets = (s: ReturnType<typeof buildComboSession>) =>
      s.reduce((a, e) => a + e.sets.length, 0);
    expect(nbSets(long)).toBeGreaterThan(nbSets(short));
    expect(nbSets(long)).toBeLessThan(120); // bien moins que les 120 séries restantes
  });
  it('budget de séries = durée / (exécution + repos)', () => {
    expect(comboSessionSetBudget(15, 60)).toBe(9);
    expect(comboSessionSetBudget(30, 60)).toBe(18);
  });
  it('exclut les exos déjà finis', () => {
    const c = combo([
      leg({ slot: 'push', exercise_id: 'a', target: 2, sets: [set(10), set(10)] }),
      leg({ slot: 'pull', exercise_id: 'b', target: 10 }),
    ]);
    const s = buildComboSession(c, { minutes: 30, restSec: 60 });
    expect(s.map((e) => e.exercise_id)).toEqual(['b']);
  });
});

describe('suggestComboTarget (séries)', () => {
  it('essentiel > optionnel ; avancé > débutant', () => {
    expect(suggestComboTarget('intermediaire', true)).toBeGreaterThan(
      suggestComboTarget('intermediaire', false),
    );
    expect(suggestComboTarget('avance', true)).toBeGreaterThan(
      suggestComboTarget('debutant', true),
    );
  });
});

describe('suggestComboPlan (volume par séances + format)', () => {
  const ALL = [
    'pectoraux',
    'dos',
    'épaules',
    'biceps',
    'triceps',
    'quadriceps',
    'ischio-jambiers',
    'mollets',
    'abdominaux',
  ];
  const fullBody = (n: number) => Array.from({ length: n }, () => ({ muscles: ALL }));
  const ppl = [
    { muscles: ['pectoraux', 'épaules', 'triceps'] }, // push
    { muscles: ['dos', 'biceps'] }, // pull
    { muscles: ['quadriceps', 'ischio-jambiers', 'mollets', 'abdominaux'] }, // legs
  ];
  const SLOTS: ComboSlotSpec[] = [
    { key: 'push', muscles: ['pectoraux'], essential: true },
    { key: 'pull', muscles: ['dos'], essential: true },
    { key: 'squat', muscles: ['quadriceps'], essential: true },
    { key: 'arms', muscles: ['biceps', 'triceps'], essential: false },
  ];
  const bySlot = (plan: ReturnType<typeof suggestComboPlan>, key: string) =>
    plan.find((p) => p.slot === key)!;

  it('plus de séances = plus de volume', () => {
    const low = bySlot(suggestComboPlan('intermediaire', 2, fullBody(2), SLOTS), 'push');
    const high = bySlot(suggestComboPlan('intermediaire', 6, fullBody(6), SLOTS), 'push');
    expect(high.weeklySets).toBeGreaterThan(low.weeklySets);
  });

  it('full-body (fréquence haute) = plus d’exos que PPL (fréquence basse), à séances égales', () => {
    const fb = bySlot(suggestComboPlan('intermediaire', 3, fullBody(3), SLOTS), 'push');
    const pp = bySlot(suggestComboPlan('intermediaire', 3, ppl, SLOTS), 'push');
    expect(fb.nExos).toBeGreaterThan(pp.nExos); // 3 vs 1
    // Même nb de séances → volume comparable, réparti différemment.
    expect(fb.weeklySets).toBe(pp.weeklySets);
  });

  it('essentiel > optionnel (volume) et avancé > débutant', () => {
    const plan = suggestComboPlan('intermediaire', 3, fullBody(3), SLOTS);
    expect(bySlot(plan, 'push').weeklySets).toBeGreaterThan(bySlot(plan, 'arms').weeklySets);
    const deb = bySlot(suggestComboPlan('debutant', 3, fullBody(3), SLOTS), 'push');
    const adv = bySlot(suggestComboPlan('avance', 3, fullBody(3), SLOTS), 'push');
    expect(adv.weeklySets).toBeGreaterThan(deb.weeklySets);
  });

  it('emplacement non ciblé par le split = inactif', () => {
    const plan = suggestComboPlan('intermediaire', 3, ppl, [
      { key: 'ghost', muscles: ['muscle-inexistant'], essential: true },
    ]);
    expect(bySlot(plan, 'ghost').active).toBe(false);
    expect(bySlot(plan, 'ghost').nExos).toBe(0);
  });

  it('séries/exo = volume réparti sur les exos', () => {
    const fb = bySlot(suggestComboPlan('intermediaire', 3, fullBody(3), SLOTS), 'push');
    expect(fb.setsPerExo).toBe(Math.max(1, Math.round(fb.weeklySets / fb.nExos)));
  });
});
