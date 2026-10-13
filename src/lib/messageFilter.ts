/**
 * 📬 Les FILTRES de la boîte à messages (demandé par l'utilisateur, 2026-10-04 : « filtrer les
 * rapports de lieux, ceux d'attaques ennemies, ceux d'objectifs, ceux de failles, ceux de
 * cadeaux de l'app » ; affiné le 2026-10-13 : « séparer les récoltes de lieux fixes, les attaques
 * ennemies, les attaques de lieux, les cadeaux »).
 *
 * ⚠️ La catégorie se DÉDUIT du message, elle n'est pas stockée : la boîte porte déjà des
 * rapports écrits par une douzaine de chemins (expéditions, groupes, reprises de lieux fixes,
 * pillages, coffres…) et ceux d'avant n'auraient pas de champ. Une seule fonction décide, l'écran
 * ne fait que peindre ; un message qu'aucune règle ne reconnaît va dans « Autres » — jamais nulle
 * part, sinon il disparaîtrait de tous les filtres.
 *
 * ⚠️ L'ancien filtre « Lieux » MÉLANGEAIT trois choses (la production d'un lieu tenu, nos
 * expéditions, nos prises de lieux fixes) : il est découpé en 🌾 Récoltes / ⚔️ Nos assauts /
 * 🧭 Expéditions, et « Objectifs » (abattre une cible d'île, une citadelle) rejoint les assauts.
 */
import { isClaimable, type ExpeditionMessage } from './expedition';
import { isProductionMessage } from './missionCard';

export type MessageCategory = 'harvest' | 'assault' | 'trip' | 'enemy' | 'rift' | 'gift' | 'other';

/** Le filtre choisi : une catégorie, ou 🎁 « À prendre » (tout ce qui a un butin à encaisser,
 *  quelle que soit son origine — c'est ce qu'on vient chercher le plus souvent). */
export type InboxFilter = MessageCategory | 'claim';

/** L'ordre d'affichage des filtres, et leur libellé. */
const MESSAGE_CATEGORIES: readonly { id: MessageCategory; emoji: string; label: string }[] = [
  { id: 'harvest', emoji: '🌾', label: 'Récoltes' },
  { id: 'enemy', emoji: '🛡️', label: 'Ennemis' },
  { id: 'assault', emoji: '⚔️', label: 'Assauts' },
  { id: 'trip', emoji: '🧭', label: 'Expéditions' },
  { id: 'rift', emoji: '🕳️', label: 'Failles' },
  { id: 'gift', emoji: '🎁', label: 'Cadeaux' },
  { id: 'other', emoji: '📜', label: 'Autres' },
];

const RIFT_POIS = new Set(['rift', 'mana_mine', 'warband']);

export function messageCategory(m: ExpeditionMessage): MessageCategory {
  // 🎁 Coffres (Défi 360, boss entre amis, débarquement, forteresse, bascule…) : on les ouvre.
  if (m.chest) return 'gift';
  // 🌾 Ce que produit un lieu fixe qu'on tient (or, runes, consommables, XP du camp).
  if (isProductionMessage(m)) return 'harvest';
  // 🛡️ Ce que l'ENNEMI fait chez nous : reprise d'un lieu tenu (rapport `ctl_…`, ou défense
  // d'un groupe), pillage de la base, et le choc contre une armée en campagne (siège, reprise).
  if (m.id.startsWith('ctl_') || m.id.startsWith('pill_') || m.party?.defense) return 'enemy';
  if (m.party?.fieldHit) return 'enemy';
  // 🕳️ Débordement, incursion, interception d'une bande de faille, mine résiduelle.
  if (m.overflow || m.party?.rift || m.party?.riftHit) return 'rift';
  if (m.poiType && RIFT_POIS.has(m.poiType)) return 'rift';
  // ⚔️ Ce qu'on ATTAQUE pour le prendre ou l'abattre : lieux fixes, objectifs d'île,
  // forteresse, citadelles.
  if (m.party?.controlId || m.poiType === 'control') return 'assault';
  // 🧭 Tout le reste de la carte : expéditions du héros, camps, récoltes, ruines, arène, et les
  // renforts programmés.
  if (m.poiType || m.id.startsWith('planned_')) return 'trip';
  return 'other';
}

/** Les filtres à montrer : seulement les catégories présentes (un filtre vide n'apprend rien). */
export function categoryCounts(
  list: readonly ExpeditionMessage[],
): { id: MessageCategory; emoji: string; label: string; n: number }[] {
  const n = new Map<MessageCategory, number>();
  for (const m of list) {
    const c = messageCategory(m);
    n.set(c, (n.get(c) ?? 0) + 1);
  }
  return MESSAGE_CATEGORIES.filter((c) => n.has(c.id)).map((c) => ({ ...c, n: n.get(c.id)! }));
}

/** Combien de messages ont un butin à prendre maintenant. */
export function claimableCount(list: readonly ExpeditionMessage[], now: number): number {
  return list.filter((m) => isClaimable(m, now)).length;
}

function matches(m: ExpeditionMessage, f: InboxFilter, now: number): boolean {
  return f === 'claim' ? isClaimable(m, now) : messageCategory(m) === f;
}

/** Le filtre réellement appliqué : un filtre qui ne correspond plus à rien (le dernier rapport de
 *  sa catégorie a quitté la boîte, ou le dernier butin a été pris) retombe sur « tout » — sinon
 *  la boîte paraîtrait vide alors que la puce de ce filtre a disparu. */
export function effectiveCategory(
  list: readonly ExpeditionMessage[],
  f: InboxFilter | null,
  now: number,
): InboxFilter | null {
  return f && list.some((m) => matches(m, f, now)) ? f : null;
}

/** La boîte filtrée (`null` = tout). */
export function filterMessages(
  list: readonly ExpeditionMessage[],
  f: InboxFilter | null,
  now: number,
): readonly ExpeditionMessage[] {
  const c = effectiveCategory(list, f, now);
  return c ? list.filter((m) => matches(m, c, now)) : list;
}
