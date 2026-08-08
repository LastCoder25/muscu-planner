import { describe, it, expect } from 'vitest';
import {
  buildTrophies,
  trophyCounts,
  recordsBeaten,
  type SportEntry,
} from '@/lib/sportAchievements';

const e = (o: Partial<SportEntry>): SportEntry => ({
  sport: 'Course',
  category: 'cardio',
  hasDistance: true,
  date: '2026-08-01',
  durationMin: 0,
  distanceKm: 0,
  dPlus: 0,
  tonnage: 0,
  ...o,
});

describe('buildTrophies', () => {
  it('agrège par sport + records', () => {
    const { perSport } = buildTrophies([
      e({ distanceKm: 10, durationMin: 60 }),
      e({ distanceKm: 5, durationMin: 30, dPlus: 200 }),
    ]);
    const course = perSport.find((s) => s.sport === 'Course')!;
    expect(course.sessions).toBe(2);
    expect(course.totalKm).toBe(15);
    expect(course.totalMin).toBe(90);
    expect(course.records.maxKm).toBe(10);
    expect(course.records.maxDplus).toBe(200);
  });

  it('palier « première séance » débloqué dès 1 séance', () => {
    const { perSport } = buildTrophies([e({ durationMin: 20 })]);
    const first = perSport[0]!.paliers.find((p) => p.threshold === 1 && p.metric === 'sessions')!;
    expect(first.achieved).toBe(true);
  });

  it('paliers distance seulement pour les sports à distance', () => {
    const { perSport } = buildTrophies([
      e({ sport: 'Muscu', category: 'muscu', hasDistance: false, durationMin: 60, tonnage: 2000 }),
    ]);
    const muscu = perSport[0]!;
    expect(muscu.paliers.some((p) => p.metric === 'km_total')).toBe(false);
    expect(muscu.paliers.some((p) => p.metric === 'tonnage_total')).toBe(true);
  });

  it('Everest = palier D+ à 8848 m débloqué', () => {
    const { perSport } = buildTrophies([e({ dPlus: 9000, distanceKm: 20, durationMin: 300 })]);
    const everest = perSport[0]!.paliers.find((p) => p.threshold === 8848)!;
    expect(everest.achieved).toBe(true);
    expect(everest.rarity).toBe('epic');
  });

  it('succès global variété + semaines', () => {
    const { global } = buildTrophies([
      e({ sport: 'Course', date: '2026-08-03' }),
      e({ sport: 'Vélo', date: '2026-08-10' }),
      e({ sport: 'Muscu', category: 'muscu', hasDistance: false, date: '2026-08-17' }),
    ]);
    const v3 = global.find((g) => g.metric === 'variety' && g.threshold === 3)!;
    expect(v3.achieved).toBe(true);
    const w3 = global.find((g) => g.metric === 'weeks' && g.threshold === 2)!;
    expect(w3.achieved).toBe(true); // 3 semaines consécutives
  });

  it('trophyCounts compte les débloqués', () => {
    const t = buildTrophies([e({ distanceKm: 12, durationMin: 70, dPlus: 300 })]);
    const { unlocked, total } = trophyCounts(t);
    expect(total).toBeGreaterThan(0);
    expect(unlocked).toBeGreaterThan(0);
    expect(unlocked).toBeLessThanOrEqual(total);
  });
});

describe('recordsBeaten', () => {
  it('détecte un nouveau record de durée/distance', () => {
    const prev = [e({ durationMin: 40, distanceKm: 8 })];
    const r = recordsBeaten(prev, e({ durationMin: 60, distanceKm: 10 }));
    expect(r).toContain('duration');
    expect(r).toContain('distance');
  });
  it('pas de record si en dessous', () => {
    const prev = [e({ durationMin: 60, distanceKm: 10 })];
    expect(recordsBeaten(prev, e({ durationMin: 30, distanceKm: 5 }))).toEqual([]);
  });
  it('première séance = record', () => {
    expect(recordsBeaten([], e({ durationMin: 30 }))).toContain('duration');
  });
});
