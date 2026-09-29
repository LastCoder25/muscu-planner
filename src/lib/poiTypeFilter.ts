// poiTypeFilter.ts — 🗺️ LE FILTRE PAR TYPE DE LIEU de la carte d'expédition (v0.1174).
//
// Généralise le filtre des failles (demandé : « rajouter chaque type de lieu comme on a mis
// la faille ») : chaque type présent a sa puce, à TROIS états, un toucher passe au suivant —
// affiché · SEUL · masqué. Plusieurs types « seuls » se cumulent (« mines et sources
// seules »), et le filtre se combine toujours aux rangs.
//
// ⚠️ La règle vit ici et pas dans la page : la carte n'est vue par aucune porte (le smoke
// ne l'ouvre pas), une règle écrite dans un `computed` n'y serait couverte par rien.

import { POI_EMO, POI_LABEL, type Poi, type PoiType } from './expedition';

/**
 * 🪖 CE QUE FILTRE UNE TUILE : un type de lieu, ou les ARMÉES ENNEMIES (demandé : « dans les
 * filtres de la carte rajoute les armées ennemies »). Une armée qui marche sur la base ou sur
 * un point fixe est un lieu `warband` marqué `army` : sans sa propre clé, elle tombait dans la
 * tuile « Bande en marche » des failles, et on ne pouvait pas la montrer ou la masquer seule.
 */
export type FilterKey = PoiType | 'army';

/** La clé de filtre d'un lieu. ⚠️ SOURCE UNIQUE : les comptes des tuiles et la carte la lisent. */
export function filterKeyOf(p: Pick<Poi, 'type' | 'army'>): FilterKey {
  return p.army ? 'army' : p.type;
}

/** Nom et emoji d'une tuile — ceux du type de lieu, ou ceux des armées (`poiEmo` dit 🪖). */
export const FILTER_LABEL: Record<FilterKey, string> = { ...POI_LABEL, army: 'Armées ennemies' };
export const FILTER_EMO: Record<FilterKey, string> = { ...POI_EMO, army: '🪖' };

export type TypeMode = 'all' | 'only' | 'none';

/** L'état du filtre : les types « seuls » et les types masqués. Un type absent des deux est
 *  affiché normalement. */
export interface TypeFilter {
  only: FilterKey[];
  hidden: FilterKey[];
}

export const EMPTY_TYPE_FILTER: TypeFilter = { only: [], hidden: [] };

/** L'ordre des puces : la récolte, puis le combat, puis ce qui vient des failles. */
export const TYPE_ORDER: readonly FilterKey[] = [
  'mine',
  'well',
  'shrine',
  'archive',
  'mana_mine',
  'ruins',
  'fallen',
  'plunder',
  'vein',
  'camp',
  'lair',
  'den',
  'arena',
  'rift',
  'warband',
  // 🪖 Les armées ennemies, juste après les bandes des failles.
  'army',
  'wreck',
  // 🏰 Les points de contrôle.
  'control',
];

export function typeMode(f: TypeFilter, t: FilterKey): TypeMode {
  if (f.only.includes(t)) return 'only';
  if (f.hidden.includes(t)) return 'none';
  return 'all';
}

/** Un lieu de ce type est-il montré ? « Seuls » l'emporte : dès qu'un type est seul, seuls
 *  les types seuls restent. */
export function typeShown(f: TypeFilter, t: FilterKey): boolean {
  if (f.only.length > 0) return f.only.includes(t);
  return !f.hidden.includes(t);
}

/**
 * Le toucher sur la puce d'un type : affiché → seul → masqué → affiché.
 *
 * ⚠️ JAMAIS DE CARTE VIDE (la règle des rangs) : on saute l'état « masqué » quand il
 * masquerait le dernier type encore visible parmi `present`.
 */
export function cycleType(f: TypeFilter, t: FilterKey, present: readonly FilterKey[]): TypeFilter {
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
  const pick = (v: unknown): FilterKey[] =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is FilterKey => typeof x === 'string' && known.has(x)))]
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
export function typeOptions<P extends Pick<Poi, 'type' | 'army'>>(
  pois: readonly P[],
  inRanks: (p: P) => boolean,
): { type: FilterKey; total: number; inRanks: number }[] {
  return TYPE_ORDER.map((type) => {
    const of = pois.filter((p) => filterKeyOf(p) === type);
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
  presentTypes: readonly FilterKey[],
  /** 🚶 Le mode des déplacements de troupes — `'all'` quand il n'y en a aucun en cours. */
  troops: TypeMode = 'all',
): { active: boolean; text: string } {
  // « Seuls » l'emporte sur tout : aucun lieu n'est dessiné, rangs et types ne comptent plus.
  if (troops === 'only') return { active: true, text: 'déplacements seulement' };
  const parts: string[] = [];
  const rankOff = ranks.filter((r) => hiddenRanks.has(r)).length;
  if (rankOff > 0) parts.push(`${ranks.length - rankOff}/${ranks.length} rangs`);
  // On NOMME les types tant que c’est court (deux au plus) : « Mine seulement » dit plus que
  // « 1 type seul ». Au-delà, un compte.
  const only = presentTypes.filter((t) => f.only.includes(t));
  const hidden = presentTypes.filter((t) => f.hidden.includes(t));
  const names = (ts: FilterKey[]) => ts.map((t) => FILTER_LABEL[t]).join(', ');
  if (only.length > 0)
    parts.push(only.length <= 2 ? `${names(only)} seulement` : `${only.length} types seuls`);
  else if (hidden.length > 0)
    parts.push(hidden.length <= 2 ? `sans ${names(hidden)}` : `${hidden.length} types masqués`);
  if (troops === 'none') parts.push('sans déplacements');
  return parts.length
    ? { active: true, text: parts.join(' · ') }
    : { active: false, text: 'tout affiché' };
}

/** Le filtre tel qu’il s’applique à la carte d’AUJOURD’HUI : un type « seul » mémorisé mais
 *  absent de la carte est ignoré. ⚠️ Sans ça, un seul type seul absent (« mines seules » un jour
 *  sans mine) masquait TOUTE la carte, puisque « seuls » l’emporte sur le reste. */
export function effectiveTypeFilter(f: TypeFilter, present: readonly FilterKey[]): TypeFilter {
  const only = f.only.filter((t) => present.includes(t));
  return only.length === f.only.length ? f : { only, hidden: f.hidden };
}

/**
 * 🚶 LE FILTRE DES DÉPLACEMENTS DE TROUPES — à trois états comme un type de lieu (demandé :
 * « il manque l'option “seul” pour celle-là ») : affichés → SEULS → masqués → affichés.
 * « Seuls » : la carte ne dessine plus que tes voyages en cours et les lieux où ils vont.
 */
export function nextTroopMode(m: TypeMode): TypeMode {
  return m === 'all' ? 'only' : m === 'only' ? 'none' : 'all';
}

/** Relit le mode stocké. ⚠️ Reprend l'ancien booléen (`'1'` = masqués) de la v0.1355. */
export function parseTroopMode(raw: string | null): TypeMode {
  if (raw === 'only' || raw === 'none' || raw === 'all') return raw;
  return raw === '1' ? 'none' : 'all';
}

/** Les lieux que la carte dessine selon le mode des déplacements : en « seuls », uniquement
 *  ceux où un voyage se rend (`troopPoiIds` — un point tenu qu'on renforce, par exemple ; les
 *  cibles consommées au départ sont dessinées à part). Sinon, les lieux des filtres. */
export function mapPoisFor<P extends { id: string }>(
  mode: TypeMode,
  shown: P[],
  all: readonly P[],
  troopPoiIds: ReadonlySet<string>,
): P[] {
  return mode === 'only' ? all.filter((p) => troopPoiIds.has(p.id)) : shown;
}
