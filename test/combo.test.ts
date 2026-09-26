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
  comboOverachievement,
  legTier,
  legTierMarks,
  legSegZone,
  legBarGeometry,
  legTierShare,
  comboTieredBonus,
  comboBonusXp,
  comboXpByDay,
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
  legsByName,
  legAllDone,
  legsDoneLast,
  legStage,
  comboBarParts,
  comboBarSegments,
  filterLegsByZone,
  legBarZone,
  NO_PACE,
  comboBarPos,
  comboFinishPlan,
  comboFinished,
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
  it('la durée est plafonnée au palier MAXIMAL, plus à l’objectif (anti-farm conservé)', () => {
    const exact = combo([leg({ target: 2, sets: [set(10), set(10)] })]);
    const atMax = combo([leg({ target: 2, sets: [set(10), set(10), set(10)] })]);
    const spam = combo([leg({ target: 2, sets: Array.from({ length: 8 }, () => set(1)) })]);
    // Une série EN PLUS est du vrai travail → elle compte…
    expect(comboImpliedMinutes(atMax)).toBeGreaterThan(comboImpliedMinutes(exact));
    // …mais le crédit s'arrête au palier maximal : 8 séries pour un objectif de 2 ne
    // créditent pas plus que 3 → le farm de séries vides reste sans intérêt.
    expect(comboImpliedMinutes(spam)).toBe(comboImpliedMinutes(atMax));
    expect(comboXpBreakdown(spam).duration).toBe(comboXpBreakdown(atMax).duration);
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

describe('paliers du Défi 360 (secondaire 80 % / principal 100 % / maximal 120 %)', () => {
  const l10 = (reps: number) => leg({ count_mode: 'reps', target: 10, sets: [set(reps)] });
  it('palier atteint selon fait/cible', () => {
    expect(legTier(l10(7))).toBe('none'); // < 80 %
    expect(legTier(l10(8))).toBe('secondary'); // 80 %
    expect(legTier(l10(10))).toBe('principal'); // 100 %
    expect(legTier(l10(12))).toBe('max'); // 120 %
  });
  it('parts cumulées 15 / 95 / 120 % — le principal porte 80 %, le maximal PRIME', () => {
    expect(legTierShare(l10(7))).toBe(0);
    expect(legTierShare(l10(8))).toBeCloseTo(0.15);
    expect(legTierShare(l10(10))).toBeCloseTo(0.95);
    expect(legTierShare(l10(12))).toBeCloseTo(1.2);
    // Le principal (la cible) reste le gros du bonus…
    expect(legTierShare(l10(10)) - legTierShare(l10(8))).toBeCloseTo(0.8);
    // …et le maximal DÉPASSE 1 : franchir 120 % rapporte plus qu'un bouclage pile.
    expect(legTierShare(l10(12))).toBeGreaterThan(1);
    expect(legTierShare(l10(12)) - legTierShare(l10(10))).toBeCloseTo(0.25);
  });

  it('une série en plus vaut autant qu’une série normale, mais seulement jusqu’au maximal', () => {
    const at = (n: number) =>
      comboXpPoints([combo([leg({ target: 10, sets: Array.from({ length: n }, () => set(10)) })])]);
    const normale = at(9) - at(8); // avant l'objectif (aucun palier franchi)
    const enPlus = at(11) - at(10); // 1re série au-delà de l'objectif
    const horsZone = at(14) - at(13); // au-delà de 120 % : plus de crédit-durée
    expect(enPlus).toBe(normale);
    expect(horsZone).toBeLessThan(normale / 2);
  });

  it('le détail isole ce que rapporte le dépassement', () => {
    const pile = combo([leg({ target: 10, sets: Array.from({ length: 10 }, () => set(10)) })]);
    const max = combo([leg({ target: 10, sets: Array.from({ length: 12 }, () => set(10)) })]);
    expect(comboXpBreakdown(pile).surpass).toBe(0);
    expect(comboXpBreakdown(max).surpass).toBeGreaterThan(0);
    // bonus + dépassement = la prime réelle (pas deux arrondis qui divergent).
    const b = comboXpBreakdown(max);
    expect(b.total).toBe(b.reps + b.duration + b.bonus + b.surpass);
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

  it('débutant : le BRAS est toujours proposé, les autres accessoires exclus', () => {
    const plan = suggestFullBodyPlan('debutant', 'moderate', 'high', SLOTS);
    expect(bySlot(plan, 'arms').active).toBe(true); // bras TOUJOURS proposé (ticket adbc5ff4)
    expect(bySlot(plan, 'shoulders').active).toBe(false); // autre accessoire exclu en débutant
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
    const RANK = { none: 0, secondary: 1, principal: 2, max: 3 } as const;
    for (let t = 1; t <= 80; t++) {
      const m = legTierMarks(leg(t, 0));
      expect(RANK[legTier(leg(t, m.sec))]).toBeGreaterThanOrEqual(RANK.secondary);
      expect(RANK[legTier(leg(t, m.principal))]).toBeGreaterThanOrEqual(RANK.principal);
      expect(RANK[legTier(leg(t, m.max))]).toBe(RANK.max);
    }
  });

  it('le maximal laisse toujours au moins une série de marge au-dessus de l’objectif', () => {
    for (let t = 1; t <= 80; t++) expect(legTierMarks(leg(t, 0)).max).toBeGreaterThan(t);
  });

  it('les repères sont ordonnés', () => {
    for (let t = 1; t <= 80; t++) {
      const m = legTierMarks(leg(t, 0));
      expect(m.sec).toBeLessThanOrEqual(m.principal);
      expect(m.principal).toBeLessThan(m.max);
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
      const max = legTierMarks(leg(t, 0)).max;
      for (let n = 1; n <= max; n++) {
        const zone = legSegZone(leg(t, 0), n);
        const lastOfZone = legSegZone(leg(t, 0), n + 1) !== zone;
        if (lastOfZone) expect(legTier(leg(t, n)), `cible ${t}, case ${n}`).toBe(zone);
        else expect(legTier(leg(t, n)), `cible ${t}, case ${n}`).not.toBe(zone);
      }
    }
  });

  it('les couleurs se suivent dans l’ordre, et au-delà du maximal plus rien ne compte', () => {
    const ORDER = ['secondary', 'principal', 'max', 'beyond'];
    for (let t = 1; t <= 80; t++) {
      let prev = 0;
      const max = legTierMarks(leg(t, 0)).max;
      for (let n = 1; n <= max + 3; n++) {
        const k = ORDER.indexOf(legSegZone(leg(t, 0), n));
        expect(k).toBeGreaterThanOrEqual(prev);
        prev = k;
      }
      expect(legSegZone(leg(t, 0), max + 1)).toBe('beyond');
      // L'objectif (principal) ne commence jamais avant la fin du secondaire.
      expect(legSegZone(leg(t, 0), t)).not.toBe('max');
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

  it('laisse voir la marge de dépassement : l’objectif n’est PAS en bout de barre', () => {
    const g = legBarGeometry(timeLeg(0));
    expect(g.objPct).toBeGreaterThan(0);
    expect(g.objPct).toBeLessThan(100); // ← avant, la barre s'arrêtait à l'objectif
    expect(g.objPct).toBeCloseTo((120 / 144) * 100, 5); // maximal = 120 %
  });

  it('sépare la part faite avant et après l’objectif', () => {
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
    const s = buildComboSession(c, { sets: 6, restSec: 60 });
    expect(s.find((e) => e.exercise_id === 'a')!.sets).toEqual([6, 6, 6]);
    expect(s.find((e) => e.exercise_id === 'b')!.sets).toEqual([20, 20, 20]);
  });
  it('une série déjà faite prime : on continue ce qu’on fait', () => {
    const c = combo([heavy({ target: 3, rep_min: 4, rep_max: 6, sets: [set(9, 40)] })]);
    expect(buildComboSession(c, { sets: 2, restSec: 60 })[0]!.sets).toEqual([9, 9]);
  });
  it('la fourchette voyage jusqu’au runner (les deux constructeurs)', () => {
    const c = combo([heavy({ target: 3, rep_min: 8, rep_max: 12 })]);
    expect(buildComboSession(c, { sets: 2, restSec: 60 })[0]).toMatchObject({
      rep_min: 8,
      rep_max: 12,
    });
    expect(buildComboSessionFromCounts(c, { ex_bench_press: 2 })[0]).toMatchObject({
      rep_min: 8,
      rep_max: 12,
    });
  });
  it('360 sans fourchette ni objectif → le haut du défaut (12), plus le 10 en dur', () => {
    // Le repli n’est plus COMBO_PLAN_REPS mais le haut de la fourchette par défaut
    // (hypertrophie 8–12) : même famille de chiffre, mais dérivé d’une règle.
    const c = combo([heavy({ target: 2 })]);
    expect(buildComboSession(c, { sets: 2, restSec: 60 })[0]!.sets).toEqual([12, 12]);
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
describe('📅 le 360 reste ouvert après l’objectif, et paie ce qui est fait dans les temps', () => {
  // Défi du 05 au 11/01. Deux exos à 4 séries (maximal = 5).
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

  it('⚠️ LE DÉFAUT SIGNALÉ : objectif atteint ne FERME plus le défi (séries bonus possibles)', () => {
    const c = deux(sets(4), sets(4));
    expect(comboComplete(c)).toBe(true);
    expect(comboClosed(c, JOUR)).toBe(false);
    expect(comboNextStatus(c, JOUR)).toBe('active');
  });

  it('il se ferme quand TOUS les exos sont au maximal — plus rien à gagner', () => {
    expect(comboNextStatus(deux(sets(5), sets(5)), JOUR)).toBe('done');
    expect(comboNextStatus(deux(sets(5), sets(4)), JOUR)).toBe('active');
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

  it('les séries bonus faites dans les temps GROSSISSENT la prime', () => {
    const pile = deux(sets(4), sets(4));
    const bonus = deux(sets(5), sets(5));
    expect(comboTieredBonus(bonus, undefined, APRES)).toBeGreaterThan(
      comboTieredBonus(pile, undefined, APRES),
    );
  });

  it('⚠️ une série bonus faite plus tard ne fait pas fondre la prime d’avance', () => {
    const tot = deux(sets(4, '2026-01-05'), sets(4, '2026-01-05'));
    const plusTard = deux(
      [...sets(4, '2026-01-05'), set(10, 0, '2026-01-10')],
      sets(4, '2026-01-05'),
    );
    // Même objectif atteint le 05 : l'avance est la même, la série bonus ajoute du palier.
    expect(comboTieredBonus(plusTard, undefined, APRES)).toBeGreaterThan(
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

describe('🔤 l’ordre d’affichage des exos : ALPHABÉTIQUE', () => {
  const leg = (exercise_name: string) => ({ exercise_name }) as never;
  const noms = (x: readonly { exercise_name: string }[]) =>
    legsByName(x).map((l) => l.exercise_name);

  it('trie par nom, et NE TOUCHE PAS la source', () => {
    // ⚠️ La copie est délibérée : la séance générée indexe les emplacements
    // (`buildComboSessionFromCounts` reçoit un `counts` par exo), donc trier `legs` en place
    // déplacerait ce que le joueur a coché.
    const src = [leg('Tractions'), leg('Développé couché'), leg('Squat')];
    const copie = [...src];
    expect(noms(src)).toEqual(['Développé couché', 'Squat', 'Tractions']);
    expect(src).toEqual(copie);
  });

  it('⚠️ L’ORDRE EST STABLE : il ne dépend PAS de l’avancement', () => {
    // C'est tout l'intérêt du changement. Les deux écrans triaient par avancement, donc la
    // liste se réordonnait PENDANT la saisie et on perdait sa place au milieu d'une séance.
    const a = [
      { exercise_name: 'Squat', target: 10, progress: [{ date: 'x', reps: 10 }] },
      { exercise_name: 'Dips', target: 10, progress: [] },
    ];
    const b = [
      { exercise_name: 'Squat', target: 10, progress: [] },
      { exercise_name: 'Dips', target: 10, progress: [{ date: 'x', reps: 10 }] },
    ];
    expect(noms(a)).toEqual(noms(b));
    expect(noms(a)).toEqual(['Dips', 'Squat']);
  });

  it('accents et nombres se rangent comme on les lit', () => {
    // `localeCompare` en français : « Élévations » ne part pas à la fin de l'alphabet, et
    // « Pompes 2 » passe avant « Pompes 10 ».
    expect(noms([leg('Fentes'), leg('Élévations')])).toEqual(['Élévations', 'Fentes']);
    expect(noms([leg('Pompes 10'), leg('Pompes 2')])).toEqual(['Pompes 2', 'Pompes 10']);
  });
});

describe('📑 les exos FINIS passent en bas de liste', () => {
  // Cible 4 séries → objectif à 4, palier MAXIMAL à 5 (`legTierMarks`).
  const ex = (exercise_name: string, faites: number): ComboLeg => ({
    slot: 'push',
    exercise_id: exercise_name,
    exercise_name,
    rep_weight: 1,
    target: 4,
    sets: Array.from({ length: faites }, () => set(10)),
  });
  const noms = (x: readonly ComboLeg[]) => legsDoneLast(x).map((l) => l.exercise_name);

  it('⚠️ « FINI » = LE PALIER MAXIMAL, jamais l’objectif', () => {
    // C'est LA décision de cette feature. La zone bonus jusqu'à 120 % est rendue visible
    // exprès (v0.646/0.647) et une série en plus y vaut autant qu'une série normale :
    // reléguer un exo dès 100 % éteindrait précisément les séries qu'on veut voir faire.
    expect(legComplete(ex('Pompes', 4))).toBe(true); //  objectif atteint…
    expect(legAllDone(ex('Pompes', 4))).toBe(false); // … mais il reste la zone bonus
    expect(legAllDone(ex('Pompes', 5))).toBe(true); //   maximal franchi : plus rien à gagner
  });

  it('un exo au maximal descend, quelle que soit sa place dans l’alphabet', () => {
    // Abdos et Dips sont finis : ils descendent, même s'ils ouvrent l'alphabet.
    const src = [ex('Abdos', 5), ex('Squat', 0), ex('Dips', 5), ex('Fentes', 2)];
    expect(noms(src)).toEqual(['Fentes', 'Squat', 'Abdos', 'Dips']);
  });

  it('l’ALPHABET reste la seule règle au sein de chaque groupe', () => {
    // `legsDoneLast` APPELLE `legsByName` : en réécrire un second tri ici ferait deux ordres
    // pour la même liste — le défaut que la v0.903 venait de fermer.
    const src = [ex('Squat', 5), ex('Tractions', 0), ex('Abdos', 5), ex('Dips', 0)];
    expect(noms(src)).toEqual(['Dips', 'Tractions', 'Abdos', 'Squat']);
  });

  it('un exo ne bouge QU’UNE FOIS, au franchissement du maximal', () => {
    // C'est ce qui rend acceptable de réordonner une liste rendue stable POUR sa stabilité :
    // saisir des séries ne déplace rien tant qu'on n'a pas franchi le palier.
    // ⚠️ « Abdos » ouvre l'alphabet : si on le mettait avec « Squat » (déjà 2e), son passage
    // en bas serait INVISIBLE et le test passerait quoi qu'il arrive.
    for (const n of [0, 1, 2, 3, 4]) {
      expect(noms([ex('Abdos', n), ex('Squat', 0)])).toEqual(['Abdos', 'Squat']);
    }
    expect(noms([ex('Abdos', 5), ex('Squat', 0)])).toEqual(['Squat', 'Abdos']); // il descend
  });

  it('ne touche PAS la source, et garde tous les exos', () => {
    const src = [ex('Squat', 5), ex('Dips', 0)];
    const copie = [...src];
    expect(legsDoneLast(src)).toHaveLength(2);
    expect(src).toEqual(copie);
  });
});

describe('📊 LE % SUIT L’OBJECTIF (séries jaunes), et le dépasse avec les séries vertes', () => {
  const ex = (name: string, target: number, faites: number): ComboLeg => ({
    slot: 'push',
    exercise_id: name,
    exercise_name: name,
    rep_weight: 1,
    target,
    sets: Array.from({ length: faites }, () => set(10)),
  });
  it('le dénominateur est l’objectif, pas le palier maximal', () => {
    // 5 séries sur un objectif de 10 = 50 %, pas 5/12 = 41,7 %.
    expect(comboProgressPct(combo([ex('A', 10, 5)]))).toBe(50);
  });
  it('tant qu’un exo n’est pas à l’objectif, les bonus d’un autre ne compensent pas', () => {
    // A : 12/10 (bonus), B : 8/10 → (1 + 0,8)/2 = 90 %, jamais (1,2 + 0,8)/2 = 100 %.
    expect(comboProgressPct(combo([ex('A', 10, 12), ex('B', 10, 8)]))).toBe(90);
  });
  it('tous les objectifs faits + des séries vertes → au-delà de 100 %', () => {
    expect(comboProgressPct(combo([ex('A', 10, 10), ex('B', 10, 10)]))).toBe(100);
    expect(comboProgressPct(combo([ex('A', 10, 11), ex('B', 10, 10)]))).toBe(105);
    expect(comboProgressPct(combo([ex('A', 10, 12), ex('B', 10, 12)]))).toBe(120);
  });
  it('au-delà du palier maximal, plus rien ne monte', () => {
    expect(comboProgressPct(combo([ex('A', 10, 20)]))).toBe(120);
  });
});

describe('🎨 LA BARRE PAR ZONE : 0 → 120 %, argent / jaune / vert', () => {
  const ex = (name: string, target: number, faites: number): ComboLeg => ({
    slot: 'push',
    exercise_id: name,
    exercise_name: name,
    rep_weight: 1,
    target,
    sets: Array.from({ length: faites }, () => set(10)),
  });
  const pct = (x: number) => (x * 100) / 1.2; // part d'objectif → % de la largeur
  it('les zones sont à 80 % et 100 % de l’objectif sur une barre à 120 %', () => {
    expect(comboBarPos(80)).toBeCloseTo(66.667, 2);
    expect(comboBarPos(100)).toBeCloseTo(83.333, 2);
    expect(comboBarPos(120)).toBe(100);
    expect(comboBarPos(200)).toBe(100);
  });
  it('un exo seul remplit les zones dans l’ordre', () => {
    const p = comboBarParts(combo([ex('A', 10, 9)])); // 90 % : 80 d'argent + 10 de jaune
    expect(p.sec).toBeCloseTo(pct(0.8), 6);
    expect(p.obj).toBeCloseTo(pct(0.1), 6);
    expect(p.bonus).toBe(0);
  });
  it('on peut être sous 80 % en moyenne avec du jaune ET du vert (exos poussés plus loin)', () => {
    // A : 12/10 (tout), B : 0/10 → argent (0,8 + 0)/2, jaune 0,2/2, vert 0,2/2.
    const p = comboBarParts(combo([ex('A', 10, 12), ex('B', 10, 0)]));
    expect(p.sec).toBeCloseTo(pct(0.4), 6);
    expect(p.obj).toBeCloseTo(pct(0.1), 6);
    expect(p.bonus).toBeCloseTo(pct(0.1), 6);
  });
  it('au-delà de 120 %, un exo n’apporte plus rien : la barre est pleine', () => {
    const p = comboBarParts(combo([ex('A', 10, 30)]));
    expect(p.sec + p.obj + p.bonus).toBeCloseTo(100, 6);
    expect(p.bonus).toBeCloseTo(pct(0.2), 6);
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
  // Points de retard peints (la barre argent fait 80 points, les deux autres 20).
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
  it('jamais de rose dans le bonus, et le reste passe dans le jaune', () => {
    // 0/10 partout, attendu 95 % : 80 points dans l’argent, 15 dans le jaune.
    const c = combo([ex('A', 10, 0)]);
    const segs = comboBarSegments(c, pace(95, 0));
    expect(segs[0]!.late).toBeCloseTo(100, 6);
    expect(segs[1]!.late).toBeCloseTo(75, 6);
    expect(segs[2]!.late).toBe(0);
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
  it('argent avant les séries de base, jaune avant l’objectif, vert après (bonus ET terminés)', () => {
    expect(legBarZone(ex('A', 7))).toBe('sec');
    expect(legBarZone(ex('A', 8))).toBe('obj');
    expect(legBarZone(ex('A', 10))).toBe('bonus');
    expect(legBarZone(ex('A', 12))).toBe('bonus');
  });
  it('filtre sans réordonner ; « all » garde tout', () => {
    const legs = [ex('A', 12), ex('B', 2), ex('C', 9), ex('D', 10)];
    expect(filterLegsByZone(legs, 'bonus').map((l) => l.exercise_name)).toEqual(['A', 'D']);
    expect(filterLegsByZone(legs, 'sec').map((l) => l.exercise_name)).toEqual(['B']);
    expect(filterLegsByZone(legs, 'all')).toHaveLength(4);
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
  it('secondaire → objectif → bonus → terminé, aux repères des cases', () => {
    // Objectif 10 : secondaire 8, maximal 12.
    expect(legStage(ex(10, 0))).toBe('secondary');
    expect(legStage(ex(10, 7))).toBe('secondary');
    expect(legStage(ex(10, 8))).toBe('principal');
    expect(legStage(ex(10, 9))).toBe('principal');
    expect(legStage(ex(10, 10))).toBe('bonus');
    expect(legStage(ex(10, 11))).toBe('bonus');
    expect(legStage(ex(10, 12))).toBe('done');
  });
  it('petit objectif : pas de zone secondaire, on commence en « objectif »', () => {
    expect(legStage(ex(3, 0))).toBe('principal');
  });
  it('chaque étape correspond à la couleur de la PROCHAINE case à faire', () => {
    const zone = { secondary: 'secondary', principal: 'principal', bonus: 'max' } as const;
    for (let t = 1; t <= 30; t++)
      for (let n = 0; n <= Math.ceil(t * 1.2) + 1; n++) {
        const st = legStage(ex(t, n));
        if (st === 'done') expect(legAllDone(ex(t, n))).toBe(true);
        else expect(legSegZone(ex(t, n), n + 1)).toBe(zone[st]);
      }
  });
});

describe('🏁 CLÔTURER À L’OBJECTIF — le choix qui manquait (v0.964)', () => {
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

  it('⚠️ ON NE PEUT CLÔTURER QU’À L’OBJECTIF, et on DIT pourquoi sinon', () => {
    const pasFini = comboFinishPlan(defi(8), '2026-09-16');
    expect(pasFini.can).toBe(false);
    expect(pasFini.why).toBe('notComplete');
    const fini = comboFinishPlan(defi(10), '2026-09-16');
    expect(fini.can).toBe(true);
    expect(fini.why).toBeNull();
  });

  it('⚠️ RIEN À CLÔTURER quand le 360 se ferme DÉJÀ tout seul', () => {
    // Tous les exos au palier maximal : la fermeture automatique s'en charge.
    const auMax = defi(12);
    expect(legTier(auMax.legs[0]!)).toBe('max');
    expect(comboFinishPlan(auMax, '2026-09-16').why).toBe('alreadyClosed');
    // Période passée : idem.
    expect(comboFinishPlan(defi(10), '2026-09-30').why).toBe('alreadyClosed');
    // Et un défi déjà terminé ou abandonné n'a plus rien à clôturer.
    expect(comboFinishPlan(defi(10, { status: 'done' }), '2026-09-16').why).toBe('alreadyClosed');
    expect(comboFinishPlan(defi(10, { status: 'abandoned' }), '2026-09-16').why).toBe(
      'alreadyClosed',
    );
  });

  it('il DIT ce qu’on laisse : les exos pas encore au maximal, et les jours restants', () => {
    const p = comboFinishPlan(defi(10), '2026-09-16');
    expect(p.bonusLeft).toBe(1);
    expect(p.daysLeft).toBe(4); // 14 + 6 = 20 ; du 16 au 20
    // Au maximal, il ne reste plus rien à gagner — c'est ce qui rend la clôture inutile.
    expect(comboFinishPlan(defi(12), '2026-09-16').bonusLeft).toBe(0);
    // ⚠️ `daysLeft` est rendu MÊME quand on ne peut pas clôturer : il ne doit jamais
    // partir en négatif, sinon un futur lecteur afficherait « il te reste −3 jours ».
    expect(comboFinishPlan(defi(10), '2026-09-30').daysLeft).toBe(0);
  });

  it('⚠️ UNE DÉCISION DU JOUEUR NE SE RECALCULE PAS — sinon elle serait rouverte', () => {
    const c = comboFinished(defi(10));
    expect(c.status).toBe('done');
    expect(c.config?.closed_by_user).toBe(true);
    // Le recalcul, alors que la période court encore, ne doit PAS le rouvrir.
    expect(comboNextStatus(c, '2026-09-16')).toBe('done');
    // …et sans la marque, il le rouvrirait bel et bien (la règle de la v0.825).
    expect(comboNextStatus({ ...defi(10), status: 'done' }, '2026-09-16')).toBe('active');
  });

  it('⚠️ UNE FERMETURE AUTOMATIQUE RESTE RÉVERSIBLE — corriger une série ne doit pas bloquer', () => {
    // Au maximal, il se ferme seul ; on retire une série, il doit rouvrir.
    expect(comboNextStatus({ ...defi(12), status: 'active' }, '2026-09-16')).toBe('done');
    expect(comboNextStatus({ ...defi(11), status: 'done' }, '2026-09-16')).toBe('active');
  });

  it('un 360 clôturé à l’objectif OUVRE bien son coffre', () => {
    // ⚠️ La condition du bouton est EXACTEMENT celle du coffre : il ne peut pas promettre
    // ce qu'on n'aurait pas.
    expect(comboChestEligible(comboFinished(defi(10)))).toBe(true);
    expect(comboFinishPlan(defi(10), '2026-09-16').can).toBe(true);
  });
});
