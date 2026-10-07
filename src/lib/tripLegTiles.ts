/**
 * 🚶↩️ UNE TUILE PAR ÉTAPE (demandé : « dans les tuiles d'expéditions sépare chaque étape
 * dans des tuiles différentes (aller/retour) et rajoute les filtres correspondants »).
 *
 * Un voyage ENCORE À L'ALLER donne DEUX tuiles : « → Aller » (temps jusqu'au lieu) et
 * « ↩ Retour », à venir (temps avant d'être rentré en ville, et durée du retour). Une fois le
 * lieu atteint, il ne reste que la tuile Retour. Un trajet qui n'a qu'une étape garde une
 * seule tuile : un renfort (il reste sur le point), une traversée en mer, un départ programmé
 * (pas encore parti), un rappel vers la base (déjà un retour).
 *
 * ⚠️ Les deux tuiles d'un voyage partagent sa `key` de voyage (`tripKey`) : toucher l'une ou
 * l'autre montre la même équipe et allume le même lieu. Leur clé d'AFFICHAGE (`key`) diffère.
 */
export type TripLeg = 'go' | 'back';

/** Ce que la rangée sait d'un voyage (le sous-ensemble de `MapTrip` qui décide des étapes). */
export interface LegSource {
  key: string;
  back: boolean;
  pending?: boolean;
  sea?: unknown;
  toBase?: boolean;
  time: string;
  total?: string | null;
  totalIcon?: string;
  pct: number;
  legs?: { go: string | null; back: string; detail: string } | null;
}

/** Une tuile d'étape : ce qu'elle affiche à la place des champs du voyage. */
export interface LegTile {
  /** Clé d'affichage, unique dans la rangée. */
  key: string;
  /** Le voyage dont elle est une étape (focus, équipe). */
  tripKey: string;
  leg: TripLeg;
  /** Retour encore À VENIR (le voyage est à l'aller) : la tuile s'estompe. */
  future: boolean;
  /** Les encarts s'inversent sur le retour (`tripEnds`). */
  back: boolean;
  time: string;
  total: string | null;
  totalIcon?: string;
  /** Ligne d'étape en sous-titre (durée du retour à venir), ou `null`. */
  line: string | null;
  pct: number;
}

export function tripLegTiles(t: LegSource): LegTile[] {
  const base = {
    tripKey: t.key,
    total: t.total ?? null,
    totalIcon: t.totalIcon,
    time: t.time,
    pct: t.pct,
    line: null,
    future: false,
  };
  // 🏠 Sur le retour (ou un trajet qui rentre à la base) : une seule tuile, le retour.
  if (t.back || t.toBase) return [{ ...base, key: t.key, leg: 'back', back: true }];
  // Aller simple, départ programmé ou trajet sans étapes connues : une seule tuile « Aller ».
  if (t.pending || t.sea || !t.legs?.go)
    return [{ ...base, key: t.key, leg: 'go', back: t.back }];
  return [
    {
      ...base,
      key: `${t.key}:go`,
      leg: 'go',
      back: false,
      // Le temps avant d'être rentré vit sur la tuile Retour, pas ici.
      total: null,
    },
    {
      ...base,
      key: `${t.key}:back`,
      leg: 'back',
      back: true,
      future: true,
      time: '',
      // 🏠 Rentré en ville dans… (aller + retour) ; la durée du retour en sous-titre.
      totalIcon: '🏠',
      line: `↩ ${t.legs.back}`,
      // Pas encore commencé.
      pct: 0,
    },
  ];
}

/** 🔎 Le filtre des étapes : quelles étapes on montre. Les deux par défaut. */
export type LegSelection = ReadonlySet<TripLeg>;
export const ALL_LEGS: LegSelection = new Set<TripLeg>(['go', 'back']);

/** Toucher une étape l'ajoute ou la retire. */
export function toggleLeg(sel: LegSelection, leg: TripLeg): LegSelection {
  const next = new Set(sel);
  if (next.has(leg)) next.delete(leg);
  else next.add(leg);
  return next;
}

/** ⚠️ Une étape choisie qui n'a plus rien (le dernier aller est arrivé) retombe sur les deux,
 *  au lieu d'une rangée vide qui se lirait comme « aucun voyage » (même règle que les
 *  catégories, `shownTripCats`). Une rangée vidée par le joueur (rien de coché) reste vide. */
export function shownLegs(sel: LegSelection, present: readonly TripLeg[]): Set<TripLeg> {
  const on = present.filter((l) => sel.has(l));
  if (on.length === 0 && sel.size > 0) return new Set(present);
  return new Set(on);
}
