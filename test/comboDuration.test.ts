import { describe, it, expect } from 'vitest';
import {
  COMBO_MAX_DAYS,
  COMBO_MIN_DAYS,
  comboDayShare,
  comboProrata,
  type ComboChallenge,
  type ComboLeg,
  comboTieredBonus,
} from '@/lib/combo';
import { comboChestPlan, comboChestReward, CHEST_REF_SETS } from '@/lib/comboChest';

// Durée choisie à la création d'un Défi 360 (3 à 7 jours) : objectifs ET récompenses au
// prorata des jours, pour qu'un défi court ne rapporte pas plus que la semaine qu'il remplace.
describe('durée du Défi 360', () => {
  it('bornée de 3 à 7 jours', () => {
    expect(COMBO_MIN_DAYS).toBe(3);
    expect(COMBO_MAX_DAYS).toBe(7);
    expect(comboDayShare(7)).toBe(1);
    expect(comboDayShare(1)).toBeCloseTo(3 / 7, 9);
    expect(comboDayShare(30)).toBe(1);
    expect(comboDayShare(4)).toBeCloseTo(4 / 7, 9);
  });

  it('les objectifs hebdomadaires sont mis au prorata des jours, jamais sous le plancher', () => {
    expect(comboProrata(14, 7)).toBe(14);
    expect(comboProrata(14, 4)).toBe(8);
    expect(comboProrata(14, 3)).toBe(6);
    expect(comboProrata(3, 3)).toBe(1);
    expect(comboProrata(1, 3)).toBe(1);
    expect(comboProrata(12, 3, 2)).toBe(5);
    expect(comboProrata(3, 3, 2)).toBe(2);
  });

  it('le coffre d’une semaine pleine ne change pas', () => {
    expect(comboChestReward(CHEST_REF_SETS, 26, 7)).toEqual(comboChestReward(CHEST_REF_SETS, 26));
  });

  it('⚠️ un défi court ne rapporte pas plus que sa part de semaine', () => {
    // Même rythme d'entraînement : 3 jours = 3/7 des séries d'une semaine.
    const week = comboChestReward(CHEST_REF_SETS, 26, 7);
    const short = comboChestReward(Math.round((CHEST_REF_SETS * 3) / 7), 26, 3);
    expect(short.gold).toBeLessThan(week.gold * 0.5);
    expect(short.summonStones).toBeLessThan(week.summonStones * 0.5);
    expect(short.energy).toBeLessThan(week.energy * 0.5);
    expect(short.tickets).toBeLessThan(week.tickets);
    // Deux défis de 3 jours au même rythme ne battent pas une semaine.
    expect(short.gold * 2).toBeLessThan(week.gold);
    // La clé reste réservée à une semaine bien remplie.
    expect(short.keys).toBe(0);
  });

  it('le plancher d’effort s’applique à la semaine équivalente, pas au défi court', () => {
    // 3 jours au rythme d'une semaine de référence : facteur d'effort 1, réduit à 3/7.
    const ref = comboChestReward(CHEST_REF_SETS, 26, 7);
    const short = comboChestReward((CHEST_REF_SETS * 3) / 7, 26, 3);
    expect(short.gold).toBe(Math.round((ref.gold * 3) / 7));
  });

  it('un 6 jours intense garde sa clé', () => {
    expect(comboChestReward(Math.round(CHEST_REF_SETS * 1.3 * (6 / 7)), 26, 6).keys).toBe(1);
  });

  it('le plan du coffre passe la durée', () => {
    const plan = comboChestPlan({ id: 'c' }, [], 30, 26, 1, 3);
    expect(plan?.record.gold).toBe(comboChestReward(30, 26, 3).gold);
  });

  it('la prime de bouclage suit l’objectif, donc la durée', () => {
    const leg = (target: number, done: number): ComboLeg => ({
      slot: 'push',
      exercise_id: 'ex',
      exercise_name: 'Pompes',
      muscle_primary: 'chest',
      rep_weight: 1,
      target,
      count_mode: 'sets',
      weight_kg: null,
      assistable: false,
      sets: Array.from({ length: done }, () => ({ reps: 10, date: '2026-10-01' })),
    });
    const mk = (days: number, target: number): ComboChallenge => ({
      id: 'c',
      name: 'Défi 360',
      start_date: '2026-10-01',
      duration_days: days,
      status: 'done',
      legs: [leg(target, target)],
    });
    const week = comboTieredBonus(mk(7, comboProrata(14, 7)), undefined, '2026-10-20');
    const short = comboTieredBonus(mk(3, comboProrata(14, 3)), undefined, '2026-10-20');
    expect(short).toBeLessThan(week * 0.6);
  });
});
