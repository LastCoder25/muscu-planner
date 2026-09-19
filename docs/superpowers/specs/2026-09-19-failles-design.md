# Failles — étude de conception

**État : ÉTUDE, rien n'est implémenté.** Décisions prises avec l'utilisateur le 2026‑09‑19,
mesures qui les encadrent, et ce qui reste ouvert.

## L'intention

Une faille est un **monde ouvert** qu'on referme en tuant son boss. Elle **engendre des
monstres**, de plus en plus nombreux à mesure qu'elle vieillit — et au bout de **7 jours**
elle **déborde** : son armée sort et marche sur la carte vers la base. On peut l'intercepter,
ou encaisser. C'est aussi l'**usine de pierres de mana**, la monnaie du gacha de champions.

## Décisions prises

| Sujet                 | Décision                                                                            |
| --------------------- | ----------------------------------------------------------------------------------- |
| Rapport au Labyrinthe | **Deux modes DISTINCTS** — la faille ne le remplace pas                             |
| Sièges                | **Les failles REMPLACENT la source des sièges** : toute armée vient d'une faille    |
| Tour de guet          | **Elle révèle l'armée sur la carte** — sans elle, une **tache floue**               |
| Interception          | **Le combat de GROUPE des camps** (héros et/ou aventuriers)                         |
| Nombre de failles     | **3 à 6 simultanées**, de rangs variés                                              |
| Maturation            | **7 jours** avant qu'une faille crache son armée                                    |
| Effectif d'une faille | **croît avec son ÂGE**, plafond à 7 j — elle ENGENDRE, on ne l'épuise pas           |
| Tuer dedans           | ⚠️ **n'affaiblit PAS l'armée à venir** (simplification demandée) — ça paie en mana  |
| Laisser une faille    | **renfort de menace ×1,3** (mesuré) **+ harcèlement des convois** (cf. plus bas)    |
| Coût d'entrée         | **GRATUITE** — ni mana ni énergie ; ce qu'on paie, c'est le **temps du héros**      |
| Pierres de mana       | **Failles + tout monstre de faille tué** — dans la faille, sur la route, en défense |
| Ferraille             | **Conservée** pour l'instant (chantier d'économie séparé)                           |
| Pièces de set         | **0 à 3, sets aléatoires**, en PLUS des sources existantes                          |
| Défaite du héros      | **Infirmerie**, comme sur un camp                                                   |

## ⚠️ Ce qui sépare une faille du Labyrinthe

Sans réponse nette, on obtient deux fois le même mode sous deux noms.

|                  | **Labyrinthe** (existant)               | **Faille**                                                 |
| ---------------- | --------------------------------------- | ---------------------------------------------------------- |
| Espace           | grille de salles + couloirs, brouillard | **zone ouverte**                                           |
| Avancée          | on CHOISIT sa salle                     | **déplacement automatique**                                |
| Le boss          | attend au dernier étage                 | une **porte** s'ouvre quand les monstres sont nettoyés     |
| Salle finale     | le boss seul                            | **salle décorée** : boss, **lieutenants**, petits monstres |
| Déclenchement    | lancé à froid, par palier               | **apparaît** sur la carte — c'est un événement daté        |
| Enjeu de l'échec | perte partielle du butin                | la faille **reste ouverte**, son armée sortira             |

Le mode d'exploration se ressemble ; **c'est l'ENJEU qui distingue**. Au Labyrinthe on
décide de son chemin pour du butin ; dans une faille on court après une échéance qui
menace la base.

## Le rythme : pourquoi 3 à 6

Avec 7 jours de maturation, **N failles = N armées tous les 7 jours** :

| Failles                     | Une armée toutes les… |
| --------------------------- | --------------------- |
| 3                           | 56 h                  |
| 5                           | 34 h                  |
| 8                           | 21 h                  |
| 20 (nombre de lieux actuel) | 8 h                   |

L'intervalle actuel va de **24 h** (joueur actif) à **72 h** (inactif) : **3 à 6** le
reproduisent. Les failles ne remplacent pas tous les lieux — elles s'ajoutent aux mines,
puits et camps.

### ⚠️ Le taux d'apparition n'a PAS besoin d'un coefficient

Le nombre étant borné, **fermer une faille libère une place**. Donc :

- **joueur actif au jeu** → il ferme → de nouvelles s'ouvrent → rotation et contenu ;
- **joueur passif** → les siennes mûrissent et viennent le chercher → contenu subi.

Les deux ont de quoi faire, sans le moindre facteur supplémentaire. Le **sport** garde son
levier propre : il fixe le **PLANCHER** (combien la carte maintient). ⚠️ Deux facteurs
multiplicatifs (sport × jeu) seraient illisibles en jouant et difficiles à calibrer.

⚠️ **CE RAISONNEMENT NE PORTAIT QUE LE RYTHME DE CONTENU — il porte maintenant aussi
l'ÉCONOMIE.** L'entrée étant **gratuite** (cf. plus bas) et la faille étant l'**usine de
mana**, ce taux règle **le débit de la monnaie du gacha**. Il n'a toujours pas besoin d'un
coefficient, mais **sa calibration devient bloquante** : c'est le seul robinet.

## 📈 L'EFFECTIF CROÎT AVEC L'ÂGE — et ça supprime le dernier problème technique

**Décidé (simplification demandée par l'utilisateur)** : une faille **engendre** des
monstres. En tuer **n'affaiblit PAS** l'armée qui sortira — « même si le héros en tue il y en
aura toujours autant voire plus à la sortie ». En échange, son **effectif croît avec le temps
qui passe**, jusqu'au plafond des **7 jours** où elle déborde.

✅ **CE QUE ÇA SUPPRIME EST ÉNORME : l'ÉTAT PERSISTANT.** C'était le seul endroit où la
faille s'écartait vraiment du modèle existant — les POI de la carte sont **sans mémoire**, et
il fallait qu'une faille retienne ce qui y avait été tué. **Plus rien à retenir** : son
effectif est une **fonction pure de son âge** (`spawnAt` + graine), exactement comme le reste
de la carte (`createMap` / `advanceWorld` sont déjà déterministes à partir d'un seed et
d'horodatages). Une incursion redevient une **session**, comme un run de Labyrinthe : on
entre, on se bat, on ferme ou on ressort — et la faille s'est reformée.

⚠️ **LA RÉGÉNÉRATION SE COMPTE EN JOURS, PAS PENDANT L'INCURSION** — sinon la **porte ne
s'ouvrirait jamais** : elle s'ouvre quand les monstres sont nettoyés, et une faille qui
repeuple en temps de combat rendrait le boss inatteignable. À l'échelle d'une session
(minutes), l'effectif est **figé** à ce que l'âge de la faille dit ; il ne recroît qu'entre
deux visites.

✅ **ET ÇA CRÉE UN VRAI ARBITRAGE, celui que le Labyrinthe utilise déjà** (« push‑your‑luck :
retraite avec le butin vs pousser au trésor ») : **tôt** = faille maigre, incursion facile,
peu de mana ; **tard** = faille grasse, incursion dure, beaucoup de mana. Et c'est
**auto‑équilibrant** — un joueur fort attend pour farmer, un joueur faible y va tôt.

⚠️ **« VOIRE PLUS » NE DOIT PAS DEVENIR UNE VENGEANCE.** L'armée qui sort est **ce que la
faille contient à maturité**, point — c'est déjà la calibration ×1,3 mesurée ci‑dessous.
Renforcer l'armée **parce qu'on a essayé** rendrait la tentative pénalisante, l'inverse exact
de ce qu'on cherche. Le « voire plus » décrit la **régénération** qui dépasse les kills, pas
une punition.

⚠️ **CE QU'UNE INCURSION RATÉE RAPPORTE QUAND MÊME** : le **mana des monstres tués**. La
version précédente promettait « une incursion ratée n'est jamais perdue, elle prépare la
défense » — cette promesse disparaît, et le mana la remplace. C'est plus simple et ça suffit.

⚠️ **RESTE À TRANCHER : que devient la faille APRÈS avoir craché ?** Deux lectures. (a) Elle
**s'effondre** — la pression accumulée est relâchée, une place se libère, et le joueur qui
l'a ignorée paie **une fois** ; c'est cohérent avec « un POI expire », le garde‑fou déjà en
place, et avec la **règle 1 des sièges**. (b) Elle **repart à zéro** et crache tous les 7
jours — plus de pression, mais ⚠️ elle punit l'absence **en boucle**. **(a) recommandé.**

## Le renfort de menace : ×1,3 (mesuré)

Tenue d'un siège, enceinte à niveau, héros présent, vivier complet (150 sièges par case) :

| renfort  | niv 12 | 28     | 50     | 80     |
| -------- | ------ | ------ | ------ | ------ |
| ×1       | 90     | 91     | 85     | 89     |
| ×1,15    | 70     | 83     | 67     | 74     |
| **×1,3** | **53** | **71** | **52** | **51** |
| ×1,5     | 32     | 52     | 29     | 27     |
| ×2       | 2      | 11     | 0      | 0      |

**×1,3** : un vrai risque, jamais perdu d'avance, et **plat selon le niveau** — la
propriété qui autorise une valeur unique.

### ⚠️ Le point d'accroche existe déjà

`rollRaid` pose un `threat` par groupe (`earlyThreatMult`), **figé AU TIRAGE**. Conséquence
à assumer : **fermer une faille n'affaiblit pas une armée déjà en marche** — elle garde la
force annoncée par la Tour de guet. Fermer agit sur la suite : « ferme‑la avant la
prochaine ».

### ⚠️ La règle 1 des sièges doit tenir

« On ne perd jamais parce qu'on n'a pas ouvert l'app. » Garde‑fous déjà dans le moteur :
un POI **expire**, et `advanceBase` **repousse l'échéance pendant l'inactivité** — aucun
siège renforcé ne s'accumule pendant une absence.

### ⚠️ Un gain au passage

Le gate actuel (`defenseReadiness ≥ 0,85` pour allumer les sièges) devient **inutile** : il
existe pour ne pas écraser le débutant qui vient de bâtir son premier mur. Avec des failles
**de tout rang**, c'est le **rang de la faille** qui dose la menace — une petite faille près
d'un débutant, c'est une petite armée, et il peut aller la fermer. Une règle artificielle
en moins.

## 🐫 LE HARCÈLEMENT DES CONVOIS — pourquoi le renfort ne suffisait pas

⚠️ **LA QUESTION POSÉE PAR L'UTILISATEUR ÉTAIT LA BONNE** : « quel intérêt d'attaquer une
faille si on peut déjà la battre en défendant son attaque ? » Réponse mesurée : sans
renfort, une base à niveau tient **85‑91 %** de ses sièges — donc aucun intérêt. Avec le
renfort ×1,3, elle tombe à **51‑71 %** : laisser mûrir n'est plus gagner d'office, c'est
jouer son siège à la pièce.

**Mais ça ne suffit pas, et voici pourquoi** : perdre un siège coûte peu — le stock non
récolté, des réparations, un gel de production. On peut donc accepter le pari indéfiniment.

**Décidé : une faille ouverte IRRADIE un rayon autour d'elle.** Les routes et les lieux
proches passent en **`perilous`** (deux fois plus de rencontres, déjà télégraphié avant le
départ) et leur **`roadFoe` est mis à l'échelle du rang de la faille**.

✅ **C'est le levier le plus honnête des trois, pour deux raisons.** (1) Il frappe **là où
la base ne protège pas** : un rempart, des balistes, un héros et un vivier ne défendent pas
une cargaison sur la route. (2) Il **réutilise l'existant tel quel** — `perilous`,
`roadFoe`, `travelPosition` — donc **zéro nouveau modèle de combat**.

⚠️ **LE RAYON DOIT ÊTRE LIMITÉ ET CONTOURNABLE.** Sinon c'est le joueur **peu sportif** —
celui que les caravanes visent précisément, et qui n'a pas l'énergie de se payer une
incursion — qui souffre le plus : il subirait une taxe au lieu d'un choix. La carte porte
**~20 POI en permanence** (v0.683) : avec 3 à 6 failles, il doit rester des routes propres.
**À MESURER** : combien de lieux de récolte restent hors rayon, comme on a mesuré « la
carte tient jusqu'à 8 caravanes » (8,6 POI libres en moyenne).

⚠️ **UNE PISTE ÉCARTÉE, et c'est la plus tentante** : faire **MONTER** le renfort avec le
temps (×1,3 → ×1,5 → ×2). Mesuré, à **×2 la tenue tombe à 0‑11 %** — donc une faille
oubliée deux semaines donnerait un siège **imbattable**. Ça punirait celui qui joue mais
n'a pas l'énergie d'y aller, à la limite directe de la **règle 1 des sièges** (« on ne perd
jamais parce qu'on n'a pas ouvert l'app »). Le renfort reste **fixe à ×1,3**.

## 💎 Les pierres de mana : tout monstre de faille tué en rend

**Décidé** : fermer une faille en rend, et **chaque monstre de faille tué** aussi — **dans**
la faille, **sur la route** quand son armée marche, et **en défense de la base**.

⚠️ **C'est la troisième voie qui empêche la boucle d'enfermer le joueur** : celui qui n'a
pas l'énergie d'entrer encaisse le siège et touche **quand même** du mana. Sans elle, le
gacha serait réservé à ceux qui peuvent se payer des incursions.

⚠️ **Et aucun BÂTIMENT ne doit en produire** (décidé côté gacha, cf. sa spec) : la leçon de
la Dynamo de faille (v0.822) est qu'une production linéaire en niveau finit par dépasser le
sport. La monnaie du gacha doit rester adossée à une **activité**.

## Les pièces de set

**0 à 3, sets aléatoires**, en plus des trois sources existantes (aucune calibration
touchée).

⚠️ **Mesuré, l'effet sera symbolique** : ~40 nettoyages de donjon par jour donnent ~160
pierres d'invocation ; un boss en coûte 7 au niveau 30, soit **~23 boss par jour** et autant
de pièces **garanties** — de l'ordre de **150 par semaine**. Face à cela, 3 à 6 failles
fermées par semaine à 0‑3 pièces pèsent **~6 pièces**. Quel que soit le pourcentage retenu,
les failles ne changeront pas le rythme d'équipement.

**Ce qui est rare, c'est la BONNE pièce** : les boss tirent un set au hasard parmi huit,
puis un emplacement parmi quatre. Un ciblage (set de la voie, ou choix parmi trois) aurait
bien plus de valeur qu'une quantité — **proposé, écarté par l'utilisateur pour l'instant**.

## 💠 L'ENTRÉE EST GRATUITE — la faille EST l'usine de mana

**Décidé** : entrer dans une faille ne coûte **ni mana, ni énergie**. La faille est la
**source** de la monnaie du gacha, pas un guichet où on la dépense.

⚠️ **Deux options ont été écartées, dans cet ordre.** L'**énergie** d'abord, sur le motif de
l'utilisateur : « il ne faut pas qu'on soit bloqué par l'énergie si on doit se défendre » —
une faille n'est pas un choix comme un donjon, elle **vient** au joueur. Puis le **mana**
lui‑même, parce qu'il créait un point de calibrage fragile : le coût d'entrée devait rester
nettement sous le gain, sinon les incursions mangeaient tout et on ne tirait jamais.

✅ **CE QUI PORTE LE COÛT À LA PLACE : le TEMPS et l'EXCLUSIVITÉ DU HÉROS.** Il ne peut être
qu'à un endroit à la fois (`expeSend` le refuse déjà s'il est parti) : une incursion entre
donc en concurrence directe avec une expédition, un camp, un Labyrinthe — et avec la
**défense de la base**. Un échec ne coûte pas une monnaie, il coûte une **convalescence**
(décidé : défaite du héros → Infirmerie). C'est la famille des **caravanes** : une boucle
qui consomme du **TEMPS** au lieu de l'**ÉNERGIE**, « seul axe où le joueur peu sportif est
à égalité » (v0.725).

✅ **ET LE SPORT RESTE LE PLAFOND DE PUISSANCE**, ce qui est la vraie règle fondatrice : la
**rareté** d'un champion se tire librement, mais son **RANG** est plafonné par celui du
héros, donc par le sport. Un collectionneur chanceux ne dépasse pas le plafond de puissance
d'un joueur assidu — il a juste plus de monde. Le sport cesse d'être le plafond du **temps
de jeu**, pas celui de la puissance.

✅ **Le mana n'a plus qu'UN seul puits — le gacha.** Une monnaie, une destination : c'est
plus lisible, et il n'y a plus deux barèmes à tenir d'accord.

⚠️ **CE QUE ÇA DÉPLACE, et il faut le dire : le TAUX D'APPARITION devient le robinet du
gacha.** Sans coût d'entrée, un joueur qui ferme ses failles aussi vite qu'elles s'ouvrent
voit son mana couler **au rythme du spawn** — donc c'est lui, et lui seul, qui règle le débit
de la monnaie. La section « le taux d'apparition n'a pas besoin d'un coefficient » ci‑dessus
raisonnait sur un **rythme de contenu** ; elle porte désormais aussi l'**économie**.

✅ **Bonne nouvelle : c'est un robinet PLAT, pas linéaire en niveau.** Le nombre de failles
est borné (3 à 6) quel que soit le niveau du joueur — il ne peut donc pas dépasser le sport
en montant. C'est exactement l'inverse des deux robinets qu'il a fallu corriger : la
**Dynamo** divisée par 8 (v0.822) et la **Porte du Labyrinthe** par 4 (v0.794), toutes deux
**linéaires en niveau**. Un débit plat se calibre une fois.

## Reste à trancher

- **Le rayon d'irradiation** d'une faille ouverte — ⚠️ à MESURER (combien de lieux de
  récolte restent hors rayon avec 3 à 6 failles), pas à choisir : c'est lui qui décide si le
  harcèlement est un choix ou une taxe.
- **Ce que devient la faille après avoir craché** : elle s'effondre (recommandé) ou elle
  repart à zéro (cf. la section sur l'effectif).
- **La COURBE de croissance de l'effectif** sur les 7 jours (linéaire ? accélérée à
  l'approche du débordement ?) et le nombre de monstres avant la porte. ⚠️ C'est elle qui
  règle **le débit de mana**, donc le rythme du gacha : à mesurer, pas à choisir.
- ~~**L'état persistant d'une faille**~~ — ✅ **RÉSOLU** par la croissance à l'âge : rien à
  retenir, l'effectif se dérive de `spawnAt`. La faille rentre dans le modèle des POI sans
  mémoire, et une incursion est une session (on ressort, elle s'est reformée).
- **Ce que devient la fouille des cadavres** si on ferme tout : la Base garde‑t‑elle du
  travail ? À mesurer.
- **Le rendu** : la salle du boss décorée est le gros morceau visuel. ⚠️ Aucune porte ne
  regarde la carte ni la Base — banc jetable obligatoire.
