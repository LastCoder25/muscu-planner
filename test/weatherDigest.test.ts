import { describe, it, expect } from 'vitest';
import { digestDay, WET_MIN_HOURS, parseForecast, type RawForecast } from '@/lib/weather';

// Un lendemain sec, sauf une averse de 21 h à 23 h : le code « journalier » d'Open-Meteo
// dit « pluie » (pire instant), le résumé doit dire « beau temps ».
function forecast(codeAt: (h: number) => number, pctAt: (h: number) => number): RawForecast {
  const times = Array.from({ length: 24 }, (_, h) => `2026-11-24T${String(h).padStart(2, '0')}:00`);
  return {
    current: { temperature_2m: 8, apparent_temperature: 6, weather_code: 0, wind_speed_10m: 5, precipitation: 0 },
    hourly: {
      time: times,
      temperature_2m: times.map(() => 9),
      precipitation_probability: times.map((_, h) => pctAt(h)),
      weather_code: times.map((_, h) => codeAt(h)),
      wind_speed_10m: times.map(() => 8),
    },
    daily: {
      time: ['2026-11-24'],
      weather_code: [63], // le pire instant de la journée
      temperature_2m_max: [11],
      temperature_2m_min: [5],
      precipitation_probability_max: [80],
      wind_speed_10m_max: [20],
    },
  };
}
const run = (raw: RawForecast, from = 0, to = 23) => {
  const d = parseForecast(raw);
  return digestDay(d.days[0]!, d.hours, from, to);
};

describe('digestDay — le temps PENDANT la plage, pas le pire instant', () => {
  const evening = forecast((h) => (h >= 21 && h <= 22 ? 63 : h < 12 ? 1 : 3), (h) => (h >= 21 ? 80 : 5));

  it('une averse de 21 h à 23 h ne fait pas un jour de pluie', () => {
    const d = run(evening);
    expect(d.code).not.toBe(63);
    expect(d.emoji).not.toBe('🌧️');
    expect(d.briefWet).toBe('21h–23h');
  });
  it('la plage « Matin » n’y voit ni pluie ni pourcentage du soir', () => {
    const d = run(evening, 6, 12);
    expect(d.rainPct).toBe(5);
    expect(d.briefWet).toBe('');
  });
  it('le pourcentage couvre la plage, pas les 24 h', () => {
    expect(run(evening).rainPct).toBe(80);
    expect(run(evening, 6, 20).rainPct).toBe(5);
  });
  it('une pluie qui dure compte : WET_MIN_HOURS heures ou plus → icône de pluie', () => {
    const long = forecast((h) => (h >= 14 && h < 14 + WET_MIN_HOURS ? 61 : 3), () => 60);
    const d = run(long);
    expect(d.emoji).toBe('🌧️');
    expect(d.briefWet).toBe('');
  });
  it('juste sous le seuil, la pluie reste brève', () => {
    const short = forecast((h) => (h >= 14 && h < 13 + WET_MIN_HOURS ? 61 : 3), () => 60);
    expect(run(short).briefWet).not.toBe('');
  });
  it('une pluie forte ou un orage compte même d’une heure', () => {
    const storm = forecast((h) => (h === 15 ? 95 : 1), () => 30);
    expect(run(storm).emoji).toBe('⛈️');
    const heavy = forecast((h) => (h === 15 ? 65 : 1), () => 30);
    expect(run(heavy).emoji).toBe('🌧️');
  });
  it('plusieurs types de pluie : on garde le plus sévère', () => {
    const mix = forecast((h) => (h >= 14 && h <= 16 ? 61 : h === 17 ? 82 : 3), () => 60);
    expect(run(mix).emoji).toBe('⛈️');
  });
  it('sans heure dans la plage, on garde le résumé du jour', () => {
    const d = parseForecast(evening);
    expect(digestDay(d.days[0]!, [], 0, 23).code).toBe(63);
  });
});
