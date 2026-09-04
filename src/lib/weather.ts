// Météo — logique PURE (testable) : mapping WMO → emoji/libellé, parsing d'une
// réponse Open-Meteo en prévision structurée (actuel / heure par heure / 10 jours),
// libellés de jour, lieux. Réf. codes : https://open-meteo.com/en/docs.

export interface WeatherIcon {
  emoji: string;
  label: string;
}

const WMO_CODES: Record<number, WeatherIcon> = {
  0: { emoji: '☀️', label: 'Ciel dégagé' },
  1: { emoji: '🌤️', label: 'Peu nuageux' },
  2: { emoji: '⛅', label: 'Partiellement nuageux' },
  3: { emoji: '☁️', label: 'Couvert' },
  45: { emoji: '🌫️', label: 'Brouillard' },
  48: { emoji: '🌫️', label: 'Brouillard givrant' },
  51: { emoji: '🌦️', label: 'Bruine légère' },
  53: { emoji: '🌦️', label: 'Bruine' },
  55: { emoji: '🌦️', label: 'Bruine forte' },
  56: { emoji: '🌧️', label: 'Bruine verglaçante' },
  57: { emoji: '🌧️', label: 'Bruine verglaçante forte' },
  61: { emoji: '🌧️', label: 'Pluie légère' },
  63: { emoji: '🌧️', label: 'Pluie' },
  65: { emoji: '🌧️', label: 'Pluie forte' },
  66: { emoji: '🌧️', label: 'Pluie verglaçante' },
  67: { emoji: '🌧️', label: 'Pluie verglaçante forte' },
  71: { emoji: '🌨️', label: 'Neige légère' },
  73: { emoji: '🌨️', label: 'Neige' },
  75: { emoji: '🌨️', label: 'Neige forte' },
  77: { emoji: '🌨️', label: 'Grains de neige' },
  80: { emoji: '🌦️', label: 'Averses légères' },
  81: { emoji: '🌦️', label: 'Averses' },
  82: { emoji: '⛈️', label: 'Averses violentes' },
  85: { emoji: '🌨️', label: 'Averses de neige' },
  86: { emoji: '🌨️', label: 'Averses de neige fortes' },
  95: { emoji: '⛈️', label: 'Orage' },
  96: { emoji: '⛈️', label: 'Orage avec grêle' },
  99: { emoji: '⛈️', label: 'Orage avec grêle fort' },
};

/** Icône + libellé FR pour un code WMO. Code inconnu → repli neutre. */
export function weatherIcon(code: number): WeatherIcon {
  return WMO_CODES[code] ?? { emoji: '🌡️', label: 'Météo' };
}

// ── Lieux ──
export interface WeatherPlace {
  id: string; // stable (id du géocodeur) → clé de cache + favoris
  name: string;
  admin1?: string; // région/département
  country?: string;
  lat: number;
  lon: number;
}
/** Libellé court d'un lieu : « Toulouse, Occitanie » (sans doublon si identiques). */
export function placeLabel(p: WeatherPlace): string {
  return p.admin1 && p.admin1 !== p.name ? `${p.name}, ${p.admin1}` : p.name;
}

// ── Prévision structurée ──
export interface WeatherCurrent {
  tempC: number;
  feelsLikeC: number;
  code: number;
  windKmh: number;
  precipMm: number; // précipitations de l'heure en cours
  emoji: string;
  label: string;
}
export interface WeatherHour {
  date: string; // YYYY-MM-DD (local)
  hour: string; // « 14h »
  h24: number; // 0..23 (filtrage par plage horaire)
  tempC: number;
  rainPct: number; // 0..100
  windKmh: number;
  code: number;
  emoji: string;
}
export interface WeatherDay {
  date: string; // YYYY-MM-DD
  maxC: number;
  minC: number;
  rainPct: number; // probabilité max de la journée
  windKmh: number; // rafale/vent max
  code: number;
  emoji: string;
  label: string; // libellé du code (« Averses »)
}
export interface WeatherData {
  current: WeatherCurrent;
  hours: WeatherHour[]; // toutes les heures des jours prévus (à filtrer par jour)
  days: WeatherDay[];
}

/** Forme brute de la réponse Open-Meteo `/v1/forecast` (champs demandés). */
export interface RawForecast {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    precipitation: number;
  };
  hourly: {
    time: string[]; // ISO local « 2026-09-03T14:00 »
    temperature_2m: (number | null)[];
    precipitation_probability: (number | null)[];
    weather_code: (number | null)[];
    wind_speed_10m: (number | null)[];
  };
  daily: {
    time: string[]; // « 2026-09-03 »
    weather_code: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_probability_max: (number | null)[];
    wind_speed_10m_max: (number | null)[];
  };
}

const r0 = (v: number | null | undefined) => Math.round(v ?? 0);

/** Transforme la réponse Open-Meteo en prévision structurée. */
export function parseForecast(raw: RawForecast): WeatherData {
  const cur = raw.current;
  const ci = weatherIcon(cur.weather_code);
  const hours: WeatherHour[] = raw.hourly.time.map((t, i) => {
    const code = raw.hourly.weather_code[i] ?? 0;
    return {
      date: t.slice(0, 10),
      hour: `${t.slice(11, 13)}h`,
      h24: Number(t.slice(11, 13)),
      tempC: r0(raw.hourly.temperature_2m[i]),
      rainPct: r0(raw.hourly.precipitation_probability[i]),
      windKmh: r0(raw.hourly.wind_speed_10m[i]),
      code,
      emoji: weatherIcon(code).emoji,
    };
  });
  const days: WeatherDay[] = raw.daily.time.map((d, i) => {
    const code = raw.daily.weather_code[i] ?? 0;
    const ic = weatherIcon(code);
    return {
      date: d,
      maxC: r0(raw.daily.temperature_2m_max[i]),
      minC: r0(raw.daily.temperature_2m_min[i]),
      rainPct: r0(raw.daily.precipitation_probability_max[i]),
      windKmh: r0(raw.daily.wind_speed_10m_max[i]),
      code,
      emoji: ic.emoji,
      label: ic.label,
    };
  });
  return {
    current: {
      tempC: r0(cur.temperature_2m),
      feelsLikeC: r0(cur.apparent_temperature),
      code: cur.weather_code,
      windKmh: r0(cur.wind_speed_10m),
      precipMm: Math.round((cur.precipitation ?? 0) * 10) / 10,
      emoji: ci.emoji,
      label: ci.label,
    },
    hours,
    days,
  };
}

// ── Plage horaire affichée (préférence : on ne veut souvent voir que ses créneaux
//    de sortie, matin et/ou soir, pas les 24 heures). ──
export interface HourPreset {
  id: string;
  label: string;
  from: number; // heure de début incluse (0..23)
  to: number; // heure de fin incluse (0..23)
}
export const HOUR_PRESETS: HourPreset[] = [
  { id: 'all', label: 'Tout', from: 0, to: 23 },
  { id: 'morning', label: 'Matin', from: 6, to: 12 },
  { id: 'midday', label: 'Midi', from: 11, to: 15 },
  { id: 'evening', label: 'Soir', from: 17, to: 22 },
];
export const FULL_DAY: HourPreset = HOUR_PRESETS[0]!;

/** Garde les heures dans [from, to] (bornes incluses ; ordre indifférent). */
export function filterHours(hours: WeatherHour[], from: number, to: number): WeatherHour[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return hours.filter((h) => h.h24 >= lo && h.h24 <= hi);
}
/** Id du preset correspondant exactement à la plage, sinon null (= plage perso). */
export function presetIdFor(from: number, to: number): string | null {
  return HOUR_PRESETS.find((p) => p.from === from && p.to === to)?.id ?? null;
}
/** « Toute la journée » ou « 06h → 12h ». */
export function rangeLabel(from: number, to: number): string {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  if (lo === 0 && hi === 23) return 'Toute la journée';
  const p = (h: number) => String(h).padStart(2, '0');
  return `${p(lo)}h → ${p(hi)}h`;
}

/** Heures d'un jour donné (pour l'onglet « heure par heure »). */
export function hoursOfDay(hours: WeatherHour[], date: string): WeatherHour[] {
  return hours.filter((h) => h.date === date);
}

/** Libellé d'un jour relatif à aujourd'hui : « Aujourd'hui » / « Demain » / « jeu. 4 sept. ». */
export function dayLabel(date: string, todayIso: string): string {
  if (date === todayIso) return "Aujourd'hui";
  const t = new Date(`${todayIso}T12:00:00`);
  t.setDate(t.getDate() + 1);
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(
    t.getDate(),
  ).padStart(2, '0')}`;
  if (date === tomorrow) return 'Demain';
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
