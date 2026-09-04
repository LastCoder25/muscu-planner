import { describe, it, expect } from 'vitest';
import {
  weatherIcon,
  parseForecast,
  hoursOfDay,
  filterHours,
  presetIdFor,
  rangeLabel,
  HOUR_PRESETS,
  dayLabel,
  placeLabel,
  type RawForecast,
} from '@/lib/weather';

describe('weatherIcon', () => {
  it('mappe le ciel dégagé', () => {
    expect(weatherIcon(0)).toEqual({ emoji: '☀️', label: 'Ciel dégagé' });
  });
  it('mappe la pluie et ses variantes d’intensité', () => {
    expect(weatherIcon(61).label).toBe('Pluie légère');
    expect(weatherIcon(63).label).toBe('Pluie');
    expect(weatherIcon(65).label).toBe('Pluie forte');
  });
  it('mappe l’orage', () => {
    expect(weatherIcon(95).emoji).toBe('⛈️');
  });
  it('retombe sur un repli neutre pour un code inconnu', () => {
    expect(weatherIcon(9999)).toEqual({ emoji: '🌡️', label: 'Météo' });
  });
});

const RAW: RawForecast = {
  current: {
    temperature_2m: 21.4,
    apparent_temperature: 19.6,
    weather_code: 2,
    wind_speed_10m: 12.3,
    precipitation: 0.25,
  },
  hourly: {
    time: ['2026-09-03T22:00', '2026-09-03T23:00', '2026-09-04T00:00'],
    temperature_2m: [20.2, 19.5, null],
    precipitation_probability: [10, 35, 60],
    weather_code: [1, 3, 61],
    wind_speed_10m: [8.4, 9.9, 15],
  },
  daily: {
    time: ['2026-09-03', '2026-09-04'],
    weather_code: [2, 61],
    temperature_2m_max: [24.6, 18.2],
    temperature_2m_min: [14.4, 12.8],
    precipitation_probability_max: [20, 80],
    wind_speed_10m_max: [22.1, 30],
  },
};

describe('parseForecast', () => {
  const d = parseForecast(RAW);
  it('arrondit et décore les conditions actuelles', () => {
    expect(d.current).toEqual({
      tempC: 21,
      feelsLikeC: 20,
      code: 2,
      windKmh: 12,
      precipMm: 0.3,
      emoji: '⛅',
      label: 'Partiellement nuageux',
    });
  });
  it('découpe les heures avec date + libellé d’heure, null → 0', () => {
    expect(d.hours).toHaveLength(3);
    expect(d.hours[0]).toMatchObject({
      date: '2026-09-03',
      hour: '22h',
      h24: 22,
      tempC: 20,
      rainPct: 10,
    });
    expect(d.hours[2]).toMatchObject({ date: '2026-09-04', hour: '00h', tempC: 0, emoji: '🌧️' });
  });
  it('construit les jours (min/max/pluie max/vent max)', () => {
    expect(d.days[1]).toEqual({
      date: '2026-09-04',
      maxC: 18,
      minC: 13,
      rainPct: 80,
      windKmh: 30,
      code: 61,
      emoji: '🌧️',
      label: 'Pluie légère',
    });
  });
  it('hoursOfDay filtre par jour', () => {
    expect(hoursOfDay(d.hours, '2026-09-03').map((h) => h.hour)).toEqual(['22h', '23h']);
    expect(hoursOfDay(d.hours, '2026-09-05')).toEqual([]);
  });
});

describe('dayLabel', () => {
  it('Aujourd’hui / Demain, sinon date courte non vide', () => {
    expect(dayLabel('2026-09-03', '2026-09-03')).toBe("Aujourd'hui");
    expect(dayLabel('2026-09-04', '2026-09-03')).toBe('Demain');
    expect(dayLabel('2026-09-06', '2026-09-03').length).toBeGreaterThan(0);
  });
  it('gère le passage de mois pour « Demain »', () => {
    expect(dayLabel('2026-10-01', '2026-09-30')).toBe('Demain');
  });
});

describe('placeLabel', () => {
  it('ajoute la région sauf si identique', () => {
    expect(placeLabel({ id: '1', name: 'Toulouse', admin1: 'Occitanie', lat: 0, lon: 0 })).toBe(
      'Toulouse, Occitanie',
    );
    expect(placeLabel({ id: '2', name: 'Paris', admin1: 'Paris', lat: 0, lon: 0 })).toBe('Paris');
    expect(placeLabel({ id: '3', name: 'Nice', lat: 0, lon: 0 })).toBe('Nice');
  });
});

describe('plage horaire', () => {
  const d = parseForecast(RAW);
  it('filterHours garde les bornes incluses, ordre indifférent', () => {
    expect(filterHours(d.hours, 22, 23).map((h) => h.hour)).toEqual(['22h', '23h']);
    expect(filterHours(d.hours, 23, 22).map((h) => h.hour)).toEqual(['22h', '23h']); // inversé
    expect(filterHours(d.hours, 0, 0).map((h) => h.hour)).toEqual(['00h']);
    expect(filterHours(d.hours, 8, 12)).toEqual([]);
  });
  it('presetIdFor reconnaît un preset exact, sinon null (plage perso)', () => {
    const m = HOUR_PRESETS.find((p) => p.id === 'morning')!;
    expect(presetIdFor(m.from, m.to)).toBe('morning');
    expect(presetIdFor(0, 23)).toBe('all');
    expect(presetIdFor(7, 9)).toBeNull();
  });
  it('rangeLabel : journée entière ou bornes zéro-paddées', () => {
    expect(rangeLabel(0, 23)).toBe('Toute la journée');
    expect(rangeLabel(6, 12)).toBe('06h → 12h');
    expect(rangeLabel(12, 6)).toBe('06h → 12h'); // normalisé
  });
});
