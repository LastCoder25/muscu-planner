/**
 * 🔙⚔️🧭 FAIRE DEMI-TOUR À UNE ATTAQUE COMBINÉE (2026-10-06, demandé : « on doit pouvoir
 * faire faire demi-tour à une attaque combinée ; ça renvoie toutes les troupes de l'attaque
 * chez elles »). Toute l'attaque rebrousse chemin d'un geste : rappeler un seul groupe
 * changerait l'issue commune tirée au départ, donc on ne le permet pas (`recallBlocker`).
 *
 * Deux moments, deux formes :
 * - **en préparation** (`CombinedAttack`, au moins un groupe attend son départ) : un groupe
 *   qui attend n'a jamais quitté sa base ou son point — sa réservation est levée, rien
 *   d'autre ; un groupe déjà parti revient chez lui en autant de temps qu'il a marché ;
 * - **lancée** (tous partis : voyages liés par `crew`, même graine et même arrivée) : chaque
 *   voyage fait demi-tour (`recallVoyage`, `group: true`).
 * Comme tout demi-tour : rien n'est gagné ni perdu, aucun rapport. Un groupe parti d'un point
 * y reprend son poste à son retour (`homeId`, `sortiesHome`), les autres rentrent en ville.
 */
import type { CombinedAttack } from './combinedAttack';
import type { ActiveExpedition, ExpeditionOutcome, Poi } from './expedition';
import { recallBlocker, recallVoyage, type ActiveParty, type RecallBlock } from './party';
import { combinedSiblings } from './speedBoost';

/** Les voyages d'une attaque LANCÉE, chacun avec son demi-tour — ou la raison d'un refus.
 *  `all` = le voyage du héros et les équipes (les MÊMES objets que ceux qu'on remplacera). */
export function recallCombinedGroup<T extends ActiveExpedition>(
  v: T,
  all: readonly T[],
  now: number,
): [T, T][] | RecallBlock {
  const group = [v, ...combinedSiblings(v, all)];
  for (const g of group) {
    const b = recallBlocker(g, now, { group: true });
    if (b) return b;
  }
  return group.map((g) => [g, recallVoyage(g, now, { group: true })!]);
}

export interface AttackRecall {
  /** Groupes partis sans le héros, sur le chemin du retour. */
  trips: ActiveParty[];
  /** Le groupe du héros, s'il était parti : il redevient le voyage du héros. */
  heroTrip: ActiveExpedition | null;
  /** Réservations à lever (groupes qui attendaient) : `busyUntil === from`. */
  release: { ids: string[]; from: number }[];
  /** Retours à recaler (groupes partis) : `busyUntil` de `from` à `to`. */
  moved: { ids: string[]; from: number; to: number }[];
  /** Personne n'était encore parti : les consommables reviennent (comme une annulation). */
  refund: boolean;
}

/** L'issue vide d'un groupe qui n'a rien tenté (il ne dépose aucun rapport). */
function idleOutcome(poi: Poi, escort: string[], hero: boolean): ExpeditionOutcome {
  return {
    win: false,
    gold: 0,
    energy: 0,
    summonStones: 0,
    mana: 0,
    item: null,
    key: 0,
    reconBonus: 0,
    returnMult: 1,
    text: 'Demi-tour avant d’arriver.',
    party: {
      hero,
      faction: poi.faction ?? 'bandits',
      escort,
      win: false,
      foes: 0,
      slain: 0,
      kills: {},
      heroKills: 0,
      xp: {},
      hurt: [],
      journal: [],
    },
  };
}

/** Le demi-tour d'une attaque EN PRÉPARATION, ou `'arrived'` si le rendez-vous est passé. */
export function recallAttack(
  a: CombinedAttack,
  map: { pois: readonly Poi[] } | null | undefined,
  now: number,
): AttackRecall | 'arrived' {
  if (now >= a.arriveAt) return 'arrived';
  const out: AttackRecall = { trips: [], heroTrip: null, release: [], moved: [], refund: true };
  for (const w of a.wings) {
    if (w.state === 'dropped') continue;
    if (w.state === 'waiting') {
      if (w.members.length) out.release.push({ ids: [...w.members], from: w.returnAt });
      continue;
    }
    out.refund = false;
    const crew = w.gone ?? [];
    const hero = !!w.heroGone;
    const home = w.originId ? map?.pois.find((p) => p.id === w.originId) : undefined;
    const leg: ActiveExpedition = {
      poi: a.poi,
      sentAt: w.departAt,
      midAt: a.midAt,
      returnAt: w.returnAt,
      ...(a.midAt > a.arriveAt ? { dwellMs: a.midAt - a.arriveAt } : {}),
      goldCost: 0,
      seed: a.seed,
      outcome: idleOutcome(a.poi, crew, hero),
      ...(home ? { origin: { x: home.x, y: home.y }, homeId: home.id } : {}),
      crew,
    };
    const back = recallVoyage(leg, now, { group: true });
    if (!back) return 'arrived';
    if (crew.length) out.moved.push({ ids: crew, from: w.returnAt, to: back.returnAt });
    if (hero) out.heroTrip = back;
    else out.trips.push({ ...back, id: `party_${a.id}_${w.originId ?? 'base'}` });
  }
  return out;
}
