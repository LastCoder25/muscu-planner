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
  it('distance + durée (×facteur, durée dominante) + D+ + D-', () => {
    // ((10*2 + 50*3=150)*1 = 170 + 300/10=30) = 200 × XP_MULT(2) = 400
    expect(
      cardioSessionXp(
        log({ distance_km: 10, duration_min: 50, elevation_m: 200, descent_m: 100, rpe: 3 }),
      ),
    ).toBe(400);
  });
  it('D- compte autant que D+', () => {
    const up = cardioSessionXp(log({ distance_km: 5, duration_min: 30, elevation_m: 300 }));
    const down = cardioSessionXp(log({ distance_km: 5, duration_min: 30, descent_m: 300 }));
    expect(up).toBe(down);
  });
  it('sortie sans distance : la durée compte', () => {
    // (0 + 30*3=90)*1 = 90 × XP_MULT(2) = 180
    expect(cardioSessionXp(log({ duration_min: 30 }))).toBe(180);
  });
  it('une longue sortie facile > une courte rapide (pro-EF)', () => {
    const longEasy = cardioSessionXp(log({ distance_km: 10, duration_min: 60 }));
    const shortFast = cardioSessionXp(log({ distance_km: 10, duration_min: 35 }));
    expect(longEasy).toBeGreaterThan(shortFast);
  });
  it('la charge portée (lest) augmente l’XP (+3 %/kg)', () => {
    const plain = cardioSessionXp(log({ distance_km: 5, duration_min: 60 }));
    const loaded = cardioSessionXp(log({ distance_km: 5, duration_min: 60, load_kg: 10 }));
    expect(loaded).toBeGreaterThan(plain);
    // 10 kg → ×1,3 (plafonné à +60 % ⇒ 20 kg).
    expect(loaded / plain).toBeCloseTo(1.3, 1);
  });
  it('la marche vaut moins que la course (pondération)', () => {
    const base = { distance_km: 10, duration_min: 50, rpe: 2 as const };
    const course = cardioSessionXp(log({ ...base, activity: 'course' }));
    const marche = cardioSessionXp(log({ ...base, activity: 'marche' }));
    expect(marche).toBeLessThan(course);
    // marche : ((10*2 + 50*3=150)=170)*0.50=85 × XP_MULT(2) = 170 (intensité 50/100)
    expect(marche).toBe(170);
  });
});
