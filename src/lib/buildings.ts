// buildings.ts — BÂTIMENTS du village (pur/testable). Le joueur construit des bâtiments
// sur des emplacements autour de la ville (carte d'expédition), financés par l'OR
// (construction + upgrades = le vrai puits d'or). Dimensionné par simulation.
//
// ÉTAT ACTUEL : 7 bâtiments pour 7 emplacements — `BUILD.plotCap` est DÉRIVÉ du registre.
//  • UTILITAIRES : Avant-poste (débloque expéditions + vitesse) · Entrepôt (stockage).
//  • PRODUCTEURS : Mine d'or 🪙 · Dynamo ⚡ (énergie de jeu) · Fonderie ⚙️ (ferraille 🔩).
//  • HYBRIDES (effet + production) : Porte du Labyrinthe (débloque + luck coffres, PRODUIT
//    des clés 🗝️) · Autel des boss (jet/coût, PRODUIT des pierres d'invocation 🔮).
// La production est passive, à RÉCOLTER (collectable/collectFilons), bornée par le stockage
// (18 h × bonus Entrepôt) → complément à l'actif, jamais un substitut au sport.
//
// GARDE-FOUS : plafonné par le SPORT (niveau d'un bâtiment ≤ niveau du joueur) ; 100 %
// déterministe (timestamps passés par l'appelant, hors-ligne).
//
// EXTENSIBLE : un bâtiment = une entrée du registre `BUILDING_TYPES`.
//
// NB : `Date.now()` n'est PAS utilisé ici — le `now` (ms epoch) est toujours passé
// par l'appelant → fonctions pures et testables.

// Ressource produite (union extensible : on pourra ajouter 'gold', …).
// `fragments` = poussière d'âme (rang des familiers) ; `ink_dust` = poussière d'encre
// (rang des talents). Noms de colonnes conservés (`fragments`) ; libellés UI = « poussière ».
export type BuildResource =
  | 'dust'
  | 'stone'
  | 'energy'
  | 'parchemins'
  | 'fragments'
  | 'ink_dust'
  | 'gold' // 🪙 or (Mine d'or)
  | 'summon' // 🔮 pierres d'invocation (Autel des boss)
  | 'keys' // 🗝️ clés de labyrinthe (Porte du Labyrinthe)
  | 'scrap'; // 🔩 ferraille (Fonderie) — répare l'enceinte

// Catégorie d'un bâtiment. `producer` = filon de ressource ; `utility` = bâtiment
// à EFFET global (entrepôt, tour de reconnaissance…). Extensible.
export type BuildingCategory = 'producer' | 'utility';

// Effet global d'un bâtiment `utility` (par niveau). Extensible (tour, forge…).
interface BuildingEffect {
  storageMultPerLvl?: number; // Entrepôt : +X au multiplicateur de stockage / niveau
  expeSpeedPerLvl?: number; // Tour : −X% temps de trajet / niveau (plus tard)
  expeWinPerLvl?: number; // Tour : +X% chance / niveau (plus tard)
  labyLuckPerLvl?: number; // Porte du Labyrinthe : +X à la chance de butin des coffres / niveau
  bossRollFloorPerLvl?: number; // Autel des boss : +X au plancher de qualité de roll / niveau
  summonCostRedPerLvl?: number; // Autel des boss : −X% du coût en pierres d'invocation / niveau
  caravanSlotPer6Lvl?: boolean; // Comptoir : +1 convoi simultané tous les 6 niveaux (cf. caravanSlots)
  guildRosterPerLvl?: number; // Guilde : +X aventuriers recrutables / niveau
  trainSpeedPerLvl?: number; // Centre de formation : −X% de temps de formation / niveau
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
  /** Ce qu'un NIVEAU ajoute, côté effet UTILITAIRE. ⚠️ La part PRODUCTION n'est pas
   *  écrite ici : `perLevelLabel` la dérive de `prodPerHrPerLvl`, faute de quoi les deux
   *  divergeraient au premier réglage. Laisser vide pour un producteur pur. */
  perLevelNote?: string;
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
  // Utilitaire UNIQUE : l'AVANT-POSTE débloque les expéditions (idle) et chaque
  // niveau réduit les temps de trajet → on revient chercher le butin plus vite.
  // Extensible (socle des futurs déblocages d'activités via bâtiment).
  {
    id: 'outpost',
    perLevelNote: '−1,5 % de temps de trajet, puis un gain qui continue en s’amenuisant',
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
  // Utilitaire UNIQUE : la PORTE DU LABYRINTHE débloque le Labyrinthe (donjon à
  // étages, source unique des familiers). Chaque niveau AMÉLIORE la qualité du butin
  // des coffres (+4 % de chance de rareté) → investir de l'or rend les runs plus riches.
  // HYBRIDE : débloque le Labyrinthe + améliore le butin des coffres, ET PRODUIT des clés 🗝️
  // (source passive de clés de labyrinthe, en plus des drops de donjon/boss/faille).
  {
    id: 'labyrinth_gate',
    perLevelNote: '+4 % de butin dans les coffres du Labyrinthe',
    label: 'Porte du Labyrinthe',
    emoji: '🚪',
    category: 'utility',
    effect: { labyLuckPerLvl: 0.04 },
    resource: 'keys',
    prodPerHrPerLvl: 0.025, // niv.20 ≈ 0,5/h → ~9 clés / 18 h (complément, pas la source)
    buildGold: 500,
    unlockLevel: 2,
    unique: true,
    unlock: {
      activity: 'Le Labyrinthe',
      where: 'Aventure › onglet Donjons › 🗝️ Labyrinthe.',
      route: '/expedition',
    },
    desc: 'Débloque le Labyrinthe (+4 %/niv de butin des coffres) et produit des clés 🗝️.',
  },
  // HYBRIDE : améliore la récompense de boss (jet + coût en pierres) ET PRODUIT des pierres
  // d'invocation 🔮 (source passive, en plus des nettoyages de donjon).
  {
    id: 'boss_altar',
    perLevelNote:
      'meilleur jet garanti sur les drops de boss, et −4 % de pierres 🔮 par invocation (jusqu’à −50 %)',
    label: 'Autel des boss',
    emoji: '🔮',
    category: 'utility',
    effect: { bossRollFloorPerLvl: 0.03, summonCostRedPerLvl: 0.04 },
    resource: 'summon',
    prodPerHrPerLvl: 0.03, // niv.20 ≈ 0,6/h → ~10 pierres / 18 h (complément)
    buildGold: 700,
    unlockLevel: 4,
    unique: true,
    desc: 'Boss : +chance d’un bon jet, −coût en pierres 🔮, et produit des pierres d’invocation 🔮.',
  },
  // PRODUCTEUR : Mine d'or → OR passif (puits d'or restant : construction/expéditions).
  {
    id: 'gold_mine',
    label: 'Mine d’or',
    emoji: '🪙',
    category: 'producer',
    resource: 'gold',
    prodPerHrPerLvl: 25, // niv.20 ≈ 500/h → ~9 000 or / 18 h (modeste vs coûts de bâtiments)
    buildGold: 600,
    unlockLevel: 2,
    unique: true,
    desc: 'Produit de l’or 🪙 en continu (à récolter).',
  },
  // PRODUCTEUR : Dynamo de faille → ÉNERGIE de jeu (convertit le temps en runs). Bornée
  // par le stockage → complément, jamais un substitut au sport (qui seul fait le niveau).
  {
    id: 'energy_font',
    label: 'Dynamo de faille',
    emoji: '⚡',
    category: 'producer',
    resource: 'energy',
    prodPerHrPerLvl: 0.8, // niv.20 ≈ 16/h → ~288 ⚡ / 18 h (quelques runs)
    buildGold: 800,
    unlockLevel: 3,
    unique: true,
    desc: 'Produit de l’énergie ⚡ de jeu (pour lancer plus de donjons).',
  },
  // UTILITAIRE : l'ENTREPÔT augmente le STOCKAGE de tous les producteurs (+15 %/niveau)
  // → tu peux t'absenter plus longtemps sans saturer.
  // PRODUCTEUR : la FONDERIE bat la ferraille 🔩, qui répare l'enceinte. ⚠️ Elle ne
  // remplace pas les ÉPAVES de la carte : celles-ci restent la source de POINTE (une
  // visite ≈ 2 à 3 récoltes de fonderie), la fonderie n'étant que le filet régulier —
  // même relation que la Mine d'or avec les expéditions. C'est ce qui garantit qu'on ne
  // reste jamais bloqué faute de matière pour réparer, sans vider la carte de son intérêt.
  {
    id: 'foundry',
    label: 'Fonderie',
    emoji: '⚙️',
    category: 'producer',
    resource: 'scrap',
    prodPerHrPerLvl: 0.09, // ⚠️ 0,12 → 0,09 en v0.702 : ce n'est PAS un nerf sec mais un
    // TROC. Les sièges suivant désormais le NOMBRE DE SÉANCES, ils rapportent de l'acier — et
    // sans compensation la ferraille devenait aussi facile que l'or (mesuré : ratio 1,05 au
    // niveau 20, sous le plancher de 1,1 que verrouille scrapEconomy.test). On a donc déplacé
    // du débit de l'HORLOGE vers l'ENTRAÎNEMENT, à total ~constant pour un joueur régulier :
    // la Fonderie tourne toute seule, elle devait céder la place à ce qui se mérite.
    buildGold: 850,
    unlockLevel: 10,
    unique: true,
    desc: 'Bat de la ferraille 🔩 en continu (réparation de l’enceinte).',
  },
  {
    id: 'warehouse',
    perLevelNote: '+15 % de stockage sur TOUS tes producteurs',
    label: 'Entrepôt',
    emoji: '🏬',
    category: 'utility',
    effect: { storageMultPerLvl: 0.15 },
    buildGold: 900,
    unlockLevel: 3,
    unique: true,
    desc: 'Augmente le stockage de tous tes producteurs (+15 %/niveau).',
  },
  // UTILITAIRE : le COMPTOIR débloque les caravanes et fixe combien partent EN MÊME TEMPS.
  // ⚠️ Son niveau ne fait qu'UNE chose (le nombre de convois), comme le Chantier de fouille :
  // c'est ce qui rend un niveau lisible. Et c'est le second garde-fou de l'inflation de
  // ressources — le rendement par convoi est bridé, mais c'est le NOMBRE qui multiplie.
  {
    id: 'caravanserail',
    label: 'Comptoir de caravanes',
    emoji: '🐫',
    category: 'utility',
    effect: { caravanSlotPer6Lvl: true },
    perLevelNote: 'convois plus rapides à chaque niveau, +1 convoi tous les 9 niveaux',
    buildGold: 500,
    unlockLevel: 3,
    unique: true,
    unlock: { activity: 'Les caravanes', where: 'sur la carte d’expédition' },
    desc: 'Envoie des convois récolter à ta place — du temps réel, zéro énergie. Ils ne vont que sur les lieux de RÉCOLTE.',
  },
  // UTILITAIRE : la GUILDE loge et recrute les aventuriers. Son niveau plafonne leur RANG
  // (donc le sport reste le plafond) et le nombre qu’on peut entretenir.
  {
    id: 'guild',
    label: 'Guilde d’aventuriers',
    emoji: '⚔️',
    category: 'utility',
    effect: { guildRosterPerLvl: 0.5 },
    perLevelNote: '+1 aventurier recrutable tous les 2 niveaux, et un rang maximal plus haut',
    buildGold: 700,
    unlockLevel: 3,
    unique: true,
    unlock: { activity: 'Les aventuriers', where: 'sur ta base' },
    desc: 'Recrute des aventuriers et fixe leur rang maximal. Ils escortent tes caravanes — et se font payer.',
  },
  // UTILITAIRE : le CENTRE DE FORMATION est où l’on VALIDE une promotion (l’aventurier y
  // apprend sa nouvelle classe). ⚠️ Il n’est PAS nécessaire pour démarrer : la classe de
  // DÉPART se choisit au recrutement, à la Guilde. Il ne devient utile qu’à la 2e strate
  // → le mur d’entrée d’un débutant reste à DEUX bâtiments.
  {
    id: 'training',
    label: 'Centre de formation',
    emoji: '📚',
    category: 'utility',
    effect: { trainSpeedPerLvl: 0.04 },
    perLevelNote: 'formations plus courtes à chaque niveau (de moins en moins)',
    buildGold: 650,
    unlockLevel: 4,
    unique: true,
    desc: 'Un aventurier promu y apprend sa nouvelle classe. Sans lui, il plafonne à sa classe de départ.',
  },
];

/** **Ce qu'un niveau de plus apporte**, en une ligne — la question qu'on se pose devant
 *  le bouton « Améliorer », et à laquelle les descriptions ne répondaient pas : elles
 *  disaient ce que le bâtiment FAIT, jamais ce que le niveau CHANGE. La part production
 *  est dérivée des données (jamais recopiée), la part utilitaire vient de `perLevelNote`.
 *  Un test vérifie que CHAQUE type en produit une : ajouter un bâtiment muet est une
 *  régression, pas un oubli anodin. */
export function perLevelLabel(t: BuildingType): string {
  const parts: string[] = [];
  if (t.perLevelNote) parts.push(t.perLevelNote);
  if (t.resource && t.prodPerHrPerLvl)
    parts.push(`+${t.prodPerHrPerLvl} ${RESOURCE_EMOJI[t.resource]}/h`);
  return parts.join(' · ');
}

/** Emoji de chaque ressource produite — source unique, partagée par l'UI. */
export const RESOURCE_EMOJI: Record<BuildResource, string> = {
  gold: '🪙',
  scrap: '🔩',
  energy: '⚡',
  keys: '🗝️',
  summon: '🔮',
  // Devises historiques, conservées pour les anciennes lignes (plus produites).
  dust: '✨',
  stone: '💎',
  parchemins: '📜',
  fragments: '🧩',
  ink_dust: '🖋️',
};

const BY_ID = new Map(BUILDING_TYPES.map((t) => [t.id, t]));
/** Niveau d'un bâtiment POSÉ, 0 s'il ne l'est pas. Les helpers dédiés (`outpostLevel`,
 *  `bossAltarLevel`…) refont ce `find` chacun de leur côté ; celui-ci est le générique. */
export function buildingLevel(buildings: Building[], typeId: string): number {
  return buildings.find((x) => x.typeId === typeId)?.level ?? 0;
}

export function buildingType(id: string): BuildingType | undefined {
  return BY_ID.get(id);
}

// ── Constantes de dimensionnement (validées par simulation) ──
export const BUILD = {
  // ⚠️ AUTANT D'EMPLACEMENTS QUE DE TYPES, et pas un de plus — DÉRIVÉ, jamais saisi à la
  // main. **Tous les types sont `unique`** (un seul exemplaire de chacun) : un emplacement
  // au-delà du nombre de types ne peut donc JAMAIS être rempli. Ce n'est pas de la réserve,
  // c'est un TROU permanent dans la cour — c'est ce que donnaient les 10 emplacements pour
  // 7 bâtiments. Le vrai choix n'a jamais vécu ici mais dans `plotsForLevel` : un
  // emplacement par niveau, alors que plusieurs types sont déjà déblocables → on décide
  // de l'ORDRE. Ajouter un type ouvre son emplacement tout seul ; un test le verrouille.
  plotCap: BUILDING_TYPES.length,
  // ⚠️ COEFFICIENT ×6 (220 → 1320), EXPOSANT INCHANGÉ — et c'est tout le point.
  // Mesuré sur un an et trois profils : à 220 le joueur avait TOUT au plafond de son
  // niveau dès le 2e mois, et n'en dépensait ensuite que ~20 % de son or (149 M en banque
  // à un an pour le profil muscu). Le plafond effectif n'était plus l'or mais le NIVEAU :
  // l'or n'avait plus de destination. À 1320 il court après ses derniers niveaux toute
  // l'année (55 % → 90 % du plafond) et dépense ~100 % de ce qu'il gagne.
  // ⚠️ NE PAS faire ça en montant l'EXPOSANT : les revenus suivent L^1.6, donc un coût en
  // L^2.35 diverge et recrée le MUR de la v0.657 (mesuré alors : 115 expéditions pour UN
  // niveau au niveau 100, les bâtiments gelaient). Un coefficient déplace la courbe sans
  // la déformer : le ratio coût/revenu reste PLAT sur 1→100, ce que le test verrouille.
  // ⚠️ 1320 → 550 (v0.733, mesuré). La valeur 1320 avait été calée en v0.684 sur un
  // roster de SEPT bâtiments ; il en compte DIX depuis les caravanes (v0.727), donc le
  // puits s'est approfondi de 43 % tout seul, sans que personne le re-mesure — le test
  // s'est contenté de relâcher sa borne (70 → 80 jours). Simulé sur un an, le joueur
  // le plus actif ne tenait plus que 44 % du plafond, et le compte réel (niveau 28,
  // 38 jours) portait 312 jours de revenu de retard.
  // ⚠️ Un 1er correctif à 450 SURCORRIGEAIT, et pour une raison instructive : le modèle
  // de revenu du test comptait des mines à distance MOYENNE, ce qui sous-estimait la
  // carte d'un facteur ~3. Revenu remis d'aplomb, part du plafond atteinte sur un an :
  //   450 → 87/76/70 %  ·  550 → 81/71/65 %  ·  660 → 76/67/61 %  ·  1320 → 65/55/49 %
  // On garde 550, le plus centré dans la bande saine 55-90 % que le test verrouille.
  upBase: 550, // upgrade L→L+1 (or) = round(upBase × L^upExp)
  // ⚠️ EXPOSANT CALÉ SUR LE REVENU, pas choisi « raide » (v0.657). Le passage 2 → 2,6
  // visait un puits d'or de fin de partie ; il a produit un MUR. Les revenus suivent
  // `L^1.6` (coût ET gain d'expédition), donc un coût en `L^2.6` diverge linéairement :
  // mesuré, le nombre d'expéditions de mine pour payer UN niveau de bâtiment passait de
  // 13 (niv.5) à 54 (niv.26) puis 115 (niv.100) — à ce stade l'or ne s'écoule plus, il
  // s'entasse, et les bâtiments gèlent. Un puits où l'on ne peut rien verser n'absorbe
  // rien. À 1,9 le ratio reste PLAT (4,6 → 5,5 expéditions) sur toute la courbe 1→100.
  // Ne pas remonter cet exposant sans re-simuler le ratio coût/revenu (test dédié).
  upExp: 1.9,
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
// ── Porte du Labyrinthe (gate + qualité du butin) ──
const LABY_GATE_ID = 'labyrinth_gate';
const LABY_LUCK_CAP = 0.4; // +40 % de chance de butin au maximum
/** Le Labyrinthe est-il débloqué ? (Porte du Labyrinthe construite). */
export function labyrinthUnlocked(buildings: Building[]): boolean {
  return buildings.some((b) => b.typeId === LABY_GATE_ID);
}
/** Bonus de chance (luck 0..1) sur le butin des coffres du Labyrinthe, selon la Porte. */
/** **AUCUN NIVEAU MORT, DE 0 À 100.** Règle de conception : un niveau qu'on paie doit
 *  apporter quelque chose, sinon on vend du vide. L'audit en a trouvé beaucoup — la Porte
 *  du Labyrinthe était morte **dès le niveau 11** (90 paliers sur 100 sans effet), l'Autel
 *  à partir de 30, l'Avant-poste de 41.
 *
 *  ⚠️ On PROLONGE, on ne redistribue pas : jusqu'au plafond d'origine la valeur est
 *  strictement inchangée — aucun joueur n'est nerfé, et aucun équilibrage déjà mesuré
 *  n'est remis en cause. Au-delà, une QUEUE asymptotique ajoute de moins en moins, sans
 *  jamais atteindre sa borne : c'est ce qui permet à un effet borné par nature (un temps
 *  de trajet ne peut pas devenir nul) de continuer à récompenser cent niveaux.
 *  `tailHalf` = combien de niveaux au-delà du plafond pour toucher la moitié de la queue. */
function beyondCap(level: number, capLevel: number, tailMax: number, tailHalf: number): number {
  const over = Math.max(0, level - capLevel);
  return over > 0 ? (tailMax * over) / (over + tailHalf) : 0;
}

export function labyrinthLuckBonus(buildings: Building[]): number {
  const b = buildings.find((x) => x.typeId === LABY_GATE_ID);
  if (!b) return 0;
  const per = buildingType(LABY_GATE_ID)?.effect?.labyLuckPerLvl ?? 0;
  const capLevel = per > 0 ? LABY_LUCK_CAP / per : 0;
  return Math.min(LABY_LUCK_CAP, b.level * per) + beyondCap(b.level, capLevel, 0.25, 45);
}
// ── Autel des boss (qualité des récompenses de boss) ──
const BOSS_ALTAR_ID = 'boss_altar';
const BOSS_ROLL_FLOOR_CAP = 0.85; // plancher de qualité de roll max (jamais 100 % garanti)
/** Niveau de l'Autel des boss posé (0 si aucun). */
function bossAltarLevel(buildings: Building[]): number {
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
  const capLevel = per > 0 ? BOSS_ROLL_FLOOR_CAP / per : 0;
  // La queue reste SOUS 1 : un roll parfait ne doit jamais être garanti.
  return Math.min(BOSS_ROLL_FLOOR_CAP, lvl * per) + beyondCap(lvl, capLevel, 0.12, 55);
}
const SUMMON_COST_RED_CAP = 0.5; // −50 % max sur le coût en pierres d'invocation
/** Réduction (0..1) du coût en pierres d'invocation 🔮 des boss, selon le NIVEAU
 *  de l'Autel des boss (−4 %/niveau, plafond −50 % au niveau ~12). */
export function bossSummonDiscount(buildings: Building[]): number {
  const lvl = bossAltarLevel(buildings);
  const per = buildingType(BOSS_ALTAR_ID)?.effect?.summonCostRedPerLvl ?? 0;
  const capLevel = per > 0 ? SUMMON_COST_RED_CAP / per : 0;
  // Bornée bien avant la gratuité : un boss se paie toujours.
  return Math.min(SUMMON_COST_RED_CAP, lvl * per) + beyondCap(lvl, capLevel, 0.25, 60);
}
/** Coût effectif en pierres d'invocation 🔮 d'un boss (base réduite par l'Autel). */
export function summonCostWith(baseCost: number, buildings: Building[]): number {
  return Math.max(1, Math.ceil(baseCost * (1 - bossSummonDiscount(buildings))));
}
/** Multiplicateur de TEMPS de trajet (< 1 = plus rapide), selon l'avant-poste. */
export function travelTimeMult(buildings: Building[]): number {
  const lvl = outpostLevel(buildings);
  const per = buildingType(OUTPOST_ID)?.effect?.expeSpeedPerLvl ?? 0;
  const capLevel = per > 0 ? TRAVEL_REDUCTION_CAP / per : 0;
  // La queue approche sans l’atteindre : un trajet garde toujours une durée.
  return 1 - Math.min(TRAVEL_REDUCTION_CAP, lvl * per) - beyondCap(lvl, capLevel, 0.25, 70);
}

/** Coût en OR pour améliorer un filon du niveau `level` au suivant (puits d'or steep). */
export function buildingUpgradeCost(level: number): number {
  return Math.round(BUILD.upBase * Math.pow(Math.max(1, level), BUILD.upExp));
}

/** Un bâtiment a-t-il un effet qui SCALE avec le niveau ? (producteur, ou utilitaire
 *  à effet par niveau) → est-il améliorable. */
export function buildingScales(typeId: string): boolean {
  const t = buildingType(typeId);
  return !!t && (!!t.resource || Object.keys(t.effect ?? {}).length > 0);
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
    ink_dust: 0,
    gold: 0,
    summon: 0,
    keys: 0,
    scrap: 0,
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
