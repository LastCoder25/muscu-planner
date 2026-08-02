import { describe, it, expect } from 'vitest';
import { sumPhases, paceLabel, phaseSummary } from '@/data/cardio';
import { cardioSessionXp } from '@/lib/athlete';
import { buildRunSession, paceFromVma, vmaFromDemiCooper } from '@/lib/cardio';
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
    expect(phaseSummary({ kind: 'intervalle', reps: 8, work_sec: 30 })).toBe(
      '8 × 30 s (sans repos)',
    );
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

describe('VMA', () => {
  it('vmaFromDemiCooper : distance / 100', () => {
    expect(vmaFromDemiCooper(1500)).toBe(15);
    expect(vmaFromDemiCooper(1720)).toBe(17.2);
  });
  it('paceFromVma : allure au %VMA', () => {
    expect(paceFromVma(15, 1.0)).toBe('4:00/km');
    expect(paceFromVma(15, 0.5)).toBe('8:00/km');
    expect(paceFromVma(0, 1)).toBe('—');
  });
});

describe('buildRunSession', () => {
  it('fractionné court : échauffement → intervalle → retour au calme', () => {
    const s = buildRunSession('fractionne_court', 15, { level: 'intermediaire' });
    expect(s.phases[0]!.kind).toBe('echauffement');
    expect(s.phases.at(-1)!.kind).toBe('retour_calme');
  });
  it('fractionné court : 10×400 m à ~100 % VMA', () => {
    const s = buildRunSession('fractionne_court', 15, { level: 'intermediaire' });
    const it = s.phases.find((p) => p.kind === 'intervalle')!;
    expect(it.reps).toBe(10);
    expect(it.work_m).toBe(400);
    expect(it.pace).toBe('4:00/km');
  });
  it('débutant : moins de répétitions', () => {
    const s = buildRunSession('fractionne_court', 15, { level: 'debutant' });
    const it = s.phases.find((p) => p.kind === 'intervalle')!;
    expect(it.reps).toBe(8);
  });
  it('endurance : durée du bloc central paramétrable', () => {
    const s = buildRunSession('endurance', 15, { duration_min: 45 });
    const endu = s.phases.find((p) => p.kind === 'endurance')!;
    expect(endu.duration_sec).toBe(30 * 60); // 45 - 15
  });
});
