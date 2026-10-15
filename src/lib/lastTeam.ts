/**
 * ↻ « Même équipe que la dernière fois » — pur, sans accès au stockage.
 *
 * La dernière équipe ENVOYÉE (champions, héros, consommables) est mémorisée par appareil ;
 * au lieu de tout recocher, on la repose sur le lieu ouvert en ne gardant que ce que les règles
 * d'envoi EXISTANTES autorisent encore : le vivier disponible (`partyPool`), le plafond du lieu
 * (`partyMax`), la disponibilité du héros et le stock de consommables. Aucune règle d'envoi n'est
 * réécrite ici : l'appelant fournit ce qu'il sait déjà, le store refuse de toute façon l'excédent.
 *
 * Mémoire GLOBALE (pas par type de lieu) : le geste visé est « renvoie mes mêmes gars », et une
 * mémoire par type serait presque toujours vide au premier lieu d'un type rencontré — on perdrait
 * le confort là où il sert le plus. Les consommables inutiles ici sont déjà écartés par l'écran.
 */
import { SUPPLY_IDS, type SupplyId } from '@/lib/supplies';

export interface LastTeam {
  advs: string[];
  hero: boolean;
  supplies: SupplyId[];
}

/** Pourquoi des champions n'ont pas été repris. */
export interface LastTeamDropped {
  /** Ids qui n'existent plus dans le vivier. */
  gone: number;
  /** Existent, mais ne peuvent pas partir maintenant (en voyage, blessés, postés…). */
  unavailable: number;
  /** Disponibles, mais au-delà du plafond du lieu. */
  overCap: number;
  /** Le héros faisait partie de l'équipe mais ne peut pas se joindre. */
  hero: boolean;
}

export interface RestoredTeam {
  advs: string[];
  hero: boolean;
  supplies: SupplyId[];
  dropped: LastTeamDropped;
}

/** Relit défensivement la mémoire (JSON écrit par une version précédente, ou corrompu). */
export function parseLastTeam(raw: unknown): LastTeam | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object' || !Array.isArray(o.advs)) return null;
    const advs = [...new Set(o.advs.filter((x): x is string => typeof x === 'string'))];
    const known = new Set<string>(SUPPLY_IDS);
    const supplies = Array.isArray(o.supplies)
      ? (o.supplies.filter((x) => typeof x === 'string' && known.has(x)) as SupplyId[])
      : [];
    if (!advs.length && o.hero !== true) return null;
    return { advs, hero: o.hero === true, supplies };
  } catch {
    return null;
  }
}

export function serializeLastTeam(t: LastTeam): string {
  return JSON.stringify({ advs: t.advs, hero: t.hero, supplies: t.supplies });
}

/**
 * Repose la dernière équipe sur la situation d'aujourd'hui.
 * - `allIds` : tous les ids du vivier (pour distinguer « disparu » de « indisponible »)
 * - `poolIds` : ids qui peuvent partir MAINTENANT
 * - `max` : plafond de champions pour ce lieu (peut valoir Infinity)
 * - `heroOk` : le héros peut-il se joindre ?
 * - `stock` : consommables possédés (quantité)
 */
export function restoreLastTeam(
  last: LastTeam,
  ctx: {
    allIds: readonly string[];
    poolIds: readonly string[];
    max: number;
    heroOk: boolean;
    stock: Partial<Record<SupplyId, number>>;
  },
): RestoredTeam {
  const all = new Set(ctx.allIds);
  const pool = new Set(ctx.poolIds);
  const dropped: LastTeamDropped = { gone: 0, unavailable: 0, overCap: 0, hero: false };
  const advs: string[] = [];
  const cap = Math.max(0, ctx.max);
  for (const id of last.advs) {
    if (!all.has(id)) dropped.gone += 1;
    else if (!pool.has(id)) dropped.unavailable += 1;
    else if (advs.length >= cap) dropped.overCap += 1;
    else advs.push(id);
  }
  const hero = last.hero && ctx.heroOk;
  if (last.hero && !ctx.heroOk) dropped.hero = true;
  const supplies = last.supplies.filter((id) => (ctx.stock[id] ?? 0) > 0);
  return { advs, hero, supplies, dropped };
}

/** Phrase courte pour l'écran, vide si tout a été repris. */
export function droppedLabel(d: LastTeamDropped): string {
  const parts: string[] = [];
  if (d.hero) parts.push('le héros est indisponible');
  if (d.unavailable) parts.push(`${d.unavailable} indisponible${d.unavailable > 1 ? 's' : ''}`);
  if (d.gone) parts.push(`${d.gone} parti${d.gone > 1 ? 's' : ''} du vivier`);
  if (d.overCap) parts.push(`${d.overCap} au-delà du plafond`);
  return parts.join(' · ');
}
