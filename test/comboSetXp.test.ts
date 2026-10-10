import { describe, it, expect } from 'vitest';
import {
  comboXpPoints,
  comboXpBreakdown,
  comboXpByExoDay,
  comboBonusXp,
  repsEquivalent,
  COMBO_PLAN_REPS,
  type ComboChallenge,
  type ComboLeg,
} from '@/lib/combo';
import { BODYWEIGHT_SHARE, bodyweightLoad } from '@/lib/bodyweightLoad';
import { repWeightFromExercise } from '@/lib/challenges';

// Un 360 d'UN exo, `k` séries identiques, encore en cours (aucune prime versée).
function combo(
  exercise_id: string,
  reps: number,
  k: number,
  opts: Partial<ComboLeg> = {},
  weight: number | null = null,
): ComboChallenge {
  const leg = {
    slot: 'push',
    exercise_id,
    exercise_name: exercise_id,
    rep_weight: 1,
    target: 10,
    count_mode: 'sets',
    sets: Array.from({ length: k }, () => ({ date: '2026-10-08', reps, weight, assisted: false })),
    ...opts,
  } as ComboLeg;
  return {
    id: 'c',
    user_id: 'u',
    status: 'active',
    start_date: '2026-10-05',
    duration_days: 7,
    legs: [leg],
    config: {},
  } as unknown as ComboChallenge;
}
/** XP d'une série de plus. */
const oneSet = (id: string, reps: number, opts: Partial<ComboLeg> = {}, kg?: number, w: number | null = null) =>
  comboXpPoints([combo(id, reps, 2, opts, w)], kg) - comboXpPoints([combo(id, reps, 1, opts, w)], kg);

describe('💪 équivalent-reps : une série dure à reps basses n’est plus écrasée', () => {
  it('10 reps valent 10, moins compte plus, plus compte moins que proportionnellement', () => {
    expect(repsEquivalent(COMBO_PLAN_REPS)).toBeCloseTo(COMBO_PLAN_REPS);
    expect(repsEquivalent(6)).toBeGreaterThan(6);
    expect(repsEquivalent(20)).toBeLessThan(20);
    expect(repsEquivalent(20)).toBeGreaterThan(repsEquivalent(10)); // faire plus paie encore
    expect(repsEquivalent(0)).toBe(0);
    expect(repsEquivalent(-3)).toBe(0);
  });

  it('6 tractions et 20 ponts fessiers ne sont plus à un facteur 3 sur la part reps', () => {
    const ratio = repsEquivalent(20) / repsEquivalent(6);
    expect(ratio).toBeLessThan(2); // c'était 20/6 = 3,3
  });

  it('un exo au TEMPS garde ses secondes telles quelles (pas de racine)', () => {
    // 120 s × REP_XP (0,2) × poids 1 × XP_MULT (2) = 48 : barème linéaire, inchangé.
    const c = combo('ex_plank', 120, 1, { count_mode: 'time', target: 600 });
    expect(comboXpBreakdown(c).reps).toBe(48);
  });
});

describe('🏋️ charge du poids du corps dans le tonnage', () => {
  it('une traction porte tout le corps, un exo non listé rien', () => {
    expect(bodyweightLoad('ex_pullup', 80)).toBe(80);
    expect(bodyweightLoad('ex_pushup', 80)).toBeCloseTo(52);
    expect(bodyweightLoad('ex_row_barbell', 80)).toBe(0);
    expect(bodyweightLoad('ex_pullup', null)).toBe(0);
    expect(bodyweightLoad('ex_pullup', 80, 0.6)).toBeCloseTo(48);
  });

  it('les variantes assistées portent moins que leur version libre', () => {
    expect(BODYWEIGHT_SHARE.ex_pullup_assisted!).toBeLessThan(BODYWEIGHT_SHARE.ex_pullup!);
    expect(BODYWEIGHT_SHARE.ex_dips_assisted!).toBeLessThan(BODYWEIGHT_SHARE.ex_dips!);
  });

  it('avec le poids du joueur, une série de tractions rapporte plus ; sans, rien ne change', () => {
    expect(oneSet('ex_pullup', 6, {}, 80)).toBeGreaterThan(oneSet('ex_pullup', 6));
    expect(oneSet('ex_row_barbell', 12, {}, 80, 60)).toBe(oneSet('ex_row_barbell', 12, {}, undefined, 60));
  });

  it('le lest s’ajoute au poids du corps', () => {
    expect(oneSet('ex_pullup', 6, {}, 80, 10)).toBeGreaterThan(oneSet('ex_pullup', 6, {}, 80));
  });
});

describe('🎯 tractions et dips valent un vrai polyarticulaire', () => {
  it('3 muscles → poids de rep 1,3 ; à l’élastique 0,78', () => {
    expect(repWeightFromExercise(['biceps', 'avant-bras'], ['pullup_bar'], 'Tractions')).toBe(1.3);
    expect(repWeightFromExercise(['triceps', 'épaules'], ['dip_station'], 'Dips')).toBe(1.3);
    expect(repWeightFromExercise(['biceps', 'avant-bras'], ['pullup_bar', 'bands'], 'Tractions assistées (élastique)')).toBe(0.78);
  });

  it('une série de 6 tractions vaut au moins autant que 20 ponts fessiers', () => {
    const pull = oneSet('ex_pullup', 6, { rep_weight: 1.3 }, 80);
    const bridge = oneSet('ex_glute_bridge', 20, { rep_weight: 1 }, 80);
    expect(pull).toBeGreaterThanOrEqual(bridge);
  });
});

describe('📅 l’XP par exo et par jour (Agenda) = l’XP du défi hors prime', () => {
  it('une série de 6 tractions s’affiche à son vrai gain (~25 XP, plus jamais 1)', () => {
    const [g] = comboXpByExoDay(combo('ex_pullup', 6, 1, { rep_weight: 1.3 }), 80);
    expect(g!.xp).toBe(comboXpPoints([combo('ex_pullup', 6, 1, { rep_weight: 1.3 })], 80));
    expect(g!.xp).toBeGreaterThan(20);
  });

  it('la somme des lignes vaut le total moins la prime, sur un 360 varié et plusieurs jours', () => {
    const c = combo('ex_pullup', 6, 0) as ComboChallenge;
    c.legs = [
      { ...c.legs[0]!, sets: [6, 5, 7, 6, 5].map((r, i) => ({ date: `2026-10-0${5 + (i % 3)}`, reps: r, weight: null })) },
      {
        ...c.legs[0]!,
        exercise_id: 'ex_row_barbell',
        exercise_name: 'Rowing',
        rep_weight: 1.25,
        target: 3,
        sets: [12, 12, 10, 8].map((r) => ({ date: '2026-10-06', reps: r, weight: 60 })),
      },
      {
        ...c.legs[0]!,
        exercise_id: 'ex_pushup',
        exercise_name: 'Pompes',
        count_mode: 'reps',
        target: 50,
        sets: [20, 18, 15].map((r) => ({ date: '2026-10-07', reps: r, weight: null })),
      },
      {
        ...c.legs[0]!,
        exercise_id: 'ex_plank',
        exercise_name: 'Gainage',
        count_mode: 'time',
        target: 180,
        rep_weight: 0.6,
        sets: [60, 90, 75].map((r) => ({ date: '2026-10-05', reps: r, weight: null })),
      },
    ];
    const lines = comboXpByExoDay(c, 80);
    const sum = lines.reduce((a, l) => a + l.xp, 0);
    const total = comboXpPoints([c], 80) - comboBonusXp(c);
    expect(Math.abs(sum - total)).toBeLessThanOrEqual(lines.length); // arrondi par ligne
    // Une ligne par (exo, jour).
    expect(new Set(lines.map((l) => l.exerciseId + l.date)).size).toBe(lines.length);
  });

  it('au-delà de l’objectif, une série ne rapporte plus la durée (même plafond que le total)', () => {
    const c = combo('ex_pullup', 6, 4, { target: 2 });
    c.legs[0]!.sets = c.legs[0]!.sets!.map((s, i) => ({ ...s, date: i < 2 ? '2026-10-06' : '2026-10-07' }));
    const [a, b] = comboXpByExoDay(c).sort((x, y) => x.date.localeCompare(y.date));
    expect(a!.xp).toBeGreaterThan(b!.xp * 3);
  });
});
