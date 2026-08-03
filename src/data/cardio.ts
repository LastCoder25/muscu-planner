// cardio.ts — libellés et calculs pour le cardio (log global).
import type { CardioActivity } from '@/lib/types';

export interface ActivityDef {
  id: CardioActivity;
  label: string;
  icon: string;
  hasElevation: boolean; // D+/D- pertinents (extérieur)
}

export const CARDIO_ACTIVITIES: ActivityDef[] = [
  { id: 'marche', label: 'Marche', icon: 'directions_walk', hasElevation: true },
  { id: 'rando', label: 'Rando', icon: 'hiking', hasElevation: true },
  { id: 'course', label: 'Course', icon: 'directions_run', hasElevation: true },
  { id: 'trail', label: 'Trail', icon: 'terrain', hasElevation: true },
  { id: 'velo', label: 'Vélo', icon: 'directions_bike', hasElevation: true },
  { id: 'velo_appart', label: "Vélo d'appart", icon: 'pedal_bike', hasElevation: false },
  { id: 'marche_tapis', label: 'Marche tapis', icon: 'directions_walk', hasElevation: false },
  { id: 'course_tapis', label: 'Course tapis', icon: 'directions_run', hasElevation: false },
];

export const ACTIVITY_LABELS = Object.fromEntries(
  CARDIO_ACTIVITIES.map((a) => [a.id, a.label]),
) as Record<CardioActivity, string>;
export const ACTIVITY_ICONS = Object.fromEntries(
  CARDIO_ACTIVITIES.map((a) => [a.id, a.icon]),
) as Record<CardioActivity, string>;

export function activityHasElevation(a: CardioActivity): boolean {
  return CARDIO_ACTIVITIES.find((x) => x.id === a)?.hasElevation ?? false;
}

// Défis cardio alimentés par une sortie de cette activité. Marche/rando/tapis
// = « à pied », course/trail/tapis = « courue » → les deux nourrissent le défi
// combiné « Marche ou course » (+ l'ancien défi séparé s'il existe encore).
// Vélo (route/appart) → défi vélo.
const WALK: CardioActivity[] = ['marche', 'rando', 'marche_tapis'];
const RUN: CardioActivity[] = ['course', 'trail', 'course_tapis'];
export function challengeIdsForActivity(a: CardioActivity): string[] {
  if (WALK.includes(a)) return ['ex_ch_marche_course', 'ex_ch_marche'];
  if (RUN.includes(a)) return ['ex_ch_marche_course', 'ex_ch_course'];
  return ['ex_ch_velo']; // velo, velo_appart
}

function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

/** Allure « m:ss/km » depuis distance (km) et durée (min). */
export function paceLabel(distanceKm?: number, durationMin?: number): string | null {
  if (!distanceKm || distanceKm <= 0 || !durationMin || durationMin <= 0) return null;
  return fmtPace((durationMin * 60) / distanceKm);
}

/** Vitesse km/h depuis distance (km) et durée (min). */
export function speedKmh(distanceKm?: number, durationMin?: number): number | null {
  if (!distanceKm || distanceKm <= 0 || !durationMin || durationMin <= 0) return null;
  return Math.round((distanceKm / (durationMin / 60)) * 10) / 10;
}

/** Distance-effort (km-effort) : distance + (D+ + D-)/100.
 *  Chaque 100 m de dénivelé (montée OU descente) ≈ 1 km à plat. */
export function effortKm(distanceKm?: number, dplus?: number, dminus?: number): number | null {
  if (!distanceKm || distanceKm <= 0) return null;
  return Math.round((distanceKm + ((dplus ?? 0) + (dminus ?? 0)) / 100) * 100) / 100;
}

/** Allure d'effort (ramenée à du plat) « m:ss/km ». */
export function effortPace(
  distanceKm?: number,
  durationMin?: number,
  dplus?: number,
  dminus?: number,
): string | null {
  const ek = effortKm(distanceKm, dplus, dminus);
  if (!ek || !durationMin || durationMin <= 0) return null;
  return fmtPace((durationMin * 60) / ek);
}

/** Vitesse d'effort km/h. */
export function effortSpeedKmh(
  distanceKm?: number,
  durationMin?: number,
  dplus?: number,
  dminus?: number,
): number | null {
  const ek = effortKm(distanceKm, dplus, dminus);
  if (!ek || !durationMin || durationMin <= 0) return null;
  return Math.round((ek / (durationMin / 60)) * 10) / 10;
}
