// Charge TOUTES les lignes d'une requête, page par page.
//
// Supabase ne rend jamais plus de 1 000 lignes par réponse : une liste qui nourrit un
// TOTAL (le niveau Global additionne toutes les séances) ne doit ni porter de limite ni
// s'arrêter à la première page. Une limite y faisait varier le niveau affiché selon
// l'écran qui avait chargé la liste en dernier (v1.248.1).

/** Taille d'une page : le plafond de lignes du serveur. */
export const PAGE_ROWS = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: Error | null }>;

/** `page(from, to)` construit la requête bornée (`.range(from, to)`), ordre stable compris. */
export async function fetchAllRows<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    const got = data ?? [];
    out.push(...got);
    if (got.length < PAGE_ROWS) return out;
  }
}
