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
import { GACHA } from './gacha';
import { ENDLESS, FORTRESS_ID } from './islandConquest';
import { emptyMilitia, militiaOnMap, produceMilitia, type MilitiaState } from './militia';

export const CROSSING = {
  /** ~2 h de mer (règle 3 de la roadmap). */
  travelMs: 2 * 3600_000,
  /** Un départ chaque heure, à l'heure pile. */
  everyMs: 3600_000,
  /** 💠 Premier débarquement : l'équivalent de 10 tirages (multiplié par `pullCost`). */
  firstLandingPulls: 10,
  /** 🏰 Forteresse abattue : sceaux de champion au rang max de l'île. */
  fortressSeals: 3,
  /** 🏰 Forteresse abattue : runes = base + numéro de l'île. */
  fortressRunesBase: 2,
} as const;

/** 💠 Le coffre du PREMIER débarquement sur une île (à partir de l'île 2) : l'équivalent de
 *  10 tirages en pierres de mana, DÉRIVÉ du prix d'un tirage. Déposé dans la boîte dans la
 *  même écriture que le débarquement, donc une seule fois. */
export function landingChestMessage(isl: Island, at: number): ExpeditionMessage {
  return {
    id: `isl_land_${isl.id}`,
    chest: true,
    title: `⚓ Débarquement sur l'île ${isl.id}`,
    level: isl.minLevel,
    win: true,
    text: `Premier pas sur ${isl.name}. Les marins t'offrent de quoi invoquer.`,
    gold: 0,
    energy: 0,
    mana: CROSSING.firstLandingPulls * GACHA.pullCost,
    key: 0,
    resolvedAt: at,
    claimAt: at,
    claimed: false,
    read: false,
  };
}

/** 🏰 Le coffre de la forteresse portuaire abattue : runes et sceaux de champion au rang max
 *  de l'île (jamais d'XP ni de tickets sur la carte). */
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
  | 'heroBusy'
  | 'troopsMoving';

export const CROSSING_BLOCK_LABEL: Record<CrossingBlock, string> = {
  noArchipel: 'Le mode archipel est désactivé.',
  same: 'Tu es déjà sur cette île.',
  locked: 'Abats d’abord la forteresse portuaire de l’île précédente.',
  atSea: 'Une traversée est déjà en cours.',
  heroBusy: 'Ton héros doit être rentré pour embarquer.',
  troopsMoving:
    'Des troupes marchent encore vers un lieu fixe, ou en reviennent : attends qu’elles soient arrivées.',
};

/**
 * Peut-on traverser vers l'île `to` ? ⚠️ SOURCE UNIQUE écran + store.
 * `heroBusy` : le héros est en expédition ou réservé ; `troopsMoving` : une équipe marche sur
 * un lieu fixe ou en revient, ou des renforts sont en route — leur arrivée se règle sur la
 * carte ACTIVE, qui changerait sous leurs pieds.
 */
export function crossingBlocker(
  map: Pick<ExpeditionMap, 'archipel' | 'islands' | 'crossing'>,
  to: number,
  ctx: { heroBusy: boolean; troopsMoving: boolean },
): CrossingBlock | null {
  if (!map.archipel) return 'noArchipel';
  if (map.crossing) return 'atSea';
  if (map.archipel.island === to) return 'same';
  if (!openIslands(map).includes(to)) return 'locked';
  if (ctx.heroBusy) return 'heroBusy';
  if (ctx.troopsMoving) return 'troopsMoving';
  return null;
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

/** Réserve la traversée : départ à la prochaine heure pile, arrivée 2 h plus tard. */
export function startCrossing(
  map: ExpeditionMap,
  to: number,
  ids: readonly string[],
  now: number,
): ExpeditionMap {
  if (!map.archipel) return map;
  const departAt = nextCrossingDeparture(now);
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
  const { islands, crossing: _c, citadelStash, ...left } = map;
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
    const m = produceMilitia(im.militia, barracks, militiaOnMap(im), now);
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
