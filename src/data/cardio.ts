// cardio.ts — libellés et helpers pour le cardio (course/vélo/marche…).
import type { CardioActivity, CardioIntensity, CardioPhaseKind, CardioPhase } from '@/lib/types';

export interface ActivityDef {
  id: CardioActivity;
  label: string;
  icon: string;
  hasElevation: boolean; // D+ pertinent (extérieur)
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

export interface PhaseKindDef {
  id: CardioPhaseKind;
  label: string;
  icon: string;
  interval?: boolean;
}
export const PHASE_KINDS: PhaseKindDef[] = [
  { id: 'echauffement', label: 'Échauffement', icon: 'wb_sunny' },
  { id: 'endurance', label: 'Endurance', icon: 'directions_run' },
  { id: 'tempo', label: 'Tempo / seuil', icon: 'trending_up' },
  { id: 'effort', label: 'Effort', icon: 'bolt' },
  { id: 'intervalle', label: 'Fractionné', icon: 'repeat', interval: true },
  { id: 'recup', label: 'Récup', icon: 'pause' },
  { id: 'retour_calme', label: 'Retour au calme', icon: 'self_improvement' },
];
export const PHASE_LABELS = Object.fromEntries(PHASE_KINDS.map((p) => [p.id, p.label])) as Record<
  CardioPhaseKind,
  string
>;

export const INTENSITY_LABELS: Record<CardioIntensity, string> = {
  facile: 'Facile',
  modere: 'Modéré',
  soutenu: 'Soutenu',
  max: 'Max',
};
export const INTENSITIES: CardioIntensity[] = ['facile', 'modere', 'soutenu', 'max'];

/** Allure moyenne « min/km » depuis distance (km) et durée (min). */
export function paceLabel(distanceKm?: number, durationMin?: number): string | null {
  if (!distanceKm || distanceKm <= 0 || !durationMin || durationMin <= 0) return null;
  const secPerKm = Math.round((durationMin * 60) / distanceKm);
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

/** Totaux (durée min + distance km) d'une séance structurée. */
export function sumPhases(phases: CardioPhase[]): { duration_min: number; distance_km: number } {
  let sec = 0;
  let m = 0;
  for (const p of phases) {
    if (p.kind === 'intervalle') {
      const reps = p.reps ?? 1;
      sec += reps * ((p.work_sec ?? 0) + (p.rest_sec ?? 0));
      m += reps * ((p.work_m ?? 0) + (p.rest_m ?? 0));
    } else {
      sec += p.duration_sec ?? 0;
      m += p.distance_m ?? 0;
    }
  }
  return { duration_min: Math.round(sec / 60), distance_km: Math.round((m / 1000) * 100) / 100 };
}

/** Résumé texte court d'une phase (pour l'affichage). */
export function phaseSummary(p: CardioPhase): string {
  if (p.kind === 'intervalle') {
    const reps = p.reps ?? 1;
    const work = p.work_m ? `${p.work_m} m` : p.work_sec ? `${Math.round(p.work_sec)} s` : '?';
    const rest = p.rest_m ? `${p.rest_m} m` : p.rest_sec ? `${Math.round(p.rest_sec)} s` : null;
    return `${reps} × ${work}${rest ? ` / ${rest} récup` : ' (sans repos)'}`;
  }
  const parts: string[] = [];
  if (p.duration_sec) parts.push(`${Math.round(p.duration_sec / 60)} min`);
  if (p.distance_m) parts.push(`${Math.round((p.distance_m / 1000) * 100) / 100} km`);
  return parts.join(' · ') || '—';
}
