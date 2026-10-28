/**
 * 🎯 LES OBJECTIFS DU JOUR SUR LA CARTE (v1.279.0 ; demandé par l'utilisateur : le joueur brûle
 * l'énergie de plusieurs jours en quelques minutes puis ne fait que des clics identiques — trois
 * mini-objectifs qui tournent donnent un but différent chaque jour).
 *
 * ⚠️ DISTINCTS DES QUÊTES DE LA SEMAINE (`weeklyQuests.ts`) : celles-là sont du SPORT et paient
 * des tickets 🎟️ (décision : « un objectif de jeu aurait cassé cette séparation »). Ceux-ci sont
 * du JEU, tirent leur but du jour et paient un CONSOMMABLE — jamais d'or, jamais de ticket.
 *
 * ⚠️ TOUT EST DÉRIVÉ, SAUF UNE MARQUE. Les trois objectifs sont une fonction PURE de (graine de
 * la carte, île, jour) ; la progression se LIT dans ce que le jeu écrit déjà (les départs de la
 * carte, les rapports de la boîte 📬). La seule chose stockée est « ce bonus a déjà été payé »
 * (`ExpeditionMap.daily`) : sans elle, rien ne distinguerait un bonus encaissé d'un bonus à
 * encaisser. Stockage minimal INÉVITABLE, pas une progression stockée.
 *
 * ⚠️ DEUX LIMITES ASSUMÉES, écrites ici pour ne pas être redécouvertes :
 * - la boîte 📬 ne garde que `MESSAGES_CAP` rapports : pour un joueur qui en produit des dizaines
 *   par jour, la progression lue dans les rapports peut RECULER quand les plus vieux sortent. Le
 *   bonus est donc payé AU MOMENT où l'objectif est atteint (l'écran ouvert le déclenche), et ce
 *   qui est payé ne se reprend jamais ;
 * - les rapports ne disent pas de quelle île ils viennent : une mission faite sur une autre île
 *   le même jour compte aussi. Chaque île a ses propres objectifs (graine et île au tirage) et
 *   sa propre marque : traverser pour « re-gagner » le jour est possible mais coûteux (une
 *   traversée libère les champions), et le bonus est minuscule.
 */
import { mulberry32 } from './combat';
import {
  HARVEST_TYPES,
  type ExpeditionMap,
  type ExpeditionMessage,
  type PoiType,
} from './expedition';
import { SUPPLIES, pickSupply, type SupplyId, type SupplyStock } from './supplies';

export type ObjectiveKind = 'sends' | 'harvests' | 'camps' | 'rifts' | 'finds';

interface KindDef {
  emoji: string;
  /** Le but, accordé : « Envoie 6 équipes ». */
  label: (n: number) => string;
  /** Ce que la progression compte, en une ligne (info-bulle) : dit le SENS exact du compteur. */
  how: string;
  min: number;
  max: number;
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

export const OBJECTIVE_KINDS: Record<ObjectiveKind, KindDef> = {
  sends: {
    emoji: '🧭',
    label: (n) => `Envoie ${n} équipes`,
    how: 'Chaque départ compte (héros ou équipe) ; un demi-tour le retire.',
    min: 4,
    max: 8,
  },
  harvests: {
    emoji: '⛏️',
    label: (n) => `Récolte ${n} ${plural(n, 'lieu', 'lieux')}`,
    how: 'Mines, puits, sanctuaires, archives, ruines… : un rapport gagné.',
    min: 3,
    max: 6,
  },
  camps: {
    emoji: '⛺',
    label: (n) => `Prends ${n} ${plural(n, 'camp', 'camps')}`,
    how: 'Camps, repaires et tanières : un rapport gagné.',
    min: 2,
    max: 4,
  },
  rifts: {
    emoji: '🕳️',
    label: (n) => `Ferme ${n} ${plural(n, 'faille', 'failles')}`,
    how: 'Une incursion gagnée sur une faille (le gardien tombé).',
    min: 1,
    max: 2,
  },
  finds: {
    emoji: '🎒',
    label: (n) => `Trouve ${n} consommables`,
    how: 'Les consommables ramenés par tes rapports.',
    min: 2,
    max: 4,
  },
};

const KIND_ORDER = Object.keys(OBJECTIVE_KINDS) as ObjectiveKind[];

export interface DailyObjective {
  kind: ObjectiveKind;
  target: number;
  /** Le consommable payé : tiré avec l'objectif, donc connu d'avance (affiché sur la tuile). */
  reward: SupplyId;
}

/** Les objectifs par jour. Nombre fixe : trois. */
export const DAILY_COUNT = 3;

/** Le jour LOGIQUE bascule à 4 h (comme les quêtes de la semaine) : veiller tard ne change pas
 *  d'objectifs à minuit. */
const DAY_START_HOUR = 4;
const DAY_MS = 24 * 3600_000;

/** Le numéro du jour logique. `tzOffsetMin` = `Date#getTimezoneOffset()` (minutes derrière UTC) :
 *  passé par l'appelant, jamais lu ici (module pur). */
export function dayIndex(now: number, tzOffsetMin: number): number {
  return Math.floor((now - tzOffsetMin * 60_000 - DAY_START_HOUR * 3600_000) / DAY_MS);
}
/** Où commence ce jour logique (ms epoch). */
export function dayStartMs(day: number, tzOffsetMin: number): number {
  return day * DAY_MS + DAY_START_HOUR * 3600_000 + tzOffsetMin * 60_000;
}

/** Un mélange déterministe : mêmes (graine, île, jour) → mêmes objectifs, tous de types distincts. */
export function dailyObjectives(seed: number, island: number, day: number): DailyObjective[] {
  const rng = mulberry32(
    (seed ^ Math.imul(island + 1, 0x9e3779b1) ^ Math.imul(day, 0x85ebca6b)) >>> 0 || 1,
  );
  const pool = [...KIND_ORDER];
  const out: DailyObjective[] = [];
  while (out.length < DAILY_COUNT && pool.length) {
    const kind = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    const def = OBJECTIVE_KINDS[kind];
    const target = def.min + Math.floor(rng() * (def.max - def.min + 1));
    out.push({ kind, target, reward: pickSupply(rng()) });
  }
  return out;
}

export interface DailyCounters {
  sends: number;
  harvests: number;
  camps: number;
  rifts: number;
  finds: number;
}

const CAMP_KINDS: ReadonlySet<PoiType> = new Set<PoiType>(['camp', 'lair', 'den']);

/**
 * La progression du jour, LUE (jamais écrite) : les départs de la carte depuis le début du jour
 * (`map.departures`, datés de l'ARRIVÉE ; ceux encore en route comptent) et les rapports de la
 * boîte 📬 tombés depuis. Les coffres (sport) ne comptent pas.
 */
export function dailyCounters(
  map: Pick<ExpeditionMap, 'departures'>,
  messages: readonly ExpeditionMessage[],
  since: number,
  now: number,
): DailyCounters {
  const c: DailyCounters = {
    sends: (map.departures ?? []).filter((t) => t >= since).length,
    harvests: 0,
    camps: 0,
    rifts: 0,
    finds: 0,
  };
  for (const m of messages) {
    if (m.chest || m.resolvedAt < since || m.resolvedAt > now) continue;
    for (const n of Object.values(m.supplies ?? {})) c.finds += Number.isFinite(n) ? n : 0;
    if (!m.win) continue;
    if (m.poiType && HARVEST_TYPES.has(m.poiType)) c.harvests++;
    if (m.poiType && CAMP_KINDS.has(m.poiType)) c.camps++;
    if (m.party?.rift && m.party.win) c.rifts++;
  }
  return c;
}

export interface ObjectiveState {
  obj: DailyObjective;
  /** Borné à la cible : « 7/6 » ne se montre jamais. */
  progress: number;
  /** La progression lue atteint la cible. */
  complete: boolean;
  /** Le bonus est déjà payé. */
  paid: boolean;
}

/** Ce qui est payé aujourd'hui : la marque du jour, vide si elle date d'un autre jour. */
export function paidToday(daily: ExpeditionMap['daily'], day: number): ObjectiveKind[] {
  return daily && daily.day === day ? daily.done : [];
}

export function objectiveStates(
  objs: readonly DailyObjective[],
  counters: DailyCounters,
  paid: readonly ObjectiveKind[],
): ObjectiveState[] {
  return objs.map((obj) => {
    const done = paid.includes(obj.kind);
    const have = counters[obj.kind];
    return {
      obj,
      progress: done ? obj.target : Math.min(obj.target, have),
      complete: done || have >= obj.target,
      paid: done,
    };
  });
}

/**
 * Les objectifs du jour d'une carte, avec leur état — SOURCE UNIQUE de l'écran et du store (qui
 * recalcule lui-même avant de payer : il ne croit pas l'écran). Une île quittée
 * (`vacatedAt` : plus rien n'y apparaît) n'a pas d'objectifs.
 */
export function dailyStatesFor(
  map: ExpeditionMap,
  messages: readonly ExpeditionMessage[],
  now: number,
  tzOffsetMin: number,
): { day: number; states: ObjectiveState[] } {
  const day = dayIndex(now, tzOffsetMin);
  if (map.archipel?.vacatedAt !== undefined) return { day, states: [] };
  const objs = dailyObjectives(map.seed, map.archipel?.island ?? 0, day);
  const counters = dailyCounters(map, messages, dayStartMs(day, tzOffsetMin), now);
  return { day, states: objectiveStates(objs, counters, paidToday(map.daily, day)) };
}

/** Les bonus à payer maintenant : atteints et pas encore payés. */
export const dueObjectives = (states: readonly ObjectiveState[]): DailyObjective[] =>
  states.filter((s) => s.complete && !s.paid).map((s) => s.obj);

/** Le stock payé par un lot d'objectifs. */
export function rewardStock(due: readonly DailyObjective[]): SupplyStock {
  const out: SupplyStock = {};
  for (const o of due) out[o.reward] = (out[o.reward] ?? 0) + 1;
  return out;
}

/** La tuile d'un objectif : emoji, but, récompense. */
export function objectiveView(o: DailyObjective): {
  emoji: string;
  label: string;
  how: string;
  rewardEmoji: string;
  rewardName: string;
} {
  const def = OBJECTIVE_KINDS[o.kind];
  return {
    emoji: def.emoji,
    label: def.label(o.target),
    how: def.how,
    rewardEmoji: SUPPLIES[o.reward].emoji,
    rewardName: SUPPLIES[o.reward].name,
  };
}
