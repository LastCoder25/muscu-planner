// « Mon quota du jour » : ce qu'il manque pour être dans les temps ce soir, plafonné.
import { describe, it, expect } from 'vitest';
import {
  comboDayQuota,
  COMBO_QUOTA_MAX_SETS,
  type ComboChallenge,
  type ComboLeg,
} from '@/lib/combo';

const START = '2099-01-05';
const day = (n: number) => `2099-01-${String(5 + n).padStart(2, '0')}`; // n = 0 → jour 1

function leg(p: Partial<ComboLeg>): ComboLeg {
  return {
    slot: 'push',
    exercise_id: 'ex_a',
    exercise_name: 'A',
    muscle_primary: 'pectoraux',
    rep_weight: 1.6,
    target: 14,
    count_mode: 'sets',
    weight_kg: 40,
    sets: [],
    ...p,
  };
}
const done = (n: number, reps = 10) =>
  Array.from({ length: n }, () => ({ date: START, reps, weight: 40, at: `${START}T08:00:00Z` }));
function combo(legs: ComboLeg[], days = 7): ComboChallenge {
  return { id: 'c1', name: '360', start_date: START, duration_days: days, status: 'active', legs };
}

describe('comboDayQuota', () => {
  it('jour 1 : la tranche du jour, pas un rattrapage (14 séries sur 7 j → 2)', () => {
    expect(comboDayQuota(combo([leg({})]), day(0))).toEqual({ ex_a: 2 });
  });

  it('jour 4 sans rien faire : 8 séries dues, plafonnées à 5', () => {
    const q = comboDayQuota(combo([leg({})]), day(3));
    expect(q.ex_a).toBe(COMBO_QUOTA_MAX_SETS);
  });

  it('retire ce qui est déjà fait, et un exo dans les temps est absent', () => {
    expect(comboDayQuota(combo([leg({ sets: done(5) })]), day(3))).toEqual({ ex_a: 3 });
    expect(comboDayQuota(combo([leg({ sets: done(8) })]), day(3))).toEqual({});
  });

  it('arrondi au-dessus : 10 séries sur 7 j, jour 1 → 2 (1,43 dû)', () => {
    expect(comboDayQuota(combo([leg({ target: 10 })]), day(0))).toEqual({ ex_a: 2 });
  });

  it('jamais au-delà du restant', () => {
    // 4 séries au total, 3 faites : il en reste 1 même si 4 sont dues ce soir.
    expect(comboDayQuota(combo([leg({ target: 4, sets: done(3) })]), day(6))).toEqual({ ex_a: 1 });
  });

  it('défi de 3 jours : le dernier jour, tout l’objectif est dû (plafonné)', () => {
    expect(comboDayQuota(combo([leg({ target: 6 })], 3), day(2)).ex_a).toBe(5);
    expect(comboDayQuota(combo([leg({ target: 6 })], 3), day(0)).ex_a).toBe(2);
  });

  it('avant le départ : rien ; après la fin : plein objectif (plafonné)', () => {
    expect(comboDayQuota(combo([leg({})]), '2099-01-01')).toEqual({});
    expect(comboDayQuota(combo([leg({})]), '2099-03-01').ex_a).toBe(5);
  });

  it('mode reps : en reps, plafonné à 5 séries de la dernière série faite', () => {
    const l = leg({ count_mode: 'reps', target: 140, sets: done(1, 10) });
    // jour 4 : dû 80 − 10 faites = 70, plafond 5 × 10 = 50
    expect(comboDayQuota(combo([l]), day(3)).ex_a).toBe(50);
  });

  it('mode durée : par pas de 15 s, jamais au-delà du restant', () => {
    const l = leg({ count_mode: 'time', target: 280, rep_min: 30, rep_max: 40 }); // 40 s/jour
    // jour 1 : dû 40 s → arrondi à 45 s
    expect(comboDayQuota(combo([l]), day(0)).ex_a).toBe(45);
    // il ne reste que 10 s : on ne dépasse pas
    const l2 = leg({ count_mode: 'time', target: 100, sets: done(1, 90) });
    expect(comboDayQuota(combo([l2]), day(6)).ex_a).toBe(10);
  });
});
