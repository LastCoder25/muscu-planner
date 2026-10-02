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
- [ ] **3. La traversée et l'île 2** (~5 j) — héros/champions/milice rattachés à une île,
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
- [ ] **4. Les menaces de l'île 2** (~3 j) — nids qui se multiplient, embuscades ; archives.

### Étoffer

- [ ] **5. Îles 3, 4 et 5** (~3-4 j chacune) — une à la fois, quand le compte admin y arrive.
- [ ] **6. Équilibrage du niveau 1 au 100** (~3 j) — parties simulées complètes (économie,
      défense, durée de chaque île, 5 îles de rente).
- [ ] **7. Bascule de tous les comptes** (~2 j) — départ de l'île 1, compensation.
