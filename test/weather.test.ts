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
  outdoorRating,
  OUTDOOR,
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

/** Le verdict « sport dehors » d'un créneau.
 *
 *  ⚠️ Ce n'est PAS « quel temps il fait » mais « est-ce que je peux courir ». D'où deux
 *  partis pris que ces tests verrouillent : on juge sur le RESSENTI (l'humidité et le vent
 *  décident de l'effort bien plus que le thermomètre) et un créneau déclassé dit TOUJOURS
 *  pourquoi — une couleur sans motif laisse deviner, et on devine mal. */
describe('outdoorRating', () => {
  const beau = { tempC: 18, feelsC: 18, rainPct: 5, windKmh: 10, code: 0 };

  it('un beau créneau est bon, et sans motif', () => {
    expect(outdoorRating(beau)).toEqual({ verdict: 'good', reason: '' });
  });

  it("⚠️ l'orage passe AVANT tout le reste : par 18 °C au sec, c'est quand même non", () => {
    for (const code of OUTDOOR.stormCodes) {
      expect(outdoorRating({ ...beau, code }), `code ${code}`).toEqual({
        verdict: 'bad',
        reason: 'orage',
      });
    }
  });

  it('la chaleur déclasse en deux temps', () => {
    expect(outdoorRating({ ...beau, feelsC: OUTDOOR.hotOk - 1 }).verdict).toBe('good');
    expect(outdoorRating({ ...beau, feelsC: OUTDOOR.hotOk }).verdict).toBe('ok');
    expect(outdoorRating({ ...beau, feelsC: OUTDOOR.hotBad }).verdict).toBe('bad');
  });

  it('le froid aussi', () => {
    expect(outdoorRating({ ...beau, feelsC: OUTDOOR.coldOk + 1 }).verdict).toBe('good');
    expect(outdoorRating({ ...beau, feelsC: OUTDOOR.coldOk }).verdict).toBe('ok');
    expect(outdoorRating({ ...beau, feelsC: OUTDOOR.coldBad }).verdict).toBe('bad');
  });

  it('la pluie et le vent ont leurs propres seuils', () => {
    expect(outdoorRating({ ...beau, rainPct: OUTDOOR.rainOk }).verdict).toBe('ok');
    expect(outdoorRating({ ...beau, rainPct: OUTDOOR.rainBad }).verdict).toBe('bad');
    expect(outdoorRating({ ...beau, windKmh: OUTDOOR.windOk }).verdict).toBe('ok');
    expect(outdoorRating({ ...beau, windKmh: OUTDOOR.windBad }).verdict).toBe('bad');
  });

  it('⚠️ c’est le RESSENTI qui tranche, pas le thermomètre', () => {
    // 30 °C à l'ombre mais 34 ressentis (humidité) : l'effort se paie au ressenti.
    expect(outdoorRating({ ...beau, tempC: 30, feelsC: 34 }).verdict).toBe('bad');
    // …et l'inverse : 33 °C secs et ventés qui n'en font que 26.
    expect(outdoorRating({ ...beau, tempC: 33, feelsC: 26 }).verdict).toBe('good');
  });

  it('sans ressenti fourni, on retombe sur la température (aucun créneau muet)', () => {
    const { feelsC: _omis, ...sansRessenti } = { ...beau, tempC: 35 };
    expect(outdoorRating(sansRessenti).verdict).toBe('bad');
  });

  it('⚠️ tout créneau déclassé PORTE son motif — la couleur seule ne suffit pas', () => {
    const cas = [
      { ...beau, code: 95 },
      { ...beau, feelsC: 35 },
      { ...beau, feelsC: -5 },
      { ...beau, rainPct: 80 },
      { ...beau, windKmh: 60 },
      { ...beau, feelsC: 29 },
      { ...beau, rainPct: 40 },
      { ...beau, windKmh: 40 },
    ];
    for (const h of cas) {
      const r = outdoorRating(h);
      expect(r.verdict, JSON.stringify(h)).not.toBe('good');
      expect(r.reason, JSON.stringify(h)).not.toBe('');
    }
  });
});
