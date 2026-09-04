// Fiabilité des sources météo — chargé À LA DEMANDE (onglet « Fiabilité »), cache
// 24 h par lieu. Deux appels Open-Meteo (sans clé) :
//   • previous-runs : ce que chaque MODÈLE prévoyait à J-1 / J-3 / J-7 pour chaque heure
//     des PAST_DAYS derniers jours (reconstruction rétroactive → aucun relevé à stocker) ;
//   • archive (ERA5, réanalyse) : le réalisé = « vérité », disponible jusqu'à ~J-5.
// Le scoring est dans lib/weatherReliability (pur, testé).
import { ref } from 'vue';
import {
  dailyFromHourly,
  scoreReliability,
  recommendByLead,
  LEADS,
  WEATHER_MODELS,
  type DailyForecast,
  type DailyTruth,
  type Lead,
  type ReliabilityRow,
} from '@/lib/weatherReliability';

const PAST_DAYS = 45; // fenêtre de comparaison (≈ 400 Ko de JSON, une fois par jour)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cacheKey = (id: string) => `muscu:weather:rel:v1:${id}`;

export interface ReliabilityResult {
  rows: ReliabilityRow[];
  best: Partial<Record<Lead, string>>;
  truthDays: number; // journées de « vérité » disponibles
  from: string; // 1re date comparée
  to: string; // dernière date comparée
}
interface RelCache {
  fetchedAt: number;
  data: ReliabilityResult;
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
function readCache(id: string): RelCache | null {
  try {
    const raw = localStorage.getItem(cacheKey(id));
    return raw ? (JSON.parse(raw) as RelCache) : null;
  } catch {
    return null;
  }
}
function writeCache(id: string, data: ReliabilityResult) {
  try {
    localStorage.setItem(cacheKey(id), JSON.stringify({ fetchedAt: Date.now(), data }));
  } catch {
    /* stockage indisponible */
  }
}

type Series = Record<string, (number | null)[] | string[]>;

async function fetchPreviousRuns(lat: number, lon: number): Promise<DailyForecast[]> {
  const vars = ['temperature_2m', 'precipitation', 'wind_speed_10m'];
  const hourly = vars.flatMap((v) => LEADS.map((l) => `${v}_previous_day${l}`)).join(',');
  const models = WEATHER_MODELS.map((m) => m.id).join(',');
  const url =
    `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=${hourly}&models=${models}&past_days=${PAST_DAYS}&forecast_days=1&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('previous-runs indisponible');
  const d = (await r.json()) as { hourly: Series };
  const times = d.hourly.time as string[];
  const out: DailyForecast[] = [];
  for (const m of WEATHER_MODELS) {
    for (const lead of LEADS) {
      const col = (v: string) => d.hourly[`${v}_previous_day${lead}_${m.id}`] as (number | null)[];
      const temp = col('temperature_2m');
      if (!temp) continue; // modèle/horizon non couvert (ex. Météo-France à J-7)
      const days = dailyFromHourly(times, temp, col('precipitation') ?? [], col('wind_speed_10m'));
      for (const day of days) out.push({ ...day, model: m.id, lead });
    }
  }
  return out;
}

async function fetchTruth(
  lat: number,
  lon: number,
  from: string,
  to: string,
): Promise<DailyTruth[]> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${from}&end_date=${to}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('archive indisponible');
  const d = (await r.json()) as {
    daily: {
      time: string[];
      temperature_2m_max: (number | null)[];
      temperature_2m_min: (number | null)[];
      precipitation_sum: (number | null)[];
      wind_speed_10m_max: (number | null)[];
    };
  };
  const out: DailyTruth[] = [];
  d.daily.time.forEach((date, i) => {
    const tmax = d.daily.temperature_2m_max[i];
    const tmin = d.daily.temperature_2m_min[i];
    if (tmax == null || tmin == null) return; // pas encore dans l'archive (J-5 → aujourd'hui)
    out.push({
      date,
      tmax,
      tmin,
      precipMm: d.daily.precipitation_sum[i] ?? 0,
      windMax: d.daily.wind_speed_10m_max[i] ?? null,
    });
  });
  return out;
}

export function useWeatherReliability() {
  const result = ref<ReliabilityResult | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let loadedFor: string | null = null;

  /** Charge (ou relit le cache) pour un lieu. `id` = clé de cache du lieu. */
  async function load(id: string, lat: number, lon: number, force = false) {
    if (!force) {
      const cached = readCache(id);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        result.value = cached.data;
        loadedFor = id;
        return;
      }
    }
    if (loading.value && loadedFor === id) return;
    loadedFor = id;
    loading.value = true;
    error.value = null;
    result.value = null;
    try {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - PAST_DAYS);
      const [forecasts, truth] = await Promise.all([
        fetchPreviousRuns(lat, lon),
        fetchTruth(lat, lon, isoDay(from), isoDay(to)),
      ]);
      if (loadedFor !== id) return; // le lieu a changé pendant le fetch
      const rows = scoreReliability(truth, forecasts);
      const dates = truth.map((t) => t.date).sort();
      const data: ReliabilityResult = {
        rows,
        best: recommendByLead(rows),
        truthDays: truth.length,
        from: dates[0] ?? isoDay(from),
        to: dates[dates.length - 1] ?? isoDay(to),
      };
      result.value = data;
      writeCache(id, data);
    } catch (e) {
      if (loadedFor === id) error.value = e instanceof Error ? e.message : 'Échec';
    } finally {
      if (loadedFor === id) loading.value = false;
    }
  }

  return { result, loading, error, load };
}
