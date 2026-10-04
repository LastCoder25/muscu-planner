// Changer d'exo en cours de Défi 360 : l'exo quitté disparaît, son objectif ET ses
// séries déjà faites basculent sur la cible, qui garde la trace de leur origine.
import { describe, it, expect } from 'vitest';
import {
  transferComboLeg,
  comboTransferBlocker,
  comboXpPoints,
  comboTieredBonus,
  legSets,
  legDone,
  legTierMarks,
  legLastWeight,
  legLastReps,
  setOrigin,
  COMBO_PLAN_REPS,
  type ComboChallenge,
  type ComboLeg,
  type ComboNewExercise,
} from '@/lib/combo';
import { comboLogEntries } from '@/lib/volume';
import { doneVolume } from '@/lib/bodyBalance';

// Des dates lointaines : le défi n'est jamais « fini », donc la prime de bouclage (versée à
// la fin) ne se mêle pas à la comparaison d'XP.
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
    sets: [],
    ...p,
  };
}
function combo(legs: ComboLeg[], status: ComboChallenge['status'] = 'active'): ComboChallenge {
  return { id: 'c1', name: '360', start_date: D1, duration_days: 7, status, legs };
}
const bench = () =>
  leg({
    sets: [
      { date: D1, reps: 10, weight: 40, at: `${D1}T08:00:00Z` },
      // Sans charge propre : le tonnage reprenait la charge mémorisée de l'exo (40 kg).
      { date: D2, reps: 8, weight: null, at: `${D2}T08:00:00Z` },
    ],
  });
const dips = () =>
  leg({
    exercise_id: 'ex_dips',
    exercise_name: 'Dips',
    rep_weight: 1,
    weight_kg: null,
    sets: [
      { date: D1, reps: 12, weight: null, at: `${D1}T07:00:00Z` },
      { date: D1, reps: 11, weight: null, at: `${D1}T09:00:00Z` },
      { date: D2, reps: 10, weight: null, at: `${D2}T07:00:00Z` },
    ],
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

describe('vers un exo déjà présent du même groupe', () => {
  const c = combo([bench(), dips()]);
  const legs = transferComboLeg(c, 'ex_bench_barbell', { leg: 'ex_dips' });
  const d = legs.find((l) => l.exercise_id === 'ex_dips')!;

  it("l'exo quitté disparaît, la cible prend son objectif et ses séries", () => {
    expect(legs.map((l) => l.exercise_id)).toEqual(['ex_dips']);
    expect(d.target).toBe(12);
    expect(legDone(d)).toBe(5);
  });

  it("les séries basculées gardent leur origine, celles de la cible n'en ont pas", () => {
    const moved = legSets(d).filter((s) => s.origin);
    expect(moved).toHaveLength(2);
    expect(moved.every((s) => s.origin!.exercise_id === 'ex_bench_barbell')).toBe(true);
    expect(moved[0]!.origin!.rep_weight).toBe(1.6);
    expect(moved[0]!.origin!.weight_kg).toBe(40);
    expect(legSets(d).filter((s) => !s.origin)).toHaveLength(3);
  });

  it("les séries fusionnées se lisent dans l'ordre où elles ont été faites", () => {
    expect(legSets(d).map((s) => s.at)).toEqual([
      `${D1}T07:00:00Z`,
      `${D1}T08:00:00Z`,
      `${D1}T09:00:00Z`,
      `${D2}T07:00:00Z`,
      `${D2}T08:00:00Z`,
    ]);
  });

  it("l'XP déjà gagnée ne bouge pas d'un point", () => {
    expect(comboXpPoints([{ ...c, legs }])).toBe(comboXpPoints([c]));
  });

  it("les paliers sont recalculés sur l'objectif fusionné", () => {
    expect(legTierMarks(d)).toEqual({ sec: 10, principal: 12 });
  });

  it("le défi d'origine n'est pas modifié", () => {
    expect(c.legs).toHaveLength(2);
    expect(legSets(c.legs[1]!)).toHaveLength(3);
  });
});

describe('vers un exo neuf', () => {
  const c = combo([bench(), dips()]);
  const legs = transferComboLeg(c, 'ex_bench_barbell', { exercise: pompes });
  const p = legs[0]!;

  it("il prend la place de l'exo quitté, avec son objectif et ses séries", () => {
    expect(legs.map((l) => l.exercise_id)).toEqual(['ex_pushup', 'ex_dips']);
    expect(p).toMatchObject({ slot: 'push', target: 6, count_mode: 'sets', rep_weight: 1 });
    expect(legDone(p)).toBe(2);
    expect(legSets(p).every((s) => s.origin?.exercise_id === 'ex_bench_barbell')).toBe(true);
  });

  it("l'XP ne bouge pas, et la charge proposée ne vient pas de l'ancien exo", () => {
    expect(comboXpPoints([{ ...c, legs }])).toBe(comboXpPoints([c]));
    expect(p.weight_kg).toBeNull();
    expect(legLastWeight(p)).toBeNull();
    expect(legLastReps(p)).toBe(COMBO_PLAN_REPS);
  });

  it('on peut passer à une variante du même mouvement (dips → dips assistés)', () => {
    const assist = { ...pompes, exercise_id: 'ex_dips_assisted', exercise_name: 'Dips assistés' };
    expect(comboTransferBlocker(c, 'ex_dips', { exercise: assist })).toBeNull();
  });
});

it('en chaîne, une série garde sa VRAIE origine', () => {
  const c = combo([bench(), dips()]);
  const once = { ...c, legs: transferComboLeg(c, 'ex_bench_barbell', { leg: 'ex_dips' }) };
  const twice = transferComboLeg(once, 'ex_dips', { exercise: pompes });
  const origins = legSets(twice[0]!).map((s) => setOrigin(twice[0]!, s).exercise_id);
  expect(origins.filter((o) => o === 'ex_bench_barbell')).toHaveLength(2);
  expect(origins.filter((o) => o === 'ex_dips')).toHaveLength(3);
  expect(comboXpPoints([{ ...c, legs: twice }])).toBe(comboXpPoints([c]));
});

it('la prime de bouclage pèse chaque série au poids de rep de SON exo', () => {
  // Défi fini (dates passées) et bouclé → la prime est versée.
  const past = '2020-01-06';
  const full = (p: Partial<ComboLeg>, n: number) =>
    leg({ ...p, target: n, sets: Array.from({ length: n }, () => ({ date: past, reps: 10 })) });
  const c = {
    ...combo([
      full({}, 2),
      full({ exercise_id: 'ex_dips', exercise_name: 'Dips', rep_weight: 1 }, 2),
    ]),
    start_date: past,
  };
  const merged = { ...c, legs: transferComboLeg(c, 'ex_bench_barbell', { leg: 'ex_dips' }) };
  const stripped = {
    ...merged,
    legs: merged.legs.map((l) => ({
      ...l,
      sets: legSets(l).map((s) => ({ date: s.date, reps: s.reps })),
    })),
  };
  expect(comboTieredBonus(merged, undefined, '2030-01-01')).toBeGreaterThan(
    comboTieredBonus(stripped, undefined, '2030-01-01'),
  );
});

describe('les lecteurs lisent l’exo d’origine', () => {
  const c = combo([bench(), dips()]);
  const merged = { ...c, legs: transferComboLeg(c, 'ex_bench_barbell', { leg: 'ex_dips' }) };

  it('les séances synthétiques (stats) rangent la série sous son exo', () => {
    const exos = comboLogEntries([merged]).flatMap((e) => e.log.exercises);
    const benchSets = exos
      .filter((e) => e.id === 'ex_bench_barbell')
      .reduce((a, e) => a + e.performed.length, 0);
    expect(benchSets).toBe(2);
  });

  it("l'équilibre du corps la crédite à son exo", () => {
    const v = doneVolume(
      {
        sessions: [],
        combos: [merged],
        challenges: [],
        bossHits: [],
        secondaries: () => undefined,
        primaries: () => undefined,
      },
      D1,
      '2099-01-12',
    );
    expect(v.byExercise.find((e) => e.id === 'ex_bench_barbell')?.sets).toBe(2);
    expect(v.byExercise.find((e) => e.id === 'ex_dips')?.sets).toBe(3);
  });
});

describe('refus', () => {
  const c = combo([
    bench(),
    dips(),
    leg({
      slot: 'pull',
      exercise_id: 'ex_pullup',
      exercise_name: 'Tractions',
      muscle_primary: 'dos',
    }),
    leg({
      slot: 'push',
      exercise_id: 'ex_plank',
      exercise_name: 'Planche',
      count_mode: 'time',
      target: 240,
    }),
  ]);

  it('un défi qui n’est plus en cours', () => {
    expect(
      comboTransferBlocker(combo([bench(), dips()], 'done'), 'ex_bench_barbell', {
        leg: 'ex_dips',
      }),
    ).toBe('notActive');
  });
  it('un autre groupe musculaire', () => {
    expect(comboTransferBlocker(c, 'ex_bench_barbell', { leg: 'ex_pullup' })).toBe('otherSlot');
    expect(
      comboTransferBlocker(c, 'ex_bench_barbell', {
        exercise: { ...pompes, exercise_id: 'ex_row_dumbbell', muscle_primary: 'dos' },
      }),
    ).toBe('otherSlot');
  });
  it('deux exos qui ne se comptent pas pareil', () => {
    expect(comboTransferBlocker(c, 'ex_bench_barbell', { leg: 'ex_plank' })).toBe('modeMismatch');
    expect(
      comboTransferBlocker(c, 'ex_bench_barbell', { exercise: { ...pompes, time: true } }),
    ).toBe('modeMismatch');
  });
  it('un mouvement déjà présent ailleurs dans le défi', () => {
    const assist = { ...pompes, exercise_id: 'ex_dips_assisted' };
    expect(comboTransferBlocker(c, 'ex_bench_barbell', { exercise: assist })).toBe('alreadyIn');
  });
  it('vers lui-même, ou un exo absent', () => {
    expect(comboTransferBlocker(c, 'ex_bench_barbell', { leg: 'ex_bench_barbell' })).toBe(
      'sameLeg',
    );
    expect(comboTransferBlocker(c, 'ex_bench_barbell', { leg: 'ex_nope' })).toBe('noLeg');
    expect(comboTransferBlocker(c, 'ex_nope', { leg: 'ex_dips' })).toBe('noLeg');
  });
  it('transferComboLeg refuse ce que le blocage refuse', () => {
    expect(() => transferComboLeg(c, 'ex_bench_barbell', { leg: 'ex_pullup' })).toThrow();
  });
});

describe('les jambes entre elles : Squat ↔ Charnière', () => {
  const squats = leg({
    slot: 'squat',
    exercise_id: 'ex_squat_jump',
    exercise_name: 'Squats sautés',
    muscle_primary: 'quadriceps',
    rep_weight: 1,
    weight_kg: null,
    sets: [{ date: D1, reps: 15 }],
  });
  const rdl = leg({
    slot: 'hinge',
    exercise_id: 'ex_romanian_deadlift',
    exercise_name: 'Soulevé de terre roumain',
    muscle_primary: 'ischio-jambiers',
  });
  const neuf: ComboNewExercise = {
    ...pompes,
    exercise_id: 'ex_deadlift',
    exercise_name: 'Soulevé de terre',
    muscle_primary: 'ischio-jambiers',
    rep_weight: 1.6,
  };

  it('des squats peuvent passer sur un soulevé de terre roumain déjà présent', () => {
    const c = combo([squats, rdl]);
    expect(comboTransferBlocker(c, 'ex_squat_jump', { leg: 'ex_romanian_deadlift' })).toBeNull();
    const legs = transferComboLeg(c, 'ex_squat_jump', { leg: 'ex_romanian_deadlift' });
    expect(legs).toHaveLength(1);
    expect(legs[0]!.slot).toBe('hinge');
    expect(legs[0]!.target).toBe(12);
  });

  it('…ou sur un exo neuf de la Charnière, posé dans la Charnière', () => {
    const c = combo([squats]);
    expect(comboTransferBlocker(c, 'ex_squat_jump', { exercise: neuf })).toBeNull();
    const [l] = transferComboLeg(c, 'ex_squat_jump', { exercise: neuf });
    expect(l).toMatchObject({ slot: 'hinge', exercise_id: 'ex_deadlift' });
    // La série faite en squats sautés reste une série de squats sautés.
    expect(setOrigin(l!, legSets(l!)[0]!).muscle_primary).toBe('quadriceps');
  });

  it('et dans l’autre sens', () => {
    const c = combo([rdl, squats]);
    expect(comboTransferBlocker(c, 'ex_romanian_deadlift', { leg: 'ex_squat_jump' })).toBeNull();
  });

  it('le haut du corps reste fermé : ni Poussée ↔ Tirage, ni jambes ↔ Poussée', () => {
    const c = combo([bench(), squats]);
    expect(comboTransferBlocker(c, 'ex_bench_barbell', { leg: 'ex_squat_jump' })).toBe('otherSlot');
    expect(comboTransferBlocker(c, 'ex_squat_jump', { leg: 'ex_bench_barbell' })).toBe('otherSlot');
    expect(comboTransferBlocker(c, 'ex_squat_jump', { exercise: pompes })).toBe('otherSlot');
  });
});
