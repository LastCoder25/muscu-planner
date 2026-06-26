// importSession.ts — import tolérant d'une séance générée par une IA (ChatGPT…).
// 1) tente le schéma strict (coach.validateImportedSession) ; 2) sinon, normalise
// un JSON « lâche » (clés/format variables) vers une Session. Pur, sans dépendance Vue/Supabase.
import type { Session, PlannedExercise, ExerciseTarget, PrescribedSet } from './types';
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

// Recherche d'un exo par nom, avec score : exact > commence par > contient,
// le plus proche en longueur l'emporte (« Squat » → « Squat barre », pas « Goblet squat »).
function findLib(name: string, library: LibEntry[]): LibEntry | undefined {
  const n = normalize(name);
  if (n.length < 3) return undefined;
  let best: LibEntry | undefined;
  let bestScore = 0;
  for (const e of library) {
    const ln = normalize(e.name);
    let score = 0;
    if (ln === n) score = 100;
    else if (ln.startsWith(n) || n.startsWith(ln)) score = 70 - Math.abs(ln.length - n.length);
    else if (ln.length >= 4 && (ln.includes(n) || n.includes(ln))) score = 30 - Math.abs(ln.length - n.length) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return bestScore > 0 ? best : undefined;
}

function buildSession(name: string, exercises: PlannedExercise[], objective?: unknown, level?: unknown): Session {
  return {
    schema_version: SCHEMA_VERSION,
    type: 'session',
    id: crypto.randomUUID(),
    name,
    objective: objective as Session['objective'],
    level: level as Session['level'],
    source: 'ai',
    created_at: new Date().toISOString(),
    exercises,
  };
}

/** Convertit une réponse IA (JSON OU texte libre type ChatGPT) en Session. */
export function parseImportedSession(raw: string, library: LibEntry[] = []): Session {
  const cleaned = extractJson(raw);

  // 1) Schéma strict (notre format) : round-trip parfait.
  try {
    return validateImportedSession(cleaned);
  } catch {
    // suite : JSON tolérant, sinon texte libre.
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Pas du JSON → on tente le texte libre (format ChatGPT « 40 kg ×8 — 1 min »).
    return parseWorkoutText(raw, library);
  }

  const obj = asRecord(parsed);
  const exercisesRaw = firstArray(obj, ['exercises', 'exercices', 'workout', 'items', 'mouvements']);
  if (exercisesRaw.length === 0) return parseWorkoutText(raw, library);

  const exercises: PlannedExercise[] = exercisesRaw.map((rawEx) => {
    const ex = asRecord(rawEx);
    const name = firstString(ex, ['name', 'exercise', 'exercice', 'nom', 'mouvement']) ?? 'Exercice';
    const match = findLib(name, library);

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

  return buildSession(
    firstString(obj, ['name', 'title', 'titre', 'nom']) ?? 'Séance importée',
    exercises,
    obj['objective'],
    obj['level'],
  );
}

// ── Parseur de texte libre (format ChatGPT) ─────────────
// Reconnaît les en-têtes d'exo (« 🏋️ Squat »), les lignes de série
// (« 40 kg ×8 — 1 min », « Bar ×10 », « 117,5 kg ×1 — 3 min 30 ») et les notes (👉 / 🎯…).
const SET_RE = /^(?:(\d+(?:[.,]\d+)?)\s*kg|bar\b|barre\b)\s*[x×]\s*(\d+)\s*(?:[—–-]\s*(.+))?$/i;

function stripLead(line: string): string {
  return line.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}
function restToSec(t: string | undefined): number | undefined {
  if (!t) return undefined;
  let s = 0;
  const min = t.match(/(\d+)\s*min/i);
  if (min) s += Number(min[1]) * 60;
  const after = t.match(/min\s*(\d+)/i);
  if (after) s += Number(after[1]);
  else if (!min) {
    const sec = t.match(/(\d+)\s*s(?:ec)?\b/i);
    if (sec) s += Number(sec[1]);
  }
  return s || undefined;
}
function parseSetLine(line: string): { load: number; reps: number; rest: number | undefined } | null {
  const m = SET_RE.exec(line);
  if (!m) return null;
  const load = m[1] ? Number(m[1].replace(',', '.')) : 0; // « Bar » → 0
  return { load, reps: Number(m[2]), rest: restToSec(m[3]) };
}
function isNote(line: string): boolean {
  if (/^\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]*\s*(objectif|priorit|focus|semaine|s[ée]ance|but)\b/iu.test(line)) return true;
  return /^\s*(👉|🎯|✅|⚠️|⚠|📅|🔥|💡)/u.test(line);
}

interface TextEx { name: string; sets: { load: number; reps: number; rest: number | undefined }[]; notes: string[] }

function buildFromText(cur: TextEx, library: LibEntry[]): PlannedExercise {
  const match = findLib(cur.name, library);
  const repsArr = cur.sets.map((s) => s.reps);
  const loads = cur.sets.map((s) => s.load);
  const topLoad = Math.max(0, ...loads);
  const maxRest = Math.max(0, ...cur.sets.map((s) => s.rest ?? 0));
  // Prescription = chaque série telle qu'écrite (préserve la pyramide).
  const prescription: PrescribedSet[] = cur.sets.map((s) => (s.load > 0 ? { reps: s.reps, load_kg: s.load } : { reps: s.reps }));

  const target: ExerciseTarget = topLoad > 0
    ? { sets: cur.sets.length, reps_min: Math.min(...repsArr), reps_max: Math.max(...repsArr), load_kg: topLoad }
    : { sets: cur.sets.length, reps_min: Math.min(...repsArr), reps_max: Math.max(...repsArr), load: 'bodyweight' };

  return {
    id: match?.id ?? slugify(cur.name),
    name: match?.name ?? cur.name,
    muscle_primary: match?.muscle_primary ?? undefined,
    muscle_secondary: match?.muscle_secondary ?? [],
    equipment: match?.equipment ?? undefined,
    progression: 'double',
    rest_seconds: maxRest || 90,
    target,
    prescription,
    notes: cur.notes.join(' · '),
  };
}

export function parseWorkoutText(raw: string, library: LibEntry[] = []): Session {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('Contenu vide.');
  const title = stripLead(lines[0]!) || 'Séance importée';

  const exercises: PlannedExercise[] = [];
  let cur: TextEx | null = null;
  const commit = () => {
    if (cur && cur.sets.length > 0) exercises.push(buildFromText(cur, library));
    cur = null;
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const set = parseSetLine(line);
    if (set) {
      cur ??= { name: 'Exercice', sets: [], notes: [] };
      cur.sets.push(set);
      continue;
    }
    if (isNote(line)) {
      if (cur) cur.notes.push(stripLead(line));
      continue;
    }
    // En-tête d'un nouvel exercice.
    commit();
    cur = { name: stripLead(line), sets: [], notes: [] };
  }
  commit();

  if (exercises.length === 0) {
    throw new Error('Format non reconnu : ni JSON, ni séance texte (lignes « 40 kg ×8 »).');
  }
  return buildSession(title, exercises);
}
