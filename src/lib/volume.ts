// volume.ts — répartition des séries par groupe musculaire (pur).
// Pour une séance planifiée (prévu) et pour un bilan (prévu vs réalisé).
import type { Session, SessionLog } from './types';

export interface MuscleSets {
  muscle: string;
  sets: number;
}
export interface MuscleVolume {
  muscle: string;
  planned: number;
  done: number;
}

// Couleur indicative par groupe (mêmes teintes que le picker libre).
export const MUSCLE_COLORS: Record<string, string> = {
  pectoraux: '#FF6A45',
  épaules: '#FFB23F',
  triceps: '#C6D24A',
  biceps: '#7BC86C',
  dos: '#46C7F0',
  quadriceps: '#B388FF',
  'ischio-jambiers': '#8E5CF0',
  mollets: '#57D996',
  abdominaux: '#FF4D6D',
};
export function muscleColor(m: string): string {
  return MUSCLE_COLORS[m.toLowerCase()] ?? '#9A8F7E';
}

// Séries prévues par muscle pour une séance (prescription si présente, sinon target.sets).
export function plannedSetsByMuscle(session: Session): MuscleSets[] {
  const map = new Map<string, number>();
  for (const ex of session.exercises) {
    const m = ex.muscle_primary ?? '—';
    const sets = ex.prescription?.length || ex.target.sets || 0;
    map.set(m, (map.get(m) ?? 0) + sets);
  }
  return [...map.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);
}

// Séries prévues vs réalisées par muscle pour un bilan.
export function setsByMuscleFromLog(log: SessionLog): MuscleVolume[] {
  const map = new Map<string, { planned: number; done: number }>();
  for (const ex of log.exercises) {
    const m = ex.muscle_primary ?? '—';
    const cur = map.get(m) ?? { planned: 0, done: 0 };
    cur.planned += ex.planned?.sets ?? 0;
    cur.done += ex.performed.length;
    map.set(m, cur);
  }
  return [...map.entries()]
    .map(([muscle, v]) => ({ muscle, ...v }))
    .sort((a, b) => b.done - a.done);
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume HEBDO : réel vs CIBLE — ferme la boucle du programme. `computeMuscleTargets`
// (programBuilder) donne des séries/semaine cibles par muscle mais n'était utilisé
// qu'à la génération ; ici on agrège le volume RÉALISÉ par semaine pour le confronter
// à ces cibles (muscle négligé / surchargé) + des tendances (volume/semaine, fréquence,
// régularité). Tout est pur/testable (le `now` est passé par l'appelant).
// ─────────────────────────────────────────────────────────────────────────────

/** Un bilan dans l'historique, avec sa date (ISO). */
export interface LogEntry {
  performedAt: string;
  log: SessionLog;
}

/** Un bilan compte-t-il comme MUSCULATION ? (discipline absente = musculation ;
 *  prépa physique / cardio / autre sport exclus du volume muscu). */
export function isMuscuLog(log: SessionLog): boolean {
  return !log.discipline || log.discipline === 'musculation';
}

/** Formate une Date en YYYY-MM-DD à partir de ses composantes LOCALES (jamais via
 *  toISOString → pas de décalage de jour selon le fuseau, cf. garde-fou challenges). */
function fmtDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Lundi (YYYY-MM-DD) de la semaine ISO contenant `dateIso` (lundi → dimanche). */
export function mondayOf(dateIso: string): string {
  const d = new Date(dateIso.slice(0, 10) + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7; // 0 = lundi
  d.setDate(d.getDate() - dow);
  return fmtDay(d);
}

/** Séries RÉALISÉES par muscle sur les bilans muscu dont la date ∈ [startIso, endIso). */
export function setsByMuscleInRange(
  entries: LogEntry[],
  startIso: string,
  endIso: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const day = e.performedAt.slice(0, 10);
    if (day < startIso || day >= endIso) continue;
    if (!isMuscuLog(e.log)) continue;
    for (const ex of e.log.exercises ?? []) {
      const m = (ex.muscle_primary ?? '').toLowerCase();
      if (!m) continue;
      out[m] = (out[m] ?? 0) + (ex.performed?.length ?? 0);
    }
  }
  return out;
}

/** Séries muscu réalisées par muscle sur la semaine EN COURS (lundi → aujourd'hui inclus). */
export function weeklySetsByMuscle(entries: LogEntry[], nowIso: string): Record<string, number> {
  const start = mondayOf(nowIso);
  const end = new Date(nowIso.slice(0, 10) + 'T00:00:00');
  end.setDate(end.getDate() + 1); // borne haute exclusive = demain
  return setsByMuscleInRange(entries, start, fmtDay(end));
}

export type VolumeState = 'low' | 'ok' | 'high';
export interface MuscleTargetStatus {
  muscle: string;
  done: number;
  target: number;
  pct: number; // done / target
  state: VolumeState;
}

/** Compare le volume réalisé par muscle à la cible hebdo. Seuils : <60 % = bas
 *  (négligé), >130 % = haut (surchargé), sinon ok. N'inclut que les muscles ciblés
 *  (target > 0). Trié : les plus en retard d'abord (guide l'action). */
export function volumeVsTarget(
  done: Record<string, number>,
  targets: Record<string, number>,
): MuscleTargetStatus[] {
  const out: MuscleTargetStatus[] = [];
  for (const [muscle, target] of Object.entries(targets)) {
    if (target <= 0) continue;
    const d = done[muscle.toLowerCase()] ?? 0;
    const pct = d / target;
    const state: VolumeState = pct < 0.6 ? 'low' : pct > 1.3 ? 'high' : 'ok';
    out.push({ muscle, done: d, target, pct, state });
  }
  return out.sort((a, b) => a.pct - b.pct || b.target - a.target);
}

export interface WeekVolume {
  weekStart: string; // lundi YYYY-MM-DD
  sets: number;
  tonnage: number;
  sessions: number;
}

/** Volume muscu agrégé par semaine sur les `nWeeks` dernières semaines (semaine de
 *  `nowIso` incluse), la plus ANCIENNE d'abord → courbe de tendance. */
export function weeklyVolumeSeries(
  entries: LogEntry[],
  nWeeks: number,
  nowIso: string,
): WeekVolume[] {
  const base = new Date(mondayOf(nowIso) + 'T00:00:00');
  const weeks: string[] = [];
  for (let i = nWeeks - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i * 7);
    weeks.push(fmtDay(d));
  }
  const idx = new Map(weeks.map((w, i) => [w, i]));
  const out: WeekVolume[] = weeks.map((weekStart) => ({
    weekStart,
    sets: 0,
    tonnage: 0,
    sessions: 0,
  }));
  const oldest = weeks[0]!;
  for (const e of entries) {
    if (!isMuscuLog(e.log)) continue;
    const day = e.performedAt.slice(0, 10);
    if (day < oldest) continue;
    const i = idx.get(mondayOf(day));
    if (i === undefined) continue;
    let hasSet = false;
    for (const ex of e.log.exercises ?? [])
      for (const s of ex.performed ?? []) {
        out[i]!.sets += 1;
        out[i]!.tonnage += (s.load_kg || 0) * (s.reps || 0);
        hasSet = true;
      }
    if (hasSet) out[i]!.sessions += 1;
  }
  return out;
}

/** Nb de séances muscu (bilans avec ≥1 série faite) sur les `days` derniers jours. */
export function muscuSessionsInLastDays(entries: LogEntry[], days: number, nowIso: string): number {
  const cutoff = new Date(nowIso.slice(0, 10) + 'T00:00:00');
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cut = fmtDay(cutoff);
  let n = 0;
  for (const e of entries) {
    if (!isMuscuLog(e.log)) continue;
    if (e.performedAt.slice(0, 10) < cut) continue;
    if ((e.log.exercises ?? []).some((ex) => (ex.performed?.length ?? 0) > 0)) n++;
  }
  return n;
}

/** Nb de semaines CONSÉCUTIVES avec ≥1 séance muscu, en partant de la semaine en
 *  cours (si active) sinon de la précédente → tolère une semaine pas encore entamée. */
export function muscuWeekStreak(entries: LogEntry[], nowIso: string): number {
  const active = new Set<string>();
  for (const e of entries) {
    if (!isMuscuLog(e.log)) continue;
    if ((e.log.exercises ?? []).some((ex) => (ex.performed?.length ?? 0) > 0))
      active.add(mondayOf(e.performedAt.slice(0, 10)));
  }
  if (!active.size) return 0;
  const cursor = new Date(mondayOf(nowIso) + 'T00:00:00');
  if (!active.has(fmtDay(cursor))) cursor.setDate(cursor.getDate() - 7);
  let streak = 0;
  while (active.has(fmtDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}
