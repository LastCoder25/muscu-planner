import { isIslandTargetId } from './islandConquest';
import type { ExpeditionMap, Poi } from './expedition';

/**
 * ✨ L'APPARITION D'UN OBJECTIF ENNEMI SUR LA CARTE (2026-10-07, demandé : « une animation pour
 * les apparitions des objectifs ennemis — les nids de l'île 2 mais pas seulement — selon
 * l'objectif et selon les îles »).
 *
 * Ce module ne dessine rien : il dit QUOI animer et OÙ. Les objectifs apparaissent souvent
 * l'app fermée (un nid naît à l'arrivée d'une sortie, un cimetière se relève au bout de 3 jours,
 * la brèche se rouvre…) : on anime donc ce qui est NOUVEAU depuis la dernière fois que CET
 * appareil a vu la carte de CETTE île, pas l'instant exact de l'apparition.
 *
 * Une apparition se reconnaît à `id@spawnedAt` : un cimetière abattu qui se relève garde son id
 * mais renaît avec une nouvelle date — c'est une nouvelle apparition.
 */
export type AppearVariant =
  | 'camp'
  | 'nest'
  | 'grave'
  | 'warcamp'
  | 'shrine'
  | 'breach'
  | 'citadel'
  | 'fortress'
  | 'generic';

/** La variante se lit sur l'emblème que l'objectif porte (`ControlState.emoji`) : chaque île
 *  a le sien (archipelago.ts, `objectiveEmoji`), la citadelle des morts, la brèche maudite et
 *  les forteresses aussi. */
const BY_EMOJI: Record<string, AppearVariant> = {
  '⛺': 'camp',
  '🪺': 'nest',
  '🪦': 'grave',
  '🚩': 'warcamp',
  '🔮': 'shrine',
  '🌀': 'breach',
  '🏯': 'citadel',
  '🏰': 'fortress',
};

/** Le titre court annoncé avec l'animation (bandeau discret). */
export const APPEAR_LABEL: Record<AppearVariant, string> = {
  camp: 'Un camp de brigands se dresse',
  nest: 'Un nid est apparu',
  grave: 'Un cimetière se relève',
  warcamp: 'Un camp de guerre est planté',
  shrine: 'Un sanctuaire maudit s’éveille',
  breach: 'La brèche maudite se rouvre',
  citadel: 'La citadelle des morts se dresse',
  fortress: 'La forteresse se dresse',
  generic: 'Un objectif ennemi apparaît',
};

export function appearVariant(p: Pick<Poi, 'control'>): AppearVariant {
  return BY_EMOJI[p.control?.emoji ?? ''] ?? 'generic';
}

/** La clé d'une apparition : l'objectif ET sa date de naissance. */
export const appearKey = (p: Pick<Poi, 'id' | 'spawnedAt'>): string => `${p.id}@${p.spawnedAt}`;

/** Les objectifs ennemis de l'île sur la carte (objectifs, nids, citadelle, brèche, forteresse). */
export function enemyIslandTargets(map: Pick<ExpeditionMap, 'pois'>): Poi[] {
  return map.pois.filter((p) => p.control?.owner === 'enemy' && isIslandTargetId(p.id));
}

export interface Appearance {
  key: string;
  id: string;
  x: number;
  y: number;
  variant: AppearVariant;
  /** Décalage de départ (ms) : plusieurs apparitions se suivent au lieu de partir ensemble. */
  delay: number;
}

/** L'écart entre deux apparitions animées à la suite. */
export const APPEAR_STAGGER_MS = 450;
/** La durée d'une animation (le composant s'efface ensuite). */
export const APPEAR_MS = 2600;

/**
 * Ce qu'il faut animer, et ce que l'appareil retient d'avoir vu.
 * - `seen === null` (aucun relevé pour cette île sur l'appareil) : si `firstTime`, tout ce qui
 *   est là apparaît (on débarque sur l'île) ; sinon on retient sans rien animer (première
 *   lecture après la mise à jour — pas une avalanche d'animations pour des objectifs anciens).
 * - sinon : les objectifs dont la clé n'a jamais été vue.
 * `seen` rendu ne garde que ce qui est encore sur la carte (le relevé ne grossit pas sans fin).
 */
export function freshAppearances(
  map: Pick<ExpeditionMap, 'pois'>,
  seen: readonly string[] | null,
  firstTime: boolean,
): { fresh: Appearance[]; seen: string[] } {
  const targets = enemyIslandTargets(map);
  const keys = targets.map(appearKey);
  const known = new Set(seen ?? []);
  const show = seen === null ? (firstTime ? targets : []) : targets.filter((p) => !known.has(appearKey(p)));
  return {
    fresh: show.map((p, i) => ({
      key: appearKey(p),
      id: p.id,
      x: p.x,
      y: p.y,
      variant: appearVariant(p),
      delay: i * APPEAR_STAGGER_MS,
    })),
    seen: keys,
  };
}

/** Ce que l'appareil a vu, île par île (localStorage). */
export type AppearRecord = Record<string, string[]>;

/** Le relevé de l'île `island` : aucun relevé du tout → lecture silencieuse (première ouverture
 *  après la mise à jour) ; un relevé sans cette île → on vient d'y débarquer, tout apparaît. */
export function appearInput(
  rec: AppearRecord | null,
  island: number,
): { seen: string[] | null; firstTime: boolean } {
  if (!rec) return { seen: null, firstTime: false };
  const seen = rec[String(island)];
  return Array.isArray(seen) ? { seen, firstTime: false } : { seen: null, firstTime: true };
}
