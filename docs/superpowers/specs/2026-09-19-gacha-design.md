# Gacha de champions — étude de conception

**État : ÉTUDE, rien n'est implémenté.** Décisions prises avec l'utilisateur le 2026‑09‑19,
et mesures qui les encadrent.

⚠️ **CETTE VERSION CORRIGE UNE ERREUR DE MODÈLE.** Les deux versions précédentes faisaient
d'un champion un **CHEMIN dans l'arbre des classes d'aventurier** (rareté = strate
atteinte) : c'était l'ancien système déguisé, et ça rendait l'identité d'un champion
indéfinissable — donc les **doublons**, donc l'Éveil, donc le cœur du gacha. Recadré par
l'utilisateur : « vois ça comme **remplacer totalement les aventuriers par des champions
uniques** dont les doublons améliorent le champion ». Tout ce document en découle.

## L'intention

Tirer au sort des **champions** — bien moins forts que le héros — avec les **pierres de
mana** pour monnaie. Ils s'équipent, ont des compétences, et les **doublons** les renforcent.

## Décisions prises

| Sujet               | Décision                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Nom                 | **champion** (hors des mots déjà pris : héros, aventurier)                                    |
| Périmètre           | **Le gacha REMPLACE ENTIÈREMENT les aventuriers** — arbre de classes compris                  |
| Ce qu'on tire       | **un champion UNIQUE**, écrit à la main : une identité, pas un métier ni un chemin            |
| Roster              | **32 champions**, **4 par rareté** — un par rôle de convoi (extensible à une ligne par ajout) |
| Vocabulaire         | **Raretés nommées** (commun → primordial), **PAS de nouvelle échelle d'étoiles**              |
| Rang du champion    | **L'échelle de prestige du héros** (Bronze ★1 → …), **plafonnée au rang du héros**            |
| Taux                | **Toutes les raretés tirables**, aux taux d'un gacha (le plus haut ≈ 0,6 %)                   |
| Ce qui est plafonné | **le RANG**, jamais la rareté tirée                                                           |
| Évolution de rareté | **NON** — la rareté est figée, c'est le rang qui monte                                        |
| Duplicatas          | **Éveil** : **barème commun** de magnitude + **1 ou 2 crans écrits** par champion             |
| Stats               | **`RARITY_BUDGET[rareté]`** lu directement, réparti sur sa forme 💪❤️⚡ — plancher **20**     |
| Monnaie             | **Pierres de mana** (failles, monstres tués, + **un tirage gratuit par jour**)                |
| Plafond de nombre   | **aucun sur la collection** ; le **déploiement** est plafonné                                 |
| Équipement          | **PAS de gacha d'équipement** — les pièces se droppent (cf. plus bas)                         |
| Bâtiments           | **11 → 9** : Guilde, Centre de formation et Équipementier remplacés par **UN** (cf. plus bas) |
| Migration           | **wipe des aventuriers existants** (mesuré indolore, cf. plus bas)                            |
| Pity                | **indispensable** (soft + hard), calibré après les failles                                    |

## 🏅 CE QU'EST UN CHAMPION — une ligne de données, et rien d'autre

| Champ         | Ce que c'est                                  | Ce qu'il alimente, **sans une ligne de neuf**                                        |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `id`, `name`  | son identité, unique                          | l'identité des **doublons** (donc l'Éveil) et le **Codex**                           |
| `rarity`      | une des 8 raretés, **figée au tirage**        | ses **stats** = `RARITY_BUDGET[rareté]`, lu **directement**                          |
| `form` 💪❤️⚡ | sa répartition (Cogneur, Encaisseur, Rapide…) | le budget se répartit dessus — c'est son archétype de stats                          |
| `lineage`     | une des **6 lignées**                         | **quel équipement il porte** : `canWearAdvGear` inchangé, les 105 pièces matchent    |
| `role?`       | 0 ou 1 des **4 rôles de convoi**              | 🩺 soin · 🐫 cargaison · 🧭 vitesse · 👁️ repérage — déjà appliqués par les caravanes |
| `skills`      | 1 à 3 **signatures de combat**                | ⚠️ **déjà appliquées par `simulateCombat`** — la pièce la plus précieuse du socle    |
| `awaken`      | ses 1 ou 2 crans d'Éveil écrits               | +1 niveau de compétence via `AdvSkill`, que l'écran sait déjà afficher               |

**Stats d'un champion** = `RARITY_BUDGET[rarity]` réparti sur `form`, × le niveau
(`ADV_LEVEL_K`). ⚠️ **Plus aucune somme le long d'un chemin** — c'est la simplification
que le recadrage apporte, et elle en entraîne une autre (cf. la section budget).

## ⚠️ LES 94 CLASSES SONT UNE CARRIÈRE, PAS UN ROSTER

C'est l'erreur corrigée. Une **classe** est un métier (« Maître épéiste ») ; un **champion**
est un individu. On n'y reprend donc que **ce qui est déjà mesuré et déjà branché** :

| On garde                                            | Pourquoi c'est précieux                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| le **barème de stats par rareté** (`RARITY_BUDGET`) | adossé au pas de rareté des objets (ratio 1,219) — « épique » dit la même chose |
| les **4 rôles de convoi** (`AdvRole`)               | appliqués par les caravanes (trajet, cargaison, convalescences, embuscades)     |
| les **8 signatures** (`EffectType`)                 | ⚠️ **`simulateCombat` sait déjà les jouer** — zéro moteur à écrire              |
| les **6 lignées** (`Lineage`)                       | l'équivalent du « type d'arme » d'un gacha, et la clé des 105 pièces en stock   |
| le **niveau par répétition** (`AdvSkill`)           | le support naturel des crans d'Éveil qualitatifs (v0.757)                       |
| l'**échelle de prestige** (`characterRank`)         | le rang d'un champion, commun avec le héros — une seule échelle dans le jeu     |

**Ce qui meurt en entier** : l'arbre lui‑même — `ADV_CLASSES` comme roster, `classChoices`,
les prérequis `req`, les strates, `advClass`, `canPromote`, `trainMsFor`,
`recruitAdventurer`, et **le chemin** (`Adventurer.path`).

⚠️ **`lineageOf` DÉDUIT AUJOURD'HUI LA LIGNÉE DE LA CLASSE RACINE DU CHEMIN.** Sans chemin,
elle devient un **champ explicite** du champion. C'est une ligne, mais elle est porteuse :
c'est elle qui décide de l'équipement.

⚠️ **TAILLE RÉELLE DE LA BASCULE, mesurée : 16 sites lisent `adv.path`** (store, panneau de
Guilde, portraits, équipement d'aventurier, carte). Plus **`refAdventurer` et
`REF_LINEAGES`** — les étalons qui calibrent le **danger de la route** et les **sièges** —
tous deux bâtis sur une lignée promue : à refaire en « champion de rareté R au niveau L »,
donc **re‑mesure obligatoire** des embuscades et de la tenue d'un siège.

⚠️ **Un garde‑fou devient inutile** : `advRankCap` (v0.834) empêchait le rang d'un
aventurier de dépasser le nombre de classes qu'il avait gagnées. Sans progression de
classe, le seul plafond est le **rang du héros** — une règle en moins.

## 🎯 LE ROSTER : 32 CHAMPIONS, 4 PAR RARETÉ

C'est **le plus petit roster cohérent** : il couvre exactement la règle posée par
l'utilisateur — **une version de chaque rôle à chaque rareté**, de plus en plus puissante.
Donc, par rareté : un 🩺, un 🐫, un 🧭, un 👁️.

⚠️ **LA TAILLE DU POOL PAR RARETÉ **EST** LA VITESSE DE L'ÉVEIL** — c'est pour ça qu'elle
se décide avant d'écrire. À 4 par rareté, un champion précis tombe à **un quart du taux de
sa rareté** :

| Rareté   | Taux de la rareté (ordre de grandeur) | Un champion précis | 7 copies (cran max) |
| -------- | ------------------------------------- | ------------------ | ------------------- |
| basse    | ~35 %                                 | ~8,7 %             | **~80 tirages** ✅  |
| moyenne  | ~5 %                                  | ~1,25 %            | ~560 tirages        |
| maximale | ~0,6 %                                | ~0,15 %            | **jamais** ✅       |

C'est exactement le gradient du genre : on « C6 » une basse rareté sans y penser, on ne
« C6 » quasiment jamais la plus haute. ⚠️ Les taux ci‑dessus sont des **ordres de grandeur**
tant que le débit de pierres de mana n'est pas connu (donc après les failles).

**Kit par rareté** (une signature s'ASSIGNE, elle ne s'invente pas — les 8 existent) :

| Rareté     | commun | inhab. | magique | rare | épique | légend. | mythique | primordial |
| ---------- | ------ | ------ | ------- | ---- | ------ | ------- | -------- | ---------- |
| signatures | 1      | 1      | 2       | 2    | 2      | 3       | 3        | 3          |

Soit **68 assignations** pour les 32 champions. ⚠️ **Décidé : même la rareté la plus basse
porte une signature de combat** — aujourd'hui les strates < 3 n'en ont aucune, et dans un
gacha même un 1★ a une compétence.

⚠️ **CONTRAINTE D'ÉCRITURE À NE PAS RATER : la couverture lignée × rareté.** 6 lignées × 8
raretés = **48 cases pour 32 champions** : toutes ne peuvent pas être remplies. Il faut donc
répartir les lignées **délibérément** (~5 raretés par lignée, jamais absente du haut du
pool) — sinon une lignée n'aura aucun champion de haute rareté, et
`capAdvGearToWearable` plafonnera ses pièces très bas pour toujours.

## ⚠️ LA CONTRAINTE CHIFFRÉE : l'écart de rareté doit rester sous ×11,5

Le rang multiplie les stats par **×11,5** (`ADV_LEVEL_K` 0,15 sur 71 niveaux). Pour qu'un
**commun investi batte un primordial nu** — la propriété que tous les gachas défendent —
l'écart de rareté doit rester **sous ce facteur**. Or la table actuelle (cumul le long d'un
chemin) va de **6 à 106**, soit **×17,7** : le primordial nu écrase le commun monté à fond.

**⚠️ LE REMÈDE EST UN PLANCHER, PAS UN PLAFOND.** Garder **106 en haut** est non
négociable : c'est lui qui tient tout l'équilibrage de fin de partie (`refAdventurer`,
7 fichiers de test). Seul le plancher bouge, la forme géométrique est conservée :

| rareté          | commun | inhab. | magique | rare | épique | légend. | mythique | primordial | écart       |
| --------------- | ------ | ------ | ------- | ---- | ------ | ------- | -------- | ---------- | ----------- |
| **aujourd'hui** | 6      | 13     | 22      | 33   | 46     | 62      | 82       | **106**    | ×17,7 ❌    |
| **proposé**     | **20** | 25     | 32      | 41   | 52     | 66      | 84       | **106**    | **×5,3** ✅ |

Formule : `RARITY_BUDGET[i] = round(20 × (106/20)^(i/7))`.

✅ **ET LE RECADRAGE SIMPLIFIE CETTE SECTION.** La version précédente devait dériver
`STRATUM_BUDGET` (l'incrément de chaque strate) de ce cumul, pour qu'`advStats` continue de
sommer un chemin sans que les deux tables divergent. **Un champion n'a pas de chemin** :
`RARITY_BUDGET` est lu **tel quel**, `STRATUM_BUDGET` disparaît, et il n'y a plus deux
tables à tenir d'accord.

⚠️ **Référence gacha** : un 5★ de Genshin n'a que **+10 à +20 %** de stats de base sur un
4★ — l'écart réel est dans le kit. ×5,3 sur **huit** crans reste généreux ; c'est un
arbitrage, pas une vérité.

⚠️ **CONSÉQUENCE À MESURER AVANT DE LIVRER** : un champion commun vaut **3,3× la recrue
strate‑0 d'aujourd'hui**, et les étalons de la route et des sièges changent de nature
(cf. `refAdventurer` plus haut). **À re‑simuler, jamais à supposer** — les deux camps
bougent ensemble (leçon v0.795), mais la FORME de la courbe change.

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
montent, c'est l'**Éveil**, jamais la rareté.

## ✨ L'ÉVEIL — barème commun, plus 1 ou 2 crans écrits

**Décidé.** La **magnitude** monte selon un **barème unique** (rien à écrire, rien à
équilibrer par champion), et **1 ou 2 crans par champion sont écrits à la main** — ceux qui
marquent : « sa signature gagne un niveau », « elle s'applique aussi à X ».

C'est le modèle **dominant** du genre, et il est mesuré :

| Jeu           | Ce que fait un doublon                                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Genshin / HSR | **constellations C1‑C6** : crans **numériques** (« +3 niveaux de compétence ») ET crans **qualitatifs** (« la compétence gagne une charge », « elle applique aussi X ») |
| Arknights     | **potentiel P1‑P6** : uniquement numérique et petit (coût −1, stat +, talent +)                                                                                         |
| Epic Seven    | **imprint** : un bonus de stat plat                                                                                                                                     |
| AFK Arena     | paliers d'ascension : stats **et** déblocage de l'arme signature                                                                                                        |

⚠️ **CE QUI A DÉCIDÉ LE DOSAGE** : tout écrire, c'est **6 crans × 32 champions = 192 effets**
à écrire **et à équilibrer**, et chacun peut casser le combat (le moteur applique ce qu'on
lui donne). Le barème commun + 1‑2 crans écrits borne l'écriture à **~64 lignes**.

⚠️ **ET ÇA NE CRÉE AUCUN SYSTÈME NEUF** : `AdvSkill` porte déjà un **niveau par répétition**
(v0.757 — une compétence portée deux fois vaut niveau 2). Un cran qualitatif = **+1 niveau
de compétence**. Rien à inventer, et l'écran sait déjà l'afficher.

⚠️ **Un tirage n'est JAMAIS perdu** : au‑delà du dernier cran, le doublon se convertit
(pierres de mana, ou une monnaie d'éveil). Sinon un joueur chanceux reçoit du vide.

## 💎 D'OÙ VIENNENT LES PIERRES DE MANA

**Décidé** : des **failles** (en fermer une en rend), des **monstres tués** — dans la
faille, sur la route, **et en défense de la base** — et d'un **tirage gratuit par jour**.

✅ **Le tirage quotidien a déjà son emplacement** : `claimDailyLogin` (bonus de connexion,
avec sa série et son jour de grâce). Zéro nouveau système, et c'est la norme du genre.
⚠️ **À borner et à mesurer** : un tirage par jour, c'est 365 par an — donc de l'ordre de
**4 hautes raretés offertes par le seul hard pity**.

⚠️ **Compter les monstres tués EN DÉFENSE est ce qui empêche la boucle d'enfermer le
joueur** : celui qui n'a pas l'énergie d'entrer dans une faille encaisse le siège et
touche quand même du mana. Même règle que la spec des failles.

⚠️ **PAS DE BÂTIMENT QUI PRODUIT DU MANA.** C'est la leçon de la **Dynamo de faille**
(v0.822) : une production **linéaire en niveau** finit toujours par dépasser le sport —
mesuré, elle rendait **~550 ⚡/jour**, plus que le Défi 360 du joueur, et il a fallu la
diviser par 8. Un bâtiment qui imprime la monnaie du gacha ferait **échapper le gacha au
sport**, la règle fondatrice. S'il en faut un un jour : un **convertisseur plafonné**
(or → mana, façon `HARVEST.wellEnergyMax`), jamais une imprimante.

⚠️ **PAS DE BÂTIMENT ADOSSÉ AUX REPS non plus**, et pas pour la raison qu'on croit : ce
serait **payer deux fois le même effort** — les reps donnent déjà de l'XP, donc de
l'énergie, donc des runs. C'est le défaut corrigé en v0.769 sur la prime des sorties. Et le
barème est ingrat : mesuré, `sessionXp` = durée × 3 + reps × 0,2, donc **une minute de
séance vaut 15 pompes** dans l'économie du jeu — un taux reps → mana serait soit dérisoire,
soit une imprimante. _(Sujet « payer un coût en reps » mis de côté par l'utilisateur.)_

## 🗡️ PAS DE GACHA D'ÉQUIPEMENT — et c'est un choix, pas un oubli

Les gachas en ont presque tous un : **la question est légitime, la réponse est non.**

⚠️ **Dans le genre, ce qu'on TIRE c'est le PERSONNAGE ; l'équipement vient d'un FARM** —
artefacts en domaine (Genshin), reliques en Caverne (HSR), runes en donjon (Summoners War),
gear en Hunt (Epic Seven). La bannière d'armes de Genshin est l'exception, et c'est la
partie la plus critiquée du jeu.

⚠️ **ET CE PROJET A DÉJÀ TRANCHÉ L'INVERSE, par une refonte entière** : « 🎯 DROPS‑ONLY
GEAR » (v0.556) a retiré l'infusion de grade, la poussière, l'Atelier, la forge, le reroll
et le craft de set — explicitement **« pour privilégier le plaisir de switcher son stuff via
les drops »**.

**Ce qui tient lieu de gacha d'équipement, et qui existe déjà** : les **objets du héros**
(trois axes de loterie — rareté, **jet** biaisé bas, niveau d'objet — plus les procs
légendaires et les sets de voie) et les **pièces de champion** (corps d'un siège,
embuscades repoussées, et la fonte d'un objet du héros).

⚠️ **À rouvrir sciemment si la question revient** : l'angle propre serait une pièce
**signature** par champion (le patron AFK Arena — l'arme se débloque par l'ascension, elle
ne se tire pas), donc **un cran d'Éveil**, jamais une seconde bannière.

## 🏛️ UN SEUL BÂTIMENT : LE PANTHÉON (11 → 9)

**Décidé : Guilde, Centre de formation et Équipementier sont supprimés**, et un seul
bâtiment prend leur place — le **Panthéon des champions** : on y tire, on y consulte sa
collection, on y éveille, on y équipe. « Un bâtiment, un endroit » (règle v0.739).

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
équivaut à `upBase ≈ 451` → la part remonte à **~70‑87 %** : encore dans la bande
**55‑90 %** que le test verrouille, **mais en haut de bande**.

⚠️ **À RE‑MESURER POUR DE VRAI** (`goldSink.test`), pas à interpoler : c'est mot pour mot
le piège de la v0.733, où les trois bâtiments des caravanes avaient **approfondi** le puits
de 43 % sans que personne le re‑simule, et où le test s'était contenté de relâcher sa
borne. Cette fois le mouvement va dans l'autre sens — l'or devient plus facile.

## 🗂️ LE CODEX DOIT ACCUEILLIR LES CHAMPIONS

Une collection sans journal n'est pas une collection : un gacha se joue autant pour
compléter la liste que pour la puissance. Le **Codex** (`src/lib/codex.ts`) tient déjà le
bestiaire et le journal des sets — il lui faut un **troisième volet : les champions**.

✅ **Le recadrage le rend trivial** : le roster est une liste finie de 32 entrées, et
l'identité d'un champion est son `id`. La galerie se **dérive de ce qu'on possède**, comme
le reste du Codex (bestiaire depuis les donjons nettoyés, sets depuis le sac) → **aucune
migration**. Un champion possédé montre sa rareté, son rôle, ses signatures et son **cran
d'Éveil** ; un champion jamais tiré reste **❔ « ??? » grisé** (le teasing déjà en place).

⚠️ **Il annonce ce qui EXISTE, pas ce qui est probable** : jamais de taux affiché, ça
court‑circuiterait l'écran de tirage.

## 🗑️ MIGRATION — mesurée en base

**Décidé : on supprime les aventuriers existants** et on les remplace par des champions.

| compte | aventuriers | classes chacun | niveaux | pièces en stock |
| ------ | ----------- | -------------- | ------- | --------------- |
| Last   | 16          | **1**          | 8‑9     | 84              |
| Cypher | 5           | **1**          | 5‑6     | 21              |
| Mimi   | 0           | —              | —       | 0               |
| Knat   | 0           | —              | —       | 0               |

⚠️ **AUCUN AVENTURIER N'A JAMAIS ÉTÉ PROMU.** La première promotion tombe au **niveau 11**
(`PROMO_LEVELS` = 1 · 11 · 21 · 31 · …), le plus avancé de la base est à **9**. L'arbre de
classes n'a donc **jamais servi à personne** : le wipe ne détruit aucun investissement, et
c'est un argument de plus pour le remplacer plutôt que le compléter.

✅ **ET L'ÉQUIPEMENT SURVIT AU WIPE.** Les 105 pièces sont rangées **par lignée** —
mage 24 · éclaireur 19 · guerrier 18 · homme d'armes 17 · caravanier 17 · archer 10 — et
les 6 lignées ne bougent pas. Un champion de lignée X porte les pièces de X
(`canWearAdvGear` inchangé). ⚠️ Elles sont **toutes communes** (vérifié : 105/105), ce qui
est normal — `capAdvGearToWearable` les plafonne à la rareté du porteur, et tout le monde
était commun.

### ⚠️ 7,42 M D'OR SONT INVESTIS DANS LES TROIS BÂTIMENTS SUPPRIMÉS — mesuré

C'est le vrai coût de la simplification, **bien plus lourd que le wipe des aventuriers**.
Reconstitué depuis la base, à la courbe réelle (`buildGold` + Σ `550 × L^1,9`) :

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
(fabrication) : les deux repartent au niveau où ils étaient. Seul le **Centre de formation**,
dont le métier disparaît complètement, n'a pas d'héritier.

⚠️ **Le remboursement de l'or des deux bâtiments absorbés reste à trancher** (Last 3,60 M,
Cypher 30 848) : mesuré en v0.828, le compte réel a **tout au plafond de son niveau et
5,57 M d'or qui dorment** — rendre 3,6 M de plus n'achèterait rien.

⚠️ `BUILD.plotCap` passant de 11 à 9, un compte qui a 11 bâtiments posés en a **deux de
trop** : `repackBuildingSlots` les remet dans les bornes tout seul (v0.868), **aucune
migration**.

## ⚠️ ORDRE DE CONSTRUCTION : les failles d'abord

Les **pierres de mana n'existent pas encore** — elles viennent des failles, qui ne sont pas
implémentées. Sans elles, le gacha n'a **pas de monnaie** : ce n'est pas un gacha à moitié,
c'est un écran mort. Ordre : **failles → pierres de mana → gacha**.

## Comment marche un gacha (référence)

- **Taux** typiques : 5★ ≈ 0,6 %, 4★ ≈ 5 %, le reste en 3★. À taux nu, on peut tirer 200
  fois sans rien.
- ⚠️ **Le PITY est indispensable** : _soft pity_ (les taux montent vers le 75ᵉ tirage) et
  _hard pity_ (garanti au 90ᵉ). Sans lui, un joueur malchanceux n'a jamais rien — et ici
  il n'y a pas d'argent réel pour compenser. ✅ **Validé.**
- **Duplicatas** : chaque doublon monte un cran. Un tirage n'est jamais perdu.
- **Progression séparée du tirage** : c'est elle qui fait qu'un **4★ investi bat un 5★ nu**
  — la propriété qui garde les basses raretés utiles (cf. la contrainte ×11,5).
- **Bannières limitées** : créent l'urgence… **sans objet ici** (pas de monétisation). Un
  pool permanent suffit.

## Ce que ça apporterait

- Des **personnages**, là où le joueur n'a aujourd'hui que des recrues toutes communes
  (mesuré : les 21 aventuriers des comptes réels n'ont qu'une seule classe, donc tous
  « communs » et à moitié sans compétence).
- Les **duplicatas qui servent enfin** : aujourd'hui deux recrues identiques ne
  s'additionnent pas.
- Un **usage clair pour les pierres de mana**, sans créer une monnaie de plus.
- **Trois bâtiments en moins** et l'arbre de classes en moins : moins de surface, plus de
  lisibilité.
- Tout le reste est conservé : équipement, compagnons, talents, convois, camps, défense.

## Reste à trancher / à faire

- **Écrire les 32 champions** : nom, rareté, forme, lignée, rôle, 1‑3 signatures, 1‑2 crans
  d'Éveil. ⚠️ Avec la contrainte de couverture **lignée × rareté** (48 cases, 32 places).
- **Le barème commun d'Éveil** : combien de crans au total (6 proposé, à la Genshin), et ce
  que rend un doublon **au‑delà** du dernier cran.
- **Les taux et le pity**, une fois connu le débit de pierres de mana (donc après les
  failles). Et **la borne du tirage gratuit quotidien**.
- **La mesure** du plancher de budget **20** et des nouveaux étalons (`refAdventurer`,
  `REF_LINEAGES`) sur les embuscades de convoi et les sièges (⚠️ bloquante).
- **La mesure** du puits d'or à 9 bâtiments (`goldSink.test`, ⚠️ bloquante elle aussi).
- **Le remboursement** de l'or des bâtiments absorbés par le Panthéon (3,60 M sur le compte
  réel) — l'héritage de niveau suffit peut‑être.
- **Le nom et l'emoji** du bâtiment : « Panthéon » est libre (vérifié — « sanctuaire » est
  déjà le POI 🔮, « autel » et « invocation » sont pris), mais 🏛️ sert déjà d'icône à
  l'objectif « sculpt » du Défi 360.
