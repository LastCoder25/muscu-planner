/**
 * 📬 Les FILTRES de la boîte à messages (demandé par l'utilisateur, 2026-10-04 : « filtrer les
 * rapports de lieux, ceux d'attaques ennemies, ceux d'objectifs, ceux de failles, ceux de
 * cadeaux de l'app »).
 *
 * ⚠️ La catégorie se DÉDUIT du message, elle n'est pas stockée : la boîte porte déjà des
 * rapports écrits par une douzaine de chemins (expéditions, groupes, reprises de lieux fixes,
 * pillages, coffres…) et ceux d'avant n'auraient pas de champ. Une seule fonction décide, l'écran
 * ne fait que peindre ; un message qu'aucune règle ne reconnaît va dans « Autres » — jamais nulle
 * part, sinon il disparaîtrait de tous les filtres.
 */
import type { ExpeditionMessage } from './expedition';
import { isIslandTargetId } from './islandConquest';

export type MessageCategory = 'place' | 'attack' | 'objective' | 'rift' | 'gift' | 'other';

/** L'ordre d'affichage des filtres, et leur libellé. */
export const MESSAGE_CATEGORIES: readonly { id: MessageCategory; emoji: string; label: string }[] =
  [
    { id: 'place', emoji: '🗺️', label: 'Lieux' },
    { id: 'attack', emoji: '⚔️', label: 'Attaques' },
    { id: 'objective', emoji: '🎯', label: 'Objectifs' },
    { id: 'rift', emoji: '🕳️', label: 'Failles' },
    { id: 'gift', emoji: '🎁', label: 'Cadeaux' },
    { id: 'other', emoji: '📜', label: 'Autres' },
  ];

const RIFT_POIS = new Set(['rift', 'mana_mine']);

export function messageCategory(m: ExpeditionMessage): MessageCategory {
  // 🎁 Coffres (Défi 360, boss entre amis, débarquement, forteresse, bascule…) : on les ouvre.
  if (m.chest) return 'gift';
  // ⚔️ Ce que l'ENNEMI fait chez nous : reprise d'un lieu tenu (rapport `ctl_…`, ou défense
  // d'un groupe), pillage de la base, et le choc contre une armée en campagne (siège, reprise).
  if (m.id.startsWith('ctl_') || m.id.startsWith('pill_') || m.party?.defense) return 'attack';
  if (m.party?.fieldHit) return 'attack';
  // 🕳️ Débordement, incursion, interception d'une bande de faille, mine résiduelle.
  if (m.overflow || m.party?.rift || m.party?.riftHit) return 'rift';
  if (m.poiType && (RIFT_POIS.has(m.poiType) || m.poiType === 'warband')) return 'rift';
  // 🎯 Ce qu'on ABAT : objectifs d'île, forteresse, brèche maudite, citadelles.
  const target = m.party?.controlId;
  if (target && (isIslandTargetId(target) || target.startsWith('ctl_citadel_'))) return 'objective';
  // 🗺️ Tout ce qui vient d'un lieu de la carte : expéditions, groupes, production des lieux fixes.
  if (m.poiType || m.id.startsWith('ctlloot_') || m.id.startsWith('ctlgold_')) return 'place';
  if (m.id.startsWith('planned_')) return 'place';
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

/** Le filtre réellement appliqué : un filtre qui ne correspond plus à rien (le dernier rapport de
 *  sa catégorie a quitté la boîte) retombe sur « tout » — sinon la boîte paraîtrait vide alors
 *  que la puce de ce filtre a disparu. */
export function effectiveCategory(
  list: readonly ExpeditionMessage[],
  cat: MessageCategory | null,
): MessageCategory | null {
  return cat && list.some((m) => messageCategory(m) === cat) ? cat : null;
}

/** La boîte filtrée (`null` = tout). */
export function filterMessages(
  list: readonly ExpeditionMessage[],
  cat: MessageCategory | null,
): readonly ExpeditionMessage[] {
  const c = effectiveCategory(list, cat);
  return c ? list.filter((m) => messageCategory(m) === c) : list;
}
