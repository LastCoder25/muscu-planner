// 🔀 Basculer une PART du reste d'un exo (« il me reste 7 séries de dips : 4 sur un exo, 3 sur
// un autre »). Complète `comboTransfer.test.ts` (tout / tout le reste).
import { describe, expect, it } from 'vitest';
import {
  comboTransferBlocker,
  comboTransferPlan,
  legDone,
  legRemaining,
  transferComboLeg,
  type ComboChallenge,
  type ComboLeg,
  type ComboNewExercise,
} from '@/lib/combo';

const D1 = '2099-01-05';
function leg(p: Partial<ComboLeg>): ComboLeg {
  return {
    slot: 'push',
    exercise_id: 'ex_dips',
    exercise_name: 'Dips',
    muscle_primary: 'pectoraux',
    rep_weight: 1.3,
    target: 14,
    count_mode: 'sets',
    weight_kg: null,
    sets: [],
    ...p,
  };
}
const sets = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ date: D1, reps: 10, weight: null, at: `${D1}T0${i}:00:00Z` }));
const combo = (legs: ComboLeg[]): ComboChallenge => ({
  id: 'c1',
  name: '360',
  start_date: D1,
  duration_days: 7,
  status: 'active',
  legs,
});
const fresh = (id: string, name: string): ComboNewExercise => ({
  exercise_id: id,
  exercise_name: name,
  muscle_primary: 'pectoraux',
  rep_weight: 1,
  time: false,
  assistable: false,
  rep_min: 8,
  rep_max: 12,
});

describe('🔀 bascule d’une part du reste', () => {
  // 14 séries d'objectif, 7 faites → 7 restantes.
  const c = () => combo([leg({ sets: sets(7) })]);

  it('une part : l’exo garde le surplus, la cible reçoit la part', () => {
    const to = { exercise: fresh('ex_pushup', 'Pompes') };
    const plan = comboTransferPlan(c(), 'ex_dips', to, null, 'rest', 4);
    expect(plan.moved).toBe(4);
    expect(plan.target).toBe(4);
    const legs = transferComboLeg(c(), 'ex_dips', to, plan);
    const dips = legs.find((l) => l.exercise_id === 'ex_dips')!;
    const pompes = legs.find((l) => l.exercise_id === 'ex_pushup')!;
    expect(dips.target).toBe(10); // 14 − 4
    expect(legRemaining(dips)).toBe(3);
    expect(legDone(dips)).toBe(7); // rien de fait n'est touché
    expect(pompes.target).toBe(4);
  });

  it('deux exos d’affilée : 4 + 3 = les 7 restantes, l’exo retombe à ce qui est fait', () => {
    const first = transferComboLeg(
      c(),
      'ex_dips',
      { exercise: fresh('ex_pushup', 'Pompes') },
      comboTransferPlan(c(), 'ex_dips', { exercise: fresh('ex_pushup', 'Pompes') }, null, 'rest', 4),
    );
    const c2 = combo(first);
    const to2 = { exercise: fresh('ex_bench_barbell', 'Développé couché') };
    const plan2 = comboTransferPlan(c2, 'ex_dips', to2, null, 'rest', 3);
    const legs = transferComboLeg(c2, 'ex_dips', to2, plan2);
    const dips = legs.find((l) => l.exercise_id === 'ex_dips')!;
    expect(dips.target).toBe(7);
    expect(legRemaining(dips)).toBe(0);
    expect(legs.find((l) => l.exercise_id === 'ex_bench_barbell')!.target).toBe(3);
  });

  it('sans montant : tout le reste (comportement d’avant)', () => {
    const to = { exercise: fresh('ex_pushup', 'Pompes') };
    const plan = comboTransferPlan(c(), 'ex_dips', to, null, 'rest');
    expect(plan.moved).toBe(7);
    const legs = transferComboLeg(c(), 'ex_dips', to, plan);
    expect(legs.find((l) => l.exercise_id === 'ex_dips')!.target).toBe(7);
  });

  it('un montant au-delà du reste est ramené au reste', () => {
    const plan = comboTransferPlan(c(), 'ex_dips', { exercise: fresh('ex_pushup', 'Pompes') }, null, 'rest', 99);
    expect(plan.moved).toBe(7);
  });

  it('rien de fait : une part est permise, tout le reste ne l’est pas (objectif nul)', () => {
    const none = combo([leg({ sets: [] })]);
    const to = { exercise: fresh('ex_pushup', 'Pompes') };
    expect(comboTransferBlocker(none, 'ex_dips', to, 'rest')).toBe('nothingDone');
    expect(comboTransferBlocker(none, 'ex_dips', to, 'rest', 14)).toBe('nothingDone');
    expect(comboTransferBlocker(none, 'ex_dips', to, 'rest', 6)).toBeNull();
    const legs = transferComboLeg(none, 'ex_dips', to, comboTransferPlan(none, 'ex_dips', to, null, 'rest', 6));
    expect(legs.find((l) => l.exercise_id === 'ex_dips')!.target).toBe(8);
  });

  it('une part vers un exo déjà dans le défi', () => {
    const cc = combo([
      leg({ sets: sets(7) }),
      leg({ exercise_id: 'ex_bench_barbell', exercise_name: 'Développé', target: 6 }),
    ]);
    const to = { leg: 'ex_bench_barbell' };
    const legs = transferComboLeg(cc, 'ex_dips', to, comboTransferPlan(cc, 'ex_dips', to, null, 'rest', 2));
    expect(legs.find((l) => l.exercise_id === 'ex_bench_barbell')!.target).toBe(8);
    expect(legs.find((l) => l.exercise_id === 'ex_dips')!.target).toBe(12);
  });
});
