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
  adaptive?: boolean; // difficulté auto : s'ajuste au ressenti + résultat (calibration implicite)
  capacity?: number; // échelle courante (pic) pilotée par l'autorégulation
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
  rpe?: 1 | 2 | 3; // ressenti à la clôture : 1=facile, 2=bien dosé, 3=très dur
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
  unit: 'reps' | 'time' | 'distance'; // distance = km (marche/course/vélo)
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

// Distance de base par jour (km) selon l'activité et le niveau.
function distanceBase(level: Level, exerciseId: string): number {
  const id = exerciseId.toLowerCase();
  // vélo ~20 ; marche ~5 ; marche ou course ~6 ; course ~7 (km/jour, avant niveau).
  const per = id.includes('velo')
    ? 20
    : id.includes('marche_course')
      ? 6
      : id.includes('marche')
        ? 5
        : 7;
  const f = level === 'debutant' ? 0.7 : level === 'avance' ? 1.3 : 1;
  return Math.max(2, Math.round(per * f));
}

export function suggestConfig(
  unit: 'reps' | 'time' | 'distance',
  level: Level,
  format: ChallengeFormat,
  durationDays: number,
  exerciseId: string,
): ChallengeConfig {
  let max: number;
  if (unit === 'time') max = secBase(level);
  else if (unit === 'distance') max = distanceBase(level, exerciseId);
  else max = Math.max(3, Math.round(repsBase(level) * exerciseFactor(exerciseId)));
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
  let increment: number;
  if (unit === 'time') increment = 5;
  else if (unit === 'distance') increment = Math.max(1, Math.round(max * 0.12));
  else increment = Math.max(1, Math.round(incBase(level)));
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

// ── Recalibrage de difficulté en cours ──────────────────
/** Valeur de référence (« max ») d'un défi : total pour cumulé, sinon le pic. */
export function challengeRefValue(ch: Challenge): number {
  if (ch.format === 'cumulative') return ch.config.total ?? 0;
  return Math.max(1, ...ch.daily_targets);
}

export interface RecalSuggestion {
  dir: 'up' | 'down'; // up = trop facile (monter) ; down = trop dur (alléger)
  streak: number; // nb de jours d'affilée dans le même sens
  refCur: number; // pic actuel
  refNew: number; // pic suggéré
  fromDay: number; // 1er jour à régénérer (demain)
}

/** Suggère un recalibrage si l'utilisateur dépasse OU rate régulièrement l'objectif.
 *  Conditions : défi actif, non cumulé, PAS de report, ≥ 3 jours actifs consécutifs
 *  de même sens (≥ 15 % au-dessus = monter, ≤ 15 % en-dessous = alléger), jours restants. */
export function recalibrationSuggestion(
  ch: Challenge,
  todayIso = logicalToday(),
): RecalSuggestion | null {
  // Adaptatif : l'autorégulation quotidienne s'en charge → pas de bannière manuelle.
  if (
    ch.status !== 'active' ||
    ch.format === 'cumulative' ||
    ch.config.carry_over ||
    ch.config.adaptive
  )
    return null;
  const dayIndex = diffDays(ch.start_date, todayIso);
  const fromDay = dayIndex + 1; // on régénère demain → aujourd'hui inchangé
  if (dayIndex < 3 || fromDay >= ch.duration_days) return null;

  const map = progByDay(ch);
  const margin = 0.15;
  let dir: 'up' | 'down' | null = null;
  let streak = 0;
  const ratios: number[] = [];
  for (let d = Math.min(dayIndex, ch.duration_days) - 1; d >= 0; d--) {
    const t = ch.daily_targets[d] ?? 0;
    if (t === 0) continue; // repos : neutre
    const p = map.get(d);
    const doneD = p?.done ?? 0;
    const over = !!p?.completed && doneD >= t * (1 + margin);
    const under = doneD <= t * (1 - margin); // inclut les jours non faits (0)
    const dayDir = over ? 'up' : under ? 'down' : null;
    if (dayDir === null) break; // dans la cible → fin de série
    if (dir === null) dir = dayDir;
    else if (dir !== dayDir) break;
    streak++;
    ratios.push(doneD / t);
  }
  if (!dir || streak < 3) return null;

  const refCur = challengeRefValue(ch);
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  let refNew: number;
  if (dir === 'up') {
    const bump = Math.min(1.5, Math.max(1.1, avg)); // +10 % à +50 %
    refNew = Math.max(refCur + 1, Math.round(refCur * bump));
  } else {
    const cut = Math.min(0.9, Math.max(0.5, avg)); // −10 % à −50 %
    refNew = Math.max(1, Math.min(refCur - 1, Math.round(refCur * cut)));
  }
  return { dir, streak, refCur, refNew, fromDay };
}

/** Régénère les objectifs à partir de `fromDay` en visant un nouveau pic `refNew`.
 *  Le passé (jours < fromDay) est figé ; les jours restants sont mis à l'échelle. */
export function rescaleRemaining(
  ch: Challenge,
  fromDay: number,
  refNew: number,
): { daily_targets: number[]; config: ChallengeConfig } {
  const refCur = challengeRefValue(ch);
  const factor = refCur > 0 ? refNew / refCur : 1;
  if (ch.format === 'cumulative') {
    return { daily_targets: ch.daily_targets, config: { ...ch.config, total: Math.round(refNew) } };
  }
  const daily_targets = ch.daily_targets.map((t, d) => {
    if (d < fromDay || t === 0) return t;
    return Math.max(1, Math.round(t * factor));
  });
  const config = { ...ch.config };
  if (config.max) config.max = Math.round(config.max * factor);
  if (config.peak) config.peak = Math.round(config.peak * factor);
  if (config.start && ch.format !== 'ramp') config.start = Math.round(config.start * factor);
  return { daily_targets, config };
}

// ── Autorégulation (mode adaptatif) ─────────────────────
/** Ajustement d'échelle d'UN jour, à partir du résultat (réalisé/cible) et du
 *  ressenti (1=facile, 2=bien, 3=très dur). > 0 = monter, < 0 = alléger.
 *  Overload doux par défaut (bien dosé + réussi → +2 %). Borné, appliqué aux
 *  jours restants à la clôture. Le ressenti prime, le résultat corrige. */
export function adaptiveDayAdjustment(ratio: number, rpe?: 1 | 2 | 3): number {
  const hit = ratio >= 1;
  if (rpe === 3 || ratio < 0.8) return -0.08; // très dur ou raté → alléger
  if (rpe === 1 && hit) return 0.06; // trop facile → monter
  if (hit) return 0.02; // bien dosé + réussi → overload doux
  return -0.02; // proche mais pas atteint → léger repli
}

/** Met à l'échelle les jours restants (≥ fromDay) par `factor` (1 = inchangé).
 *  Passé + aujourd'hui figés ; met à jour capacity/max/peak/start pour cohérence. */
export function scaleRemaining(
  ch: Challenge,
  fromDay: number,
  factor: number,
): { daily_targets: number[]; config: ChallengeConfig } {
  const f = Math.max(0.5, Math.min(1.5, factor));
  const config = { ...ch.config };
  if (config.capacity) config.capacity = Math.max(1, Math.round(config.capacity * f));
  if (config.max) config.max = Math.max(1, Math.round(config.max * f));
  if (config.peak) config.peak = Math.max(1, Math.round(config.peak * f));
  if (config.start && ch.format !== 'ramp')
    config.start = Math.max(1, Math.round(config.start * f));
  if (ch.format === 'cumulative') {
    if (config.total) config.total = Math.max(1, Math.round(config.total * f));
    return { daily_targets: ch.daily_targets, config };
  }
  const daily_targets = ch.daily_targets.map((t, d) => {
    if (d < fromDay || t === 0) return t;
    return Math.max(1, Math.round(t * f));
  });
  return { daily_targets, config };
}

/** Prolonge un défi de `addDays` jours : le passé est intact, on ajoute des jours
 *  au niveau courant (respecte les jours de repos). Cumulé : total au prorata.
 *  La prime de complétion se recalcule d'elle-même sur la durée totale finale. */
export function extendChallenge(
  ch: Challenge,
  addDays: number,
): { duration_days: number; daily_targets: number[]; config: ChallengeConfig } {
  const add = Math.max(1, Math.round(addDays));
  const newDuration = ch.duration_days + add;
  if (ch.format === 'cumulative') {
    const total = Math.round(((ch.config.total ?? 0) * newDuration) / (ch.duration_days || 1));
    return {
      duration_days: newDuration,
      daily_targets: ch.daily_targets,
      config: { ...ch.config, total },
    };
  }
  // Niveau courant = dernier objectif non nul (ou capacité/départ).
  const lastTarget =
    [...ch.daily_targets].reverse().find((t) => t > 0) ??
    ch.config.capacity ??
    ch.config.start ??
    1;
  const rest = ch.config.rest_weekdays ?? [];
  const extra: number[] = [];
  for (let d = ch.duration_days; d < newDuration; d++) {
    const isRest = rest.includes(dayFromIso(addDaysIso(ch.start_date, d)).getDay());
    extra.push(isRest ? 0 : Math.max(1, Math.round(lastTarget)));
  }
  return {
    duration_days: newDuration,
    daily_targets: [...ch.daily_targets, ...extra],
    config: { ...ch.config },
  };
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

// ── XP des challenges (le niveau numérique est calculé via src/lib/levels.ts) ──

/** « Effort planifié » d'un défi (unité-neutre) : total des objectifs, le TEMPS
 *  ramené à ~1 point / 4 s pour comparer reps et gainage. Basé sur le PLAN (pas
 *  l'écoulé) → non farmable au chrono, et réduit si on allège le défi. */
function plannedEffort(ch: Challenge): number {
  const raw =
    ch.format === 'cumulative'
      ? (ch.config.total ?? 0)
      : ch.daily_targets.reduce((a, t) => a + t, 0);
  return ch.unit === 'time' ? raw / 4 : raw;
}

/** Multiplicateur de durée sur la prime : plus le défi est long, plus la prime
 *  croît vite (super-linéaire) → aller au bout d'un long défi est nettement plus
 *  rentable que de découper en petits. Plafonné (×5 à 120 j).
 *  Basé sur les JOURS ACTIFS (non repos), pas le calendrier : bourrer de jours de
 *  repos ne gonfle pas le multiplicateur pour un même travail réel (anti-faille). */
export function durationMultiplier(activeDays: number): number {
  return 1 + Math.min(Math.max(0, activeDays), 120) / 30;
}

/** Nombre de jours actifs (non repos) d'un défi. */
export function activeDaysOf(ch: Challenge): number {
  if (ch.format !== 'cumulative') return ch.daily_targets.filter((t) => t > 0).length;
  const rest = ch.config.rest_weekdays ?? [];
  if (!rest.length) return ch.duration_days;
  let n = 0;
  for (let d = 0; d < ch.duration_days; d++) {
    if (!rest.includes(dayFromIso(addDaysIso(ch.start_date, d)).getDay())) n++;
  }
  return n;
}

/** Points d'XP issus des CHALLENGES : reps cumulées (défis reps only, anti-farm
 *  chrono) + 25/jour validé + prime de complétion proportionnelle (25 % de l'effort
 *  planifié × multiplicateur de durée → un long défi terminé rapporte bien plus). */
export function challengeXpPoints(challenges: Challenge[]): number {
  const totalReps = challenges.reduce(
    (a, c) => a + (c.unit === 'reps' ? c.progress.reduce((b, p) => b + (p.done || 0), 0) : 0),
    0,
  );
  const completedDays = challenges.reduce(
    (a, c) => a + c.progress.filter((p) => p.completed).length,
    0,
  );
  const completionBonus = challenges
    .filter((c) => c.status === 'done')
    .reduce(
      (a, c) => a + Math.round(0.25 * plannedEffort(c) * durationMultiplier(activeDaysOf(c))),
      0,
    );
  return Math.round(totalReps + completedDays * 25 + completionBonus);
}
