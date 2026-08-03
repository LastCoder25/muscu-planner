// types.ts — alignés sur le contrat JSON v1.0
export const SCHEMA_VERSION = '1.0';

export type Level = 'debutant' | 'intermediaire' | 'avance';
export type Objective =
  | 'force'
  | 'hypertrophie'
  | 'endurance'
  | 'remise_en_forme'
  | 'perte_de_gras';
export type Equipment = 'salle_complete' | 'home_gym' | 'halteres' | 'poids_du_corps';
export type Progression = 'double' | 'linear' | 'rir' | 'fixed';
export type Difficulty = 1 | 2 | 3 | 4;

// Matériel détaillé (atomes). Un exercice requiert un ENSEMBLE de ces atomes
// (cf. exercises.equipment_required) ; le poids du corps = ensemble vide.
export type EquipmentItem =
  | 'barbell'
  | 'rack'
  | 'bench'
  | 'dumbbells'
  | 'kettlebell'
  | 'bands'
  | 'cable'
  | 'machine'
  | 'pullup_bar'
  | 'dip_station';

// Sport pratiqué en parallèle (sert à l'équilibrage du volume musculaire).
export interface SportPractice {
  name: string;
  sessions_per_week: number;
  intensity?: 'faible' | 'moderee' | 'elevee';
}

export interface Profile {
  schema_version: string;
  type: 'profile';
  identity: {
    name: string;
    sex?: 'homme' | 'femme' | 'autre';
    birth_year?: number;
    height_cm?: number;
    weight_kg?: number;
  };
  experience: { level: Level; training_months?: number; known_1rm_kg?: Record<string, number> };
  objective: Objective;
  availability: {
    sessions_per_week: number;
    session_duration_min?: number;
    preferred_days?: string[];
  };
  equipment: Equipment; // résumé grossier (dérivé de available_equipment)
  available_equipment?: EquipmentItem[]; // matériel détaillé réellement dispo
  sports?: SportPractice[]; // pratiques sportives en parallèle
  favorite_exercises?: string[]; // ids d'exos à prioriser si pertinents
  disliked_exercises?: string[]; // ids d'exos « aimés moins » : évités si une alternative existe (pas exclus)
  constraints?: { injuries?: string[]; avoid_exercises?: string[] };
  preferences?: {
    priority_muscles?: string[];
    units?: 'kg' | 'lb';
    tracking_frequency?: 'day' | 'week' | 'month';
    tracking_day?: number; // semaine : 0=dim..6=sam ; mois : 1..28
    tracking_time?: string; // « HH:MM » pour le rappel
    court_equipment?: string[]; // matériel de tennis possédé (panier, machine, mur…)
    vma?: number; // Vitesse Maximale Aérobie (km/h) — base des allures cardio
    hills?: { length_m: number; grade_pct?: number; elevation_m?: number }[]; // côtes dispo (trail)
  };
}

export interface LevelConfig {
  schema_version: string;
  type: 'level_config';
  derived_from: Level;
  default_progression: Progression;
  effort_signal: 'simple' | 'rir_optional' | 'rir';
  coach_history_depth: number;
  program_mode: 'guided' | 'assisted' | 'free';
  ui_density: 'comfortable' | 'standard' | 'dense';
  auto_deload: boolean;
  overridable: boolean;
}

export interface ExerciseTarget {
  sets: number;
  reps_min: number; // si unit='time', exprimé en SECONDES
  reps_max: number; // idem
  unit?: 'reps' | 'time'; // défaut 'reps' ; 'time' = gainage & co (secondes)
  load_kg?: number; // charge classique
  load?: 'bodyweight'; // poids du corps
  added_kg?: number; // lest éventuel
  rir_target?: number;
}

// Série prescrite (charge/reps fixées par série) — ex. pyramide importée.
/* Challenges : voir src/lib/challenges.ts (tables challenges/achievements, migr. 0012/0013). */

export interface PrescribedSet {
  reps: number;
  load_kg?: number;
  rest_seconds?: number; // repos propre à cette série (pyramide importée : repos croissant)
}

export interface PlannedExercise {
  id: string; // slug stable
  name: string;
  muscle_primary?: string;
  muscle_secondary?: string[];
  equipment?: string;
  progression: Progression;
  rest_seconds: number;
  target: ExerciseTarget;
  prescription?: PrescribedSet[]; // séries détaillées (sinon dérivées de target)
  alternatives?: string[];
  notes?: string;
  unilateral?: boolean; // travaillé un côté à la fois → « / côté », durée ×2
}

export interface Session {
  schema_version: string;
  type: 'session';
  id: string;
  name: string;
  split?: string;
  objective?: Objective;
  level?: Level;
  // Nature de la séance : musculation (défaut) ou prépa physique. La prépa
  // réutilise tout le moteur muscu (runner/bilan/stats) mais est listée à part.
  discipline?: 'musculation' | 'prepa_physique';
  estimated_duration_min?: number;
  source?: 'app' | 'user' | 'template' | 'ai' | 'engine';
  created_at?: string;
  exercises: PlannedExercise[];
}

export interface PerformedSet {
  set: number;
  load_kg: number;
  reps: number;
  difficulty: Difficulty; // la note 1–4
  rir?: number; // optionnel, niveau avancé
  comment?: string;
}

export interface LoggedExercise {
  id: string;
  name: string;
  swapped_from?: string | null;
  muscle_primary?: string;
  planned: Partial<ExerciseTarget>;
  performed: PerformedSet[];
  exercise_comment?: string;
  unilateral?: boolean;
}

export interface SessionLog {
  schema_version: string;
  type: 'session_log';
  id: string;
  session_id?: string;
  name?: string;
  started_at?: string;
  ended_at?: string;
  duration_min?: number;
  global_difficulty?: Difficulty;
  global_comment?: string;
  readiness?: number; // forme du jour 1–5 (5 = top) — check pré-séance
  exercises: LoggedExercise[];
}

export interface CoachRequest {
  schema_version: string;
  type: 'coach_request';
  profile: Profile;
  history: SessionLog[];
  last_session?: Session;
  instruction: string;
}

// ————————————————————————————————————————————————————————————————
// Drills sportifs sur le court (tennis) — extension additive du contrat (v1.1).
// Domaine distinct de la musculation : on raisonne par coup/figure/partenaire et
// non par muscle/charge. D'où des types dédiés (jamais réutiliser PlannedExercise).
// ————————————————————————————————————————————————————————————————

export type DrillCategory =
  | 'echauffement'
  | 'fond_de_court'
  | 'service_retour'
  | 'volee'
  | 'deplacement'
  | 'jeu'
  | 'retour_au_calme';

export type DrillShot = 'coup_droit' | 'revers' | 'service' | 'volee' | 'smash' | 'mixte';
export type DrillPlayers = 'solo' | 'duo' | 'groupe';
export type DrillFormatMode = 'reps' | 'time' | 'balls'; // time = secondes

export interface DrillFormat {
  mode: DrillFormatMode;
  value: number; // reps, secondes (time), ou nombre de balles
  sets: number;
}

// Entrée du catalogue global de drills (table `drills`).
export interface Drill {
  id: string;
  sport: string; // 'tennis' pour l'instant
  name: string;
  category: DrillCategory;
  shot?: DrillShot | null;
  pattern?: string | null; // diagonale, longue_ligne, croise, decroise, montee_volee…
  partner_required: boolean;
  players: DrillPlayers;
  equipment?: string[]; // raquette, balles, panier, cible, plots, mur, filet
  intensity?: 'faible' | 'moderee' | 'elevee';
  focus?: string[]; // technique, tactique, physique, regularite, puissance
  level?: number; // 1/2/3
  default_format: DrillFormat;
  description?: string;
  instructions?: string[];
  tips?: string;
}

// Drill prescrit dans une séance de court.
export interface PlannedDrill {
  id: string;
  name: string;
  category: DrillCategory;
  shot?: DrillShot | null;
  pattern?: string | null;
  partner_required: boolean;
  format: DrillFormat;
  rest_seconds: number;
  description?: string; // descriptif du drill (repris du catalogue)
  notes?: string; // conseil d'exécution (tips)
}

export interface DrillSession {
  schema_version: string;
  type: 'drill_session';
  id: string;
  name: string;
  sport: string;
  theme?: string; // coup_droit, revers, service, volee, jeu, physique, complet
  with_partner: boolean;
  level?: Level;
  estimated_duration_min?: number;
  source?: 'app' | 'user' | 'ai' | 'engine';
  created_at?: string;
  drills: PlannedDrill[];
}

export interface LoggedDrill {
  id: string;
  name: string;
  done: boolean;
  sets_done?: number;
  elapsed_sec?: number;
  difficulty?: Difficulty; // note de ressenti 1–4
  comment?: string;
}

export interface DrillLog {
  schema_version: string;
  type: 'drill_log';
  id: string;
  drill_session_id?: string;
  name?: string;
  sport: string;
  with_partner: boolean;
  started_at?: string;
  ended_at?: string;
  duration_min?: number;
  global_difficulty?: Difficulty;
  global_comment?: string;
  drills: LoggedDrill[];
}

// ————————————————————————————————————————————————————————————————
// Cardio — course/marche/vélo… (extension additive, v1.2).
// Log global d'une sortie : durée / distance / D+ / D- / ressenti.
// ————————————————————————————————————————————————————————————————

export type CardioActivity =
  | 'marche'
  | 'rando'
  | 'course'
  | 'trail'
  | 'velo'
  | 'velo_appart'
  | 'marche_tapis'
  | 'course_tapis';

// Bilan d'une sortie (saisie manuelle, log global).
export interface CardioLog {
  schema_version: string;
  type: 'cardio_log';
  id: string;
  activity: CardioActivity;
  distance_km?: number;
  duration_min?: number;
  elevation_m?: number; // D+ (dénivelé positif)
  descent_m?: number; // D- (dénivelé négatif)
  rpe?: Difficulty; // ressenti 1–4
  performed_at?: string;
  comment?: string;
}
