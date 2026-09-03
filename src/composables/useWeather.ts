// Météo — accueil. Aucune clé API : Open-Meteo (prévisions + géocodage, gratuit,
// CORS) + BigDataCloud (reverse-geocoding) pour nommer « ma position ».
//   • Lieu = ma position (géoloc navigateur) OU une ville choisie (recherche).
//   • Favoris (villes ★) et lieu courant persistés en localStorage (confort par
//     appareil, pas de sync compte — info secondaire).
//   • Un seul appel : actuel + heure par heure (10 j) + 10 jours ; cache 30 min PAR lieu.
//   • Géoloc refusée / réseau KO → on garde le cache s'il existe, sinon tuile absente
//     (non-intrusif, pas de toast pour une info secondaire).
import { ref, computed } from 'vue';
import {
  parseForecast,
  placeLabel,
  type RawForecast,
  type WeatherData,
  type WeatherPlace,
} from '@/lib/weather';

const PLACE_KEY = 'muscu:weather:place'; // lieu courant (null = ma position)
const FAVS_KEY = 'muscu:weather:favs';
const cacheKey = (id: string) => `muscu:weather:v3:${id}`;
const CACHE_TTL_MS = 30 * 60 * 1000;
const FORECAST_DAYS = 10;
export const GEO_ID = 'geo';

interface WeatherCache {
  fetchedAt: number;
  data: WeatherData;
  city: string | null;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // stockage indisponible (navigation privée…)
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
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
      maximumAge: 15 * 60 * 1000,
    });
  });
}

// Best-effort : nom de « ma position », jamais bloquant.
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

async function fetchForecast(lat: number, lon: number): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation` +
    `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max` +
    `&forecast_days=${FORECAST_DAYS}&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Météo indisponible.');
  return parseForecast((await r.json()) as RawForecast);
}

/** Recherche de villes (géocodage Open-Meteo, sans clé). */
export async function searchCities(q: string): Promise<WeatherPlace[]> {
  const name = q.trim();
  if (name.length < 2) return [];
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8&language=fr&format=json`,
    );
    if (!r.ok) return [];
    const d = (await r.json()) as {
      results?: {
        id: number;
        name: string;
        admin1?: string;
        country?: string;
        latitude: number;
        longitude: number;
      }[];
    };
    return (d.results ?? []).map((x) => ({
      id: String(x.id),
      name: x.name,
      ...(x.admin1 ? { admin1: x.admin1 } : {}),
      ...(x.country ? { country: x.country } : {}),
      lat: x.latitude,
      lon: x.longitude,
    }));
  } catch {
    return [];
  }
}

export function useWeather() {
  const place = ref<WeatherPlace | null>(readJson<WeatherPlace>(PLACE_KEY));
  const favorites = ref<WeatherPlace[]>(readJson<WeatherPlace[]>(FAVS_KEY) ?? []);
  const weather = ref<WeatherData | null>(null);
  const geoCity = ref<string | null>(null); // nom de « ma position » (reverse geocode)
  const loading = ref(false);

  /** Nom affiché du lieu courant. */
  const city = computed(() => (place.value ? placeLabel(place.value) : geoCity.value));
  const isFavorite = (p: WeatherPlace | null) => !!p && favorites.value.some((f) => f.id === p.id);

  async function load(force = false) {
    const id = place.value?.id ?? GEO_ID;
    if (!force) {
      const cached = readJson<WeatherCache>(cacheKey(id));
      if (cached) {
        weather.value = cached.data; // affiché tout de suite (frais ou pas)
        if (!place.value) geoCity.value = cached.city;
        if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) return;
      }
    }
    loading.value = true;
    try {
      let data: WeatherData;
      let cityName: string | null = null;
      if (place.value) {
        data = await fetchForecast(place.value.lat, place.value.lon);
      } else {
        const { latitude: lat, longitude: lon } = (await getPosition()).coords;
        [data, cityName] = await Promise.all([
          fetchForecast(lat, lon),
          reverseGeocodeCity(lat, lon),
        ]);
        geoCity.value = cityName;
      }
      // Garde-fou : si le lieu a changé pendant le fetch, on n'écrase pas l'affichage.
      if ((place.value?.id ?? GEO_ID) !== id) return;
      weather.value = data;
      writeJson(cacheKey(id), {
        fetchedAt: Date.now(),
        data,
        city: cityName,
      } satisfies WeatherCache);
    } catch {
      /* géoloc refusée / réseau KO → cache déjà affiché s'il existait, sinon rien */
    } finally {
      loading.value = false;
    }
  }

  /** Change de lieu (null = ma position) et recharge. */
  function selectPlace(p: WeatherPlace | null) {
    place.value = p;
    writeJson(PLACE_KEY, p);
    weather.value = null; // évite d'afficher la météo de l'ancien lieu pendant le chargement
    void load();
  }
  function toggleFavorite(p: WeatherPlace) {
    favorites.value = isFavorite(p)
      ? favorites.value.filter((f) => f.id !== p.id)
      : [...favorites.value, p];
    writeJson(FAVS_KEY, favorites.value);
  }

  void load();
  return {
    weather,
    city,
    place,
    favorites,
    loading,
    isFavorite,
    selectPlace,
    toggleFavorite,
    refresh: () => load(true),
  };
}
