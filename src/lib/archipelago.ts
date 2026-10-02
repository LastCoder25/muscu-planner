/**
 * 🏝️ L'ARCHIPEL — la carte de conquête découpée en cinq îles (roadmap
 * `docs/superpowers/plans/2026-10-01-carte-archipel-roadmap.md`, conçue avec l'utilisateur).
 *
 * ⚠️ ÉTAPE 1 : le MODE ARCHIPEL, île 1 seule, derrière un interrupteur ADMIN. Une carte en
 * mode archipel porte `ExpeditionMap.archipel` ; sans lui, tout reste exactement comme avant.
 * Ce que le mode change, et seulement ça :
 * - les lieux sont **plafonnés au rang max de l'île** (île 1 : Argent, niveau 20) ;
 * - les **trajets n'ont plus de multiplicateur de niveau** (le temps ne dépend que de la distance) ;
 * - la **taille de la carte est celle de l'île** (≈ 54 unités, 2 h d'aller) : l'Avant-poste ne
 *   règle plus que la VITESSE ;
 * - les lieux tenus produisent **au rang de l'île**, plus au niveau du héros.
 */
import { revealRadius, type ExpeditionMap } from './expedition';

export interface Island {
  /** 1 à 5. */
  id: number;
  name: string;
  emoji: string;
  /** La menace propre à l'île (objectifs secondaires, étape 2 et suivantes). */
  threat: string;
  /** La forteresse portuaire qui ouvre la traversée. */
  fortress: string;
  /** Tranche de niveaux couverte : les lieux ne dépassent jamais `maxLevel`. */
  minLevel: number;
  maxLevel: number;
}

/** Les cinq îles : une par tranche de 20 niveaux, deux rangs chacune. */
export const ISLANDS: readonly Island[] = [
  {
    id: 1,
    name: 'Île des Brigands',
    emoji: '🗡️',
    threat: 'Camps de brigands',
    fortress: 'Le Fort des pillards',
    minLevel: 1,
    maxLevel: 20,
  },
  {
    id: 2,
    name: 'Île des Bêtes',
    emoji: '🐺',
    threat: 'Nids qui se multiplient',
    fortress: 'La Tanière-port',
    minLevel: 21,
    maxLevel: 40,
  },
  {
    id: 3,
    name: 'Île des Morts',
    emoji: '💀',
    threat: 'Cimetières et citadelle',
    fortress: 'Le Bastion des marées',
    minLevel: 41,
    maxLevel: 60,
  },
  {
    id: 4,
    name: 'Île du Seigneur de guerre',
    emoji: '⚔️',
    threat: 'Camps de guerre, armée mobile',
    fortress: 'Le Fort du seigneur',
    minLevel: 61,
    maxLevel: 80,
  },
  {
    id: 5,
    name: 'Île Maudite',
    emoji: '🌑',
    threat: 'Sanctuaires maudits',
    fortress: 'La Citadelle maudite',
    minLevel: 81,
    maxLevel: 100,
  },
];

/** 🏝️ Rayon d'une île : 2 h d'aller au plus depuis le port (trajet sans facteur de niveau,
 *  mesuré à l'étape 0 : 30 min à 25 unités, 1 h à 35, 2 h à 54). */
export const ISLAND_REACH = 54;

/** L'île d'un id, ou `null`. */
export function islandById(id: number): Island | null {
  return ISLANDS.find((i) => i.id === id) ?? null;
}

/** L'île active d'une carte, ou `null` hors du mode archipel. */
export function activeIsland(
  map: Pick<ExpeditionMap, 'archipel'> | null | undefined,
): Island | null {
  return map?.archipel ? islandById(map.archipel.island) : null;
}

/** L'état archipel d'une carte posée sur l'île `id`. */
export function archipelOn(id = 1): NonNullable<ExpeditionMap['archipel']> {
  const isl = islandById(id) ?? ISLANDS[0]!;
  return { island: isl.id, levelCap: isl.maxLevel };
}

/**
 * Le niveau du joueur VU PAR LA CARTE : plafonné au rang max de l'île en mode archipel.
 * ⚠️ SOURCE UNIQUE : tirage des lieux, points de contrôle et production des lieux tenus le
 * lisent tous — sinon un lieu tenu produirait au niveau du héros sur une île de niveau 20.
 */
export function mapPlayerLevel(
  map: Pick<ExpeditionMap, 'archipel'> | null | undefined,
  playerLevel: number,
): number {
  const cap = map?.archipel?.levelCap;
  return cap ? Math.min(cap, playerLevel) : playerLevel;
}

/** Le niveau d'Avant-poste dont le disque révélé tient dans une île : le PLUS GRAND dont le
 *  rayon ne dépasse pas `ISLAND_REACH`. ⚠️ Pas le plus petit qui le dépasse : la première
 *  citadelle est posée à 55 unités, et elle appartient à l'île 3. */
export const ISLAND_OUTPOST_LEVEL = (() => {
  let best = 1;
  for (let L = 1; L <= 100; L++) if (revealRadius(L) <= ISLAND_REACH) best = L;
  return best;
})();

/**
 * Le niveau d'Avant-poste qui fixe la TAILLE de la carte (rayon révélé, nombre de lieux).
 * En mode archipel c'est celui de l'île : l'Avant-poste ne règle plus que la vitesse
 * (`travelTimeMult`, qui lit toujours le vrai niveau du bâtiment).
 */
export function mapOutpostLevel(
  map: Pick<ExpeditionMap, 'archipel'> | null | undefined,
  outpostLevel: number,
): number {
  return map?.archipel ? ISLAND_OUTPOST_LEVEL : outpostLevel;
}
