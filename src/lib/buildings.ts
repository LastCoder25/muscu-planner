// buildings.ts — BÂTIMENTS du village (pur/testable). Le joueur construit des bâtiments
// sur des emplacements autour de la ville (carte d'expédition), financés par l'OR
// (construction + upgrades = le vrai puits d'or). Dimensionné par simulation.
//
// ÉTAT ACTUEL : 5 bâtiments pour 5 emplacements — `BUILD.plotCap` est DÉRIVÉ du registre.
//  • UTILITAIRES : Avant-poste (expéditions + caravanes : trajet du héros, vitesse ET
//    nombre des convois) · Panthéon.
//  • PRODUCTEUR : Dynamo ⚡ (énergie de jeu).
//  • HYBRIDES (effet + production) : Porte du Labyrinthe (débloque + luck coffres, PRODUIT
//    des clés 🗝️) · Autel des boss (rareté des pièces de boss, PRODUIT des pierres 🔮).
// La production est passive, à RÉCOLTER (collectable/collectFilons), bornée par le stockage
// PROPRE à chaque bâtiment (`storageHoursFor` : sa réserve grandit avec SON niveau) →
// complément à l'actif, jamais un substitut au sport.
//
// ⚠️ PLUS D'ENTREPÔT (demandé) : « chaque bâtiment gère sa production et sa limite max ».
// Un bâtiment qui ne faisait que gonfler la réserve des AUTRES obligeait à en monter deux
// pour en améliorer un. Sa courbe est reprise TELLE QUELLE par chaque producteur
// (18 h × (1 + 0,15 × niveau)) : un producteur au niveau N a la réserve qu'il avait avec
// un Entrepôt au même niveau — personne ne perd de stockage s'il avait suivi.
//
// ⚠️ AUCUN BÂTIMENT NE PRODUIT PLUS D'OR NI DE FERRAILLE (Mine d'or et Fonderie retirées,
// demandé) : ce sont les deux devises qu'on va CHERCHER sur la carte, et une horloge qui
// les déposait brouillait ce message. Les deux retraits sont COMPENSÉS et MESURÉS — cf.
// `BUILD.upBase` pour le puits d'or et `HARVEST.scrapBase` pour la ferraille.
//
// GARDE-FOUS : plafonné par le SPORT (niveau d'un bâtiment ≤ niveau du joueur) ; 100 %
// déterministe (timestamps passés par l'appelant, hors-ligne).
//
// EXTENSIBLE : un bâtiment = une entrée du registre `BUILDING_TYPES`.
//
// NB : `Date.now()` n'est PAS utilisé ici — le `now` (ms epoch) est toujours passé
// par l'appelant → fonctions pures et testables.

// Ressource PRODUITE par un bâtiment (union extensible).
//
// ⚠️ NI `gold` NI `scrap` : ce sont des devises, mais plus aucun bâtiment ne les
// produit depuis le retrait de la Mine d'or et de la Fonderie. Les laisser ici
// laisserait croire qu'un filon peut encore en déposer.
// `fragments` = poussière d'âme (rang des familiers) ; `ink_dust` = poussière d'encre
// (rang des talents). Noms de colonnes conservés (`fragments`) ; libellés UI = « poussière ».
export type BuildResource =
  | 'dust'
  | 'stone'
  | 'energy'
  | 'parchemins'
  | 'fragments'
  | 'ink_dust'
  | 'summon' // 🔮 pierres d'invocation (Autel des boss)
  | 'keys'; // 🗝️ clés de labyrinthe (Porte du Labyrinthe)

// Catégorie d'un bâtiment. `producer` = filon de ressource ; `utility` = bâtiment
// à EFFET global (avant-poste, autel…). Extensible.
export type BuildingCategory = 'producer' | 'utility';

// Effet global d'un bâtiment `utility` (par niveau). Extensible (tour, forge…).
interface BuildingEffect {
  expeSpeedPerLvl?: number; // Tour : −X% temps de trajet / niveau (plus tard)
  expeWinPerLvl?: number; // Tour : +X% chance / niveau (plus tard)
  labyLuckPerLvl?: number; // Porte du Labyrinthe : +X à la chance de butin des coffres / niveau
  bossRollFloorPerLvl?: number; // Autel des boss : +X au plancher de qualité de roll / niveau
}

// Ce qu'un bâtiment DÉBLOQUE (activité/fonctionnalité) → affiché au joueur à la
// construction (« tu as débloqué X, ça se trouve ici »). Absent = bâtiment de
// production/effet passif (pas de nouvelle activité à annoncer).
export interface BuildingUnlock {
  activity: string; // ce qui est débloqué (ex. « Le Labyrinthe »)
  where: string; // où le trouver dans l'app
  route?: string; // route de navigation directe (bouton « Y aller »), si applicable
}

/**
 * ⚠️ LES IDS SONT TYPÉS, ET CE N'EST PAS DE LA COSMÉTIQUE. `typeId` était un `string`,
 * donc **retirer un bâtiment du registre ne cassait RIEN** : les quinze sites qui le
 * nommaient continuaient de compiler et rendaient simplement **0, en silence**. C'est le
 * piège que ce projet documente à répétition — le rôle ÉCLAIREUR déclaré et consommé nulle
 * part (v0.757), `ensureOptimum` jamais appelée (v0.746), la condition d'alerte de la Tour
 * de guet posée sur une tuile qui n'existe pas (v0.750).
 *
 * ⚠️ **MESURÉ SUR LE CHANTIER QUI VIENT** : en préparant la fusion du Panthéon (3 bâtiments
 * → 1), retirer les trois du registre laissait le typecheck **VERT** avec dix références
 * mortes. Avec cette union, le compilateur les a désignées une par une. Une fusion de
 * bâtiments passe donc d'une bascule à l'aveugle à une bascule guidée.
 */
export type BuildingTypeId =
  | 'outpost'
  | 'labyrinth_gate'
  | 'boss_altar'
  | 'energy_font'
  | 'pantheon';

export interface BuildingType {
  id: BuildingTypeId;
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
  /** ⚠️ Un type RETIRÉ du registre traîne encore dans les JSONB sauvegardés :
   *  `normalizeRow` les écarte au chargement (v0.523), donc rien n'a jamais à migrer. */
  typeId: BuildingTypeId;
  level: number; // ≤ niveau joueur
  slot: number; // index de l'emplacement (position stable sur la carte)
  collectedAt: number; // ms epoch de la dernière récolte (base de l'accumulation)
}

// ── Registre des bâtiments (le socle extensible) ──
export const BUILDING_TYPES: BuildingType[] = [
  // Utilitaire UNIQUE : l'AVANT-POSTE débloque les DEUX façons de jouer la carte — les
  // expéditions du héros (idle) et les caravanes — et chaque niveau raccourcit les
  // trajets → on revient chercher le butin plus vite.
  //
  // ⚠️ IL A ABSORBÉ LE COMPTOIR DE CARAVANES (demandé) : c'était « un bâtiment, un
  // endroit » (règle v0.739) pris à l'envers — deux bâtiments réglaient la même chose,
  // le VOYAGE, l'un pour le héros et l'autre pour les convois, et on montait l'un sans
  // comprendre pourquoi l'autre ne suivait pas.
  //
  // ⚠️ TROIS LEVIERS, et c'est ce qui le garde vivant du niveau 1 au 100 (règle v0.731) :
  // le trajet du héros (`travelTimeMult`, asymptotique), la VITESSE d'un convoi
  // (`caravanSlowFor`, asymptotique elle aussi) et leur NOMBRE (`caravanSlots`, un PALIER
  // tous les 9 niveaux). Deux courbes continues sous un palier : aucun cran ne peut être
  // muet, pas même entre deux convois.
  {
    id: 'outpost',
    perLevelNote:
      'trajets plus courts et convois plus rapides à chaque niveau, +1 convoi tous les 9 niveaux',
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
      activity: 'Les Expéditions et les Caravanes',
      where: 'Ici, sur la carte : envoie ton héros explorer, ou un convoi récolter à ta place.',
    },
    desc: 'Débloque les expéditions et les caravanes. Chaque niveau raccourcit les trajets du héros, accélère les convois, et en ajoute un tous les 9 niveaux.',
  },
  // Utilitaire UNIQUE : la PORTE DU LABYRINTHE débloque le Labyrinthe (donjon à
  // étages, source unique des familiers). Chaque niveau AMÉLIORE la qualité du butin
  // des coffres (+4 % de chance de rareté) → investir de l'or rend les runs plus riches.
  // HYBRIDE : débloque le Labyrinthe + améliore le butin des coffres, ET PRODUIT des clés 🗝️
  // (source passive de clés de labyrinthe, en plus des drops de donjon/boss/portail).
  {
    id: 'labyrinth_gate',
    perLevelNote: '+4 % de butin dans les coffres du Labyrinthe',
    label: 'Porte du Labyrinthe',
    emoji: '🚪',
    category: 'utility',
    effect: { labyLuckPerLvl: 0.04 },
    resource: 'keys',
    // ⚠️ « COMPLÉMENT, PAS LA SOURCE » — le motif était écrit, la valeur ne le tenait pas.
    // À 0,025 la Porte rendait **16,8 clés par jour au niveau 28** (12,6 à une seule
    // récolte) contre ~2,7 pour TOUT le reste réuni : elle faisait 85 % du flux. Le
    // Labyrinthe étant gaté à UNE clé, cela finançait seize runs par jour — l’exact
    // contraire de « un événement, pas du farm ».
    // ⚠️ Elle avait été OUBLIÉE par la raréfaction du 2026‑08‑18, qui a pourtant divisé
    // les autres robinets par trois (donjon 6 % → 2 %, boss 12 % → 6 %) au motif que
    // « les gros volumes de runs inondaient les clés ». On a resserré les affluents en
    // laissant le fleuve ouvert.
    // Calé à **~1 run par jour pour 7 niveaux de Porte** : 1,4/jour au niveau 10,
    // 4,0 au 28, 14,4 au 100. ⚠️ Calé quand chaque champion portait un familier (v0.777) :
    // depuis la v0.996 ils sont réservés au héros, donc la DEMANDE a baissé — à re-mesurer.
    prodPerHrPerLvl: 0.006,
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
  // HYBRIDE : rend les pièces de boss un peu plus rares ET PRODUIT des pierres d'invocation 🔮
  // (source passive, en plus des nettoyages de donjon).
  // ⚠️ PLUS DE REMISE SUR LE COÛT DES BOSS (décision de l’utilisateur, v0.799) : les pierres
  // sont ce qui LIE le farm de donjon aux boss, et une remise de −50 % coupait ce lien de moitié.
  {
    id: 'boss_altar',
    perLevelNote: 'pièces de boss un peu plus souvent d’une rareté au-dessus, jusqu’au niveau 100',
    label: 'Autel des boss',
    emoji: '🔮',
    category: 'utility',
    effect: { bossRollFloorPerLvl: 0.005 },
    resource: 'summon',
    prodPerHrPerLvl: 0.03, // niv.20 ≈ 0,6/h → ~10 pierres / 18 h (complément)
    buildGold: 700,
    unlockLevel: 4,
    unique: true,
    desc: 'Boss : des pièces un peu plus rares à chaque niveau, et produit des pierres d’invocation 🔮.',
  },
  // PRODUCTEUR : Dynamo tellurique → ÉNERGIE de jeu (convertit le temps en runs). Bornée
  // par le stockage → complément, jamais un substitut au sport (qui seul fait le niveau).
  {
    id: 'energy_font',
    label: 'Dynamo tellurique',
    emoji: '⚡',
    category: 'producer',
    resource: 'energy',
    // ⚠️ 0,8 → 0,1 (v0.822, mesuré). À 0,8 elle rendait ~550 ⚡/jour au niveau 29 — PLUS
    // que le Défi 360 de l'utilisateur le même jour : un « complément » devenu la première
    // source d'énergie. La production est LINÉAIRE en niveau alors qu'une séance rapporte
    // à peu près la même énergie à tous les niveaux : le débit est donc calé pour qu'au
    // niveau 100 elle égale au plus le sport d'un joueur régulier (1 h × 4/semaine), et
    // n'en vaille qu'environ un tiers au niveau 30. Invariant verrouillé dans buildings.test.
    prodPerHrPerLvl: 0.1,
    buildGold: 800,
    unlockLevel: 3,
    unique: true,
    desc: 'Produit de l’énergie ⚡ de jeu (pour lancer plus de donjons).',
  },
  // UTILITAIRE UNIQUE : le PANTHÉON DES CHAMPIONS remplace À LUI SEUL la Guilde, le Centre
  // de formation et l'Équipementier — « un bâtiment, un endroit » (règle v0.739). On y
  // invoque ses champions, on y consulte sa collection.
  //
  // ⚠️ IL NE PORTE AUCUNE FORMULE NEUVE, et c'est exactement ce qui le rend vivant du
  // niveau 1 au 100 (règle v0.731, aucun niveau mort) : ses DEUX leviers sont ceux dont
  // il HÉRITE — l'ENGAGEMENT (`engageCap`, +1 tous les 2 niveaux, 51 au niveau 100 : la
  // formule de la Guilde reprise telle quelle, déjà mesurée) et le NIVEAU MAXIMAL d'un
  // champion (`grantAdvXp`, le plus fort : le niveau DOMINE la rareté, ×4,3 au niveau 23),
  // qui monte à CHAQUE niveau. (Le troisième, le temps de forge, est parti avec la forge
  // en v0.1011 : l'équipement de champion ne vient plus que du tirage.)
  //
  // ⚠️ L'ENGAGEMENT BORNE CE QUI AGIT, JAMAIS CE QU'ON POSSÈDE (v0.958). Il a d'abord été
  // un BANC — un champion « en collection » était indisponible partout — ce qui rendait
  // mort-né le champion tiré en trop, l'inverse de ce qu'un gacha promet. Il borne
  // désormais la TAILLE d'un groupe ou d'une escorte et le nombre de défenseurs au
  // rempart : toute la collection reste utilisable, et c'est la composition du jour qui
  // décide.
  //
  // ⚠️ IL RESTE PORTEUR, et c'est MESURÉ : `guardUnits` fait défendre tout le vivier qu'on
  // lui passe, et un groupe envoyé sur un camp n'a AUCUN maximum. Tenue d'un siège,
  // enceinte à niveau, sans héros — **11 % à 0 champion, 65 % à 5, 95 % à 10, 100 % à 20**
  // au niveau 12. ⚠️ Et **les convois n'y changent rien** : ils bornent le nombre de
  // CONVOIS (`caravanSlots`) et la taille d'une escorte (`escortMax`), pas la défense ni
  // les camps.
  //
  // ⚠️ AUCUNE REMISE sur le prix d'un tirage, aussi tentant que ce soit : c'est mot pour
  // mot la remise de l'Autel des boss, RETIRÉE en v0.799 parce qu'elle coupait de moitié
  // le lien farm → boss. Ici elle couperait failles → pierres de mana → tirage, qui EST la
  // boucle entière.
  //
  // ⚠️ Coût de pose et niveau de déblocage REPRIS DE LA GUILDE (700 / niveau 3) : le mur
  // d'entrée d'un débutant reste à DEUX bâtiments pour 1 200 or — mesuré en v0.727, et un
  // test le verrouille parce que c'est le seul chiffre qui décide si la feature existe
  // pour le joueur qu'elle vise.
  {
    id: 'pantheon',
    label: 'Panthéon des champions',
    emoji: '🛕',
    category: 'utility',
    // ⚠️ LE MÊME LEVIER QUE L'APERÇU (`buildingPreview`), et un seul : le niveau maximal
    // d'un champion, qui DOMINE sa rareté (×4,3 au niveau 23). La ligne annonçait encore
    // l'engagement et la forge — les deux chiffres que la v0.962 avait justement retirés de
    // l'aperçu — donc la tuile et la fiche du même bâtiment disaient deux choses
    // différentes. Le reste de son métier vit dans `desc`, qui est là pour ça.
    perLevelNote: 'des champions d’un niveau plus haut',
    buildGold: 700,
    unlockLevel: 3,
    unique: true,
    unlock: { activity: 'Les champions', where: 'sur ta base' },
    desc: 'Invoque tes champions et garde ta collection — tout ce que tu tires reste utilisable. Son niveau fixe jusqu’où ils peuvent monter, et combien agissent à la fois : la taille d’un groupe, l’escorte d’un convoi, les défenseurs du rempart.',
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
    parts.push(
      `+${t.prodPerHrPerLvl} ${RESOURCE_EMOJI[t.resource]}/h et +${Math.round(BUILD.storageHours * BUILD.storagePerLvl * 10) / 10} h de réserve`,
    );
  return parts.join(' · ');
}

/** Emoji de chaque ressource produite — source unique, partagée par l'UI. */
export const RESOURCE_EMOJI: Record<BuildResource, string> = {
  energy: '⚡',
  keys: '🗝️',
  summon: '🔮',
  // Devises historiques, conservées pour les anciennes lignes (plus produites).
  // 🪙 et 🔩 les ont rejointes : elles se gagnent sur la carte, plus jamais au bâtiment.
  dust: '✨',
  stone: '💎',
  parchemins: '📜',
  fragments: '🧩',
  ink_dust: '🖋️',
};

const BY_ID = new Map(BUILDING_TYPES.map((t) => [t.id, t]));
/** Niveau d'un bâtiment POSÉ, 0 s'il ne l'est pas. Les helpers dédiés (`outpostLevel`,
 *  `bossAltarLevel`…) refont ce `find` chacun de leur côté ; celui-ci est le générique. */
export function buildingLevel(buildings: Building[], typeId: BuildingTypeId): number {
  return buildings.find((x) => x.typeId === typeId)?.level ?? 0;
}

export function buildingType(id: string): BuildingType | undefined {
  // ⚠️ `string` et non `BuildingTypeId`, délibérément : on l'appelle AUSSI avec ce que
  // porte un JSONB sauvegardé, où un type retiré du registre peut encore traîner — c'est
  // même comme ça que `normalizeRow` les écarte. Rendre `undefined` EST la réponse.
  return BY_ID.get(id as BuildingTypeId);
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
  // ⚠️ 550 → 850 (mesuré) : le roster passe de NEUF à SIX bâtiments (Mine d’or,
  // Fonderie et Comptoir retirés). `plotCap` étant DÉRIVÉ du registre, le puits perd
  // un tiers de ses emplacements — mesuré sur un an et trois profils, la part du
  // plafond atteinte passait de 83,9/73,9/67,6 % à **94,3/83,3/76,4 %**, donc DEHORS
  // de la bande saine 55-90 % que le test verrouille : le joueur avait tout au
  // plafond et son or n’avait plus de destination.
  //   6 bâtiments · 550 → 94,3 / 83,3 / 76,4   ·   700 → 86,8 / 76,8 / 70,5
  //                 850 → 81,4 / 71,8 / 65,9   ·  1000 → 77,0 / 68,1 / 62,3
  // On garde 850 : il REPRODUIT la courbe d’avant à moins de 3 points près — on
  // change le nombre de bâtiments, pas la difficulté.
  // ⚠️ TOUJOURS PAR LE COEFFICIENT, JAMAIS PAR L’EXPOSANT (cf. `upExp` juste en
  // dessous) : un exposant plus raide que celui des revenus recrée le MUR de la v0.657.
  // ⚠️ 850 → 1000 (mesuré) : l’Entrepôt est retiré, le roster passe de SIX à CINQ.
  // Part du plafond atteinte sur un an (tranquille / régulier / très actif) :
  //   5 bâtiments · 850 → 86,4 / 76,3 / 70,1  ·  950 → 83,4 / 73,5 / 67,6
  //                1000 → 81,9 / 72,4 / 66,2  ·  1100 → 79,2 / 70,1 / 64,1
  // 1000 reproduit la courbe à six bâtiments (81,4 / 71,8 / 65,9) à 0,5 point près.
  // ⚠️ 1000 → 1400 (v0.996, mesuré) : LE REVENU DU TEST ÉTAIT PARTIEL. La simulation
  // d’un an ne comptait que donjons + 2 mines ; or la revente du butin (revenue en v0.890),
  // les convois, les camps, les boss, les sièges et le coffre du 360 ajoutent +41 % (niv. 10)
  // à +53 % (niv. 70). Revenu complet (`fullGoldPerDay`), enceinte comprise, part du
  // plafond sur un an (tranquille / régulier / très actif) :
  //   1000 → 92,1 / 81,1 / 74,3 (tranquille DEHORS)  ·  1200 → 86,4 / 76,1 / 69,7
  //   1400 → 81,9 / 72,1 / 66,0                      ·  1500 → 80,0 / 70,4 / 64,4
  // 1400 reproduit la courbe de référence (81,9 / 72,4 / 66,2) ; ~99 % de l’or est dépensé
  // et moins de 1,5 jour de revenu dort en banque en fin d’année.
  // ⚠️ 1400 → 1000 (v0.998, mesuré) : LA FERRAILLE EST RETIRÉE et l’ENCEINTE rejoint cette
  // courbe (`defenseUpgradeCost` = `buildingUpgradeCost`) : 11 structures au lieu de 5 sur
  // le puits commun. L’épave rend désormais de l’OR (convois compris, plafonnés à ~2 épaves
  // par jour : la carte n’en fait pas naître davantage). Part du plafond sur un an, cour +
  // enceinte (tranquille / régulier / très actif) :
  //   1000 → 76,8 / 68,5 / 63,4  ·  1200 → 72,1 / 64,2 / 59,5  ·  1400 → 68,3 / 60,8 / 56,4
  // 1000 : 3 à 5 points PLUS serré qu’avant (81,9 / 72,1 / 66,0) — demandé : « que l’or ne
  // soit pas en excès et qu’il faille aller le chercher » —, ~100 % de l’or dépensé, moins
  // d’un jour de revenu en banque, et un cran de bâtiment qui vaut 2,2 à 2,8 jours de revenu
  // du niveau 5 au 100 (courbe PLATE, pas de mur).
  // ⚠️ 1000 → 900 (v0.999, mesuré) : l’ÉPAVE est retirée, et avec elle l’or que les convois
  // en rapportaient. Le revenu baisse, le coefficient suit : 900 → 76,0 / 67,3 / 62,0 %,
  // la courbe de la v0.998 (76,8 / 68,5 / 63,4) à moins de 1,5 point, ~100 % de l’or
  // dépensé. (800 → 79,2 / 70,1 / 64,5 · 1000 → 73,2 / 64,8 / 59,7.)
  upBase: 900, // upgrade L→L+1 (or) = round(upBase × L^upExp), cour ET enceinte
  // ⚠️ EXPOSANT CALÉ SUR LE REVENU, pas choisi « raide » (v0.657). Le passage 2 → 2,6
  // visait un puits d'or de fin de partie ; il a produit un MUR. Les revenus suivent
  // `L^1.6` (coût ET gain d'expédition), donc un coût en `L^2.6` diverge linéairement :
  // mesuré, le nombre d'expéditions de mine pour payer UN niveau de bâtiment passait de
  // 13 (niv.5) à 54 (niv.26) puis 115 (niv.100) — à ce stade l'or ne s'écoule plus, il
  // s'entasse, et les bâtiments gèlent. Un puits où l'on ne peut rien verser n'absorbe
  // rien. À 1,9 le ratio reste PLAT (4,6 → 5,5 expéditions) sur toute la courbe 1→100.
  // Ne pas remonter cet exposant sans re-simuler le ratio coût/revenu (test dédié).
  upExp: 1.9,
  storageHours: 18, // heures stockables au niveau 0 (puis saturation)
  // Chaque niveau du bâtiment allonge SA réserve de 15 % de la base (2,7 h) : la courbe
  // de l'ancien Entrepôt, reprise par chaque producteur pour lui-même.
  storagePerLvl: 0.15,
  hourMs: 3_600_000,
} as const;

/** **UN QUOTA, PAS UNE LISTE D'INDEX** : nombre de bâtiments qu'on peut avoir posés à un
 *  niveau donné (un de plus par niveau). ⚠️ Ne dit PAS QUELS emplacements sont ouverts —
 *  n'importe quel emplacement vide (0..plotCap-1) est constructible tant que ce quota
 *  n'est pas atteint (`canBuildOnSlot`) : on construit LÀ OÙ ON TOUCHE, pas dans l'ordre. */
export function plotsForLevel(level: number): number {
  return Math.min(BUILD.plotCap, Math.max(1, level));
}

/** Niveau requis pour que le `slot`-ième bâtiment (0-based) soit constructible — inverse
 *  de `plotsForLevel`. ⚠️ DOUBLE USAGE : appelée avec un INDEX de slot, elle sert
 *  d'affichage historique ; appelée avec `buildings.length` (le QUOTA courant), elle donne
 *  le niveau requis pour que le PROCHAIN bâtiment (quel que soit l'emplacement vide choisi)
 *  devienne constructible — c'est la même formule, `plotsForLevel` grimpant d'un cran par
 *  niveau. Sert à afficher « débloqué au niv X » sur un emplacement verrouillé. */
export function slotUnlockLevel(slot: number): number {
  return slot + 1;
}

/** UN EMPLACEMENT VIDE EST-IL CONSTRUCTIBLE MAINTENANT ? On construit LÀ OÙ ON TOUCHE,
 *  pas dans l'ordre positionnel : tout emplacement vide (0..plotCap-1) l'est tant que le
 *  QUOTA (le nombre de bâtiments déjà posés, où qu'ils soient) n'a pas atteint
 *  `plotsForLevel(level)`. Les bâtiments existants gardent leur `slot`, occupé n'est JAMAIS
 *  constructible — c'est le store (`buildFilon`), `VillagePlots.vue` et `BasePage.vue` qui
 *  appellent tous cette même règle, pour qu'aucune copie ne diverge. */
export function canBuildOnSlot(slot: number, buildings: Building[], level: number): boolean {
  if (slot < 0 || slot >= BUILD.plotCap) return false;
  if (buildings.some((b) => b.slot === slot)) return false; // occupé : jamais constructible
  return buildings.length < plotsForLevel(level);
}

/** L'emplacement VIDE est-il VERROUILLÉ (quota atteint) ? Un emplacement OCCUPÉ n'est
 *  JAMAIS verrouillé — il se gère, quel que soit le quota. Dérivée de `canBuildOnSlot`
 *  (jamais une seconde formule) pour que les deux lectures ne puissent pas se contredire. */
export function emptySlotLocked(slot: number, buildings: Building[], level: number): boolean {
  return !canBuildOnSlot(slot, buildings, level) && !buildings.some((b) => b.slot === slot);
}

/** RECOMPACTE les bâtiments à des emplacements valides (0..plotCap-1, sans doublon),
 *  UNIQUEMENT si nécessaire — le filet de sécurité legacy pour un type retiré du registre
 *  (qui réduit `plotCap`) ou une ligne corrompue avec deux bâtiments sur le même slot.
 *  ⚠️ NE JAMAIS repacker sans raison : depuis qu'on CONSTRUIT LÀ OÙ ON TOUCHE (pas dans
 *  l'ordre), un emplacement délibérément choisi au-delà du prochain index libre doit
 *  SURVIVRE à un aller-retour serveur — un repack inconditionnel (comme avant) ramènerait
 *  silencieusement chaque bâtiment fraîchement posé à l'index suivant le plus bas, dès le
 *  premier `persist()`. */
export function repackBuildingSlots(buildings: Building[]): Building[] {
  const seen = new Set<number>();
  const ok = buildings.every((b) => {
    if (b.slot < 0 || b.slot >= BUILD.plotCap || seen.has(b.slot)) return false;
    seen.add(b.slot);
    return true;
  });
  if (ok) return buildings;
  return [...buildings].sort((a, b) => a.slot - b.slot).map((b, i) => ({ ...b, slot: i }));
}

/** Ce qu'un bâtiment a COÛTÉ en tout pour atteindre ce niveau : la pose, plus tous les
 *  crans. ⚠️ La courbe d'un cran ne dépend PAS du type (`buildingUpgradeCost`), seul le
 *  coût de pose en dépend — d'où le `buildGold` en paramètre plutôt qu'un id : on doit
 *  pouvoir chiffrer un bâtiment qui n'est PLUS au registre. */
export function buildingInvested(buildGold: number, level: number): number {
  let total = buildGold;
  for (let l = 1; l < level; l++) total += buildingUpgradeCost(l);
  return total;
}

/**
 * 🏚️ LES BÂTIMENTS RETIRÉS DU REGISTRE, avec leur coût de POSE et, s’ils ont été
 * ABSORBÉS, le bâtiment qui reprend leur métier.
 *
 * ⚠️ Ces montants sont recopiés ICI parce que les types ne sont plus au registre : sans
 * eux, le remboursement ne peut plus se calculer du tout. Ils ne servent qu’à la
 * migration et ne doivent jamais redevenir une source de vérité.
 *
 * ⚠️ `into` ABSENT = retrait SEC : le bâtiment disparaît et tout ce qu’il a coûté est
 * rendu. `into` PRÉSENT = fusion : le repreneur hérite du NIVEAU le plus haut (donc de
 * l’investissement EN NATURE) et seul le surplus est rendu en or.
 */
const RETIRED: { id: string; buildGold: number; into?: BuildingTypeId }[] = [
  { id: 'guild', buildGold: 700, into: 'pantheon' },
  { id: 'training', buildGold: 650, into: 'pantheon' },
  { id: 'outfitter', buildGold: 800, into: 'pantheon' },
  // 🐫 → 🧭 Le Comptoir de caravanes rejoint l’Avant-poste : les deux réglaient le même
  // VOYAGE, l’un pour le héros et l’autre pour les convois.
  { id: 'caravanserail', buildGold: 500, into: 'outpost' },
  // Retraits SECS : plus aucun bâtiment ne PRODUIT d'or ni de ferraille. L'or vient des
  // donjons et de la carte, la ferraille des épaves — deux devises qu'on va CHERCHER, et
  // non qu'une horloge dépose. Tout ce qu'ils ont coûté est rendu.
  { id: 'gold_mine', buildGold: 600 },
  { id: 'foundry', buildGold: 850 },
  // Retrait SEC : l'Entrepôt ne gonflait que la réserve des AUTRES. Chaque producteur
  // porte désormais sa propre réserve, qui grandit avec son niveau (`storageHoursFor`).
  { id: 'warehouse', buildGold: 900 },
];

const retiredOf = (id: string) => RETIRED.find((r) => r.id === id);
const buildGoldOf = (id: string) => buildingType(id)?.buildGold ?? retiredOf(id)?.buildGold ?? 0;

/**
 * 🛕🧭 ABSORPTION DES BÂTIMENTS RETIRÉS — fusions et retraits secs, en une seule passe.
 *
 * ⚠️ **SANS ELLE, L’INVESTISSEMENT S’ÉVAPORE EN SILENCE** : `normalizeRow` DROPPE les
 * types disparus du registre au chargement, donc retirer un bâtiment sans rien faire
 * serait la violation directe de la règle v0.731 — personne ne se réveille avec moins
 * bon qu’hier. Mesuré au moment de la fusion du Panthéon : 7,42 M d’or sur le compte
 * réel ; et 7,39 M de plus pour la vague Mine d’or / Fonderie / Comptoir.
 *
 * Deux garanties, et il en faut deux :
 * 1. **le NIVEAU le plus haut est hérité** par le repreneur — l’investissement est
 *    conservé EN NATURE, et ça tombe juste puisque le repreneur porte le métier de
 *    l’absorbé (le Panthéon le déploiement et la forge, l’Avant-poste le voyage) ;
 * 2. **l’or du reste est REMBOURSÉ** — ce qu’on a payé deux fois pour un seul bâtiment,
 *    ou en entier quand plus rien ne reprend le métier.
 *
 * ⚠️ **IDEMPOTENTE PAR CONSTRUCTION** : sans aucun bâtiment retiré, elle rend la MÊME
 * référence et zéro or. Elle tourne à chaque chargement (comme `repackBuildingSlots`) ;
 * une fois la ligne écrite, il n’y a plus rien à absorber, donc plus rien à rembourser.
 *
 * ⚠️ Elle doit passer **AVANT** le filtre des types inconnus de `normalizeRow` : après,
 * il n’y a plus rien à lire — c’est le même ordre que la fouille et `advanceBase` (v0.772).
 */
function absorbRetired(buildings: Building[]): {
  buildings: Building[];
  goldRefund: number;
} {
  const vieux = buildings.filter((b) => retiredOf(b.typeId));
  if (!vieux.length) return { buildings, goldRefund: 0 };

  let goldRefund = 0;
  let reste = buildings.filter((b) => !retiredOf(b.typeId));

  // ⚠️ RETRAITS SECS D’ABORD : rien ne reprend le métier, tout est rendu.
  for (const b of vieux.filter((x) => !retiredOf(x.typeId)!.into)) {
    goldRefund += buildingInvested(buildGoldOf(b.typeId), b.level);
  }

  // Puis les FUSIONS, groupées par repreneur.
  const parRepreneur = new Map<BuildingTypeId, Building[]>();
  for (const b of vieux) {
    const into = retiredOf(b.typeId)!.into;
    if (!into) continue;
    parRepreneur.set(into, [...(parRepreneur.get(into) ?? []), b]);
  }
  for (const [into, absorbes] of parRepreneur) {
    // ⚠️ Un repreneur DÉJÀ posé entre dans la fusion au même titre : c’est le cas normal
    // (on a les deux bâtiments), et le traiter uniformément vaut mieux qu’un cas
    // particulier dont personne ne saurait plus, dans six mois, s’il est atteignable.
    const groupe = [...absorbes, ...reste.filter((b) => b.typeId === into)];
    const level = Math.max(...groupe.map((b) => b.level));
    const repreneur: Building = {
      typeId: into,
      level,
      // L’emplacement le plus bas du groupe : le bâtiment reste là où le joueur avait
      // posé le premier, plutôt que de réapparaître ailleurs dans la cour.
      slot: Math.min(...groupe.map((b) => b.slot)),
      collectedAt: Math.max(...groupe.map((b) => b.collectedAt)),
    };
    const depense = groupe.reduce(
      (t, b) => t + buildingInvested(buildGoldOf(b.typeId), b.level),
      0,
    );
    // Ce que le repreneur REPRÉSENTE désormais — on garde la valeur d’un bâtiment, on rend
    // celle des autres. ⚠️ Plancher à 0 : un joueur qui n’avait QUE l’absorbé hérite d’un
    // bâtiment parfois plus cher à poser — il ne doit rien pour autant.
    goldRefund += Math.max(0, depense - buildingInvested(buildGoldOf(into), level));
    reste = [...reste.filter((b) => b.typeId !== into), repreneur];
  }

  return { buildings: reste, goldRefund: Math.round(goldRefund) };
}

/**
 * 🩹 REMET UNE LIGNE SAUVEGARDÉE D'APLOMB : fusion du Panthéon, puis retrait des types
 * disparus du registre, puis recompactage des emplacements.
 *
 * ⚠️ **L'ORDRE EST LA SEULE CHOSE QUI COMPTE ICI, ET C'EST POURQUOI IL VIT DANS UNE
 * FONCTION.** Filtrer d'abord effacerait les trois bâtiments absorbés AVANT que la fusion
 * ne les ait lus — avec 7,42 M d'or investis (mesuré en base sur le compte réel). Le même
 * piège a déjà coûté un butin entier (la fouille écrasée par `advanceBase`, v0.772), et un
 * commentaire au-dessus de deux lignes indépendantes ne l'empêche pas : ici, les deux ne
 * peuvent plus être appelées séparément.
 */
export function healBuildings(raw: Building[]): { buildings: Building[]; goldRefund: number } {
  const fused = absorbRetired(raw);
  return {
    buildings: repackBuildingSlots(fused.buildings.filter((b) => !!buildingType(b.typeId))),
    goldRefund: fused.goldRefund,
  };
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
/** ⚠️ EXPORTÉE pour l’enceinte (`raid.ts`) : la règle « aucun niveau mort du 0 au 100 »
 *  vaut aussi pour les structures de défense, et une SECONDE implémentation de la même
 *  queue asymptotique finirait par diverger de celle-ci. */
export function beyondCap(
  level: number,
  capLevel: number,
  tailMax: number,
  tailHalf: number,
): number {
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
/** Plancher maximal, atteint PILE au niveau 100 (0,005 × 100).
 *
 *  ⚠️ IL VALAIT 0,85, ATTEINT AU NIVEAU 28, et c’était beaucoup trop (signalé par
 *  l’utilisateur : « les bonus me paraissent un peu haut »). Mesuré sur 20 000 pièces de
 *  boss, Autel monté au niveau du joueur : **54 à 56 %** tombaient DEUX raretés au-dessus
 *  de sa ligue aux niveaux 30-40, contre 1 % sans Autel — un bâtiment contournait « le sport
 *  est le plafond ». À 0,005/niveau : ~48 % à une rareté au-dessus (37 % sans Autel) et
 *  **4-5 %** à deux. Un vrai bonus, qui ne fait plus sortir de sa ligue.
 *  ⚠️ Un nerf ASSUMÉ, et une exception explicite à « on prolonge, on ne redistribue pas »
 *  (v0.731) — accordée par l’utilisateur. */
const BOSS_ROLL_FLOOR_CAP = 0.5;
/** Niveau de l'Autel des boss posé (0 si aucun). */
function bossAltarLevel(buildings: Building[]): number {
  return buildings.find((b) => b.typeId === BOSS_ALTAR_ID)?.level ?? 0;
}
/** L'Autel des boss est-il construit ? */
export function bossAltarBuilt(buildings: Building[]): boolean {
  return bossAltarLevel(buildings) > 0;
}
/** Plancher (0..1) appliqué aux pièces de boss selon le NIVEAU de l’Autel — il décale leur
 *  RARETÉ de `plancher × ROLL_FLOOR_RANKS` rangs (cf. `items.ts`). Linéaire jusqu’au
 *  niveau 100 : chaque niveau apporte quelque chose, aucun ne fait sortir de sa ligue. */
export function bossAltarRollFloor(buildings: Building[]): number {
  const lvl = bossAltarLevel(buildings);
  const per = buildingType(BOSS_ALTAR_ID)?.effect?.bossRollFloorPerLvl ?? 0;
  const capLevel = per > 0 ? BOSS_ROLL_FLOOR_CAP / per : 0;
  // La queue reste SOUS 1 : un roll parfait ne doit jamais être garanti.
  return Math.min(BOSS_ROLL_FLOOR_CAP, lvl * per) + beyondCap(lvl, capLevel, 0.12, 55);
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
/** Un bâtiment a-t-il un effet qui SCALE avec le niveau ? → est-il améliorable.
 *
 *  ⚠️ **DÉRIVÉ DE `perLevelLabel`, plus d'une liste d'ids.** La version d'avant lisait
 *  `resource || effect non vide`, ce qui ratait l'ÉQUIPEMENTIER (retiré depuis) — d'où un
 *  `if (typeId === 'outfitter')` greffé à côté. Deux bâtiments portaient alors un champ d'effet **jamais lu**
 *  (`guildRosterPerLvl`, `trainSpeedPerLvl`) dont le SEUL rôle était de passer ce test :
 *  du code décoratif qui pilote du comportement, exactement le piège que ce projet
 *  documente (le rôle ÉCLAIREUR déclaré et consommé nulle part, v0.757).
 *
 *  La vraie question est « ce bâtiment sait-il dire ce qu'un niveau CHANGE ? » —
 *  c'est-à-dire `perLevelLabel`, déjà obligatoire pour chaque type (test dédié). Un
 *  bâtiment muet n'est plus seulement illisible : il est aussi figé, et c'est cohérent. */
export function buildingScales(typeId: string): boolean {
  const t = buildingType(typeId);
  return !!t && perLevelLabel(t) !== '';
}
export function canUpgradeBuilding(b: Building, playerLevel: number): boolean {
  return buildingScales(b.typeId) && b.level < playerLevel;
}

/** Production par heure d'un filon à son niveau (0 pour les utilitaires). */
export function buildingProdPerHour(b: Building): number {
  const t = buildingType(b.typeId);
  return t?.prodPerHrPerLvl ? b.level * t.prodPerHrPerLvl : 0;
}

/** Heures de production qu'un bâtiment de ce niveau peut stocker. ⚠️ PROPRE au
 *  bâtiment : c'est SON niveau qui la règle, plus un Entrepôt tiers. */
export function storageHoursFor(level: number): number {
  return BUILD.storageHours * (1 + BUILD.storagePerLvl * Math.max(0, level));
}

/** Capacité de stockage (au-delà, la production sature → pas de perte punitive). */
export function buildingStorageCap(b: Building): number {
  return buildingProdPerHour(b) * storageHoursFor(b.level);
}

/** Ressource ACCUMULÉE depuis la dernière récolte, plafonnée au stockage (entier). */
export function buildingAccrued(b: Building, now: number): number {
  const perHr = buildingProdPerHour(b);
  const hours = Math.max(0, (now - b.collectedAt) / BUILD.hourMs);
  return Math.floor(Math.min(perHr * hours, buildingStorageCap(b)));
}

/** Somme des ressources prêtes à récolter, par ressource. */
export function collectable(buildings: Building[], now: number): Record<BuildResource, number> {
  const acc: Record<BuildResource, number> = {
    dust: 0,
    stone: 0,
    energy: 0,
    parchemins: 0,
    fragments: 0,
    ink_dust: 0,
    summon: 0,
    keys: 0,
  };
  for (const b of buildings) {
    const t = buildingType(b.typeId);
    if (!t?.resource) continue; // utilitaires : ne produisent rien
    acc[t.resource] += buildingAccrued(b, now);
  }
  return acc;
}

/** Nouveau `collectedAt` d'un filon APRÈS récolte. On n'avance le compteur QUE du
 *  temps correspondant aux unités ENTIÈRES récoltées → le reliquat fractionnaire est
 *  REPORTÉ au lieu d'être jeté. Conséquences : (1) plus de perte de fraction à chaque
 *  récolte ; (2) un filon LENT (0,16/h) n'est plus « affamé » quand on récolte souvent
 *  pour un filon rapide (sa fraction < 1 est conservée, il finit par cumuler son unité).
 *  Filon sans unité entière prête (ou utilitaire) → `collectedAt` inchangé (rien jeté). */
export function nextCollectedAt(b: Building, now: number): number {
  const perHr = buildingProdPerHour(b);
  if (perHr <= 0) return b.collectedAt; // utilitaire : rien à récolter
  const cap = buildingStorageCap(b); // en unités
  const stored = Math.min((perHr * (now - b.collectedAt)) / BUILD.hourMs, cap);
  const collected = Math.floor(stored);
  if (collected <= 0) return b.collectedAt; // rien récolté → on garde l'accumulation en cours
  const remaining = stored - collected; // 0 ≤ remaining < 1 : reporté dans le stock
  return now - (remaining / perHr) * BUILD.hourMs;
}
