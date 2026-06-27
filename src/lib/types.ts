// types.ts — alignés sur le contrat JSON v1.0
export const SCHEMA_VERSION = '1.0';

export type Level = 'debutant' | 'intermediaire' | 'avance';
export type Objective = 'force' | 'hypertrophie' | 'endurance' | 'remise_en_forme' | 'perte_de_gras';
export type Equipment = 'salle_complete' | 'home_gym' | 'halteres' | 'poids_du_corps';
export type Progression = 'double' | 'linear' | 'rir' | 'fixed';
export type Difficulty = 1 | 2 | 3 | 4;

// Matériel détaillé (atomes). Un exercice requiert un ENSEMBLE de ces atomes
// (cf. exercises.equipment_required) ; le poids du corps = ensemble vide.
export type EquipmentItem =
  | 'barbell' | 'rack' | 'bench'
  | 'dumbbells' | 'kettlebell' | 'bands'
  | 'cable' | 'machine'
  | 'pullup_bar' | 'dip_station';

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
  availability: { sessions_per_week: number; session_duration_min?: number; preferred_days?: string[] };
  equipment: Equipment;               // résumé grossier (dérivé de available_equipment)
  available_equipment?: EquipmentItem[]; // matériel détaillé réellement dispo
  sports?: SportPractice[];           // pratiques sportives en parallèle
  favorite_exercises?: string[];      // ids d'exos à prioriser si pertinents
  disliked_exercises?: string[];      // ids d'exos « aimés moins » : évités si une alternative existe (pas exclus)
  constraints?: { injuries?: string[]; avoid_exercises?: string[] };
  preferences?: { priority_muscles?: string[]; units?: 'kg' | 'lb'; tracking_frequency?: 'day' | 'week' | 'month' };
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
  reps_min: number;        // si unit='time', exprimé en SECONDES
  reps_max: number;        // idem
  unit?: 'reps' | 'time';  // défaut 'reps' ; 'time' = gainage & co (secondes)
  load_kg?: number;        // charge classique
  load?: 'bodyweight';     // poids du corps
  added_kg?: number;       // lest éventuel
  rir_target?: number;
}

// Série prescrite (charge/reps fixées par série) — ex. pyramide importée.
export interface PrescribedSet {
  reps: number;
  load_kg?: number;
}

export interface PlannedExercise {
  id: string;              // slug stable
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
}

export interface Session {
  schema_version: string;
  type: 'session';
  id: string;
  name: string;
  split?: string;
  objective?: Objective;
  level?: Level;
  estimated_duration_min?: number;
  source?: 'app' | 'user' | 'template' | 'ai' | 'engine';
  created_at?: string;
  exercises: PlannedExercise[];
}

export interface PerformedSet {
  set: number;
  load_kg: number;
  reps: number;
  difficulty: Difficulty;  // la note 1–4
  rir?: number;            // optionnel, niveau avancé
  comment?: string;
}

export interface LoggedExercise {
  id: string;
  name: string;
  swapped_from?: string | null;
  planned: Partial<ExerciseTarget>;
  performed: PerformedSet[];
  exercise_comment?: string;
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
  readiness?: number;        // forme du jour 1–5 (5 = top) — check pré-séance
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
