// cardio.ts — libellés et presets pour la course à pied / trail (côté UI).
import type { RunType } from '@/lib/types';

export const RUN_TYPE_LABELS: Record<RunType, string> = {
  footing: 'Footing',
  fractionne: 'Fractionné',
  tempo: 'Tempo / seuil',
  sortie_longue: 'Sortie longue',
  trail: 'Trail',
  recup: 'Récupération',
};

export const RUN_TYPE_ICONS: Record<RunType, string> = {
  footing: 'directions_run',
  fractionne: 'speed',
  tempo: 'trending_up',
  sortie_longue: 'timer',
  trail: 'terrain',
  recup: 'self_improvement',
};

export const RUN_TYPES: RunType[] = [
  'footing',
  'fractionne',
  'tempo',
  'sortie_longue',
  'trail',
  'recup',
];

/** Allure moyenne « min/km » depuis distance (km) et durée (min). */
export function paceLabel(distanceKm?: number, durationMin?: number): string | null {
  if (!distanceKm || distanceKm <= 0 || !durationMin || durationMin <= 0) return null;
  const secPerKm = Math.round((durationMin * 60) / distanceKm);
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')}/km`;
}
