// 🧊 NON-RÉGRESSION : les Défis 360 d'AVANT l'unité par exo (aucune jambe n'a de `hold`) doivent rendre
// exactement ce qu'ils rendaient. `helpers/comboHoldGolden.json` a été produit par le code d'AVANT
// (`GOLDEN=1`, sur le commit v1.360.0) : avancement, bulles, paliers, XP, équilibre du corps, export
// texte, séance générée, quota du jour — sur trois 360 types dont un exo au temps compté en durée.
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  buildComboSessionFromCounts,
  comboBonusXp,
  comboCountedSets,
  comboDayQuota,
  comboExportText,
  comboProgressPct,
  comboXpBreakdown,
  comboXpByExoDay,
  comboXpPoints,
  legComplete,
  legDone,
  legHoldLoadable,
  legLoadAdvice,
  legRemaining,
  legRepRange,
  legTier,
  legTierShare,
  legTimeBubbles,
  setOriginLabel,
  type ComboChallenge,
  type ComboLeg,
} from '@/lib/combo';
import { bodyBalance, sideVolumeItems, type BalanceInput } from '@/lib/bodyBalance';
import { exerciseRepDays } from '@/lib/repsHabit';

const GOLDEN = new URL('./helpers/comboHoldGolden.json', import.meta.url);
const TODAY = '2026-10-14'; // mercredi ; la semaine commence le lundi 12
const S = (date: string, reps: number, extra: object = {}) => ({ date, reps, ...extra });

const bench = (sets: object[], target = 6): ComboLeg =>
  ({
    slot: 'push',
    exercise_id: 'bench',
    exercise_name: 'Développé couché',
    muscle_primary: 'pectoraux',
    rep_weight: 1.2,
    target,
    count_mode: 'sets',
    rep_min: 8,
    rep_max: 12,
    sets,
  }) as ComboLeg;
const pushups = (sets: object[]): ComboLeg =>
  ({
    slot: 'push',
    exercise_id: 'pushup',
    exercise_name: 'Pompes',
    muscle_primary: 'pectoraux',
    rep_weight: 0.8,
    target: 80,
    count_mode: 'reps',
    rep_min: 8,
    rep_max: 15,
    sets,
  }) as ComboLeg;
const plank = (sets: object[], target = 240): ComboLeg =>
  ({
    slot: 'core',
    exercise_id: 'ex_plank',
    exercise_name: 'Planche',
    muscle_primary: 'abdominaux',
    rep_weight: 0.6,
    target,
    count_mode: 'time',
    rep_min: 30,
    rep_max: 60,
    sets,
  }) as ComboLeg;
const sideBridge = (sets: object[]): ComboLeg =>
  ({
    slot: 'core',
    exercise_id: 'ex_side_plank',
    exercise_name: 'Gainage latéral',
    muscle_primary: 'abdominaux',
    rep_weight: 0.5,
    target: 90,
    count_mode: 'time',
    sets,
  }) as ComboLeg; // 360 d'avant : même pas de fourchette figée
const combo = (id: string, legs: ComboLeg[], status: ComboChallenge['status'] = 'active') =>
  ({
    id,
    name: '360',
    start_date: '2026-10-12',
    duration_days: 7,
    status,
    legs,
  }) as unknown as ComboChallenge;

const FIXTURES: ComboChallenge[] = [
  // A : séries + reps + une tenue en durée entamée (dont une tenue lestée)
  combo('A', [
    bench([S('2026-10-12', 10, { weight: 40 }), S('2026-10-13', 9, { weight: 40 })]),
    pushups([S('2026-10-13', 20), S('2026-10-14', 18)]),
    plank([S('2026-10-12', 45), S('2026-10-13', 40, { lest: 5 }), S('2026-10-14', 38)]),
  ]),
  // B : l'exo au temps bouclé (et au-delà), un autre en cours
  combo('B', [
    plank([
      S('2026-10-12', 60),
      S('2026-10-12', 60),
      S('2026-10-13', 60),
      S('2026-10-13', 60),
      S('2026-10-14', 30),
    ]),
    sideBridge([S('2026-10-14', 25)]),
  ]),
  // C : rien de fait, et un défi terminé
  combo('C', [plank([]), bench([])]),
  combo('D', [plank([S('2026-10-12', 120)], 120)], 'done'),
];

function bal(combos: ComboChallenge[]): BalanceInput {
  return {
    sessions: [],
    combos,
    challenges: [],
    bossHits: [],
    targets: { pectoraux: 10, abdominaux: 8 },
    objective: 'hypertrophie',
    secondaries: () => undefined,
    primaries: (id) => (id === 'bench' || id === 'pushup' ? 'pectoraux' : 'abdominaux'),
    today: TODAY,
  };
}

function snapshot() {
  return FIXTURES.map((c) => ({
    id: c.id,
    pct: comboProgressPct(c),
    bonus: comboBonusXp(c),
    xp: comboXpPoints([c], 75),
    breakdown: comboXpBreakdown(c, 75),
    counted: comboCountedSets(c),
    // `hold` est un champ NOUVEAU de la ligne : seul le reste doit être inchangé.
    byDay: comboXpByExoDay(c, 75).map((g) => {
      const { hold: _hold, ...rest } = g as typeof g & { hold?: boolean };
      return rest;
    }),
    text: comboExportText(c, TODAY),
    quota: comboDayQuota(c, TODAY, 'hypertrophie'),
    session: buildComboSessionFromCounts(
      c,
      Object.fromEntries(c.legs.map((l) => [l.exercise_id, l.exercise_id === 'bench' ? 2 : 60])),
      'hypertrophie',
    ),
    legs: c.legs.map((l) => ({
      id: l.exercise_id,
      done: legDone(l),
      left: legRemaining(l),
      complete: legComplete(l),
      tier: legTier(l),
      share: legTierShare(l),
      range: legRepRange(l, 'hypertrophie'),
      loadable: legHoldLoadable(l),
      advice: legLoadAdvice(l, [], { min: 8, max: 12 }),
      bubbles: l.count_mode === 'time' ? legTimeBubbles(l, TODAY) : null,
      origins: (l.sets ?? []).map((s) => setOriginLabel(l, s as never)),
    })),
    balance: bodyBalance(bal([c]), 'week'),
    balance4: bodyBalance(bal([c]), 'weeks4'),
    items: sideVolumeItems(bal([c])),
    habit: exerciseRepDays('ex_plank', { logs: [], combos: [c], challenges: [] }),
  }));
}

describe('🧊 un 360 d’avant (sans `hold`) rend exactement ce qu’il rendait', () => {
  it('aucune jambe de ces fixtures ne porte `hold`', () => {
    for (const c of FIXTURES) for (const l of c.legs) expect('hold' in l).toBe(false);
  });
  it('toutes les sorties égalent celles du code d’avant', () => {
    const now = JSON.parse(JSON.stringify(snapshot()));
    if (process.env.GOLDEN) {
      writeFileSync(GOLDEN, JSON.stringify(now, null, 1));
      return;
    }
    expect(now).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
  });
});
