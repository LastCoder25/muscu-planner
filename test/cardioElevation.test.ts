import { describe, expect, it } from 'vitest';
import {
  CARDIO_ACTIVITIES,
  activityHasElevation,
  activityHasIncline,
  activitiesShownBy,
  challengeIdsForActivity,
  climbKmPer100m,
  descentWeight,
  effortKm,
  elevationFromIncline,
  inclineFromElevation,
} from '@/data/cardio';
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

  it('🏃 les tapis saisissent une PENTE (%) et un D+ ; eux seuls, et jamais de D-', () => {
    for (const a of ['marche_tapis', 'course_tapis'] as const) {
      expect(activityHasElevation(a), a).toBe(true);
      expect(activityHasIncline(a), a).toBe(true);
    }
    for (const a of ['marche', 'rando', 'course', 'trail', 'velo', 'velo_appart'] as const)
      expect(activityHasIncline(a), a).toBe(false);
  });

  it('pente ⇄ dénivelé : D+ = distance × pente, et inversement', () => {
    expect(elevationFromIncline(5, 5)).toBe(250); // 5 km à 5 %
    expect(elevationFromIncline(10, 1.5)).toBe(150);
    expect(inclineFromElevation(5, 250)).toBe(5);
    expect(inclineFromElevation(8, 100)).toBe(1.3); // arrondi au dixième
    // aller-retour : pente → D+ → pente
    expect(inclineFromElevation(6, elevationFromIncline(6, 4)!)).toBe(4);
  });

  it('rien à calculer sans distance ni pente (jamais de NaN ni de 0 inventé)', () => {
    expect(elevationFromIncline(null, 5)).toBeNull();
    expect(elevationFromIncline(5, null)).toBeNull();
    expect(elevationFromIncline(0, 5)).toBeNull();
    expect(elevationFromIncline(5, 0)).toBeNull();
    expect(inclineFromElevation(5, null)).toBeNull();
    expect(inclineFromElevation(null, 100)).toBeNull();
  });

  it('un tapis incliné rapporte de l’XP comme n’importe quelle sortie à dénivelé', () => {
    const flat = cardioSessionXp(log('course_tapis'));
    const hill = cardioSessionXp(
      log('course_tapis', { elevation_m: elevationFromIncline(20, 5)! }),
    );
    expect(hill).toBeGreaterThan(flat);
  });

  it('chaque activité du catalogue a une réponse explicite (aucune oubliée)', () => {
    for (const a of CARDIO_ACTIVITIES) expect(typeof a.hasElevation, a.id).toBe('boolean');
  });

  it.each(['velo', 'velo_appart', 'marche', 'course'] as const)(
    '« %s » : la montée rapporte de l’XP',
    (a) => {
      const flat = cardioSessionXp(log(a));
      expect(cardioSessionXp(log(a, { elevation_m: 300 }))).toBeGreaterThan(flat);
    },
  );

  it.each(['marche', 'rando', 'course', 'trail'] as const)(
    '« %s » : la descente compte à plein, comme la montée',
    (a) => {
      const flat = cardioSessionXp(log(a));
      expect(cardioSessionXp(log(a, { descent_m: 300 }))).toBeGreaterThan(flat);
      expect(cardioSessionXp(log(a, { elevation_m: 200, descent_m: 100 }))).toBe(
        cardioSessionXp(log(a, { elevation_m: 300 })),
      );
    },
  );

  it.each(['velo', 'velo_appart', 'marche_tapis', 'course_tapis'] as const)(
    '🚲 « %s » : la descente ne rapporte rien (ni XP ni effort)',
    (a) => {
      expect(descentWeight(a)).toBe(0);
      expect(cardioSessionXp(log(a, { descent_m: 800 }))).toBe(cardioSessionXp(log(a)));
      expect(effortKm(20, 0, 800, a)).toBe(20);
    },
  );

  it('⛰️ 100 m de montée valent 3 km à vélo, 1 km à pied', () => {
    expect(climbKmPer100m('velo')).toBe(3);
    expect(climbKmPer100m('velo_appart')).toBe(3);
    for (const a of ['marche', 'rando', 'course', 'trail', 'marche_tapis', 'course_tapis'] as const)
      expect(climbKmPer100m(a), a).toBe(1);
    expect(effortKm(40, 500, 500, 'velo')).toBe(55); // 40 + 5 × 3 ; descente ignorée
    expect(effortKm(10, 200, 100, 'course')).toBe(13); // 10 + 3, inchangé
    expect(effortKm(10, 200, 100)).toBe(13); // sans activité : comme à pied
  });
});

describe('🚴 le défi Vélo prend le vélo ET le vélo d’appartement', () => {
  it('les deux nourrissent le même défi', () => {
    expect(challengeIdsForActivity('velo')).toEqual(['ex_ch_velo']);
    expect(challengeIdsForActivity('velo_appart')).toEqual(['ex_ch_velo']);
  });
  it('le filtre « Vélo » de l’historique montre aussi l’appartement, pas l’inverse', () => {
    expect(activitiesShownBy('velo')).toEqual(['velo', 'velo_appart']);
    expect(activitiesShownBy('velo_appart')).toEqual(['velo_appart']);
    expect(activitiesShownBy('course')).toEqual(['course']);
  });
});
