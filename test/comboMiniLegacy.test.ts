import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  comboXpPoints,
  comboXpByExoDay,
  comboExportText,
  comboTransferPlan,
  transferComboLeg,
  exerciseHistorySets,
  legLastReps,
  legLoadAdvice,
  groupSetLines,
  miniEquivalentSets,
  miniLineLabel,
  legDone,
  COMBO_SET_MIN,
  type ComboChallenge,
  type ComboLeg,
  type ComboSet,
} from '@/lib/combo';
import { fractionableExercise, variantFamilyKey } from '@/data/combo';
import { REP_XP, XP_MULT, MUSCU_MIN_XP } from '@/lib/athlete';
import { comboLogEntries } from '@/lib/volume';
import { doneVolume } from '@/lib/bodyBalance';
import { comboFatigueHits } from '@/lib/muscleFatigue';

// Dates FUTURES : le défi n'est jamais « terminé » (aucune prime), donc l'XP se lit nue.
const D1 = '2099-01-02';
const D2 = '2099-01-03';

const mini = (reps: number, date = D1, at?: string): ComboSet => ({
  date,
  reps,
  weight: null,
  assisted: false,
  mini: true,
  at: at ?? `${date}T10:00:00.000Z`,
});
const full = (reps: number, date = D1, at?: string): ComboSet => ({
  date,
  reps,
  weight: null,
  assisted: false,
  ...(at ? { at } : {}),
});

function legOf(sets: ComboSet[], opts: Partial<ComboLeg> = {}): ComboLeg {
  return {
    slot: 'pull',
    exercise_id: 'ex_pullup',
    exercise_name: 'Tractions',
    muscle_primary: 'dos',
    rep_weight: 1,
    target: 60,
    count_mode: 'reps',
    fractional: true,
    rep_min: 8,
    rep_max: 12,
    sets,
    ...opts,
  } as ComboLeg;
}
function combo(legs: ComboLeg[]): ComboChallenge {
  return {
    id: 'c',
    name: 'Défi 360',
    status: 'active',
    start_date: '2099-01-01',
    duration_days: 7,
    legs,
    config: {},
  } as unknown as ComboChallenge;
}
const repeat = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

describe('🔁 quels exos se fractionnent', () => {
  it('tractions, pompes, dips et leurs variantes au poids du corps — rien d’autre', () => {
    for (const id of [
      'ex_pullup',
      'ex_pullup_assisted',
      'ex_chinup',
      'ex_pullup_neutral',
      'ex_pullup_wide',
      'ex_pushup',
      'ex_pushup_knees',
      'ex_pushup_incline',
      'ex_diamond_pushup',
      'ex_dips',
      'ex_dips_assisted',
      'ex_dips_bench',
    ])
      expect(fractionableExercise(id), id).toBe(true);
    for (const id of [
      'ex_lat_pulldown',
      'ex_squat_barbell',
      'ex_plank',
      'ex_row_barbell',
      'ex_curl_barbell',
    ])
      expect(fractionableExercise(id), id).toBe(false);
  });

  // Les exos RÉELS : tout exo des migrations dont le nom parle de tractions, pompes ou dips doit
  // être fractionnable (sauf le tirage machine), et tout fractionnable doit exister en base.
  const dir = resolve(__dirname, '..', 'supabase');
  const files = [
    resolve(dir, 'seed.sql'),
    ...readdirSync(resolve(dir, 'migrations')).map((f) => resolve(dir, 'migrations', f)),
  ];
  const rows = new Map<string, string>(); // id → nom
  for (const f of files) {
    const sql = readFileSync(f, 'utf8');
    for (const m of sql.matchAll(/\(\s*'(ex_[a-z0-9_]+)'\s*,\s*'([^']+)'/g)) rows.set(m[1]!, m[2]!);
  }
  it('lit bien la bibliothèque (garde-fou du test)', () => {
    expect(rows.size).toBeGreaterThan(40);
    expect(rows.get('ex_pullup')).toBeTruthy();
  });
  it('EXHAUSTIF : tout exo « traction / pompe / dip » de la base se fractionne (sauf tirage machine)', () => {
    const concerned = [...rows].filter(
      ([id, name]) =>
        /pompe|traction|\bdips?\b/i.test(name) || /pushup|pullup|chinup|dips/.test(id),
    );
    expect(concerned.length).toBeGreaterThanOrEqual(10);
    for (const [id, name] of concerned) {
      if (id === 'ex_lat_pulldown') continue;
      expect(fractionableExercise(id), `${id} (${name})`).toBe(true);
    }
  });
  it('à l’inverse : tout exo fractionnable de la base est un de ces trois mouvements', () => {
    for (const [id, name] of rows) {
      if (name.startsWith('ex_') || !fractionableExercise(id)) continue; // (alternatives : des ids)
      expect(/pompe|traction|\bdips?\b/i.test(name), `${id} (${name})`).toBe(true);
    }
  });
  it('le tirage vertical à la machine, rangé avec les tractions, est exclu', () => {
    expect(variantFamilyKey('ex_lat_pulldown')).toBe('ex_pullup');
    expect(fractionableExercise('ex_lat_pulldown')).toBe(false);
  });
});

describe('🔁 XP : 30 mini-séries valent 30 reps, pas 95', () => {
  // Hors prime : durée créditée (ceil(reps/10) × 3,5 min × 3 XP) + reps × REP_XP.
  const expected = (reps: number, sets: number) =>
    Math.round((reps * REP_XP + sets * COMBO_SET_MIN * MUSCU_MIN_XP) * XP_MULT);

  it('30 reps en 30 mini-séries = 30 reps en 3 séries de 10 (même XP, au point près)', () => {
    const frac = combo([legOf(repeat(30, () => mini(1)))]);
    const classic = combo([
      legOf(
        repeat(3, () => full(10)),
        { fractional: false },
      ),
    ]);
    expect(comboXpPoints([classic])).toBe(expected(30, 3));
    expect(comboXpPoints([frac])).toBe(comboXpPoints([classic]));
  });
  it('AVANT : sans le traitement, 30 séries d’1 rep (non mini) rapportaient ~3× plus', () => {
    // Les mêmes 30 reps saisies une à une SANS marque de mini-série suivent l'ancien barème
    // (racine par série) — c'est le gonflement mesuré que le marqueur évite.
    const old = combo([
      legOf(
        repeat(30, () => full(1)),
        { fractional: false },
      ),
    ]);
    const repPart = (c: ComboChallenge) =>
      comboXpPoints([c]) / XP_MULT - 3 * COMBO_SET_MIN * MUSCU_MIN_XP;
    const fracPart = repPart(combo([legOf(repeat(30, () => mini(1)))]));
    expect(repPart(old) / fracPart).toBeGreaterThan(3); // ×3,16 mesuré : 95 contre 30 unités de reps
  });
  it('la fourchette de l’exo compte : sur 4-6 reps, 30 reps valent 30/5 = 6 séries équivalentes', () => {
    const l = legOf(
      repeat(30, () => mini(1)),
      { rep_min: 4, rep_max: 6 },
    );
    // reps × √(10/5) = 30 × 1,414 = 42,4 unités — ce que 6 séries de 5 reps valent (6 × 10√0,5).
    const sixSets = legOf(
      repeat(6, () => full(5)),
      { rep_min: 4, rep_max: 6, fractional: false },
    );
    const dur = (sets: number) => sets * COMBO_SET_MIN * MUSCU_MIN_XP;
    const repPart = (c: ComboChallenge, d: number) => comboXpPoints([c]) / XP_MULT - d;
    expect(repPart(combo([l]), dur(3))).toBeCloseTo(repPart(combo([sixSets]), dur(3)), 0);
  });
  it('NON RÉTROACTIF : une série pleine d’un vieux leg en reps garde son XP au bit près', () => {
    const legacy = combo([
      legOf([full(12, '2099-01-02')], { fractional: undefined, count_mode: 'reps', target: 60 }),
    ]);
    const racine = 10 * Math.sqrt(1.2); // barème de la série pleine
    expect(comboXpPoints([legacy])).toBe(
      Math.round((racine * REP_XP + 2 * COMBO_SET_MIN * MUSCU_MIN_XP) * XP_MULT),
    );
    // Allumer le mode fractionné ne change PAS l'XP d'une série pleine sous l'objectif.
    const flagged = combo([legOf([full(12)], { fractional: true })]);
    expect(comboXpPoints([flagged])).toBe(comboXpPoints([legacy]));
  });
  it('l’XP de l’Agenda suit : une ligne par exo et par jour, pas une par prise', () => {
    const c = combo([legOf([...repeat(20, () => mini(1, D1)), ...repeat(10, () => mini(1, D2))])]);
    const lines = comboXpByExoDay(c);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.sets.length)).toEqual([20, 10]);
    expect(lines.reduce((a, l) => a + l.xp, 0)).toBeGreaterThan(0);
  });
});

describe('📉 au-delà de l’objectif : jamais bloqué, XP dégressive', () => {
  it('la part de reps qui dépasse l’objectif vaut OVER_TARGET_XP, la durée reste plafonnée', () => {
    const at = combo([
      legOf(
        repeat(20, () => mini(1)),
        { target: 20 },
      ),
    ]);
    const over = combo([
      legOf(
        repeat(40, () => mini(1)),
        { target: 20 },
      ),
    ]);
    // 20 reps de plus, payées moitié (reps seulement : la durée est déjà plafonnée).
    const extra = comboXpPoints([over]) - comboXpPoints([at]);
    expect(extra).toBe(
      Math.round((20 * REP_XP * 0.5 + 2 * COMBO_SET_MIN * MUSCU_MIN_XP) * XP_MULT) -
        Math.round(2 * COMBO_SET_MIN * MUSCU_MIN_XP * XP_MULT),
    );
  });
  it('un exo NON fractionné garde son barème au-delà de l’objectif (non rétroactif)', () => {
    const base = legOf(
      repeat(4, () => full(10)),
      { target: 20, fractional: false },
    );
    const full4 = comboXpPoints([combo([base])]);
    const flagged = comboXpPoints([combo([{ ...base, fractional: true }])]);
    expect(flagged).toBeLessThan(full4);
  });
  it('une prise qui franchit l’objectif n’est dégressive que pour sa part en trop', () => {
    const a = combo([legOf([...repeat(19, () => mini(1)), mini(3)], { target: 20 })]); // 22 reps : 2 en trop
    const b = combo([
      legOf([...repeat(19, () => mini(1)), mini(1), mini(1), mini(1)], { target: 20 }),
    ]);
    expect(comboXpPoints([a])).toBe(comboXpPoints([b]));
  });
});

describe('🔁 le volume : 30 reps fractionnées = 3 séries, pas 30', () => {
  const sets = repeat(30, () => mini(1));
  const input = (legs: ComboLeg[]) => ({
    sessions: [],
    combos: [combo(legs)],
    challenges: [],
    bossHits: [],
    objective: null,
    secondaries: () => undefined,
    primaries: () => undefined,
  });
  it('équilibre du corps : 30 reps ÷ milieu de fourchette (10) = 3 séries équivalentes', () => {
    const v = doneVolume(input([legOf(sets)]) as never, '2099-01-01', '2099-02-01');
    expect(v.totalSets).toBeCloseTo(3, 5);
  });
  it('statistiques (séances synthétiques) : 30 reps = 3 séries de 10, pas 30 séries d’1', () => {
    const entries = comboLogEntries([combo([legOf(sets)])]);
    expect(entries).toHaveLength(1);
    const perf = entries[0]!.log.exercises[0]!.performed;
    expect(perf).toHaveLength(3);
    expect(perf.reduce((a, p) => a + p.reps, 0)).toBe(30);
  });
  it('les reps se répartissent sans perte (37 reps → 4 séries 9-9-9-10)', () => {
    expect(miniEquivalentSets(37, 10)).toEqual([9, 9, 9, 10]);
    expect(miniEquivalentSets(3, 10)).toEqual([3]);
    expect(miniEquivalentSets(0, 10)).toEqual([]);
  });
  it('la fatigue des groupes ignore les mini-séries (30 frappes pleines l’affoleraient)', () => {
    const hits = (l: ComboLeg) => comboFatigueHits([l], () => ({ dos: 1 }) as never);
    expect(
      hits(legOf(repeat(30, (i) => mini(1, D1, `${D1}T10:${String(i).padStart(2, '0')}:00.000Z`)))),
    ).toHaveLength(0);
    expect(hits(legOf([full(10, D1, `${D1}T10:00:00.000Z`)]))).toHaveLength(1);
  });
});

describe('🔁 conseil de charge et préremplissage : les mini-séries ne comptent pas', () => {
  const range = { min: 8, max: 12 };
  it('sans série pleine, aucun conseil (1 rep n’est pas « trop lourd »)', () => {
    expect(legLoadAdvice(legOf(repeat(6, () => mini(1))), [], range)).toBeNull();
  });
  it('des séries pleines + des mini-séries : le conseil ne lit que les pleines', () => {
    const l = legOf([full(12), full(12), ...repeat(8, () => mini(1))], { assistable: false });
    expect(legLoadAdvice(l, [], range)?.call).toBe('up');
  });
  it('un ancien leg fractionné n’empoisonne pas l’historique ni le préremplissage', () => {
    const past = combo([legOf(repeat(10, () => mini(1)))]);
    expect(exerciseHistorySets([past], 'ex_pullup')).toHaveLength(0);
    const next = legOf([], { fractional: false });
    expect(legLoadAdvice(next, [past], range)).toBeNull();
    expect(legLastReps(legOf(repeat(5, () => mini(1))))).toBe(10);
  });
});

describe('🔁 affichage : les mini-séries d’un jour tiennent en une ligne', () => {
  const sets = [...repeat(6, () => mini(1)), mini(1), full(8), mini(2, D2)];
  it('regroupe par jour : « 7 reps · 7 prises », la série pleine reste seule', () => {
    const lines = groupSetLines(sets);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ kind: 'mini', date: D1, reps: 7, takes: 7 });
    expect(lines[1]).toMatchObject({ kind: 'set', index: 7 });
    expect(lines[2]).toMatchObject({ kind: 'mini', date: D2, reps: 2, takes: 1 });
    expect(miniLineLabel({ reps: 7, takes: 6 })).toBe('7 reps · 6 prises');
    expect(miniLineLabel({ reps: 1, takes: 1 })).toBe('1 rep · 1 prise');
  });
  it('le texte exporté ne liste pas 30 prises', () => {
    const t = comboExportText(combo([legOf(repeat(30, () => mini(1)))]), D1);
    expect(t).toContain('30 reps · 30 prises');
    expect(t).not.toContain('1, 1, 1');
  });
});

describe('🔁 changer d’exo : les mini-séries ne deviennent pas des séries pleines', () => {
  const slotLegs = (sets: ComboSet[]) => [
    legOf(sets),
    legOf([], {
      exercise_id: 'ex_pullup_neutral',
      exercise_name: 'Prise neutre',
      fractional: true,
    }),
  ];
  it('30 « +1 » basculés sur un exo de même fourchette restent 30 reps (pas 300)', () => {
    const c = combo(slotLegs(repeat(30, () => mini(1))));
    const plan = comboTransferPlan(c, 'ex_pullup', { leg: 'ex_pullup_neutral' });
    expect(plan.sets.reduce((a, s) => a + s.reps, 0)).toBe(30);
    const legs = transferComboLeg(c, 'ex_pullup', { leg: 'ex_pullup_neutral' }, plan);
    const dest = legs.find((l) => l.exercise_id === 'ex_pullup_neutral')!;
    expect(legDone(dest)).toBe(30);
    expect(dest.sets!.every((s) => s.mini)).toBe(true);
  });
  it('mis à l’échelle de la fourchette de la cible (1 rep sur 10 → 1 sur 5 = 1, min 1)', () => {
    const c = combo(slotLegs(repeat(10, () => mini(2))));
    const plan = comboTransferPlan(c, 'ex_pullup', { leg: 'ex_pullup_neutral' });
    expect(plan.sets.every((s) => s.reps === 2)).toBe(true);
  });
  it('un exo neuf ne reçoit plus le drapeau fractionné (retiré du 360 en v1.313.0)', () => {
    const base = {
      exercise_name: 'x',
      rep_weight: 1,
      time: false,
      assistable: false,
      rep_min: 8,
      rep_max: 12,
    };
    const c = combo([legOf([mini(1)])]);
    const chin = transferComboLeg(c, 'ex_pullup', {
      exercise: { ...base, exercise_id: 'ex_chinup', muscle_primary: 'dos' },
    });
    expect(chin[0]!.fractional).toBeUndefined();
    const row = transferComboLeg(c, 'ex_pullup', {
      exercise: { ...base, exercise_id: 'ex_row_barbell', muscle_primary: 'dos' },
    });
    expect(row[0]!.fractional).toBeUndefined();
  });
});
