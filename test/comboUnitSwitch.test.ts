// 🔁 Le même exo, compté autrement, en cours de Défi 360 (v1.366.0) : l'unité change EN PLACE, le
// reste à faire est converti, ce qui est fait ne bouge pas. Tenue : séries ↔ durée ; autre exo :
// séries ↔ reps. Une seule unité par exo.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COMBO_UNIT_BLOCK_LABEL,
  comboUnitBlocker,
  legBeforeSets,
  legDone,
  legIsHold,
  legMidReps,
  legMode,
  legRemaining,
  legSetsDone,
  legUnitChoices,
  switchLegUnit,
  type ComboChallenge,
  type ComboLeg,
} from '@/lib/combo';

const D1 = '2099-01-05';
const set = (reps: number, i = 0) => ({ date: D1, reps, weight: null, at: `${D1}T0${i}:00:00Z` });
const leg = (p: Partial<ComboLeg>): ComboLeg => ({
  slot: 'core',
  exercise_id: 'ex_plank',
  exercise_name: 'Gainage',
  muscle_primary: 'abdominaux',
  rep_weight: 1,
  target: 5,
  count_mode: 'sets',
  hold: true,
  rep_min: 30,
  rep_max: 60,
  sets: [],
  ...p,
});
const combo = (legs: ComboLeg[], over: Partial<ComboChallenge> = {}): ComboChallenge => ({
  id: 'c1',
  name: '360',
  start_date: D1,
  duration_days: 7,
  status: 'active',
  legs,
  ...over,
});
const only = (legs: ComboLeg[], id = 'ex_plank') => legs.find((l) => l.exercise_id === id)!;

describe('tenue : séries → durée', () => {
  const c = combo([leg({ sets: [set(40), set(40, 1)] })]); // 5 tenues visées, 2 faites de 40 s
  it('le reste (3 séries) vaut 3 × 30 s, ajoutées aux 80 s déjà tenues ; le fait ne bouge pas', () => {
    const next = only(switchLegUnit(c, 'ex_plank', 'time'));
    expect(next.count_mode).toBe('time');
    expect(next.target).toBe(80 + 3 * 30);
    expect(next.hold).toBe(true);
    // Les séries gardent leurs valeurs (seul le marqueur « avant le changement » s'ajoute).
    expect(next.sets!.map(({ before, ...rest }) => rest)).toEqual(c.legs[0]!.sets);
    expect(legDone(next)).toBe(80);
    expect(legRemaining(next)).toBe(90);
  });
  it('ne modifie ni l’exo d’origine ni les autres jambes', () => {
    const other = leg({ exercise_id: 'ex_wall_sit', exercise_name: 'Chaise', target: 4 });
    const cc = combo([leg({ sets: [set(40)] }), other]);
    const before = JSON.stringify(cc);
    const legs = switchLegUnit(cc, 'ex_plank', 'time');
    expect(JSON.stringify(cc)).toBe(before);
    expect(legs[1]).toBe(other);
  });
});

describe('tenue : durée → séries', () => {
  it('les secondes restantes deviennent des séries de 30 s, ajoutées aux séries déjà faites', () => {
    const c = combo([leg({ count_mode: 'time', target: 150, sets: [set(40), set(40, 1)] })]);
    const next = only(switchLegUnit(c, 'ex_plank', 'sets'));
    expect(next.count_mode).toBe('sets');
    expect(next.target).toBe(2 + Math.ceil(70 / 30)); // 70 s restantes → 3 séries
    expect(legSetsDone(next)).toBe(2);
    expect(legIsHold(next)).toBe(true);
  });
  it('une tenue d’un 360 d’avant (sans `hold`, comptée en durée) reste une tenue en passant en séries', () => {
    const old = leg({ count_mode: 'time', target: 150, sets: [set(40)] });
    delete old.hold;
    expect(legIsHold(old)).toBe(true); // dérivé du mode durée
    const next = only(switchLegUnit(combo([old]), 'ex_plank', 'sets'));
    expect(legIsHold(next)).toBe(true); // et non « reps » : le drapeau est posé
  });
});

describe('exo en reps : séries ↔ reps', () => {
  const rp = (p: Partial<ComboLeg> = {}) =>
    leg({ exercise_id: 'ex_pushup', exercise_name: 'Pompes', slot: 'push', hold: undefined, rep_min: 8, rep_max: 12, ...p });
  it('séries → reps : une série vaut le milieu de la fourchette de l’exo', () => {
    const c = combo([rp({ target: 6, sets: [set(12), set(12, 1)] })]);
    const mid = legMidReps(c.legs[0]!);
    expect(mid).toBeGreaterThan(5);
    const next = only(switchLegUnit(c, 'ex_pushup', 'reps'), 'ex_pushup');
    expect(next.count_mode).toBe('reps');
    expect(next.target).toBe(24 + Math.round(4 * mid));
    expect(next.hold).toBeUndefined(); // un exo en reps ne devient pas une tenue
  });
  it('reps → séries', () => {
    const c = combo([rp({ count_mode: 'reps', target: 64, sets: [set(12), set(12, 1)] })]);
    const mid = legMidReps(c.legs[0]!);
    const next = only(switchLegUnit(c, 'ex_pushup', 'sets'), 'ex_pushup');
    expect(next.count_mode).toBe('sets');
    expect(next.target).toBe(2 + Math.ceil(40 / mid));
  });
});

describe('ce qui est refusé', () => {
  const c = combo([leg({ sets: [set(40)] })]);
  it('mode par groupe, même unité, unité impossible pour cet exo, rien à convertir, défi fini, exo absent', () => {
    expect(comboUnitBlocker(combo([leg({})], { config: { mode: 'group', groups: [{ slot: 'core', target: 6 }] } }), 'ex_plank', 'time')).toBe('groupMode');
    expect(comboUnitBlocker(c, 'ex_plank', 'sets')).toBe('sameUnit');
    expect(comboUnitBlocker(c, 'ex_plank', 'reps')).toBe('unsupported'); // une tenue ne se compte pas en reps
    const rp = combo([leg({ exercise_id: 'ex_pushup', hold: undefined, sets: [] })]);
    expect(comboUnitBlocker(rp, 'ex_pushup', 'time')).toBe('unsupported'); // ni un exo en reps en durée
    const full = combo([leg({ target: 2, sets: [set(40), set(40, 1)] })]);
    expect(comboUnitBlocker(full, 'ex_plank', 'time')).toBe('nothingLeft');
    expect(comboUnitBlocker(combo([leg({})], { status: 'done' }), 'ex_plank', 'time')).toBe('notActive');
    expect(comboUnitBlocker(c, 'ex_nope', 'time')).toBe('noLeg');
    expect(() => switchLegUnit(c, 'ex_plank', 'sets')).toThrow(COMBO_UNIT_BLOCK_LABEL.sameUnit);
  });
  it('les unités proposées : tenue = séries ↔ durée, autre exo = séries ↔ reps', () => {
    expect(legUnitChoices(leg({}))).toEqual(['time']);
    expect(legUnitChoices(leg({ count_mode: 'time' }))).toEqual(['sets']);
    expect(legMode(leg({}))).toBe('sets');
    expect(legUnitChoices(leg({ hold: undefined, exercise_id: 'ex_pushup' }))).toEqual(['reps']);
    expect(legUnitChoices(leg({ hold: undefined, exercise_id: 'ex_pushup', count_mode: 'reps' }))).toEqual(['sets']);
  });
});

describe('branché sur la feuille et le store', () => {
  const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('un bouton par unité possible dans la feuille « Changer d’exo », qui passe par le store', () => {
    const sheet = src('src/components/ComboSwapSheet.vue');
    expect(sheet).toContain('data-test="sw-switch"');
    expect(sheet).toContain("comboUnitBlocker(cc, l.exercise_id, m) === null");
    expect(sheet).toContain('combo.switchUnit(cc.id, l.exercise_id, m)');
    const store = src('src/stores/combo.ts');
    expect(store).toContain('switchLegUnit(c, exerciseId, to)');
    expect(store).toMatch(/return \{[\s\S]*switchUnit,/);
  });
});

describe('↩ les séries faites avant le changement sont CONSERVÉES et marquées', () => {
  it('les séries d’avant gardent leurs valeurs et portent `before` ; celles d’après non', () => {
    const c = combo([leg({ sets: [set(40), set(35, 1)] })]);
    const next = only(switchLegUnit(c, 'ex_plank', 'time'));
    expect(next.sets).toHaveLength(2);
    expect(next.sets!.map((s) => s.reps)).toEqual([40, 35]); // valeurs inchangées
    expect(next.sets!.every((s) => s.before === true)).toBe(true);
    // Une série faite APRÈS n'est pas « avant ».
    const after = { ...next, sets: [...next.sets!, set(30, 2)] };
    expect(legBeforeSets(after).map((s) => s.reps)).toEqual([40, 35]);
  });
  it('l’exo d’origine n’est pas marqué (copie), et un second changement garde les marques', () => {
    const c = combo([leg({ sets: [set(40)] })]);
    switchLegUnit(c, 'ex_plank', 'time');
    expect(c.legs[0]!.sets![0]!.before).toBeUndefined();
    const once = combo(switchLegUnit(c, 'ex_plank', 'time'));
    const withNew = combo([{ ...once.legs[0]!, sets: [...once.legs[0]!.sets!, set(30, 1)] }]);
    const twice = only(switchLegUnit(withNew, 'ex_plank', 'sets'));
    expect(twice.sets!.every((s) => s.before === true)).toBe(true);
    expect(legBeforeSets(twice)).toHaveLength(2);
  });
  it('l’ancien format `progress` est converti en séries marquées, sans doublon', () => {
    const old = leg({ exercise_id: 'ex_pushup', progress: [{ date: D1, reps: 40 }], hold: undefined, count_mode: 'sets', target: 4 });
    delete old.sets;
    const next = only(switchLegUnit(combo([old]), 'ex_pushup', 'reps'), 'ex_pushup');
    expect(next.progress).toBeUndefined();
    expect(next.sets).toHaveLength(1);
    expect(legDone(next)).toBe(next.sets![0]!.reps);
  });
  it('l’en-tête de l’exo et l’historique les montrent à part', () => {
    const head = readFileSync(new URL('../src/components/ComboLegHead.vue', import.meta.url), 'utf8');
    expect(head).toContain('data-test="lh-before"');
    expect(head).toContain('legBeforeSets(props.leg)');
    const hist = readFileSync(new URL('../src/components/ComboSetHistory.vue', import.meta.url), 'utf8');
    expect(hist).toContain('data-test="hist-before"');
  });
});
