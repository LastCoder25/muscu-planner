// volume.ts — répartition des séries par groupe musculaire (pur).
// Pour une séance planifiée (prévu) et pour un bilan (prévu vs réalisé).
import type { Session, SessionLog } from './types';

export interface MuscleSets { muscle: string; sets: number }
export interface MuscleVolume { muscle: string; planned: number; done: number }

// Couleur indicative par groupe (mêmes teintes que le picker libre).
export const MUSCLE_COLORS: Record<string, string> = {
  pectoraux: '#FF6A45', épaules: '#FFB23F', triceps: '#C6D24A', biceps: '#7BC86C',
  dos: '#46C7F0', quadriceps: '#B388FF', 'ischio-jambiers': '#8E5CF0', mollets: '#57D996', abdominaux: '#FF4D6D',
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
  return [...map.entries()].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets);
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
  return [...map.entries()].map(([muscle, v]) => ({ muscle, ...v })).sort((a, b) => b.done - a.done);
}
