// challenges.ts — logique pure des défis (aucune dépendance Vue/Supabase).
// Calcul des objectifs par jour selon le format, suggestion de difficulté,
// statistiques (streak/complétion) et évaluation des succès.
import type { Level } from './types';

export type ChallengeFormat =
  | 'fixed'
  | 'progressive'
  | 'ramp'
  | 'pyramid'
  | 'pyramid_progressive'
  | 'wave'
  | 'cumulative';
export type ChallengeStatus = 'active' | 'done' | 'abandoned';

export interface ChallengeConfig {
  start: number;
  increment?: number;
  peak?: number;
  cycle_days?: number;
  deload_pct?: number; // part gardée le jour de décharge (0.5 = moitié)
  total?: number; // objectif cumulé (format 'cumulative')
  max?: number; // perf max de l'utilisateur (base du progressif)
  start_coef?: number; // J1 = start_coef × MAX (plage 1 → 3.5)
  inc_pct?: number; // + inc_pct % de MAX par jour (plage 3 → 15)
  variation?: number; // pyramidal progressif : % d'amplitude alternée entre pyramides (anti-monotonie)
  rest_weekdays?: number[]; // 0=dim … 6=sam
  reminder_time?: string; // « HH:MM »
  carry_over?: boolean; // report du surplus/déficit d'un jour sur les suivants
}

// Progressif basé sur le MAX (cf. formule) : J1 = start_coef × MAX,
// puis chaque jour + (inc_pct % de MAX), minimum +1.
export function progressiveDefaults(level: Level): { start_coef: number; inc_pct: number } {
  return {
    start_coef: level === 'debutant' ? 1 : level === 'avance' ? 3.5 : 2,
    inc_pct: level === 'debutant' ? 3 : level === 'avance' ? 15 : 8,
  };
}
export function progressiveApply(
  max: number,
  startCoef: number,
  incPct: number,
): { start: number; increment: number } {
  return {
    start: Math.max(1, Math.round(startCoef * max)),
    // + inc_pct % du MAX par jour, arrondi à la rep SUPÉRIEURE (min +1).
    increment: Math.max(1, Math.ceil((incPct / 100) * max)),
  };
}

export interface DayProgress {
  day: number; // index 0-based
  date: string; // YYYY-MM-DD
  target: number; // 0 = jour de repos
  done: number;
  elapsed_sec: number;
  completed: boolean;
  closed?: boolean; // « journée » clôturée par l'utilisateur (session finie)
}

// « Jour d'entraînement » : bascule à 4 h du matin (local). Les reps faites
// après minuit (jusqu'à 4 h) comptent encore pour la veille — cf. clôture manuelle.
export function logicalToday(cutoffHour = 4): string {
  const now = new Date();
  now.setHours(now.getHours() - cutoffHour);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface Challenge {
  id: string;
  exercise_id: string;
  exercise_name: string;
  unit: 'reps' | 'time';
  format: ChallengeFormat;
  duration_days: number;
  start_date: string;
  config: ChallengeConfig;
  daily_targets: number[];
  progress: DayProgress[];
  status: ChallengeStatus;
}

// ── Dates (sans fuseau : dates « locales » à minuit) ────
function dayFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}
export function addDaysIso(iso: string, d: number): string {
  const dt = dayFromIso(iso);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}
function diffDays(fromIso: string, toIso: string): number {
  return Math.round((dayFromIso(toIso).getTime() - dayFromIso(fromIso).getTime()) / 86400000);
}

function pyramidTarget(d: number, D: number, start: number, peak: number): number {
  if (D <= 1) return start;
  const mid = (D - 1) / 2;
  if (mid <= 0) return start;
  if (d <= mid) return start + (peak - start) * (d / mid);
  return peak - (peak - start) * ((d - mid) / (D - 1 - mid));
}

// Pyramides répétées dont le pic monte à chaque cycle (creux = décharge).
// `variation` (%) alterne l'amplitude d'une pyramide à l'autre pour casser la monotonie :
// un cycle plus haut, le suivant plus bas, tout en gardant la tendance montante.
function pyramidProgressiveTarget(d: number, cfg: ChallengeConfig): number {
  const cycle = cfg.cycle_days || 7;
  const c = Math.floor(d / cycle);
  const p = d % cycle;
  const v = (cfg.variation ?? 0) / 100;
  const sign = c % 2 === 0 ? 1 : -1;
  const basePeak = (cfg.peak ?? cfg.start * 1.5) + (cfg.increment ?? 0) * c;
  const peak = Math.max(cfg.start, basePeak * (1 + sign * v));
  const mid = (cycle - 1) / 2;
  if (mid <= 0) return cfg.start;
  if (p <= mid) return cfg.start + (peak - cfg.start) * (p / mid);
  return peak - (peak - cfg.start) * ((p - mid) / (cycle - 1 - mid));
}

function waveTarget(d: number, cfg: ChallengeConfig): number {
  const cycle = cfg.cycle_days || 7;
  const deload = cfg.deload_pct ?? 0.5;
  const inc = cfg.increment || 0;
  const c = Math.floor(d / cycle);
  const p = d % cycle;
  const floor = cfg.start + inc * c;
  return p === cycle - 1 ? floor * deload : floor;
}

/** Objectif de chaque jour du défi (0 = repos). Le format « cumulative » n'a pas d'objectif par jour. */
export function computeDailyTargets(
  format: ChallengeFormat,
  cfg: ChallengeConfig,
  durationDays: number,
  startDate: string,
): number[] {
  const rest = cfg.rest_weekdays ?? [];
  const out: number[] = [];
  for (let d = 0; d < durationDays; d++) {
    if (rest.includes(dayFromIso(addDaysIso(startDate, d)).getDay())) {
      out.push(0);
      continue;
    }
    let t: number;
    switch (format) {
      case 'fixed':
        t = cfg.start;
        break;
      case 'progressive':
        t = cfg.start + (cfg.increment ?? 0) * d;
        break;
      case 'ramp': {
        // Rampe linéaire de min (start) à max (peak) sur la durée.
        const peak = cfg.peak ?? cfg.start;
        t = durationDays <= 1 ? peak : cfg.start + (peak - cfg.start) * (d / (durationDays - 1));
        break;
      }
      case 'pyramid':
        t = pyramidTarget(d, durationDays, cfg.start, cfg.peak ?? cfg.start * 2);
        break;
      case 'pyramid_progressive':
        t = pyramidProgressiveTarget(d, cfg);
        break;
      case 'wave':
        t = waveTarget(d, cfg);
        break;
      case 'cumulative':
        t = 0;
        break;
      default:
        t = cfg.start;
    }
    out.push(Math.max(0, Math.round(t)));
  }
  return out;
}

// ── Suggestion de difficulté (départ / incrément / pic) ──
function repsBase(level: Level): number {
  return level === 'debutant' ? 25 : level === 'avance' ? 70 : 45;
}
function secBase(level: Level): number {
  return level === 'debutant' ? 20 : level === 'avance' ? 60 : 40;
}
function incBase(level: Level): number {
  return level === 'debutant' ? 2 : level === 'avance' ? 5 : 3;
}
function exerciseFactor(exerciseId: string): number {
  const id = exerciseId.toLowerCase();
  if (/pullup|traction|dips|muscle.?up/.test(id)) return 0.16; // dur
  if (/squat|mollet|calf|lunge|fente|crunch|leg_raise|releve|superman|glute|bridge|band/.test(id))
    return 1.6; // facile/haut volume
  return 1; // moyen (pompes…)
}

export function suggestConfig(
  unit: 'reps' | 'time',
  level: Level,
  format: ChallengeFormat,
  durationDays: number,
  exerciseId: string,
): ChallengeConfig {
  const max =
    unit === 'time'
      ? secBase(level)
      : Math.max(3, Math.round(repsBase(level) * exerciseFactor(exerciseId)));
  const common = {
    max,
    cycle_days: 7,
    deload_pct: 0.5,
    total: Math.round(max * durationDays * 0.9),
    rest_weekdays: [] as number[],
  };
  if (format === 'progressive') {
    const { start_coef, inc_pct } = progressiveDefaults(level);
    const { start, increment } = progressiveApply(max, start_coef, inc_pct);
    return { ...common, start_coef, inc_pct, start, increment, peak: Math.round(start * 1.8) };
  }
  if (format === 'ramp') {
    // min ~ 40 % du max, max = perf ; l'utilisateur ajuste ensuite.
    return { ...common, start: Math.max(1, Math.round(max * 0.4)), peak: max };
  }
  const increment = unit === 'time' ? 5 : Math.max(1, Math.round(incBase(level)));
  const variation = format === 'pyramid_progressive' ? 15 : 0;
  return { ...common, start: max, increment, peak: Math.round(max * 1.8), variation };
}

// ── Report réserve/dette ────────────────────────────────
/** Solde de report avant un jour : Σ (réalisé − objectif de base) sur les jours actifs passés.
 *  > 0 = réserve (avance), < 0 = dette (retard). */
export function carryBalance(ch: Challenge, beforeDay: number): number {
  if (ch.format === 'cumulative' || !ch.config.carry_over) return 0;
  const map = progByDay(ch);
  let bal = 0;
  const end = Math.min(beforeDay, ch.duration_days);
  for (let d = 0; d < end; d++) {
    const base = ch.daily_targets[d] ?? 0;
    if (base === 0) continue;
    bal += (map.get(d)?.done ?? 0) - base;
  }
  return bal;
}
/** Objectif effectif d'un jour quand le report est activé (sinon = objectif de base). */
export function effectiveTarget(ch: Challenge, day: number): number {
  const base = ch.daily_targets[day] ?? 0;
  if (base === 0 || ch.format === 'cumulative' || !ch.config.carry_over) return base;
  return Math.max(0, base - carryBalance(ch, day));
}

/** Avance (>0) / retard (<0) courant vs le plan, TOUS défis (indépendant du report).
 *  Solde à l'entrée d'aujourd'hui = Σ (réalisé − objectif) sur les jours passés.
 *  Cumulé : réalisé − part attendue au prorata des jours écoulés. Unité = ch.unit. */
export function challengeBalance(ch: Challenge, todayIso = logicalToday()): number {
  const dayIndex = diffDays(ch.start_date, todayIso);
  if (ch.format === 'cumulative') {
    const elapsed = Math.min(Math.max(0, dayIndex), ch.duration_days);
    const expected = Math.round(((ch.config.total || 0) * elapsed) / (ch.duration_days || 1));
    const doneTotal = ch.progress.reduce((a, p) => a + (p.done || 0), 0);
    return doneTotal - expected;
  }
  const map = progByDay(ch);
  let bal = 0;
  const end = Math.min(Math.max(0, dayIndex), ch.duration_days);
  for (let d = 0; d < end; d++) {
    const base = ch.daily_targets[d] ?? 0;
    if (base === 0) continue;
    bal += (map.get(d)?.done ?? 0) - base;
  }
  return bal;
}

// ── Statistiques d'un défi ──────────────────────────────
export interface ChallengeStats {
  dayIndex: number; // -1 = pas commencé ; >= durationDays = fini
  todayTarget: number; // objectif du jour (0 = repos/hors période)
  todayDone: number;
  isDoneToday: boolean;
  streak: number;
  completionPct: number; // 0..100
  totalDone: number;
  activeDays: number;
  completedDays: number;
  daysLeft: number;
}

function progByDay(ch: Challenge): Map<number, DayProgress> {
  const m = new Map<number, DayProgress>();
  for (const p of ch.progress) m.set(p.day, p);
  return m;
}

export function challengeStats(ch: Challenge, todayIso = logicalToday()): ChallengeStats {
  const D = ch.duration_days;
  const dayIndex = diffDays(ch.start_date, todayIso);
  const map = progByDay(ch);
  const totalDone = ch.progress.reduce((a, p) => a + (p.done || 0), 0);
  const activeDays = ch.format === 'cumulative' ? D : ch.daily_targets.filter((t) => t > 0).length;
  const completedDays = ch.progress.filter((p) => p.completed).length;

  const inRange = dayIndex >= 0 && dayIndex < D;
  const todayTarget = inRange ? (ch.daily_targets[dayIndex] ?? 0) : 0;
  const todayDone = map.get(dayIndex)?.done ?? 0;

  let isDoneToday: boolean;
  let completionPct: number;
  if (ch.format === 'cumulative') {
    const total = ch.config.total || 1;
    completionPct = Math.min(100, Math.round((totalDone / total) * 100));
    isDoneToday = todayDone > 0;
  } else {
    completionPct = activeDays ? Math.round((completedDays / activeDays) * 100) : 0;
    isDoneToday = inRange && (todayTarget === 0 || (map.get(dayIndex)?.completed ?? false));
  }

  // Streak : jours actifs consécutifs complétés jusqu'à aujourd'hui (les repos ne cassent pas).
  let streak = 0;
  for (let d = Math.min(dayIndex, D - 1); d >= 0; d--) {
    const tgt = ch.daily_targets[d] ?? 0;
    if (ch.format !== 'cumulative' && tgt === 0) continue; // repos : neutre
    const p = map.get(d);
    if (ch.format === 'cumulative') {
      if ((p?.done ?? 0) > 0) streak++;
      else break;
    } else if (p?.completed) streak++;
    else break;
  }

  return {
    dayIndex,
    todayTarget,
    todayDone,
    isDoneToday,
    streak,
    completionPct,
    totalDone,
    activeDays,
    completedDays,
    daysLeft: Math.max(0, D - Math.max(0, dayIndex)),
  };
}

/** Un défi est-il terminé (à marquer 'done') ? */
export function isChallengeComplete(ch: Challenge, todayIso = logicalToday()): boolean {
  if (ch.format === 'cumulative')
    return ch.progress.reduce((a, p) => a + p.done, 0) >= (ch.config.total || Infinity);
  return (
    diffDays(ch.start_date, todayIso) >= ch.duration_days - 1 &&
    ch.daily_targets.every(
      (t, d) => t === 0 || (ch.progress.find((p) => p.day === d)?.completed ?? false),
    )
  );
}

// ── Succès (codes ; catalogue statique côté front) ──────
const ALL_FORMATS: ChallengeFormat[] = [
  'fixed',
  'progressive',
  'ramp',
  'pyramid',
  'pyramid_progressive',
  'wave',
  'cumulative',
];

export function evaluateAchievements(challenges: Challenge[]): string[] {
  const codes = new Set<string>();
  const done = challenges.filter((c) => c.status === 'done');
  const abandoned = challenges.filter((c) => c.status === 'abandoned');
  // Seuls les défis en REPS comptent pour les paliers de reps : le temps (gainage)
  // ne doit pas gonfler les compteurs (anti-triche « laisser traîner le chrono »).
  const totalReps = challenges.reduce(
    (a, c) => a + (c.unit === 'reps' ? c.progress.reduce((b, p) => b + (p.done || 0), 0) : 0),
    0,
  );
  const distinctExos = new Set(challenges.map((c) => c.exercise_id)).size;
  const maxStreak = Math.max(0, ...challenges.map((c) => challengeStats(c).streak));
  const activeCount = challenges.filter((c) => c.status === 'active').length;

  // Refaire : nb max de défis TERMINÉS sur un même exercice.
  const doneByExo = new Map<string, number>();
  for (const c of done) doneByExo.set(c.exercise_id, (doneByExo.get(c.exercise_id) ?? 0) + 1);
  const maxRepeatExo = Math.max(0, ...doneByExo.values());

  // Dépassement : record perso battu (défi terminé plus dur qu'un précédent, même exo).
  const peaksByExo = new Map<string, { date: string; peak: number }[]>();
  for (const c of done) {
    const peak = Math.max(0, ...c.daily_targets);
    const arr = peaksByExo.get(c.exercise_id) ?? [];
    arr.push({ date: c.start_date, peak });
    peaksByExo.set(c.exercise_id, arr);
  }
  let beatRecord = false;
  for (const arr of peaksByExo.values()) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
    let maxBefore = 0;
    for (const { peak } of arr) {
      if (maxBefore > 0 && peak > maxBefore) beatRecord = true;
      maxBefore = Math.max(maxBefore, peak);
    }
  }

  const doneFormats = new Set(done.map((c) => c.format));
  const allFormatsDone = ALL_FORMATS.every((f) => doneFormats.has(f));

  // Dépassement / cachés : au niveau d'un jour réalisé.
  let bullseye = false; // done === cible exactement
  let surrégime = false; // ≥ 2× la cible (reps uniquement)
  let bigDay = false; // ≥ 200 reps sur une journée (reps uniquement)
  for (const c of challenges) {
    const isReps = c.unit === 'reps';
    for (const p of c.progress) {
      if (p.target > 0 && p.completed && p.done === p.target) bullseye = true;
      if (isReps && p.target > 0 && p.done >= p.target * 2) surrégime = true;
      if (isReps && (p.done || 0) >= 200) bigDay = true;
    }
  }

  // Paliers reps
  if (totalReps >= 1000) codes.add('reps_1000');
  if (totalReps >= 5000) codes.add('reps_5000');
  if (totalReps >= 20000) codes.add('reps_20000');
  if (totalReps >= 50000) codes.add('reps_50000');
  if (totalReps >= 100000) codes.add('reps_100000');
  // Paliers série
  if (maxStreak >= 3) codes.add('streak_3');
  if (maxStreak >= 7) codes.add('streak_7');
  if (maxStreak >= 30) codes.add('streak_30');
  if (maxStreak >= 100) codes.add('streak_100');
  if (maxStreak >= 365) codes.add('streak_365');
  // Paliers défis terminés
  if (done.length >= 1) codes.add('first_done');
  if (done.length >= 5) codes.add('five_done');
  if (done.length >= 10) codes.add('ten_done');
  if (done.length >= 25) codes.add('done_25');
  if (done.length >= 50) codes.add('done_50');
  // Refaire / régularité
  if (maxRepeatExo >= 3) codes.add('repeat_3');
  if (maxRepeatExo >= 5) codes.add('repeat_5');
  if (maxRepeatExo >= 10) codes.add('repeat_10');
  if (done.length >= 1 && abandoned.length >= 1) codes.add('phoenix');
  // Variété
  if (distinctExos >= 3) codes.add('variety_3');
  if (distinctExos >= 5) codes.add('variety_5');
  if (distinctExos >= 8) codes.add('variety_8');
  if (allFormatsDone) codes.add('all_formats');
  if (activeCount >= 3) codes.add('multi_active');
  // Dépassement / cachés
  if (beatRecord) codes.add('beat_record');
  if (bullseye) codes.add('bullseye');
  if (surrégime) codes.add('surregime');
  if (bigDay) codes.add('big_day');

  for (const c of done) {
    const perfect = c.progress.every((p) => p.target === 0 || p.completed);
    if (c.duration_days >= 100) codes.add('century');
    if (c.duration_days >= 60) codes.add('marathon');
    if (c.duration_days >= 30 && perfect) codes.add('perfect_month');
    if (perfect) codes.add('perfectionist');
    if (c.format === 'pyramid') codes.add('pyramid_done');
    if (c.format === 'pyramid_progressive') codes.add('pyramid_progressive_done');
    if (c.format === 'wave') codes.add('wave_done');
    if (c.format === 'ramp') codes.add('ramp_done');
    if (c.format === 'cumulative') codes.add('cumulative_done');
    if (c.config.carry_over) codes.add('carry_master');
    if (c.progress.some((p) => p.target > 0 && !p.completed)) codes.add('comeback');
  }
  return [...codes];
}

// ── Niveau global / XP (moteur « la barre avance toujours ») ──
export interface ChallengeLevel {
  xp: number;
  level: number; // 1-based
  title: string;
  levelBaseXp: number; // XP au début du niveau courant
  nextLevelXp: number | null; // XP requis pour le niveau suivant (null = max)
  progressPct: number; // 0..100 dans le niveau courant
}

const LEVEL_BANDS: { min: number; title: string }[] = [
  { min: 0, title: 'Débutant' },
  { min: 500, title: 'Initié' },
  { min: 1500, title: 'Habitué' },
  { min: 3500, title: 'Confirmé' },
  { min: 7000, title: 'Athlète' },
  { min: 12000, title: 'Vétéran' },
  { min: 20000, title: 'Élite' },
  { min: 35000, title: 'Maître' },
  { min: 60000, title: 'Champion' },
  { min: 100000, title: 'Légende' },
];

/** XP = reps cumulées + 25/jour validé + 250/défi terminé.
 *  Le TEMPS (défis en 'time') ne génère PAS d'XP proportionnelle (anti-triche
 *  chrono) : ces défis ne rapportent que via les jours validés et la complétion. */
export function challengeXp(challenges: Challenge[]): ChallengeLevel {
  const totalReps = challenges.reduce(
    (a, c) => a + (c.unit === 'reps' ? c.progress.reduce((b, p) => b + (p.done || 0), 0) : 0),
    0,
  );
  const completedDays = challenges.reduce(
    (a, c) => a + c.progress.filter((p) => p.completed).length,
    0,
  );
  const doneChallenges = challenges.filter((c) => c.status === 'done').length;
  const xp = Math.round(totalReps + completedDays * 25 + doneChallenges * 250);

  let idx = 0;
  for (let i = 0; i < LEVEL_BANDS.length; i++) {
    if (xp >= LEVEL_BANDS[i]!.min) idx = i;
  }
  const band = LEVEL_BANDS[idx]!;
  const next = LEVEL_BANDS[idx + 1] ?? null;
  const progressPct = next
    ? Math.min(100, Math.round(((xp - band.min) / (next.min - band.min)) * 100))
    : 100;
  return {
    xp,
    level: idx + 1,
    title: band.title,
    levelBaseXp: band.min,
    nextLevelXp: next ? next.min : null,
    progressPct,
  };
}
