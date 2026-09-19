# Gacha de champions — étude de conception

**État : ÉTUDE, rien n'est implémenté.** Décisions prises avec l'utilisateur le 2026‑09‑19.

## L'intention

Tirer au sort des **champions** — bien moins forts que le héros — avec les **pierres de
mana** pour monnaie. Ils s'équipent, ont des compétences, et les doublons les renforcent.

## Décisions prises

| Sujet | Décision |
| --- | --- |
| Périmètre | **Le gacha REMPLACE le recrutement d'aventuriers** |
| Vocabulaire | **Raretés nommées** (commun → primordial), **PAS de nouvelle échelle d'étoiles** |
| Rang du champion | **L'échelle de prestige du héros** (Bronze ★1 → …), **plafonnée au rang du héros** |
| Taux | **Toutes les raretés tirables**, aux taux d'un gacha (le plus haut ≈ 0,6 %) |
| Ce qui est plafonné | **le RANG**, jamais la rareté tirée |
| Chemin du champion | **FIXÉ au tirage** — vrai gacha, le kit est son identité |
| Évolution de rareté | **NON** — la rareté est figée, c'est le rang qui monte |
| Duplicatas | **Éveil** : ils renforcent le kit de l'exemplaire possédé |
| Rôles par rareté | **une version de chaque rôle à chaque rareté**, de plus en plus puissante |
| Monnaie | **Pierres de mana** |
| Plafond de nombre | **aucun sur la collection** ; la Guilde plafonne le **déploiement** |

## ⚠️ LES DEUX ÉCHELLES NE SE CONFONDENT PAS

C'est ce qui a débloqué la conception. Les étoiles étaient **déjà prises deux fois** dans
le projet (`rankStarStr` pour le rang, `jetStar` pour la qualité de tirage d'un objet) —
une troisième aurait été illisible.

| | Vient du | Dit quoi | Plafonné par |
| --- | --- | --- | --- |
| **Rareté** (nom) | le **tirage** | la puissance et la profondeur du kit | rien — tout est tirable |
| **Rang** (★ de prestige) | le **combat** | où il en est de sa progression | **le rang du héros** |

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

**Ce qui meurt** : `classChoices` (le choix 1‑parmi‑3), `canPromote`. Le **Centre de
formation** garde son métier — le TEMPS de chaque cran (`trainMsFor`, `stratumTrainMult`).

⚠️ **Ce qu'on perd, et il faut le dire** : le build‑crafting individuel. Dans un gacha on
ne construit pas un personnage, on choisit **lequel**. C'est le deal, accepté.

## 🩺 « Une version du soigneur par rareté » — mesuré : 27 cases sur 32

| Rareté | Classes | Rôles présents | Signatures |
| --- | --- | --- | --- |
| commun | 5 | 👁️ 🐫 — **manque 🩺 🧭** | **aucune** |
| inhabituel | 15 | les 4 ✅ | **aucune** |
| magique | 14 | les 4 ✅ | **aucune** |
| rare | 13 | 🩺 🐫 🧭 — manque 👁️ | les 8 ✅ |
| épique | 12 | les 4 ✅ | les 8 ✅ |
| légendaire | 12 | 🐫 🧭 👁️ — **manque 🩺** | les 8 ✅ |
| mythique | 11 | 🩺 🐫 🧭 — manque 👁️ | les 8 ✅ |
| primordial | 11 | les 4 ✅ | les 8 ✅ |

**À écrire : 5 classes** pour compléter la grille rôle × rareté.

⚠️ **Plus gênant : aucune signature de combat avant « rare »** (c'est la règle actuelle,
strates ≥ 3). Dans un gacha, même un 1★ a une compétence — les **trois raretés basses
sont à doter**.

## ⚠️ LA CONTRAINTE CHIFFRÉE : l'écart de rareté doit rester sous ×11,5

Le rang multiplie les stats par **×11,5** (`ADV_LEVEL_K` 0,15 sur 71 niveaux). Pour qu'un
**commun investi batte un primordial nu** — la propriété que tous les gachas défendent —
l'écart de rareté doit rester **sous ce facteur**.

Or `STRATUM_BUDGET` va de **6** à **106** (chaîne complète) = **×17,7** : le primordial nu
écraserait le commun monté à fond. **Le remède est un plancher, pas un plafond** :

| | Budget | Écart | Commun au rang du héros | Primordial nu |
| --- | --- | --- | --- | --- |
| aujourd'hui | 6 → 106 | ×17,7 | 69 | **106** ❌ |
| proposé | **20 → 106** | **×5,3** | **230** ✅ | 106 |

Garder **106 en haut** est non négociable : c'est lui qui tient tout l'équilibrage de fin
de partie (`refAdventurer`, 7 fichiers de test). Seul le plancher bouge.

⚠️ **Référence gacha** : un 5★ de Genshin n'a que **+10 à +20 %** de stats de base sur un
4★ — l'écart réel est dans le kit. ×5,3 sur **huit** crans reste généreux ; c'est un
arbitrage, pas une vérité.

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

## ⚔️ La Guilde : elle plafonne le DÉPLOIEMENT, plus la POSSESSION

Un gacha ne limite pas la collection, il limite **l'équipe**. `guildRoster`
(= 1 + niveau/2) garde donc sa formule et change de sens : **combien de champions peuvent
être déployés en même temps** (convois + camps + défense). Le reste est en collection.

⚠️ La Guilde perd en revanche son **autre** métier : elle plafonne aujourd'hui le niveau
d'un aventurier, or ce plafond devient le **rang du héros**. Le déploiement suffit à la
faire vivre jusqu'au niveau 100 — pas de bâtiment mort (règle v0.731).

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

## ⚠️ ORDRE DE CONSTRUCTION : les failles d'abord

Les **pierres de mana n'existent pas encore** — elles viennent des failles, qui ne sont pas
implémentées. Sans elles, le gacha n'a **pas de monnaie**. Ordre :
**failles → pierres de mana → gacha**.

## Comment marche un gacha (référence)

- **Taux** typiques : 5★ ≈ 0,6 %, 4★ ≈ 5 %, le reste en 3★. À taux nu, on peut tirer 200
  fois sans rien.
- ⚠️ **Le PITY est indispensable** : *soft pity* (les taux montent vers le 75ᵉ tirage) et
  *hard pity* (garanti au 90ᵉ). Sans lui, un joueur malchanceux n'a jamais rien — et ici
  il n'y a pas d'argent réel pour compenser.
- **Duplicatas** : chaque doublon monte un cran. Un tirage n'est jamais perdu.
- **Progression séparée du tirage** : c'est elle qui fait qu'un **4★ investi bat un 5★ nu**
  — la propriété qui garde les basses raretés utiles (cf. la contrainte ×11,5 ci‑dessus).
- **Bannières limitées** : créent l'urgence… **sans objet ici** (pas de monétisation). Un
  pool permanent suffit.

## Ce que ça apporterait

- La **rareté** à la place des classes toutes communes (mesuré : les 16 aventuriers du
  compte réel sont tous en strate 0, donc tous « communs » et à moitié sans compétence).
- Les **duplicatas qui servent enfin** : aujourd'hui deux recrues identiques ne
  s'additionnent pas.
- Un **usage clair pour les pierres de mana**, sans créer une monnaie de plus.
- Tout le reste est conservé : équipement d'aventurier, compagnons, talents, convois,
  défense, camps.

## Reste à trancher

- **Le nom** du personnage tiré — « champion » retenu provisoirement, hors des mots déjà
  pris (héros, aventurier).
- **Les taux et le pity**, une fois connu le débit de pierres de mana (donc après les
  failles).
- **Le plancher de budget** (20 proposé) et la forme de la courbe entre 20 et 106.
- **Ce que l'Éveil monte exactement** : magnitude du kit, niveau de compétence, ou les deux.
- **Le sort des 5 cases de rôle manquantes** et des **signatures sous « rare »**.
- **La migration** : que deviennent les 16 aventuriers existants du compte réel ?
