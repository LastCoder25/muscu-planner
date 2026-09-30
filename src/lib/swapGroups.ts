/**
 * ⇄ LES REMPLAÇANTS RANGÉS PAR LIEU DE DÉPART (2026-09-30, demandé : « c'est brouillon — une
 * liste dans un bloc dépliable, les membres disponibles séparés par lieu de départ »).
 *
 * Un groupe par lieu d'où part le remplaçant : la BASE d'abord (elle ne dégarnit aucun autre
 * point), puis les points tenus, du meilleur remplaçant disponible au moins bon. Dans un
 * groupe : les disponibles d'abord, puis par tenue obtenue. Les grisés restent (avec leur
 * raison) mais ne comptent pas comme disponibles.
 */
export interface SwapRowLike {
  /** Le lieu d'où part le remplaçant — `null` = la base. */
  fromId: string | null;
  /** Le nom du lieu, affiché en tête de groupe. */
  where: string;
  /** La tenue du point APRÈS l'échange. */
  pct: number;
  /** Pourquoi il ne peut pas remplacer (`null` = disponible). */
  why: string | null;
}

export interface SwapGroup<R extends SwapRowLike> {
  key: string;
  label: string;
  rows: R[];
  /** Combien de lignes du groupe sont disponibles. */
  avail: number;
}

export const SWAP_BASE_KEY = 'base';

const byAvailThenPct = (a: SwapRowLike, b: SwapRowLike) =>
  Number(!!a.why) - Number(!!b.why) || b.pct - a.pct;

export function groupSwapRows<R extends SwapRowLike>(rows: readonly R[]): SwapGroup<R>[] {
  const groups = new Map<string, SwapGroup<R>>();
  for (const r of rows) {
    const key = r.fromId ?? SWAP_BASE_KEY;
    let g = groups.get(key);
    if (!g) {
      g = { key, label: r.where, rows: [], avail: 0 };
      groups.set(key, g);
    }
    g.rows.push(r);
    if (!r.why) g.avail += 1;
  }
  // Un groupe sans disponible vaut -1 : il passe après tous les autres.
  const best = (g: SwapGroup<R>) => Math.max(-1, ...g.rows.filter((r) => !r.why).map((r) => r.pct));
  const list = [...groups.values()];
  for (const g of list) g.rows.sort(byAvailThenPct);
  return list.sort(
    (a, b) =>
      Number(b.key === SWAP_BASE_KEY) - Number(a.key === SWAP_BASE_KEY) || best(b) - best(a),
  );
}
