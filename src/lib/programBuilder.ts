// programBuilder.ts — générateur déterministe de programme (le « sans IA »).
// Entrée : Profile (objectif, niveau, matériel détaillé, sports, priorités,
// contraintes) + bibliothèque d'exercices. Sortie : N sessions (mêmes types
// qu'une séance IA). Logique : volume cible par muscle → ajusté par les sports
// (équilibrage) et les priorités → exos filtrés par matériel → répartis en
// séances. Pur et testable, aucune dépendance Supabase/Vue.
import type {
  Profile, Session, PlannedExercise, Objective, Level,
} from './types';
import { SCHEMA_VERSION } from './types';
import { defaultSplit, type SplitOption, type MuscleKey } from '@/data/splits';

export interface ExerciseDef {
  id: string;
  name: string;
  muscle_primary: string | null;
  muscle_secondary?: string[] | null;
  equipment: string | null;
  equipment_required?: string[] | null; // atomes requis (tous nécessaires)
  difficulty?: number | null;           // 1=débutant, 2=intermédiaire, 3=avancé
  unit?: string | null;                 // 'reps' (défaut) ou 'time' (secondes)
}

// Groupes musculaires primaires présents dans la bibliothèque.
const MUSCLES = [
  'pectoraux', 'dos', 'épaules', 'biceps', 'triceps',
  'quadriceps', 'ischio-jambiers', 'mollets', 'abdominaux',
] as const;
type Muscle = (typeof MUSCLES)[number];

// Pondération par taille de muscle (gros groupes = plus de volume).
const MUSCLE_WEIGHT: Record<Muscle, number> = {
  pectoraux: 1, dos: 1, quadriceps: 1, 'ischio-jambiers': 0.8,
  épaules: 0.7, biceps: 0.6, triceps: 0.6, mollets: 0.5, abdominaux: 0.6,
};

const OBJECTIVE_CFG: Record<Objective, { reps_min: number; reps_max: number; rest: number; volume: number }> = {
  force: { reps_min: 4, reps_max: 6, rest: 180, volume: 0.85 },
  hypertrophie: { reps_min: 8, reps_max: 12, rest: 90, volume: 1 },
  endurance: { reps_min: 15, reps_max: 20, rest: 45, volume: 0.9 },
  remise_en_forme: { reps_min: 10, reps_max: 15, rest: 75, volume: 0.7 },
  perte_de_gras: { reps_min: 12, reps_max: 15, rest: 60, volume: 0.9 },
};

const LEVEL_FACTOR: Record<Level, number> = { debutant: 0.7, intermediaire: 1, avance: 1.2 };

const BASE_SETS = 14; // séries hebdo de référence pour un gros muscle prioritaire

// Sollicitation musculaire par sport (0–1). Sert à réduire le volume muscu
// des muscles déjà travaillés (équilibrage).
const SPORT_MUSCLES: Record<string, Partial<Record<Muscle, number>>> = {
  course: { quadriceps: 0.6, 'ischio-jambiers': 0.5, mollets: 0.8, abdominaux: 0.3 },
  cyclisme: { quadriceps: 0.8, 'ischio-jambiers': 0.4, mollets: 0.4 },
  vélo: { quadriceps: 0.8, 'ischio-jambiers': 0.4, mollets: 0.4 },
  natation: { dos: 0.6, épaules: 0.7, pectoraux: 0.5, triceps: 0.4, abdominaux: 0.4 },
  escalade: { dos: 0.7, biceps: 0.7, abdominaux: 0.5, épaules: 0.4 },
  football: { quadriceps: 0.6, 'ischio-jambiers': 0.6, mollets: 0.6, abdominaux: 0.3 },
  basket: { quadriceps: 0.6, mollets: 0.6, abdominaux: 0.3 },
  tennis: { épaules: 0.5, dos: 0.4, abdominaux: 0.4, quadriceps: 0.4 },
  boxe: { épaules: 0.6, dos: 0.4, abdominaux: 0.6, pectoraux: 0.3 },
  rugby: { quadriceps: 0.6, dos: 0.5, épaules: 0.4, abdominaux: 0.4 },
  yoga: { abdominaux: 0.4, épaules: 0.3 },
};

// Boost de prévention : muscles à renforcer pour contrer un sport dominant.
const SPORT_PREVENTION: Record<string, Partial<Record<Muscle, number>>> = {
  course: { abdominaux: 2, dos: 2 },
  cyclisme: { abdominaux: 2, dos: 2, 'ischio-jambiers': 2 },
  vélo: { abdominaux: 2, dos: 2, 'ischio-jambiers': 2 },
  natation: { dos: 1 },
  escalade: { triceps: 2, pectoraux: 1 }, // antagonistes du tirage
  football: { abdominaux: 2, dos: 1 },
};

const INTENSITY_FACTOR: Record<NonNullable<SportIntensity>, number> = {
  faible: 0.6, moderee: 1, elevee: 1.3,
};
type SportIntensity = 'faible' | 'moderee' | 'elevee';

// Mappe les libellés UI de priorité (« Bras », « Jambes »…) vers les muscles.
const PRIORITY_LABEL_TO_MUSCLES: Record<string, Muscle[]> = {
  pectoraux: ['pectoraux'],
  dos: ['dos'],
  épaules: ['épaules'],
  epaules: ['épaules'],
  bras: ['biceps', 'triceps'],
  jambes: ['quadriceps', 'ischio-jambiers', 'mollets'],
  fessiers: ['ischio-jambiers', 'quadriceps'],
  abdos: ['abdominaux'],
  abdominaux: ['abdominaux'],
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Volume cible (séries hebdo) par muscle, après objectif/niveau/sports/priorités. */
export function computeMuscleTargets(profile: Profile): Record<Muscle, number> {
  const obj = OBJECTIVE_CFG[profile.objective];
  const lvl = LEVEL_FACTOR[profile.experience.level];

  const target = {} as Record<Muscle, number>;
  for (const m of MUSCLES) {
    target[m] = BASE_SETS * obj.volume * lvl * MUSCLE_WEIGHT[m];
  }

  // 1) Réduction selon les sports pratiqués.
  for (const sport of profile.sports ?? []) {
    const key = sport.name.trim().toLowerCase();
    const used = SPORT_MUSCLES[key];
    if (!used) continue;
    const freq = clamp(sport.sessions_per_week / 3, 0, 1.3);
    const inten = INTENSITY_FACTOR[sport.intensity ?? 'moderee'];
    for (const m of MUSCLES) {
      const w = used[m];
      if (w) target[m] -= BASE_SETS * w * freq * inten * 0.5;
    }
    // 2) Boost de prévention.
    const prev = SPORT_PREVENTION[key];
    if (prev) {
      for (const m of MUSCLES) {
        const boost = prev[m];
        if (boost) target[m] += boost;
      }
    }
  }

  // 3) Priorités utilisateur (+35 %).
  for (const label of profile.preferences?.priority_muscles ?? []) {
    const muscles = PRIORITY_LABEL_TO_MUSCLES[label.trim().toLowerCase()];
    if (muscles) for (const m of muscles) target[m] *= 1.35;
  }

  // 4) Plancher de maintien : on ne descend jamais sous un minimum.
  for (const m of MUSCLES) {
    const floor = MUSCLE_WEIGHT[m] >= 1 ? 4 : 2;
    target[m] = clamp(Math.round(target[m]), 0, 30);
    if (target[m] > 0 && target[m] < floor) target[m] = floor;
  }

  return target;
}

function repsAndRest(objective: Objective) {
  const o = OBJECTIVE_CFG[objective];
  return { reps_min: o.reps_min, reps_max: o.reps_max, rest: o.rest };
}

/** Sélectionne les exos d'un muscle, filtrés par matériel, polyarticulaires d'abord. */
// Clé de mouvement : regroupe les variantes d'un même exercice (toutes les sortes
// de « squat », de « curl », de « développé »…) pour éviter les quasi-doublons.
const MOVEMENT_KEYWORDS = [
  'squat', 'fente', 'presse', 'souleve', 'pont', 'swing', 'mollet',
  'developpe', 'pompe', 'dips', 'ecarte', 'butterfly', 'pec deck',
  'curl', 'pushdown', 'barre au front', 'extension', 'elevation', 'face pull',
  'rowing', 'tirage', 'traction', 'superman', 'gainage', 'releve', 'crunch', 'pull apart',
];
function movementKey(name: string): string {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return MOVEMENT_KEYWORDS.find((k) => n.includes(k)) ?? n;
}

function pickForMuscle(
  muscle: Muscle,
  targetSets: number,
  library: ExerciseDef[],
  available: Set<string>,
  avoidIds: Set<string>,
  setsPerExercise: number,
  objective: Objective,
  maxDifficulty: number,
  favorites: Set<string>,
  disliked: Set<string>,
): PlannedExercise[] {
  const base = library.filter(
    (e) =>
      e.muscle_primary === muscle &&
      !avoidIds.has(e.id) &&
      (e.equipment_required ?? []).every((req) => available.has(req)),
  );
  // Respecte le niveau (ex. pas de tractions strictes pour un débutant) ;
  // si rien d'assez accessible, on relâche — mieux qu'aucun exo.
  const byLevel = base.filter((e) => (e.difficulty ?? 1) <= maxDifficulty);
  const pool = byLevel.length ? byLevel : base;

  // Favoris d'abord, « aimés moins » en dernier (utilisés seulement faute
  // d'alternative), puis polyarticulaires (plus de muscles secondaires).
  const rank = (e: ExerciseDef) => (favorites.has(e.id) ? 0 : disliked.has(e.id) ? 2 : 1);
  const candidates = [...pool].sort(
    (a, b) => rank(a) - rank(b) || (b.muscle_secondary?.length ?? 0) - (a.muscle_secondary?.length ?? 0),
  );

  if (candidates.length === 0 || targetSets <= 0) return [];

  const nExercises = clamp(Math.round(targetSets / setsPerExercise), 1, 2);

  // Évite deux variantes du MÊME mouvement pour un muscle (ex. squat kettlebell +
  // squat poids du corps, ou curl barre + curl haltères) : on garde des mouvements
  // distincts. À défaut (un seul mouvement dispo), on se rabat dessus.
  const selected: ExerciseDef[] = [];
  const usedKeys = new Set<string>();
  for (const e of candidates) {
    if (selected.length >= nExercises) break;
    const k = movementKey(e.name);
    if (usedKeys.has(k)) continue;
    usedKeys.add(k);
    selected.push(e);
  }
  if (selected.length === 0) selected.push(candidates[0]!);

  const { reps_min, reps_max, rest } = repsAndRest(objective);

  const chosen: PlannedExercise[] = [];
  let remaining = targetSets;
  for (let i = 0; i < selected.length; i++) {
    const e = selected[i]!;
    // Répartit les séries cibles sur les exos retenus (min 2, plafond setsPerExercise).
    const left = selected.length - i;
    const sets = clamp(Math.round(remaining / left), 2, setsPerExercise);
    remaining -= sets;
    const bodyweight = e.equipment === 'poids_du_corps';
    // Exercices au temps (gainage…) : cible en secondes, pas en reps.
    let target: PlannedExercise['target'];
    if (e.unit === 'time') {
      target = { sets, reps_min: 30, reps_max: 60, unit: 'time', load: 'bodyweight' };
    } else if (bodyweight) {
      target = { sets, reps_min, reps_max, load: 'bodyweight' };
    } else {
      target = { sets, reps_min, reps_max, load_kg: 0 };
    }
    const ex: PlannedExercise = {
      id: e.id,
      name: e.name,
      muscle_primary: e.muscle_primary ?? muscle,
      muscle_secondary: e.muscle_secondary ?? [],
      equipment: e.equipment ?? undefined,
      progression: e.unit === 'time' ? 'fixed' : 'linear',
      rest_seconds: rest,
      target,
    };
    chosen.push(ex);
  }
  return chosen;
}

/**
 * Construit un programme complet : N séances full-body équilibrées.
 * @returns une à quatre `Session` prêtes à insérer (source 'engine').
 */
export function buildProgram(profile: Profile, library: ExerciseDef[], split?: SplitOption): Session[] {
  if (library.length === 0) return [];

  // Atomes de matériel possédés. Le poids du corps est toujours dispo :
  // les exos sans matériel ont equipment_required = [] et passent toujours.
  const available = new Set<string>(profile.available_equipment ?? []);

  const avoidIds = new Set(profile.constraints?.avoid_exercises ?? []);
  const favorites = new Set(profile.favorite_exercises ?? []);
  const disliked = new Set(profile.disliked_exercises ?? []);
  const targets = computeMuscleTargets(profile);
  const setsPerExercise = profile.experience.level === 'debutant' ? 3 : 4;
  // Débutant : on plafonne la difficulté à 2 (assisté/accessible) ; sinon tout.
  const maxDifficulty = profile.experience.level === 'debutant' ? 2 : 3;

  // 1) Sélection des exercices par muscle.
  const allExercises: PlannedExercise[] = [];
  for (const m of MUSCLES) {
    allExercises.push(
      ...pickForMuscle(m, targets[m], library, available, avoidIds, setsPerExercise, profile.objective, maxDifficulty, favorites, disliked),
    );
  }
  if (allExercises.length === 0) return [];

  // 2) Répartition selon la découpe (split) choisie : chaque exo va dans le(s) jour(s)
  //    qui ciblent son muscle ; round-robin entre les jours équivalents (ex. full-body,
  //    ou « Haut » ×2). Sans jour correspondant → jour le moins rempli (filet de sécurité).
  const nSessions = clamp(profile.availability.sessions_per_week, 2, 6);
  const chosen = split ?? defaultSplit(nSessions, profile.experience.level);
  const days = chosen.days;
  const buckets: PlannedExercise[][] = days.map(() => []);
  const rr = new Map<string, number>();
  for (const ex of allExercises) {
    const m = (ex.muscle_primary ?? '') as MuscleKey;
    const matching = days.map((d, i) => ({ i, d })).filter(({ d }) => d.muscles.includes(m));
    let idx: number;
    if (matching.length > 0) {
      const c = rr.get(m) ?? 0;
      rr.set(m, c + 1);
      idx = matching[c % matching.length]!.i;
    } else {
      idx = buckets.reduce((min, b, i) => (b.length < buckets[min]!.length ? i : min), 0);
    }
    buckets[idx]!.push(ex);
  }

  return buckets
    .map((exercises, i) => ({ exercises, name: days[i]!.name }))
    .filter((b) => b.exercises.length > 0)
    .map(({ exercises, name }) => {
      const estDuration = exercises.reduce(
        (a, e) => a + e.target.sets * ((e.rest_seconds + 40) / 60),
        0,
      );
      const session: Session = {
        schema_version: SCHEMA_VERSION,
        type: 'session',
        id: crypto.randomUUID(),
        name,
        split: chosen.id,
        objective: profile.objective,
        level: profile.experience.level,
        estimated_duration_min: Math.round(estDuration),
        source: 'engine',
        created_at: new Date().toISOString(),
        exercises,
      };
      return session;
    });
}
