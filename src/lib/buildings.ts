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

// Ressource produite (union extensible : on pourra ajouter 'gold', …).
export type BuildResource = 'dust' | 'stone' | 'energy' | 'parchemins' | 'fragments';

// Catégorie d'un bâtiment. `producer` = filon de ressource ; `utility` = bâtiment
// à EFFET global (entrepôt, tour de reconnaissance…). Extensible.
export type BuildingCategory = 'producer' | 'utility';

// Effet global d'un bâtiment `utility` (par niveau). Extensible (tour, forge…).
export interface BuildingEffect {
  storageMultPerLvl?: number; // Entrepôt : +X au multiplicateur de stockage / niveau
  expeSpeedPerLvl?: number; // Tour : −X% temps de trajet / niveau (plus tard)
  expeWinPerLvl?: number; // Tour : +X% chance / niveau (plus tard)
  labyLuckPerLvl?: number; // Porte du Labyrinthe : +X à la chance de butin des coffres / niveau
  bossRollFloorPerLvl?: number; // Autel des boss : +X au plancher de qualité de roll / niveau
  summonCostRedPerLvl?: number; // Autel des boss : −X% du coût en pierres d'invocation / niveau
  forgeLuckPerLvl?: number; // Forge : +X au biais de rareté des objets forgés / niveau
  goldToDustPerLvl?: number; // Comptoir : poussière ✨ obtenue par OR échangé / niveau
}

// Ce qu'un bâtiment DÉBLOQUE (activité/fonctionnalité) → affiché au joueur à la
// construction (« tu as débloqué X, ça se trouve ici »). Absent = bâtiment de
// production/effet passif (pas de nouvelle activité à annoncer).
export interface BuildingUnlock {
  activity: string; // ce qui est débloqué (ex. « Le Labyrinthe »)
  where: string; // où le trouver dans l'app
  route?: string; // route de navigation directe (bouton « Y aller »), si applicable
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
  unique?: boolean; // un seul exemplaire autorisé (tous les types : 1 de chaque sur la carte)
  unlock?: BuildingUnlock; // activité débloquée (annoncée à la construction)
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
    unique: true,
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
    unique: true,
    desc: 'Produit des pierres magiques 💎 (montée des familiers).',
  },
  // Producteur de PARCHEMINS 📜 : ressource de progression des TALENTS (montée de
  // niveau). Cadence proche des pierres (ressource de progression, pas abondante).
  {
    id: 'library',
    label: 'Bibliothèque',
    emoji: '📚',
    category: 'producer',
    resource: 'parchemins',
    prodPerHrPerLvl: 0.16,
    buildGold: 900,
    unlockLevel: 2,
    unique: true,
    desc: 'Produit des parchemins de maîtrise 📜 (montée du niveau des talents).',
  },
  // Producteur d'ÉNERGIE : convertit l'or (surabondant en fin de partie) en énergie
  // de JEU → adoucit le pincement d'énergie au niveau élevé (le coût des runs monte
  // plus vite que l'énergie/séance). Reste borné (stockage 18 h + niveau ≤ joueur) →
  // complément, jamais un substitut au sport (qui seul fait le NIVEAU et les STATS).
  {
    id: 'energy_font',
    label: 'Dynamo de faille',
    emoji: '⚡',
    category: 'producer',
    resource: 'energy',
    prodPerHrPerLvl: 0.8, // niv.20 ≈ 16/h → ~288 ⚡/jour (cap 18 h) = quelques runs
    buildGold: 1200, // plus cher qu'un filon : c'est un vrai puits d'or
    unlockLevel: 1, // dispo dès le niv.1 (production de base) — cf. ordre des emplacements
    unique: true,
    desc: 'Convertit l’or en énergie ⚡ de jeu (pour lancer plus de donjons).',
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
    unlockLevel: 3,
    unique: true,
    unlock: {
      activity: 'Les Expéditions (mode idle)',
      where: 'Ici, sur la carte : choisis un lieu et envoie ton héros l’explorer.',
    },
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
    unlockLevel: 1, // production de base dispo dès le niv.1 (cf. ordre des emplacements)
    unique: true,
    desc: 'Augmente le stockage de tous tes filons (+15 %/niveau).',
  },
  // Utilitaire UNIQUE : l'INCUBATEUR débloque la FUSION des familiers (3 identiques →
  // rareté supérieure). Pas de gate de niveau dur sur les raretés : la progression de
  // rareté reste pilotée par le grind (fusion) + la profondeur (drops), pas par un
  // verrou par palier → jamais de sensation de blocage.
  {
    id: 'incubator',
    label: 'Incubateur',
    emoji: '🥚',
    category: 'utility',
    effect: {},
    buildGold: 900,
    unlockLevel: 2,
    unique: true,
    unlock: {
      activity: "L'infusion des familiers",
      where: 'Aventure › onglet Équip. › 🐾 Familier › Incubateur.',
    },
    desc: "Débloque l'infusion des familiers : dépense des fragments 🧩 pour monter le rang/qualité d'un familier. Chaque niveau relève le rang MAX atteignable.",
  },
  // Utilitaire UNIQUE : la PORTE DU LABYRINTHE débloque le Labyrinthe (donjon à
  // étages, source unique des familiers). Chaque niveau AMÉLIORE la qualité du butin
  // des coffres (+4 % de chance de rareté) → investir de l'or rend les runs plus riches.
  {
    id: 'labyrinth_gate',
    label: 'Porte du Labyrinthe',
    emoji: '🚪',
    category: 'utility',
    effect: { labyLuckPerLvl: 0.04 },
    buildGold: 500,
    unlockLevel: 2,
    unique: true,
    unlock: {
      activity: 'Le Labyrinthe',
      where: 'Aventure › onglet Donjons › 🗝️ Labyrinthe.',
      route: '/expedition',
    },
    desc: 'Débloque le Labyrinthe. Chaque niveau enrichit le butin des coffres (+4 %).',
  },
  // Utilitaire UNIQUE : l'AUTEL DES BOSS améliore les RÉCOMPENSES de boss (il ne les
  // gate pas). Le construire débloque D'EMBLÉE le 4ᵉ candidat + le ciblage du slot de
  // set manquant (perks binaires = l'identité du bâtiment, pas des paliers) ; le
  // NIVEAU, lui, ne fait que scaler la qualité de roll (continu, pas de palier).
  {
    id: 'boss_altar',
    label: 'Autel des boss',
    emoji: '🔮',
    category: 'utility',
    effect: { bossRollFloorPerLvl: 0.03, summonCostRedPerLvl: 0.04 },
    buildGold: 700,
    unlockLevel: 4,
    unique: true,
    desc: 'Récompenses de boss : ciblage du set manquant (dès la construction) + plus de CHOIX en montant l’Autel (2 → 3 au niv.10 → 4 au niv.20 → 5 au niv.30). Chaque niveau : +qualité de roll, −coût en pierres d’invocation 🔮.',
  },
  // Utilitaire UNIQUE : la FORGE débloque l'Atelier de poussière (forger un objet neuf,
  // forge de set). Sans elle, l'Atelier reste fermé → un cran de progression de plus.
  {
    id: 'forge',
    label: 'Forge',
    emoji: '🔨',
    category: 'utility',
    effect: { forgeLuckPerLvl: 0.035 },
    buildGold: 1000,
    unlockLevel: 5,
    unique: true,
    unlock: {
      activity: 'L’Atelier de forge (poussière)',
      where: 'Aventure › onglet Équip. › 🔧 Atelier.',
    },
    desc: 'Débloque l’Atelier : forger un objet neuf à ton niveau + forge de pièces de set. Chaque niveau améliore la rareté des objets forgés.',
  },
  // Producteur : la SEULE ressource sans source passive (fragments = grinde de TIER des
  // familiers, jusqu'ici coffres du Labyrinthe + recyclage). Débit lent (comme le filon de
  // pierre) pour compléter sans court-circuiter la grinde.
  {
    id: 'fragment_vein',
    label: 'Filon de fragments',
    emoji: '🧩',
    category: 'producer',
    resource: 'fragments',
    prodPerHrPerLvl: 0.14,
    buildGold: 900,
    unlockLevel: 3,
    unique: true,
    desc: 'Produit des fragments de familier 🧩 (montée du TIER des familiers) en continu.',
  },
  // Utilitaire : PUITS D'OR. Depuis le retrait de la boutique/respec, l'or s'accumule sans
  // débouché → le Comptoir l'échange contre de la poussière ✨ (ressource la plus demandée).
  // Taux qui monte avec le niveau. Sens UNIQUE (pas de retour poussière→or) → pas de boucle.
  {
    id: 'comptoir',
    label: 'Comptoir',
    emoji: '🏪',
    category: 'utility',
    effect: { goldToDustPerLvl: 0.02 }, // niv.1 ~0,02 ✨/or … niv.20 ~0,4 ✨/or
    buildGold: 700,
    unlockLevel: 4,
    unique: true,
    unlock: {
      activity: 'L’échange or → poussière',
      where: 'Carte 🗺️ Expédition › touche le Comptoir.',
    },
    desc: 'Échange ton OR contre de la poussière ✨. Chaque niveau améliore le taux de change.',
  },
];

const BY_ID = new Map(BUILDING_TYPES.map((t) => [t.id, t]));
export function buildingType(id: string): BuildingType | undefined {
  return BY_ID.get(id);
}

// ── Constantes de dimensionnement (validées par simulation) ──
export const BUILD = {
  plotCap: 12, // emplacements max (≥ nb de types de bâtiments → on peut tous les poser)
  upBase: 220, // upgrade L→L+1 (or) = round(upBase × L^upExp)
  upExp: 2.6, // puits d'or RAIDE (2→2.6) : l'or de fin de partie n'a plus de puits sinon
  storageHours: 18, // heures de production stockables (puis saturation)
  hourMs: 3_600_000,
} as const;

/** Nombre d'emplacements DÉBLOQUÉS à un niveau donné : **UN par niveau** (le joueur
 *  gère ses priorités — plus de bâtiments débloqués que d'emplacements au début). */
export function plotsForLevel(level: number): number {
  return Math.min(BUILD.plotCap, Math.max(1, level));
}

/** Niveau auquel l'emplacement d'index `slot` (0-based) se débloque (inverse de
 *  plotsForLevel). Sert à afficher « débloqué au niv X » sur un emplacement verrouillé. */
export function slotUnlockLevel(slot: number): number {
  return slot + 1;
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
/** Niveau de l'Incubateur posé (0 si aucun). */
export function incubatorLevel(buildings: Building[]): number {
  return buildings.find((b) => b.typeId === 'incubator')?.level ?? 0;
}
/** L'incubateur est-il construit ? → débloque la fusion des familiers. */
export function incubatorBuilt(buildings: Building[]): boolean {
  return incubatorLevel(buildings) > 0;
}
/** CRAN (tier 0..49 = rang×5 + qualité−1) MAX atteignable par infusion selon le niveau
 *  de l'Incubateur. Comme partout ailleurs : **une qualité (cran) tous les 2 niveaux** →
 *  les 50 crans (rang+qualité) sont débloqués progressivement, SSS★5 au niveau ~97 (graal
 *  long terme). Construit (niv.1) → cran 1 (G★2). `-1` = pas d'incubateur (aucune infusion). */
export function maxFuseTierIndex(buildings: Building[]): number {
  const lvl = incubatorLevel(buildings);
  return lvl < 1 ? -1 : Math.min(49, 1 + Math.floor((lvl - 1) / 2));
}
/** Niveau d'Incubateur requis pour débloquer le cran (tier) `tier`. */
export function fuseUnlockLevel(tier: number): number {
  return Math.max(1, 1 + 2 * (tier - 1));
}
/** La Forge est-elle construite ? → débloque l'Atelier (forge d'objet / de set). */
export function forgeBuilt(buildings: Building[]): boolean {
  return buildings.some((b) => b.typeId === 'forge');
}
const FORGE_LUCK_CAP = 0.5; // biais de rareté max apporté par le niveau de Forge
/** Bonus de chance de RARETÉ des objets forgés selon le NIVEAU de la Forge (comme
 *  l'Autel/Incubateur : monter le bâtiment améliore ses sorties). Plafonné. */
export function forgeLuckBonus(buildings: Building[]): number {
  const lvl = buildings.find((b) => b.typeId === 'forge')?.level ?? 0;
  const per = buildingType('forge')?.effect?.forgeLuckPerLvl ?? 0;
  return Math.min(FORGE_LUCK_CAP, lvl * per);
}
// ── Comptoir : taux de change OR → POUSSIÈRE (poussière obtenue par or échangé). ──
export function comptoirRate(buildings: Building[]): number {
  const lvl = buildings.find((b) => b.typeId === 'comptoir')?.level ?? 0;
  const per = buildingType('comptoir')?.effect?.goldToDustPerLvl ?? 0;
  return lvl * per;
}
/** Poussière obtenue en échangeant `gold` or au Comptoir (0 si non construit). */
export function goldToDust(buildings: Building[], gold: number): number {
  return Math.floor(Math.max(0, gold) * comptoirRate(buildings));
}
// ── Porte du Labyrinthe (gate + qualité du butin) ──
const LABY_GATE_ID = 'labyrinth_gate';
const LABY_LUCK_CAP = 0.4; // +40 % de chance de butin au maximum
/** Le Labyrinthe est-il débloqué ? (Porte du Labyrinthe construite). */
export function labyrinthUnlocked(buildings: Building[]): boolean {
  return buildings.some((b) => b.typeId === LABY_GATE_ID);
}
/** Bonus de chance (luck 0..1) sur le butin des coffres du Labyrinthe, selon la Porte. */
export function labyrinthLuckBonus(buildings: Building[]): number {
  const b = buildings.find((x) => x.typeId === LABY_GATE_ID);
  if (!b) return 0;
  const per = buildingType(LABY_GATE_ID)?.effect?.labyLuckPerLvl ?? 0;
  return Math.min(LABY_LUCK_CAP, b.level * per);
}
// ── Autel des boss (qualité des récompenses de boss) ──
const BOSS_ALTAR_ID = 'boss_altar';
const BOSS_ROLL_FLOOR_CAP = 0.85; // plancher de qualité de roll max (jamais 100 % garanti)
/** Niveau de l'Autel des boss posé (0 si aucun). */
export function bossAltarLevel(buildings: Building[]): number {
  return buildings.find((b) => b.typeId === BOSS_ALTAR_ID)?.level ?? 0;
}
/** L'Autel des boss est-il construit ? */
export function bossAltarBuilt(buildings: Building[]): boolean {
  return bossAltarLevel(buildings) > 0;
}
/** Plancher de qualité de roll (0..1) sur les récompenses de boss, selon le NIVEAU
 *  de l'Autel. Monte LENTEMENT (2026‑08‑18 : +3 %/niveau au lieu de +6 % — il montait
 *  trop vite et se plafonnait au niveau ~15) → cap 85 % atteint vers le niveau ~28,
 *  aligné sur la montée du nombre de choix (jusqu'au niveau 30). */
export function bossAltarRollFloor(buildings: Building[]): number {
  const lvl = bossAltarLevel(buildings);
  const per = buildingType(BOSS_ALTAR_ID)?.effect?.bossRollFloorPerLvl ?? 0;
  return Math.min(BOSS_ROLL_FLOOR_CAP, lvl * per);
}
/** Nombre de candidats de récompense de boss, selon le NIVEAU de l'Autel (2026‑08‑18) :
 *  2 choix dès le niveau 1, 3 au niveau 10, 4 au niveau 20, 5 au niveau 30 → monter
 *  l'Autel = plus d'agency sur les récompenses. (Sans Autel les boss sont verrouillés.) */
export function bossRewardCount(buildings: Building[]): number {
  const lvl = bossAltarLevel(buildings);
  if (lvl >= 30) return 5;
  if (lvl >= 20) return 4;
  if (lvl >= 10) return 3;
  return 2;
}
/** Ciblage : la pièce de set d'un boss vise un slot MANQUANT (dès l'Autel construit). */
export function bossTargetingUnlocked(buildings: Building[]): boolean {
  return bossAltarBuilt(buildings);
}
const SUMMON_COST_RED_CAP = 0.5; // −50 % max sur le coût en pierres d'invocation
/** Réduction (0..1) du coût en pierres d'invocation 🔮 des boss, selon le NIVEAU
 *  de l'Autel des boss (−4 %/niveau, plafond −50 % au niveau ~12). */
export function bossSummonDiscount(buildings: Building[]): number {
  const lvl = bossAltarLevel(buildings);
  const per = buildingType(BOSS_ALTAR_ID)?.effect?.summonCostRedPerLvl ?? 0;
  return Math.min(SUMMON_COST_RED_CAP, lvl * per);
}
/** Coût effectif en pierres d'invocation 🔮 d'un boss (base réduite par l'Autel). */
export function summonCostWith(baseCost: number, buildings: Building[]): number {
  return Math.max(1, Math.ceil(baseCost * (1 - bossSummonDiscount(buildings))));
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

/** Un bâtiment a-t-il un effet qui SCALE avec le niveau ? (producteur, ou utilitaire
 *  à effet par niveau) → est-il améliorable. L'INCUBATEUR scale via son niveau (chaque
 *  niveau relève le CRAN max d'infusion des familiers, cf. maxFuseTierIndex), même si
 *  son `effect` est vide → il DOIT être améliorable (sinon les familiers restent bloqués
 *  au rang F). */
export function buildingScales(typeId: string): boolean {
  const t = buildingType(typeId);
  return !!t && (!!t.resource || Object.keys(t.effect ?? {}).length > 0 || typeId === 'incubator');
}
export function canUpgradeBuilding(b: Building, playerLevel: number): boolean {
  return buildingScales(b.typeId) && b.level < playerLevel;
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
  const acc: Record<BuildResource, number> = {
    dust: 0,
    stone: 0,
    energy: 0,
    parchemins: 0,
    fragments: 0,
  };
  const mult = storageMult(buildings);
  for (const b of buildings) {
    const t = buildingType(b.typeId);
    if (!t?.resource) continue; // utilitaires : ne produisent rien
    acc[t.resource] += buildingAccrued(b, now, mult);
  }
  return acc;
}

/** Nouveau `collectedAt` d'un filon APRÈS récolte. On n'avance le compteur QUE du
 *  temps correspondant aux unités ENTIÈRES récoltées → le reliquat fractionnaire est
 *  REPORTÉ au lieu d'être jeté. Conséquences : (1) plus de perte de fraction à chaque
 *  récolte ; (2) un filon LENT (0,16/h) n'est plus « affamé » quand on récolte souvent
 *  pour un filon rapide (sa fraction < 1 est conservée, il finit par cumuler son unité).
 *  Filon sans unité entière prête (ou utilitaire) → `collectedAt` inchangé (rien jeté). */
export function nextCollectedAt(b: Building, now: number, mult = 1): number {
  const perHr = buildingProdPerHour(b);
  if (perHr <= 0) return b.collectedAt; // utilitaire : rien à récolter
  const cap = buildingStorageCap(b, mult); // en unités
  const stored = Math.min((perHr * (now - b.collectedAt)) / BUILD.hourMs, cap);
  const collected = Math.floor(stored);
  if (collected <= 0) return b.collectedAt; // rien récolté → on garde l'accumulation en cours
  const remaining = stored - collected; // 0 ≤ remaining < 1 : reporté dans le stock
  return now - (remaining / perHr) * BUILD.hourMs;
}
