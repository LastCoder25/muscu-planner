// 🔁 Remplacer des séries de reps par le même exo en TENUE (et l'inverse), en cours de Défi 360
// (v1.362.0 ; demandé : « remplacer des séries de relevés de jambes tendues par le même exercice en
// tenue »). Une jambe qui se COMPTE en séries peut passer d'un exo saisi en reps à un exo saisi en
// secondes quand on ne bascule que le RESTE ; le reste (reps ou secondes comptés au total, séries
// déjà faites à convertir) reste refusé.
import { describe, expect, it } from 'vitest';
import {
  COMBO_TRANSFER_BLOCK_LABEL,
  comboTransferBlocker,
  comboTransferPlan,
  legDone,
  legIsHold,
  transferComboLeg,
  type ComboChallenge,
  type ComboLeg,
  type ComboNewExercise,
} from '@/lib/combo';

const D1 = '2099-01-05';
const leg = (p: Partial<ComboLeg>): ComboLeg => ({
  slot: 'core',
  exercise_id: 'ex_leg_raise_floor',
  exercise_name: 'Relevé de jambes au sol',
  muscle_primary: 'abdominaux',
  rep_weight: 1,
  target: 6,
  count_mode: 'sets',
  sets: [],
  ...p,
});
const combo = (legs: ComboLeg[]): ComboChallenge => ({
  id: 'c1',
  name: '360',
  start_date: D1,
  duration_days: 7,
  status: 'active',
  legs,
});
const done = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ date: D1, reps: 12, weight: null, at: `${D1}T0${i}:00:00Z` }));
const holdEx = (over: Partial<ComboNewExercise> = {}): ComboNewExercise => ({
  exercise_id: 'ex_leg_raise_hold',
  exercise_name: 'Jambes tendues tenues (au sol)',
  muscle_primary: 'abdominaux',
  rep_weight: 1,
  time: true,
  assistable: false,
  rep_min: 30,
  rep_max: 60,
  ...over,
});
const repsEx = (over: Partial<ComboNewExercise> = {}): ComboNewExercise => ({
  exercise_id: 'ex_knee_raise_floor',
  exercise_name: 'Relevé de genoux au sol',
  muscle_primary: 'abdominaux',
  rep_weight: 1,
  time: false,
  assistable: false,
  rep_min: 10,
  rep_max: 15,
  ...over,
});

describe('reps → tenue, en séries, bascule du RESTE', () => {
  const c = combo([leg({ sets: done(2) })]); // 6 séries, 2 faites, 4 à faire
  it('est permis, et l’objectif passe tel quel (une série reste une série)', () => {
    expect(comboTransferBlocker(c, 'ex_leg_raise_floor', { exercise: holdEx() }, 'rest')).toBeNull();
    const plan = comboTransferPlan(c, 'ex_leg_raise_floor', { exercise: holdEx() }, null, 'rest');
    expect(plan.target).toBe(4);
  });
  it('l’exo quitté garde ses séries faites ; le neuf compte en séries ET se saisit en secondes', () => {
    const to = { exercise: holdEx() };
    const plan = comboTransferPlan(c, 'ex_leg_raise_floor', to, null, 'rest');
    const legs = transferComboLeg(c, 'ex_leg_raise_floor', to, plan);
    const [kept, fresh] = legs as [ComboLeg, ComboLeg];
    expect(kept.exercise_id).toBe('ex_leg_raise_floor');
    expect(kept.target).toBe(2);
    expect(legDone(kept)).toBe(2);
    expect(fresh.exercise_id).toBe('ex_leg_raise_hold');
    expect(fresh.count_mode).toBe('sets');
    expect(fresh.hold).toBe(true);
    expect(legIsHold(fresh)).toBe(true);
    expect(fresh.target).toBe(4);
    expect(fresh.sets).toEqual([]);
  });
  it('une PART du reste passe aussi (3 séries de reps restantes → 1 tenue, le reste demeure)', () => {
    const to = { exercise: holdEx() };
    expect(comboTransferBlocker(c, 'ex_leg_raise_floor', to, 'rest', 1)).toBeNull();
    const plan = comboTransferPlan(c, 'ex_leg_raise_floor', to, null, 'rest', 1);
    const [kept, fresh] = transferComboLeg(c, 'ex_leg_raise_floor', to, plan) as [ComboLeg, ComboLeg];
    expect(kept.target).toBe(5);
    expect(fresh.target).toBe(1);
  });
});

describe('ce qui reste refusé', () => {
  it('bascule ENTIÈRE avec des séries déjà faites : leur unité ne se convertit pas', () => {
    const c = combo([leg({ sets: done(2) })]);
    expect(comboTransferBlocker(c, 'ex_leg_raise_floor', { exercise: holdEx() }, 'all')).toBe('entryUnit');
    expect(COMBO_TRANSFER_BLOCK_LABEL.entryUnit).toMatch(/seulement le reste/);
  });
  it('bascule entière SANS série faite : rien à convertir, permis', () => {
    const c = combo([leg({})]);
    expect(comboTransferBlocker(c, 'ex_leg_raise_floor', { exercise: holdEx() }, 'all')).toBeNull();
    const [fresh] = transferComboLeg(c, 'ex_leg_raise_floor', { exercise: holdEx() }) as [ComboLeg];
    expect(fresh.hold).toBe(true);
    expect(fresh.count_mode).toBe('sets');
  });
  it('un exo compté en REPS totales ne passe pas en tenue (reps ≠ secondes)', () => {
    const c = combo([leg({ count_mode: 'reps', target: 60, sets: done(2) })]);
    expect(comboTransferBlocker(c, 'ex_leg_raise_floor', { exercise: holdEx() }, 'rest')).toBe('modeMismatch');
  });
  it('une tenue comptée en DURÉE ne passe pas en reps', () => {
    const c = combo([
      leg({ exercise_id: 'ex_leg_raise_hold', count_mode: 'time', target: 120, sets: done(1) }),
    ]);
    expect(comboTransferBlocker(c, 'ex_leg_raise_hold', { exercise: repsEx() }, 'rest')).toBe('modeMismatch');
  });
});

describe('inchangé : même unité de saisie', () => {
  it('reps → reps en bascule entière (avec séries faites)', () => {
    const c = combo([leg({ sets: done(2) })]);
    expect(comboTransferBlocker(c, 'ex_leg_raise_floor', { exercise: repsEx() }, 'all')).toBeNull();
    const [fresh] = transferComboLeg(c, 'ex_leg_raise_floor', { exercise: repsEx() }) as [ComboLeg];
    expect(fresh.hold).toBeUndefined(); // hérité : un 360 d'avant reste d'avant
    expect(fresh.sets).toHaveLength(2);
  });
  it('tenue en durée → autre tenue en durée', () => {
    const c = combo([
      leg({ exercise_id: 'ex_leg_raise_hold', count_mode: 'time', target: 120, sets: done(1) }),
    ]);
    const to = { exercise: holdEx({ exercise_id: 'ex_knee_raise_floor_hold' }) };
    expect(comboTransferBlocker(c, 'ex_leg_raise_hold', to, 'all')).toBeNull();
    const [fresh] = transferComboLeg(c, 'ex_leg_raise_hold', to) as [ComboLeg];
    expect(fresh.count_mode).toBe('time');
  });
});

describe('tenue en séries → reps, et entre jambes déjà dans le défi', () => {
  it('une tenue comptée en séries passe en reps (reste) : l’exo neuf n’est plus une tenue', () => {
    const c = combo([
      leg({ exercise_id: 'ex_leg_raise_hold', hold: true, count_mode: 'sets', target: 5, sets: done(1) }),
    ]);
    const to = { exercise: repsEx() };
    expect(comboTransferBlocker(c, 'ex_leg_raise_hold', to, 'rest')).toBeNull();
    const plan = comboTransferPlan(c, 'ex_leg_raise_hold', to, null, 'rest');
    const [, fresh] = transferComboLeg(c, 'ex_leg_raise_hold', to, plan) as [ComboLeg, ComboLeg];
    expect(fresh.hold).toBe(false);
    expect(legIsHold(fresh)).toBe(false);
    expect(fresh.target).toBe(4);
  });
  it('vers une jambe déjà présente : séries ↔ séries seulement, reste seulement si l’unité de saisie change', () => {
    const c = combo([
      leg({ sets: done(2) }),
      leg({ exercise_id: 'ex_leg_raise_hold', hold: true, count_mode: 'sets', target: 3 }),
      leg({ exercise_id: 'ex_knee_raise_hold', count_mode: 'time', target: 120 }),
    ]);
    const to = { leg: 'ex_leg_raise_hold' };
    expect(comboTransferBlocker(c, 'ex_leg_raise_floor', to, 'rest')).toBeNull();
    expect(comboTransferBlocker(c, 'ex_leg_raise_floor', to, 'all')).toBe('entryUnit');
    const [, dest] = transferComboLeg(
      c,
      'ex_leg_raise_floor',
      to,
      comboTransferPlan(c, 'ex_leg_raise_floor', to, null, 'rest'),
    ) as ComboLeg[];
    expect(dest!.target).toBe(3 + 4);
    // Une jambe comptée autrement (durée) reste hors de portée.
    expect(
      comboTransferBlocker(c, 'ex_leg_raise_floor', { leg: 'ex_knee_raise_hold' }, 'rest'),
    ).toBe('modeMismatch');
  });
});

describe('⏱️ reste → tenue neuve comptée en DURÉE (choix « Séries | Durée » à l’échange)', () => {
  const c = combo([leg({ sets: done(2) })]); // 6 séries, 2 faites, 4 restantes
  const to = { exercise: holdEx() };
  it('N séries restantes deviennent N × 30 s ; l’exo neuf est une tenue en durée', () => {
    expect(comboTransferBlocker(c, 'ex_leg_raise_floor', to, 'rest', undefined, true)).toBeNull();
    const plan = comboTransferPlan(c, 'ex_leg_raise_floor', to, null, 'rest', undefined, true);
    expect(plan.asTime).toBe(true);
    expect(plan.target).toBe(120);
    const [kept, fresh] = transferComboLeg(c, 'ex_leg_raise_floor', to, plan) as [ComboLeg, ComboLeg];
    expect(kept.target).toBe(2);
    expect(fresh.count_mode).toBe('time');
    expect(fresh.hold).toBe(true);
    expect(fresh.target).toBe(120);
  });
  it('sans le choix : toujours en séries (comportement de la v1.362.0)', () => {
    const plan = comboTransferPlan(c, 'ex_leg_raise_floor', to, null, 'rest');
    expect(plan.asTime).toBeUndefined();
    const [, fresh] = transferComboLeg(c, 'ex_leg_raise_floor', to, plan) as [ComboLeg, ComboLeg];
    expect(fresh.count_mode).toBe('sets');
    expect(fresh.target).toBe(4);
  });
  it('une PART du reste : 1 série → 30 s', () => {
    const plan = comboTransferPlan(c, 'ex_leg_raise_floor', to, null, 'rest', 1, true);
    expect(plan.target).toBe(30);
    expect(plan.moved).toBe(1);
  });
  it('une tenue comptée en séries peut aussi passer en durée', () => {
    const t = combo([leg({ exercise_id: 'ex_plank', hold: true, count_mode: 'sets', target: 5, sets: done(1) })]);
    const plan = comboTransferPlan(t, 'ex_plank', to, null, 'rest', undefined, true);
    expect(plan.target).toBe(4 * 30);
  });
  it('refusé : bascule entière, exo qui n’est pas au temps, exo compté en reps ou en durée, jambe déjà dans le défi', () => {
    const b = (cc: ComboChallenge, from: string, dest: any, scope: 'all' | 'rest') =>
      comboTransferBlocker(cc, from, dest, scope, undefined, true);
    expect(b(c, 'ex_leg_raise_floor', to, 'all')).toBe('modeMismatch');
    expect(b(c, 'ex_leg_raise_floor', { exercise: repsEx() }, 'rest')).toBe('modeMismatch');
    const reps = combo([leg({ count_mode: 'reps', target: 60, sets: done(2) })]);
    expect(b(reps, 'ex_leg_raise_floor', to, 'rest')).toBe('modeMismatch');
    const dur = combo([leg({ exercise_id: 'ex_plank', count_mode: 'time', target: 120, sets: done(1) })]);
    expect(b(dur, 'ex_plank', to, 'rest')).toBe('modeMismatch');
    const two = combo([leg({ sets: done(2) }), leg({ exercise_id: 'ex_leg_raise_hold', hold: true, count_mode: 'sets', target: 3 })]);
    expect(b(two, 'ex_leg_raise_floor', { leg: 'ex_leg_raise_hold' }, 'rest')).toBe('modeMismatch');
  });
  it('transferComboLeg refuse un plan « durée » qui ne tient pas (le store re-vérifie)', () => {
    const forged = { sets: [], target: 120, scope: 'rest' as const, moved: 4, asTime: true };
    expect(() => transferComboLeg(c, 'ex_leg_raise_floor', { exercise: repsEx() }, forged)).toThrow();
    expect(() => transferComboLeg(c, 'ex_leg_raise_floor', to, { ...forged, scope: 'all' as const })).toThrow();
  });
  it('la feuille propose le choix (pastilles Séries | Durée) seulement dans ce cas', async () => {
    const { readFileSync } = await import('node:fs');
    const sheet = readFileSync(new URL('../src/components/ComboSwapSheet.vue', import.meta.url), 'utf8');
    expect(sheet).toContain('data-test="sw-unit"');
    expect(sheet).toContain('data-test="sw-unit-time"');
    expect(sheet).toContain("legMode(leg.value) === 'sets'");
    expect(sheet).toContain('p.to.exercise.time');
  });
});
