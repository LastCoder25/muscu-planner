// Météo du jour — tuile PUREMENT informative sur l'accueil (« il fait quoi dehors
// avant de sortir courir ? »). Aucune clé API : Open-Meteo (prévisions, gratuit,
// sans clé, CORS) + BigDataCloud (reverse-geocoding, gratuit, sans clé) pour le nom
// de ville. Géolocalisation navigateur ; refus/échec → tuile simplement absente
// (non-intrusif, pas de toast d'erreur pour une info secondaire).
import { ref } from 'vue';
import { weatherIcon } from '@/lib/weather';

export interface WeatherNow {
  tempC: number;
  feelsLikeC: number;
  code: number;
  city: string | null;
  emoji: string;
  label: string;
}

const CACHE_KEY = 'muscu:weather';
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

async function fetchCurrent(
  lat: number,
  lon: number,
): Promise<{ tempC: number; feelsLikeC: number; code: number }> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Météo indisponible.');
  const d = (await r.json()) as {
    current: { temperature_2m: number; apparent_temperature: number; weather_code: number };
  };
  return {
    tempC: Math.round(d.current.temperature_2m),
    feelsLikeC: Math.round(d.current.apparent_temperature),
    code: d.current.weather_code,
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
        fetchCurrent(lat, lon),
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
