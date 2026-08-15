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

// Catégorie d'un bâtiment. `producer` = filon de ressource ; `utility` = bâtiment
// à EFFET global (entrepôt, tour de reconnaissance…). Extensible.
export type BuildingCategory = 'producer' | 'utility';

// Effet global d'un bâtiment `utility` (par niveau). Extensible (tour, forge…).
export interface BuildingEffect {
  storageMultPerLvl?: number; // Entrepôt : +X au multiplicateur de stockage / niveau
  expeSpeedPerLvl?: number; // Tour : −X% temps de trajet / niveau (plus tard)
  expeWinPerLvl?: number; // Tour : +X% chance / niveau (plus tard)
}

export interface BuildingType {
  id: string; // ex. 'dust_vein'
  label: string;
  emoji: string;
  category: BuildingCategory;
  resource?: BuildResource; // ce qu'il produit (producteurs uniquement)
  prodPerHrPerLvl?: number; // production/heure par niveau (producteurs)
  effect?: BuildingEffect; // effet global (utility)
  buildGold: number; // coût de construction (or)
  unlockLevel?: number; // niveau joueur requis pour pouvoir le construire (défaut 1)
  unique?: boolean; // un seul exemplaire autorisé (utilitaires)
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
  // Utilitaire UNIQUE : l'AVANT-POSTE débloque les expéditions (idle) et chaque
  // niveau réduit les temps de trajet → on revient chercher le butin plus vite.
  // Extensible (socle des futurs déblocages d'activités via bâtiment).
  {
    id: 'outpost',
    label: 'Avant-poste d’expédition',
    emoji: '🧭',
    category: 'utility',
    // −1,5 % de trajet / niveau : le plafond (−60 %) n'est atteint qu'au niveau 40 de
    // l'avant-poste → montée étalée sur toute la partie (le jeu va jusqu'au niv.100),
    // pas un max dès le niveau 10 comme avant (6 %/niv). Niv.13 ≈ −20 %.
    effect: { expeSpeedPerLvl: 0.015 },
    buildGold: 400, // 1er niveau bon marché : c'est le déblocage
    unique: true,
    desc: 'Débloque les expéditions. Chaque niveau réduit les temps de trajet (−1,5 %).',
  },
  // Utilitaire UNIQUE : augmente le STOCKAGE de tous les filons (tu peux louper
  // plus de jours sans saturer). Débloqué niv.7 (offset des boss). +15 %/niveau.
  {
    id: 'warehouse',
    label: 'Entrepôt',
    emoji: '🏬',
    category: 'utility',
    effect: { storageMultPerLvl: 0.15 },
    buildGold: 1500,
    unlockLevel: 7,
    unique: true,
    desc: 'Augmente le stockage de tous tes filons (+15 %/niveau).',
  },
];

const BY_ID = new Map(BUILDING_TYPES.map((t) => [t.id, t]));
export function buildingType(id: string): BuildingType | undefined {
  return BY_ID.get(id);
}

// ── Constantes de dimensionnement (validées par simulation) ──
export const BUILD = {
  plotCap: 10, // emplacements max (le jeu va bien au-delà du niv.25 → cap élevé)
  plotEvery: 4, // +1 emplacement débloqué tous les 4 niveaux (atteint le cap ~niv.32)
  upBase: 220, // upgrade L→L+1 (or) = round(upBase × L^upExp)
  upExp: 2,
  storageHours: 18, // heures de production stockables (puis saturation)
  hourMs: 3_600_000,
} as const;

/** Nombre d'emplacements DÉBLOQUÉS à un niveau donné.
 *  DÉBUT : 1 emplacement, puis **+1 par niveau** jusqu'à 4 (une récompense à chaque
 *  niveau, le temps de prendre ses marques). ENSUITE : +1 tous les `plotEvery`
 *  niveaux (cadence douce). Continue au-delà du niv.25 (le village grandit). */
export function plotsForLevel(level: number): number {
  const l = Math.max(1, level);
  const n = l <= 4 ? l : 4 + Math.floor((l - 4) / BUILD.plotEvery);
  return Math.min(BUILD.plotCap, n);
}

/** Niveau auquel l'emplacement d'index `slot` (0-based) se débloque (inverse de
 *  plotsForLevel). Sert à afficher « débloqué au niv X » sur un emplacement verrouillé. */
export function slotUnlockLevel(slot: number): number {
  return slot < 4 ? slot + 1 : 4 + (slot - 3) * BUILD.plotEvery;
}

/** Niveau requis pour pouvoir construire ce type (défaut 1). */
export function buildingUnlockLevel(typeId: string): number {
  return buildingType(typeId)?.unlockLevel ?? 1;
}

/** Peut-on construire ce type ? (niveau atteint + pas déjà posé si `unique`). */
export function canBuildType(typeId: string, playerLevel: number, existing: Building[]): boolean {
  const t = buildingType(typeId);
  if (!t || playerLevel < (t.unlockLevel ?? 1)) return false;
  if (t.unique && existing.some((b) => b.typeId === typeId)) return false;
  return true;
}

/** Multiplicateur de stockage global apporté par les entrepôts posés (≥ 1). */
export function storageMult(buildings: Building[]): number {
  let m = 1;
  for (const b of buildings) {
    const per = buildingType(b.typeId)?.effect?.storageMultPerLvl;
    if (per) m += per * b.level;
  }
  return m;
}

// ── Avant-poste d'expédition (gate + vitesse de trajet) ──
const OUTPOST_ID = 'outpost';
const TRAVEL_REDUCTION_CAP = 0.6; // −60 % de trajet au maximum (jamais instantané)

/** Niveau de l'avant-poste posé (0 si aucun). */
export function outpostLevel(buildings: Building[]): number {
  return buildings.find((b) => b.typeId === OUTPOST_ID)?.level ?? 0;
}
/** Les expéditions sont-elles débloquées ? (avant-poste construit). */
export function expeditionsUnlocked(buildings: Building[]): boolean {
  return outpostLevel(buildings) > 0;
}
/** Multiplicateur de TEMPS de trajet (< 1 = plus rapide), selon l'avant-poste. */
export function travelTimeMult(buildings: Building[]): number {
  const lvl = outpostLevel(buildings);
  const per = buildingType(OUTPOST_ID)?.effect?.expeSpeedPerLvl ?? 0;
  return 1 - Math.min(TRAVEL_REDUCTION_CAP, lvl * per);
}

/** Coût en OR pour améliorer un filon du niveau `level` au suivant (puits d'or steep). */
export function buildingUpgradeCost(level: number): number {
  return Math.round(BUILD.upBase * Math.pow(Math.max(1, level), BUILD.upExp));
}

/** Un filon peut-il être amélioré ? (plafonné au niveau du joueur). */
export function canUpgradeBuilding(b: Building, playerLevel: number): boolean {
  return b.level < playerLevel;
}

/** Production par heure d'un filon à son niveau (0 pour les utilitaires). */
export function buildingProdPerHour(b: Building): number {
  const t = buildingType(b.typeId);
  return t?.prodPerHrPerLvl ? b.level * t.prodPerHrPerLvl : 0;
}

/** Capacité de stockage (au-delà, la production sature → pas de perte punitive).
 *  `mult` = bonus global des entrepôts (cf. storageMult). */
export function buildingStorageCap(b: Building, mult = 1): number {
  return buildingProdPerHour(b) * BUILD.storageHours * mult;
}

/** Ressource ACCUMULÉE depuis la dernière récolte, plafonnée au stockage (entier). */
export function buildingAccrued(b: Building, now: number, mult = 1): number {
  const perHr = buildingProdPerHour(b);
  const hours = Math.max(0, (now - b.collectedAt) / BUILD.hourMs);
  return Math.floor(Math.min(perHr * hours, buildingStorageCap(b, mult)));
}

/** Somme des ressources prêtes à récolter, par ressource (entrepôts appliqués). */
export function collectable(buildings: Building[], now: number): Record<BuildResource, number> {
  const acc: Record<BuildResource, number> = { dust: 0, stone: 0 };
  const mult = storageMult(buildings);
  for (const b of buildings) {
    const t = buildingType(b.typeId);
    if (!t?.resource) continue; // utilitaires : ne produisent rien
    acc[t.resource] += buildingAccrued(b, now, mult);
  }
  return acc;
}
