// prepaBuilder.ts — générateur déterministe de séance de PRÉPA PHYSIQUE.
// Entrée : Profile + bibliothèque d'exos `prepa_physique` (tags agilite,
// pliometrie, rotation…). Sortie : une `Session` (discipline 'prepa_physique')
// qui réutilise tout le moteur muscu (runner/bilan/stats). Contrairement au
// générateur muscu, on ne raisonne PAS par volume musculaire mais par BLOCS de
// patterns (activation → puissance → agilité → gainage → force spécifique),
// dans l'ordre logique d'une séance athlétique. Pur et testable.
import type { Profile, Session, PlannedExercise, Level } from './types';
import { SCHEMA_VERSION } from './types';

export interface PrepaExerciseDef {
  id: string;
  name: string;
  muscle_primary: string | null;
  muscle_secondary?: string[] | null;
  equipment: string | null;
  equipment_required?: string[] | null;
  difficulty?: number | null;
  unit?: string | null; // 'reps' | 'time'
  unilateral?: boolean | null;
  tags?: string[] | null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// Un bloc = une famille de patterns, avec son protocole (séries/format/repos).
interface Block {
  key: string;
  tags: string[]; // l'exo appartient au bloc si un de ses tags matche
  sets: number;
  rest: number; // secondes
  // pour les exos en reps
  reps_min: number;
  reps_max: number;
  // pour les exos au temps (secondes)
  time_min: number;
  time_max: number;
}

// Ordre = déroulé de la séance. `activation` toujours en premier (échauffement),
// puis puissance (frais), agilité, gainage, et force/équilibre pour finir.
const BLOCKS: Block[] = [
  {
    key: 'activation',
    tags: ['activation', 'mobilite'],
    sets: 1,
    rest: 20,
    reps_min: 10,
    reps_max: 12,
    time_min: 30,
    time_max: 40,
  },
  {
    key: 'puissance',
    tags: ['pliometrie', 'puissance'],
    sets: 3,
    rest: 90,
    reps_min: 6,
    reps_max: 10,
    time_min: 20,
    time_max: 30,
  },
  {
    key: 'agilite',
    tags: ['agilite', 'deplacement'],
    sets: 3,
    rest: 60,
    reps_min: 6,
    reps_max: 10,
    time_min: 20,
    time_max: 30,
  },
  {
    key: 'gainage',
    tags: ['gainage', 'rotation'],
    sets: 3,
    rest: 45,
    reps_min: 12,
    reps_max: 20,
    time_min: 30,
    time_max: 45,
  },
  {
    key: 'force',
    tags: ['force', 'equilibre'],
    sets: 3,
    rest: 75,
    reps_min: 8,
    reps_max: 12,
    time_min: 30,
    time_max: 40,
  },
];

function maxDifficultyFor(level: Level): number {
  if (level === 'debutant') return 1;
  if (level === 'avance') return 3;
  return 2;
}

function toPlanned(e: PrepaExerciseDef, block: Block): PlannedExercise {
  let target: PlannedExercise['target'];
  if (e.unit === 'time') {
    target = {
      sets: block.sets,
      reps_min: block.time_min,
      reps_max: block.time_max,
      unit: 'time',
      load: 'bodyweight',
    };
  } else {
    target = {
      sets: block.sets,
      reps_min: block.reps_min,
      reps_max: block.reps_max,
      load: 'bodyweight',
    };
  }
  const ex: PlannedExercise = {
    id: e.id,
    name: e.name,
    muscle_primary: e.muscle_primary ?? undefined,
    muscle_secondary: e.muscle_secondary ?? [],
    equipment: e.equipment ?? undefined,
    progression: 'fixed', // prépa : pas de progression de charge automatique
    rest_seconds: block.rest,
    target,
  };
  if (e.unilateral) ex.unilateral = true;
  return ex;
}

function estimateExerciseMin(ex: PlannedExercise): number {
  const workSec = 40; // durée moyenne d'une série de prépa
  const perSide = ex.unilateral ? 2 : 1;
  return (ex.target.sets * ((ex.rest_seconds + workSec) * perSide)) / 60;
}

export interface PrepaOptions {
  duration_min?: number; // cible (défaut 30)
  level?: Level; // sinon profile.experience.level
  tag?: string; // filtre thématique déjà appliqué au fetch (ex. 'tennis') — informatif
  name?: string;
}

/**
 * Construit UNE séance de prépa physique équilibrée par blocs de patterns.
 * @returns une `Session` prête à insérer (source 'engine', discipline 'prepa_physique').
 */
export function buildPrepaSession(
  profile: Profile,
  library: PrepaExerciseDef[],
  opts: PrepaOptions = {},
): Session | null {
  if (library.length === 0) return null;

  const level = opts.level ?? profile.experience.level;
  const duration = clamp(opts.duration_min ?? 30, 15, 75);
  const available = new Set<string>(profile.available_equipment ?? []);
  const avoidIds = new Set(profile.constraints?.avoid_exercises ?? []);
  const favorites = new Set(profile.favorite_exercises ?? []);
  const disliked = new Set(profile.disliked_exercises ?? []);
  const maxDiff = maxDifficultyFor(level);

  // Éligibilité : matériel possédé (poids du corps = ensemble vide → toujours ok)
  // et non explicitement évité.
  const eligible = library.filter(
    (e) => !avoidIds.has(e.id) && (e.equipment_required ?? []).every((r) => available.has(r)),
  );

  const rank = (e: PrepaExerciseDef) => (favorites.has(e.id) ? 0 : disliked.has(e.id) ? 2 : 1);

  // Pools par bloc, triés favoris d'abord / aimés-moins en dernier, avec repli de
  // difficulté si le niveau ne laisse rien.
  function poolFor(block: Block): PrepaExerciseDef[] {
    const inBlock = eligible.filter((e) => (e.tags ?? []).some((t) => block.tags.includes(t)));
    const byLevel = inBlock.filter((e) => (e.difficulty ?? 1) <= maxDiff);
    const pool = byLevel.length ? byLevel : inBlock;
    return [...pool].sort((a, b) => rank(a) - rank(b));
  }

  const pools = new Map(BLOCKS.map((b) => [b.key, poolFor(b)]));
  const used = new Set<string>();

  // Nombre d'exos visé selon la durée (~5 min/exo), borné.
  const targetCount = clamp(Math.round(duration / 5), 4, 9);

  const chosen: PlannedExercise[] = [];

  // 1) Toujours une activation en ouverture si dispo.
  const actPool = pools.get('activation') ?? [];
  if (actPool[0]) {
    used.add(actPool[0].id);
    chosen.push(toPlanned(actPool[0], BLOCKS[0]!));
  }

  // 2) Round-robin sur les blocs de travail jusqu'à la cible (max 2 exos/bloc).
  const workBlocks = BLOCKS.filter((b) => b.key !== 'activation');
  const perBlockCount = new Map(workBlocks.map((b) => [b.key, 0]));
  let progressed = true;
  while (chosen.length < targetCount && progressed) {
    progressed = false;
    for (const block of workBlocks) {
      if (chosen.length >= targetCount) break;
      if ((perBlockCount.get(block.key) ?? 0) >= 2) continue;
      const pool = pools.get(block.key) ?? [];
      const next = pool.find((e) => !used.has(e.id));
      if (!next) continue;
      used.add(next.id);
      perBlockCount.set(block.key, (perBlockCount.get(block.key) ?? 0) + 1);
      chosen.push(toPlanned(next, block));
      progressed = true;
    }
  }

  if (chosen.length === 0) return null;

  const estDuration = Math.round(chosen.reduce((a, e) => a + estimateExerciseMin(e), 0));

  return {
    schema_version: SCHEMA_VERSION,
    type: 'session',
    id: crypto.randomUUID(),
    name: opts.name ?? 'Prépa physique tennis',
    objective: profile.objective,
    level,
    discipline: 'prepa_physique',
    estimated_duration_min: estDuration,
    source: 'engine',
    created_at: new Date().toISOString(),
    exercises: chosen,
  };
}
