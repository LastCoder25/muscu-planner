/**
 * 🧭 CE QUE LE FILTRE DES VOYAGES LAISSE VOIR, ET DANS QUEL ORDRE — une seule règle pour la
 * rangée des tuiles (`TripsPanel`), sous la carte comme par-dessus. Deux copies de « qui passe
 * le filtre » finiraient par ne plus montrer la même chose.
 */
import { shownTripCats, type TripCat, type TripSelection } from './tripFilter';
import {
  shownLegs,
  tripLegTiles,
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
  const legCounts: Record<TripLeg, number> = { go: 0, back: 0 };
  for (const t of trips) for (const l of tripLegTiles(t)) legCounts[l.leg]++;
  const presentLegs = (['go', 'back'] as const).filter((l) => legCounts[l] > 0);
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

/** Les tuiles d'étape des voyages, rangées à l'heure de leur étape (tri STABLE). */
export function tripLegOrder<T extends NavTrip>(
  trips: readonly T[],
): { key: string; at: number; trip: T; leg: LegTile }[] {
  return trips
    .flatMap((t) =>
      tripLegTiles(t).map((leg) => ({
        key: leg.key,
        // 🚶↩️ La tuile « ↩ Retour » encore à venir se range à l'heure du retour en ville.
        at: leg.future ? (t.homeAt ?? t.endsAt ?? Infinity) : (t.endsAt ?? -Infinity),
        trip: t,
        leg,
      })),
    )
    .sort((x, y) => x.at - y.at);
}
