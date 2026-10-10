/**
 * 📉 Écrire la ligne du personnage sans la relire (v1.134, mesuré) — cf. `persist`.
 *
 * Chaque écriture relisait la ligne ENTIÈRE (jusqu'à 200 Ko de JSON), ~5 000 fois par jour :
 * c'est le trafic sortant qui dépassait le quota gratuit de Supabase. La base ne transforme
 * rien de ce qu'on lui écrit, donc ce qu'elle renverrait EST le patch, passé par JSON.
 */

/** Le patch tel que la base le stockera puis le renverrait : un aller-retour JSON (un champ
 *  `undefined` disparaît, une `Date` devient une chaîne). ⚠️ C'est CET objet qu'on écrit ET
 *  qu'on fusionne : les deux ne peuvent pas différer. */
export function writtenEcho(patch: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(patch)) as Record<string, unknown>;
}

/** La ligne en mémoire après l'écriture : l'état courant, les colonnes écrites par-dessus.
 *  Une NOUVELLE référence (les ticks comparent l'identité de la ligne), sans toucher à
 *  `cur`. Sans ligne chargée, on part du seul patch. */
export function mergeWritten<T extends object>(
  cur: T | null | undefined,
  written: Record<string, unknown>,
): T {
  return { ...(cur ?? {}), ...written } as T;
}
