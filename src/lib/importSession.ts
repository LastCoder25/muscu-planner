// importSession.ts — import tolérant d'une séance générée par une IA (ChatGPT…).
// 1) tente le schéma strict (coach.validateImportedSession) ; 2) sinon, normalise
// un JSON « lâche » (clés/format variables) vers une Session. Pur, sans dépendance Vue/Supabase.
import type { Session, PlannedExercise, ExerciseTarget } from './types';
import { SCHEMA_VERSION } from './types';
import { validateImportedSession } from './coach';

export interface LibEntry {
  id: string;
  name: string;
  muscle_primary?: string | null;
  muscle_secondary?: string[] | null;
  equipment?: string | null;
}

type Raw = Record<string, unknown>;

function asRecord(v: unknown): Raw {
  return v !== null && typeof v === 'object' ? (v as Raw) : {};
}
function firstString(o: Raw, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}
function firstNumber(o: Raw, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}
function firstArray(o: Raw, keys: string[]): unknown[] {
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

// Isole un objet JSON dans une réponse qui peut contenir du texte / des ```json fences.
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
function slugify(name: string): string {
  return 'ex_' + normalize(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'ex_import';
}

// "8-12", "8 à 12", "10", "30s", "30 sec" → { min, max, time }
function parseReps(v: unknown): { min: number; max: number; time: boolean } {
  if (typeof v === 'number' && v > 0) return { min: v, max: v, time: false };
  if (typeof v === 'string') {
    const time = /s\b|sec|second/i.test(v) && !/rep/i.test(v);
    const nums = v.match(/\d+/g)?.map(Number) ?? [];
    if (nums.length >= 2) return { min: nums[0]!, max: nums[1]!, time };
    if (nums.length === 1) return { min: nums[0]!, max: nums[0]!, time };
  }
  return { min: 8, max: 12, time: false };
}

/** Convertit une réponse IA (JSON) en Session. Lève une erreur lisible si impossible. */
export function parseImportedSession(raw: string, library: LibEntry[] = []): Session {
  const cleaned = extractJson(raw);

  // 1) Schéma strict (notre format) : round-trip parfait.
  try {
    return validateImportedSession(cleaned);
  } catch {
    // 2) Fallback tolérant ci-dessous.
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('JSON invalide : impossible de lire le contenu collé.');
  }
  const obj = asRecord(parsed);

  const exercisesRaw = firstArray(obj, ['exercises', 'exercices', 'workout', 'items', 'mouvements']);
  if (exercisesRaw.length === 0) {
    throw new Error('Aucun exercice trouvé dans le JSON collé.');
  }

  const index = new Map<string, LibEntry>();
  for (const e of library) index.set(normalize(e.name), e);

  const exercises: PlannedExercise[] = exercisesRaw.map((rawEx) => {
    const ex = asRecord(rawEx);
    const name = firstString(ex, ['name', 'exercise', 'exercice', 'nom', 'mouvement']) ?? 'Exercice';
    const match = index.get(normalize(name));

    const sets = Math.max(1, Math.round(firstNumber(ex, ['sets', 'series', 'séries', 'nb_series']) ?? 3));
    const reps = parseReps(ex['reps'] ?? ex['repetitions'] ?? ex['répétitions'] ?? ex['rep_range'] ?? ex['reps_min']);
    const loadKg = firstNumber(ex, ['load_kg', 'charge', 'weight', 'kg', 'poids']);
    const equipStr = firstString(ex, ['equipment', 'materiel', 'matériel']) ?? match?.equipment ?? undefined;
    const isBodyweight = /poids du corps|bodyweight|pdc|au poids/i.test(`${name} ${equipStr ?? ''}`) || (loadKg === undefined && reps.time);

    const target: ExerciseTarget = reps.time
      ? { sets, reps_min: reps.min, reps_max: reps.max, unit: 'time', load: 'bodyweight' }
      : isBodyweight
        ? { sets, reps_min: reps.min, reps_max: reps.max, load: 'bodyweight' }
        : { sets, reps_min: reps.min, reps_max: reps.max, load_kg: loadKg ?? 0 };

    return {
      id: match?.id ?? slugify(name),
      name: match?.name ?? name,
      muscle_primary: match?.muscle_primary ?? firstString(ex, ['muscle', 'muscle_primary', 'muscle_principal']),
      muscle_secondary: match?.muscle_secondary ?? [],
      equipment: equipStr,
      progression: 'double',
      rest_seconds: Math.round(firstNumber(ex, ['rest_seconds', 'rest', 'repos']) ?? (reps.time ? 60 : 90)),
      target,
      notes: firstString(ex, ['notes', 'note']) ?? '',
    };
  });

  return {
    schema_version: SCHEMA_VERSION,
    type: 'session',
    id: crypto.randomUUID(),
    name: firstString(obj, ['name', 'title', 'titre', 'nom']) ?? 'Séance importée',
    objective: obj['objective'] as Session['objective'],
    level: obj['level'] as Session['level'],
    source: 'ai',
    created_at: new Date().toISOString(),
    exercises,
  };
}
