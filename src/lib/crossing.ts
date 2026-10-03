/**
 * ⛵ LA TRAVERSÉE D'UNE ÎLE À L'AUTRE (étape 3 de la roadmap
 * `docs/superpowers/plans/2026-10-01-carte-archipel-roadmap.md`).
 *
 * Décisions de l'utilisateur (2026-10-02) :
 * - **qui traverse** : le héros et TOUS les champions libres à l'heure du départ ; les autres
 *   (postés, en route, à l'infirmerie) restent sur l'île quittée ;
 * - **les lieux tenus de l'île quittée PRODUISENT toujours**, récoltés à distance ;
 * - **on retraverse dans les deux sens**, vers toute île déjà ouverte.
 *
 * Le modèle : la carte ACTIVE est celle de l'île où se trouve le héros ; les autres îles
 * visitées sont RANGÉES telles quelles dans `ExpeditionMap.islands` (même forme qu'une carte,
 * leur propre `archipel` compris : objectifs abattus, pacification…). Débarquer range l'île
 * quittée et sort l'île d'arrivée (ou en crée une neuve). Un champion resté sur une autre île
 * porte `elsewhere` (le numéro de l'île) : il est indisponible tant qu'on n'y est pas.
 *
 * ⚠️ Une île rangée est FIGÉE : ni apparitions, ni failles, ni reprises. Elle reprend au
 * retour (`advanceWorld` rattrape le temps). Sa production, elle, court toujours.
 */
import type { Adventurer } from './adventurers';
import {
  archipelOn,
  islandById,
  ISLAND_OUTPOST_LEVEL,
  ISLANDS,
  mapPlayerLevel,
  type Island,
} from './archipelago';
import { characterRank } from './characterRank';
import { createMap, type Crossing, type ExpeditionMap, type ExpeditionMessage } from './expedition';
import { ENDLESS, FORTRESS_ID } from './islandConquest';
import { emptyMilitia, militiaOnMap, produceMilitia, type MilitiaState } from './militia';
import { militiaSeatsOf } from './controlPoints';

export const CROSSING = {
  /** ~2 h de mer (règle 3 de la roadmap). */
  travelMs: 2 * 3600_000,
  /** Un départ chaque heure, à l'heure pile. */
  everyMs: 3600_000,
  /** 🎟️ Premier débarquement : 10 TIRAGES, en tickets (un ticket = un tirage), une seule fois
   *  par île — sinon des allers-retours de 2 h deviendraient une source de tirages. Décision
   *  de l'utilisateur (2026-10-03 : « donne 10 tirages avec une animation ») : le coffre en
   *  donnait 20 (10 en pierres de mana + 10 tickets). L'animation des tickets se joue à
   *  l'ouverture du coffre (`expeClaim` → `celebrateTickets`). */
  firstLandingTickets: 10,
  /** 🏰 Forteresse abattue : sceaux de champion au rang max de l'île. */
  fortressSeals: 3,
  /** 🏰 Forteresse abattue : runes = base + numéro de l'île. */
  fortressRunesBase: 2,
} as const;

/** 🎟️ Le coffre du PREMIER débarquement sur une île (à partir de l'île 2) : 10 tirages, en
 *  tickets. Déposé dans la boîte dans la
 *  même écriture que le débarquement, donc une seule fois. */
export function landingChestMessage(isl: Island, at: number): ExpeditionMessage {
  return {
    id: `isl_land_${isl.id}`,
    chest: true,
    title: `⚓ Débarquement sur l'île ${isl.id}`,
    level: isl.minLevel,
    win: true,
    text: `Premier pas sur ${isl.name}. Les marins t'offrent ${CROSSING.firstLandingTickets} tirages.`,
    gold: 0,
    energy: 0,
    tickets: CROSSING.firstLandingTickets,
    key: 0,
    resolvedAt: at,
    claimAt: at,
    claimed: false,
    read: false,
  };
}

/** 🏰 Le coffre de la forteresse portuaire abattue : runes et sceaux de champion au rang max
 *  de l'île (jamais d'XP sur la carte). */
export function fortressChestMessage(isl: Island, at: number): ExpeditionMessage {
  return {
    id: `isl_fort_${isl.id}`,
    chest: true,
    title: `🏰 Coffre de ${isl.fortress}`,
    level: isl.maxLevel,
    win: true,
    text: `${isl.fortress} est tombé : la traversée vers l'île suivante est ouverte.`,
    gold: 0,
    energy: 0,
    runes: CROSSING.fortressRunesBase + isl.id,
    seals: {
      kind: 'champion',
      rank: characterRank(isl.maxLevel).rankIndex,
      n: CROSSING.fortressSeals,
    },
    key: 0,
    resolvedAt: at,
    claimAt: at,
    claimed: false,
    read: false,
  };
}

/** 🏰 La forteresse de l'île active est abattue et son coffre pas encore donné ? Rend la
 *  carte marquée et le message (même écriture → une seule fois), sinon `null`. */
export function fortressReward(
  map: ExpeditionMap,
  now: number,
): { map: ExpeditionMap; msg: ExpeditionMessage } | null {
  const a = map.archipel;
  if (!a || a.chestAt !== undefined || !a.destroyed?.includes(FORTRESS_ID)) return null;
  const isl = islandById(a.island);
  if (!isl) return null;
  return {
    map: { ...map, archipel: { ...a, chestAt: now } },
    msg: fortressChestMessage(isl, now),
  };
}

/** 🌀 Les coffres de la brèche sans fin (île 5) pas encore déposés : un par victoire, plus
 *  riche à chaque cran (runes `runesBase + cran`, bornées), et la carte marquée — même
 *  écriture, donc une seule fois chacun. `null` si rien à déposer. */
export function endlessReward(
  map: ExpeditionMap,
  now: number,
): { map: ExpeditionMap; msgs: ExpeditionMessage[] } | null {
  const a = map.archipel;
  const e = a?.endless;
  const isl = a ? islandById(a.island) : null;
  if (!a || !e || !isl || e.tier <= (e.paid ?? 0)) return null;
  const msgs: ExpeditionMessage[] = [];
  for (let t = (e.paid ?? 0) + 1; t <= e.tier; t++)
    msgs.push({
      id: `isl_endless_${isl.id}_${t}`,
      chest: true,
      title: `🌀 Brèche maudite abattue (${t}ᵉ fois)`,
      level: isl.maxLevel,
      win: true,
      text: 'La brèche se referme… pour trois jours. Elle reviendra plus forte.',
      gold: 0,
      energy: 0,
      runes: Math.min(ENDLESS.runesMax, ENDLESS.runesBase + t),
      seals: { kind: 'champion', rank: characterRank(isl.maxLevel).rankIndex, n: ENDLESS.seals },
      key: 0,
      resolvedAt: e.at ?? now,
      claimAt: e.at ?? now,
      claimed: false,
      read: false,
    });
  return { map: { ...map, archipel: { ...a, endless: { ...e, paid: e.tier } } }, msgs };
}

/** Le prochain départ (l'heure pile à venir, ou maintenant si on y est pile). */
export function nextCrossingDeparture(now: number): number {
  return Math.ceil(now / CROSSING.everyMs) * CROSSING.everyMs;
}

/** Les îles VISITÉES : l'active et celles rangées. */
export function visitedIslands(map: Pick<ExpeditionMap, 'archipel' | 'islands'>): number[] {
  if (!map.archipel) return [];
  const ids = new Set<number>([map.archipel.island]);
  for (const k of Object.keys(map.islands ?? {})) ids.add(Number(k));
  return [...ids].sort((a, b) => a - b);
}

/** L'état archipel d'une île visitée (active ou rangée), ou `null`. */
function archipelOf(map: Pick<ExpeditionMap, 'archipel' | 'islands'>, id: number) {
  if (map.archipel?.island === id) return map.archipel;
  return map.islands?.[String(id)]?.archipel ?? null;
}

/**
 * Les îles OUVERTES à la traversée : toute île visitée, plus la suivante d'une île dont la
 * forteresse portuaire est abattue (la forteresse fait office de porte, sans niveau minimum).
 */
export function openIslands(map: Pick<ExpeditionMap, 'archipel' | 'islands'>): number[] {
  const open = new Set(visitedIslands(map));
  for (const id of [...open]) {
    const a = archipelOf(map, id);
    if (a?.destroyed?.includes(FORTRESS_ID) && id < ISLANDS.length) open.add(id + 1);
  }
  return [...open].sort((a, b) => a - b);
}

export type CrossingBlock =
  | 'noArchipel'
  | 'same'
  | 'locked'
  | 'atSea'
  | 'heroBusy';

export const CROSSING_BLOCK_LABEL: Record<CrossingBlock, string> = {
  noArchipel: 'Le mode archipel est désactivé.',
  same: 'Tu es déjà sur cette île.',
  locked: 'Abats d’abord la forteresse portuaire de l’île précédente.',
  atSea: 'Une traversée est déjà en cours.',
  heroBusy: 'Ton héros doit être rentré pour embarquer.',
};

/**
 * Peut-on traverser vers l'île `to` ? ⚠️ SOURCE UNIQUE écran + store.
 * `heroBusy` : le héros est en expédition ou réservé.
 * ⚠️ Des troupes qui marchent vers un lieu fixe ou en reviennent NE BLOQUENT PLUS la
 * réservation (signalé le 2026-10-03 : « le héros est dispo et je ne peux pas traverser ») :
 * le départ attend leur retour (`startCrossing`, `postponeCrossing`) — leur arrivée se règle
 * sur la carte ACTIVE, qui ne doit pas changer sous leurs pieds.
 */
export function crossingBlocker(
  map: Pick<ExpeditionMap, 'archipel' | 'islands' | 'crossing'>,
  to: number,
  ctx: { heroBusy: boolean },
): CrossingBlock | null {
  if (!map.archipel) return 'noArchipel';
  if (map.crossing) return 'atSea';
  if (map.archipel.island === to) return 'same';
  if (!openIslands(map).includes(to)) return 'locked';
  if (ctx.heroBusy) return 'heroBusy';
  return null;
}

/** ⛵ Le départ d'une traversée du héros : l'heure pile qui suit maintenant ET le retour des
 *  troupes encore en marche (`troopsBackAt`, 0 s'il n'y en a pas). */
export function crossingDeparture(now: number, troopsBackAt: number): number {
  return nextCrossingDeparture(Math.max(now, troopsBackAt));
}

/**
 * ⏳ Des troupes sont encore en route à l'heure du départ (envoyées après la réservation, ou
 * rentrées plus tard que prévu) : le départ glisse à l'heure pile qui suit leur retour, et les
 * embarqués restent occupés jusqu'à la nouvelle arrivée. `null` si rien ne change.
 */
export function postponeCrossing(
  map: ExpeditionMap,
  advs: Adventurer[],
  troopsBackAt: number,
): { map: ExpeditionMap; advs: Adventurer[] } | null {
  const c = map.crossing;
  if (!c || troopsBackAt <= c.departAt) return null;
  const departAt = nextCrossingDeparture(troopsBackAt);
  const next: Crossing = { ...c, departAt, arriveAt: departAt + CROSSING.travelMs };
  return { map: { ...map, crossing: next }, advs: boardTravellers(advs, next) };
}

/** Les champions qui embarquent : tous ceux qui sont LIBRES (ni en route, ni blessés, ni
 *  postés, ni déjà sur une autre île). */
export function crossingTravellers(advs: readonly Adventurer[], now: number): string[] {
  return advs
    .filter(
      (a) =>
        a.elsewhere === undefined &&
        !a.posted &&
        (a.busyUntil ?? 0) <= now &&
        (a.hurtUntil ?? 0) <= now,
    )
    .map((a) => a.id);
}

/** Réserve la traversée : départ à la prochaine heure pile (après le retour des troupes encore
 *  en marche, `troopsBackAt`), arrivée 2 h plus tard. */
export function startCrossing(
  map: ExpeditionMap,
  to: number,
  ids: readonly string[],
  now: number,
  troopsBackAt = 0,
): ExpeditionMap {
  if (!map.archipel) return map;
  const departAt = crossingDeparture(now, troopsBackAt);
  const crossing: Crossing = {
    from: map.archipel.island,
    to,
    bookedAt: now,
    departAt,
    arriveAt: departAt + CROSSING.travelMs,
    ids: [...ids],
  };
  return { ...map, crossing };
}

/** Les embarqués sont occupés jusqu'à l'arrivée. */
export function boardTravellers(advs: Adventurer[], c: Crossing): Adventurer[] {
  const on = new Set(c.ids);
  return advs.map((a) => (on.has(a.id) ? { ...a, busyUntil: c.arriveAt } : a));
}

/**
 * ⛵ CHAMPIONS SEULS (option A, décision de l'utilisateur 2026-10-03) : la PREMIÈRE traversée
 * vers une île se fait avec le héros (c'est elle qui fait naître l'île) ; ensuite, des
 * champions peuvent naviguer SANS lui entre deux îles déjà VISITÉES — pour aller attendre sur
 * une autre île, ou revenir. La carte active ne change pas : ils changent d'île à l'arrivée.
 */

/** Les champions LIBRES qui se trouvent sur l'île `island` (l'active : pas de `elsewhere`). */
export function islandChampions(
  advs: readonly Adventurer[],
  island: number,
  active: number,
  now: number,
): Adventurer[] {
  return advs.filter(
    (a) =>
      (island === active ? a.elsewhere === undefined : a.elsewhere === island) &&
      !a.posted &&
      (a.busyUntil ?? 0) <= now &&
      (a.hurtUntil ?? 0) <= now,
  );
}

export type SailingBlock = 'noArchipel' | 'same' | 'notVisited' | 'empty' | 'notHere';

export const SAILING_BLOCK_LABEL: Record<SailingBlock, string> = {
  noArchipel: 'Le mode archipel est désactivé.',
  same: 'Ils sont déjà sur cette île.',
  notVisited: 'Sans le héros, on ne navigue que vers une île déjà visitée.',
  empty: 'Choisis au moins un champion.',
  notHere: 'Un des champions n’est pas libre sur l’île de départ.',
};

/** ⚠️ SOURCE UNIQUE écran + store : peut-on faire naviguer `ids` de `from` à `to` sans héros ?
 *  `eligible` = les ids libres sur `from` (la fortresse de l'île active comprise). */
export function sailingBlocker(
  map: Pick<ExpeditionMap, 'archipel' | 'islands'>,
  from: number,
  to: number,
  ids: readonly string[],
  eligible: readonly string[],
): SailingBlock | null {
  if (!map.archipel) return 'noArchipel';
  if (from === to) return 'same';
  const visited = visitedIslands(map);
  if (!visited.includes(to) || !visited.includes(from)) return 'notVisited';
  if (!ids.length) return 'empty';
  const ok = new Set(eligible);
  if (ids.some((id) => !ok.has(id))) return 'notHere';
  return null;
}

/** ⛵ Réserve une navigation sans héros : même horaire qu'une traversée (heure pile, 2 h). */
export function startSailing(
  map: ExpeditionMap,
  from: number,
  to: number,
  ids: readonly string[],
  now: number,
): ExpeditionMap {
  const departAt = nextCrossingDeparture(now);
  const s: Crossing = {
    from,
    to,
    bookedAt: now,
    departAt,
    arriveAt: departAt + CROSSING.travelMs,
    ids: [...ids],
  };
  return { ...map, sailings: [...(map.sailings ?? []), s] };
}

/**
 * ⚓ Les navigations arrivées : leurs champions sont désormais sur l'île d'arrivée — « ici »
 * si c'est l'île ACTIVE (lue au moment de l'arrivée, après un éventuel débarquement du héros),
 * `elsewhere` sinon. ⚠️ À appeler APRÈS `landAdventurers` : un débarquement du héros pendant la
 * navigation a pu leur poser un `elsewhere` provisoire, que l'arrivée corrige.
 * `null` si rien n'est arrivé (l'appelant n'écrit pas à vide).
 */
export function settleSailings(
  map: ExpeditionMap,
  advs: Adventurer[],
  now: number,
): { map: ExpeditionMap; advs: Adventurer[] } | null {
  const done = (map.sailings ?? []).filter((s) => s.arriveAt <= now);
  if (!done.length || !map.archipel) return null;
  const active = map.archipel.island;
  const where = new Map<string, number>();
  for (const s of done) for (const id of s.ids) where.set(id, s.to);
  const out = advs.map((a) => {
    const to = where.get(a.id);
    if (to === undefined) return a;
    if (to === active) {
      if (a.elsewhere === undefined) return a;
      const { elsewhere: _e, ...rest } = a;
      void _e;
      return rest;
    }
    return { ...a, elsewhere: to };
  });
  const left = (map.sailings ?? []).filter((s) => s.arriveAt > now);
  const { sailings: _s, ...rest } = map;
  void _s;
  return { map: left.length ? { ...rest, sailings: left } : rest, advs: out };
}

/** La graine d'une île neuve : dérivée de la carte quittée et du numéro de l'île (une île
 *  ne se dessine pas comme la précédente, mais reste la même d'un tick à l'autre). */
export function islandSeed(seed: number, island: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 31 + island) ^ (island * 0x85ebca6b)) >>> 0 || 1;
}

export interface Landing {
  map: ExpeditionMap;
  /** Le débarquement qui vient d'avoir lieu (null si aucun). */
  crossing: Crossing | null;
  /** Première fois sur cette île : le coffre de débarquement est dû. */
  firstTime: boolean;
  /** 🛡️ La réserve de milice de l'île d'arrivée, à poser dans `base.militia` (null si aucun
   *  débarquement). La milice NE TRAVERSE PAS : une réserve par île (règle 5). */
  militia: MilitiaState | null;
}

/**
 * ⚓ DÉBARQUER, si la traversée est arrivée : l'île quittée est rangée telle quelle, l'île
 * d'arrivée sort de sa réserve ou naît neuve. Ce qui est GLOBAL suit la carte active : les
 * îles rangées et les citadelles mises de côté. Une île neuve naît PEUPLÉE (`createMap`, au
 * plancher, à la taille et au rang de l'île) : elle ne doit pas apparaître vide.
 */
export function landCrossing(
  map: ExpeditionMap,
  now: number,
  playerLevel: number,
  /** 🛡️ La réserve de milice de l'île quittée (`base.militia`) : rangée avec elle. */
  militia: MilitiaState | null | undefined,
): Landing {
  const c = map.crossing;
  if (!c || now < c.arriveAt || !map.archipel)
    return { map, crossing: null, firstTime: false, militia: null };
  // ⛵ Les navigations sans héros sont GLOBALES : elles suivent la carte active, jamais l'île
  // rangée (sinon elles se figeraient avec elle et n'arriveraient jamais).
  const { islands, crossing: _c, citadelStash, sailings, ...left } = map;
  void _c;
  const stash: Record<string, ExpeditionMap> = { ...(islands ?? {}) };
  const found = stash[String(c.to)];
  delete stash[String(c.to)];
  stash[String(c.from)] = militia ? { ...left, militia } : left;
  // La réserve de l'île d'arrivée quitte sa carte : elle revient dans `base.militia`.
  let saved: ExpeditionMap | undefined;
  let arrival: MilitiaState | undefined;
  if (found) {
    const { militia: m, ...rest } = found;
    saved = rest;
    arrival = m;
  }
  const archipel = archipelOn(c.to);
  const target: ExpeditionMap =
    saved ??
    createMap(
      islandSeed(left.seed, c.to),
      c.arriveAt,
      mapPlayerLevel({ archipel }, playerLevel),
      ISLAND_OUTPOST_LEVEL,
      undefined,
      archipel,
    );
  return {
    map: {
      ...target,
      islands: stash,
      ...(citadelStash ? { citadelStash } : {}),
      ...(sailings?.length ? { sailings } : {}),
    },
    crossing: c,
    firstTime: !saved,
    militia: arrival ?? emptyMilitia(c.arriveAt),
  };
}

/**
 * 🛡️ LA CASERNE PRODUIT AUSSI POUR LES ÎLES RANGÉES (règle 5) : chaque réserve avance, bornée
 * par le plafond de la Caserne moins SES miliciens postés sur SES lieux. Rend la MÊME carte
 * si rien ne change (l'appelant n'écrit pas à vide).
 */
export function produceIslandMilitia(
  map: ExpeditionMap,
  barracks: number,
  now: number,
): ExpeditionMap {
  if (barracks <= 0 || !map.islands) return map;
  let islands = map.islands;
  for (const [k, im] of Object.entries(map.islands)) {
    if (!im.militia) continue;
    const seats = militiaSeatsOf({ archipel: archipelOn(Number(k)) });
    const m = produceMilitia(im.militia, barracks, militiaOnMap(im), now, seats);
    if (m !== im.militia) islands = { ...islands, [k]: { ...im, militia: m } };
  }
  return islands === map.islands ? map : { ...map, islands };
}

/**
 * Les champions au débarquement : les embarqués et ceux qui ATTENDAIENT sur l'île d'arrivée
 * redeviennent « ici » ; tous les autres restent sur l'île quittée.
 */
export function landAdventurers(advs: Adventurer[], c: Crossing): Adventurer[] {
  const on = new Set(c.ids);
  return advs.map((a) => {
    if (on.has(a.id) || a.elsewhere === c.to) {
      if (a.elsewhere === undefined) return a;
      const { elsewhere: _e, ...rest } = a;
      void _e;
      return rest;
    }
    return a.elsewhere === undefined ? { ...a, elsewhere: c.from } : a;
  });
}
