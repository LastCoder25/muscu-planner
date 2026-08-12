// buildings.ts — FILONS de production passive (pur/testable). Le joueur construit
// des bâtiments sur des emplacements autour de la ville (carte d'expédition) : ils
// PRODUISENT des ressources rares (poussière/pierres) en temps réel, financés par
// l'OR (construction + upgrades = le vrai puits d'or). Dimensionné par simulation.
//
// GARDE-FOUS (cf. mémoire filons-production-passive) :
//  - Plafonné par le SPORT : niveau d'un filon ≤ niveau du joueur → la prod passive
//    aide à ATTEINDRE son cap plus vite, jamais à le dépasser (« seul le sport rend
//    plus fort »).
//  - COMPLÉMENT, pas remplaçant : débit modeste (~1/4 du farm actif, cf. sim).
//  - Zéro culpabilité : STOCKAGE plafonné (la prod s'accumule puis sature) → louper
//    un jour ne coûte quasi rien. 100 % déterministe (timestamps, hors-ligne).
//
// EXTENSIBLE : un bâtiment = une entrée du registre `BUILDING_TYPES`. Ajouter un
// nouveau type (autre ressource, ou plus tard une autre `category`) = une entrée.
//
// NB : `Date.now()` n'est PAS utilisé ici — le `now` (ms epoch) est toujours passé
// par l'appelant → fonctions pures et testables.

// Ressource produite (union extensible : on pourra ajouter 'energy', 'gold', …).
export type BuildResource = 'dust' | 'stone';

// Catégorie d'un bâtiment (extensible : plus tard 'buff', 'utility'…). Pour l'instant
// seuls les producteurs existent.
export type BuildingCategory = 'producer';

export interface BuildingType {
  id: string; // ex. 'dust_vein'
  label: string;
  emoji: string;
  category: BuildingCategory;
  resource: BuildResource; // ce qu'il produit (producteurs)
  prodPerHrPerLvl: number; // production/heure par niveau
  buildGold: number; // coût de construction (or)
  desc: string;
}

// Un bâtiment POSÉ par le joueur sur un emplacement.
export interface Building {
  typeId: string; // → BUILDING_TYPES
  level: number; // ≤ niveau joueur
  slot: number; // index de l'emplacement (position stable sur la carte)
  collectedAt: number; // ms epoch de la dernière récolte (base de l'accumulation)
}

// ── Registre des bâtiments (le socle extensible) ──
export const BUILDING_TYPES: BuildingType[] = [
  {
    id: 'dust_vein',
    label: 'Filon de poussière',
    emoji: '⛏️',
    category: 'producer',
    resource: 'dust',
    prodPerHrPerLvl: 0.35,
    buildGold: 800,
    desc: 'Produit de la poussière d’évolution ✨ en continu.',
  },
  {
    id: 'stone_vein',
    label: 'Filon de pierre magique',
    emoji: '💎',
    category: 'producer',
    resource: 'stone',
    prodPerHrPerLvl: 0.16,
    buildGold: 800,
    desc: 'Produit des pierres magiques 💎 (montée des familiers).',
  },
];

const BY_ID = new Map(BUILDING_TYPES.map((t) => [t.id, t]));
export function buildingType(id: string): BuildingType | undefined {
  return BY_ID.get(id);
}

// ── Constantes de dimensionnement (validées par simulation) ──
export const BUILD = {
  plotCap: 6, // emplacements max
  plotEvery: 4, // +1 emplacement débloqué tous les 4 niveaux
  upBase: 220, // upgrade L→L+1 (or) = round(upBase × L^upExp)
  upExp: 2,
  storageHours: 18, // heures de production stockables (puis saturation)
  hourMs: 3_600_000,
} as const;

/** Nombre d'emplacements DÉBLOQUÉS à un niveau donné (scale avec la progression). */
export function plotsForLevel(level: number): number {
  return Math.min(BUILD.plotCap, 2 + Math.floor(Math.max(0, level) / BUILD.plotEvery));
}

/** Coût en OR pour améliorer un filon du niveau `level` au suivant (puits d'or steep). */
export function buildingUpgradeCost(level: number): number {
  return Math.round(BUILD.upBase * Math.pow(Math.max(1, level), BUILD.upExp));
}

/** Un filon peut-il être amélioré ? (plafonné au niveau du joueur). */
export function canUpgradeBuilding(b: Building, playerLevel: number): boolean {
  return b.level < playerLevel;
}

/** Production par heure d'un filon à son niveau. */
export function buildingProdPerHour(b: Building): number {
  const t = buildingType(b.typeId);
  return t ? b.level * t.prodPerHrPerLvl : 0;
}

/** Capacité de stockage (au-delà, la production sature → pas de perte punitive). */
export function buildingStorageCap(b: Building): number {
  return buildingProdPerHour(b) * BUILD.storageHours;
}

/** Ressource ACCUMULÉE depuis la dernière récolte, plafonnée au stockage (entier). */
export function buildingAccrued(b: Building, now: number): number {
  const perHr = buildingProdPerHour(b);
  const hours = Math.max(0, (now - b.collectedAt) / BUILD.hourMs);
  return Math.floor(Math.min(perHr * hours, buildingStorageCap(b)));
}

/** Somme des ressources prêtes à récolter, par ressource (pour l'affichage/le crédit). */
export function collectable(buildings: Building[], now: number): Record<BuildResource, number> {
  const acc: Record<BuildResource, number> = { dust: 0, stone: 0 };
  for (const b of buildings) {
    const t = buildingType(b.typeId);
    if (!t) continue;
    acc[t.resource] += buildingAccrued(b, now);
  }
  return acc;
}
