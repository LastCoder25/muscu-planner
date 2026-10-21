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

/** ⚠️ L'OR ET LE MANA NE S'ANNONCENT QU'UNE FOIS PAR HEURE (demandé pour l'or, v1.229.1 :
 *  « il revient régulièrement et ça gêne l'affichage » ; puis pour le mana, v1.259.0 :
 *  « comme l'or, n'affiche pas la production à chaque pierre de mana »). Mines, sources et
 *  lieux fixes les créditent à chaque récolte, et le bandeau réapparaissait sans cesse pour
 *  eux. Chacun s'ACCUMULE en silence (`held`), puis sort d'un bloc avec les autres gains dès
 *  qu'une heure a passé depuis SA dernière annonce. */
export const GATED_GAINS = ['gold', 'mana'] as const;
export type GatedGain = (typeof GATED_GAINS)[number];
export const GAIN_GATE_MS = 3_600_000;

export interface GainGate {
  /** Quantité retenue, pas encore annoncée. */
  held: number;
  /** Dernière annonce de cette ressource (ms), 0 = jamais. */
  shownAt: number;
}

/** Filtre UNE ressource des gains : la retient, ou l'annonce (cumulée) si l'heure est passée.
 *  Les autres passent telles quelles. */
export function gateGain(
  add: ResourceGain[],
  id: GatedGain,
  gate: GainGate,
  now: number,
): { show: ResourceGain[]; gate: GainGate } {
  const hit = add.find((g) => g.id === id);
  const rest = add.filter((g) => g.id !== id);
  const held = gate.held + (hit?.n ?? 0);
  if (held > 0 && now - gate.shownAt >= GAIN_GATE_MS) {
    return { show: [...rest, { id, n: held }], gate: { held: 0, shownAt: now } };
  }
  return { show: rest, gate: { held, shownAt: gate.shownAt } };
}
