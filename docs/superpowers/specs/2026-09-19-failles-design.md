# Failles — étude de conception

**État : ÉTUDE, rien n'est implémenté.** Décisions prises avec l'utilisateur le 2026‑09‑19,
mesures qui les encadrent, et ce qui reste ouvert.

## L'intention

Une faille est un **monde ouvert** qu'on referme en tuant son boss. Non fermée, elle
**crache son armée**, qu'on voit marcher sur la carte vers la base. On peut l'intercepter,
ou encaisser. Et **chaque monstre tué dans la faille affaiblit l'armée qui en sortira** :
une incursion ratée n'est jamais perdue, elle prépare la défense.

## Décisions prises

| Sujet                 | Décision                                                                                |
| --------------------- | --------------------------------------------------------------------------------------- |
| Rapport au Labyrinthe | **Deux modes DISTINCTS** — la faille ne le remplace pas                                 |
| Sièges                | **Les failles REMPLACENT la source des sièges** : toute armée vient d'une faille        |
| Tour de guet          | **Elle révèle l'armée sur la carte** — sans elle, une **tache floue**                   |
| Interception          | **Le combat de GROUPE des camps** (héros et/ou aventuriers)                             |
| Nombre de failles     | **3 à 6 simultanées**, de rangs variés                                                  |
| Maturation            | **7 jours** avant qu'une faille crache son armée                                        |
| Laisser une faille    | **renfort de menace ×1,3** (mesuré) **+ harcèlement des convois** (cf. plus bas)        |
| Coût d'entrée         | **pierres de mana SEULES** — pas d'énergie : on ne doit jamais être à sec pour défendre |
| Pierres de mana       | **Failles + tout monstre de faille tué** — dans la faille, sur la route, en défense     |
| Ferraille             | **Conservée** pour l'instant (chantier d'économie séparé)                               |
| Pièces de set         | **0 à 3, sets aléatoires**, en PLUS des sources existantes                              |
| Défaite du héros      | **Infirmerie**, comme sur un camp                                                       |

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

## 💠 L'ENTRÉE SE PAIE EN PIERRES DE MANA SEULES — décidé

**Motif de l'utilisateur** : « il ne faut pas qu'on soit bloqué par l'énergie si on doit se
défendre ». Une faille n'est pas un choix comme un donjon — elle **vient** au joueur, et
arriver à sec d'énergie le jour où il faut défendre serait une punition de trop.

⚠️ **CE QUE ÇA CHANGE : le frein n'est plus l'ÉNERGIE, c'est le TEMPS RÉEL.** Et c'est
cohérent avec la direction du projet plutôt qu'une exception : les **caravanes** ont été
conçues exactement comme ça (« une boucle qui consomme du TEMPS au lieu de l'ÉNERGIE, seul
axe où le joueur peu sportif est à égalité », v0.725). Les failles rejoignent cette famille.

✅ **LE DÉBIT RESTE BORNÉ — par la CARTE, pas par l'énergie.** Le nombre de failles est
plafonné (3 à 6) et la maturation dure 7 jours : on ne peut donc pas en faire plus que ce
qui apparaît, quel que soit l'appétit. C'est ce qui empêche la boucle
« fermer → gagner du mana → entrer » d'être une machine à mouvement perpétuel.

✅ **ET LE SPORT RESTE LE PLAFOND DE PUISSANCE**, ce qui est la vraie règle fondatrice : la
**rareté** d'un champion se tire librement, mais son **RANG** est plafonné par celui du
héros, donc par le sport. Un collectionneur chanceux ne dépasse pas le plafond de puissance
d'un joueur assidu — il a juste plus de monde. Le sport cesse d'être le plafond du **temps
de jeu**, pas celui de la puissance.

✅ **Effet de bord heureux** : le mana devient à la fois la monnaie du **gacha** et le péage
des **incursions** — donc un vrai arbitrage (« je tire, ou j'entre ? »), et un second puits
pour une monnaie qui n'en avait aucun.

⚠️ **À CALIBRER, et c'est bloquant** : le coût d'entrée doit rester **nettement inférieur**
au mana qu'une faille rapporte, sinon les incursions mangent tout et on ne tire jamais. À
mesurer avec le débit, après implémentation.

## Reste à trancher

- **Le rayon d'irradiation** d'une faille ouverte — ⚠️ à MESURER (combien de lieux de
  récolte restent hors rayon avec 3 à 6 failles), pas à choisir : c'est lui qui décide si le
  harcèlement est un choix ou une taxe.
- **Ce qu'on perd** en ressortant sans le boss — les monstres tués, eux, restent acquis.
- **La forme de la montée en tension** dedans, et le nombre de monstres avant la porte.
- **L'état persistant d'une faille** : les POI actuels sont **sans mémoire**, une faille doit
  retenir ce qui y a été tué. C'est le seul endroit où elle s'écarte vraiment du modèle.
- **Ce que devient la fouille des cadavres** si on ferme tout : la Base garde‑t‑elle du
  travail ? À mesurer.
- **Le rendu** : la salle du boss décorée est le gros morceau visuel. ⚠️ Aucune porte ne
  regarde la carte ni la Base — banc jetable obligatoire.
