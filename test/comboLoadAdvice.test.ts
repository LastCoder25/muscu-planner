import { describe, expect, it } from 'vitest';
import {
  legLoadAdvice,
  loadBlocks,
  updateSetAt,
  type ComboChallenge,
  type ComboLeg,
  type ComboSet,
} from '@/lib/combo';

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
/** Série sans heure : chacune est un bloc à elle seule. */
const s = (reps: number, weight: number | null = 40, date = '2026-09-20'): ComboSet => ({
  date,
  reps,
  weight,
});
/** Série horodatée à la minute `min` de la journée. */
const t = (reps: number, min: number, weight: number | null = 40): ComboSet => ({
  ...s(reps, weight),
  at: new Date(Date.UTC(2026, 8, 20, 8, min)).toISOString(),
});

describe('legLoadAdvice — charge conseillée d’un exo du 360', () => {
  it('jamais fait : aucun conseil', () => {
    expect(legLoadAdvice(leg([]), [], R)).toBeNull();
  });

  it('il faut DEUX séries au haut de la fourchette pour monter, sans dire de combien', () => {
    expect(legLoadAdvice(leg([s(12)]), [], R)?.call).toBe('hold');
    expect(legLoadAdvice(leg([s(12), s(12)]), [], R)).toEqual({
      weight: 40,
      assisted: false,
      call: 'up',
      reps: 8,
    });
  });

  it('une série très en forme isolée ne suffit pas à monter', () => {
    expect(legLoadAdvice(leg([s(9), s(12), s(10)]), [], R)?.call).toBe('hold');
  });

  it('deux sur les trois dernières suffisent, même avec une moins bonne au milieu', () => {
    expect(legLoadAdvice(leg([s(12), s(9), s(12)]), [], R)?.call).toBe('up');
  });

  it('seules les 3 dernières comptent', () => {
    // Les deux 12 anciens sortent de la fenêtre.
    expect(legLoadAdvice(leg([s(12), s(12), s(9), s(10), s(11)]), [], R)?.call).toBe('hold');
  });

  it('une série ratée en fin de journée ne fait pas alléger', () => {
    expect(legLoadAdvice(leg([s(10), s(6)]), [], R)?.call).toBe('hold');
  });

  it('deux séries sous la fourchette : trop lourd, on allège', () => {
    expect(legLoadAdvice(leg([s(6, 50), s(7, 50)]), [], R)?.call).toBe('down');
  });

  it('entre les deux : on vise la meilleure récente + 1, bornée par le haut', () => {
    expect(legLoadAdvice(leg([s(9), s(7), s(8)]), [], R)?.reps).toBe(10);
    expect(legLoadAdvice(leg([s(11), s(9)]), [], R)?.reps).toBe(12);
  });

  it('seules les séries à la charge ACTUELLE comptent — le conseil repart à chaque montée', () => {
    const a = legLoadAdvice(leg([s(12), s(12), s(9, 42.5)]), [], R);
    expect(a).toEqual({ weight: 42.5, assisted: false, call: 'hold', reps: 10 });
  });

  it('les jours différents comptent aussi : le 360 n’a pas de séance', () => {
    const a = legLoadAdvice(leg([s(12, 40, '2026-09-18'), s(12, 40, '2026-09-20')]), [], R);
    expect(a?.call).toBe('up');
  });

  it('sans série dans ce 360, on lit le 360 précédent le plus RÉCENT', () => {
    const old = combo('2026-09-01', [leg([s(6, 30), s(6, 30)])]);
    const recent = combo('2026-09-08', [leg([s(12, 35), s(12, 35)])]);
    expect(legLoadAdvice(leg([]), [old, recent], R)?.weight).toBe(35);
  });

  it('les séries de ce 360 priment sur l’historique', () => {
    const past = combo('2026-09-08', [leg([s(12, 35)])]);
    expect(legLoadAdvice(leg([s(9, 37.5)]), [past], R)?.weight).toBe(37.5);
  });

  it('un autre exo de l’historique est ignoré', () => {
    const past = combo('2026-09-08', [leg([s(12, 35)], { exercise_id: 'ex_squat' })]);
    expect(legLoadAdvice(leg([]), [past], R)).toBeNull();
  });

  it('poids du corps sans lest : pas de charge, mais un verdict', () => {
    expect(legLoadAdvice(leg([s(12, null), s(12, null)]), [], R)).toEqual({
      weight: null,
      assisted: false,
      call: 'up',
      reps: 8,
    });
  });

  it('assisté : le verdict le dit, et ne se mélange pas aux séries sans assistance', () => {
    const a = legLoadAdvice(
      leg([s(12, null), s(12, null), { ...s(9, null), assisted: true }]),
      [],
      R,
    );
    expect(a).toEqual({ weight: null, assisted: true, call: 'hold', reps: 10 });
  });

  it('gainage (durée) : aucun conseil de charge', () => {
    expect(legLoadAdvice(leg([s(60, null)], { count_mode: 'time' }), [], R)).toBeNull();
  });
});

describe('loadBlocks — séries enchaînées contre séries étalées', () => {
  it('des séries sans heure sont chacune un bloc', () => {
    expect(loadBlocks([s(10), s(8), s(7)])).toEqual([10, 8, 7]);
  });

  it('des séries enchaînées (≤ 20 min) ne comptent que par leur meilleure', () => {
    expect(loadBlocks([t(10, 0), t(8, 3), t(7, 6)])).toEqual([10]);
  });

  it('au-delà de 20 min, une nouvelle série est un nouveau bloc', () => {
    expect(loadBlocks([t(10, 0), t(8, 21)])).toEqual([10, 8]);
  });

  it('la borne de 20 min est incluse', () => {
    expect(loadBlocks([t(10, 0), t(8, 20)])).toEqual([10]);
  });

  it('une fatigue enchaînée ne fait pas alléger : 10 puis 6-6 dans la foulée', () => {
    const a = legLoadAdvice(leg([t(10, 0), t(6, 2), t(6, 4)]), [], R);
    expect(a?.call).toBe('hold');
  });

  it('mais les mêmes séries étalées dans la journée, si', () => {
    const a = legLoadAdvice(leg([t(10, 0), t(6, 120), t(6, 300)]), [], R);
    expect(a?.call).toBe('down');
  });

  it('corriger une série garde son heure', () => {
    const out = updateSetAt([t(10, 0)], 0, { reps: 11, weight: 40, assisted: false });
    expect(out[0]!.at).toBe(t(10, 0).at);
  });
});
