// Météo du jour — tuile PUREMENT informative sur l'accueil (« il fait quoi dehors
// avant de sortir courir ? »). Aucune clé API : Open-Meteo (prévisions, gratuit,
// sans clé, CORS) + BigDataCloud (reverse-geocoding, gratuit, sans clé) pour le nom
// de ville. Géolocalisation navigateur ; refus/échec → tuile simplement absente
// (non-intrusif, pas de toast d'erreur pour une info secondaire).
import { ref } from 'vue';
import { weatherIcon } from '@/lib/weather';

export interface WeatherHour {
  time: string; // « 14h »
  tempC: number;
  rainPct: number; // probabilité de précipitations (0..100)
  emoji: string;
}
export interface WeatherNow {
  tempC: number;
  feelsLikeC: number;
  code: number;
  windKmh: number;
  precipMm: number; // précipitations de l'heure en cours
  city: string | null;
  emoji: string;
  label: string;
  hours: WeatherHour[]; // prochaines heures (« je sors maintenant ou plus tard ? »)
}

const CACHE_KEY = 'muscu:weather:v2'; // v2 : + vent/précip/prochaines heures (l'ancien cache est ignoré)
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min : assez frais, évite un géoloc+fetch à chaque visite

interface WeatherCache {
  fetchedAt: number;
  data: WeatherNow;
}

function readCache(): WeatherCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as WeatherCache) : null;
  } catch {
    return null; // stockage indisponible (navigation privée…) → pas de cache, tant pis
  }
}
function writeCache(data: WeatherNow) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data }));
  } catch {
    /* idem */
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Géolocalisation indisponible.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 15 * 60 * 1000, // position OS récente acceptée telle quelle
    });
  });
}

// Best-effort : le nom de ville est un bonus d'affichage, jamais bloquant pour la météo.
async function reverseGeocodeCity(lat: number, lon: number): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=fr`,
    );
    if (!r.ok) return null;
    const d = (await r.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
    };
    return d.city || d.locality || d.principalSubdivision || null;
  } catch {
    return null;
  }
}

const HOURS_AHEAD = 8; // prochaines heures affichées dans le panneau

// Un seul appel : conditions actuelles + prévision horaire des prochaines heures.
async function fetchForecast(
  lat: number,
  lon: number,
): Promise<Omit<WeatherNow, 'city' | 'emoji' | 'label'>> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation` +
    `&hourly=temperature_2m,precipitation_probability,weather_code` +
    `&forecast_hours=${HOURS_AHEAD + 1}&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Météo indisponible.');
  const d = (await r.json()) as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      weather_code: number;
      wind_speed_10m: number;
      precipitation: number;
    };
    hourly: {
      time: string[]; // ISO local « 2026-09-03T14:00 »
      temperature_2m: number[];
      precipitation_probability: (number | null)[];
      weather_code: number[];
    };
  };
  // forecast_hours part de l'heure COURANTE → on saute l'index 0 (déjà dans `current`).
  const hours: WeatherHour[] = d.hourly.time.slice(1, HOURS_AHEAD + 1).map((t, i) => ({
    time: `${t.slice(11, 13)}h`,
    tempC: Math.round(d.hourly.temperature_2m[i + 1] ?? 0),
    rainPct: Math.round(d.hourly.precipitation_probability[i + 1] ?? 0),
    emoji: weatherIcon(d.hourly.weather_code[i + 1] ?? 0).emoji,
  }));
  return {
    tempC: Math.round(d.current.temperature_2m),
    feelsLikeC: Math.round(d.current.apparent_temperature),
    code: d.current.weather_code,
    windKmh: Math.round(d.current.wind_speed_10m),
    precipMm: Math.round(d.current.precipitation * 10) / 10,
    hours,
  };
}

export function useWeather() {
  const weather = ref<WeatherNow | null>(null);
  const loading = ref(false);

  async function load(force = false) {
    if (!force) {
      const cached = readCache();
      if (cached) {
        weather.value = cached.data; // affiché tout de suite (frais ou pas) → pas d'écran vide
        if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) return; // assez frais, pas de refresh
      }
    }
    loading.value = true;
    try {
      const pos = await getPosition();
      const { latitude: lat, longitude: lon } = pos.coords;
      const [base, city] = await Promise.all([
        fetchForecast(lat, lon),
        reverseGeocodeCity(lat, lon),
      ]);
      const icon = weatherIcon(base.code);
      const data: WeatherNow = { ...base, city, emoji: icon.emoji, label: icon.label };
      weather.value = data;
      writeCache(data);
    } catch {
      // Géoloc refusée/indisponible ou météo injoignable → on garde le cache s'il y en
      // avait un (déjà affiché ci-dessus) ; sinon la tuile reste simplement absente.
    } finally {
      loading.value = false;
    }
  }

  void load();
  return { weather, loading, refresh: () => load(true) };
}
