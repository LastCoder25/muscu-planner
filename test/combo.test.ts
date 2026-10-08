import { describe, it, expect } from 'vitest';
import {
  legSetsDone,
  removeSetAt,
  updateSetAt,
  comboStopPlan,
  comboPace,
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
  fmtPct,
  comboXpPoints,
  comboXpBreakdown,
  comboCountedSets,
  comboImpliedMinutes,
  COMBO_SET_MIN,
  legTier,
  legTierMarks,
  legSegZone,
  legBarGeometry,
  legTierShare,
  comboTieredBonus,
  comboBonusXp,
  comboXpByDay,
  suggestComboTargetFromHistory,
  suggestFullBodyPlan,
  comboMuscleInZone,
  comboEmphasis,
  objectiveToGoal,
  type ComboSlotSpec,
  comboSessionDurationMin,
  buildComboSessionFromCounts,
  comboSessionSteps,
  legSets,
  legRepRange,
  type ComboChallenge,
  type ComboLeg,
  type ComboSet,
  comboEnded,
  comboNextStatus,
  comboClosed,
  comboChestEligible,
  comboCompleteInTime,
  comboEndDate,
  legsByGroup,
  legStage,
  comboBarParts,
  comboBarSegments,
  filterLegsByZone,
  legSegNumbers,
  legBarZone,
  NO_PACE,
  comboWeeklySets,
  transferSlotFor,
} from '@/lib/combo';
import { COMBO_SLOTS, comboSlot, comboSlotRank } from '@/data/combo';

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
  it('mode durée (gainage) : legDone = total SECONDES, unité « sec »', () => {
    const l = leg({ count_mode: 'time', target: 120, sets: [set(40), set(45)] });
    expect(legMode(l)).toBe('time');
    expect(legUnitLabel(l)).toBe('sec');
    expect(legDone(l)).toBe(85); // 40+45 secondes
    expect(legRemaining(l)).toBe(35);
    expect(legComplete(l)).toBe(false);
    const full = leg({ count_mode: 'time', target: 120, sets: [set(60), set(70)] });
    expect(legComplete(full)).toBe(true); // 130 ≥ 120 s
  });
  it('mode sets (défaut) : legDone = nb de séries', () => {
    const l = leg({ target: 3, sets: [set(10), set(10)] });
    expect(legMode(l)).toBe('sets');
    expect(legDone(l)).toBe(2);
    expect(legRemaining(l)).toBe(1);
  });
  it('comboProgressPct : moyenne des fractions (mélange de modes OK)', () => {
    const a = leg({ target: 4, sets: [set(10), set(10)] }); // 2/4 = 50 %
    const b = leg({
      slot: 'pull',
      exercise_id: 'b',
      count_mode: 'reps',
      target: 100,
      sets: [set(100)],
    }); // 100 %
    expect(comboProgressPct(combo([a, b]))).toBe(75); // (0.5 + 1)/2
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
    // (1 + 1/3) / 2 = 66,67 % → au dixième près (demandé : le % exact)
    expect(comboProgressPct(combo([done, notDone]))).toBe(66.7);
  });
  it('le % ne ment jamais aux bornes : incomplet < 100, entamé > 0', () => {
    // 1999/2000 sur un exo : 99,95 % s’arrondirait à 100 alors que rien n’est bouclé.
    const presque = leg({ count_mode: 'reps', target: 2000, sets: [set(1999)] });
    expect(comboComplete(combo([presque]))).toBe(false);
    expect(comboProgressPct(combo([presque]))).toBe(99.9);
    // 1/3000 : 0,03 % s’arrondirait à 0 alors qu’on a commencé.
    const debut = leg({ count_mode: 'reps', target: 3000, sets: [set(1)] });
    expect(comboProgressPct(combo([debut]))).toBe(0.1);
    // Les vraies bornes restent exactes.
    const fini = leg({ target: 2, sets: [set(10), set(10)] });
    expect(comboProgressPct(combo([fini]))).toBe(100);
    expect(comboProgressPct(combo([leg({ target: 2, sets: [] })]))).toBe(0);
  });
  it('fmtPct : décimale seulement si besoin, virgule française', () => {
    expect(fmtPct(75)).toBe('75');
    expect(fmtPct(66.7)).toBe('66,7');
    expect(fmtPct(12.04)).toBe('12');
    expect(fmtPct(0.1)).toBe('0,1');
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
  it('une série au-delà de l’objectif (360 d’avant la v1.53) ne rapporte que ses reps', () => {
    const exact = combo([leg({ target: 2, sets: [set(10), set(10)] })]);
    const over = combo([leg({ target: 2, sets: [set(10), set(10), set(10), set(10)] })]);
    // 2 séries de 10 reps × REP_XP 0,2 × XP_MULT 2 = 8 pts : ni durée, ni prime en plus.
    expect(comboXpPoints([over]) - comboXpPoints([exact])).toBe(8);
  });
});

describe('terme de durée (parité avec les séances)', () => {
  it('crédite une durée façon séance ∝ séries comptées', () => {
    const c = combo([leg({ target: 3, sets: [set(10), set(10), set(10)] })]);
    expect(comboCountedSets(c)).toBe(3);
    expect(comboImpliedMinutes(c)).toBe(3 * COMBO_SET_MIN);
    expect(comboXpBreakdown(c).duration).toBeGreaterThan(0);
  });
  it('la durée est plafonnée à l’objectif (v1.53 : plus de palier maximal)', () => {
    const exact = combo([leg({ target: 2, sets: [set(10), set(10)] })]);
    const over = combo([leg({ target: 2, sets: [set(10), set(10), set(10)] })]);
    expect(comboImpliedMinutes(over)).toBe(comboImpliedMinutes(exact));
    expect(comboXpBreakdown(over).duration).toBe(comboXpBreakdown(exact).duration);
  });
  it('en mode REPS aussi, la durée s’arrête à l’objectif', () => {
    const r = (reps: number) => combo([leg({ count_mode: 'reps', target: 20, sets: [set(reps)] })]);
    expect(comboCountedSets(r(30))).toBe(comboCountedSets(r(20)));
  });
  it('la durée domine → un 360 bouclé au poids du corps reste rentable', () => {
    // Sans le terme de durée, un 360 100 % poids du corps ne touchait quasi rien.
    const bw = combo([leg({ target: 4, sets: [set(12), set(12), set(12), set(12)] })]);
    const br = comboXpBreakdown(bw);
    expect(br.duration).toBeGreaterThan(br.reps); // la durée porte l'essentiel, comme sessionXp
  });
});

describe('paliers du Défi 360 (secondaire 80 % / objectif 100 %)', () => {
  const l10 = (reps: number) => leg({ count_mode: 'reps', target: 10, sets: [set(reps)] });
  it('palier atteint selon fait/cible — plus de palier au-delà de l’objectif', () => {
    expect(legTier(l10(7))).toBe('none'); // < 80 %
    expect(legTier(l10(8))).toBe('secondary'); // 80 %
    expect(legTier(l10(10))).toBe('principal'); // 100 %
    expect(legTier(l10(12))).toBe('principal'); // 120 % : rien de plus qu'à 100 %
  });
  it('parts cumulées 15 / 100 % — l’objectif paie la prime entière, pas plus', () => {
    expect(legTierShare(l10(7))).toBe(0);
    expect(legTierShare(l10(8))).toBeCloseTo(0.15);
    expect(legTierShare(l10(10))).toBe(1);
    expect(legTierShare(l10(13))).toBe(1);
  });
  it('le détail de l’XP n’a plus de part « dépassement » : reps + durée + prime = total', () => {
    const b = comboXpBreakdown(
      combo([leg({ target: 10, sets: Array.from({ length: 12 }, () => set(10)) })]),
    );
    expect(b).not.toHaveProperty('surpass');
    expect(b.total).toBe(b.reps + b.duration + b.bonus);
  });
  it('bouclage PARTIEL rapporte désormais une prime (fini le tout-ou-rien)', () => {
    // Un exo au principal + un seulement au secondaire → prime > 0 (avant : 0 si non complet).
    const partial = combo([
      leg({ slot: 'push', exercise_id: 'a', count_mode: 'reps', target: 10, sets: [set(10)] }),
      leg({ slot: 'pull', exercise_id: 'b', count_mode: 'reps', target: 10, sets: [set(8)] }),
    ]);
    expect(comboTieredBonus(partial)).toBeGreaterThan(0);
    // Atteindre le principal rapporte plus que rester au secondaire (même exo).
    expect(comboTieredBonus(combo([l10(10)]))).toBeGreaterThan(comboTieredBonus(combo([l10(8)])));
  });
});

describe('séance générée (séries choisies par exo)', () => {
  const bigCombo = () =>
    combo([
      leg({ slot: 'push', exercise_id: 'a', target: 40 }),
      leg({ slot: 'pull', exercise_id: 'b', target: 40 }),
      leg({ slot: 'squat', exercise_id: 'c', target: 40 }),
    ]);
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

describe('suggestFullBodyPlan (volume + variété, full-body)', () => {
  const SLOTS: ComboSlotSpec[] = [
    { key: 'push', muscles: ['pectoraux'], essential: true },
    { key: 'pull', muscles: ['dos'], essential: true },
    { key: 'squat', muscles: ['quadriceps'], essential: true },
    { key: 'biceps', muscles: ['biceps'], essential: false },
    { key: 'triceps', muscles: ['triceps'], essential: false },
    { key: 'shoulders', muscles: ['epaules'], essential: false },
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
    for (const key of ['push', 'pull', 'squat']) expect(bySlot(plan, key).active).toBe(true);
  });

  it('débutant : biceps ET triceps toujours proposés, les autres accessoires exclus', () => {
    const plan = suggestFullBodyPlan('debutant', 'moderate', 'high', SLOTS);
    expect(bySlot(plan, 'biceps').active).toBe(true); // bras TOUJOURS proposés (ticket adbc5ff4)
    expect(bySlot(plan, 'triceps').active).toBe(true);
    expect(bySlot(plan, 'shoulders').active).toBe(false); // autre accessoire exclu en débutant
    expect(bySlot(plan, 'push').active).toBe(true);
  });

  it('un accessoire suit la variété (curl + curl marteau) ; essentiel > accessoire (volume)', () => {
    const high = suggestFullBodyPlan('avance', 'moderate', 'high', SLOTS);
    const low = suggestFullBodyPlan('avance', 'moderate', 'low', SLOTS);
    expect(bySlot(high, 'biceps').nExos).toBe(2);
    expect(bySlot(high, 'triceps').nExos).toBe(2);
    expect(bySlot(low, 'biceps').nExos).toBe(1);
    expect(bySlot(high, 'push').weeklySets).toBeGreaterThan(bySlot(high, 'biceps').weeklySets);
  });

  it('biceps et triceps ont chacun leur volume, du même ordre que les autres accessoires', () => {
    const plan = suggestFullBodyPlan('intermediaire', 'moderate', 'med', SLOTS);
    expect(bySlot(plan, 'biceps').weeklySets).toBe(
      comboWeeklySets('intermediaire', 'moderate', false),
    );
    expect(bySlot(plan, 'triceps').weeklySets).toBe(bySlot(plan, 'biceps').weeklySets);
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
    expect(e.biceps!).toBeGreaterThan(1);
    expect(e.triceps!).toBeGreaterThan(1);
    expect(e.push!).toBeGreaterThan(1);
    expect(e.squat!).toBeLessThan(1);
  });

  it('perf : chaîne postérieure/gainage boostés, bras allégés', () => {
    const e = comboEmphasis('perf');
    expect(e.hinge!).toBeGreaterThan(1);
    expect(e.core!).toBeGreaterThan(1);
    expect(e.biceps!).toBeLessThan(1);
    expect(e.triceps!).toBeLessThan(1);
  });

  it('balanced sans sport = tout neutre (1)', () => {
    const e = comboEmphasis('balanced');
    // Une clé par emplacement réel : un groupe ajouté sans poids passerait ici à undefined.
    for (const k of COMBO_SLOTS.map((s) => s.key)) expect(e[k]!).toBe(1);
    expect(e.arms).toBeUndefined();
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
      { key: 'biceps', muscles: ['biceps'], essential: true },
    ];
    const bySlot = (plan: ReturnType<typeof suggestFullBodyPlan>, key: string) =>
      plan.find((p) => p.slot === key)!;
    const sculpt = suggestFullBodyPlan('avance', 'moderate', 'med', SLOTS, comboEmphasis('sculpt'));
    const perf = suggestFullBodyPlan('avance', 'moderate', 'med', SLOTS, comboEmphasis('perf'));
    expect(bySlot(sculpt, 'biceps').weeklySets).toBeGreaterThan(bySlot(perf, 'biceps').weeklySets);
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

describe('comboXpByDay — ventilation par jour (historique energie)', () => {
  const c = combo([
    leg({ target: 2, sets: [set(10, 20, '2026-01-05'), set(10, 20, '2026-01-07')] }),
    leg({
      exercise_id: 'ex_row',
      target: 2,
      sets: [set(8, 30, '2026-01-05'), set(8, 30, '2026-01-05')],
    }),
  ]);

  it('la somme vaut EXACTEMENT comboXpPoints (invariant : rien ne se perd)', () => {
    const days = comboXpByDay(c);
    const sum = days.reduce((a, d) => a + d.effort + d.bonus, 0);
    expect(sum).toBe(comboXpPoints([c]));
  });

  it('un jour par date de serie, triees ; la prime suit les PALIERS franchis', () => {
    const days = comboXpByDay(c);
    expect(days.map((d) => d.date)).toEqual(['2026-01-05', '2026-01-07']);
    // Le 05, le rowing atteint deja sa cible (2/2) -> une part de prime tombe ce jour-la,
    // PAS a la fin : la prime a paliers est versee au fur et a mesure.
    expect(days[0]!.bonus).toBeGreaterThan(0);
    // La somme des primes journalieres = la prime totale du defi.
    expect(days.reduce((a, d) => a + d.bonus, 0)).toBe(comboBonusXp(c));
    expect(comboBonusXp(c)).toBeGreaterThan(0);
  });

  it('effort reparti sur les jours actifs', () => {
    const days = comboXpByDay(c);
    expect(days[0]!.effort).toBeGreaterThan(0);
    expect(days[1]!.effort).toBeGreaterThan(0);
  });

  it('sans aucune serie : aucun jour', () => {
    expect(comboXpByDay(combo([leg({ target: 3, sets: [] })]))).toEqual([]);
  });

  it('la prime est celle deja incluse dans le total (comboTieredBonus x XP_MULT)', () => {
    expect(comboBonusXp(c)).toBe(Math.round(comboTieredBonus(c) * 2));
  });
});

describe('legTierMarks', () => {
  const leg = (target: number, done: number) =>
    ({
      slot: 'push',
      exercise_id: 'ex',
      rep_weight: 1,
      target,
      count_mode: 'sets',
      sets: Array.from({ length: done }, () => ({ date: '2026-09-01', reps: 10 })),
      progress: [],
    }) as unknown as Parameters<typeof legTier>[0];

  it('atteindre le repère affiché décroche VRAIMENT le palier (toutes les cibles)', () => {
    const RANK = { none: 0, secondary: 1, principal: 2 } as const;
    for (let t = 1; t <= 80; t++) {
      const m = legTierMarks(leg(t, 0));
      expect(RANK[legTier(leg(t, m.sec))]).toBeGreaterThanOrEqual(RANK.secondary);
      expect(legTier(leg(t, m.principal))).toBe('principal');
    }
  });

  it('les repères sont ordonnés, et il n’y en a plus au-delà de l’objectif', () => {
    for (let t = 1; t <= 80; t++) {
      const m = legTierMarks(leg(t, 0));
      expect(m.sec).toBeLessThanOrEqual(m.principal);
      expect(m.principal).toBe(t);
      expect(m).not.toHaveProperty('max');
    }
  });
});

describe('🎨 LA COULEUR D’UNE CASE DIT LE PALIER (remplace les pastilles)', () => {
  const leg = (target: number, done: number) =>
    ({
      slot: 'push',
      exercise_id: 'ex',
      rep_weight: 1,
      target,
      count_mode: 'sets',
      sets: Array.from({ length: done }, () => ({ date: '2026-09-01', reps: 10 })),
      progress: [],
    }) as unknown as Parameters<typeof legTier>[0];

  it('faire la DERNIÈRE case d’une couleur débloque exactement ce palier (toutes les cibles)', () => {
    // Sinon la couleur mentirait : une case « objectif » faite sans objectif atteint.
    for (let t = 1; t <= 80; t++) {
      for (let n = 1; n <= t; n++) {
        const zone = legSegZone(leg(t, 0), n);
        const lastOfZone = legSegZone(leg(t, 0), n + 1) !== zone;
        if (lastOfZone) expect(legTier(leg(t, n)), `cible ${t}, case ${n}`).toBe(zone);
        else expect(legTier(leg(t, n)), `cible ${t}, case ${n}`).not.toBe(zone);
      }
    }
  });

  it('les couleurs se suivent dans l’ordre ; au-delà de l’objectif (360 d’avant), « beyond »', () => {
    const ORDER = ['secondary', 'principal', 'beyond'];
    for (let t = 1; t <= 80; t++) {
      let prev = 0;
      for (let n = 1; n <= t + 3; n++) {
        const k = ORDER.indexOf(legSegZone(leg(t, 0), n));
        expect(k).toBeGreaterThanOrEqual(prev);
        prev = k;
      }
      expect(legSegZone(leg(t, 0), t)).toBe('principal');
      expect(legSegZone(leg(t, 0), t + 1)).toBe('beyond');
    }
  });
});

describe('legBarGeometry (barre continue : reps et durée)', () => {
  // Exo de DURÉE (gainage) : objectif 120 s.
  const timeLeg = (done: number) =>
    ({
      slot: 'core',
      exercise_id: 'ex_plank',
      rep_weight: 1,
      target: 120,
      count_mode: 'time',
      sets: [{ date: '2026-09-01', reps: done }],
      progress: [],
    }) as unknown as Parameters<typeof legBarGeometry>[0];

  it('l’objectif est au bout de la barre : plus de marge de dépassement (v1.53)', () => {
    const g = legBarGeometry(timeLeg(0));
    expect(g.objPct).toBe(100);
    expect(legBarGeometry(timeLeg(120)).fillPct).toBe(100);
  });

  it('un 360 d’avant la v1.53 qui a dépassé : la part au-delà reste lisible', () => {
    const avant = legBarGeometry(timeLeg(60));
    expect(avant.overPct).toBe(0);
    expect(avant.fillPct).toBeGreaterThan(0);

    const apres = legBarGeometry(timeLeg(132)); // 110 % de l'objectif
    expect(apres.fillPct).toBeCloseTo(apres.objPct, 5); // saturé jusqu'à la cible
    expect(apres.overPct).toBeGreaterThan(0); // …et du vert au-delà
  });

  it('ne déborde jamais de la barre, même très au-delà du maximal', () => {
    for (const done of [0, 1, 119, 120, 144, 400, 5000]) {
      const g = legBarGeometry(timeLeg(done));
      expect(g.fillPct + g.overPct).toBeLessThanOrEqual(100.0001);
      expect(g.objPct).toBeGreaterThanOrEqual(0);
      expect(g.objPct).toBeLessThanOrEqual(100);
    }
  });
});

describe('prime du 360 : versée à la FIN, jamais au fil des séries (v0.717)', () => {
  // ⚠️ CE QUI EST VERROUILLÉ, ET LE PIÈGE ÉVITÉ. La prime tombait par petits bouts à chaque
  // série qui décrochait un palier : l'énergie montait en continu et le bouclage n'était
  // plus un moment. Mais la corriger en ne payant QU'À LA COMPLÉTION l'aurait rendue
  // tout-ou-rien — annulant la v0.621, qui avait justement fait en sorte qu'un exo à la
  // traîne ne fasse plus perdre les autres. « La fin » = bouclé OU période écoulée.
  const leg = (target: number, done: number): ComboLeg =>
    ({
      slot: 'push',
      exercise_id: 'e' + target,
      exercise_name: 'x',
      count_mode: 'sets',
      target,
      rep_weight: 1,
      sets: Array.from({ length: done }, () => ({ date: '2026-01-01', reps: 10, weight: null })),
    }) as ComboLeg;
  const mk = (legs: ComboLeg[]): ComboChallenge =>
    ({
      id: 'c',
      name: 'n',
      start_date: '2026-01-01',
      duration_days: 7,
      status: 'active',
      legs,
    }) as ComboChallenge;

  it('⚠️ EN COURS et non bouclé : prime NULLE, même avec des paliers atteints', () => {
    const c = mk([leg(10, 10), leg(10, 3)]); // 1er exo au principal, 2e à la traîne
    expect(comboEnded(c, '2026-01-03')).toBe(false);
    expect(comboTieredBonus(c, undefined, '2026-01-03')).toBe(0);
  });

  it('⚠️ PÉRIODE ÉCOULÉE sans bouclage : la prime des paliers atteints EST versée', () => {
    // Le cas qui interdit le retour au tout-ou-rien : la semaine est finie, un exo n'a pas
    // suivi, mais tout le travail fait compte.
    const c = mk([leg(10, 10), leg(10, 3)]);
    expect(comboEnded(c, '2026-01-09')).toBe(true);
    expect(comboTieredBonus(c, undefined, '2026-01-09')).toBeGreaterThan(0);
  });

  it('BOUCLÉ avant la fin : la prime tombe tout de suite', () => {
    const c = mk([leg(10, 10), leg(10, 10)]);
    expect(comboEnded(c, '2026-01-03')).toBe(true);
    expect(comboTieredBonus(c, undefined, '2026-01-03')).toBeGreaterThan(0);
  });

  it('plus on a atteint de paliers, plus la prime est grosse — à durée égale', () => {
    const fin = '2026-01-09';
    const faible = mk([leg(10, 3), leg(10, 3)]);
    const fort = mk([leg(10, 10), leg(10, 10)]);
    expect(comboEnded(faible, fin)).toBe(true);
    expect(comboTieredBonus(fort, undefined, fin)).toBeGreaterThan(
      comboTieredBonus(faible, undefined, fin),
    );
  });
});

// ── Fourchette de reps conseillée (intégration du repère « objectif » au 360) ──
// Exo CHARGÉ exprès : les pompes ont leur propre fourchette (EXERCISE_REPS), qui
// masquerait le mécanisme éprouvé ici (fourchette figée, repli sur l’objectif).
const heavy = (over: Partial<ComboLeg> = {}): ComboLeg =>
  leg({ exercise_id: 'ex_bench_press', exercise_name: 'Développé couché', ...over });

describe('legRepRange — la fourchette figée au leg', () => {
  it('lit la fourchette FIGÉE à la création, sans relire l’objectif du profil', () => {
    const l = heavy({ rep_min: 4, rep_max: 6 });
    // Même si le profil est passé à « endurance » entre-temps : le 360 est le
    // contrat de la semaine, il ne change pas sous les pieds du joueur.
    expect(legRepRange(l, 'endurance')).toMatchObject({ min: 4, max: 6 });
  });
  it('360 créé AVANT la fourchette → repli sur l’objectif, jamais null', () => {
    const l = heavy(); // ni rep_min ni rep_max
    expect(legRepRange(l, 'force')).toMatchObject({ min: 4, max: 6 });
    expect(legRepRange(l, 'endurance')).toMatchObject({ min: 15, max: 20 });
    expect(legRepRange(l, null)).toMatchObject({ min: 8, max: 12 }); // défaut
  });
  it('repli d’un exo au TEMPS → secondes (pas les reps de l’objectif)', () => {
    const l = heavy({ count_mode: 'time', target: 120 });
    expect(legRepRange(l, 'force')).toMatchObject({ min: 30, max: 60 });
  });
  it('repli d’un exo d’isolation → plancher relevé', () => {
    const l = heavy({ muscle_primary: 'biceps' });
    expect(legRepRange(l, 'force')).toMatchObject({ min: 8, max: 12 });
  });
});

describe('séance générée — les reps annoncées AVANT la série', () => {
  it('prescrit le haut de la fourchette de l’exo, pas un 10 arbitraire', () => {
    const c = combo([
      heavy({ exercise_id: 'a', target: 3, rep_min: 4, rep_max: 6 }),
      heavy({ exercise_id: 'b', slot: 'pull', target: 3, rep_min: 15, rep_max: 20 }),
    ]);
    const s = buildComboSessionFromCounts(c, { a: 3, b: 3 });
    expect(s.find((e) => e.exercise_id === 'a')!.sets).toEqual([6, 6, 6]);
    expect(s.find((e) => e.exercise_id === 'b')!.sets).toEqual([20, 20, 20]);
  });
  it('une série déjà faite prime : on continue ce qu’on fait', () => {
    const c = combo([heavy({ target: 3, rep_min: 4, rep_max: 6, sets: [set(9, 40)] })]);
    expect(buildComboSessionFromCounts(c, { ex_bench_press: 2 })[0]!.sets).toEqual([9, 9]);
  });
  it('la fourchette voyage jusqu’au runner', () => {
    const c = combo([heavy({ target: 3, rep_min: 8, rep_max: 12 })]);
    expect(buildComboSessionFromCounts(c, { ex_bench_press: 2 })[0]).toMatchObject({
      rep_min: 8,
      rep_max: 12,
    });
  });
  it('360 sans fourchette ni objectif → le haut du défaut (12), plus le 10 en dur', () => {
    // Le repli n’est plus COMBO_PLAN_REPS mais le haut de la fourchette par défaut
    // (hypertrophie 8–12) : même famille de chiffre, mais dérivé d’une règle.
    const c = combo([heavy({ target: 2 })]);
    expect(buildComboSessionFromCounts(c, { ex_bench_press: 2 })[0]!.sets).toEqual([12, 12]);
  });
});

describe('🛑 ARRÊTER UN DÉFI 360', () => {
  const leg = (over: Partial<ComboLeg> = {}): ComboLeg =>
    ({ slot: 'push', exercise_id: 'e', exercise_name: 'E', target: 10, ...over }) as ComboLeg;
  const ch = (legs: ComboLeg[]): ComboChallenge =>
    ({
      id: 'c',
      user_id: 'u',
      start_date: '2026-01-05',
      duration_days: 7,
      status: 'active',
      legs,
    }) as ComboChallenge;

  it('⚠️ un 360 VIERGE est SUPPRIMÉ, pas archivé', () => {
    // Le cas signalé : on en crée un pour montrer à quoi ça ressemble. Il n'a rien
    // produit — le laisser en « abandonné » salit un historique qu'on relit.
    const plan = comboStopPlan(ch([leg(), leg({ exercise_id: 'f' })]));
    expect(plan.kind).toBe('delete');
    expect(plan.ok).toBe('Supprimer');
  });

  it('⚠️ dès qu’UNE série est faite, on ABANDONNE — l’effort reste compté', () => {
    // Ces séries ont déjà alimenté l'XP et l'énergie : les effacer retirerait au joueur
    // un travail réel.
    const plan = comboStopPlan(
      ch([
        leg({ sets: [{ date: '2026-01-05', reps: 8, weight: null }] }),
        leg({ exercise_id: 'f' }),
      ]),
    );
    expect(plan.kind).toBe('abandon');
    expect(plan.ok).toBe('Abandonner');
  });

  it('⚠️ la progression en MODE REPS compte aussi', () => {
    // `legSetsDone` compte les ENTRÉES, donc il voit les deux modes. Avec `legDone`, un exo
    // en mode reps dont les entrées valent 0 passerait pour vierge et serait supprimé.
    const plan = comboStopPlan(
      ch([leg({ count_mode: 'reps', sets: [{ date: '2026-01-05', reps: 0, weight: null }] })]),
    );
    expect(plan.kind).toBe('abandon');
  });

  it('⚠️ l’ancien format `progress` compte aussi', () => {
    // Les 360 d'avant la refonte des séries portent leur travail dans `progress`.
    const plan = comboStopPlan(ch([leg({ progress: [{ date: '2026-01-05', reps: 12 }] })]));
    expect(plan.kind).toBe('abandon');
  });

  it('⚠️ le travail compte sur N IMPORTE QUEL exo, pas seulement le premier', () => {
    // Test ajouté après une mutation passée au VERT : tous mes cas mettaient la
    // progression sur le PREMIER exo, donc ne lire que celui-là passait. Or on fait ses
    // tractions avant son gainage — un 360 travaillé ailleurs aurait été supprimé, et
    // son XP effacée.
    const plan = comboStopPlan(
      ch([
        leg(),
        leg({ exercise_id: 'f' }),
        leg({ exercise_id: 'g', sets: [{ date: '2026-01-05', reps: 5, weight: null }] }),
      ]),
    );
    expect(plan.kind).toBe('abandon');
  });
  it('les deux issues se DISENT, et ne se disent pas pareil', () => {
    // Les libellés viennent de la lib pour que l'onglet 🎯 Défi 360 et l'écran de détail
    // ne puissent pas annoncer deux choses différentes pour le même geste — ils le
    // faisaient : le 🗑 supprimait un 360 vierge, « Abandonner » l'archivait toujours.
    const vierge = comboStopPlan(ch([leg()]));
    const entame = comboStopPlan(ch([leg({ sets: [{ date: 'd', reps: 1, weight: null }] })]));
    expect(vierge.title).not.toBe(entame.title);
    expect(vierge.message).not.toBe(entame.message);
    expect(vierge.ok).not.toBe(entame.ok);
  });
});

describe('📅 LA BARRE D’AVANCEMENT DU 360', () => {
  const mk = (over: Partial<ComboChallenge> = {}): ComboChallenge =>
    ({
      id: 'c',
      user_id: 'u',
      start_date: '2026-01-05',
      duration_days: 7,
      status: 'active',
      legs: [
        {
          slot: 'push',
          exercise_id: 'e',
          exercise_name: 'E',
          target: 10,
          sets: [{ date: '2026-01-05', reps: 10, weight: null }],
        } as ComboLeg,
      ],
      ...over,
    }) as ComboChallenge;

  it('⚠️ LE DERNIER JOUR, le retard se voit ENCORE (le defaut signale)', () => {
    // Signale : « c’est le dernier jour donc tout le reste à faire devrait être en rose ;
    // ça affiche bien en rose les autres jours sauf le dernier ». L’attendu vaut
    // exactement 100 % ce jour-là, et le garde  — écrit pour le TRAIT 🎯 — éteignait
    // aussi la zone rose et la ligne « en retard ».
    const p1 = comboPace(mk(), '2026-01-11'); // jour 7 sur 7
    expect(p1.onTimePct).toBe(100);
    expect(p1.latePct).toBeGreaterThan(0); // il reste du rose à peindre
    expect(p1.showPace).toBe(true); // …et la ligne qui l’annonce
    expect(p1.state).toBe('behind');
  });

  it('⚠️ … mais le TRAIT 🎯, lui, se cache a 100 %', () => {
    // C’était la seule chose que le garde faisait bien : à 100 % le trait se confondrait
    // avec le bout de la barre.
    expect(comboPace(mk(), '2026-01-11').showMark).toBe(false);
    expect(comboPace(mk(), '2026-01-08').showMark).toBe(true);
  });

  it('en avance : aucun rose', () => {
    const fini = mk({
      legs: [
        {
          slot: 'push',
          exercise_id: 'e',
          exercise_name: 'E',
          target: 1,
          sets: [{ date: '2026-01-05', reps: 10, weight: null }],
        } as ComboLeg,
      ],
    });
    const p1 = comboPace(fini, '2026-01-06');
    expect(p1.latePct).toBe(0);
    expect(p1.state).toBe('ahead');
  });

  it('⚠️ un 360 BOUCLE ne parle plus de retard', () => {
    // 100 % fait : la barre est pleine, plus rien n’est en retard — la ligne se tait.
    const fini = mk({
      legs: [
        {
          slot: 'push',
          exercise_id: 'e',
          exercise_name: 'E',
          target: 1,
          sets: [{ date: '2026-01-05', reps: 10, weight: null }],
        } as ComboLeg,
      ],
    });
    expect(comboPace(fini, '2026-01-11').showPace).toBe(false);
  });

  it('avant le depart : rien du tout', () => {
    const p1 = comboPace(mk(), '2026-01-01');
    expect(p1.onTimePct).toBe(0);
    expect(p1.showPace).toBe(false);
    expect(p1.showMark).toBe(false);
  });

  it('⚠️ DATES EN UTC : 365 jours d’affilee, l’attendu ne saute jamais en arriere', () => {
    // Le projet s’est déjà fait décaler d’un jour en France par un aller-retour local↔UTC.
    const c2 = mk({ duration_days: 365 });
    let prev = -1;
    for (let d = 0; d < 365; d++) {
      const jour = new Date(Date.UTC(2026, 0, 5 + d)).toISOString().slice(0, 10);
      const v = comboPace(c2, jour).onTimePct;
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(prev).toBe(100);
  });
});

describe('🗑️ RETIRER LA SÉRIE TOUCHÉE (pas forcément la dernière)', () => {
  const s = (reps: number): ComboSet => ({ date: '2026-09-01', reps, weight: null });
  const sets = [s(10), s(11), s(12), s(13)];

  it('retire exactement la case touchée, les autres gardent leur ordre', () => {
    expect(removeSetAt(sets, 1).map((x) => x.reps)).toEqual([10, 12, 13]);
    expect(removeSetAt(sets, 0).map((x) => x.reps)).toEqual([11, 12, 13]);
    expect(removeSetAt(sets, 3).map((x) => x.reps)).toEqual([10, 11, 12]);
  });

  it('ne touche pas la liste reçue (rend une nouvelle liste)', () => {
    const copy = [...sets];
    removeSetAt(sets, 2);
    expect(sets).toEqual(copy);
  });

  it('un index hors limites ne retire RIEN (double tap sur une case déjà partie)', () => {
    for (const i of [-1, 4, 99, 1.5, Number.NaN]) {
      expect(removeSetAt(sets, i).map((x) => x.reps)).toEqual([10, 11, 12, 13]);
    }
  });
});

describe('✏️ CORRIGER LA SÉRIE TOUCHÉE', () => {
  const s = (reps: number, date = '2026-09-01'): ComboSet => ({ date, reps, weight: null });
  const sets = [s(10), s(11, '2026-09-03'), s(12)];

  it('corrige exactement la case touchée (reps, charge, assistance), les autres ne bougent pas', () => {
    const out = updateSetAt(sets, 1, { reps: 15, weight: 20, assisted: true });
    expect(out.map((x) => x.reps)).toEqual([10, 15, 12]);
    expect(out[1]).toMatchObject({ reps: 15, weight: 20, assisted: true });
    expect(out[0]).toEqual(sets[0]);
    expect(out[2]).toEqual(sets[2]);
  });

  it('garde le JOUR de la série : c’est lui qui dit si elle compte dans les temps', () => {
    expect(updateSetAt(sets, 1, { reps: 9, weight: null, assisted: false })[1]!.date).toBe(
      '2026-09-03',
    );
  });

  it('retirer la charge la remet au poids du corps (null, pas l’ancienne valeur)', () => {
    const lourd = [{ date: '2026-09-01', reps: 8, weight: 40 }];
    expect(updateSetAt(lourd, 0, { reps: 8, weight: null, assisted: false })[0]!.weight).toBeNull();
  });

  it('ne touche pas la liste reçue, et un index hors limites ne change rien', () => {
    const copy = sets.map((x) => ({ ...x }));
    updateSetAt(sets, 0, { reps: 99, weight: 1, assisted: true });
    expect(sets).toEqual(copy);
    for (const i of [-1, 3, 99])
      expect(updateSetAt(sets, i, { reps: 1, weight: null, assisted: false })).toEqual(copy);
  });

  it('corriger des reps peut boucler l’objectif (en mode reps)', () => {
    const l = leg({ count_mode: 'reps', target: 30, sets: [set(10), set(10), set(5)] });
    expect(legComplete(l)).toBe(false);
    const corrige = {
      ...l,
      sets: updateSetAt(l.sets!, 2, { reps: 10, weight: null, assisted: false }),
    };
    expect(legComplete(corrige)).toBe(true);
  });
});

// ── 📅 FERMETURE ET DÉLAI (v0.825) ─────────────────────────────────────────────────────
describe('📅 le 360 se ferme à l’objectif, et paie ce qui est fait dans les temps', () => {
  // Défi du 05 au 11/01. Deux exos à 4 séries.
  const JOUR = '2026-01-07';
  const APRES = '2026-01-12';
  const sets = (n: number, date = '2026-01-06') =>
    Array.from({ length: n }, () => set(10, 0, date));
  const deux = (a: ComboSet[], b: ComboSet[], over: Partial<ComboChallenge> = {}) =>
    combo(
      [
        leg({ exercise_id: 'a', target: 4, sets: a }),
        leg({ exercise_id: 'b', target: 4, sets: b }),
      ],
      over,
    );

  it('la date de fin est le dernier jour inclus', () => {
    expect(comboEndDate(combo([]))).toBe('2026-01-11');
  });

  it('il se ferme dès que TOUS les objectifs sont atteints (v1.53)', () => {
    expect(comboNextStatus(deux(sets(4), sets(4)), JOUR)).toBe('done');
    expect(comboNextStatus(deux(sets(4), sets(3)), JOUR)).toBe('active');
  });

  it('il se ferme à la date de fin, même inachevé', () => {
    const c = deux(sets(2), sets(1));
    expect(comboNextStatus(c, '2026-01-11')).toBe('active');
    expect(comboNextStatus(c, APRES)).toBe('done');
  });

  it('un abandon reste un abandon', () => {
    expect(comboNextStatus(deux(sets(5), sets(5), { status: 'abandoned' }), JOUR)).toBe(
      'abandoned',
    );
  });

  it('⚠️ bouclé EN RETARD n’est pas payé comme à l’heure : seules les séries dans les temps', () => {
    const aLHeure = deux(sets(4), sets(2));
    const enRetard = deux(sets(4), [...sets(2), ...sets(2, '2026-01-12')]);
    expect(comboComplete(enRetard)).toBe(true); // bouclé… mais après la fin
    expect(comboCompleteInTime(enRetard)).toBe(false);
    expect(comboTieredBonus(enRetard, undefined, APRES)).toBe(
      comboTieredBonus(aLHeure, undefined, APRES),
    );
  });

  it('des séries au-delà de l’objectif (360 d’avant) ne grossissent PAS la prime', () => {
    expect(comboTieredBonus(deux(sets(5), sets(5)), undefined, APRES)).toBe(
      comboTieredBonus(deux(sets(4), sets(4)), undefined, APRES),
    );
  });

  it('⚠️ une série en plus faite après coup ne fait pas fondre la prime d’avance', () => {
    const tot = deux(sets(4, '2026-01-05'), sets(4, '2026-01-05'));
    const plusTard = deux(
      [...sets(4, '2026-01-05'), set(10, 0, '2026-01-10')],
      sets(4, '2026-01-05'),
    );
    // Objectif atteint le 05 dans les deux cas : même avance, même prime.
    expect(comboTieredBonus(plusTard, undefined, APRES)).toBe(
      comboTieredBonus(tot, undefined, APRES),
    );
  });

  it('⚠️ ABANDONNÉ : aucune prime, même avec des paliers atteints', () => {
    const c = deux(sets(5), sets(5), { status: 'abandoned' });
    expect(comboTieredBonus(c, undefined, APRES)).toBe(0);
    // …mais l'XP des séries reste.
    expect(comboXpPoints([c])).toBeGreaterThan(0);
  });

  it('coffre : seulement pour un 360 bouclé dans les temps, jamais abandonné ni partiel', () => {
    expect(comboChestEligible(deux(sets(4), sets(4)))).toBe(true);
    expect(comboChestEligible(deux(sets(4), sets(3)))).toBe(false);
    expect(comboChestEligible(deux(sets(4), [...sets(3), ...sets(1, APRES)]))).toBe(false);
    expect(comboChestEligible(deux(sets(4), sets(4), { status: 'abandoned' }))).toBe(false);
  });
});

describe('🔀 ordre des séries d’une séance (v0.861)', () => {
  const seq = (steps: { exo: number; set: number }[]) => steps.map((s) => 'ABCDE'[s.exo]).join('');
  it('standard : toutes les séries d’un exo, puis le suivant', () => {
    expect(seq(comboSessionSteps([3, 2, 1], 'standard'))).toBe('AAABBC');
  });
  it('alterné : une série de chaque exo à tour de rôle, les exos épuisés sortent du tour', () => {
    expect(seq(comboSessionSteps([3, 2, 1], 'alternate'))).toBe('ABCABA');
  });
  it('chaque série apparaît exactement une fois, dans l’ordre de ses numéros', () => {
    for (const order of ['standard', 'alternate', 'shuffle'] as const) {
      const steps = comboSessionSteps([4, 2, 3, 1], order, 7);
      expect(steps).toHaveLength(10);
      for (const [exo, n] of [4, 2, 3, 1].entries()) {
        expect(steps.filter((s) => s.exo === exo).map((s) => s.set)).toEqual([...Array(n).keys()]);
      }
    }
  });
  it('aléatoire : chaque tour contient une série de chaque exo encore en jeu', () => {
    const steps = comboSessionSteps([3, 3, 3], 'shuffle', 5);
    for (let r = 0; r < 3; r++) {
      expect(
        steps
          .slice(r * 3, r * 3 + 3)
          .map((s) => s.exo)
          .sort(),
      ).toEqual([0, 1, 2]);
      expect(steps.slice(r * 3, r * 3 + 3).every((s) => s.set === r)).toBe(true);
    }
  });
  it('⚠️ aléatoire : RE-MÉLANGÉ à chaque tour (pas le même ordre répété)', () => {
    let differs = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = seq(comboSessionSteps([4, 4, 4, 4], 'shuffle', seed));
      const rounds = [s.slice(0, 4), s.slice(4, 8), s.slice(8, 12), s.slice(12, 16)];
      if (new Set(rounds).size > 1) differs++;
    }
    expect(differs).toBeGreaterThan(35);
  });
  it('⚠️ aléatoire : jamais deux séries du même exo à la suite tant qu’on peut l’éviter', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const steps = comboSessionSteps([3, 3, 2, 3], 'shuffle', seed);
      for (let k = 1; k < steps.length; k++) expect(steps[k]!.exo).not.toBe(steps[k - 1]!.exo);
    }
  });
  it('aléatoire : la même graine redonne le même ordre, une autre graine en donne un autre', () => {
    const a = seq(comboSessionSteps([3, 3, 3], 'shuffle', 11));
    expect(seq(comboSessionSteps([3, 3, 3], 'shuffle', 11))).toBe(a);
    const others = new Set(
      [12, 13, 14, 15, 16].map((g) => seq(comboSessionSteps([3, 3, 3], 'shuffle', g))),
    );
    expect([...others].some((o) => o !== a)).toBe(true);
  });
  it('ajouter une série en cours de séance ne bouleverse pas les tours déjà commencés', () => {
    const before = comboSessionSteps([2, 2, 2], 'shuffle', 9);
    const after = comboSessionSteps([3, 2, 2], 'shuffle', 9);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)).toEqual({ exo: 0, set: 2 });
  });
});

describe('🗂️ l’ordre d’affichage des exos : PAR GROUPE, puis alphabétique (v0.1390)', () => {
  // Cible 4 séries → objectif à 4, palier MAXIMAL à 5 (`legTierMarks`).
  const ex = (exercise_name: string, slot = 'push', faites = 0): ComboLeg => ({
    slot,
    exercise_id: exercise_name,
    exercise_name,
    rep_weight: 1,
    target: 4,
    sets: Array.from({ length: faites }, () => set(10)),
  });
  const noms = (x: readonly ComboLeg[]) => legsByGroup(x).map((l) => l.exercise_name);

  it('suit l’ordre des emplacements du 360, pas l’alphabet', () => {
    const src = [
      ex('Abdos', 'core'),
      ex('Squat', 'squat'),
      ex('Tractions', 'pull'),
      ex('Pompes', 'push'),
    ];
    expect(noms(src)).toEqual(['Pompes', 'Tractions', 'Squat', 'Abdos']);
  });

  it('dans un groupe, l’alphabet départage (accents et nombres lus comme on les lit)', () => {
    const src = [ex('Pompes 10'), ex('Élévations'), ex('Pompes 2'), ex('Dips')];
    expect(noms(src)).toEqual(['Dips', 'Élévations', 'Pompes 2', 'Pompes 10']);
  });

  it('un emplacement inconnu passe en dernier, sans rien perdre', () => {
    const src = [ex('Mystère', 'zzz'), ex('Abdos', 'core')];
    expect(noms(src)).toEqual(['Abdos', 'Mystère']);
  });

  it('⚠️ L’ORDRE EST STABLE : un exo FINI reste à sa place', () => {
    // Les filtres de zone isolent ce qui reste : on ne renvoie pas les exos finis en bas.
    expect(legComplete(ex('Pompes', 'push', 4))).toBe(true);
    for (const n of [0, 2, 4]) {
      expect(noms([ex('Squat', 'squat'), ex('Pompes', 'push', n)])).toEqual(['Pompes', 'Squat']);
    }
  });

  it('NE TOUCHE PAS la source (la séance indexe ses exos)', () => {
    const src = [ex('Squat', 'squat'), ex('Pompes')];
    const copie = [...src];
    expect(legsByGroup(src)).toHaveLength(2);
    expect(src).toEqual(copie);
  });
});

describe('💪 biceps et triceps : deux groupes, et les anciens 360 « Bras » restent lisibles', () => {
  const leg = (slot: string, muscle: string): ComboLeg => ({
    slot,
    exercise_id: 'ex_' + muscle,
    exercise_name: muscle,
    muscle_primary: muscle,
    rep_weight: 1,
    target: 4,
  });

  it('la création propose Biceps et Triceps, plus jamais « Bras »', () => {
    const keys = COMBO_SLOTS.map((s) => s.key);
    expect(keys).toContain('biceps');
    expect(keys).toContain('triceps');
    expect(keys).not.toContain('arms');
    expect(comboSlot('biceps')?.muscles).toEqual(['biceps']);
    expect(comboSlot('triceps')?.muscles).toEqual(['triceps']);
  });

  it('un ancien 360 « Bras » garde son libellé et ses deux muscles', () => {
    expect(comboSlot('arms')?.label).toBe('Bras');
    expect(comboSlot('arms')?.muscles).toEqual(['biceps', 'triceps']);
  });

  it('l’ancien « Bras » se range avec les bras, pas en fin de liste', () => {
    expect(comboSlotRank('arms')).toBe(comboSlotRank('biceps'));
    expect(comboSlotRank('arms')).toBeLessThan(comboSlotRank('shoulders'));
    expect(comboSlotRank('zzz')).toBe(COMBO_SLOTS.length);
    const noms = legsByGroup([leg('shoulders', 'épaules'), leg('arms', 'biceps')]).map(
      (l) => l.exercise_name,
    );
    expect(noms).toEqual(['biceps', 'épaules']);
  });

  it('un muscle prioritaire ou un sport ne touche QUE son groupe de bras', () => {
    const prio = comboEmphasis('balanced', null, ['biceps']);
    expect(prio.biceps!).toBeGreaterThan(1);
    expect(prio.triceps!).toBe(1);
    const grimpe = comboEmphasis('balanced', [
      { name: 'Escalade', sessions_per_week: 3, intensity: 'elevee' },
    ]);
    expect(grimpe.biceps!).toBeLessThan(1);
    expect(grimpe.triceps!).toBe(1);
  });

  it('changer d’exo : un biceps ne bascule pas vers un triceps, l’ancien « Bras » oui', () => {
    expect(transferSlotFor(leg('biceps', 'biceps'), 'biceps')).toBe('biceps');
    expect(transferSlotFor(leg('biceps', 'biceps'), 'triceps')).toBeNull();
    expect(transferSlotFor(leg('arms', 'biceps'), 'triceps')).toBe('arms');
  });
});

describe('📊 LE % SUIT L’OBJECTIF, et ne le dépasse jamais (v1.53)', () => {
  const ex = (name: string, target: number, faites: number): ComboLeg => ({
    slot: 'push',
    exercise_id: name,
    exercise_name: name,
    rep_weight: 1,
    target,
    sets: Array.from({ length: faites }, () => set(10)),
  });
  it('le dénominateur est l’objectif', () => {
    expect(comboProgressPct(combo([ex('A', 10, 5)]))).toBe(50);
  });
  it('un exo qui a dépassé (360 d’avant) ne compense pas le retard d’un autre', () => {
    expect(comboProgressPct(combo([ex('A', 10, 12), ex('B', 10, 8)]))).toBe(90);
  });
  it('tous les objectifs faits = 100 %, même avec des séries en plus', () => {
    expect(comboProgressPct(combo([ex('A', 10, 10), ex('B', 10, 10)]))).toBe(100);
    expect(comboProgressPct(combo([ex('A', 10, 12), ex('B', 10, 20)]))).toBe(100);
  });
});

describe('🎨 LA BARRE PAR ZONE : 0 → 100 %, argent / jaune', () => {
  const ex = (name: string, target: number, faites: number): ComboLeg => ({
    slot: 'push',
    exercise_id: name,
    exercise_name: name,
    rep_weight: 1,
    target,
    sets: Array.from({ length: faites }, () => set(10)),
  });
  it('un exo seul remplit les zones dans l’ordre', () => {
    const p = comboBarParts(combo([ex('A', 10, 9)])); // 90 % : 80 d'argent + 10 de jaune
    expect(p.sec).toBeCloseTo(80, 6);
    expect(p.obj).toBeCloseTo(10, 6);
  });
  it('un exo qui a dépassé n’apporte rien de plus : la barre est pleine', () => {
    const p = comboBarParts(combo([ex('A', 10, 30)]));
    expect(p.sec + p.obj).toBeCloseTo(100, 6);
    expect(p).not.toHaveProperty('bonus');
  });
  it('deux barres seulement : argent (80) et jaune (20)', () => {
    const segs = comboBarSegments(combo([ex('A', 10, 0)]), NO_PACE);
    expect(segs.map((z) => z.id)).toEqual(['sec', 'obj']);
    expect(segs[0]!.len).toBeCloseTo(80, 6);
    expect(segs[1]!.len).toBeCloseTo(20, 6);
  });
});

describe('🌸 LE ROSE = LE RETARD RÉEL, réparti dans l’argent puis le jaune', () => {
  const ex = (name: string, target: number, faites: number): ComboLeg => ({
    slot: 'push',
    exercise_id: name,
    exercise_name: name,
    rep_weight: 1,
    target,
    sets: Array.from({ length: faites }, () => set(10)),
  });
  const pace = (onTimePct: number, donePct: number) => ({
    ...NO_PACE,
    onTimePct,
    donePct,
    latePct: Math.max(0, onTimePct - donePct),
    showMark: onTimePct > 0 && onTimePct < 100,
  });
  // Points de retard peints (la barre argent fait 80 points, la jaune 20).
  const latePts = (segs: ReturnType<typeof comboBarSegments>) =>
    segs.reduce((a, z) => a + (z.late * z.len) / 100, 0);

  it('le cas signalé : l’avance d’un exo dans le jaune réduit le rose de l’argent', () => {
    // A 11/10, B 5/10 → fait 75 % de l’objectif ; attendu 86 % → 11 points de retard.
    // Avant : tout le vide de l’argent (15 points) était rose.
    const c = combo([ex('A', 10, 11), ex('B', 10, 5)]);
    const segs = comboBarSegments(c, pace(86, comboProgressPct(c)));
    expect(latePts(segs)).toBeCloseTo(11, 6);
    expect(segs[0]!.late).toBeCloseTo((11 / 80) * 100, 6);
    expect(segs[1]!.late).toBe(0);
    // Le trait au bout du rose (dans l’argent), pas à 86 % dans le jaune.
    expect(segs[0]!.mark).toBeCloseTo(((65 + 11) / 80) * 100, 6);
    expect(segs[1]!.mark).toBeNull();
  });
  it('le retard remplit l’argent puis passe dans le jaune', () => {
    // 0/10 partout, attendu 95 % : 80 points dans l’argent, 15 dans le jaune.
    const c = combo([ex('A', 10, 0)]);
    const segs = comboBarSegments(c, pace(95, 0));
    expect(segs).toHaveLength(2);
    expect(segs[0]!.late).toBeCloseTo(100, 6);
    expect(segs[1]!.late).toBeCloseTo(75, 6);
    expect(segs[1]!.mark).toBeCloseTo(75, 6); // le trait à 95 %, dans le jaune
  });
  it('dans les temps : aucun rose, le trait à l’avancement attendu', () => {
    const c = combo([ex('A', 10, 9)]);
    const segs = comboBarSegments(c, pace(50, comboProgressPct(c)));
    expect(latePts(segs)).toBe(0);
    expect(segs[0]!.mark).toBeCloseTo((50 / 80) * 100, 6);
  });
  it('en retard : le trait se pose au bout du rose', () => {
    const c = combo([ex('A', 10, 4)]); // 40 %, attendu 60 %
    const segs = comboBarSegments(c, pace(60, comboProgressPct(c)));
    expect(segs[0]!.mark).toBeCloseTo((60 / 80) * 100, 6);
    expect(segs[0]!.fill + segs[0]!.late).toBeCloseTo(segs[0]!.mark!, 6);
  });
});

describe('🔎 TOUCHER UNE BARRE FILTRE LES EXOS DE SA ZONE', () => {
  const ex = (name: string, faites: number): ComboLeg => ({
    slot: 'push',
    exercise_id: name,
    exercise_name: name,
    rep_weight: 1,
    target: 10,
    sets: Array.from({ length: faites }, () => set(10)),
  });
  it('argent avant les séries de base, jaune ensuite, aucune zone une fois terminé', () => {
    expect(legBarZone(ex('A', 7))).toBe('sec');
    expect(legBarZone(ex('A', 8))).toBe('obj');
    expect(legBarZone(ex('A', 9))).toBe('obj');
    expect(legBarZone(ex('A', 10))).toBeNull();
    expect(legBarZone(ex('A', 12))).toBeNull();
  });
  it('filtre sans réordonner, « Objectif » sans les terminés ; « all » garde tout', () => {
    const legs = [ex('A', 12), ex('B', 2), ex('C', 9), ex('E', 8), ex('D', 10)];
    expect(filterLegsByZone(legs, 'obj').map((l) => l.exercise_name)).toEqual(['C', 'E']);
    expect(filterLegsByZone(legs, 'sec').map((l) => l.exercise_name)).toEqual(['B']);
    expect(filterLegsByZone(legs, 'all')).toHaveLength(5);
  });
  it('sous un filtre, seules les cases de sa zone restent, numérotées comme les séries', () => {
    const l = ex('A', 3); // objectif 10 : secondaire 1-8, objectif 9-10
    expect(legSegNumbers(l, 10, 'all')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(legSegNumbers(l, 10, 'sec')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(legSegNumbers(l, 10, 'obj')).toEqual([9, 10]);
    // Petit objectif : le repère secondaire EST l'objectif, pas de case secondaire.
    const petit = { ...ex('P', 0), target: 1 };
    expect(legSegNumbers(petit, 1, 'sec')).toEqual([]);
    expect(legSegNumbers(petit, 1, 'obj')).toEqual([1]);
  });
  it('sans filtre, les exos terminés passent en bas, chacun dans son ordre', () => {
    const legs = [ex('A', 12), ex('B', 2), ex('C', 10), ex('D', 9)];
    expect(filterLegsByZone(legs, 'all').map((l) => l.exercise_name)).toEqual(['B', 'D', 'A', 'C']);
    expect(legs.map((l) => l.exercise_name)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('🔎 L’ÉTAPE EN COURS d’un exo (filtres du 360)', () => {
  const ex = (target: number, faites: number): ComboLeg => ({
    slot: 'push',
    exercise_id: 'a',
    exercise_name: 'A',
    rep_weight: 1,
    target,
    sets: Array.from({ length: faites }, () => set(10)),
  });
  it('secondaire → objectif → terminé, aux repères des cases', () => {
    // Objectif 10 : secondaire 8.
    expect(legStage(ex(10, 0))).toBe('secondary');
    expect(legStage(ex(10, 7))).toBe('secondary');
    expect(legStage(ex(10, 8))).toBe('principal');
    expect(legStage(ex(10, 9))).toBe('principal');
    expect(legStage(ex(10, 10))).toBe('done');
    expect(legStage(ex(10, 12))).toBe('done');
  });
  it('petit objectif : pas de zone secondaire, on commence en « objectif »', () => {
    expect(legStage(ex(3, 0))).toBe('principal');
  });
  it('chaque étape correspond à la couleur de la PROCHAINE case à faire', () => {
    for (let t = 1; t <= 30; t++)
      for (let n = 0; n <= t + 1; n++) {
        const st = legStage(ex(t, n));
        if (st === 'done') expect(legComplete(ex(t, n))).toBe(true);
        else expect(legSegZone(ex(t, n), n + 1)).toBe(st);
      }
  });
});

describe('🏁 LA FERMETURE À L’OBJECTIF (v1.53 ; remplace la clôture manuelle de la v0.964)', () => {
  /** Un 360 d'une semaine, un seul exo, dont on choisit le nombre de séries faites. */
  const defi = (faites: number, opts: Partial<ComboChallenge> = {}): ComboChallenge => ({
    id: 'c1',
    name: 'Test',
    start_date: '2026-09-14',
    duration_days: 7,
    status: 'active',
    legs: [
      {
        slot: 'push',
        exercise_id: 'e1',
        rep_weight: 1,
        target: 10,
        progress: Array.from({ length: faites }, () => ({ date: '2026-09-15', reps: 10 })),
      },
    ],
    ...opts,
  });

  it('un 360 clôturé à la main par une version d’avant reste clôturé', () => {
    const c = defi(9, { status: 'done', config: { closed_by_user: true } });
    expect(comboNextStatus(c, '2026-09-16')).toBe('done');
  });

  it('⚠️ UNE FERMETURE AUTOMATIQUE RESTE RÉVERSIBLE — corriger une série ne doit pas bloquer', () => {
    expect(comboNextStatus(defi(10), '2026-09-16')).toBe('done');
    expect(comboNextStatus({ ...defi(9), status: 'done' }, '2026-09-16')).toBe('active');
  });

  it('un 360 fermé à l’objectif ouvre son coffre', () => {
    expect(comboChestEligible({ ...defi(10), status: 'done' })).toBe(true);
  });
});

describe('🚫 PLUS DE SÉRIE EN PLUS (v1.53)', () => {
  it('le store refuse une série sur un exo dont l’objectif est atteint', async () => {
    // ⚠️ Test de CÂBLAGE (le store est hors du harnais) : l'écran ne propose plus l'ajout,
    // mais l'écran ne garantit rien (séance générée, double toucher). Le refus doit vivre
    // dans `addSet`.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/stores/combo.ts', 'utf8');
    const add = src.slice(src.indexOf('function addSet('), src.indexOf('function removeSet('));
    expect(add).toMatch(/if \(!leg \|\| legComplete\(leg\)\) return;/);
  });
});
