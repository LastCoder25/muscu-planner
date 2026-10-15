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

/** ⚠️ L'OR NE S'ANNONCE QU'UNE FOIS PAR HEURE (demandé : « il revient régulièrement et ça
 *  gêne l'affichage ») : les mines et lieux fixes le créditent à chaque récolte, et le
 *  bandeau réapparaissait sans cesse pour lui. Il s'ACCUMULE en silence (`held`), puis sort
 *  d'un bloc avec les autres gains dès qu'une heure a passé depuis sa dernière annonce. */
export const GOLD_GAIN_EVERY_MS = 3_600_000;

export interface GoldGate {
  /** Or retenu, pas encore annoncé. */
  held: number;
  /** Dernière annonce d'or (ms), 0 = jamais. */
  shownAt: number;
}

/** Filtre l'or des gains : le retient, ou l'annonce (cumulé) si l'heure est passée. */
export function gateGold(
  add: ResourceGain[],
  gate: GoldGate,
  now: number,
): { show: ResourceGain[]; gate: GoldGate } {
  const gold = add.find((g) => g.id === 'gold');
  const rest = add.filter((g) => g.id !== 'gold');
  const held = gate.held + (gold?.n ?? 0);
  if (held > 0 && now - gate.shownAt >= GOLD_GAIN_EVERY_MS) {
    return { show: [...rest, { id: 'gold', n: held }], gate: { held: 0, shownAt: now } };
  }
  return { show: rest, gate: { held, shownAt: gate.shownAt } };
}
