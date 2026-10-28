/**
 * 🌗 LES CONDITIONS D'ÎLE (v1.276.0 ; décidé avec l'utilisateur : « plus de variabilité
 * pendant qu'on reste sur une île »). Une condition est une FONCTION PURE de
 * (graine de la carte, île, période de 12 h) : JAMAIS stockée, donc rien à migrer, rien à
 * purger — et `planPushes` peut la prévoir sans rien enregistrer, exactement comme la
 * caravane pillée (`plunderForecast`), mais sans même rejouer la carte.
 *
 * ⚠️ VERSION 1 VOLONTAIREMENT ÉTROITE : elles ne touchent QUE l'or, la production et l'XP des
 * récoltes. Ni les temps de trajet (appliqués à une dizaine d'endroits) ni le niveau des
 * ennemis (figé au spawn dans `poi.level`) : c'est la version 2.
 *
 * ⚠️ LE MOMENT QUI COMPTE EST LE DÉPART : l'issue d'un voyage est FIGÉE à l'envoi (graine
 * du départ, `startParty` / `startExpedition`) — la condition lue est donc celle de l'heure
 * d'envoi, annoncée sur la fiche avant de partir, jamais celle de l'encaissement.
 *
 * Plus de la moitié des périodes n'ont AUCUNE condition : la variété vient aussi du repos,
 * et une condition à ×2 ne doit pas être permanente (cf. `CONDITION_ODDS`, mesuré contre
 * l'économie dans `test/islandCondition.test.ts` et `goldSink`).
 */
import { mulberry32 } from './combat';
import type { ExpeditionMap, PoiType } from './expedition';

/** Une condition dure une période ; deux périodes de suite identiques se prolongent. */
export const CONDITION_PERIOD_MS = 12 * 3600_000;

export type ConditionId = 'lune_rouge' | 'filon_riche' | 'marchand' | 'vents_calmes';

export interface ConditionDef {
  id: ConditionId;
  emo: string;
  label: string;
  /** Ce qu'elle change, en une phrase (fiche d'île, pastille, notification). */
  effect: string;
  /** Part des périodes où elle tombe (la somme reste < 1 : le reste est du repos). */
  odds: number;
  /** « Rare » : seule celle-là est annoncée par notification. */
  rare: boolean;
  /** Multiplicateur de l'or de récolte, par type de lieu (absent = ×1). */
  gold?: Partial<Record<PoiType, number>>;
  /** Multiplicateur de la CHANCE de trouver un consommable en route. */
  supplyChance?: number;
  /** Multiplicateur de l'XP des champions d'une équipe. */
  xp?: number;
}

/**
 * Le catalogue. MESURÉ contre l'économie (`goldSink`, `fullGoldPerDay` avant/après) : les
 * mines pèsent 60 à 80 % du revenu type, donc un premier jet (Lune ×2 à 8 %, Filon ×1,5 à
 * 15 % : +15,5 % d'or de mine) donnait +9 à +12 % de revenu — trop ; un second jet à +5 %
 * d'or de mine (≈ +3,9 % de revenu) faisait SORTIR la marge de `goldSink` (« deux bâtiments de
 * moins » : 95,3 % pour une borne à 95), et +3,8 % la touchait encore (95,05 %). Calé à +3 % d'or
 * de mine moyen (≈ +2,4 % de revenu) : la marge de `goldSink` n'a que ~2,8 % de revenu de jeu,
 * donc la VARIÉTÉ vient surtout des conditions sans or (Marchand, Vents calmes, 12 % chacune) ;
 * la Lune rouge est un événement (3 % : ~1 période sur 33). ⚠️ Un joueur qui CHOISIT l'heure
 * de ses mines fait mieux que la moyenne (jusqu'à ×1,6 sur ses envois), c'est voulu.
 * 33 % des périodes ont une condition. ⚠️ Toute chance ou ampleur de plus se re-mesure
 * (`npm run test:calib`).
 */
export const CONDITIONS: Record<ConditionId, ConditionDef> = {
  lune_rouge: {
    id: 'lune_rouge',
    emo: '🌑',
    label: 'Lune rouge',
    effect: 'L’or des mines et des caravanes pillées est augmenté de 60 %.',
    odds: 0.03,
    rare: true,
    gold: { mine: 1.6, plunder: 1.6 },
  },
  filon_riche: {
    id: 'filon_riche',
    emo: '⛏️',
    label: 'Filon riche',
    effect: 'L’or des mines est augmenté d’un cinquième.',
    odds: 0.06,
    rare: false,
    gold: { mine: 1.2 },
  },
  marchand: {
    id: 'marchand',
    emo: '🛒',
    label: 'Marchand itinérant',
    effect: 'Deux fois plus de chances de trouver un consommable en route.',
    odds: 0.12,
    rare: true,
    supplyChance: 2,
  },
  vents_calmes: {
    id: 'vents_calmes',
    emo: '🍃',
    label: 'Vents calmes',
    effect: 'Les champions apprennent un quart de plus en équipe.',
    odds: 0.12,
    rare: false,
    xp: 1.25,
  },
};

/** Le multiplicateur d'or MOYEN d'un type de lieu sur la durée (somme des chances × gain) :
 *  ce que l'économie doit supposer d'un joueur qui envoie au hasard des heures. Un joueur qui
 *  CHOISIT son heure fait mieux, jusqu'à ×2 (cf. note du catalogue). Lu par `goldModel`. */
export function meanGoldMult(type: PoiType): number {
  let m = 1;
  for (const c of Object.values(CONDITIONS)) m += c.odds * ((c.gold?.[type] ?? 1) - 1);
  return m;
}

/** L'ordre FIXE du tirage : changer cet ordre décalerait toutes les conditions déjà annoncées. */
const ORDER: ConditionId[] = ['lune_rouge', 'filon_riche', 'marchand', 'vents_calmes'];

/** Le numéro de la période qui contient `t`. */
export function conditionPeriod(t: number): number {
  return Math.floor(t / CONDITION_PERIOD_MS);
}

/**
 * La condition d'une période, ou `null` (repos). ⚠️ Fonction de (graine, île, période) et de
 * RIEN d'autre : deux appareils, deux ouvertures de l'app, la prévision des notifications et
 * la carte lisent la même réponse.
 */
export function conditionFor(seed: number, island: number, period: number): ConditionId | null {
  const mix =
    (seed ^ Math.imul(island + 1, 0x9e3779b1) ^ Math.imul(period | 0, 0x85ebca6b)) >>> 0 || 1;
  const rng = mulberry32(mix);
  rng(); // les premières sorties de graines voisines se ressemblent : on en écarte une
  let r = rng();
  for (const id of ORDER) {
    r -= CONDITIONS[id].odds;
    if (r < 0) return id;
  }
  return null;
}

/** Au plus combien de périodes de suite on regarde pour dire « jusqu'à quand ». */
const LOOKAHEAD = 8;

export interface ActiveCondition {
  def: ConditionDef;
  period: number;
  /** Début de la période où elle est tombée (ou de la première d'une série identique). */
  startsAt: number;
  /** Fin de la série : la condition ne change plus avant. */
  endsAt: number;
}

type CondMap = Pick<ExpeditionMap, 'seed' | 'archipel'>;

/** La condition ACTIVE de l'île active à l'instant `now`, ou `null`. Pur. */
export function activeCondition(
  map: CondMap | null | undefined,
  now: number,
): ActiveCondition | null {
  const island = map?.archipel?.island;
  if (!map || island === undefined) return null;
  const p = conditionPeriod(now);
  const id = conditionFor(map.seed, island, p);
  if (!id) return null;
  // La série : les périodes voisines identiques la prolongent (et la précèdent).
  let first = p;
  while (p - first < LOOKAHEAD && conditionFor(map.seed, island, first - 1) === id) first--;
  let last = p;
  while (last - p < LOOKAHEAD && conditionFor(map.seed, island, last + 1) === id) last++;
  return {
    def: CONDITIONS[id],
    period: p,
    startsAt: first * CONDITION_PERIOD_MS,
    endsAt: (last + 1) * CONDITION_PERIOD_MS,
  };
}

/** La PROCHAINE condition (≠ celle en cours), pour l'afficher sur la fiche. Pur. */
export function upcomingCondition(
  map: CondMap | null | undefined,
  now: number,
  horizonMs = 48 * 3600_000,
): { def: ConditionDef; startsAt: number } | null {
  const island = map?.archipel?.island;
  if (!map || island === undefined) return null;
  for (let p = conditionPeriod(now) + 1; p * CONDITION_PERIOD_MS <= now + horizonMs; p++) {
    const id = conditionFor(map.seed, island, p);
    if (id && id !== conditionFor(map.seed, island, p - 1))
      return { def: CONDITIONS[id], startsAt: p * CONDITION_PERIOD_MS };
  }
  return null;
}

/**
 * 🔔 La prochaine condition RARE qui COMMENCE (pas celle qui dure déjà), à annoncer par
 * notification. `id` est stable pour (île, période) : replanifier ne double rien. ⚠️ Rien
 * n'est rejoué : la condition est une fonction du temps, l'heure annoncée est celle où
 * `activeCondition` la rendra.
 */
export function nextRareCondition(
  map: CondMap | null | undefined,
  now: number,
  horizonMs = 48 * 3600_000,
): { id: string; at: number; emo: string; label: string; effect: string } | null {
  const island = map?.archipel?.island;
  if (!map || island === undefined) return null;
  for (let p = conditionPeriod(now) + 1; p * CONDITION_PERIOD_MS <= now + horizonMs; p++) {
    const id = conditionFor(map.seed, island, p);
    if (!id || !CONDITIONS[id].rare) continue;
    if (conditionFor(map.seed, island, p - 1) === id) continue; // déjà en cours : rien de neuf
    const d = CONDITIONS[id];
    return {
      id: `cond:${island}:${p}`,
      at: p * CONDITION_PERIOD_MS,
      emo: d.emo,
      label: d.label,
      effect: d.effect,
    };
  }
  return null;
}

/** Ce que la condition change, prêt à être passé aux calculs (1 = rien). */
export interface ConditionFx {
  /** Multiplicateur de l'or de récolte d'un lieu de ce type. */
  goldOf: (type: PoiType) => number;
  supplyChance: number;
  xp: number;
}

export const NO_CONDITION_FX: ConditionFx = { goldOf: () => 1, supplyChance: 1, xp: 1 };

/** Les effets de la condition active de l'île à `now` (tout à ×1 sans condition). */
export function conditionFx(map: CondMap | null | undefined, now: number): ConditionFx {
  const c = activeCondition(map, now);
  if (!c) return NO_CONDITION_FX;
  const d = c.def;
  return {
    goldOf: (type) => d.gold?.[type] ?? 1,
    supplyChance: d.supplyChance ?? 1,
    xp: d.xp ?? 1,
  };
}

/** L'XP d'un rapport d'équipe, mise à l'échelle (arrondie comme `missionXpFor`). */
export function scaleXp(xp: Record<string, number>, mult: number): Record<string, number> {
  if (mult === 1) return xp;
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(xp)) out[id] = Math.round(v * mult);
  return out;
}
