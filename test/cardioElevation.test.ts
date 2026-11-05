import { describe, expect, it } from 'vitest';
import { CARDIO_ACTIVITIES, activityHasElevation, effortKm } from '@/data/cardio';
import { cardioSessionXp } from '@/lib/athlete';
import type { CardioActivity, CardioLog } from '@/lib/types';

const log = (activity: CardioActivity, extra: Partial<CardioLog> = {}): CardioLog =>
  ({
    schema_version: '1.0',
    type: 'cardio_log',
    id: 'x',
    activity,
    performed_at: '2026-11-05T10:00:00Z',
    distance_km: 20,
    duration_min: 60,
    ...extra,
  }) as CardioLog;

describe('⛰️ dénivelé : saisi et pris en compte pour toutes les sorties qui en ont', () => {
  it('marche, rando, course, trail, vélo ET vélo d’appartement saisissent D+ / D-', () => {
    for (const a of ['marche', 'rando', 'course', 'trail', 'velo', 'velo_appart'] as const)
      expect(activityHasElevation(a), a).toBe(true);
  });

  it('les tapis restent sans dénivelé (pas de dénivelé saisi sur un tapis)', () => {
    expect(activityHasElevation('marche_tapis')).toBe(false);
    expect(activityHasElevation('course_tapis')).toBe(false);
  });

  it('chaque activité du catalogue a une réponse explicite (aucune oubliée)', () => {
    for (const a of CARDIO_ACTIVITIES) expect(typeof a.hasElevation, a.id).toBe('boolean');
  });

  it.each(['velo', 'velo_appart', 'marche', 'course'] as const)(
    '« %s » : le dénivelé (D+ ET D-) rapporte de l’XP',
    (a) => {
      const flat = cardioSessionXp(log(a));
      expect(cardioSessionXp(log(a, { elevation_m: 300 }))).toBeGreaterThan(flat);
      expect(cardioSessionXp(log(a, { descent_m: 300 }))).toBeGreaterThan(flat);
      // même barème que la marche et la course : (D+ + D-) / 10 d'XP, avant le multiplicateur
      const both = cardioSessionXp(log(a, { elevation_m: 200, descent_m: 100 }));
      const dplus = cardioSessionXp(log(a, { elevation_m: 300 }));
      expect(both).toBe(dplus);
    },
  );

  it('le dénivelé compte pareil à vélo et à pied (même distance-effort)', () => {
    expect(effortKm(20, 400, 400)).toBe(28);
  });
});
