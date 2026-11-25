// Non-régression du mode « par exercice » : les nombres ci-dessous ont été relevés SUR LE CODE
// D'AVANT l'abstraction `comboGoals` (v1.356.0) et recopiés en dur. Si l'un bouge, le mode exo
// n'est plus identique à ce qu'il était.
import { describe, it, expect } from 'vitest';
import {
  comboProgressPct,
  comboComplete,
  comboPace,
  comboBar,
  comboTieredBonus,
  comboXpPoints,
  comboCountedSets,
  comboClosed,
  comboChestEligible,
  legTier,
  type ComboChallenge,
  type ComboLeg,
  type ComboSet,
} from '@/lib/combo';
import { bodyBalance } from '@/lib/bodyBalance';

const sets = (n: number, reps = 10, date = '2026-09-14'): ComboSet[] =>
  Array.from({ length: n }, () => ({ date, reps, weight: 20 }));
const leg = (over: Partial<ComboLeg>): ComboLeg => ({
  slot: 'push',
  exercise_id: 'bench',
  exercise_name: 'Développé couché',
  muscle_primary: 'pectoraux',
  rep_weight: 1,
  target: 6,
  sets: [],
  ...over,
});
function defi(over: Partial<ComboChallenge> = {}): ComboChallenge {
  return {
    id: 'c1',
    name: 'Défi 360',
    start_date: '2026-09-14',
    duration_days: 7,
    status: 'active',
    legs: [
      leg({ sets: sets(6) }), // 6/6 bouclé
      leg({
        slot: 'pull',
        exercise_id: 'row',
        exercise_name: 'Rowing',
        muscle_primary: 'dos',
        target: 5,
        sets: sets(4),
      }), // 4/5 = 80 %
      leg({
        slot: 'squat',
        exercise_id: 'squat',
        exercise_name: 'Squat',
        muscle_primary: 'quadriceps',
        target: 4,
        sets: sets(1),
      }),
      leg({
        slot: 'core',
        exercise_id: 'plank',
        exercise_name: 'Planche',
        muscle_primary: 'abdominaux',
        target: 90,
        count_mode: 'time',
        sets: [{ date: '2026-09-15', reps: 30 }],
      }),
      leg({
        slot: 'biceps',
        exercise_id: 'curl',
        exercise_name: 'Curl',
        muscle_primary: 'biceps',
        target: 100,
        count_mode: 'reps',
        sets: sets(3, 12, '2026-09-15'),
      }),
    ],
    ...over,
  };
}
const PRIMARIES: Record<string, string> = { bench: 'pectoraux', row: 'dos' };

describe('mode exo : mêmes nombres qu’avant l’abstraction', () => {
  it('avancement : moyenne des fractions bornées (dixième près)', () => {
    // (1 + 0,8 + 0,25 + 1/3 + 0,36) / 5 = 0,5489
    expect(comboProgressPct(defi())).toBe(54.9);
    expect(comboComplete(defi())).toBe(false);
  });

  it('avancement : un exo au-delà de sa cible ne compense pas le retard d’un autre', () => {
    const c = defi({ legs: [leg({ sets: sets(9) }), leg({ exercise_id: 'x', sets: [] })] });
    expect(comboProgressPct(c)).toBe(50);
  });

  it('un exo sans cible compte au dénominateur mais jamais au numérateur', () => {
    const c = defi({ legs: [leg({ sets: sets(6) }), leg({ exercise_id: 'z', target: 0 })] });
    expect(comboProgressPct(c)).toBe(50);
    expect(comboComplete(c)).toBe(false);
  });

  it('bouclé : tous les exos à leur cible', () => {
    const c = defi({
      legs: [leg({ sets: sets(6) }), leg({ exercise_id: 'r', target: 2, sets: sets(2) })],
    });
    expect(comboComplete(c)).toBe(true);
    expect(comboProgressPct(c)).toBe(100);
    expect(comboClosed(c, '2026-09-15')).toBe(true);
    expect(comboChestEligible(c)).toBe(true);
  });

  it('retard et barre : le 4e jour, 57 % attendus', () => {
    const p = comboPace(defi(), '2026-09-17');
    expect(p.onTimePct).toBe(57);
    expect(p.donePct).toBe(54.9);
    expect(p.latePct).toBeCloseTo(2.1, 9);
    expect(p.state).toBe('behind');
    const b = comboBar(p);
    expect(b.fill).toBe(54.9);
    expect(b.mark).toBe(57);
    expect(b.ticks).toHaveLength(6);
  });

  it('paliers par exo : 80 % → secondaire, 100 % → principal', () => {
    expect(legTier(leg({ sets: sets(6) }))).toBe('principal');
    expect(legTier(leg({ target: 5, sets: sets(4) }))).toBe('secondary');
    expect(legTier(leg({ sets: sets(3) }))).toBe('none');
  });

  it('prime : versée à la fin seulement, 0 en route, valeur figée', () => {
    expect(comboTieredBonus(defi(), undefined, '2026-09-16')).toBe(0);
    expect(comboTieredBonus(defi(), undefined, '2026-09-22')).toBeCloseTo(16.875, 9);
    expect(comboTieredBonus(defi({ status: 'abandoned' }), undefined, '2026-09-22')).toBe(0);
  });

  it('XP et séries comptées', () => {
    expect(comboCountedSets(defi())).toBe(18);
    expect(comboXpPoints([defi()])).toBe(494);
  });

  it('3 jours : objectifs au prorata (fraction identique), barre en 3 jours', () => {
    const c = defi({ duration_days: 3 });
    expect(comboProgressPct(c)).toBe(54.9);
    expect(comboBar(comboPace(c, '2026-09-15')).ticks).toHaveLength(2);
  });

  it('équilibre du corps : cible du 360 par muscle (séries) et fait', () => {
    const rows = bodyBalance(
      {
        sessions: [],
        combos: [defi()],
        challenges: [],
        bossHits: [],
        targets: { pectoraux: 10, dos: 10, quadriceps: 10 },
        objective: null,
        secondaries: (id: string) => (id === 'bench' ? ['triceps'] : []),
        primaries: (id: string) => PRIMARIES[id] ?? null,
        today: '2026-09-16',
      },
      'week',
    );
    const by = Object.fromEntries(rows.map((r) => [r.muscle, [r.done, r.value]]));
    expect(by).toEqual({ pectoraux: [6, 6], dos: [4, 5], quadriceps: [1, 4] });
  });
});
