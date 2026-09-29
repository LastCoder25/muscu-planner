/**
 * 🏰🧭 LES POINTS FIXES COMME AVANT-POSTES (2026-09-29, décisions de l'utilisateur) :
 *
 * - **Transfert** : des champions ou des miliciens postés sur un point fixe partent
 *   directement vers un AUTRE point fixe tenu, comme un renfort envoyé de la base — ils y
 *   prennent leur place tout de suite et rejoignent la garnison à leur arrivée.
 * - **Sortie** : des champions postés partent attaquer (ou récolter) un lieu DEPUIS leur
 *   point, et y REVIENNENT au lieu de rentrer à la base.
 * - La Tour de guet s'applique partout (le multiplicateur de trajet est celui de la base).
 *
 * ⚠️ AUCUNE RÈGLE DE TRAJET NOUVELLE : un trajet depuis un point est la règle habituelle
 * (`partyLegMin`, `caravanLegMin`) rejouée sur un lieu dont la distance est mesurée DEPUIS
 * ce point (`fromSpot`). Et on ne fait jamais plus long que le détour par la ville : la
 * ligne directe paie les 18 unités autour de la ville que le passage par elle ne paie pas
 * (mesuré au niveau 30 : deux points opposés, 236 min en direct contre 160 par la ville).
 *
 * ⚠️ PUR : toutes les fonctions rendent un nouvel état, le store écrit.
 */
import { distNormAt, type ExpeditionMap, type Poi } from './expedition';
import { isMilitiaId } from './militia';
import {
  controlFreeSeats,
  militiaFreeSeats,
  reinforceControl,
  releaseFromControl,
} from './controlPoints';

type Spot = Pick<Poi, 'x' | 'y'>;

/** Le lieu `poi` vu depuis `origin` : même lieu, distance recalculée depuis ce point. */
export function fromSpot<P extends Poi>(poi: P, origin: Spot): P {
  return { ...poi, distNorm: distNormAt(Math.hypot(poi.x - origin.x, poi.y - origin.y)) };
}

/**
 * Un trajet ALLER (minutes) de `origin` (un point fixe) vers `poi`, selon la règle de trajet
 * `legOf` (celle d'un départ de la ville). Le plus court entre la ligne directe et le détour
 * par la ville (retour à la ville, puis départ habituel).
 */
export function legFromSpot(poi: Poi, origin: Poi, legOf: (p: Poi) => number): number {
  const direct = legOf(fromSpot(poi, origin));
  const viaTown = legOf(origin) + legOf(poi);
  return Math.min(direct, viaTown);
}

const held = (map: ExpeditionMap, id: string) => {
  const p = map.pois.find((q) => q.id === id);
  return p?.control?.owner === 'player' ? p : null;
};

/** 🏰 Pourquoi un transfert ne peut pas partir. SOURCE UNIQUE : l'écran grise avec cette
 *  raison, le store refuse avec elle. */
export type TransferBlock = 'same' | 'notHeld' | 'empty' | 'notHere' | 'full';
export const TRANSFER_BLOCK_LABEL: Record<TransferBlock, string> = {
  same: 'c’est déjà ce point',
  notHeld: 'les deux points doivent être à toi',
  empty: 'choisis au moins un membre de la garnison',
  notHere: 'seuls les membres arrivés sur le point peuvent repartir',
  full: 'plus assez de places sur le point d’arrivée',
};
export function transferBlocker(
  map: ExpeditionMap,
  fromId: string,
  toId: string,
  ids: readonly string[],
): TransferBlock | null {
  if (fromId === toId) return 'same';
  const from = held(map, fromId);
  const to = held(map, toId);
  if (!from || !to) return 'notHeld';
  if (!ids.length) return 'empty';
  // ⚠️ Seulement la garnison ARRIVÉE : un renfort encore en route vers le point de départ ne
  // peut pas en repartir (il n'y est pas), et un id répété ne crée personne.
  const g = new Set(from.control!.garrison);
  if (new Set(ids).size !== ids.length || ids.some((id) => !g.has(id))) return 'notHere';
  const champs = ids.filter((id) => !isMilitiaId(id)).length;
  if (champs > controlFreeSeats(to.control) || ids.length > militiaFreeSeats(to.control))
    return 'full';
  return null;
}

/**
 * 🏰 Le transfert : les partants quittent le point de départ (sa production garde ce qui est
 * déjà produit, `releaseFromControl`) et marchent vers le point d'arrivée, où ils prennent
 * leur place tout de suite. Champions et miliciens ont chacun leur heure d'arrivée (ils ne
 * marchent pas au même pas).
 */
export function transferGarrison(
  map: ExpeditionMap,
  opts: {
    fromId: string;
    toId: string;
    now: number;
    playerLevel: number;
    champs: { ids: readonly string[]; at: number };
    militia: { ids: readonly string[]; at: number };
  },
): ExpeditionMap {
  const { fromId, toId, now } = opts;
  let m = releaseFromControl(
    map,
    fromId,
    [...opts.champs.ids, ...opts.militia.ids],
    now,
    opts.playerLevel,
  );
  if (opts.champs.ids.length)
    m = reinforceControl(m, toId, opts.champs.ids, opts.champs.at, now, fromId);
  if (opts.militia.ids.length)
    m = reinforceControl(m, toId, opts.militia.ids, opts.militia.at, now, fromId);
  return m;
}

/** ⚔️ Pourquoi une sortie ne peut pas partir d'un point. */
export type SortieBlock = 'notHeld' | 'empty' | 'notHere';
export const SORTIE_BLOCK_LABEL: Record<SortieBlock, string> = {
  notHeld: 'ce point n’est plus à toi',
  empty: 'choisis au moins un champion de la garnison',
  notHere: 'seuls les champions arrivés sur le point peuvent en partir',
};
export function sortieBlocker(
  map: ExpeditionMap,
  fromId: string,
  ids: readonly string[],
): SortieBlock | null {
  const from = held(map, fromId);
  if (!from) return 'notHeld';
  if (!ids.length) return 'empty';
  const g = new Set(from.control!.garrison);
  // ⚠️ Des CHAMPIONS : un milicien ne part pas en mission (il tient le point, c'est tout).
  if (new Set(ids).size !== ids.length || ids.some((id) => isMilitiaId(id) || !g.has(id)))
    return 'notHere';
  return null;
}

/** 🏰 Les champions de la garnison ARRIVÉE d'un point (miliciens exclus), dans son ordre. */
export function garrisonChampionIds(map: ExpeditionMap | null | undefined, id: string): string[] {
  const p = map?.pois.find((q) => q.id === id);
  if (p?.control?.owner !== 'player') return [];
  return p.control.garrison.filter((x) => !isMilitiaId(x));
}

/**
 * 🏠 Une sortie RENTRE à son point à `at` : ceux qui ont encore une place y reprennent leur
 * poste (ils rejoignent la garnison comme un renfort arrivé — une attaque déjà due se résout
 * d'abord sans eux) ; les autres (point perdu entre-temps, ou places reprises) rentrent à la
 * base. Rend la carte et la répartition.
 */
export function rejoinHome(
  map: ExpeditionMap,
  homeId: string,
  ids: readonly string[],
  at: number,
): { map: ExpeditionMap; back: string[]; out: string[] } {
  const home = held(map, homeId);
  if (!home || !ids.length) return { map, back: [], out: [...ids] };
  const back = ids.slice(0, controlFreeSeats(home.control));
  const out = ids.slice(back.length);
  return { map: back.length ? reinforceControl(map, homeId, back, at) : map, back, out };
}
