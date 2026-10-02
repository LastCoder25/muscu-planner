# Carte de conquête : l'archipel — roadmap

> Conçue avec l'utilisateur le 2026-10-01. **Étapes 0 à 2 quater faites** (v1.15.0, 2026-10-02).
> Prochaine étape : **3 — la traversée et l'île 2**, sur le compte admin seul.
> Page visuelle (carte dessinée, tableaux) : https://claude.ai/artifact/JK5zL5fjbPojaXwpM8ZPJc

## Pourquoi

La carte unique s'étend et les trajets grandissent avec le niveau (×3 au niveau 100) : le jeu
devenait long à gérer et les lieux à attaquer trop loin. L'archipel garde chaque île petite,
fait avancer le joueur sans jamais régresser, et laisse derrière lui des îles qui ne demandent
plus rien.

## Le modèle

- **5 îles, une par tranche de 20 niveaux, deux rangs chacune.** L'île 1 est la carte actuelle.
  | Île | Niveaux | Rangs des lieux | Menace | Forteresse portuaire |
  |---|---|---|---|---|
  | 1 · Brigands | 1-20 | Bronze, Argent | 2 camps de brigands (pillent ce qui n'est pas récolté, attaquent les lieux fixes) | Le Fort des pillards |
  | 2 · Bêtes | 21-40 | Or, Or noir | 3 nids (un nid non détruit en fait naître un autre ; embuscades) | La Tanière-port |
  | 3 · Morts-vivants | 41-60 | Légendaire, Demi-dieu | 2 cimetières (les morts se relèvent) + la citadelle actuelle | Le Bastion des marées |
  | 4 · Seigneur de guerre | 61-80 | Divin, Divin ancestral | 3 camps de guerre, armée mobile qui vise le moins défendu, convois | Le Fort du seigneur |
  | 5 · Maudite | 81-100 | Divin céleste, Tout-puissant | 3 sanctuaires maudits (failles corrompues, invasions combinées) | La Citadelle maudite (puis sans fin) |
- **Une seule île active** : toute l'activité y vit, failles comprises (le gacha se farme là où
  on joue). **Lieux ET armées tirent leur rang au hasard entre le rang MINIMUM de l'île et le
  rang du joueur**, jamais au-dessus du joueur, plafonné au rang max de l'île (précisé le
  2026-10-02, option « borné au joueur ») ; au-delà ils restent au plafond, ce qui pousse à
  avancer. Un joueur arrivé sous le rang d'entrée ne voit que des lieux de son rang.
- **Une île en quatre temps** : débarquer au **port d'arrivée** (c'est la base de l'île) →
  prendre **2 avant-postes** sur le chemin → détruire les **objectifs secondaires** → abattre
  la **forteresse portuaire**, qui devient le port de départ.
- **Pacifier** = objectifs secondaires + forteresse détruits. Ensuite plus aucune attaque.
- **On ne recule jamais** : une base reste à toi (siège perdu = dégâts, réparation), une île
  débloquée reste ouverte.

## Les règles décidées

1. **Trajets** : plus de multiplicateur de niveau ; distance mesurée en part de l'île ; 2 h
   aller au maximum depuis un point tenu (4 h aller-retour). L'Avant-poste règle la vitesse.
2. **La récompense suit la difficulté**, pas la distance (déjà la règle depuis la v0.1153).
3. **Traversée** : ~2 h, **un départ chaque heure**, depuis la forteresse portuaire abattue.
   Pas de niveau minimum : la forteresse fait office de porte.
4. **Bâtiments en continuité** sur toutes les îles (même niveau, montent jusqu'au 100) ; un
   bâtiment propre à une île repartirait de zéro (probablement aucun). Panthéon et Guilde dans
   chaque base. **Ressources en stock unique.**
5. **Héros, champions et milice sont sur une île à la fois.** Un nouveau champion apparaît sur
   l'île active. **Milice : une réserve par île**, produite par la Caserne sur place, qui
   continue de produire quand le joueur est parti.
6. **Trêve de débarquement sans durée fixe** : le port n'est assiégé qu'une fois son enceinte
   prête (règle actuelle), puis au rythme du sport ; les avant-postes au rythme d'utilisation
   de la carte.
7. **Forteresse portuaire** : **verrou + affaiblissement**. Elle ne s'attaque qu'après 2
   objectifs secondaires détruits ; intacte, un rang au-dessus du plafond de l'île et une
   troupe de 12 ; chaque objectif détruit la fait redescendre ; tous détruits, une troupe de
   **8 champions de référence au plafond de l'île**.
8. **Objectifs secondaires** : troupes de **3** (les premiers), puis **4** (les derniers).
9. **Récompenses** : forteresse abattue → runes (couleur selon l'île) + sceaux d'ascension au
   rang de l'île ; premier débarquement → l'équivalent de **10 tirages en pierres de mana**
   (dérivé du prix d'un tirage). Jamais d'XP ni de tickets sur la carte.
10. **Île pacifiée** : ses **spécialités produisent à plein** ; le **socle (mine, source de
    mana) à 25 %, sans crans**.
11. **Mine tenue recalée** à un passage toutes les **24 h** (au lieu de 8 h), **en même temps
    que l'archipel, pas avant**.
12. **Comptes existants** : tout le monde repart de l'île 1 ; bâtiments conservés, lieux tenus
    compensés.
13. **Donjons, boss, Labyrinthe restent à part.**
14. **Mis de côté** : hameaux, quêtes, hôpitaux de campagne.
15. **Développement en parallèle sur le compte admin** (interrupteur), étoffé au fur et à
    mesure ; bascule de tous les comptes à la fin.

## Les lieux fixes

Aucun ne s'améliore : production selon l'effectif (jusqu'à 5, champions et miliciens ; camp :
3 champions) et les crans d'ancienneté (jusqu'à 10, +5 % chacun). ⚠️ Aujourd'hui un lieu tenu
produit au **niveau du héros** ; dans l'archipel il produira au **rang de son île**.

**Existants** (débits actuels) : ⛏️ mine d'or (une mission de mine / 8 h, à recaler à 24 h) ·
🎯 camp d'entraînement (XP champions + pièces, la forge y est fusionnée) · 🌿 jardin
(consommables) · 🗼 tour de guet (−20 % trajets, préavis +50 %) · 📜 scriptorium (runes) ·
⛲ source de mana (½ faille refermée / jour).

**À inventer** (débits décidés à l'étape 0) :
| Lieu | Produit | Débit | Apport mesuré |
|---|---|---|---|
| 📖 Archives | Clés du Labyrinthe | 1 entrée du palier de l'île / 2 jours | +20 à +24 % |
| 💀 Ossuaire | Sceaux de champion au rang de l'île | 1 / 3 jours | +13 % |
| 🛡️ Arsenal | Sceaux d'objet au rang de l'île | ⅙ de ruine / jour | +20 % |
| 🔮 Sanctuaire d'invocation | Pierres d'invocation | 1 tentative de boss / 2 jours | +18 % |
| 🪬 Autel des runes | Runes multicolores à partir du bleu | 1 / 2 jours | modéré |

**Répartition** (socle mine + camp + source de mana sur chaque île ; 2 lieux sur le chemin
servent d'avant-postes) :

- Île 1 : mine, camp, source de mana, jardin, tour de guet, scriptorium (la carte actuelle).
- Île 2 : socle + tour de guet + **archives**.
- Île 3 : socle + jardin + **ossuaire**.
- Île 4 : socle + **arsenal** + **sanctuaire d'invocation**.
- Île 5 : socle + scriptorium + **autel des runes**.

## Étape 0 — mesures (2026-10-01)

Faites sur les vraies fonctions (`campWinPct` avec champions de référence équipés, 120 combats
par case ; `stonesPerDay`, `fullGoldPerDay` ; débits des sources actuelles). Sonde supprimée.

- **Forteresse affaiblie au max (troupe 8, au plafond de l'île)**, % de victoire selon
  l'équipe au plafond : 5 champions **0 / 28 / 8 / 5 / 2 %** (îles 1→5), 8 champions
  **97 / 100 / 100 / 88 / 96 %**. Équipe 10 niveaux sous le plafond : 12 champions 71-100 %.
  **Intacte (rang au-dessus, troupe 12)** avec 12 champions : **0 / 0 / 8 / 51 / 82 %** — un
  rang pèse peu en fin de partie, d'où le verrou.
- **Objectifs secondaires** (niveau du joueur) : troupe 3 → 3 champions 86-100 %, 2 champions
  0-28 % ; troupe 4 → 3 champions 3-81 %, 5 champions 99-100 %.
- **Rente des îles pacifiées** (1 mine + 1 source chacune), en part du revenu complet / de 2
  failles par jour : pleine cran 10 → or **+39 % (niv 30) à +247 % (niv 90)**, mana +27 à
  +87 % ; socle à 25 % sans cran → or **+7 à +41 %**, mana **+4 à +15 %** (retenu).
- **⚠️ Déjà aujourd'hui** : la mine tenue à 3 (niveau du héros) rend **48 % du revenu complet
  au niveau 30, 94 % au 50, 136 % au 90**, hors modèle `goldSink`. Recalage à 24 h prévu avec
  l'archipel (16 à 46 %).
- **Trajets** sans facteur de niveau : 30 min à 25 unités, 1 h à 35, **2 h à 54** d'un point
  tenu → rayon d'une île.
- **Milice par île** (Caserne au niveau du joueur) : 11 (niv 20) · 18 · 25 · 31 · 38 (niv 100).
- **Champions** (joueur régulier, vrai tirage) : 3 (niv 10) · 9 (20) · 15 (30) · 20 (40) ·
  26 (60) · 30 (80) · 32 (100).

## La roadmap

### Fondations

- [x] **0. Conception figée** (~2 j) — mesures ci-dessus, décisions prises.
- [x] **1. Le mode archipel, île 1** (~3 j) — interrupteur admin (ce compte seul) ; la carte
      devient l'île 1 : rangs plafonnés à Argent, trajets sans multiplicateur de niveau, Avant-poste
      = vitesse ; production des lieux au rang de l'île ; vue d'ensemble de l'archipel.
      **Livré v1.9.0 (2026-10-02)** : `src/lib/archipelago.ts` (îles, `mapPlayerLevel`,
      `mapOutpostLevel`), `ExpeditionMap.archipel`, panneau `ArchipelPanel.vue` sur la carte (admin,
      avec l'interrupteur), `setArchipelMode` au store. Rayon de l'île = celui de l'Avant-poste 3
      (≤ 54 unités ; la 1re citadelle, à 55, reste hors de l'île 1). Basculer une carte retire au
      tick suivant les lieux au-dessus d'Argent. Test `archipelago.test.ts` (12, 9 mutations
      rouges). ⚠️ Non couvert par une porte : le câblage du store (production plafonnée, reprises
      au rang de l'île).
- [x] **1 bis. Les îles dessinées** (demandé le 2026-10-02, v1.10.0) — chaque île entourée de
      mer avec SA silhouette (écrite à la main par île : ronde à baie, longue et déchiquetée,
      croissant, trois lobes, hérissée), un décor par menace (camps de brigands · pins et ossements
      · cimetières, arbres morts et mares · camps de guerre, étendards et dunes · cristaux et failles
      de lave), le port d'arrivée au fond de la baie relié à la base par une route, la forteresse
      portuaire dessinée sur le cap opposé, et une vraie carte de l'archipel (les 5 silhouettes
      reliées par les routes de traversée, fiche de l'île touchée) à la place des tuiles.
      `src/lib/islandTerrain.ts` (pur, ne dépend que du numéro de l'île : même île pour tout le
      monde), `IslandTerrain.vue`. La côte ne passe jamais sous 60 unités (zone des lieux 54).
      ⚠️ La forteresse n'est encore qu'un DÉCOR : elle devient attaquable à l'étape 2.
- [x] **2. Pacifier l'île 1** (~4 j) — objectifs secondaires (camps de brigands), forteresse
      portuaire (verrou, affaiblissement, calage), île pacifiée (plus d'attaques ; spécialités à
      plein, socle à 25 % sans crans), recalage de la mine tenue à 24 h.
      **Livré v1.11.0 (2026-10-02)** : `src/lib/islandConquest.ts` — objectifs secondaires posés
      autour du cap (troupes 3 puis 4, faction de l'île, niveau du joueur plafonné), forteresse sur le
      cap (verrouillée jusqu'à 2 objectifs abattus ; 12 → 8 champions de référence, un rang au-dessus
      → le plafond), abattus pour toujours (`archipel.destroyed`) ; tout abattu → `pacifiedAt` :
      plus aucune reprise ni raid (`gateAttacks`, `captureControl`, `holdControl`). Règle de production
      posée sur chaque lieu fixe (`yieldMult`, `flatTier`, réserve mise de côté avant tout changement) :
      mine à 24 h en mode archipel, socle (mine, source) à 25 % sans crans une fois pacifiée. Fiche du
      lieu et progression dans le panneau Archipel. Test `islandConquest.test.ts` (12, 11 mutations
      rouges). **Complété v1.12.0** : sur une île, les reprises viennent des camps (`attackSlow` :
      ×1 tous debout, puis (n+1)/debout, plus de ralentissement « citadelle cachée ») ; les camps de
      brigands PILLENT la réserve non récoltée des bâtiments de la base (`brigandPillage`, en moyenne
      toutes les 36 h par camp debout, rapport dans la boîte) ; plus aucun siège de la base sur une île
      pacifiée (`raidsEnabled` prend `pacified`, requis). Reste : les récompenses (étape 3). Non vu à l'écran (le compte de smoke n'est pas
      en mode archipel).

### Traverser

- [x] **2 bis. Bien délimiter les îles** (demandé le 2026-10-02) — aucun lieu ne doit apparaître
      hors de la côte. Aujourd'hui les lieux tirés restent dans 54 unités et la côte ne passe jamais
      sous 60, mais ce qui est posé à part n'est pas borné par la côte : citadelles (55 à 100, cachées
      sur une île), armées en marche, forteresse (sur le cap). À faire : un garde unique « sur l'île »
      (`onIsland`) appliqué à tout ce qui est posé ou dessiné en mode archipel, avec un test qui balaie
      les cinq îles.
      **Livré v1.13.0** : mesuré, seules les CITADELLES tombaient en mer (posées de 55 à 100). Sur une
      île il n'y en a plus (`syncCitadels` les retire, sauf pendant un assaut) : ce sont les camps de
      l'île qui attaquent. Tout le reste tient déjà sur la terre (lieux tirés ≤ 54, côte ≥ 60,
      armées en marche nées dans le rayon de détection borné à la carte). `islandBounds.test.ts` joue
      dix jours de carte sur les cinq îles × 3 graines, armées comprises, et exige chaque lieu sur la
      terre avec 3 unités de marge (2 mutations rouges).
- [x] **2 ter. Les rangs bornés par l'île** (précisé le 2026-10-02) — **Livré v1.14.0** :
      `archipel.levelFloor` (= `Island.minLevel`, posé par `archipelOn` ; absent = 1) ;
      `riftLevelFor` prend un plancher et ne tire plus de rang sous celui de l'île (sauf joueur encore
      en dessous) — lieux, failles, points fixes (`controlLevel`) et attaquants des reprises
      (`attackerLevel` prend la carte) ; les sièges de la base sur une île restent dans la tranche
      (`islandRaidBand`, appliquée après les tirages : hors archipel, armée identique au bit près).
      Test `islandRanks.test.ts` (8, 11 mutations rouges). ⚠️ Limite connue : un lieu à UN garde
      plafonne en difficulté vers 80 (niveau max des ennemis) — sur l'île 5 il s'affiche un rang sous
      l'île ; à traiter avec l'île 5.
- [x] **2 quater. Densité des lieux sur une île** (question du 2026-10-02 : « vu la taille de
      l'île et le temps de trajet max, il faut adapter le nombre de lieux ? ») — **Livré v1.15.0** :
      mesuré, l'île 1 (rayon ~51) portait **22 lieux** (9 tirés + 4 failles + 9 fixes) sur ~60 %
      de la surface d'une carte ordinaire qui en porte 28 (22 tirés + 6 points fixes) : 1,3× plus
      dense, et ce sont les lieux FIXES qui débordaient (le quota suivait la surface sans les
      compter). Une île vise désormais la densité de la carte ordinaire, **lieux fixes compris**
      (`ISLAND_DENSITY`, `mapQuota(outpost, islandFixed)`, `islandFixedOf`) : **17 lieux** sur
      l'île 1 → **6 tirés + 2 failles** pendant la conquête, **8 + 3** une fois objectifs et
      forteresse abattus. La carte ordinaire ne bouge pas. Test `islandDensity.test.ts` (cinq îles
      × 3 graines × 10 jours, 3 mutations rouges). ⚠️ Moins de lieux d'économie (4 au lieu de 6) et
      2 failles au lieu de 4 sur une île : or et mana à re-mesurer avec l'équilibrage (étape 6).
- [x] **3. La traversée et l'île 2** (~5 j) — héros/champions/milice rattachés à une île,
      traversée avec un départ chaque heure, débarquement, base au port, zone jouable à portée des
      points tenus, avant-postes, récompenses (forteresse, premier débarquement).
      **3a livrée v1.17.0 (2026-10-02) — la traversée** (`src/lib/crossing.ts`), décisions de
      l'utilisateur : le héros et **tous les champions libres** embarquent ; les lieux tenus de
      l'île quittée **produisent toujours, récoltés à distance** ; on **retraverse dans les deux
      sens** vers toute île ouverte (visitée, ou suivante d'une forteresse abattue). Départ à
      l'heure pile suivante, 2 h de mer, débarquement au tick de la carte. L'île quittée est
      RANGÉE telle quelle dans `ExpeditionMap.islands` (son `archipel` compris) ; l'île
      d'arrivée sort de sa réserve ou naît peuplée (`createMap` au rang de l'île). Un champion
      resté sur une autre île porte `elsewhere` → indisponible (`'away'`, « ⛵ autre île »).
      Refus (`crossingBlocker`, source unique) : île fermée, déjà en mer, héros en route, ou
      troupes en marche vers/depuis un lieu fixe (leur arrivée se règle sur la carte active).
      Récompenses en coffres dans la boîte : **premier débarquement = 10 tirages de mana**
      (dérivé de `pullCost`), **forteresse abattue = 2 + n° de l'île runes et 3 sceaux de
      champion au rang max de l'île** (une fois, `archipel.chestAt` ; le coffre de l'île 1 tombe
      aussi pour qui l'avait déjà abattue). Panneau Archipel : bouton de traversée (heure de
      départ, d'arrivée, embarqués), bandeau « en mer », champions restés sur chaque île.
      Test `crossing.test.ts` (16, 9 mutations rouges).
      ⚠️ Limites connues : une île rangée est FIGÉE (ni apparitions, ni failles, ni reprises —
      une île quittée non pacifiée ne subit plus d'attaques, et ses points arrêtent de produire à
      l'heure d'une attaque prévue) ; la **milice reste une réserve unique** ; base au port,
      avant-postes et zone à portée des points tenus restent à faire (3b). Non vu à l'écran
      avec une vraie traversée (le compte de smoke n'est pas en mode archipel).
      **3b (1/4) livrée v1.18.0 — une réserve de milice par île** (règle 5) : la milice NE
      TRAVERSE PAS. La réserve de l'île active vit dans `base.militia` ; au débarquement,
      celle de l'île quittée est rangée avec sa carte (`ExpeditionMap.militia`, jamais sur la
      carte active) et celle de l'île d'arrivée revient (vide sur une île neuve). La Caserne
      produit aussi pour les îles rangées (`produceIslandMilitia`, bornée par son plafond moins
      les miliciens postés sur CETTE île). Le panneau Archipel dit la réserve de chaque île.
      Tests `crossing.test.ts` (+3, 5 mutations rouges) et montage du panneau (traversée +
      milice, vérifié non creux). Panneau vu au banc Playwright à 344/390/600 px (0 débordement).
      Reste pour 3b : zone à portée des points tenus.
      **3b (2/4) livrée v1.19.0 — deux avant-postes et 4 h aller-retour au plus** (décisions
      de l'utilisateur, 2026-10-02 : « ok pour tout », « 4h aller/retour depuis la base vers les
      bords de la carte au max »). La Tour de guet et le Camp d'entraînement de l'île sont posés
      SUR la route base → forteresse (`outpostSpots`, déplacés tant qu'ils sont ennemis, jamais
      une fois tenus ; marque `ControlState.outpost`, libellé « · avant-poste »). Les objectifs
      restent verrouillés tant que les DEUX ne sont pas tenus (refus `objectiveLocked`) ; tenus
      tous les deux, ils servent de relais : la forteresse passe de 2 h à 1 h 15 d'aller
      (`FORTRESS_RELAY_LEG_MIN`). Aucun lieu d'une île à plus de 2 h d'aller (`islandDistNorm`,
      `ISLAND_MAX_LEG_MIN`) : seule la forteresse était au-delà. Base : le dessin actuel au
      centre, relié au port, est gardé. Tests `islandOutposts.test.ts` (8, mutations rouges).
      Non vu à l'écran en vraie partie (le compte de smoke n'est pas en mode archipel).
      **v1.20.0 — la forteresse est la dernière grande expédition** (décision de l’utilisateur,
      2026-10-02 : « mets la forteresse plus loin si besoin ») : 3 h d’aller (`FORTRESS_LEG_MIN`),
      seul lieu hors des 4 h aller-retour ; les deux avant-postes tenus la ramènent à 2 h
      (`FORTRESS_RELAY_LEG_MIN`, au lieu de 1 h 15).
      **v1.21.0 — la forteresse prise se TIENT** (décisions de l’utilisateur, 2026-10-02) : elle
      n’est plus rasée (`takeFortress`) — toute l’équipe gagnante y reste, garnison SANS LIMITE
      (champions et miliciens, `seatsOf` = ∞, `garrisonCap`), et le héros, s’il combattait, y
      est POSTÉ (`ControlState.hero`) jusqu’à son rappel (« Rappeler le héros », il rentre à son
      pas : `heroReturnAt`). Elle compte comme abattue pour la pacification, n’est JAMAIS reprise
      et ne produit rien. La traversée part d’elle : sa garnison de champions et le héros
      embarquent (`boardFromFortress`), les miliciens restent. Tests `fortressHeld.test.ts`
      (6, 5 mutations rouges). Fiche non vue à l’écran en vraie partie.
      **Étape 3 close (2026-10-02)** : la « zone à portée des points tenus » est couverte par la
      limite de 2 h d’aller (tout lieu d’une île est à 2 h au plus de la base, et une sortie
      depuis un point tenu raccourcit encore) ; la base garde son dessin au centre, reliée au
      port (accord de l’utilisateur).
- [x] **4. Les menaces de l'île 2** (~3 j) — nids qui se multiplient, embuscades ; archives.
      **4a livrée v1.22.0 — les nids** (décisions de l’utilisateur, 2026-10-02) : chaque nid
      debout en pond un nouveau tous les 3 jours (`NEST.layMs`), 6 au plus sur l’île ; au plafond
      la ponte est perdue. Les nids nés en route se posent à 10 unités au moins des autres lieux
      fixes (`nestSpot`), troupe de 3, et ne prennent pas de place dans la densité de l’île
      (une conséquence de la menace). TOUS les nids debout comptent pour pacifier ; le verrou de
      la forteresse reste à 2 abattus. Les lieux à 25 unités d’un nid debout ont des routes
      dangereuses (`Poi.nestPeril`, dérivé, embuscades doublées). Tests `islandNests.test.ts`
      (9, 7 mutations rouges).
      **4b livrée v1.23.0 — les archives et les points fixes par île** : l’île 2 porte le socle
      (mine, camp, source de mana) + tour de guet + **archives** (`controlKindsOf`, table
      `ISLAND_KINDS` ; île 1, carte ordinaire et îles 3-5 gardent la liste d’origine pour
      l’instant). Les archives produisent des clés du Labyrinthe : une entrée du palier de l’île
      (`labyKeyPriceAt` au niveau de l’île) toutes les 48 h au complet (`archiveHoursPerEntry`),
      moins vite avec moins d’archivistes, versées toutes seules comme le reste (rapport
      « N clés du Labyrinthe »). Tests `islandArchives.test.ts` (3, 5 mutations rouges).

### Étoffer

- [x] **5. Îles 3, 4 et 5** (~3-4 j chacune) — une à la fois, quand le compte admin y arrive.
      **Île 3 livrée v1.24.0 (choix par défaut, l’utilisateur a dit « Go »)** : 2 cimetières
      (troupe 3) + la **citadelle des morts** (troupe 4, `Island.keystone`, dernier objectif).
      Un cimetière abattu **se relève 3 jours plus tard** tant que la citadelle tient
      (`RISE`, `raiseDead`, `archipel.razedAt`) ; la citadelle abattue, plus rien ne se
      relève. Deux façons de faire : la citadelle d’abord, ou les trois en moins de 3 jours.
      Points fixes : socle + jardin + **ossuaire** + tour de guet (⚠️ écart à la répartition :
      la tour reste, c’est un des deux avant-postes). L’ossuaire produit le prix d’une
      tentative de boss de l’île (`bossSummonCost`) en pierres d’invocation toutes les 48 h
      au complet. Tests `islandDead.test.ts` (9, 8 mutations rouges).
      **Île 4 livrée v1.25.0 (choix par défaut)** : 3 camps de guerre ; tant qu’un camp tient,
      l’**armée mobile** du seigneur de guerre sort en moyenne toutes les 36 h / camps debout
      (`WARLORD`, `warlordRaids`, `archipel.warAt`) et AVANCE l’attaque prévue du lieu tenu le
      MOINS défendu (plus petite garnison, champions et miliciens ; départage tiré) — jamais ne
      la recule. Points fixes : socle + tour de guet + **arsenal** (sceaux d’objet ⚜️ : la part
      d’objet d’une ruine toutes les 72 h au complet) + **cercle d’invocation** (mana : le prix
      d’un tirage toutes les 48 h au complet ; nommé « cercle » car « sanctuaire d’invocation »
      est déjà un lieu de récolte). (convois faits en v1.27.6, ci-dessous ; à
      concevoir) ; débits de l’arsenal et du cercle à revoir à l’étape 6. Tests
      `islandWarlord.test.ts` (12, 10 mutations rouges).
      **Île 5 livrée v1.26.0 (choix par défaut)** : 3 sanctuaires maudits. Tant qu’un tient,
      (1) les **failles naissent corrompues** — vieillies d’un jour par sanctuaire debout, une
      seule fois (`CURSE`, `corruptRifts`, `Poi.corrupt`) : plus peuplées, elles débordent plus
      tôt ; (2) les **invasions combinées** frappent TOUS les lieux tenus à la fois, en moyenne
      toutes les 72 h / sanctuaires debout (`INVASION`, même horloge `warAt` que l’armée de
      l’île 4, jamais une attaque reculée). Points fixes : socle + tour de guet + scriptorium +
      **autel des runes** (sceaux de champion 🔱 au rang du joueur : la part de champion d’une
      ruine toutes les 72 h au complet). Le « puis sans fin » est fait en v1.27.7
      (ci-dessous). Tests `islandCursed.test.ts` (10, 12 mutations rouges).
- [x] **6. Équilibrage du niveau 1 au 100** (~3 j) — parties simulées complètes (économie,
      défense, durée de chaque île, 5 îles de rente).
      **6a livrée v1.27.0 — les spécialités réalignées sur l’étape 0.** Les v1.24-1.26 avaient
      mal lu le tableau « Les lieux fixes » : les produits ET les débits sont remis à ceux décidés
      et mesurés — ⚱️ ossuaire = 1 sceau de champion au rang de l’île / 3 jours (il donnait des
      pierres d’invocation) ; ⚒️ arsenal = ⅙ de ruine / jour (il en donnait le double) ; 🌀 cercle
      d’invocation = 1 tentative de boss / 2 jours en pierres d’invocation (il donnait du mana) ;
      🪬 autel des runes = 1 rune multicolore / 2 jours (il donnait des sceaux de champion ;
      « à partir du bleu » non fait). Tests réécrits (récolte toutes les 6 h comme le jeu,
      `test/helpers/controlHarvest.ts`), 7 mutations rouges.
      **6b v1.27.1 — la rente des cinq îles pacifiées, mesurée et gardée** (`archipelRent.test.ts`) :
      garnisons pleines, crans montés, au niveau 100 : or **+28 %** du revenu complet (dans la
      fourchette de l’étape 0, +7 à +41 %), mana **+25 %** de deux failles/jour (un peu au-dessus
      des +4 à +15 % de l’étape 0, mesurés à garnison 3 : 19 % à 3), pierres d’invocation
      **+30 %** d’une journée de donjons, **~0,7 run** de Labyrinthe/jour. Aucun réglage changé.
      **6c v1.27.2 — la durée de chaque île, simulée** (champions de référence du niveau du
      joueur, nombre de champions du vrai tirage, joueur régulier 700 XP/jour) : niveau où la
      forteresse affaiblie devient prenable à 70 % — île 1 **19** (~26 j) · île 2 **30** (~66 j)
      · île 3 **48** (~167 j) · île 4 **61** (~269 j) · île 5 **81** (~474 j) ; joueur
      tranquille 400 XP/j : 47 · 115 · 293 · 472 · 829 jours. Avant-postes et objectifs tombent
      dès l’entrée de chaque île. ⚠️ Îles 4 et 5 : une armée de 12 champions prend la forteresse
      dès le niveau d’entrée (un rang pèse peu en fin de partie, déjà vu à l’étape 0) — leur
      durée est donc bornée par le NIVEAU, pas par la forteresse. Gardé par
      `archipelFortress.test.ts` (8 champions au plafond la prennent affaiblie, 5 non, intacte
      elle tient ; 3 mutations rouges).
      **6d v1.27.3 — la défense des lieux tenus sous les menaces des îles 4 et 5, mesurée**
      (`garrisonHold`, champions de référence, niveaux 70 et 90) : un lieu repousse une reprise
      **22-25 %** avec 1 champion, **77-79 %** avec 3, **90 %** avec 5 (le plafond de
      suspense). Une reprise tombe d’ordinaire tous les 1 à 3 jours par lieu ; l’armée mobile
      de l’île 4 (3 camps : une sortie / 12 h) porte le lieu le MOINS défendu à ~2 attaques
      par jour, les invasions de l’île 5 (3 sanctuaires : une / 24 h) portent TOUS les lieux à
      ~1 par jour. Avec 3 champions par lieu, ~0,4 lieu perdu de plus par jour sur l’île 4,
      ~1 sur l’île 5 — une vraie pression, mais BRÈVE : les objectifs de ces îles se prennent
      dès l’entrée (6c), et les abattre éteint la menace. Aucun réglage changé.
      **v1.27.5 — l’autel des runes « à partir du bleu »** (tableau de l’étape 0) : ses runes
      sont marquées (`RuneBank.blessed`, comptées dans le stock) et s’ouvrent avec la table
      commune SANS le vert, renormalisée (`BLESSED_ODDS` : bleu 73 %, violet 23 %, doré 3 %),
      en premier ; la rune gratuite d’un lot reste ordinaire. Le stock le dit. Tests
      `runeBlessed.test.ts` (5, 6 mutations rouges).
      **v1.27.6 — les convois de l’île 4** (choix par défaut) : tant qu’un camp de guerre
      tient et que la forteresse est debout, un convoi de ravitaillement part d’un camp en
      moyenne toutes les 24 h / camps debout (±25 %) et marche 8 h jusqu’à la forteresse
      (`CONVOY`, `warlordConvoys`, `archipel.convoyAt/convoys/delivered`). C’est une bande en
      marche (`Poi.convoy`) : on l’intercepte comme celle d’une faille, même force, mais elle
      paie sa CARGAISON (l’or d’une mission de mine de son rang, au prorata de ce qu’on a
      abattu si on est repoussé ; `resolveConvoy`), jamais de mana, sans toucher au
      débordement. ARRIVÉ, il renforce la forteresse d’un champion de référence (4 au plus,
      `convoyBonus`). ⚠️ L’arrivée se tranche une fois : le convoi reste sur la carte
      jusque-là, et un voyage qui l’a battu avant compte même si son rapport arrive après
      (`convoyVanquished`). Tests `islandConvoys.test.ts` (9, 12 mutations rouges). Fiche
      non vue à l’écran en vraie partie.
      **v1.27.7 — l’île 5, « puis sans fin »** (choix par défaut) : la Citadelle maudite
      prise, une **Brèche maudite** s’ouvre où se tenaient les sanctuaires (`ENDLESS`,
      `ENDLESS_ID`). Abattue, elle se rouvre 3 jours plus tard, plus forte d’un champion de
      référence (troupe 8 + crans, sans plafond), et chaque victoire dépose un coffre
      (`endlessReward` : runes 2 + cran, 8 au plus, et 1 sceau de champion au rang max). Elle
      n’attaque rien et ne défait pas la pacification. Lint : trois assertions inutiles des
      convois retirées. Tests `islandEndless.test.ts` (5, 8 mutations rouges). Non vue à
      l’écran en vraie partie.
- [ ] **7. Bascule de tous les comptes** (~2 j) — départ de l'île 1, compensation.
