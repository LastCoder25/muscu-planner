/** Tentatives LANCÉES et RÉUSSIES, par contenu (palier de Labyrinthe, boss de palier).
 *  Sert à afficher le % de réussite RÉEL du joueur, pas une estimation simulée. */
export type RunStats = Record<string, { runs: number; clears: number }>;

/** Relecture défensive du JSONB : entrées malformées écartées, compteurs entiers ≥ 0, jamais
 *  plus de réussites que de tentatives. */
export function normalizeRunStats(v: unknown): RunStats {
  const out: RunStats = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  const n = (x: unknown) => (typeof x === 'number' && x > 0 ? Math.floor(x) : 0);
  for (const [id, e] of Object.entries(v as Record<string, unknown>)) {
    if (!e || typeof e !== 'object') continue;
    const runs = n((e as { runs?: unknown }).runs);
    const clears = Math.min(runs, n((e as { clears?: unknown }).clears));
    if (runs > 0) out[id] = { runs, clears };
  }
  return out;
}

/** Une tentative LANCÉE sur `id`. */
export function runStarted(stats: RunStats, id: string): RunStats {
  const cur = stats[id] ?? { runs: 0, clears: 0 };
  return { ...stats, [id]: { runs: cur.runs + 1, clears: cur.clears } };
}

/** `id` est RÉUSSI. Une réussite sans lancement enregistré (tentative commencée avant que
 *  les compteurs existent) compte aussi comme une tentative : le % ne dépasse jamais 100. */
export function runCleared(stats: RunStats, id: string): RunStats {
  const cur = stats[id] ?? { runs: 0, clears: 0 };
  const clears = cur.clears + 1;
  return { ...stats, [id]: { runs: Math.max(cur.runs, clears), clears } };
}

/** Une tentative dont l'issue est connue d'un coup (combat de boss) : lancée, et réussie si
 *  `won`. Une seule écriture, donc aucune tentative ne peut rester à moitié comptée. */
export function runAttempt(stats: RunStats, id: string, won: boolean): RunStats {
  const started = runStarted(stats, id);
  return won ? runCleared(started, id) : started;
}

/** % de tentatives réussies sur `id`, ou null s'il n'a jamais été tenté. */
export function runSuccessPct(stats: RunStats, id: string): number | null {
  const e = stats[id];
  if (!e || e.runs <= 0) return null;
  return Math.round((Math.min(e.clears, e.runs) / e.runs) * 100);
}

/** La teinte d'un % de réussite, commune au Labyrinthe et aux boss (≥ 70 vert, ≥ 40 orange). */
export const successTier = (pct: number): 'ok' | 'mid' | 'bad' =>
  pct >= 70 ? 'ok' : pct >= 40 ? 'mid' : 'bad';
