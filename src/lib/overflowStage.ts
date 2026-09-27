// 🕳️💥 LE DÉBORDEMENT D'UNE FAILLE — ce qu'on en garde, et ce qu'on en montre.
//
// Une faille laissée sept jours déborde (`riftOverflows`) : une partie de ses monstres reste
// EMBUSQUÉE autour d'elle pendant deux jours, l'autre MARCHE SUR LA BASE (le siège suivant
// en est renforcé), et la faille s'effondre en une MINE DE MANA. Tout ça se passait en
// silence : la faille disparaissait de la carte, et rien ne disait pourquoi.
//
// ⚠️ Ce module ne DÉCIDE rien : le débordement est déjà tranché par la carte et la base. Il
// en fait un message de la boîte 📬 (idempotent par la faille) et une distribution à
// mettre en scène.
import {
  EXPE,
  isRiftPoi,
  type ExpeditionMap,
  type ExpeditionMessage,
  type OverflowReplay,
  type Poi,
} from './expedition';
import { FACTION_LABEL } from './raid';
import { riftFoeIdentity, riftSpecOf, riftOverflowAt } from './rift';
import { RIFT_AUTOPLAY_MAX_AGE_MS } from './riftStage';

/** Combien de lieux les embusqués harcèlent : ceux qui sont à portée de la faille, sur la
 *  carte APRÈS le débordement (la faille a laissé place à sa mine, qui ne compte pas). */
export function overflowAmbushed(rift: Poi, map: ExpeditionMap): number {
  return map.pois.filter(
    (p) =>
      !isRiftPoi(p) &&
      p.type !== 'warband' &&
      p.type !== 'mana_mine' &&
      Math.hypot(p.x - rift.x, p.y - rift.y) <= EXPE.irradMax,
  ).length;
}

/**
 * Le message « une faille a déborde » pour la boîte 📬.
 *
 * ⚠️ Son id est DÉRIVÉ de la faille : rejouer la synchronisation ne peut pas le dupliquer.
 * ⚠️ Daté du DÉBORDEMENT, pas de l'instant où on le constate : une absence longue ne le
 * fait pas passer pour tout frais (le rejeu automatique ignore ce qui a plus de 3 jours).
 * ⚠️ Rien à encaisser (`claimed` absent = déjà crédité) : la mine se récolte sur la carte.
 */
export function overflowMessage(
  rift: Poi,
  map: ExpeditionMap,
  marching: boolean,
): ExpeditionMessage {
  const faction = riftSpecOf(rift).faction;
  const ambushed = overflowAmbushed(rift, map);
  const overflow: OverflowReplay = { faction, level: rift.level, ambushed, marching };
  const hunt = ambushed
    ? `${ambushed} lieu${ambushed > 1 ? 'x' : ''} alentour ${ambushed > 1 ? 'sont harcelés' : 'est harcelé'} pendant 2 jours`
    : 'des monstres rôdent autour pendant 2 jours';
  const march = marching
    ? 'le reste marche sur ta base : le prochain siège sera renforcé'
    : 'le reste se disperse dans les terres';
  return {
    id: `ovf_${rift.id}`,
    poiType: 'rift',
    title: 'Une faille a débordé',
    level: rift.level,
    win: false,
    text: `Laissée sept jours, la faille des ${FACTION_LABEL[faction].toLowerCase()} a débordé : ${hunt}, ${march}. Elle s’est effondrée en une mine de mana.`,
    gold: 0,
    energy: 0,
    key: 0,
    overflow,
    resolvedAt: riftOverflowAt(rift),
    read: false,
  };
}

/** Le débordement à rejouer tout seul : le plus récent, jamais vu, de moins de 3 jours. Même
 *  règle que les incursions (`riftAutoReplay`), mémoire « déjà vu » à part. */
export function overflowAutoReplay(
  messages: readonly ExpeditionMessage[],
  seen: ReadonlySet<string>,
  now: number,
): { play: ExpeditionMessage | null; seen: string[] } {
  const ovf = messages.filter((m) => !!m.overflow);
  let play: ExpeditionMessage | null = null;
  for (const m of ovf) {
    if (seen.has(m.id) || now - m.resolvedAt > RIFT_AUTOPLAY_MAX_AGE_MS) continue;
    if (!play || m.resolvedAt > play.resolvedAt) play = m;
  }
  return { play, seen: ovf.map((m) => m.id) };
}

/** Qui sort de la faille : ceux qui s'embusquent, et ceux qui marchent. Le roster de la
 *  faction, dans son ordre — le même que les monstres d'une incursion. */
export const OVERFLOW_AMBUSHERS = 4;
export const OVERFLOW_MARCHERS = 7;
export function overflowCast(o: OverflowReplay): {
  ambushers: { name: string; emoji: string }[];
  marchers: { name: string; emoji: string }[];
} {
  const pick = (k: number) => riftFoeIdentity(o.faction, k, false);
  return {
    ambushers: Array.from({ length: OVERFLOW_AMBUSHERS }, (_, k) => pick(k)),
    marchers: Array.from({ length: OVERFLOW_MARCHERS }, (_, k) =>
      k === OVERFLOW_MARCHERS - 1
        ? riftFoeIdentity(o.faction, k, true)
        : pick(k + OVERFLOW_AMBUSHERS),
    ),
  };
}
