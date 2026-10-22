/**
 * 🧭 CE QUE LE FILTRE DES VOYAGES LAISSE VOIR, ET DANS QUEL ORDRE — une seule règle pour la
 * rangée des tuiles (`TripsPanel`), sous la carte comme par-dessus. Deux copies de « qui passe
 * le filtre » finiraient par ne plus montrer la même chose.
 */
import { crewMix } from './militia';
import { shownTripCats, type TripCat, type TripSelection } from './tripFilter';
import {
  shownLegs,
  tripLegTiles,
  TRIP_LEGS,
  type LegSelection,
  type LegSource,
  type LegTile,
  type TripLeg,
} from './tripLegTiles';

/** Ce que la règle lit d'un voyage (le sous-ensemble de `MapTrip`). */
export interface NavTrip extends LegSource {
  cat?: Exclude<TripCat, 'planned' | 'attacks'>;
  /** Retour en ville (ms) : l'heure où se range la tuile « ↩ Retour » encore à venir. */
  homeAt?: number;
  /** Prochaine étape (ms) : l'heure où se range la tuile du voyage. */
  endsAt?: number;
  /** Qui voyage (ids ; `mil:…` = un milicien) et si le héros en est. */
  members?: readonly string[];
  withHero?: boolean;
}

/** 🛡️ Une troupe de miliciens SEULS (sans champion ni héros) : elle ne fait que tenir un lieu. */
const militiaOnly = (t: NavTrip): boolean =>
  !t.withHero && !!t.members?.length && crewMix(t.members) === 'militia';

/** Un voyage et l'heure (ms) où il arrive. */
export interface TripEta<T> {
  trip: T;
  at: number;
}

/**
 * ⏱️ LES PROCHAINS À RENTRER, EN BAS À GAUCHE DE LA CARTE (v1.257.0, demandé : « les trois
 * prochains retours sur le lieu de départ, et les trois prochaines expéditions qui rentrent à
 * un endroit allié — retour d'attaque, blessés qui retournent à la base, garnison qui arrive
 * sur un lieu allié »). Remplace la pastille du seul prochain retour (v1.246.0).
 * - `back` : les ALLERS-RETOURS, à leur heure de retour (`homeAt` : la base OU le poste d'où ils
 *   sont partis) — expéditions, attaques, héros.
 * - `arrive` : les ALLERS SIMPLES qui arrivent chez nous (`cat` renfort : garnison qui rejoint un
 *   lieu tenu, héros qui va se poster, poste quitté ou blessés qui rentrent à la base), à leur
 *   arrivée (`endsAt`). Une traversée en mer n'en est pas (elle change d'île).
 * 🛡️ Hors milice (v1.268.0, demandé : « hors garnison de miliciens ») : une troupe de miliciens
 * seuls ne compte ni dans l'une ni dans l'autre ; mêlée à des champions ou au héros, elle compte.
 * Un voyage programmé n'est pas encore parti ; une heure passée ne compte plus. `n` au plus
 * par liste, du plus proche au plus lointain.
 */
export function upcomingTrips<T extends NavTrip>(
  trips: readonly T[],
  now: number,
  n = 3,
): { back: TripEta<T>[]; arrive: TripEta<T>[] } {
  const back: TripEta<T>[] = [];
  const arrive: TripEta<T>[] = [];
  for (const t of trips) {
    if (t.pending || militiaOnly(t)) continue;
    if (t.homeAt !== undefined) {
      if (t.homeAt > now) back.push({ trip: t, at: t.homeAt });
    } else if (!t.sea && (t.cat === 'reinf' || t.toBase) && (t.endsAt ?? 0) > now)
      arrive.push({ trip: t, at: t.endsAt! });
  }
  const first = (l: TripEta<T>[]) => l.sort((x, y) => x.at - y.at).slice(0, n);
  return { back: first(back), arrive: first(arrive) };
}

const CAT_ORDER: readonly TripCat[] = ['trips', 'raids', 'reinf', 'planned', 'attacks'];

/** Un voyage programmé ne compte QUE dans « Programmés » ; en route, dans sa catégorie. */
export const tripCatOf = (t: NavTrip): Exclude<TripCat, 'attacks'> =>
  t.pending ? 'planned' : (t.cat ?? 'trips');

/** Le contexte du filtre : catégories affichées, étapes affichées, et si les étapes se
 *  séparent (seulement s'il y a les deux à séparer). */
export interface TripFilterCtx {
  counts: Record<TripCat, number>;
  present: TripCat[];
  shown: Set<TripCat>;
  presentLegs: TripLeg[];
  legCounts: Record<TripLeg, number>;
  legsShown: Set<TripLeg>;
}
export function tripFilterCtx(
  trips: readonly NavTrip[],
  attacks: number,
  sel: TripSelection,
  legSel: LegSelection,
): TripFilterCtx {
  const counts: Record<TripCat, number> = { trips: 0, reinf: 0, raids: 0, planned: 0, attacks };
  for (const t of trips) counts[tripCatOf(t)]++;
  const present = CAT_ORDER.filter((c) => counts[c] > 0);
  const legCounts: Record<TripLeg, number> = { wait: 0, go: 0, dwell: 0, back: 0 };
  // Le filtre d'étape lit l'étape EN COURS : c'est elle que la tuile du voyage montre.
  for (const t of trips) legCounts[currentLegTile(t).leg]++;
  const presentLegs = TRIP_LEGS.filter((l) => legCounts[l] > 0);
  return {
    counts,
    present,
    shown: shownTripCats(sel, present),
    presentLegs,
    legCounts,
    legsShown: shownLegs(legSel, presentLegs),
  };
}

/** Une tuile d'étape passe-t-elle le filtre ? */
export const legTileShown = (t: NavTrip, leg: TripLeg, ctx: TripFilterCtx): boolean =>
  ctx.shown.has(tripCatOf(t)) && (ctx.presentLegs.length < 2 || ctx.legsShown.has(leg));

/** 🧭 L'étape EN COURS d'un voyage : la seule qui fait sa tuile (concept B, choisi le
 *  2026-10-09 : « une tuile par voyage, avec une frise » — les autres étapes sont sur la frise). */
export const currentLegTile = (t: LegSource): LegTile => {
  const legs = tripLegTiles(t);
  return legs.find((l) => !l.future) ?? legs[0]!;
};

/** ⏱️ LES DEUX ORDRES DE LA RANGÉE (2026-10-10, demandé : un choix à droite des filtres).
 *  `home` = temps TOTAL avant le retour en ville (croissant) — ce qui libère ses champions le
 *  plus tôt passe devant ; `step` = temps avant la PROCHAINE ÉTAPE (arrivée, fin de fouille,
 *  retour) — ce qui va bouger le plus tôt passe devant. */
export type TripSort = 'home' | 'step';
export const TRIP_SORTS: readonly TripSort[] = ['home', 'step'];

/** Une tuile par voyage (son étape EN COURS), rangée selon `sort`. Un voyage sans retour connu
 *  (renfort qui va se poster) se range à la fin de son étape en cours sous `home`. Tri STABLE.
 *  ⚠️ `sort` est REQUIS : un ordre qu'on peut oublier de passer finit par ne plus suivre le
 *  choix affiché. */
export function tripOrder<T extends NavTrip>(
  trips: readonly T[],
  sort: TripSort,
): { key: string; at: number; trip: T; leg: LegTile }[] {
  return trips
    .map((t) => {
      const leg = currentLegTile(t);
      const step = leg.at ?? t.endsAt;
      const at = sort === 'home' ? (t.homeAt ?? step) : (step ?? t.homeAt);
      return { key: t.key, at: at ?? -Infinity, trip: t, leg };
    })
    .sort((x, y) => x.at - y.at);
}
