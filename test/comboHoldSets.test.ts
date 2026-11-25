// ⏱️ Défi 360 : un exo AU TEMPS compté en SÉRIES de tenues (nouveau) ou en DURÉE (inchangé).
// `count_mode` dit ce qu'on COMPTE vers l'objectif ; `hold` dit ce qu'on SAISIT (des secondes).
import { describe, expect, it } from 'vitest';
import {
  COMBO_HOLD_SEC,
  buildComboSessionFromCounts,
  comboBonusXp,
  comboCompleteInTime,
  comboCountedSets,
  comboDayQuota,
  comboExportText,
  comboProgressPct,
  comboTieredBonus,
  legTierShare,
  comboTransferBlocker,
  comboTransferPlan,
  transferComboLeg,
  comboXpBreakdown,
  comboXpByExoDay,
  comboXpPoints,
  legComplete,
  legDone,
  legHoldLoadable,
  legIsHold,
  legLoadAdvice,
  legRemaining,
  legRepRange,
  legSetsLeft,
  legTier,
  legUnitLabel,
  setCellLabel,
  setOriginLabel,
  type ComboChallenge,
  type ComboLeg,
} from '@/lib/combo';
import { bodyBalance, sideVolumeItems, type BalanceInput } from '@/lib/bodyBalance';
import { TIME_RANGE } from '@/lib/repScheme';

const DAY = '2026-10-14'; // mercredi, semaine du lundi 12
const set = (reps: number, extra: object = {}) => ({ date: DAY, reps, ...extra });

/** Une planche comptée en SÉRIES (N tenues) : jambe d'un 360 créé avec l'unité « Séries ». */
const holdSets = (secs: number[], target = 4, over: Partial<ComboLeg> = {}): ComboLeg =>
  ({
    slot: 'core',
    exercise_id: 'ex_plank',
    exercise_name: 'Planche',
    muscle_primary: 'abdominaux',
    rep_weight: 0.6,
    target,
    count_mode: 'sets',
    hold: true,
    rep_min: 30,
    rep_max: 60,
    sets: secs.map((s) => set(s)),
    ...over,
  }) as ComboLeg;
/** La MÊME planche comptée en DURÉE : N bulles de 30 s = N × 30 secondes. */
const holdTime = (secs: number[], bubbles = 4, over: Partial<ComboLeg> = {}): ComboLeg =>
  ({
    ...holdSets(secs, bubbles * COMBO_HOLD_SEC),
    count_mode: 'time',
    ...over,
  }) as ComboLeg;
const combo = (legs: ComboLeg[], status: ComboChallenge['status'] = 'active') =>
  ({
    id: 'c1',
    name: '360',
    start_date: '2026-10-12',
    duration_days: 7,
    status,
    legs,
  }) as unknown as ComboChallenge;

describe('⏱️ legIsHold : ce qu’on saisit, pas ce qu’on compte', () => {
  it('sans `hold` : saisi en secondes ⇔ compté en durée (les 360 d’avant)', () => {
    const l = (count_mode?: ComboLeg['count_mode']) =>
      ({
        slot: 's',
        exercise_id: 'x',
        exercise_name: 'X',
        rep_weight: 1,
        target: 1,
        count_mode,
      }) as ComboLeg;
    expect(legIsHold(l('time'))).toBe(true);
    expect(legIsHold(l('sets'))).toBe(false);
    expect(legIsHold(l('reps'))).toBe(false);
    expect(legIsHold(l(undefined))).toBe(false);
  });
  it('`hold` l’emporte : une tenue comptée en séries se saisit en secondes', () => {
    expect(legIsHold(holdSets([]))).toBe(true);
    expect(legIsHold({ ...holdSets([]), hold: false })).toBe(false);
    expect(legIsHold(holdTime([]))).toBe(true);
  });
});

describe('⏱️ tenues comptées en séries : avancement, paliers, clôture', () => {
  it('l’avancement est séries faites / N, jamais des secondes', () => {
    const l = holdSets([45, 40, 38], 4);
    expect(legDone(l)).toBe(3);
    expect(legRemaining(l)).toBe(1);
    expect(legComplete(l)).toBe(false);
    expect(legUnitLabel(l)).toBe('séries');
    expect(comboProgressPct(combo([l]))).toBe(75);
    expect(legSetsLeft(l)).toBe(1);
  });
  it('la 4e tenue boucle l’exo et ferme le défi dans les temps', () => {
    const c = combo([holdSets([45, 40, 38, 30], 4)]);
    expect(legComplete(c.legs[0]!)).toBe(true);
    expect(comboProgressPct(c)).toBe(100);
    expect(comboCompleteInTime(c)).toBe(true);
  });
  it('un palier tombe comme pour un exo en séries de même avancement', () => {
    const plainSets = { ...holdSets([]), hold: undefined, sets: [1, 2, 3, 4].map(() => set(10)) };
    const four = holdSets([45, 45, 45, 45], 5); // 80 %
    expect(legTier(four)).toBe(legTier({ ...plainSets, target: 5 } as ComboLeg));
    expect(legTier(four)).not.toBe(legTier(holdSets([45], 5)));
  });
  it('l’affichage : « 45 s », lest compris ; une série de reps garde « 12×15kg »', () => {
    expect(setCellLabel(set(45), true)).toBe('45 s');
    expect(setCellLabel(set(40, { lest: 5 }), true)).toBe('40 s +5 kg');
    expect(setCellLabel(set(12, { weight: 15 }))).toBe('12×15kg');
    expect(setCellLabel(set(12, { weight: 15 }), false)).toBe('12×15kg');
  });
  it('la fourchette est en secondes (jamais des reps) et le lest reste proposé', () => {
    const l = holdSets([], 4, { rep_min: undefined, rep_max: undefined });
    expect(legRepRange(l, 'hypertrophie')).toEqual(TIME_RANGE);
    expect(legRepRange(holdSets([]), 'hypertrophie').min).toBe(30);
    expect(legHoldLoadable(holdSets([]))).toBe(true);
    expect(legHoldLoadable(holdSets([], 4, { exercise_id: 'ex_side_plank' }))).toBe(false);
  });
  it('pas de conseil de charge sur une tenue (des secondes, pas de poids)', () => {
    expect(legLoadAdvice(holdSets([60, 60, 60]), [], { min: 30, max: 60 })).toBeNull();
  });
  it('une série basculée s’écrit en secondes', () => {
    const l = holdSets([45]);
    const s = { ...set(45), origin: { exercise_id: 'x', exercise_name: 'Chaise', rep_weight: 1 } };
    expect(setOriginLabel(l, s as never)).toBe('Chaise · 45 s');
  });
});

describe('⏱️ XP : une tenue rapporte pareil en séries qu’en durée', () => {
  const tenues = [45, 40, 38, 30];
  it('chaque tenue en plus ajoute le même XP, dans les deux unités', () => {
    for (let k = 1; k <= tenues.length; k++) {
      const a = comboXpPoints([combo([holdSets(tenues.slice(0, k), 8)])], 75);
      const b = comboXpPoints([combo([holdTime(tenues.slice(0, k), 8)])], 75);
      expect(a, `k=${k}`).toBe(b);
    }
    expect(comboXpPoints([combo([holdSets([45], 8)])], 75)).toBeGreaterThan(0);
  });
  it('même décomposition (durée créditée, reps, total) et mêmes lignes d’Agenda', () => {
    const a = combo([holdSets(tenues, 8)]);
    const b = combo([holdTime(tenues, 8)]);
    expect(comboXpBreakdown(a, 75)).toEqual(comboXpBreakdown(b, 75));
    expect(comboCountedSets(a)).toBe(comboCountedSets(b));
    const xp = (c: ComboChallenge) => comboXpByExoDay(c, 75).map((g) => g.xp);
    expect(xp(a)).toEqual(xp(b));
  });
  it('la ligne d’Agenda dit « saisi en secondes » (affichage en s, pas en reps)', () => {
    const [row] = comboXpByExoDay(combo([holdSets([45, 40])]), 75);
    expect(row!.mode).toBe('sets');
    expect(row!.hold).toBe(true);
    const [plain] = comboXpByExoDay(
      combo([{ ...holdSets([]), hold: undefined, sets: [set(10)] } as ComboLeg]),
      75,
    );
    expect(plain!.hold).toBe(false);
  });
  it('la prime de clôture est la même : N tenues de 30 s = N bulles de 30 s', () => {
    const a = combo([holdSets([30, 30, 30, 30], 4)]);
    const b = combo([holdTime([30, 30, 30, 30], 4)]);
    expect(comboBonusXp(a)).toBeGreaterThan(0);
    expect(comboBonusXp(a)).toBe(comboBonusXp(b));
    expect(comboXpPoints([a], 75)).toBe(comboXpPoints([b], 75));
  });
  it('la prime d’une tenue partielle se calcule sur l’effort PRÉVU (tenue manquante à 30 s), comme les séries', () => {
    const end = '2099-01-01'; // la prime ne tombe qu'à la fin du défi
    const part = comboTieredBonus(combo([holdSets([30, 30, 30, 30], 5)]), legTierShare, end);
    const p80 = legTierShare(holdSets([30, 30, 30, 30], 5));
    expect(p80).toBeGreaterThan(0);
    // 5 tenues prévues × 30 s × poids de rep 0,6, au palier de 80 % — pas d'avance (défi non bouclé).
    expect(part).toBeCloseTo(0.25 * (5 * 30 * 0.6) * p80, 6);
  });
  it('au-delà de l’objectif en séries, la durée créditée ne grossit plus', () => {
    const four = comboCountedSets(combo([holdSets([30, 30, 30, 30], 4)]));
    const five = comboCountedSets(combo([holdSets([30, 30, 30, 30, 30], 4)]));
    expect(five).toBe(four);
  });
});

describe('⏱️ Équilibre du corps : une tenue = ses secondes ÷ la fourchette', () => {
  const input = (c: ComboChallenge): BalanceInput => ({
    sessions: [],
    combos: [c],
    challenges: [],
    bossHits: [],
    targets: { abdominaux: 8 },
    objective: 'hypertrophie',
    secondaries: () => undefined,
    primaries: () => 'abdominaux',
    today: DAY,
  });
  it('le fait d’une tenue en séries vaut celui de la même tenue en durée (jamais 1 série)', () => {
    const a = sideVolumeItems(input(combo([holdSets([90])])));
    const b = sideVolumeItems(input(combo([holdTime([90])])));
    expect(a[0]!.sets).toBe(2); // 90 s ÷ 45 (milieu de 30-60 s)
    expect(a[0]!.sets).toBe(b[0]!.sets);
    expect(a[0]!.reps).toBe(0);
  });
  it('la cible suit le mode : N tenues prévues = N × 30 s, comme N bulles', () => {
    const rowOf = (c: ComboChallenge) => bodyBalance(input(c), 'week')[0]!;
    expect(rowOf(combo([holdSets([], 6)])).value).toBe(rowOf(combo([holdTime([], 6)])).value);
    expect(rowOf(combo([holdSets([], 6)])).value).toBe(4); // 6 × 30 s ÷ 45
    // Faite pour moitié : même chose dans les deux unités.
    expect(rowOf(combo([holdSets([90, 90, 90], 6)])).done).toBe(
      rowOf(combo([holdTime([90, 90, 90], 6)])).done,
    );
  });
});

describe('⏱️ séance, quota, export', () => {
  it('une séance sur une tenue en séries : N tenues en secondes, chrono — pas de reps', () => {
    const [exo] = buildComboSessionFromCounts(
      combo([holdSets([], 4)]),
      { ex_plank: 3 },
      'hypertrophie',
    );
    expect(exo!.time).toBe(true);
    expect(exo!.sets).toHaveLength(3);
    expect(new Set(exo!.sets).size).toBe(1);
    expect(exo!.sets[0]).toBeGreaterThanOrEqual(30);
    expect(exo!.rep_min).toBe(30);
    // La même tenue en durée : sa durée totale est découpée en séries (inchangé).
    const [dur] = buildComboSessionFromCounts(
      combo([holdTime([], 4)]),
      { ex_plank: 90 },
      'hypertrophie',
    );
    expect(dur!.time).toBe(true);
    expect(dur!.sets.reduce((a, b) => a + b, 0)).toBe(90);
  });
  it('le quota du jour se lit en séries pour une tenue en séries', () => {
    const c = combo([holdSets([], 7)]);
    expect(comboDayQuota(c, DAY, 'hypertrophie')).toEqual({ ex_plank: 3 }); // ceil(7×3/7) = 3 tenues
  });
  it('l’export texte donne les secondes par tenue et « séries »', () => {
    const text = comboExportText(combo([holdSets([45, 40, 38], 4)]), DAY);
    expect(text).toContain('3/4 séries');
    expect(text).toContain('séries : 45s, 40s, 38s');
  });
});

describe('⏱️ changer d’exo : l’unité ne se mélange pas', () => {
  const exo = (id: string, unit: 'time' | 'reps') => ({
    exercise_id: id,
    exercise_name: id,
    muscle_primary: 'abdominaux',
    rep_weight: 0.6,
    rep_min: unit === 'time' ? 30 : 8,
    rep_max: unit === 'time' ? 60 : 12,
    time: unit === 'time',
  });
  it('tenue en séries ⇄ exo au temps seulement ; jamais vers un exo en reps ou en séries ordinaires', () => {
    const c = combo([
      holdSets([45], 4),
      holdSets([], 4, { exercise_id: 'ex_wall_sit', exercise_name: 'Chaise' }),
      { ...holdSets([]), exercise_id: 'bench', hold: undefined, slot: 'core' } as ComboLeg,
    ]);
    expect(comboTransferBlocker(c, 'ex_plank', { leg: 'ex_wall_sit' })).toBeNull();
    expect(comboTransferBlocker(c, 'ex_plank', { leg: 'bench' })).toBe('modeMismatch');
    expect(comboTransferBlocker(c, 'ex_plank', { exercise: exo('hollow', 'reps') })).toBe(
      'modeMismatch',
    );
    expect(comboTransferBlocker(c, 'ex_plank', { exercise: exo('hollow', 'time') })).toBeNull();
  });
  it('l’exo neuf garde l’unité : séries de tenues, saisi en secondes', () => {
    const c = combo([holdSets([45, 40], 4)]);
    const next = transferComboLeg(c, 'ex_plank', { exercise: exo('hollow', 'time') } as never);
    const fresh = next.find((l) => l.exercise_id === 'hollow')!;
    expect(fresh.count_mode).toBe('sets');
    expect(fresh.hold).toBe(true);
    expect(legIsHold(fresh)).toBe(true);
    expect(
      comboTransferPlan(c, 'ex_plank', { exercise: exo('hollow', 'time') } as never).target,
    ).toBe(4);
  });
  it('un exo au temps en durée n’acquiert pas de `hold` en changeant d’exo', () => {
    const c = combo([holdTime([60], 4, { hold: undefined })]);
    delete (c.legs[0] as { hold?: boolean }).hold;
    const next = transferComboLeg(c, 'ex_plank', { exercise: exo('hollow', 'time') } as never);
    expect('hold' in next.find((l) => l.exercise_id === 'hollow')!).toBe(false);
  });
});
