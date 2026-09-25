import { describe, expect, it } from 'vitest';
import { legLoadAdvice, type ComboChallenge, type ComboLeg, type ComboSet } from '@/lib/combo';

const R = { min: 8, max: 12 };
const leg = (sets: ComboSet[], extra: Partial<ComboLeg> = {}): ComboLeg => ({
  slot: 'push',
  exercise_id: 'ex_bench',
  exercise_name: 'Développé couché',
  rep_weight: 1,
  target: 10,
  sets,
  ...extra,
});
const combo = (start: string, legs: ComboLeg[]): ComboChallenge =>
  ({ id: start, name: '360', start_date: start, legs }) as unknown as ComboChallenge;

describe('legLoadAdvice — charge conseillée d’un exo du 360', () => {
  it('jamais fait : aucun conseil', () => {
    expect(legLoadAdvice(leg([]), [], R)).toBeNull();
  });

  it('haut de fourchette atteint : on monte, sans dire de combien', () => {
    const a = legLoadAdvice(leg([{ date: '2026-09-20', reps: 12, weight: 40 }]), [], R);
    expect(a).toEqual({ weight: 40, call: 'up', reps: 8 });
  });

  it('dans la fourchette : on garde la charge et on vise une rep de plus', () => {
    const a = legLoadAdvice(leg([{ date: '2026-09-20', reps: 9, weight: 40 }]), [], R);
    expect(a).toEqual({ weight: 40, call: 'hold', reps: 10 });
  });

  it('la rep visée ne dépasse pas le haut de la fourchette', () => {
    const a = legLoadAdvice(leg([{ date: '2026-09-20', reps: 11, weight: 40 }]), [], R);
    expect(a?.reps).toBe(12);
  });

  it('sous le bas de la fourchette : trop lourd, on allège', () => {
    const a = legLoadAdvice(leg([{ date: '2026-09-20', reps: 6, weight: 50 }]), [], R);
    expect(a?.call).toBe('down');
  });

  it('la fatigue des séries suivantes ne fait pas alléger : on lit la meilleure du jour', () => {
    const a = legLoadAdvice(
      leg([
        { date: '2026-09-20', reps: 10, weight: 40 },
        { date: '2026-09-20', reps: 7, weight: 40 },
      ]),
      [],
      R,
    );
    expect(a).toEqual({ weight: 40, call: 'hold', reps: 11 });
  });

  it('la charge de référence est la DERNIÈRE utilisée — le conseil se corrige série après série', () => {
    const a = legLoadAdvice(
      leg([
        { date: '2026-09-20', reps: 12, weight: 40 },
        { date: '2026-09-20', reps: 9, weight: 42.5 },
      ]),
      [],
      R,
    );
    expect(a).toEqual({ weight: 42.5, call: 'hold', reps: 10 });
  });

  it('un autre jour ne compte pas dans la meilleure série', () => {
    const a = legLoadAdvice(
      leg([
        { date: '2026-09-18', reps: 12, weight: 40 },
        { date: '2026-09-20', reps: 9, weight: 40 },
      ]),
      [],
      R,
    );
    expect(a?.call).toBe('hold');
  });

  it('sans série dans ce 360, on lit le 360 précédent le plus RÉCENT', () => {
    const old = combo('2026-09-01', [leg([{ date: '2026-09-02', reps: 6, weight: 30 }])]);
    const recent = combo('2026-09-08', [leg([{ date: '2026-09-09', reps: 12, weight: 35 }])]);
    const a = legLoadAdvice(leg([]), [old, recent], R);
    expect(a).toEqual({ weight: 35, call: 'up', reps: 8 });
  });

  it('les séries de ce 360 priment sur l’historique', () => {
    const past = combo('2026-09-08', [leg([{ date: '2026-09-09', reps: 12, weight: 35 }])]);
    const a = legLoadAdvice(leg([{ date: '2026-09-20', reps: 9, weight: 37.5 }]), [past], R);
    expect(a?.weight).toBe(37.5);
  });

  it('un autre exo de l’historique est ignoré', () => {
    const past = combo('2026-09-08', [
      leg([{ date: '2026-09-09', reps: 12, weight: 35 }], { exercise_id: 'ex_squat' }),
    ]);
    expect(legLoadAdvice(leg([]), [past], R)).toBeNull();
  });

  it('poids du corps sans lest : pas de charge, mais un verdict', () => {
    const a = legLoadAdvice(leg([{ date: '2026-09-20', reps: 12, weight: null }]), [], R);
    expect(a).toEqual({ weight: null, call: 'up', reps: 8 });
  });

  it('gainage (durée) : aucun conseil de charge', () => {
    const a = legLoadAdvice(
      leg([{ date: '2026-09-20', reps: 60, weight: null }], { count_mode: 'time' }),
      [],
      R,
    );
    expect(a).toBeNull();
  });
});
