/**
 * ⛵🛡️ LA MILICE TRAVERSE LA MER (2026-10-12, décision de l'utilisateur : « on peut faire venir
 * des miliciens choisis depuis les anciennes îles »).
 *
 * Pourquoi : seuls les miliciens défendent un lieu fixe (v1.103), et sur une île neuve la
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
import { CROSSING, nextCrossingDeparture, visitedIslands } from './crossing';
import { bankAt, islandMilitiaOf } from './controlPoints';
import { mapPlayerLevel } from './archipelago';
import { emptyMilitia, militiaIn, militiaOnMap, returnMilitia, type MilitiaState } from './militia';
import type { Crossing, ExpeditionMap } from './expedition';

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
): { map: ExpeditionMap; reserve: MilitiaState | null } | null {
  const done = (map.sailings ?? []).filter((s) => (s.militia ?? 0) > 0 && s.arriveAt <= now);
  if (!done.length) return null;
  const active = map.archipel?.island;
  let base = reserve ?? null;
  let islands = map.islands;
  for (const s of done) {
    const n = s.militia!;
    const im = islands?.[String(s.to)];
    if (s.to !== active && im) {
      const m = returnMilitia(im.militia ?? emptyMilitia(now), n);
      islands = { ...islands, [String(s.to)]: { ...im, militia: m } };
    } else {
      base = returnMilitia(base ?? emptyMilitia(now), n);
    }
  }
  const left = (map.sailings ?? []).filter((s) => !done.includes(s));
  const { sailings: _s, ...rest } = map;
  void _s;
  const next: ExpeditionMap = {
    ...rest,
    ...(islands ? { islands } : {}),
    ...(left.length ? { sailings: left } : {}),
  };
  return { map: next, reserve: base };
}
