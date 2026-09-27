# 🔮 Runes de compétence — spec (2026-09-27)

Conçue avec l'utilisateur, décisions arrêtées le 2026-09-27. Rien n'est implémenté.
Les chiffres marqués _à mesurer_ sont des points de départ : chacun sera fixé par une sonde
sur les vraies fonctions du jeu avant livraison (règle du projet : mesurer, jamais affirmer).

## 1. Le principe

Les compétences des champions ne sont plus écrites à la main. Un champion obtient ses
compétences en recevant des **runes**, gagnées par le joueur et posées sur le champion de son
choix. Chaque rune tire une compétence **au hasard** dans son cran.

Ce qui disparaît :

- les **signatures** fixes des 34 champions (`Champion.skills`) ;
- les **rôles de convoi** fixes (`Champion.role` : 🩺 🐫 🧭 👁️ 🎓) — ils deviennent des
  compétences tirables comme les autres ;
- les **crans d'Éveil écrits** (`Champion.awaken`, une signature qui gagne un niveau).

Ce qui reste : la lettre (A / S / X), la forme des stats, la lignée (équipement portable), le
visage, le nom.

## 2. Le nom et les crans

« Ticket » est déjà pris (🎟️ tickets d'invocation). La ressource s'appelle **rune de
compétence**. Les noms de rang (Bronze, Argent, Or…) et les lettres du gacha (B / A / S) sont
déjà employés ailleurs : les crans sont désignés par **une couleur**.

| Cran | Rune | Posable sur |
|---|---|---|
| 1 | 🟢 Verte | tout champion |
| 2 | 🔵 Bleue | tout champion |
| 3 | 🟣 Violette | champion de rang Argent ou plus |
| 4 | 🟠 Dorée | champion de rang Or ou plus |

Le garde-fou de rang reprend la règle du jeu « rareté ≤ rang » (équipement, familiers) : un
champion fraîchement tiré ne devient pas un monstre en une rune.

## 3. Le catalogue — 16 compétences, 4 par cran

**Chaque compétence appartient à UN SEUL cran** (décision de l'utilisateur) : la Vitesse
n'existe qu'en vert. Utilitaire en bas, combat en haut.

| Cran | Compétences |
|---|---|
| 🟢 Utilitaire | 🧭 Vitesse · 🩺 Soin · 🐫 Cargaison · 👁️ Repérage |
| 🔵 Soutien | ❤️ PV · ⚔️ Dégâts · 🛡️ Réduction · 🎓 Mentor |
| 🟣 Combat | 💥 Critique · 🩸 Vol de vie · 🌵 Épines · 🪓 Exécution |
| 🟠 Sommet | 🔥 Rage · 🌀 Élan · 2 compétences uniques (à écrire) |

Les effets réutilisent ce que le jeu sait déjà appliquer : les rôles de convoi (`CARAVAN.*`),
les effets de combat (`EffectType`, joués par `simulateCombat`), le Mentor (v0.1223). Les deux
compétences uniques doivent changer le combat ou le voyage (idées : « ignore la première
embuscade du voyage », « un coup sur trois est critique ») — à écrire et à mesurer.

### Le cumul

- Une compétence **se cumule sur elle-même** : tirer une compétence que le champion porte déjà
  la fait monter d'un niveau, **sans prendre d'emplacement**.
- **Niveau maximum : 5.**
- **Rendement décroissant** : chaque niveau apporte moins que le précédent.
- **Une compétence de cran N au niveau 5 reste sous ce qu'apporte le cran N+1** — sinon cumuler
  du vert battrait le doré et les crans perdraient leur sens.
- Les plafonds d'équipe existants restent (ex. trajet −30 % au total, `CARAVAN.speedMax`).

Barème indicatif (_à mesurer_) :

| Compétence | Niv. 1 | Niv. 5 | Référence actuelle |
|---|---|---|---|
| 🧭 Vitesse | −6 % trajet | −15 % | rôle : −8 %/cran, plafond −30 % |
| 🐫 Cargaison | +8 % | +22 % | rôle : +12 %/cran, plafond +40 % |
| 👁️ Repérage | −8 % embuscades | −22 % | rôle : −12 %/cran, plafond −40 % |
| 🩺 Soin | −15 % convalescence | −40 % | rôle : −25 %/cran, plafond −60 % |
| 🎓 Mentor | +8 % XP équipe | +20 % | rôle : +15 %/cran, plafond +30 % |
| Combat (🔵 à 🟠) | selon cran | selon cran | signature : 12 % par niveau |

⚠️ **La vitesse est le plus gros levier économique du jeu** (mesuré v0.935 : −20 % de trajet →
+25 % de revenu/jour ; −50 % → +90 à +100 %). Aucune valeur de vitesse ne dépasse le plafond
d'équipe actuel.

## 4. Emplacements et remplacement

| Lettre | Emplacements |
|---|---|
| A | 2 |
| S | 3 |
| X (Adamantium) | 4 |

Quand une rune est utilisée sur un champion :

1. la compétence tirée est **déjà portée** → elle monte d'un niveau (plafond 5) ;
2. elle est **nouvelle** et un emplacement est **libre** → elle s'y installe au niveau 1 ;
3. elle est **nouvelle** et tous les emplacements sont **pris** → le joueur choisit :
   - **remplacer** une compétence existante : la nouvelle arrive **au niveau 1**, l'ancienne
     et ses niveaux sont perdus ;
   - **garder** ses compétences : la rune est **consommée** sans effet.
     _À confirmer à l'implémentation — une variante « rune rendue » évite la frustration._

⚠️ Cas limite : une compétence déjà au niveau 5 tirée à nouveau. Proposition : relancer le
tirage dans le même cran (la rune ne se perd pas sur un plafond atteint).

## 5. D'où viennent les runes

### Sources de base

- **Ascension** (changement de rang du champion, Bronze → Argent, etc.) : **une rune** pour le
  joueur, de couleur **tirée**. Plus le rang atteint est haut, meilleures sont les chances
  (_table à écrire_ : passer Argent → surtout 🟢, un peu 🔵 ; passer Divin → surtout 🟣 et 🟠).
- **Éveil** (doublon au tirage) : **une rune offerte** par cran, **en plus** du bonus de stats
  de base existant (+8 % par cran, `AWAKEN.perStep`).

### Sources sur la carte et dans les événements

| Source | Rune |
|---|---|
| 📖 Archives (lieu de récolte) | 🟢 garantie |
| 🕳️ Faille refermée, rang **inférieur** au tien | 🟢 |
| 🕳️ Faille refermée, **ton rang** | 🔵 |
| 🕳️ Faille refermée, **un rang au-dessus**, jeune | 🟣 |
| 🕳️ Faille refermée, **un rang au-dessus**, mûre | 🟠 |
| 🐉 Boss entre amis | selon le cran (Échauffement : aucune → Inhumain : 🟠) |
| 🎯 Défi 360 bouclé dans les temps | 🟢 à 🔵 selon l'intensité |

Une incursion **ratée** ne donne pas de rune (la faille n'est pas refermée).

**Écartés** : les boss de palier (décision de l'utilisateur), les donjons (farmés sans fin, ils
inonderaient les runes), les sièges (ils ne se provoquent pas, flux imprévisible).

### La faille d'un rang au-dessus

La place de faille « au-dessus » actuelle (`riftLevelFor`, niveau joueur +1 à +25 %) est
**remplacée** par une faille **d'un rang de prestige au-dessus** (rang joueur + 1, niveau tiré
dans la tranche de ce rang). Pas de faille à +2 rangs.

Mesuré le 2026-09-27 (`resolveIncursion`, 80 incursions par case), champions de référence
**Or noir ★5** (niveau 40, budget S), équipés au niveau 40, **sans le héros**, faille **mûre** :

| Faille | 3 champions | 5 | 8 | 12 |
|---|---|---|---|---|
| Ton rang (niv. 40) | 76 % | 100 % | 100 % | 100 % |
| +1 rang, bas (niv. 45) | 0 % | 66 % | 100 % | 100 % |
| +1 rang, haut (niv. 50) | 0 % | 36 % | 100 % | 100 % |
| +2 rangs, bas (niv. 55) | 0 % | 0 % | 15 % | 99 % |
| +2 rangs, haut (niv. 60) | 0 % | 0 % | 3 % | 74 % |

Avec l'Éveil complet (6 crans) : +1 rang haut 19 / 99 / 100 % (3 / 5 / 8) ; +2 rangs bas
0 / 11 / 98 % ; +2 rangs haut 0 / 0 / 78 %. Une faille jeune (1 jour) est nettement plus
facile (+1 rang haut, 5 champions : 83 % contre 36 %). Des champions **A** valent ~1,45× moins.

Lecture : +1 rang demande 5 à 8 champions de ton rang, le doré exige en plus de laisser mûrir.

⚠️ **À re-mesurer** : une faille d'un rang au-dessus paie plus de mana que l'ancienne place
« au-dessus » (+25 % max) — le débit de mana alimente le gacha (`riftManaDebit.test`).

## 6. Ce que ça touche, et ce qui reste à trancher

- **Calibration des combats** : routes, camps, failles et sièges se mesurent contre des
  champions de référence (`REF_CHAMPIONS_BY_RANK`) aux compétences fixes. Il faut leur définir
  un **build moyen** (combien d'emplacements remplis, à quels niveaux, selon le rang) et
  re-mesurer toutes les bandes.
- **Composition des équipes** : les rôles n'étant plus garantis par le roster, un vivier peut
  manquer d'éclaireur ou de soigneur. Accepté (les runes 🟢 sont les plus fréquentes).
  `suggestEscort` (couverture de rôles) est à adapter.
- **Champions déjà possédés** : leurs signatures et rôles disparaissent. _À trancher :_
  compensation en runes (par exemple autant de runes que d'ascensions et de crans d'Éveil déjà
  passés), ou conversion de leurs compétences actuelles en compétences tirables équivalentes.
- **Mentor** : livré en v0.1223 comme rôle fixe (Anselme, Vesper), il devient une compétence
  🔵 ; le champion de référence garde son rôle d'origine jusqu'à la refonte.
- **Persistance** : `Adventurer` gagne ses compétences (JSONB `characters.adventurers`, aucune
  migration de colonne) ; les runes du joueur vont dans une colonne additive (4 compteurs).
- **Écrans** : réserve de runes (plateau de ressources), feuille « utiliser une rune » sur la
  fiche d'un champion, révélation du tirage, choix du remplacement.

## 7. Étapes proposées

1. Lib pure : catalogue, barème, cumul, emplacements, tirage, règle de remplacement (+ tests
   et mutations).
2. Sources : ascension, Éveil, archives, failles (dont la faille +1 rang), boss entre amis,
   Défi 360.
3. Calibration : build moyen des champions de référence, re-mesure routes / camps / failles /
   sièges / mana.
4. Migration des champions possédés.
5. Écrans.
