import { describe, it, expect } from 'vitest';
import {
  dailyFromHourly,
  scoreReliability,
  compositeScore,
  recommendByLead,
  modelLabel,
  INDICATIVE_N,
  type DailyTruth,
  type DailyForecast,
} from '@/lib/weatherReliability';

describe('dailyFromHourly', () => {
  it('agrège en journées : extrêmes de T, somme de pluie, max de vent, null ignorés', () => {
    const times = ['2026-09-01T00:00', '2026-09-01T12:00', '2026-09-01T18:00', '2026-09-02T12:00'];
    const days = dailyFromHourly(
      times,
      [12.2, 24.9, null, 20],
      [0.4, 0.6, null, 3],
      [10, 25.5, null, 8],
    );
    expect(days).toEqual([
      { date: '2026-09-01', tmax: 24.9, tmin: 12.2, precipMm: 1, windMax: 25.5 },
      { date: '2026-09-02', tmax: 20, tmin: 20, precipMm: 3, windMax: 8 },
    ]);
  });
  it('omet une journée sans aucune température et met le vent à null sans série vent', () => {
    const days = dailyFromHourly(['2026-09-01T00:00', '2026-09-02T00:00'], [null, 15], [1, 0]);
    expect(days).toEqual([{ date: '2026-09-02', tmax: 15, tmin: 15, precipMm: 0, windMax: null }]);
  });
});

describe('compositeScore', () => {
  it('parfait = 100, MAE T 5 °C annule la composante T', () => {
    expect(compositeScore(0, 1, 0)).toBe(100);
    expect(compositeScore(5, 1, 0)).toBe(50);
  });
  it('renormalise sans vent', () => {
    expect(compositeScore(0, 1, null)).toBe(100);
    expect(compositeScore(2.5, 0.5, null)).toBe(
      Math.round(100 * ((0.5 * 0.5 + 0.35 * 0.5) / 0.85)),
    );
  });
});

function truthDays(n: number): DailyTruth[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    tmax: 30,
    tmin: 18,
    precipMm: i % 2 ? 4 : 0, // un jour sur deux il pleut
    windMax: 20,
  }));
}
function forecastDays(
  n: number,
  model: string,
  lead: 1 | 3 | 7,
  bias: number,
  rainRight: boolean,
): DailyForecast[] {
  return truthDays(n).map((t) => ({
    date: t.date,
    model,
    lead,
    tmax: t.tmax + bias,
    tmin: t.tmin + bias,
    precipMm: rainRight ? t.precipMm : t.precipMm ? 0 : 4, // inverse si faux
    windMax: t.windMax! + 5,
  }));
}

describe('scoreReliability', () => {
  it('calcule MAE, biais signé, taux pluie, vent, n ; trie par score', () => {
    const truth = truthDays(10);
    const rows = scoreReliability(truth, [
      ...forecastDays(10, 'a', 1, 1, true), // +1 °C partout, pluie juste
      ...forecastDays(10, 'b', 1, -3, false), // −3 °C, pluie toujours fausse
    ]);
    expect(rows.map((r) => r.model)).toEqual(['a', 'b']);
    const a = rows[0]!;
    expect(a).toMatchObject({ n: 10, tMae: 1, tBias: 1, rainHit: 1, rainMae: 0, windMae: 5 });
    expect(a.score).toBe(compositeScore(1, 1, 5));
    expect(a.indicative).toBe(10 < INDICATIVE_N);
    const b = rows[1]!;
    expect(b).toMatchObject({ tMae: 3, tBias: -3, rainHit: 0, rainMae: 4 });
  });
  it('ignore les jours sans vérité et refuse un score sous 5 jours', () => {
    const rows = scoreReliability(truthDays(3), forecastDays(10, 'a', 3, 0, true));
    expect(rows[0]!.n).toBe(3);
    expect(rows[0]!.score).toBeNull();
  });
  it('vent absent → windMae null et score renormalisé', () => {
    const truth = truthDays(6).map((t) => ({ ...t, windMax: null }));
    const rows = scoreReliability(truth, forecastDays(6, 'a', 7, 0, true));
    expect(rows[0]!.windMae).toBeNull();
    expect(rows[0]!.score).toBe(100);
  });
});

describe('recommendByLead', () => {
  it('donne le meilleur modèle par horizon, en sautant les horizons sans score', () => {
    const truth = truthDays(8);
    const rows = scoreReliability(truth, [
      ...forecastDays(8, 'mf', 1, 0.5, true),
      ...forecastDays(8, 'ec', 1, 2, true),
      ...forecastDays(8, 'ec', 7, 1, true),
      ...forecastDays(2, 'mf', 7, 0, true), // n trop petit → pas de score
    ]);
    expect(recommendByLead(rows)).toEqual({ 1: 'mf', 7: 'ec' });
  });
});

describe('modelLabel', () => {
  it('libellé connu, sinon id brut', () => {
    expect(modelLabel('ecmwf_ifs025')).toBe('ECMWF');
    expect(modelLabel('foo')).toBe('foo');
  });
});
