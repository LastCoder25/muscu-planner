import { describe, it, expect } from 'vitest';
import { sumPhases, paceLabel, phaseSummary } from '@/data/cardio';
import { cardioSessionXp } from '@/lib/athlete';
import type { CardioPhase, CardioLog } from '@/lib/types';

describe('sumPhases', () => {
  it('somme durées et distances (avec fractionné)', () => {
    const phases: CardioPhase[] = [
      { kind: 'echauffement', duration_sec: 600 },
      { kind: 'intervalle', reps: 10, work_m: 400, rest_sec: 60 },
      { kind: 'retour_calme', duration_sec: 300 },
    ];
    const t = sumPhases(phases);
    // 600 + 10*(0+60) + 300 = 1500 s = 25 min ; 10*400 = 4000 m = 4 km
    expect(t.duration_min).toBe(25);
    expect(t.distance_km).toBe(4);
  });
});

describe('paceLabel', () => {
  it('calcule min/km', () => {
    expect(paceLabel(10, 50)).toBe('5:00/km');
    expect(paceLabel(0, 30)).toBeNull();
  });
});

describe('phaseSummary', () => {
  it('fractionné avec repos', () => {
    expect(phaseSummary({ kind: 'intervalle', reps: 10, work_m: 400, rest_sec: 60 })).toBe(
      '10 × 400 m / 60 s récup',
    );
  });
  it('fractionné sans repos', () => {
    expect(phaseSummary({ kind: 'intervalle', reps: 8, work_sec: 30 })).toBe('8 × 30 s (sans repos)');
  });
  it('phase simple', () => {
    expect(phaseSummary({ kind: 'endurance', duration_sec: 600 })).toBe('10 min');
  });
});

describe('cardioSessionXp', () => {
  const log = (o: Partial<CardioLog>): CardioLog => ({
    schema_version: '1.0',
    type: 'cardio_log',
    id: 'c',
    activity: 'course',
    ...o,
  });
  it('distance + D+ + intensité', () => {
    // 40 + 10*10 + 200/10 + 3*10 = 40+100+20+30 = 190
    expect(cardioSessionXp(log({ distance_km: 10, elevation_m: 200, rpe: 3 }))).toBe(190);
  });
  it('sans distance : compte la durée', () => {
    // 40 + 30*0.8(=24) + 0 + 20(note défaut 2) = 84
    expect(cardioSessionXp(log({ duration_min: 30 }))).toBe(84);
  });
});
