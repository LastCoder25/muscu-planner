// cardio.ts — libellés et calculs pour le cardio (log global).
import type { CardioActivity } from '@/lib/types';

export interface ActivityDef {
  id: CardioActivity;
  label: string;
  icon: string;
  /** ⚠️ L'emoji vit ICI, avec le libellé et l'icône : l'overlay d'XP en a besoin (il
   *  rend du texte SVG, pas une icône Quasar) et une table séparée aurait divergé au
   *  premier ajout d'activité. */
  emoji: string;
  hasElevation: boolean; // D+/D- pertinents (extérieur)
}

export const CARDIO_ACTIVITIES: ActivityDef[] = [
  { id: 'marche', label: 'Marche', icon: 'directions_walk', emoji: '🚶', hasElevation: true },
  { id: 'rando', label: 'Rando', icon: 'hiking', emoji: '🥾', hasElevation: true },
  { id: 'course', label: 'Course', icon: 'directions_run', emoji: '🏃', hasElevation: true },
  { id: 'trail', label: 'Trail', icon: 'terrain', emoji: '⛰️', hasElevation: true },
  { id: 'velo', label: 'Vélo', icon: 'directions_bike', emoji: '🚴', hasElevation: true },
  {
    id: 'velo_appart',
    label: "Vélo d'appart",
    icon: 'pedal_bike',
    emoji: '🚲',
    hasElevation: false,
  },
  {
    id: 'marche_tapis',
    label: 'Marche tapis',
    icon: 'directions_walk',
    emoji: '🚶',
    hasElevation: false,
  },
  {
    id: 'course_tapis',
    label: 'Course tapis',
    icon: 'directions_run',
    emoji: '🏃',
    hasElevation: false,
  },
];

export const ACTIVITY_LABELS = Object.fromEntries(
  CARDIO_ACTIVITIES.map((a) => [a.id, a.label]),
) as Record<CardioActivity, string>;
export const ACTIVITY_ICONS = Object.fromEntries(
  CARDIO_ACTIVITIES.map((a) => [a.id, a.icon]),
) as Record<CardioActivity, string>;
export const ACTIVITY_EMOJI = Object.fromEntries(
  CARDIO_ACTIVITIES.map((a) => [a.id, a.emoji]),
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

// Exercices « défi » qui sont du cardio (⇄ discipline Cardio, miroir de sortie).
const CARDIO_CHALLENGE_IDS = new Set([
  'ex_ch_marche',
  'ex_ch_course',
  'ex_ch_marche_course',
  'ex_ch_velo',
]);
export function isCardioChallengeExercise(id: string): boolean {
  return CARDIO_CHALLENGE_IDS.has(id);
}
/** Vraie SORTIE cardio (marche/course/vélo, par distance ou id) : a une activité
 *  dédiée + un miroir de sortie. ≠ conditionnement (cardio-track mais SANS sortie)
 *  → sert à réserver la tuile d'activité / l'exclusion agenda aux seules sorties. */
export function isCardioOutingChallenge(c: { unit: string; exercise_id: string }): boolean {
  return c.unit === 'distance' || CARDIO_CHALLENGE_IDS.has(c.exercise_id);
}
// Exos de CONDITIONNEMENT (métaboliques) : comptent comme CARDIO pour l'XP/le
// niveau (→ Agilité côté RPG), MAIS ce ne sont PAS des « sorties cardio »
// (pas de miroir ni de report auto : on ne les déduit pas d'une marche/vélo).
export const CONDITIONING_CHALLENGE_IDS = new Set([
  'ex_jump_rope',
  'ex_jumping_jacks',
  'ex_high_knees',
  'ex_mountain_climbers',
  'ex_squat_jump',
  'ex_burpees',
]);
/** L'XP de ce défi va-t-elle à la piste CARDIO ? (vrai cardio OU conditionnement) */
export function isCardioTrackChallenge(c: { unit: string; exercise_id: string }): boolean {
  return (
    c.unit === 'distance' ||
    CARDIO_CHALLENGE_IDS.has(c.exercise_id) ||
    CONDITIONING_CHALLENGE_IDS.has(c.exercise_id)
  );
}
// Activité par défaut d'une sortie « miroir » créée depuis un défi cardio.
/** ALLURE DE RÉFÉRENCE (km/h) — sert à convertir une DISTANCE en effort.
 *
 *  ⚠️ Elle est nécessaire parce que l’XP d’une sortie est DOMINÉE PAR LA DURÉE
 *  (min×3 > km×2, choix pro-endurance) : un kilomètre ne « vaut » donc quelque chose
 *  qu’une fois qu’on sait en combien de temps il est parcouru. Un défi en km, lui, ne
 *  connaît que la distance — il faut bien poser une allure.
 *
 *  ⚠️ Ces vitesses ne servent QU’À CETTE CONVERSION : elles ne modifient aucune sortie
 *  réelle, qui porte sa propre durée. Elles sont volontairement MODESTES (allure de
 *  loisir) : surestimer la vitesse sous-paierait les défis en distance.
 */
export const REF_SPEED_KMH: Record<CardioActivity, number> = {
  marche: 5,
  rando: 4,
  course: 10,
  trail: 8,
  velo: 20,
  velo_appart: 20,
  marche_tapis: 5,
  course_tapis: 10,
};

export function defaultActivityForChallenge(exerciseId: string): CardioActivity {
  if (exerciseId === 'ex_ch_velo') return 'velo';
  if (exerciseId === 'ex_ch_course') return 'course';
  return 'marche'; // marche + « marche ou course »
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
