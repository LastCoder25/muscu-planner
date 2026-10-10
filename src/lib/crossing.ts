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
import {
  createMap,
  poiEmo,
  poiLabel,
  type Crossing,
  type ExpeditionMap,
  type ExpeditionMessage,
} from './expedition';
import { ENDLESS, FORTRESS_ID, stripChampions, vacateIsland } from './islandConquest';
import {
  emptyMilitia,
  militiaIn,
  militiaOnMap,
  produceMilitia,
  returnMilitia,
  takeMilitia,
  type MilitiaState,
} from './militia';
import {
  bankAt,
  controlKindsOf,
  controlProgress,
  militiaFreeSeats,
  islandMilitiaOf,
} from './controlPoints';

export const CROSSING = {
  /** ~2 h de mer (règle 3 de la roadmap). */
  travelMs: 2 * 3600_000,
  /** 🎟️ Premier débarquement : 10 TIRAGES, en tickets (un ticket = un tirage), une seule fois
   *  par île — sinon des allers-retours de 2 h deviendraient une source de tirages. Décision
   *  de l'utilisateur (2026-10-03 : « donne 10 tirages avec une animation ») : le coffre en
   *  donnait 20 (10 en pierres de mana + 10 tickets). L'animation des tickets se joue à
   *  l'ouverture du coffre (`expeClaim` → `celebrateTickets`). */
  firstLandingTickets: 10,
  /** 🏰 Forteresse abattue : sceaux de champion au rang max de l'île, PAR NIVEAU MAXIMAL de
   *  l'île (v1.88.0, demandé : « plus on avance, plus on a de champions ») — 5 / 10 / 15 / 20 / 25
   *  des îles 1 à 5. Lu par `fortressSealCount`. (3 fixes avant.) */
  fortressSealsPerLevel: 0.25,
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

/** 🏰 Les sceaux de champion du coffre d'une forteresse : proportionnels au niveau maximal
 *  de l'île, au moins 1. */
export function fortressSealCount(isl: Pick<Island, 'maxLevel'>): number {
  return Math.max(1, Math.round(isl.maxLevel * CROSSING.fortressSealsPerLevel));
}

/** 🏰 Le coffre de la forteresse portuaire abattue : runes et sceaux de champion au rang max
 *  de l'île (jamais d'XP sur la carte). */
function fortressChestMessage(isl: Island, at: number): ExpeditionMessage {
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
      n: fortressSealCount(isl),
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

/** 🌀 Les sceaux d'une victoire sur la brèche sans fin : proportionnels au niveau maximal
 *  de l'île (5 sur l'île 5), au moins 1. */
function endlessSealCount(isl: Pick<Island, 'maxLevel'>): number {
  return Math.max(1, Math.round(isl.maxLevel * ENDLESS.sealsPerLevel));
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
      seals: {
        kind: 'champion',
        rank: characterRank(isl.maxLevel).rankIndex,
        n: endlessSealCount(isl),
      },
      key: 0,
      resolvedAt: e.at ?? now,
      claimAt: e.at ?? now,
      claimed: false,
      read: false,
    });
  return { map: { ...map, archipel: { ...a, endless: { ...e, paid: e.tier } } }, msgs };
}

/** ⛵ Une traversée VERS L'AVANT (vers une île de numéro plus grand) : c'est elle qui pacifie
 *  l'île quittée et emmène tous les champions. Un retour vers une île déjà visitée ne change
 *  rien de tout ça. */
function isForwardCrossing(c: Pick<Crossing, 'from' | 'to'>): boolean {
  return c.to > c.from;
}

/** Le prochain départ : TOUT DE SUITE. ⚠️ Plus d'heure pile (v1.46.0, décision de
 *  l'utilisateur : « enlève la règle d'heure fixe pour le départ ») ; seul le retour des troupes
 *  encore en marche fait encore attendre (`crossingDeparture`). */
export function nextCrossingDeparture(now: number): number {
  return now;
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

export type CrossingBlock = 'noArchipel' | 'same' | 'locked' | 'atSea' | 'heroBusy' | 'troopsAway';

export const CROSSING_BLOCK_LABEL: Record<CrossingBlock, string> = {
  noArchipel: 'Le mode archipel est désactivé.',
  same: 'Tu es déjà sur cette île.',
  locked: 'Abats d’abord la forteresse portuaire de l’île précédente.',
  atSea: 'Une traversée est déjà en cours.',
  heroBusy: 'Ton héros doit être rentré pour embarquer.',
  troopsAway: 'Des champions sont encore en route : attends leur retour pour quitter l’île.',
};

/** 🧭 Combien de champions de l'île active sont EN ROUTE (mission, renfort, retour à pied,
 *  navigation) — `busyUntil` dans le futur, le « en route » de `advUnavailableReason`. Un
 *  champion en garnison n'en est pas : il y est posé (`busyUntil` remis à 0). */
export function championsTravelling(advs: readonly Adventurer[], now: number): number {
  return advs.filter((a) => a.elsewhere === undefined && (a.busyUntil ?? 0) > now).length;
}

/**
 * Peut-on traverser vers l'île `to` ? ⚠️ SOURCE UNIQUE écran + store.
 * `heroBusy` : le héros est en expédition ou réservé.
 * `championsAway` : des CHAMPIONS encore en route bloquent la réservation (`troopsAway`,
 * 2026-10-08, demandé : « les champions et le héros ne doivent pas être en trajet »). Les
 * MILICIENS en route, eux, ne bloquent pas : le départ attend leur arrivée (`startCrossing`,
 * `postponeCrossing`), qui se règle sur la carte ACTIVE — elle ne doit pas changer sous leurs
 * pieds.
 */
export function crossingBlocker(
  map: Pick<ExpeditionMap, 'archipel' | 'islands' | 'crossing'>,
  to: number,
  ctx: {
    /** Le héros est EN TRAJET : expédition, attaque combinée, marche vers un poste ou retour
     *  à pied. Posté sur un lieu fixe, il ne l'est pas : il embarque de là. */
    heroBusy: boolean;
    /** Les champions de l'île encore en route (`championsTravelling`). */
    championsAway: number;
  },
): CrossingBlock | null {
  if (!map.archipel) return 'noArchipel';
  if (map.crossing) return 'atSea';
  if (map.archipel.island === to) return 'same';
  if (!openIslands(map).includes(to)) return 'locked';
  if (ctx.heroBusy) return 'heroBusy';
  // ⛵ VERS L'AVANT, TOUT LE MONDE QUITTE L'ÎLE (2026-10-08, décision de l'utilisateur : « pas
  // besoin que le héros soit à la forteresse », mais « il faut que les champions et le héros
  // ne soient pas en trajet ») : héros et champions embarquent d'où ils sont posés, jamais
  // en pleine route. Un retour vers une île visitée attend, lui, le retour des troupes.
  if (ctx.championsAway > 0 && isForwardCrossing({ from: map.archipel.island, to }))
    return 'troopsAway';
  return null;
}

/** ⛵ Le départ d'une traversée du héros : maintenant, ou le retour des troupes encore en
 *  marche (`troopsBackAt`, 0 s'il n'y en a pas) s'il est plus tard. */
export function crossingDeparture(now: number, troopsBackAt: number): number {
  return nextCrossingDeparture(Math.max(now, troopsBackAt));
}

/**
 * ⏳ Recale le départ d'une traversée PAS ENCORE PARTIE sur le retour des troupes : des troupes
 * encore en route le repoussent (envoyées après la réservation, ou rentrées plus tard que prévu),
 * et des troupes rentrées plus tôt l'avancent — jusqu'à maintenant. ⚠️ Avancer compte aussi pour
 * une traversée réservée avant la v1.46.0 sur une heure pile qui n'a plus lieu d'être. Les
 * embarqués restent occupés jusqu'à la nouvelle arrivée. `null` si rien ne change, ou si le
 * bateau est déjà parti.
 */
export function postponeCrossing(
  map: ExpeditionMap,
  advs: Adventurer[],
  troopsBackAt: number,
  now: number,
): { map: ExpeditionMap; advs: Adventurer[] } | null {
  const c = map.crossing;
  if (!c || now >= c.departAt) return null;
  const departAt = crossingDeparture(now, troopsBackAt);
  if (departAt === c.departAt) return null;
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

/** Réserve la traversée : départ tout de suite (ou au retour des troupes encore en marche,
 *  `troopsBackAt`), arrivée 2 h plus tard. */
export function startCrossing(
  map: ExpeditionMap,
  to: number,
  ids: readonly string[],
  now: number,
  troopsBackAt = 0,
  /** 🛡️ La répartition de la milice sur l'île quittée (traversée vers l'avant seulement). */
  militiaPlan?: MilitiaPlan,
): ExpeditionMap {
  if (!map.archipel) return map;
  const departAt = crossingDeparture(now, troopsBackAt);
  const forward = to > map.archipel.island;
  const crossing: Crossing = {
    from: map.archipel.island,
    to,
    bookedAt: now,
    departAt,
    arriveAt: departAt + CROSSING.travelMs,
    ids: [...ids],
    ...(forward && militiaPlan && Object.keys(militiaPlan).length ? { militiaPlan } : {}),
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

/** ⛵ Réserve une navigation sans héros : départ tout de suite, 2 h de mer. */
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
function islandSeed(seed: number, island: number): number {
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
  const { islands, crossing: _c, citadelStash, sailings: sailing0, ...left0 } = map;
  void _c;
  // ⛵ VERS L'ÎLE SUIVANTE (décision de l'utilisateur, 2026-10-03) : l'île quittée est
  // pacifiée et vidée de ses lieux (`vacateIsland`), et TOUS les champions partent — ils
  // quittent aussi les garnisons des îles rangées (`stripChampions`). Les miliciens restent.
  // Les navigations sans héros en cours n'ont plus d'objet : leurs champions suivent le héros.
  const forward = isForwardCrossing(c);
  const lvl = (m: Pick<ExpeditionMap, 'archipel'>) => mapPlayerLevel(m, playerLevel);
  const left = forward ? vacateIsland(left0, c.arriveAt, lvl(left0)) : left0;
  const sailings = forward ? undefined : sailing0;
  const stash: Record<string, ExpeditionMap> = {};
  for (const [k, im] of Object.entries(islands ?? {}))
    stash[k] = forward ? stripChampions(im, c.arriveAt, lvl(im)) : im;
  const found = stash[String(c.to)];
  delete stash[String(c.to)];
  const leftWithMilitia = militia ? { ...left, militia } : left;
  // 🛡️ La milice de l'île quittée se range comme le joueur l'a choisi en partant.
  stash[String(c.from)] =
    forward && c.militiaPlan
      ? applyMilitiaPlan(leftWithMilitia, c.militiaPlan, c.arriveAt, lvl(left))
      : leftWithMilitia;
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
    const seats = islandMilitiaOf({ archipel: archipelOn(Number(k)) });
    const m = produceMilitia(im.militia, barracks, militiaOnMap(im), now, seats);
    if (m !== im.militia) islands = { ...islands, [k]: { ...im, militia: m } };
  }
  return islands === map.islands ? map : { ...map, islands };
}

/**
 * 🏝️ LA PRODUCTION DES ÎLES RANGÉES, île par île (2026-10-10, demandé : « voir la production
 * des lieux fixes des îles précédentes »). Une île quittée est pacifiée : rien ne s'y attaque
 * ni ne s'y prend, donc on n'en montre que le lieu et ce qu'il produit — le texte de
 * `controlProgress`, le MÊME que la liste de l'île active (débit, % et temps avant la
 * prochaine unité), au niveau que la carte de cette île voit (`mapPlayerLevel`).
 * ⚠️ Lit les mêmes lieux que la récolte automatique des îles rangées (tenus par le joueur) :
 * un lieu qui ne produit rien de lisible (`controlProgress` → null) n'est pas listé.
 */
export interface StoredIslandProduction {
  island: number;
  name: string;
  emoji: string;
  points: { id: string; label: string; emoji: string; text: string; pct: number | null }[];
}
export function storedIslandProduction(
  map: ExpeditionMap | null | undefined,
  now: number,
  playerLevel: number,
): StoredIslandProduction[] {
  const out: StoredIslandProduction[] = [];
  for (const [k, im] of Object.entries(map?.islands ?? {})) {
    const id = Number(k);
    if (id === map?.archipel?.island) continue;
    const lvl = mapPlayerLevel(im, playerLevel);
    const points = heldRemote(im).flatMap((p) => {
      const pr = controlProgress(p, now, lvl);
      return pr
        ? [{ id: p.id, label: poiLabel(p), emoji: poiEmo(p), text: pr.text, pct: pr.pct }]
        : [];
    });
    if (!points.length) continue;
    const isl = islandById(id);
    out.push({ island: id, name: isl?.name ?? `Île ${id}`, emoji: isl?.emoji ?? '🏝️', points });
  }
  return out.sort((a, b) => a.island - b.island);
}

/** 🛡️ Un lieu fixe tenu d'une île RANGÉE, vu pour gérer sa milice à distance. */
export interface RemotePoint {
  id: string;
  label: string;
  emoji: string;
  militia: number;
  /** Places encore libres pour des miliciens. */
  room: number;
}

/** 🛡️ Les lieux fixes tenus d'une île rangée, avec leur milice (pour l'écran de l'archipel).
 *  Un lieu d'un type RETIRÉ de l'île (le camp d'entraînement, le 2026-10-03) n'est montré que
 *  s'il garde des miliciens : il faut pouvoir les ramener, mais un lieu vide n'existe plus. */
/** 🛡️ Les lieux fixes TENUS d'une île rangée, sans les types RETIRÉS de l'île restés vides.
 *  ⚠️ SOURCE UNIQUE de la gestion de la milice à distance ET de la production affichée : le
 *  nettoyage des types retirés (`ensureControls`) ne tourne que sur l'île active, donc une île
 *  rangée avant le retrait garde son lieu (2026-10-10, constaté : un camp d'entraînement vide
 *  sur l'île 1, listé à « +0 XP/h »). */
function heldRemote(im: ExpeditionMap) {
  const kinds = controlKindsOf(im);
  return im.pois.filter(
    (p) =>
      p.control?.owner === 'player' &&
      (kinds.includes(p.control.kind) || militiaIn(p.control.garrison).length > 0),
  );
}
export function remotePoints(im: ExpeditionMap): RemotePoint[] {
  return heldRemote(im).map((p) => ({
    id: p.id,
    label: poiLabel(p),
    emoji: poiEmo(p),
    militia: militiaIn(p.control!.garrison).length,
    room: militiaFreeSeats(p.control),
  }));
}

/**
 * 🛡️ LA MILICE D'UNE ÎLE RANGÉE SE GÈRE À DISTANCE (demandé par l'utilisateur, 2026-10-03 :
 * « sur l'île 1 on peut faire basculer les miliciens entre les lieux fixes et la base »).
 * `delta` > 0 : de la réserve de l'île vers le lieu ; < 0 : du lieu vers la réserve.
 * ⚠️ IMMÉDIAT, contrairement à l'île active : une île rangée est figée (aucun tick n'y règle
 * de trajet), un milicien en route n'arriverait jamais. La production faite est mise de côté
 * AVANT le changement d'effectif (`bankAt`). `null` si le mouvement est impossible.
 */
export function moveRemoteMilitia(
  im: ExpeditionMap,
  pointId: string,
  delta: number,
  at: number,
  playerLevel: number,
): ExpeditionMap | null {
  const n = Math.trunc(Math.abs(delta));
  const p = im.pois.find((x) => x.id === pointId);
  const c = p?.control;
  if (!n || !p || !c || c.owner !== 'player') return null;
  const reserve = im.militia ?? emptyMilitia(at);
  const banked = c.collectedAt !== undefined ? bankAt(p, at, mapPlayerLevel(im, playerLevel)) : c;
  let garrison: string[];
  let militia: MilitiaState;
  if (delta > 0) {
    if (militiaFreeSeats(c) < n) return null;
    const took = takeMilitia(reserve, n);
    if (!took) return null;
    garrison = [...banked.garrison, ...took.ids];
    militia = took.state;
  } else {
    const mine = militiaIn(banked.garrison);
    if (mine.length < n) return null;
    const out = new Set(mine.slice(-n));
    garrison = banked.garrison.filter((id) => !out.has(id));
    militia = returnMilitia(reserve, n);
  }
  return {
    ...im,
    militia,
    pois: im.pois.map((x) => (x.id === pointId ? { ...x, control: { ...banked, garrison } } : x)),
  };
}

/** 🛡️ Combien de miliciens sur chaque lieu fixe de l'île quittée (id du lieu → nombre). */
export type MilitiaPlan = Record<string, number>;

/** 🛡️ Un lieu fixe de l'île qu'on quitte, vu APRÈS le départ des champions : ses miliciens et
 *  le plus qu'il pourra en tenir (`max`, les places des champions partis comprises). */
export interface LeavingPoint {
  id: string;
  label: string;
  emoji: string;
  militia: number;
  max: number;
}

/**
 * 🛡️ QUITTER L'ÎLE, C'EST CHOISIR OÙ RESTE LA MILICE (2026-10-08, demandé par l'utilisateur :
 * « quand on quitte l'île, on demande au joueur comment il veut répartir ses miliciens dans les
 * lieux fixes »). Les lieux sont lus tels qu'ils seront une fois les champions partis
 * (`stripChampions`, la règle du débarquement) : leurs places libérées comptent.
 */
export function leavingMilitiaPoints(
  map: ExpeditionMap,
  at: number,
  playerLevel: number,
): LeavingPoint[] {
  return remotePoints(stripChampions(map, at, playerLevel))
    .map((p) => ({
      id: p.id,
      label: p.label,
      emoji: p.emoji,
      militia: p.militia,
      max: p.militia + p.room,
    }))
    .filter((p) => p.max > 0);
}

/**
 * 🛡️ Applique une répartition à une île RANGÉE : on retire d'abord (vers la réserve), puis on
 * pose — une réserve vide se remplit avant de servir. Chaque pas passe par
 * `moveRemoteMilitia` (places, réserve, production mise de côté) ; ce qui ne tient plus (lieu
 * perdu, réserve plus maigre qu'au départ) est posé au mieux. Rend la MÊME carte si rien ne
 * bouge.
 */
export function applyMilitiaPlan(
  im: ExpeditionMap,
  plan: MilitiaPlan,
  at: number,
  playerLevel: number,
): ExpeditionMap {
  const count = (m: ExpeditionMap, id: string) => {
    const c = m.pois.find((p) => p.id === id)?.control;
    return c && c.owner === 'player' ? militiaIn(c.garrison).length : null;
  };
  let m = im;
  const step = (id: string, delta: number) => {
    for (let n = Math.abs(delta); n > 0; n--) {
      const next = moveRemoteMilitia(m, id, Math.sign(delta) * n, at, playerLevel);
      if (next) {
        m = next;
        return;
      }
    }
  };
  const want = (v: number) => Math.max(0, Math.trunc(v));
  for (const [id, v] of Object.entries(plan)) {
    const have = count(m, id);
    if (have !== null && have > want(v)) step(id, want(v) - have);
  }
  for (const [id, v] of Object.entries(plan)) {
    const have = count(m, id);
    if (have !== null && have < want(v)) step(id, want(v) - have);
  }
  return m;
}

/**
 * Les champions au débarquement : les embarqués et ceux qui ATTENDAIENT sur l'île d'arrivée
 * redeviennent « ici » ; tous les autres restent sur l'île quittée.
 */
export function landAdventurers(advs: Adventurer[], c: Crossing): Adventurer[] {
  // ⛵ Vers l'île suivante, TOUS les champions débarquent avec le héros, d'où qu'ils viennent
  // (garnisons, autres îles) ; un poste sur une île quittée est levé (`stripChampions`). Ceux
  // qui attendaient déjà sur l'île d'arrivée gardent leur poste.
  if (isForwardCrossing(c))
    return advs.map((a) => {
      if (a.elsewhere === c.to) {
        const { elsewhere: _e, ...rest } = a;
        void _e;
        return rest;
      }
      if (a.elsewhere === undefined && a.posted === undefined) return a;
      const { elsewhere: _e, posted: _p, ...rest } = a;
      void _e;
      void _p;
      return rest;
    });
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

/** Au-delà d'une minute après la réservation, un départ a été retenu par des troupes. */
const DELAY_TOLERANCE_MS = 60_000;

/** ⛵ Un voyage en mer tel que la rangée des voyages le montre. */
export interface SeaTrip {
  key: string;
  crossing: Crossing;
  /** Le héros est à bord (la traversée) ; sinon une navigation de champions seuls. */
  hero: boolean;
  /** Pas encore parti : la tuile décompte le DÉPART. */
  waiting: boolean;
  /** Le départ a glissé après la réservation : des troupes rentrent. */
  delayed: boolean;
  /** Avancement de la mer seule (0..1). */
  pct: number;
}

/**
 * ⛵ Les voyages en mer (la traversée du héros, puis les navigations de champions) encore en
 * cours, pour la rangée des voyages (demandé le 2026-10-03 : la traversée n'y apparaissait pas).
 * ⚠️ Le temps de MER vaut toujours `CROSSING.travelMs` ; un départ tardif (`delayed`) est
 * l'attente du retour des troupes (`postponeCrossing`), pas une mer plus longue.
 */
export function seaTrips(
  map: Pick<ExpeditionMap, 'crossing' | 'sailings'> | null | undefined,
  now: number,
): SeaTrip[] {
  const one = (key: string, c: Crossing, hero: boolean): SeaTrip => ({
    key,
    crossing: c,
    hero,
    waiting: now < c.departAt,
    delayed: c.departAt > c.bookedAt + DELAY_TOLERANCE_MS,
    pct: Math.min(1, Math.max(0, (now - c.departAt) / Math.max(1, c.arriveAt - c.departAt))),
  });
  const out: SeaTrip[] = [];
  const c = map?.crossing;
  if (c && c.arriveAt > now) out.push(one('sea', c, true));
  (map?.sailings ?? []).forEach((s, i) => {
    if (s.arriveAt > now) out.push(one(`sail${i}_${s.bookedAt}`, s, false));
  });
  return out;
}
