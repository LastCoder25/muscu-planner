// Fiabilité des sources météo — logique PURE (testable). On compare, pour chaque
// MODÈLE et chaque HORIZON (J+1 / J+3 / J+7), ce qu'il PRÉVOYAIT (API previous-runs
// d'Open-Meteo, reconstruit rétroactivement) à ce qui s'est PASSÉ (archive ERA5,
// réanalyse = « vérité » standard en vérification, disponible à J-5).
//
// Métriques par modèle × horizon : MAE température (max/min) + biais signé, taux de
// bonnes réponses « pluie oui/non » (seuil RAIN_MM), MAE pluie (mm), MAE vent, n.
// Score composite 0..100 — les MAE bruts restent affichés à côté (pas de boîte noire).

export type Lead = 1 | 3 | 7;
export const LEADS: Lead[] = [1, 3, 7];

/** Modèles mis en concurrence (ids Open-Meteo → libellé). */
export const WEATHER_MODELS: { id: string; label: string }[] = [
  { id: 'meteofrance_seamless', label: 'Météo-France' },
  { id: 'ecmwf_ifs025', label: 'ECMWF' },
  { id: 'gfs_seamless', label: 'GFS (NOAA)' },
  { id: 'icon_seamless', label: 'ICON (DWD)' },
  { id: 'ukmo_seamless', label: 'UKMO' },
];
export function modelLabel(id: string): string {
  return WEATHER_MODELS.find((m) => m.id === id)?.label ?? id;
}

/** Une journée RÉALISÉE (archive). */
export interface DailyTruth {
  date: string; // YYYY-MM-DD
  tmax: number;
  tmin: number;
  precipMm: number;
  windMax: number | null;
}
/** Une journée PRÉVUE par un modèle à un horizon donné (agrégée depuis l'horaire). */
export interface DailyForecast extends Omit<DailyTruth, 'windMax'> {
  model: string;
  lead: Lead;
  windMax: number | null;
}

export const RAIN_MM = 1; // « il a plu » = ≥ 1 mm dans la journée
const MIN_N = 5; // en dessous : pas de score
export const INDICATIVE_N = 20; // en dessous : score « indicatif »

/** Agrège des séries HORAIRES (même longueur que `times`) en journées locales :
 *  tmax/tmin = extrêmes, précip = somme, vent = max. Les heures à `null` sont ignorées ;
 *  une journée sans aucune valeur de température est omise. */
export function dailyFromHourly(
  times: string[], // ISO local « 2026-09-03T14:00 »
  temp: (number | null)[],
  precip: (number | null)[],
  wind?: (number | null)[],
): DailyTruth[] {
  const days = new Map<string, { tmax: number; tmin: number; p: number; w: number | null }>();
  times.forEach((t, i) => {
    const d = t.slice(0, 10);
    const cur = days.get(d) ?? { tmax: -Infinity, tmin: Infinity, p: 0, w: null };
    const tv = temp[i];
    if (tv != null) {
      cur.tmax = Math.max(cur.tmax, tv);
      cur.tmin = Math.min(cur.tmin, tv);
    }
    const pv = precip[i];
    if (pv != null) cur.p += pv;
    const wv = wind?.[i];
    if (wv != null) cur.w = cur.w == null ? wv : Math.max(cur.w, wv);
    days.set(d, cur);
  });
  return [...days.entries()]
    .filter(([, v]) => v.tmax !== -Infinity)
    .map(([date, v]) => ({
      date,
      tmax: Math.round(v.tmax * 10) / 10,
      tmin: Math.round(v.tmin * 10) / 10,
      precipMm: Math.round(v.p * 10) / 10,
      windMax: v.w == null ? null : Math.round(v.w * 10) / 10,
    }));
}

export interface ReliabilityRow {
  model: string;
  lead: Lead;
  n: number; // journées comparées
  tMae: number; // °C, moyenne sur max ET min
  tBias: number; // °C signé (prévu − réalisé) : + = le modèle surchauffe
  rainHit: number; // 0..1 : part des jours où « pluie oui/non » était juste
  rainMae: number; // mm
  windMae: number | null; // km/h (null si pas de vent dans les données)
  score: number | null; // 0..100 (null si n < MIN_N)
  indicative: boolean; // n < INDICATIVE_N
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Score composite : T 50 % (MAE 5 °C → 0), pluie 35 % (taux de réussite), vent 15 %
 *  (MAE 15 km/h → 0 ; poids renormalisés s'il manque). */
export function compositeScore(tMae: number, rainHit: number, windMae: number | null): number {
  const t = clamp01(1 - tMae / 5);
  const r = clamp01(rainHit);
  if (windMae == null) return Math.round(100 * ((0.5 * t + 0.35 * r) / 0.85));
  const w = clamp01(1 - windMae / 15);
  return Math.round(100 * (0.5 * t + 0.35 * r + 0.15 * w));
}

/** Compare prévisions et réalisé, par modèle × horizon. Lignes triées par score desc. */
export function scoreReliability(
  truth: DailyTruth[],
  forecasts: DailyForecast[],
): ReliabilityRow[] {
  const truthByDate = new Map(truth.map((t) => [t.date, t]));
  const groups = new Map<string, DailyForecast[]>();
  for (const f of forecasts) {
    if (!truthByDate.has(f.date)) continue;
    const k = `${f.model}|${f.lead}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(f);
  }
  const rows: ReliabilityRow[] = [];
  for (const [k, fs] of groups) {
    const [model, leadStr] = k.split('|');
    const lead = Number(leadStr) as Lead;
    let tAbs = 0;
    let tSigned = 0;
    let rainOk = 0;
    let rainAbs = 0;
    let wAbs = 0;
    let wN = 0;
    for (const f of fs) {
      const t = truthByDate.get(f.date)!;
      tAbs += Math.abs(f.tmax - t.tmax) + Math.abs(f.tmin - t.tmin);
      tSigned += f.tmax - t.tmax + (f.tmin - t.tmin);
      if (f.precipMm >= RAIN_MM === t.precipMm >= RAIN_MM) rainOk++;
      rainAbs += Math.abs(f.precipMm - t.precipMm);
      if (f.windMax != null && t.windMax != null) {
        wAbs += Math.abs(f.windMax - t.windMax);
        wN++;
      }
    }
    const n = fs.length;
    const tMae = r1(tAbs / (2 * n));
    const tBias = r1(tSigned / (2 * n));
    const rainHit = Math.round((rainOk / n) * 100) / 100;
    const rainMae = r1(rainAbs / n);
    const windMae = wN ? r1(wAbs / wN) : null;
    rows.push({
      model: model!,
      lead,
      n,
      tMae,
      tBias,
      rainHit,
      rainMae,
      windMae,
      score: n >= MIN_N ? compositeScore(tMae, rainHit, windMae) : null,
      indicative: n < INDICATIVE_N,
    });
  }
  return rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.model.localeCompare(b.model));
}

/** Meilleure source par horizon (score max, n suffisant). */
export function recommendByLead(rows: ReliabilityRow[]): Partial<Record<Lead, string>> {
  const out: Partial<Record<Lead, string>> = {};
  for (const lead of LEADS) {
    const best = rows
      .filter((r) => r.lead === lead && r.score != null)
      .sort((a, b) => b.score! - a.score!)[0];
    if (best) out[lead] = best.model;
  }
  return out;
}
