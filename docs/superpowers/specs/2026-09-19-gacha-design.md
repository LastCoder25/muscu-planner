# Gacha de champions — étude de conception

**État : ÉTUDE, rien n'est implémenté.** Décisions prises avec l'utilisateur le 2026‑09‑19,
complétées le même jour après mesures en base et dans le code.

## L'intention

Tirer au sort des **champions** — bien moins forts que le héros — avec les **pierres de
mana** pour monnaie. Ils s'équipent, ont des compétences, et les doublons les renforcent.

## Décisions prises

| Sujet               | Décision                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Nom                 | **champion** (hors des mots déjà pris : héros, aventurier)                                    |
| Périmètre           | **Le gacha REMPLACE le recrutement d'aventuriers**                                            |
| Vocabulaire         | **Raretés nommées** (commun → primordial), **PAS de nouvelle échelle d'étoiles**              |
| Rang du champion    | **L'échelle de prestige du héros** (Bronze ★1 → …), **plafonnée au rang du héros**            |
| Taux                | **Toutes les raretés tirables**, aux taux d'un gacha (le plus haut ≈ 0,6 %)                   |
| Ce qui est plafonné | **le RANG**, jamais la rareté tirée                                                           |
| Chemin du champion  | **FIXÉ au tirage** — vrai gacha, le kit est son identité                                      |
| Évolution de rareté | **NON** — la rareté est figée, c'est le rang qui monte                                        |
| Duplicatas          | **Éveil** : magnitude du kit **ET** niveau de compétence (cf. plus bas)                       |
| Rôles par rareté    | **une version de chaque rôle à chaque rareté**, de plus en plus puissante                     |
| Budget de stats     | **plancher relevé à 20**, sommet inchangé à 106 (cf. plus bas)                                |
| Monnaie             | **Pierres de mana**                                                                           |
| Plafond de nombre   | **aucun sur la collection** ; la Guilde plafonne le **déploiement**                           |
| Équipement          | **PAS de gacha d'équipement** — les pièces se droppent (cf. plus bas)                         |
| Bâtiments           | **11 → 9** : Guilde, Centre de formation et Équipementier remplacés par **UN** (cf. plus bas) |
| Migration           | **wipe des aventuriers existants** (mesuré indolore, cf. plus bas)                            |
| Pity                | **indispensable** (soft + hard), calibré après les failles                                    |

## ⚠️ LES DEUX ÉCHELLES NE SE CONFONDENT PAS

C'est ce qui a débloqué la conception. Les étoiles étaient **déjà prises deux fois** dans
le projet (`rankStarStr` pour le rang, `jetStar` pour la qualité de tirage d'un objet) —
une troisième aurait été illisible.

|                          | Vient du      | Dit quoi                             | Plafonné par            |
| ------------------------ | ------------- | ------------------------------------ | ----------------------- |
| **Rareté** (nom)         | le **tirage** | la puissance et la profondeur du kit | rien — tout est tirable |
| **Rang** (★ de prestige) | le **combat** | où il en est de sa progression       | **le rang du héros**    |

Un champion **primordial** peut donc naître **Bronze ★1**. « Le sport est le plafond »
tient : ce qu'on gagne au tirage, c'est un potentiel ; ce qui le réalise, c'est le sport.

## ⚠️ LE VIVIER EXISTE DÉJÀ : 94 CLASSES, ET LA RARETÉ AUSSI

Mesuré dans le code : **94 classes**, réparties **6 · 15 · 14 · 13 · 12 · 12 · 11 · 11**
sur les 8 strates — et `advRarity` **est déjà** la strate atteinte. Le vivier de champions
tirables est donc écrit, équilibré et nommé depuis la v0.792 : plus de personnages
qu'aucun gacha réel.

**Ce qui survit** (et c'est l'essentiel de ce que la version précédente de cette spec
croyait devoir réinventer) : `ADV_CLASSES`, `advClass`, `advRarity`, `advStats`,
`advRoles`, `advSignatures`, `lineageOf` — donc `canWearAdvGear`, donc tout l'équipement
d'aventurier, sans une ligne de nouveau.

**Ce qui meurt** : `classChoices` (le choix 1‑parmi‑3), `canPromote`, `recruitAdventurer`,
et avec eux **trois bâtiments** (cf. « un seul bâtiment » plus bas).

⚠️ **Ce qu'on perd, et il faut le dire** : le build‑crafting individuel. Dans un gacha on
ne construit pas un personnage, on choisit **lequel**. C'est le deal, accepté. ⚠️ Et la
mesure ci‑dessous montre que **personne ne s'en servait encore** : aucun aventurier de la
base n'a jamais atteint le niveau de sa première promotion.

## 🩺 « Une version du soigneur par rareté » — mesuré : 27 cases sur 32

| Rareté     | Classes | Rôles présents           | Signatures |
| ---------- | ------- | ------------------------ | ---------- |
| commun     | 5       | 👁️ 🐫 — **manque 🩺 🧭** | **aucune** |
| inhabituel | 15      | les 4 ✅                 | **aucune** |
| magique    | 14      | les 4 ✅                 | **aucune** |
| rare       | 13      | 🩺 🐫 🧭 — manque 👁️     | les 8 ✅   |
| épique     | 12      | les 4 ✅                 | les 8 ✅   |
| légendaire | 12      | 🐫 🧭 👁️ — **manque 🩺** | les 8 ✅   |
| mythique   | 11      | 🩺 🐫 🧭 — manque 👁️     | les 8 ✅   |
| primordial | 11      | les 4 ✅                 | les 8 ✅   |

**À écrire : 5 classes** pour compléter la grille rôle × rareté. ✅ **Décidé : on complète.**

⚠️ **Plus gênant : aucune signature de combat avant « rare »** (c'est la règle actuelle,
strates ≥ 3). Dans un gacha, même un 1★ a une compétence — les **trois raretés basses
sont à doter**. ✅ **Décidé : on les dote.**

## ⚠️ LA CONTRAINTE CHIFFRÉE : l'écart de rareté doit rester sous ×11,5

Les stats d'un champion = **somme des budgets de chaque classe de son chemin**, × le niveau.

```
STRATUM_BUDGET = round(6 × 1,219^i)  →  6 · 7 · 9 · 11 · 13 · 16 · 20 · 24
cumul le long du chemin              →  6 · 13 · 22 · 33 · 46 · 62 · 82 · 106
```

Le rang multiplie les stats par **×11,5** (`ADV_LEVEL_K` 0,15 sur 71 niveaux). Pour qu'un
**commun investi batte un primordial nu** — la propriété que tous les gachas défendent —
l'écart de rareté doit rester **sous ce facteur**. Or 106 / 6 = **×17,7** : le primordial
nu écrase le commun monté à fond.

**⚠️ LE REMÈDE EST UN PLANCHER, PAS UN PLAFOND.** Garder **106 en haut** est non
négociable : c'est lui qui tient tout l'équilibrage de fin de partie (`refAdventurer`,
7 fichiers de test). Seul le plancher bouge, la forme géométrique est conservée :

| rareté          | commun | inhab. | magique | rare | épique | légend. | mythique | primordial | écart       |
| --------------- | ------ | ------ | ------- | ---- | ------ | ------- | -------- | ---------- | ----------- |
| **aujourd'hui** | 6      | 13     | 22      | 33   | 46     | 62      | 82       | **106**    | ×17,7 ❌    |
| **proposé**     | **20** | 25     | 32      | 41   | 52     | 66      | 84       | **106**    | **×5,3** ✅ |

Formule : `RARITY_BUDGET[i] = round(20 × (106/20)^(i/7))`.

⚠️ **UNE SEULE SOURCE, ET `advStats` NE CHANGE PAS.** C'est `RARITY_BUDGET` (le cumul)
qu'on écrit, et `STRATUM_BUDGET` (l'incrément de chaque strate) qui en est **DÉRIVÉ** par
différences → **20 · 5 · 7 · 9 · 11 · 14 · 18 · 22**. `advStats` continue de sommer le
long du chemin, sans une ligne de changement, et les deux tables ne peuvent pas diverger.

⚠️ **Référence gacha** : un 5★ de Genshin n'a que **+10 à +20 %** de stats de base sur un
4★ — l'écart réel est dans le kit. ×5,3 sur **huit** crans reste généreux ; c'est un
arbitrage, pas une vérité.

⚠️ **CONSÉQUENCE À MESURER AVANT DE LIVRER** : un champion commun devient **3,3× plus
fort** que la recrue strate‑0 d'aujourd'hui. Les embuscades de convoi et les sièges se
calibrent sur `refAdventurer`, donc **les deux camps bougent ensemble** (leçon v0.795) —
mais la **FORME** de la courbe change : un chemin court gagne relativement plus qu'un
long. À re‑simuler, jamais à supposer.

## ⚠️ POURQUOI LA RARETÉ NE DOIT PAS ÉVOLUER

Deux familles de gachas :

- **rareté figée** — Genshin, Honkai Star Rail, Arknights : un 4★ ne devient jamais 5★ ;
- **rang promouvable** — Summoners War, Epic Seven, Raid, AFK Arena : on monte les
  **étoiles** en nourrissant des doublons, mais la **rareté naturelle** reste fixe et
  décide du plafond de qualité. Un « nat 5 » à 6★ bat toujours un « nat 3 » à 6★.

**Le projet a déjà les deux axes de la seconde famille** : rareté tirée (figée) + rang
gagné au combat. « Monter à fond » = atteindre le rang du héros. Faire évoluer la rareté
ajouterait un **troisième axe** et permettrait de **fabriquer du primordial sans tirage** :
la loterie perdrait son sens et le plafond de puissance sauterait. Ce que les doublons
montent, c'est l'**Éveil** (le kit), jamais la rareté.

## ✨ L'ÉVEIL — ce que les doublons montent

**Décidé : magnitude ET niveau de compétence.** C'est bien le modèle dominant du genre.

| Jeu           | Ce que fait un doublon                                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Genshin / HSR | **constellations C1‑C6** : crans **numériques** (« +3 niveaux de compétence ») ET crans **qualitatifs** (« la compétence gagne une charge », « elle applique aussi X ») |
| Arknights     | **potentiel P1‑P6** : uniquement numérique et petit (coût −1, stat +, talent +)                                                                                         |
| Epic Seven    | **imprint** : un bonus de stat plat                                                                                                                                     |
| AFK Arena     | paliers d'ascension : stats **et** déblocage de l'arme signature                                                                                                        |

**La règle du genre : la majorité des crans sont numériques, un ou deux sont qualitatifs
et marquants.**

⚠️ **ET ÇA NE CRÉE AUCUN SYSTÈME NEUF ICI.** `AdvSkill` porte déjà un **niveau par
répétition** dans le chemin (v0.757 : une compétence portée deux fois vaut niveau 2). Un
cran d'Éveil qualitatif = **+1 niveau de compétence**, exactement comme si le chemin
portait la compétence une fois de plus. Les autres crans montent la **magnitude du kit**.
Rien à inventer, et l'écran sait déjà l'afficher.

⚠️ **LE PLAFOND D'ÉVEIL DOIT ÊTRE ATTEIGNABLE EN BAS, ASPIRATIONNEL EN HAUT** — c'est le
cœur du modèle : on « C6 » un 4★ sans y penser, on ne « C6 » quasiment jamais un 5★. À
0,6 % sur la rareté maximale, **personne n'éveillera jamais un primordial, et c'est voulu.**

⚠️ **Un tirage n'est JAMAIS perdu** : au‑delà du plafond d'Éveil, le doublon se convertit
(pierres de mana, ou une monnaie d'éveil). Sinon un joueur chanceux reçoit du vide.

## 🗡️ PAS DE GACHA D'ÉQUIPEMENT — et c'est un choix, pas un oubli

Les gachas en ont presque tous un (armes de Genshin, artefacts en donjon, runes de
Summoners War, équipement d'Epic Seven) : **la question est légitime, la réponse est non.**

⚠️ **PARCE QUE CE PROJET A DÉJÀ TRANCHÉ L'INVERSE, et par une refonte entière** :
« 🎯 DROPS‑ONLY GEAR » (v0.556) a retiré l'infusion de grade des objets, la poussière,
l'Atelier, la forge, le reroll et le craft de set — explicitement **« pour privilégier le
plaisir de switcher son stuff via les drops »**. Y remettre une loterie d'équipement
payante, c'est rouvrir ce qui a été fermé.

**Ce qui tient lieu de gacha d'équipement, et qui existe déjà** :

- les **objets du héros** ont trois axes de loterie — rareté, **jet** biaisé bas, niveau
  d'objet — plus les effets légendaires et les sets de voie ;
- les **pièces d'aventurier** se droppent sur les corps d'un siège et les embuscades
  repoussées, au rang de la classe du porteur, et l'**Équipementier** en fond à partir des
  objets du héros.

**Ce que le gacha tire, c'est donc la PERSONNE, et seulement elle.** Deux loteries
concurrentes diluent l'une et l'autre : c'est la règle déjà appliquée au « gacha de
compétences », écarté parce qu'il entrait en concurrence avec les talents.

⚠️ **À rouvrir sciemment si un jour la question revient** : l'angle propre serait une
pièce **signature** par champion (le patron AFK Arena — l'arme se débloque par
l'ascension, elle ne se tire pas), donc un cran d'Éveil, jamais une seconde bannière.

## 🏛️ UN SEUL BÂTIMENT : LE PANTHÉON (11 → 9)

**Décidé : Guilde, Centre de formation et Équipementier sont supprimés**, et un seul
bâtiment prend leur place — le **Panthéon des champions** : on y tire, on y consulte sa
collection, on y éveille, on y équipe. « Un bâtiment, un endroit » (règle v0.739).

**Ils perdent tous les trois leur métier avec le gacha** — mais pas de la même façon :

| Bâtiment            | Son levier       | Ce qu'il devient                                                            |
| ------------------- | ---------------- | --------------------------------------------------------------------------- |
| Centre de formation | `trainMsFor`     | **mort tout court** : plus de promotion, donc plus de durée à raccourcir    |
| Guilde              | `guildRoster`    | ⚠️ **à RÉHÉBERGER, jamais à supprimer** (cf. ci‑dessous)                    |
| Équipementier       | `outfitterMsFor` | un **comptoir** du Panthéon (fondre un objet du héros en pièce de champion) |

⚠️ **LE PLAFOND D'EFFECTIF EST PORTEUR, et c'est le seul vrai piège de cette
simplification.** `guildRoster` est le **seul plafond d'effectif du jeu**, et `guardUnits`
fait défendre **TOUT le vivier disponible** : collection illimitée + aucun plafond = base
imprenable. C'est le runaway déjà relevé en v0.779 — le vivier croît **×7,3** du niveau 12
à 100 quand l'armée ne croît que **×1,8**, et « rien ne borne combien de défenseurs
TIRENT ». Le Panthéon reprend donc la formule **telle quelle** (1 + niveau/2), rebaptisée
**déploiement** : combien de champions peuvent être engagés en même temps (convois + camps

- défense). Le reste est en collection.

**AUCUNE FORMULE NOUVELLE — et c'est ce qui rend le bâtiment viable jusqu'au niveau 100**
(règle v0.731, aucun niveau mort) : il porte **deux leviers déjà écrits et déjà vivants** —
le **déploiement** (`guildRoster`, +1 tous les 2 niveaux, 51 au niveau 100) et le **temps
de fabrication** d'une pièce (`outfitterMsFor`, asymptotique, gratte à chaque cran).

⚠️ **PAS de remise sur le coût d'un tirage**, aussi tentant que ce soit : c'est exactement
la remise de l'**Autel des boss**, **retirée en v0.799** parce qu'elle coupait de moitié le
lien farm → boss. Ici elle couperait le lien **failles → pierres de mana → tirage**, qui
est toute la boucle.

### ⚠️ Le puits d'or perd 18 %, et c'est à re‑mesurer avant de livrer

`BUILD.plotCap` est **DÉRIVÉ** de `BUILDING_TYPES.length` (v0.676) : la cour se réduit
d'elle‑même à 9 emplacements, **zéro ligne** — c'est fait pour. En revanche
`buildingUpgradeCost(level)` **ne dépend pas du type** : chaque bâtiment retiré retire donc
une part égale du puits, soit **2/11 = 18,2 %**.

Interpolé sur les **deux points déjà mesurés** de la v0.733 (part du plafond atteinte sur
un an, 3 profils) : `550 → 81/71/65 %` et `450 → 87/76/70 %`. Retirer 18 % du puits
équivaut à `upBase ≈ 451` → la part remonte à **~70‑87 %** : encore dans la bande **55‑90 %**
que le test verrouille, **mais en haut de bande**.

⚠️ **À RE‑MESURER POUR DE VRAI** (`goldSink.test`), pas à interpoler : c'est mot pour mot
le piège de la v0.733, où les trois bâtiments des caravanes avaient **approfondi** le puits
de 43 % sans que personne le re‑simule, et où le test s'était contenté de relâcher sa
borne. Cette fois le mouvement va dans l'autre sens — l'or devient plus facile.

## 🎲 Les compétences : elles existent déjà, et ce qui manque

Chaque classe porte un **rôle de convoi** (🩺 soin · 🐫 cargaison · 🧭 vitesse ·
👁️ repérage) et/ou une **signature de combat** (exécution, rage, élan, vol de vie, épines,
crit, dégâts, PV), avec un **niveau par répétition** (`AdvSkill`). Un champion de haute
rareté déroule 3 à 4 compétences à niveaux variés : c'est un kit.

⚠️ **Pas d'ultime actif, et ce n'est pas un oubli** : le combat est **100 % automatique et
seedé** dans tout le projet. Tout reste **passif**. On peut avoir des procs spectaculaires,
pas un bouton à presser.

⚠️ **Le « gacha de compétences » est écarté** : il entrerait en concurrence directe avec
les **talents**, qui existent, se droppent et s'équipent déjà sur un aventurier
(`ADV_TALENT_K`).

## 🗂️ LE CODEX DOIT ACCUEILLIR LES CHAMPIONS

Une collection sans journal n'est pas une collection : un gacha se joue autant pour
compléter la liste que pour la puissance. Le **Codex** (`src/lib/codex.ts`) tient déjà le
bestiaire et le journal des sets — il lui faut un **troisième volet : les champions**.

⚠️ **ENTIÈREMENT DÉRIVÉ, comme le reste du Codex — donc aucune migration.** Le bestiaire
se déduit des donjons nettoyés, les sets du sac et de l'équipé : la galerie des champions
se déduit de **ce qu'on possède**, en regard des 94 classes. Un champion jamais tiré
s'affiche **❔ « ??? » grisé** (le teasing déjà en place), un champion possédé montre sa
rareté, son rôle, sa signature et son **cran d'Éveil**.

⚠️ **Il annonce ce qui EXISTE, pas ce qui est probable** : à 0,6 % sur le haut du pool, la
galerie doit donner envie sans laisser croire qu'on la complétera — et **jamais** afficher
un taux, qui court‑circuiterait l'écran de tirage.

## 🗑️ MIGRATION — mesurée en base, le wipe est indolore

**Décidé : on supprime les aventuriers existants** et on les remplace par des champions.

| compte | aventuriers | classes chacun | niveaux | pièces en stock |
| ------ | ----------- | -------------- | ------- | --------------- |
| Last   | 16          | **1**          | 8‑9     | 84              |
| Cypher | 5           | **1**          | 5‑6     | 21              |
| Mimi   | 0           | —              | —       | 0               |
| Knat   | 0           | —              | —       | 0               |

⚠️ **AUCUN AVENTURIER N'A JAMAIS ÉTÉ PROMU.** La première promotion tombe au **niveau 11**
(`PROMO_LEVELS` = 1 · 11 · 21 · 31 · …), le plus avancé de la base est à **9**. L'arbre de
classes n'a donc jamais servi à personne : **le wipe ne détruit aucun investissement**.

✅ **ET L'ÉQUIPEMENT SURVIT AU WIPE.** Les 105 pièces sont rangées **par lignée** —
mage 24 · éclaireur 19 · guerrier 18 · homme d'armes 17 · caravanier 17 · archer 10 — et
les 6 lignées ne bougent pas. Un champion tiré sur une lignée porte les pièces de cette
lignée (`canWearAdvGear` inchangé). ⚠️ Elles sont **toutes communes** (vérifié : 105/105),
ce qui est normal — `capAdvGearToWearable` les plafonne à la rareté de la classe du
porteur, et tout le monde était commun.

### ⚠️ 7,42 M D'OR SONT INVESTIS DANS LES TROIS BÂTIMENTS SUPPRIMÉS — mesuré

C'est le vrai coût de la simplification, et il est **bien plus lourd que le wipe des
aventuriers**. Reconstitué depuis la base, à la courbe réelle (`buildGold` + Σ `550 × L^1,9`) :

| compte | Guilde | Équipementier | Centre de formation | or investi    |
| ------ | ------ | ------------- | ------------------- | ------------- |
| Last   | niv 31 | niv 30        | niv 10              | **7 423 990** |
| Cypher | niv 8  | niv 5         | niv 5               | 96 689        |
| Mimi   | —      | —             | —                   | 0             |
| Knat   | —      | —             | —                   | 0             |

⚠️ Soit **~73 jours de revenu** au niveau 28 (~101 000 or/jour, mesuré v0.733). Les
supprimer sans rien faire les **efface en silence** : `normalizeRow` droppe déjà les types
de bâtiment inconnus au chargement. Ce serait la violation directe de la règle v0.731 —
personne ne se réveille avec moins bon qu'hier.

✅ **REMÈDE : le Panthéon HÉRITE du niveau le plus haut des trois** (`max`, soit **31** sur
le compte réel). L'investissement est conservé **en nature, pas en or** — et ça tombe juste,
puisque ses deux leviers SONT ceux de la Guilde (déploiement) et de l'Équipementier
(fabrication) : les deux repartent au niveau où ils étaient. Seul le **Centre de
formation**, dont le métier disparaît complètement, n'a pas d'héritier.

⚠️ **Le remboursement de l'or des deux bâtiments absorbés reste à trancher** (Last 3,60 M,
Cypher 30 848) : mesuré en v0.828, le compte réel a **tout au plafond de son niveau et
5,57 M d'or qui dorment** — rendre 3,6 M de plus n'achèterait rien. L'héritage de niveau
suffit peut‑être ; c'est une décision, pas un oubli.

⚠️ `BUILD.plotCap` passant de 11 à 9, un compte qui a 11 bâtiments posés en a **deux de
trop** : `repackBuildingSlots` les remet dans les bornes tout seul (v0.868), **aucune
migration**.

Pour mémoire, les bâtiments **conservés** du même domaine : Comptoir de caravanes niv 28.

## ⚠️ ORDRE DE CONSTRUCTION : les failles d'abord

Les **pierres de mana n'existent pas encore** — elles viennent des failles, qui ne sont pas
implémentées. Sans elles, le gacha n'a **pas de monnaie**. Ordre :
**failles → pierres de mana → gacha**.

## Comment marche un gacha (référence)

- **Taux** typiques : 5★ ≈ 0,6 %, 4★ ≈ 5 %, le reste en 3★. À taux nu, on peut tirer 200
  fois sans rien.
- ⚠️ **Le PITY est indispensable** : _soft pity_ (les taux montent vers le 75ᵉ tirage) et
  _hard pity_ (garanti au 90ᵉ). Sans lui, un joueur malchanceux n'a jamais rien — et ici
  il n'y a pas d'argent réel pour compenser. ✅ **Validé.**
- **Duplicatas** : chaque doublon monte un cran. Un tirage n'est jamais perdu.
- **Progression séparée du tirage** : c'est elle qui fait qu'un **4★ investi bat un 5★ nu**
  — la propriété qui garde les basses raretés utiles (cf. la contrainte ×11,5 ci‑dessus).
- **Bannières limitées** : créent l'urgence… **sans objet ici** (pas de monétisation). Un
  pool permanent suffit.

## Ce que ça apporterait

- La **rareté** à la place des classes toutes communes (mesuré : les 21 aventuriers des
  comptes réels sont tous à une seule classe, donc tous « communs » et à moitié sans
  compétence).
- Les **duplicatas qui servent enfin** : aujourd'hui deux recrues identiques ne
  s'additionnent pas.
- Un **usage clair pour les pierres de mana**, sans créer une monnaie de plus.
- Tout le reste est conservé : équipement d'aventurier, compagnons, talents, convois,
  défense, camps.

## Reste à trancher

- **La forme exacte de l'Éveil** : combien de crans, et lesquels sont qualitatifs.
  Proposition : **s'aligner sur Genshin — 6 crans, 2 ou 3 qualitatifs** (chacun valant
  +1 niveau de compétence), les autres en magnitude. Et ce que rend un doublon au‑delà du
  plafond.
- **Les taux et le pity**, une fois connu le débit de pierres de mana (donc après les
  failles).
- **La mesure** du passage du plancher 6 → 20 sur les embuscades de convoi et les sièges
  (⚠️ bloquante : c'est un changement d'équilibrage, pas un réglage d'affichage).
- **La mesure** du puits d'or à 9 bâtiments (`goldSink.test`, ⚠️ bloquante elle aussi : la
  part interpolée sort en haut de bande, et c'est le piège exact de la v0.733).
- **Le remboursement** de l'or des bâtiments absorbés par le Panthéon (3,60 M sur le compte
  réel) — l'héritage de niveau suffit peut‑être.
- **Le nom et l'emoji** du bâtiment : « Panthéon » est libre (vérifié — « sanctuaire » est
  déjà le POI 🔮, « autel » et « invocation » sont pris), mais 🏛️ sert déjà d'icône à
  l'objectif « sculpt » du Défi 360.
