import { describe, it, expect } from 'vitest';
import {
  legSetsDone,
  legReps,
  legRemaining,
  legComplete,
  legDone,
  legMode,
  legUnitLabel,
  legLastReps,
  legLastWeight,
  comboComplete,
  comboProgressPct,
  comboXpPoints,
  comboXpBreakdown,
  comboCountedSets,
  comboImpliedMinutes,
  COMBO_SET_MIN,
  comboOverachievement,
  suggestComboTarget,
  suggestComboTargetFromHistory,
  suggestFullBodyPlan,
  comboMuscleInZone,
  comboEmphasis,
  objectiveToGoal,
  type ComboSlotSpec,
  buildComboSession,
  comboSessionSetBudget,
  comboSessionDurationMin,
  buildComboSessionFromCounts,
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

describe('mode séries vs reps par exo (173b322a)', () => {
  it('mode reps : legDone = total reps, complétion sur les reps', () => {
    const l = leg({ count_mode: 'reps', target: 100, sets: [set(30), set(40)] });
    expect(legMode(l)).toBe('reps');
    expect(legUnitLabel(l)).toBe('reps');
    expect(legDone(l)).toBe(70); // 30+40
    expect(legRemaining(l)).toBe(30);
    expect(legComplete(l)).toBe(false);
    const full = leg({ count_mode: 'reps', target: 100, sets: [set(60), set(50)] });
    expect(legComplete(full)).toBe(true); // 110 ≥ 100
    expect(legDone(full) - full.target).toBe(10); // dépassement en reps
  });
  it('mode sets (défaut) : legDone = nb de séries', () => {
    const l = leg({ target: 3, sets: [set(10), set(10)] });
    expect(legMode(l)).toBe('sets');
    expect(legDone(l)).toBe(2);
    expect(legRemaining(l)).toBe(1);
  });
  it('comboProgressPct : moyenne des fractions (mélange de modes OK)', () => {
    const a = leg({ target: 4, sets: [set(10), set(10)] }); // 2/4 = 50 %
    const b = leg({ slot: 'pull', exercise_id: 'b', count_mode: 'reps', target: 100, sets: [set(100)] }); // 100 %
    expect(comboProgressPct(combo([a, b]))).toBe(75); // (0.5 + 1)/2
  });
  it('buildComboSession : mode reps → assez de séries pour couvrir les reps restantes', () => {
    const c = combo([leg({ count_mode: 'reps', target: 100, exercise_id: 'a' })]);
    const s = buildComboSession(c, { minutes: 60, restSec: 60 });
    const totalReps = s[0]!.sets.reduce((x, r) => x + r, 0);
    expect(totalReps).toBeGreaterThanOrEqual(100); // couvre l'objectif de reps
  });
  it('suggestComboTargetFromHistory : reprend le target du dernier défi (converti si mode diffère)', () => {
    const past = combo([leg({ exercise_id: 'a', target: 8 })], {
      status: 'done',
      start_date: '2026-01-01',
    });
    expect(suggestComboTargetFromHistory('a', 'sets', [past])).toBe(8);
    // Conversion séries→reps (~10 reps/série).
    expect(suggestComboTargetFromHistory('a', 'reps', [past])).toBe(80);
    expect(suggestComboTargetFromHistory('zzz', 'sets', [past])).toBeNull();
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
  it('la prime de bouclage suit les reps RÉELLES par série (pas le plan figé)', () => {
    // Même nb de séries (objectif atteint), mais 2× plus de reps/série. La PORTION
    // EFFORT (reps + prime, hors durée) ne doit PAS baisser par rep (correctif 135fa252 :
    // avant, la prime était figée à COMBO_PLAN_REPS et l'XP/rep chutait). NB : la portion
    // DURÉE est par-série (comme la durée wall-clock de sessionXp) → elle dilue l'XP/rep
    // totale quand on entasse les reps, exactement comme une vraie séance. On l'exclut ici.
    const light = combo([leg({ target: 3, sets: [set(10), set(10), set(10)] })]);
    const heavy = combo([leg({ target: 3, sets: [set(20), set(20), set(20)] })]);
    expect(comboXpPoints([heavy])).toBeGreaterThan(comboXpPoints([light]));
    const effL = comboXpBreakdown(light).reps + comboXpBreakdown(light).bonus;
    const effH = comboXpBreakdown(heavy).reps + comboXpBreakdown(heavy).bonus;
    // L'effort par rep ne régresse pas : le double de reps ≈ le double d'effort-XP.
    expect(effH / 60).toBeGreaterThanOrEqual((effL / 30) * 0.98);
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

describe('terme de durée (parité avec les séances)', () => {
  it('crédite une durée façon séance ∝ séries comptées', () => {
    const c = combo([leg({ target: 3, sets: [set(10), set(10), set(10)] })]);
    expect(comboCountedSets(c)).toBe(3);
    expect(comboImpliedMinutes(c)).toBe(3 * COMBO_SET_MIN);
    expect(comboXpBreakdown(c).duration).toBeGreaterThan(0);
  });
  it('la durée est PLAFONNÉE à l’objectif (pas de farm de séries vides)', () => {
    const exact = combo([leg({ target: 2, sets: [set(10), set(10)] })]);
    const spam = combo([leg({ target: 2, sets: [set(1), set(1), set(1), set(1), set(1)] })]);
    // 5 séries mais objectif 2 → durée créditée identique (capée à 2).
    expect(comboImpliedMinutes(spam)).toBe(comboImpliedMinutes(exact));
    expect(comboXpBreakdown(spam).duration).toBe(comboXpBreakdown(exact).duration);
  });
  it('la durée domine → un 360 bouclé au poids du corps reste rentable', () => {
    // Sans le terme de durée, un 360 100 % poids du corps ne touchait quasi rien.
    const bw = combo([leg({ target: 4, sets: [set(12), set(12), set(12), set(12)] })]);
    const br = comboXpBreakdown(bw);
    expect(br.duration).toBeGreaterThan(br.reps); // la durée porte l'essentiel, comme sessionXp
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
  it('includeIds : ne garde que les exos choisis', () => {
    const s = buildComboSession(bigCombo(), { minutes: 45, restSec: 60, includeIds: ['a', 'c'] });
    expect(new Set(s.map((e) => e.exercise_id))).toEqual(new Set(['a', 'c']));
  });
  it('budget de séries DIRECT (sets) : place exactement ce nombre', () => {
    const s = buildComboSession(bigCombo(), { sets: 12, restSec: 60 });
    const total = s.reduce((a, e) => a + e.sets.length, 0);
    expect(total).toBe(12);
  });
  it('comboSessionDurationMin : durée estimée croît avec les séries et le repos', () => {
    expect(comboSessionDurationMin(12, 60)).toBeGreaterThan(comboSessionDurationMin(6, 60));
    expect(comboSessionDurationMin(12, 90)).toBeGreaterThan(comboSessionDurationMin(12, 30));
  });
  it('buildComboSessionFromCounts : nb de séries choisi PAR EXO, exclut les 0', () => {
    const s = buildComboSessionFromCounts(bigCombo(), { a: 3, b: 0, c: 5 });
    expect(s.map((e) => e.exercise_id)).toEqual(['a', 'c']); // b (0) exclu, ordre des legs
    expect(s.find((e) => e.exercise_id === 'a')!.sets.length).toBe(3);
    expect(s.find((e) => e.exercise_id === 'c')!.sets.length).toBe(5);
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

describe('suggestFullBodyPlan (volume + variété, full-body)', () => {
  const SLOTS: ComboSlotSpec[] = [
    { key: 'push', muscles: ['pectoraux'], essential: true },
    { key: 'pull', muscles: ['dos'], essential: true },
    { key: 'squat', muscles: ['quadriceps'], essential: true },
    { key: 'arms', muscles: ['biceps', 'triceps'], essential: false },
  ];
  const bySlot = (plan: ReturnType<typeof suggestFullBodyPlan>, key: string) =>
    plan.find((p) => p.slot === key)!;

  it('volume intense > modéré > léger (séries)', () => {
    const light = bySlot(suggestFullBodyPlan('intermediaire', 'light', 'med', SLOTS), 'push');
    const mod = bySlot(suggestFullBodyPlan('intermediaire', 'moderate', 'med', SLOTS), 'push');
    const hi = bySlot(suggestFullBodyPlan('intermediaire', 'intense', 'med', SLOTS), 'push');
    expect(mod.weeklySets).toBeGreaterThan(light.weeklySets);
    expect(hi.weeklySets).toBeGreaterThan(mod.weeklySets);
  });

  it('la variété PLAFONNE le nb d’exos (1/2/3) à volume suffisant', () => {
    expect(bySlot(suggestFullBodyPlan('avance', 'moderate', 'low', SLOTS), 'push').nExos).toBe(1);
    expect(bySlot(suggestFullBodyPlan('avance', 'moderate', 'med', SLOTS), 'push').nExos).toBe(2);
    expect(bySlot(suggestFullBodyPlan('avance', 'moderate', 'high', SLOTS), 'push').nExos).toBe(3);
  });

  it('le VOLUME pilote le nb d’exos (à variété égale) — pas 13 séries d’un seul exo', () => {
    const light = bySlot(suggestFullBodyPlan('avance', 'light', 'high', SLOTS), 'push');
    const intense = bySlot(suggestFullBodyPlan('avance', 'intense', 'high', SLOTS), 'push');
    expect(intense.nExos).toBeGreaterThan(light.nExos);
    // Aucun exo ne prend un volume absurde : ~≤ 7 séries/exo.
    expect(intense.setsPerExo).toBeLessThanOrEqual(7);
  });

  it('petit volume → 1 exo (reste simple)', () => {
    expect(bySlot(suggestFullBodyPlan('debutant', 'light', 'high', SLOTS), 'push').nExos).toBe(1);
  });

  it('tous les groupes essentiels sont actifs (full-body)', () => {
    const plan = suggestFullBodyPlan('intermediaire', 'moderate', 'med', SLOTS);
    for (const key of ['push', 'pull', 'squat'])
      expect(bySlot(plan, key).active).toBe(true);
  });

  it('débutant : accessoires exclus + essentiels à 1 exo suffisent', () => {
    const plan = suggestFullBodyPlan('debutant', 'moderate', 'high', SLOTS);
    expect(bySlot(plan, 'arms').active).toBe(false); // accessoire exclu pour débutant
    expect(bySlot(plan, 'push').active).toBe(true);
  });

  it('accessoire = 1 exo même en haute variété ; essentiel > accessoire (volume)', () => {
    const plan = suggestFullBodyPlan('avance', 'moderate', 'high', SLOTS);
    expect(bySlot(plan, 'arms').nExos).toBe(1);
    expect(bySlot(plan, 'push').weeklySets).toBeGreaterThan(bySlot(plan, 'arms').weeklySets);
  });

  it('avancé > débutant (volume)', () => {
    const deb = bySlot(suggestFullBodyPlan('debutant', 'moderate', 'med', SLOTS), 'push');
    const adv = bySlot(suggestFullBodyPlan('avance', 'moderate', 'med', SLOTS), 'push');
    expect(adv.weeklySets).toBeGreaterThan(deb.weeklySets);
  });

  it('séries/exo = volume réparti sur les exos', () => {
    const p = bySlot(suggestFullBodyPlan('intermediaire', 'moderate', 'med', SLOTS), 'push');
    expect(p.setsPerExo).toBe(Math.max(1, Math.round(p.weeklySets / p.nExos)));
  });
});

describe('variantFamilyKey (variantes normale/assistée exclusives)', () => {
  it('les variations d’un même mouvement partagent une clé', async () => {
    const { variantFamilyKey } = await import('@/data/combo');
    // Pompes : toutes les variations groupées.
    expect(variantFamilyKey('ex_pushup')).toBe(variantFamilyKey('ex_pushup_knees'));
    expect(variantFamilyKey('ex_pushup')).toBe(variantFamilyKey('ex_diamond_pushup'));
    expect(variantFamilyKey('ex_pushup')).toBe(variantFamilyKey('ex_pike_pushup'));
    expect(variantFamilyKey('ex_dips')).toBe(variantFamilyKey('ex_dips_assisted'));
    expect(variantFamilyKey('ex_pullup')).toBe(variantFamilyKey('ex_pullup_assisted'));
    // Squat et rowing : variations chargées / poids du corps / élastique groupées.
    expect(variantFamilyKey('ex_squat_barbell')).toBe(variantFamilyKey('ex_bw_squat'));
    expect(variantFamilyKey('ex_row_barbell')).toBe(variantFamilyKey('ex_band_row'));
    expect(variantFamilyKey('ex_curl_barbell')).toBe(variantFamilyKey('ex_curl_dumbbell'));
  });
  it('des mouvements différents ont des clés différentes', async () => {
    const { variantFamilyKey } = await import('@/data/combo');
    expect(variantFamilyKey('ex_pushup')).not.toBe(variantFamilyKey('ex_dips'));
    expect(variantFamilyKey('ex_squat_barbell')).not.toBe(variantFamilyKey('ex_row_barbell'));
    expect(variantFamilyKey('ex_plank')).toBe('ex_plank'); // gainage : sans variante
  });
});

describe('comboEmphasis / objectiveToGoal (objectif + sports)', () => {
  it('objectiveToGoal : force/endurance→perf, remise→balanced, reste→sculpt', () => {
    expect(objectiveToGoal('force')).toBe('perf');
    expect(objectiveToGoal('endurance')).toBe('perf');
    expect(objectiveToGoal('remise_en_forme')).toBe('balanced');
    expect(objectiveToGoal('hypertrophie')).toBe('sculpt');
    expect(objectiveToGoal('perte_de_gras')).toBe('sculpt');
    expect(objectiveToGoal(null)).toBe('sculpt');
  });

  it('sculpt : haut/bras boostés, squat allégé', () => {
    const e = comboEmphasis('sculpt');
    expect(e.arms!).toBeGreaterThan(1);
    expect(e.push!).toBeGreaterThan(1);
    expect(e.squat!).toBeLessThan(1);
  });

  it('perf : chaîne postérieure/gainage boostés, bras allégés', () => {
    const e = comboEmphasis('perf');
    expect(e.hinge!).toBeGreaterThan(1);
    expect(e.core!).toBeGreaterThan(1);
    expect(e.arms!).toBeLessThan(1);
  });

  it('balanced sans sport = tout neutre (1)', () => {
    const e = comboEmphasis('balanced');
    for (const k of ['push', 'pull', 'squat', 'hinge', 'core', 'arms', 'shoulders'])
      expect(e[k]!).toBe(1);
  });

  it('sports d’endurance allègent les jambes (course = quads/ischios/mollets)', () => {
    const base = comboEmphasis('balanced');
    const withRun = comboEmphasis('balanced', [
      { name: 'Course', sessions_per_week: 3, intensity: 'elevee' },
    ]);
    expect(withRun.squat!).toBeLessThan(base.squat!);
    expect(withRun.hinge!).toBeLessThan(base.hinge!);
    // Le haut du corps n'est pas touché par la course.
    expect(withRun.push!).toBe(base.push!);
  });

  it('muscles prioritaires : boost le groupe correspondant', () => {
    const base = comboEmphasis('balanced');
    const withPrio = comboEmphasis('balanced', null, ['pectoraux']);
    expect(withPrio.push!).toBeGreaterThan(base.push!);
  });

  it('bornage [0.6, 1.45] même avec sport intense cumulé', () => {
    const e = comboEmphasis('perf', [
      { name: 'Trail', sessions_per_week: 6, intensity: 'elevee' },
      { name: 'Course', sessions_per_week: 6, intensity: 'elevee' },
    ]);
    for (const k of Object.keys(e)) {
      expect(e[k]!).toBeGreaterThanOrEqual(0.6);
      expect(e[k]!).toBeLessThanOrEqual(1.45);
    }
  });

  it('emphasis appliqué au plan : sculpt donne plus de volume aux bras que perf', () => {
    const SLOTS: ComboSlotSpec[] = [
      { key: 'squat', muscles: ['quadriceps'], essential: true },
      { key: 'arms', muscles: ['biceps', 'triceps'], essential: true },
    ];
    const bySlot = (plan: ReturnType<typeof suggestFullBodyPlan>, key: string) =>
      plan.find((p) => p.slot === key)!;
    const sculpt = suggestFullBodyPlan('avance', 'moderate', 'med', SLOTS, comboEmphasis('sculpt'));
    const perf = suggestFullBodyPlan('avance', 'moderate', 'med', SLOTS, comboEmphasis('perf'));
    expect(bySlot(sculpt, 'arms').weeklySets).toBeGreaterThan(bySlot(perf, 'arms').weeklySets);
    // Plancher : jamais moins de 3 séries.
    expect(bySlot(sculpt, 'squat').weeklySets).toBeGreaterThanOrEqual(3);
  });
});

describe('comboMuscleInZone (haut / bas / tronc)', () => {
  it('full : tout passe', () => {
    expect(comboMuscleInZone('quadriceps', 'full')).toBe(true);
    expect(comboMuscleInZone('pectoraux', 'full')).toBe(true);
  });
  it('haut : garde le haut + le tronc, exclut le bas', () => {
    expect(comboMuscleInZone('pectoraux', 'haut')).toBe(true);
    expect(comboMuscleInZone('épaules', 'haut')).toBe(true);
    expect(comboMuscleInZone('abdominaux', 'haut')).toBe(true); // tronc
    expect(comboMuscleInZone('quadriceps', 'haut')).toBe(false);
    expect(comboMuscleInZone('mollets', 'haut')).toBe(false);
  });
  it('bas : garde le bas + le tronc, exclut le haut', () => {
    expect(comboMuscleInZone('quadriceps', 'bas')).toBe(true);
    expect(comboMuscleInZone('mollets', 'bas')).toBe(true);
    expect(comboMuscleInZone('abdominaux', 'bas')).toBe(true); // tronc
    expect(comboMuscleInZone('pectoraux', 'bas')).toBe(false);
    expect(comboMuscleInZone('épaules', 'bas')).toBe(false);
  });
});
