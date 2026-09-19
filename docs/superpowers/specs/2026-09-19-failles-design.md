# Failles — étude de conception

**État : ÉTUDE, rien n'est implémenté.** Décisions prises avec l'utilisateur le 2026‑09‑19,
mesures qui les encadrent, et ce qui reste ouvert.

## L'intention

Une faille est un **monde ouvert** qu'on referme en tuant son boss. Non fermée, elle
**crache son armée**, qu'on voit marcher sur la carte vers la base. On peut l'intercepter,
ou encaisser. Et **chaque monstre tué dans la faille affaiblit l'armée qui en sortira** :
une incursion ratée n'est jamais perdue, elle prépare la défense.

## Décisions prises

| Sujet                 | Décision                                                                         |
| --------------------- | -------------------------------------------------------------------------------- |
| Rapport au Labyrinthe | **Deux modes DISTINCTS** — la faille ne le remplace pas                          |
| Sièges                | **Les failles REMPLACENT la source des sièges** : toute armée vient d'une faille |
| Tour de guet          | **Elle révèle l'armée sur la carte** — sans elle, une **tache floue**            |
| Interception          | **Le combat de GROUPE des camps** (héros et/ou aventuriers)                      |
| Nombre de failles     | **3 à 6 simultanées**, de rangs variés                                           |
| Maturation            | **7 jours** avant qu'une faille crache son armée                                 |
| Pierres de mana       | **Failles ET cadavres du siège** — la boucle ne peut pas enfermer le joueur      |
| Ferraille             | **Conservée** pour l'instant (chantier d'économie séparé)                        |
| Pièces de set         | **0 à 3, sets aléatoires**, en PLUS des sources existantes                       |
| Défaite du héros      | **Infirmerie**, comme sur un camp                                                |

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

## ⚠️ Mana ou énergie : à trancher

Si entrer en faille ne coûte que des **pierres de mana**, l'activité **échappe au sport** —
or « le sport est le plafond » est la règle fondatrice du projet.

- **Coûter aussi de l'énergie** : cohérent avec les donjons, mais ⚠️ on pourrait être
  incapable de défendre faute d'énergie — une punition de trop, la faille n'étant pas
  vraiment un choix.
- **Assumer** : le butin reste plafonné en rang par le niveau (anti‑runaway), donc le sport
  reste le plafond de **puissance**, plus celui du **temps de jeu**. _(Préférence exprimée
  côté conception, non tranchée.)_

## Reste à trancher

- **Mana ou énergie** à l'entrée (ci‑dessus).
- **Ce qu'on perd** en ressortant sans le boss — les monstres tués, eux, restent acquis.
- **La forme de la montée en tension** dedans, et le nombre de monstres avant la porte.
- **L'état persistant d'une faille** : les POI actuels sont **sans mémoire**, une faille doit
  retenir ce qui y a été tué. C'est le seul endroit où elle s'écarte vraiment du modèle.
- **Ce que devient la fouille des cadavres** si on ferme tout : la Base garde‑t‑elle du
  travail ? À mesurer.
- **Le rendu** : la salle du boss décorée est le gros morceau visuel. ⚠️ Aucune porte ne
  regarde la carte ni la Base — banc jetable obligatoire.
