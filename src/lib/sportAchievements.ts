// sportAchievements.ts — Trophées par sport : RECORDS personnels (contre soi) +
// SUCCÈS à paliers (cumul). RÈGLE : on récompense le VOLUME / la DISTANCE / le
// DÉNIVELÉ / la RÉGULARITÉ / la VARIÉTÉ — JAMAIS la vitesse (ne pas pousser hors
// zone d'endurance). Pur/testable ; l'état « débloqué » se déduit des séances
// (pas de stockage). Aucune dépendance Vue/Supabase.

export type SportCategory = 'muscu' | 'cardio' | 'autre' | 'specifique';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

// Une séance normalisée (muscu / cardio / autre), source des trophées.
export interface SportEntry {
  sport: string; // clé lisible : 'Muscu', 'Course', 'Vélo', 'Tennis'…
  category: SportCategory;
  hasDistance: boolean; // l'activité se mesure en distance (course/vélo/marche…)
  date: string; // YYYY-MM-DD
  durationMin: number;
  distanceKm: number;
  dPlus: number; // dénivelé positif (m)
  tonnage: number; // muscu : Σ charge×reps
}

// ── Paliers (seuils) par métrique ; l'index → rareté croissante. ──
const RARITY_BY_INDEX: Rarity[] = ['common', 'common', 'rare', 'epic', 'legendary', 'legendary'];
const rarityAt = (i: number): Rarity => RARITY_BY_INDEX[Math.min(i, RARITY_BY_INDEX.length - 1)]!;

const KM_TOTAL = [10, 50, 100, 250, 500, 1000]; // distance cumulée
const HOURS_TOTAL = [1, 5, 10, 25, 50, 100]; // durée cumulée (h)
const SESSIONS = [1, 5, 10, 25, 50, 100]; // nb de séances
const DPLUS_TOTAL = [500, 2000, 5000, 8848]; // dénivelé cumulé (m) — 8848 = Everest
const KM_SINGLE = [5, 10, 21, 42, 100]; // plus longue sortie (km) — semi/marathon/ultra
const TONNAGE_TOTAL = [1000, 10000, 100000]; // muscu : kg cumulés soulevés
const VARIETY = [3, 5, 8]; // nb de sports différents
const WEEKS = [2, 4, 8, 12]; // semaines consécutives actives

export interface Palier {
  metric: 'km_total' | 'hours_total' | 'sessions' | 'dplus_total' | 'km_single' | 'tonnage_total';
  label: string;
  threshold: number;
  value: number;
  achieved: boolean;
  rarity: Rarity;
}
export interface SportTrophies {
  sport: string;
  category: SportCategory;
  hasDistance: boolean;
  sessions: number;
  totalKm: number;
  totalMin: number;
  totalDplus: number;
  totalTonnage: number;
  records: { maxMin: number; maxKm: number; maxDplus: number; maxTonnage: number };
  paliers: Palier[];
}
export interface GlobalPalier {
  metric: 'variety' | 'weeks';
  label: string;
  threshold: number;
  value: number;
  achieved: boolean;
  rarity: Rarity;
}

function fmtH(h: number): string {
  return h >= 1 ? `${h} h` : `${Math.round(h * 60)} min`;
}

function palierList(
  metric: Palier['metric'],
  thresholds: number[],
  value: number,
  label: (t: number) => string,
): Palier[] {
  return thresholds.map((threshold, i) => ({
    metric,
    label: label(threshold),
    threshold,
    value,
    achieved: value >= threshold,
    rarity: rarityAt(i),
  }));
}

/** Semaines calendaires (lundi) consécutives avec au moins une séance, terminant à la dernière. */
function maxConsecutiveWeeks(dates: string[]): number {
  if (!dates.length) return 0;
  const weeks = new Set<number>();
  for (const d of dates) {
    const [y, m, day] = d.split('-').map(Number);
    const t = Date.UTC(y!, (m ?? 1) - 1, day ?? 1);
    // Lundi de la semaine (UTC) → index de semaine.
    const dow = (new Date(t).getUTCDay() + 6) % 7;
    weeks.add(Math.floor((t - dow * 86400000) / (7 * 86400000)));
  }
  const sorted = [...weeks].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]! + 1) run++;
    else run = 1;
    if (run > best) best = run;
  }
  return best;
}

/** Construit les trophées (records + paliers) par sport + les succès globaux. */
export function buildTrophies(entries: SportEntry[]): {
  perSport: SportTrophies[];
  global: GlobalPalier[];
} {
  const bySport = new Map<string, SportEntry[]>();
  for (const e of entries) {
    (bySport.get(e.sport) ?? bySport.set(e.sport, []).get(e.sport)!).push(e);
  }

  const perSport: SportTrophies[] = [];
  for (const [sport, es] of bySport) {
    const sessions = es.length;
    const totalKm = round1(es.reduce((a, e) => a + e.distanceKm, 0));
    const totalMin = Math.round(es.reduce((a, e) => a + e.durationMin, 0));
    const totalDplus = Math.round(es.reduce((a, e) => a + e.dPlus, 0));
    const totalTonnage = Math.round(es.reduce((a, e) => a + e.tonnage, 0));
    const hasDistance = es.some((e) => e.hasDistance);
    const category = es[0]!.category;
    const records = {
      maxMin: Math.max(0, ...es.map((e) => e.durationMin)),
      maxKm: round1(Math.max(0, ...es.map((e) => e.distanceKm))),
      maxDplus: Math.max(0, ...es.map((e) => e.dPlus)),
      maxTonnage: Math.max(0, ...es.map((e) => e.tonnage)),
    };

    const paliers: Palier[] = [
      ...palierList('sessions', SESSIONS, sessions, (t) =>
        t === 1 ? 'Première séance' : `${t} séances`,
      ),
      ...palierList('hours_total', HOURS_TOTAL, totalMin / 60, (t) => `${fmtH(t)} cumulées`),
    ];
    if (hasDistance) {
      paliers.push(
        ...palierList('km_total', KM_TOTAL, totalKm, (t) => `${t} km cumulés`),
        ...palierList('km_single', KM_SINGLE, records.maxKm, (t) =>
          t === 21
            ? 'Semi (21 km)'
            : t === 42
              ? 'Marathon (42 km)'
              : t === 100
                ? 'Ultra (100 km)'
                : `${t} km d'affilée`,
        ),
        ...palierList('dplus_total', DPLUS_TOTAL, totalDplus, (t) =>
          t === 8848 ? "L'Everest (8848 m D+)" : `${t} m de D+ cumulés`,
        ),
      );
    }
    if (category === 'muscu') {
      paliers.push(
        ...palierList(
          'tonnage_total',
          TONNAGE_TOTAL,
          totalTonnage,
          (t) => `${(t / 1000).toLocaleString('fr-FR')} t soulevées`,
        ),
      );
    }

    perSport.push({
      sport,
      category,
      hasDistance,
      sessions,
      totalKm,
      totalMin,
      totalDplus,
      totalTonnage,
      records,
      paliers,
    });
  }
  perSport.sort((a, b) => b.totalMin - a.totalMin);

  // Succès globaux : variété + régularité.
  const variety = bySport.size;
  const weeks = maxConsecutiveWeeks(entries.map((e) => e.date));
  const global: GlobalPalier[] = [
    ...VARIETY.map((threshold, i) => ({
      metric: 'variety' as const,
      label: `${threshold} sports différents`,
      threshold,
      value: variety,
      achieved: variety >= threshold,
      rarity: rarityAt(i + 1),
    })),
    ...WEEKS.map((threshold, i) => ({
      metric: 'weeks' as const,
      label: `${threshold} semaines d'affilée`,
      threshold,
      value: weeks,
      achieved: weeks >= threshold,
      rarity: rarityAt(i + 1),
    })),
  ];

  return { perSport, global };
}

/** Compte les trophées débloqués (paliers achieved) — pour un résumé « X/Y ». */
export function trophyCounts(t: { perSport: SportTrophies[]; global: GlobalPalier[] }): {
  unlocked: number;
  total: number;
} {
  let unlocked = 0;
  let total = 0;
  for (const s of t.perSport)
    for (const p of s.paliers) {
      total++;
      if (p.achieved) unlocked++;
    }
  for (const g of t.global) {
    total++;
    if (g.achieved) unlocked++;
  }
  return { unlocked, total };
}

/** Records battus par la DERNIÈRE séance d'un sport (pour la célébration à l'enregistrement).
 *  Compare la séance `latest` au meilleur des séances `previous` (même sport). */
export function recordsBeaten(
  previous: SportEntry[],
  latest: SportEntry,
): ('duration' | 'distance' | 'dplus')[] {
  const out: ('duration' | 'distance' | 'dplus')[] = [];
  const prevMax = (sel: (e: SportEntry) => number) => Math.max(0, ...previous.map(sel));
  if (latest.durationMin > 0 && latest.durationMin > prevMax((e) => e.durationMin))
    out.push('duration');
  if (latest.distanceKm > 0 && latest.distanceKm > prevMax((e) => e.distanceKm))
    out.push('distance');
  if (latest.dPlus > 0 && latest.dPlus > prevMax((e) => e.dPlus)) out.push('dplus');
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
