// ▶️ REPRENDRE UNE SÉANCE EN COURS depuis l'accueil (audit 2026-10-15).
//
// Une séance live est sauvegardée en localStorage sous `muscu:live:<id>` (store `live`) et
// survit à la fermeture de l'app — mais l'accueil ne proposait de reprendre que la séance
// LIBRE. Une séance de programme interrompue n'était retrouvable qu'en rouvrant le bon plan.
//
// Ce module ne lit pas le stockage : il reçoit les entrées et décide ce qui se reprend, pour
// rester testable.

export interface SavedRunSummary {
  sessionId: string;
  name: string;
  startedAt: number;
  /** Séries de TRAVAIL validées / prévues (les approches ne comptent pas). */
  done: number;
  total: number;
}

const PREFIX = 'muscu:live:';

/** Une séance abandonnée depuis plus longtemps que ça ne se propose plus : on ne reprend pas
 *  une séance vieille d'une semaine, et la laisser en tête de l'accueil serait du bruit. */
export const RESUME_MAX_AGE_MS = 2 * 86_400_000;

interface RawSet {
  done?: unknown;
  warmup?: unknown;
}
interface RawRun {
  session_id?: unknown;
  name?: unknown;
  started_at?: unknown;
  free?: unknown;
  exercises?: unknown;
}

/** Résume UNE entrée sauvegardée, ou `null` si ce n'est pas une séance de programme
 *  reprenable : clé étrangère (`muscu:live:loadstep`…), JSON illisible, séance libre (elle a
 *  sa propre carte), trop vieille, ou sans aucune série. */
export function savedRunSummary(key: string, raw: string | null, now: number): SavedRunSummary | null {
  if (!key.startsWith(PREFIX) || !raw) return null;
  let r: RawRun;
  try {
    r = JSON.parse(raw) as RawRun;
  } catch {
    return null;
  }
  if (!r || typeof r !== 'object' || r.free || typeof r.session_id !== 'string') return null;
  if (key !== PREFIX + r.session_id || r.session_id === 'free') return null;
  if (!Array.isArray(r.exercises)) return null;
  const startedAt = typeof r.started_at === 'string' ? Date.parse(r.started_at) : NaN;
  if (!Number.isFinite(startedAt) || now - startedAt > RESUME_MAX_AGE_MS) return null;
  let done = 0;
  let total = 0;
  for (const ex of r.exercises as { sets?: unknown }[]) {
    for (const s of (Array.isArray(ex?.sets) ? ex.sets : []) as RawSet[]) {
      if (s?.warmup) continue;
      total++;
      if (s?.done) done++;
    }
  }
  if (!total) return null;
  return {
    sessionId: r.session_id,
    name: typeof r.name === 'string' && r.name ? r.name : 'Séance',
    startedAt,
    done,
    total,
  };
}

/** Toutes les séances reprenables, la plus récente d'abord. */
export function savedRuns(
  entries: readonly [string, string | null][],
  now: number,
): SavedRunSummary[] {
  return entries
    .map(([k, v]) => savedRunSummary(k, v, now))
    .filter((x): x is SavedRunSummary => x !== null)
    .sort((a, b) => b.startedAt - a.startedAt);
}
