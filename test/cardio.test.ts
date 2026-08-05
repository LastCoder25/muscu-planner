import { describe, it, expect } from 'vitest';
import { paceLabel, speedKmh, effortKm, effortPace, effortSpeedKmh } from '@/data/cardio';
import { cardioSessionXp } from '@/lib/athlete';
import type { CardioLog } from '@/lib/types';

describe('paceLabel / speedKmh', () => {
  it('allure et vitesse', () => {
    expect(paceLabel(10, 50)).toBe('5:00/km');
    expect(speedKmh(10, 50)).toBe(12);
  });
  it('null si données manquantes', () => {
    expect(paceLabel(0, 30)).toBeNull();
    expect(speedKmh(5, 0)).toBeNull();
  });
});

describe('allure / vitesse d’effort (dénivelé)', () => {
  it('effortKm : distance + (D+ + D-)/100', () => {
    expect(effortKm(10, 200, 100)).toBe(13); // 10 + 300/100
    expect(effortKm(10, 0, 0)).toBe(10);
  });
  it('allure d’effort plus rapide que l’allure réelle (terrain plus dur)', () => {
    // 10 km en 60 min = 6:00/km ; effort sur 13 km-effort → plus rapide
    expect(paceLabel(10, 60)).toBe('6:00/km');
    const ep = effortPace(10, 60, 200, 100)!; // 60min / 13 km
    expect(ep).toBe('4:37/km');
  });
  it('vitesse d’effort > vitesse réelle', () => {
    expect(effortSpeedKmh(10, 60, 200, 100)!).toBeGreaterThan(speedKmh(10, 60)!);
  });
});

describe('cardioSessionXp (log global)', () => {
  const log = (o: Partial<CardioLog>): CardioLog => ({
    schema_version: '1.0',
    type: 'cardio_log',
    id: 'c',
    activity: 'course',
    ...o,
  });
  it('distance + durée (×facteur) + D+ + D-', () => {
    // (10*4 + 50*2.4=120)*1 = 160 + (200+100)/10(=30) = 190
    expect(
      cardioSessionXp(
        log({ distance_km: 10, duration_min: 50, elevation_m: 200, descent_m: 100, rpe: 3 }),
      ),
    ).toBe(190);
  });
  it('D- compte autant que D+', () => {
    const up = cardioSessionXp(log({ distance_km: 5, duration_min: 30, elevation_m: 300 }));
    const down = cardioSessionXp(log({ distance_km: 5, duration_min: 30, descent_m: 300 }));
    expect(up).toBe(down);
  });
  it('sortie sans distance : la durée compte', () => {
    // (0 + 30*2.4=72)*1 = 72
    expect(cardioSessionXp(log({ duration_min: 30 }))).toBe(72);
  });
  it('la marche vaut moins que la course (pondération)', () => {
    const base = { distance_km: 10, duration_min: 50, rpe: 2 as const };
    const course = cardioSessionXp(log({ ...base, activity: 'course' }));
    const marche = cardioSessionXp(log({ ...base, activity: 'marche' }));
    expect(marche).toBeLessThan(course);
    // marche : (10*4 + 50*2.4=120)*0.45 = 72
    expect(marche).toBe(72);
  });
});
