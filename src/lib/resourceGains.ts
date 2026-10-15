// resourceGains — ce que le joueur vient de GAGNER, lu par différence sur ses réserves.
//
// ⚠️ ON NE DEMANDE RIEN AUX SOURCES (demandé : « peu importe que ce soit les lieux fixes
// ou les derniers rapports ») : le plateau compare deux instantanés de réserves, et toute
// hausse est un gain. Une nouvelle source de ressources s'affiche donc sans une ligne de
// plus. Une BAISSE (une dépense) n'est jamais annoncée : ce bandeau dit ce qui arrive.

/** Une réserve par ressource affichée (clé libre : 'gold', 'mana'…). */
export type ResourceSnapshot = Record<string, number>;

/** Un gain à annoncer : la ressource et combien. */
export interface ResourceGain {
  id: string;
  n: number;
}

/** Les hausses entre deux instantanés, dans l'ordre des clés de `next`. Une clé absente
 *  d'un des deux côtés n'est pas comparée (rien de connu, rien à annoncer). */
export function resourceGains(prev: ResourceSnapshot, next: ResourceSnapshot): ResourceGain[] {
  const out: ResourceGain[] = [];
  for (const [id, v] of Object.entries(next)) {
    const before = prev[id];
    if (!Number.isFinite(v) || before === undefined || !Number.isFinite(before)) continue;
    const n = Math.round(v - before);
    if (n > 0) out.push({ id, n });
  }
  return out;
}

/** Cumule des gains successifs (plusieurs ticks à l'ouverture créditent l'un après l'autre) :
 *  une même ressource ne s'affiche qu'une fois, avec la somme. L'ordre d'apparition est
 *  conservé — un « +N » déjà à l'écran ne change pas de place. */
export function mergeGains(acc: ResourceGain[], add: ResourceGain[]): ResourceGain[] {
  if (!add.length) return acc;
  const out = acc.map((g) => ({ ...g }));
  for (const g of add) {
    const hit = out.find((x) => x.id === g.id);
    if (hit) hit.n += g.n;
    else out.push({ ...g });
  }
  return out;
}
