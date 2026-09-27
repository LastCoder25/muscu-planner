// poiTypeFilter.ts — 🗺️ LE FILTRE PAR TYPE DE LIEU de la carte d'expédition (v0.1174).
//
// Généralise le filtre des failles (demandé : « rajouter chaque type de lieu comme on a mis
// la faille ») : chaque type présent a sa puce, à TROIS états, un toucher passe au suivant —
// affiché · SEUL · masqué. Plusieurs types « seuls » se cumulent (« mines et sources
// seules »), et le filtre se combine toujours aux rangs.
//
// ⚠️ La règle vit ici et pas dans la page : la carte n'est vue par aucune porte (le smoke
// ne l'ouvre pas), une règle écrite dans un `computed` n'y serait couverte par rien.

import { POI_LABEL, type PoiType } from './expedition';

export type TypeMode = 'all' | 'only' | 'none';

/** L'état du filtre : les types « seuls » et les types masqués. Un type absent des deux est
 *  affiché normalement. */
export interface TypeFilter {
  only: PoiType[];
  hidden: PoiType[];
}

export const EMPTY_TYPE_FILTER: TypeFilter = { only: [], hidden: [] };

/** L'ordre des puces : la récolte, puis le combat, puis ce qui vient des failles. */
export const TYPE_ORDER: readonly PoiType[] = [
  'mine',
  'well',
  'shrine',
  'archive',
  'mana_mine',
  'ruins',
  'fallen',
  'plunder',
  'camp',
  'lair',
  'den',
  'arena',
  'rift',
  'warband',
  'wreck',
  // 🏰 Les points de contrôle.
  'control',
];

export function typeMode(f: TypeFilter, t: PoiType): TypeMode {
  if (f.only.includes(t)) return 'only';
  if (f.hidden.includes(t)) return 'none';
  return 'all';
}

/** Un lieu de ce type est-il montré ? « Seuls » l'emporte : dès qu'un type est seul, seuls
 *  les types seuls restent. */
export function typeShown(f: TypeFilter, t: PoiType): boolean {
  if (f.only.length > 0) return f.only.includes(t);
  return !f.hidden.includes(t);
}

/**
 * Le toucher sur la puce d'un type : affiché → seul → masqué → affiché.
 *
 * ⚠️ JAMAIS DE CARTE VIDE (la règle des rangs) : on saute l'état « masqué » quand il
 * masquerait le dernier type encore visible parmi `present`.
 */
export function cycleType(f: TypeFilter, t: PoiType, present: readonly PoiType[]): TypeFilter {
  const only = f.only.filter((x) => x !== t);
  const hidden = f.hidden.filter((x) => x !== t);
  const mode = typeMode(f, t);
  if (mode === 'all') return { only: [...only, t], hidden };
  if (mode === 'only') {
    const next = { only, hidden: [...hidden, t] };
    return present.some((x) => typeShown(next, x)) ? next : { only, hidden };
  }
  return { only, hidden };
}

/** Relit un état stocké : ne garde que des types connus, sans doublon ni conflit.
 *  ⚠️ Reprend l'ancien filtre des failles (`muscu:emap:rift-mode`) pour qu'un réglage fait
 *  avant ne soit pas perdu. */
export function parseTypeFilter(raw: unknown, legacyRift?: string | null): TypeFilter {
  const known = new Set<string>(TYPE_ORDER);
  const pick = (v: unknown): PoiType[] =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is PoiType => typeof x === 'string' && known.has(x)))]
      : [];
  if (raw && typeof raw === 'object') {
    const o = raw as { only?: unknown; hidden?: unknown };
    const only = pick(o.only);
    return { only, hidden: pick(o.hidden).filter((t) => !only.includes(t)) };
  }
  if (legacyRift === 'only') return { only: ['rift'], hidden: [] };
  if (legacyRift === 'none') return { only: [], hidden: ['rift'] };
  return { only: [], hidden: [] };
}

/** Les puces à afficher : un type par type PRÉSENT sur la carte, dans l'ordre, avec le
 *  nombre de lieux de ce type dans les rangs affichés. */
export function typeOptions(
  pois: readonly { type: PoiType }[],
  inRanks: (p: { type: PoiType }) => boolean,
): { type: PoiType; total: number; inRanks: number }[] {
  return TYPE_ORDER.map((type) => {
    const of = pois.filter((p) => p.type === type);
    return { type, total: of.length, inRanks: of.filter(inRanks).length };
  }).filter((o) => o.total > 0);
}

/**
 * 🎚️ Ce que dit la ligne REPLIÉE des filtres (v0.1239) : la carte ne doit jamais avoir l'air
 * vide sans raison. `active` = un filtre retire réellement des lieux de la carte.
 *
 * ⚠️ On ne compte que ce qui existe sur la carte AUJOURD'HUI : un rang ou un type masqué
 * (mémorisé par appareil) mais absent de la carte ne filtre rien — l'annoncer ferait croire à
 * une carte filtrée.
 */
export function filterSummary(
  ranks: readonly number[],
  hiddenRanks: ReadonlySet<number>,
  f: TypeFilter,
  presentTypes: readonly PoiType[],
): { active: boolean; text: string } {
  const parts: string[] = [];
  const rankOff = ranks.filter((r) => hiddenRanks.has(r)).length;
  if (rankOff > 0) parts.push(`${ranks.length - rankOff}/${ranks.length} rangs`);
  // On NOMME les types tant que c’est court (deux au plus) : « Mine seulement » dit plus que
  // « 1 type seul ». Au-delà, un compte.
  const only = presentTypes.filter((t) => f.only.includes(t));
  const hidden = presentTypes.filter((t) => f.hidden.includes(t));
  const names = (ts: PoiType[]) => ts.map((t) => POI_LABEL[t]).join(', ');
  if (only.length > 0)
    parts.push(only.length <= 2 ? `${names(only)} seulement` : `${only.length} types seuls`);
  else if (hidden.length > 0)
    parts.push(hidden.length <= 2 ? `sans ${names(hidden)}` : `${hidden.length} types masqués`);
  return parts.length
    ? { active: true, text: parts.join(' · ') }
    : { active: false, text: 'tout affiché' };
}

/** Le filtre tel qu’il s’applique à la carte d’AUJOURD’HUI : un type « seul » mémorisé mais
 *  absent de la carte est ignoré. ⚠️ Sans ça, un seul type seul absent (« mines seules » un jour
 *  sans mine) masquait TOUTE la carte, puisque « seuls » l’emporte sur le reste. */
export function effectiveTypeFilter(f: TypeFilter, present: readonly PoiType[]): TypeFilter {
  const only = f.only.filter((t) => present.includes(t));
  return only.length === f.only.length ? f : { only, hidden: f.hidden };
}
