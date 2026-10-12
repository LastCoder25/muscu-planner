/**
 * ⛵🛡️ LA MILICE TRAVERSE LA MER (2026-10-12, décision de l'utilisateur : « on peut faire venir
 * des miliciens choisis depuis les anciennes îles »).
 *
 * Pourquoi : les miliciens défendent un lieu fixe (avec les champions postés depuis le
 * 2026-10-12), et sur une île neuve la
 * Caserne n'en autorise presque aucun (`militiaCap` suit sa place dans la tranche de l'île :
 * 1 milicien en arrivant sur l'île 2 avec une Caserne 20). Or une île quittée est pacifiée —
 * plus aucune attaque — donc ses miliciens ne défendent plus rien : ils ne font qu'y augmenter
 * la production. Les faire venir est un vrai choix (de la défense ici contre de la production
 * là-bas), et c'est ce qui rend une île neuve défendable (mesuré : 5 miliciens repoussent
 * ~3 reprises sur 4 au niveau d'entrée de chaque île, 1 milicien aucune).
 *
 * Règles :
 * - on ne fait venir que vers l'île ACTIVE, depuis une île RANGÉE (ses lieux sont figés, la
 *   réserve et les miliciens postés y sont lus tels quels) ;
 * - la réserve de l'île part d'abord, puis les lieux les plus garnis (production mise de côté
 *   AVANT, `bankAt`) ;
 * - 2 h de mer (`CROSSING.travelMs`), départ tout de suite ; à l'arrivée ils rejoignent la
 *   réserve de l'île où ils accostent (la base si c'est l'île active) ;
 * - l'île d'arrivée n'en accepte pas plus que ses places (`islandMilitiaOf().seats`, une
 *   garnison pleine sur chaque lieu fixe) : au-delà un milicien ne servirait nulle part ;
 * - l'île de départ, elle, se reremplit au rythme de la Caserne (`produceMilitia` compte ce
 *   qui reste) : ce que l'on perd, c'est le temps qu'il faut pour la regarnir.
 */
import { CROSSING, moveRemoteMilitia, nextCrossingDeparture, visitedIslands } from './crossing';
import { bankAt, islandMilitiaOf, militiaFreeSeats, reinforceControl } from './controlPoints';
import { archipelOn, islandById, mapPlayerLevel } from './archipelago';
import {
  emptyMilitia,
  militiaIn,
  militiaOnMap,
  returnMilitia,
  takeMilitia,
  type MilitiaState,
} from './militia';
import { poiEmo, poiLabel, type Crossing, type ExpeditionMap } from './expedition';

/** Les miliciens d'une île RANGÉE : sa réserve et ceux postés sur ses lieux tenus. */
export function islandMilitiaStock(im: ExpeditionMap | null | undefined): number {
  let n = im?.militia?.home ?? 0;
  for (const p of im?.pois ?? [])
    if (p.control?.owner === 'player') n += militiaIn(p.control.garrison).length;
  return n;
}

/** Les miliciens qui naviguent vers l'île `island`. */
export function militiaSailingTo(
  map: Pick<ExpeditionMap, 'sailings'> | null | undefined,
  island: number,
): number {
  let n = 0;
  for (const s of map?.sailings ?? []) if (s.to === island) n += s.militia ?? 0;
  return n;
}

/** Combien de miliciens l'île ACTIVE peut encore accueillir : ses places, moins la réserve
 *  de la base, ceux postés (ou en marche) sur la carte et ceux déjà en mer vers elle. */
export function activeMilitiaRoom(
  map: ExpeditionMap | null | undefined,
  reserve: MilitiaState | null | undefined,
): number {
  const isl = islandMilitiaOf(map);
  if (!map?.archipel || !isl) return 0;
  const used =
    (reserve?.home ?? 0) + militiaOnMap(map) + militiaSailingTo(map, map.archipel.island);
  return Math.max(0, isl.seats - used);
}

export type ShipMilitiaBlock =
  | 'noArchipel'
  | 'same'
  | 'notVisited'
  | 'empty'
  | 'tooMany'
  | 'noRoom';

export const SHIP_MILITIA_BLOCK_LABEL: Record<ShipMilitiaBlock, string> = {
  noArchipel: 'Le mode archipel est désactivé.',
  same: 'Ces miliciens sont déjà sur cette île.',
  notVisited: 'On ne fait venir des miliciens que d’une île déjà visitée.',
  empty: 'Choisis au moins un milicien.',
  tooMany: 'Il n’y a pas autant de miliciens sur cette île.',
  noRoom: 'Ton île n’a plus de place pour eux (une garnison pleine sur chaque lieu fixe).',
};

/** ⚠️ SOURCE UNIQUE écran + store : peut-on faire venir `n` miliciens de l'île `from` ? */
export function shipMilitiaBlocker(
  map: ExpeditionMap | null | undefined,
  reserve: MilitiaState | null | undefined,
  from: number,
  n: number,
): ShipMilitiaBlock | null {
  if (!map?.archipel) return 'noArchipel';
  if (from === map.archipel.island) return 'same';
  const im = map.islands?.[String(from)];
  if (!im || !visitedIslands(map).includes(from)) return 'notVisited';
  if (!Number.isFinite(n) || n < 1) return 'empty';
  if (Math.floor(n) > islandMilitiaStock(im)) return 'tooMany';
  if (Math.floor(n) > activeMilitiaRoom(map, reserve)) return 'noRoom';
  return null;
}

/** ⛵ Le plus que l'on peut faire venir de `from` maintenant (0 si rien). */
export function shippableMilitia(
  map: ExpeditionMap | null | undefined,
  reserve: MilitiaState | null | undefined,
  from: number,
): number {
  if (!map?.archipel || from === map.archipel.island) return 0;
  const im = map.islands?.[String(from)];
  if (!im || !visitedIslands(map).includes(from)) return 0;
  return Math.min(islandMilitiaStock(im), activeMilitiaRoom(map, reserve));
}

/**
 * ⛵ Embarque `n` miliciens de l'île rangée `from` vers l'île active. La réserve de l'île part
 * d'abord, puis les lieux les plus garnis. `null` si c'est refusé (`shipMilitiaBlocker`).
 */
export function shipMilitia(
  map: ExpeditionMap,
  reserve: MilitiaState | null | undefined,
  from: number,
  n: number,
  now: number,
  playerLevel: number,
): ExpeditionMap | null {
  if (shipMilitiaBlocker(map, reserve, from, n)) return null;
  const count = Math.floor(n);
  const im = map.islands![String(from)]!;
  const lvl = mapPlayerLevel(im, playerLevel);
  const home = im.militia?.home ?? 0;
  const fromHome = Math.min(home, count);
  let left = count - fromHome;
  // Les lieux les plus garnis cèdent d'abord (départage stable par id).
  const held = im.pois
    .filter((p) => p.control?.owner === 'player' && militiaIn(p.control.garrison).length > 0)
    .sort(
      (a, b) =>
        militiaIn(b.control!.garrison).length - militiaIn(a.control!.garrison).length ||
        a.id.localeCompare(b.id),
    );
  const takeFrom = new Map<string, number>();
  for (const p of held) {
    if (left <= 0) break;
    const k = Math.min(left, militiaIn(p.control!.garrison).length);
    takeFrom.set(p.id, k);
    left -= k;
  }
  const pois = im.pois.map((p) => {
    const k = takeFrom.get(p.id);
    if (!k || !p.control) return p;
    // ⚠️ La production faite est mise de côté AVANT que l'effectif change.
    const banked = p.control.collectedAt !== undefined ? bankAt(p, now, lvl) : p.control;
    const out = new Set(militiaIn(banked.garrison).slice(-k));
    return { ...p, control: { ...banked, garrison: banked.garrison.filter((id) => !out.has(id)) } };
  });
  const militia: MilitiaState = {
    ...(im.militia ?? emptyMilitia(now)),
    home: home - fromHome,
  };
  const departAt = nextCrossingDeparture(now);
  const sail: Crossing = {
    from,
    to: map.archipel!.island,
    bookedAt: now,
    departAt,
    arriveAt: departAt + CROSSING.travelMs,
    ids: [],
    militia: count,
  };
  return {
    ...map,
    islands: { ...map.islands, [String(from)]: { ...im, pois, militia } },
    sailings: [...(map.sailings ?? []), sail],
  };
}

/**
 * ⚓ Les miliciens arrivés rejoignent la réserve de l'île où ils accostent : la base
 * (`reserve`) si c'est l'île ACTIVE, sinon la réserve de l'île rangée (un débarquement du héros
 * a pu changer l'île active pendant la mer). ⚠️ À appeler AVANT `settleSailings`, qui retire
 * toutes les navigations arrivées. `null` si rien n'est arrivé (l'appelant n'écrit pas à vide).
 */
export function settleMilitiaSailings(
  map: ExpeditionMap,
  reserve: MilitiaState | null | undefined,
  now: number,
  /** Le niveau du joueur : la production d'un lieu d'arrivée est mise de côté à ce niveau
   *  avant que son effectif change (`moveRemoteMilitia`). */
  playerLevel: number,
): { map: ExpeditionMap; reserve: MilitiaState | null } | null {
  const done = (map.sailings ?? []).filter((s) => (s.militia ?? 0) > 0 && s.arriveAt <= now);
  if (!done.length) return null;
  const active = map.archipel?.island;
  let base = reserve ?? null;
  let islands = map.islands;
  let pois = map.pois;
  for (const s of done) {
    const n = s.militia!;
    const im = islands?.[String(s.to)];
    if (s.to !== active && im) {
      let m: ExpeditionMap = { ...im, militia: returnMilitia(im.militia ?? emptyMilitia(now), n) };
      // ⛵🏰 Vers un lieu précis : ils y entrent tout de suite (l'île est rangée, personne n'y
      // marche) — autant que la place le permet, le reste demeure en réserve.
      if (s.militiaTo)
        for (let k = n; k > 0; k--) {
          const placed = moveRemoteMilitia(m, s.militiaTo, k, s.arriveAt, playerLevel);
          if (placed) {
            m = placed;
            break;
          }
        }
      islands = { ...islands, [String(s.to)]: m };
    } else {
      base = returnMilitia(base ?? emptyMilitia(now), n);
      // ⛵🏰 Vers un lieu de l'île ACTIVE : un renfort arrivé à l'heure d'accostage, que le
      // tick des lieux fixes fait entrer en garnison (places vérifiées, trop-plein renvoyé).
      const c = s.militiaTo ? pois.find((p) => p.id === s.militiaTo)?.control : undefined;
      if (c?.owner === 'player') {
        const took = takeMilitia(base, n);
        if (took) {
          base = took.state;
          pois = reinforceControl({ ...map, pois }, s.militiaTo!, took.ids, s.arriveAt).pois;
        }
      }
    }
  }
  const left = (map.sailings ?? []).filter((s) => !done.includes(s));
  const { sailings: _s, ...rest } = map;
  void _s;
  const next: ExpeditionMap = {
    ...rest,
    pois,
    ...(islands ? { islands } : {}),
    ...(left.length ? { sailings: left } : {}),
  };
  return { map: next, reserve: base };
}

/**
 * ⛵🏰 D'UN LIEU FIXE À UN LIEU FIXE D'UNE AUTRE ÎLE (2026-10-12, demandé par l'utilisateur :
 * « envoyer un milicien d'un lieu fixe d'une île à un autre lieu fixe d'une autre »).
 *
 * Règles (celles de `shipMilitia`, appliquées à un lieu précis, dans les deux sens) :
 * - le départ et l'arrivée sont deux îles DIFFÉRENTES, toutes deux déjà visitées (l'île active
 *   en est une) ; les deux lieux sont tenus ;
 * - les miliciens quittent le lieu de départ tout de suite (production mise de côté AVANT,
 *   `bankAt`) : sur l'île active, le lieu perd ses défenseurs pendant la mer ;
 * - leur place sur le lieu d'arrivée est GARDÉE pendant les 2 h de mer
 *   (`militiaSailingToPoint`), comme un renfort en route ;
 * - l'île d'arrivée ne dépasse pas ses places (`islandMilitiaOf().seats`) ;
 * - à l'accostage (`settleMilitiaSailings`) ils entrent dans le lieu ; s'il n'est plus à nous
 *   ou plein, ils restent dans la réserve de l'île.
 */
export interface MilitiaSpot {
  island: number;
  pointId: string;
}

/** La carte d'une île : l'active elle-même, sinon sa carte rangée (une île déjà visitée). */
function islandMapOf(map: ExpeditionMap, island: number): ExpeditionMap | null {
  if (island === map.archipel?.island) return map;
  if (!visitedIslands(map).includes(island)) return null;
  return map.islands?.[String(island)] ?? null;
}

/** Les miliciens en mer vers CE lieu de l'île `island` (leur place y est gardée). */
export function militiaSailingToPoint(
  map: Pick<ExpeditionMap, 'sailings'> | null | undefined,
  island: number,
  pointId: string,
): number {
  let n = 0;
  for (const s of map?.sailings ?? [])
    if (s.to === island && s.militiaTo === pointId) n += s.militia ?? 0;
  return n;
}

/** Combien de miliciens l'île `island` peut encore accueillir (ses places, moins ceux qui y
 *  sont ou y naviguent). */
function islandRoom(
  map: ExpeditionMap,
  reserve: MilitiaState | null | undefined,
  island: number,
): number {
  if (island === map.archipel?.island) return activeMilitiaRoom(map, reserve);
  const im = map.islands?.[String(island)];
  const seats = islandMilitiaOf({ archipel: archipelOn(island) })?.seats ?? 0;
  if (!im) return 0;
  return Math.max(0, seats - islandMilitiaStock(im) - militiaSailingTo(map, island));
}

/** Le lieu tenu `pointId` d'une carte d'île, `null` s'il n'est pas à nous. */
function heldPoint(im: ExpeditionMap | null, pointId: string) {
  const p = im?.pois.find((x) => x.id === pointId);
  return p?.control?.owner === 'player' ? p : null;
}

/** Les places qu'un lieu d'arrivée peut encore promettre : ses places de milice, moins celles
 *  gardées pour les miliciens déjà en mer vers lui. */
function pointRoom(map: ExpeditionMap, to: MilitiaSpot): number {
  const p = heldPoint(islandMapOf(map, to.island), to.pointId);
  if (!p) return 0;
  return Math.max(
    0,
    militiaFreeSeats(p.control) - militiaSailingToPoint(map, to.island, to.pointId),
  );
}

export type PointShipBlock =
  | 'noArchipel'
  | 'same'
  | 'notVisited'
  | 'empty'
  | 'noSource'
  | 'tooMany'
  | 'noTarget'
  | 'pointFull'
  | 'noRoom';

export const POINT_SHIP_BLOCK_LABEL: Record<PointShipBlock, string> = {
  noArchipel: 'Le mode archipel est désactivé.',
  same: 'Ce lieu est sur la même île : envoie-les à pied.',
  notVisited: 'On n’envoie des miliciens que vers une île déjà visitée.',
  empty: 'Choisis au moins un milicien.',
  noSource: 'Ce lieu n’est plus à toi.',
  tooMany: 'Il n’y a pas autant de miliciens sur ce lieu.',
  noTarget: 'Ce lieu n’est pas à toi.',
  pointFull: 'Plus de place pour des miliciens sur ce lieu.',
  noRoom: 'Cette île n’a plus de place pour eux (une garnison pleine sur chaque lieu fixe).',
};

/** ⚠️ SOURCE UNIQUE écran + store : peut-on envoyer `n` miliciens de `from` vers `to` ? */
export function shipPointBlocker(
  map: ExpeditionMap | null | undefined,
  reserve: MilitiaState | null | undefined,
  from: MilitiaSpot,
  to: MilitiaSpot,
  n: number,
): PointShipBlock | null {
  if (!map?.archipel) return 'noArchipel';
  if (from.island === to.island) return 'same';
  const src = islandMapOf(map, from.island);
  const dst = islandMapOf(map, to.island);
  if (!src || !dst) return 'notVisited';
  if (!Number.isFinite(n) || n < 1) return 'empty';
  const sp = heldPoint(src, from.pointId);
  if (!sp) return 'noSource';
  if (Math.floor(n) > militiaIn(sp.control!.garrison).length) return 'tooMany';
  if (!heldPoint(dst, to.pointId)) return 'noTarget';
  if (Math.floor(n) > pointRoom(map, to)) return 'pointFull';
  if (Math.floor(n) > islandRoom(map, reserve, to.island)) return 'noRoom';
  return null;
}

/** 🏰 Un lieu d'arrivée possible, vu depuis une île de départ. */
export interface SeaDestination {
  island: number;
  islandName: string;
  islandEmoji: string;
  pointId: string;
  label: string;
  emoji: string;
  /** Combien il peut encore en recevoir (place du lieu ET de l'île). */
  room: number;
}

/** 🏰 Les lieux tenus des AUTRES îles visitées qui acceptent des miliciens (lieux de
 *  production et bases : `militiaFreeSeats` exclut objectifs, forteresse, citadelle). Un lieu
 *  plein reste listé (room 0) : l'écran le grise en disant pourquoi. */
export function seaDestinations(
  map: ExpeditionMap | null | undefined,
  reserve: MilitiaState | null | undefined,
  from: number,
): SeaDestination[] {
  if (!map?.archipel) return [];
  const islands = [map.archipel.island, ...visitedIslands(map)]
    .filter((v, i, a) => a.indexOf(v) === i && v !== from)
    .sort((a, b) => a - b);
  const out: SeaDestination[] = [];
  for (const id of islands) {
    const im = islandMapOf(map, id);
    if (!im) continue;
    const isl = islandById(id);
    const room = islandRoom(map, reserve, id);
    for (const p of im.pois) {
      const c = p.control;
      if (c?.owner !== 'player') continue;
      if (militiaFreeSeats(c) + militiaIn(c.garrison).length <= 0) continue;
      out.push({
        island: id,
        islandName: isl?.name ?? `Île ${id}`,
        islandEmoji: isl?.emoji ?? '🏝️',
        pointId: p.id,
        label: poiLabel(p),
        emoji: poiEmo(p),
        room: Math.min(pointRoom(map, { island: id, pointId: p.id }), room),
      });
    }
  }
  return out;
}

/**
 * ⛵🏰 Embarque `n` miliciens du lieu `from` vers le lieu `to` d'une autre île : ils quittent
 * leur lieu tout de suite, naviguent 2 h, et entrent dans le lieu d'arrivée à l'accostage.
 * `null` si c'est refusé (`shipPointBlocker`).
 */
export function shipMilitiaToPoint(
  map: ExpeditionMap,
  reserve: MilitiaState | null | undefined,
  from: MilitiaSpot,
  to: MilitiaSpot,
  n: number,
  now: number,
  playerLevel: number,
): ExpeditionMap | null {
  if (shipPointBlocker(map, reserve, from, to, n)) return null;
  const count = Math.floor(n);
  const src = islandMapOf(map, from.island)!;
  const lvl = mapPlayerLevel(src, playerLevel);
  const pois = src.pois.map((p) => {
    if (p.id !== from.pointId || !p.control) return p;
    // ⚠️ La production faite est mise de côté AVANT que l'effectif change.
    const banked = p.control.collectedAt !== undefined ? bankAt(p, now, lvl) : p.control;
    const out = new Set(militiaIn(banked.garrison).slice(-count));
    return { ...p, control: { ...banked, garrison: banked.garrison.filter((id) => !out.has(id)) } };
  });
  const departAt = nextCrossingDeparture(now);
  const sail: Crossing = {
    from: from.island,
    to: to.island,
    bookedAt: now,
    departAt,
    arriveAt: departAt + CROSSING.travelMs,
    ids: [],
    militia: count,
    militiaTo: to.pointId,
  };
  const sailings = [...(map.sailings ?? []), sail];
  if (src === map) return { ...map, pois, sailings };
  return {
    ...map,
    islands: { ...map.islands, [String(from.island)]: { ...src, pois } },
    sailings,
  };
}
