// 🔁 La bascule convertit les séries : 12 dips ne font pas 12 reps de développé couché.
// Chaque série prend des valeurs de l'exo cible (dernière série, sinon milieu de sa
// fourchette), corrigeables, et garde ses vraies valeurs pour l'XP et les statistiques.
import { describe, it, expect } from 'vitest';
import {
  transferComboLeg,
  comboTransferPlan,
  comboXpPoints,
  comboXpBreakdown,
  comboTieredBonus,
  legSets,
  legDone,
  setWork,
  setOriginLabel,
  COMBO_SET_MIN,
  type ComboChallenge,
  type ComboLeg,
  type ComboNewExercise,
  type ComboTransferPlan,
} from '@/lib/combo';
import { MUSCU_MIN_XP, XP_MULT } from '@/lib/athlete';
import { comboLogEntries } from '@/lib/volume';

const D1 = '2099-01-05';
const D2 = '2099-01-06';

function leg(p: Partial<ComboLeg>): ComboLeg {
  return {
    slot: 'push',
    exercise_id: 'ex_bench_barbell',
    exercise_name: 'Développé couché',
    muscle_primary: 'pectoraux',
    rep_weight: 1.6,
    target: 6,
    count_mode: 'sets',
    weight_kg: 40,
    rep_min: 4,
    rep_max: 6,
    sets: [],
    ...p,
  };
}
const combo = (legs: ComboLeg[]): ComboChallenge => ({
  id: 'c1',
  name: '360',
  start_date: D1,
  duration_days: 7,
  status: 'active',
  legs,
});
const dips = (p: Partial<ComboLeg> = {}) =>
  leg({
    exercise_id: 'ex_dips',
    exercise_name: 'Dips',
    rep_weight: 1,
    weight_kg: null,
    rep_min: 8,
    rep_max: 12,
    assistable: true,
    sets: [
      { date: D1, reps: 12, weight: null, assisted: true, at: `${D1}T07:00:00Z` },
      { date: D2, reps: 10, weight: 10, at: `${D2}T07:00:00Z` },
    ],
    ...p,
  });
const bench = (p: Partial<ComboLeg> = {}) =>
  leg({
    sets: [
      { date: D1, reps: 6, weight: 60, at: `${D1}T08:00:00Z` },
      { date: D2, reps: 5, weight: 62.5, at: `${D2}T08:00:00Z` },
    ],
    ...p,
  });
const pompes: ComboNewExercise = {
  exercise_id: 'ex_pushup',
  exercise_name: 'Pompes',
  muscle_primary: 'pectoraux',
  rep_weight: 1,
  time: false,
  assistable: true,
  rep_min: 8,
  rep_max: 12,
};

describe('valeurs proposées', () => {
  it('vers un exo présent : celles de sa DERNIÈRE série', () => {
    const p = comboTransferPlan(combo([dips(), bench()]), 'ex_dips', { leg: 'ex_bench_barbell' });
    expect(p.sets).toEqual([
      { reps: 5, weight: 62.5, assisted: false },
      { reps: 5, weight: 62.5, assisted: false },
    ]);
  });

  it('vers un exo présent sans série : le milieu de sa fourchette, sa charge mémorisée', () => {
    const c = combo([dips(), bench({ sets: [] })]);
    const p = comboTransferPlan(c, 'ex_dips', { leg: 'ex_bench_barbell' });
    expect(p.sets[0]).toEqual({ reps: 5, weight: 40, assisted: false });
  });

  it('vers un exo neuf : le milieu de sa fourchette, sans charge ni assistance', () => {
    const p = comboTransferPlan(combo([bench()]), 'ex_bench_barbell', { exercise: pompes });
    expect(p.sets[0]).toEqual({ reps: 10, weight: null, assisted: false });
  });

  it("reprend l'assistance de la dernière série de la cible si elle est assistable", () => {
    const c = combo([bench(), dips()]);
    const p = comboTransferPlan(c, 'ex_bench_barbell', { leg: 'ex_dips' });
    // Dernière série de dips : 10 reps, 10 kg, non assistée.
    expect(p.sets[0]).toEqual({ reps: 10, weight: 10, assisted: false });
    const c2 = combo([bench(), dips({ sets: [{ date: D1, reps: 9, assisted: true }] })]);
    expect(comboTransferPlan(c2, 'ex_bench_barbell', { leg: 'ex_dips' }).sets[0]!.assisted).toBe(
      true,
    );
  });

  it("en mode séries, l'objectif ne change pas", () => {
    const p = comboTransferPlan(combo([dips(), bench()]), 'ex_dips', { leg: 'ex_bench_barbell' });
    expect(p.target).toBe(6);
  });

  it("en mode reps, l'objectif passe par les séries : 60 reps à ~10 = 6 × 5 reps", () => {
    const c = combo([
      dips({ count_mode: 'reps', target: 60 }),
      bench({ count_mode: 'reps', target: 30 }),
    ]);
    expect(comboTransferPlan(c, 'ex_dips', { leg: 'ex_bench_barbell' }).target).toBe(30);
  });
});

describe('la bascule applique le plan choisi', () => {
  const c = combo([dips(), bench()]);
  const plan: ComboTransferPlan = {
    sets: [
      { reps: 4, weight: 55, assisted: true },
      { reps: 6, weight: 0, assisted: false },
    ],
    target: 6,
  };
  const legs = transferComboLeg(c, 'ex_dips', { leg: 'ex_bench_barbell' }, plan);
  const b = legs[0]!;
  const moved = legSets(b).filter((s) => s.origin);

  it('la série porte les valeurs de la cible (assistance retirée si la cible ne l’est pas)', () => {
    expect(moved.map((s) => [s.reps, s.weight, s.assisted])).toEqual([
      [4, 55, false],
      [6, null, false],
    ]);
  });

  it('et garde ses vraies valeurs dans son origine', () => {
    expect(moved.map((s) => setWork(b, s))).toEqual([
      { reps: 12, weight: null, assisted: true },
      { reps: 10, weight: 10, assisted: false },
    ]);
  });

  it("l'XP ne bouge pas, quelles que soient les valeurs corrigées", () => {
    expect(comboXpPoints([{ ...c, legs }])).toBe(comboXpPoints([c]));
  });

  it('les statistiques comptent ce qui a vraiment été fait', () => {
    const dipsSets = comboLogEntries([{ ...c, legs }])
      .flatMap((e) => e.log.exercises)
      .filter((e) => e.id === 'ex_dips')
      .flatMap((e) => e.performed);
    expect(dipsSets.map((s) => [s.reps, s.load_kg])).toEqual([
      [12, 0],
      [10, 10],
    ]);
  });

  it("l'historique montre l'exo et les vraies valeurs", () => {
    expect(setOriginLabel(b, moved[0]!)).toBe('Dips · 12 reps · assisté');
    expect(setOriginLabel(b, moved[1]!)).toBe('Dips · 10 reps · 10 kg');
    expect(setOriginLabel(b, legSets(b).find((s) => !s.origin)!)).toBeNull();
  });

  it('un plan qui ne correspond plus aux séries est refusé', () => {
    expect(() =>
      transferComboLeg(
        c,
        'ex_dips',
        { leg: 'ex_bench_barbell' },
        { sets: [...plan.sets, { reps: 5 }], target: 6 },
      ),
    ).toThrow();
  });
});

describe('en mode reps', () => {
  const c = combo([
    dips({ count_mode: 'reps', target: 60 }),
    bench({ count_mode: 'reps', target: 30 }),
  ]);
  const legs = transferComboLeg(c, 'ex_dips', { leg: 'ex_bench_barbell' });
  const b = legs[0]!;

  it("l'avancement compte les reps converties, l'objectif converti s'ajoute", () => {
    // 6 + 5 reps de développé couché, + 2 séries de dips converties à 5 reps.
    expect(legDone(b)).toBe(21);
    expect(b.target).toBe(60);
  });

  it("l'XP ne bouge pas de plus d'une série de durée", () => {
    const oneSet = COMBO_SET_MIN * MUSCU_MIN_XP * XP_MULT;
    expect(Math.abs(comboXpPoints([{ ...c, legs }]) - comboXpPoints([c]))).toBeLessThanOrEqual(
      oneSet + 1,
    );
    // Les reps et le tonnage, eux, restent exacts.
    expect(comboXpBreakdown({ ...c, legs }).reps).toBe(comboXpBreakdown(c).reps);
  });
});

it("la prime de bouclage pèse l'effort réel, pas les reps corrigées", () => {
  // Défi fini ; part de prime forcée à 1 et objectif hors d'atteinte : seul l'effort compte.
  const past = '2020-01-06';
  const c = {
    ...combo([
      dips({
        count_mode: 'reps',
        target: 500,
        sets: [
          { date: past, reps: 12 },
          { date: past, reps: 10 },
        ],
      }),
      bench({ count_mode: 'reps', target: 500, sets: [] }),
    ]),
    start_date: past,
  };
  const withReps = (r: number) => ({
    ...c,
    legs: transferComboLeg(
      c,
      'ex_dips',
      { leg: 'ex_bench_barbell' },
      {
        sets: [{ reps: r }, { reps: r }],
        target: 500,
      },
    ),
  });
  const bonus = (x: ComboChallenge) => comboTieredBonus(x, () => 1, '2030-01-01');
  expect(bonus(withReps(3))).toBeCloseTo(bonus(withReps(7)), 9);
  expect(bonus(withReps(3))).toBeCloseTo(bonus(c), 9);
});

describe('en chaîne', () => {
  it('une série convertie deux fois garde les valeurs de sa PREMIÈRE vie', () => {
    const c = combo([dips(), bench()]);
    const once = { ...c, legs: transferComboLeg(c, 'ex_dips', { leg: 'ex_bench_barbell' }) };
    const [p] = transferComboLeg(once, 'ex_bench_barbell', { exercise: pompes });
    const fromDips = legSets(p!).filter((s) => s.origin?.exercise_id === 'ex_dips');
    expect(fromDips.map((s) => setWork(p!, s).reps)).toEqual([12, 10]);
    expect(comboXpPoints([{ ...c, legs: [p!] }])).toBe(comboXpPoints([c]));
  });

  it('une série basculée avant la conversion fige ses valeurs à la seconde bascule', () => {
    const old = bench({
      sets: [
        {
          date: D1,
          reps: 12,
          weight: null,
          origin: { exercise_id: 'ex_dips', exercise_name: 'Dips', rep_weight: 1 },
        },
      ],
    });
    const c = combo([old]);
    const [p] = transferComboLeg(c, 'ex_bench_barbell', { exercise: pompes });
    const s = legSets(p!)[0]!;
    expect(s.reps).toBe(10);
    expect(setWork(p!, s)).toEqual({ reps: 12, weight: null, assisted: false });
    expect(s.origin!.exercise_id).toBe('ex_dips');
  });
});
