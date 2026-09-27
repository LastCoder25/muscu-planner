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

## 3. Le catalogue — 18 compétences

**Chaque compétence appartient à UN SEUL cran** (décision de l'utilisateur) : la Vitesse
n'existe qu'en vert. Utilitaire en bas, combat en haut.

| Cran | Compétences |
|---|---|
| 🟢 Utilitaire | 🧭 Vitesse · 🩺 Soin · 🐫 Cargaison · 👁️ Repérage |
| 🔵 Soutien | ❤️ PV · ⚔️ Dégâts · 🛡️ Réduction · 🎓 Mentor |
| 🟣 Combat | 💥 Critique · 🩸 Vol de vie · 🌵 Épines · 🪓 Exécution · 🔥 Rage · 🌀 Élan |
| 🟠 Sommet | 🧲 Pillard · 🕳️ Scelleur de failles · ⚡ Premier sang · ✨ Second souffle |

Les effets réutilisent ce que le jeu sait déjà appliquer : les rôles de convoi (`CARAVAN.*`),
les effets de combat (`EffectType`, joués par `simulateCombat`), le Mentor (v0.1223).

Rage et Élan descendent en 🟣 (décision de l'utilisateur, 2026-09-27) pour laisser le cran doré
aux 4 compétences uniques. Les crans n'ont donc pas tous la même taille (4 / 4 / 6 / 4).

### Les 4 compétences dorées

Elles se cumulent comme les autres jusqu'au niveau 5 — plus rare, donc à long terme.
✅ **Livré (v0.1242)** — ce qui a changé à la mesure :

- ✨ **Second souffle AMORTIT le coup fatal** de {v} % (une fois par mission), il ne relève
  plus « avec v % des PV ». Mesuré : se relever valait autant à 20 qu'à 40 % (le combat se
  jouait sur le coup d'après), donc monter la rune n'aurait servi à rien — et le niveau 1
  valait +30 à +50 % de PV. Amorti, il suit sa valeur : niveau 1 ≈ +7 % de PV, niveau 5 ≈ +22 %.
- ⚡ Premier sang : niveau 1 ≈ +4 à +13 % de dégâts selon le niveau (un seul tour compte).
- 🧲 Pillard : la chance vient du MEILLEUR porteur de l'équipe (jamais la somme), sur les
  lieux de récolte ; il double or, pierres, mana et clés — **jamais l'énergie**.
- 🕳️ Scelleur : le meilleur porteur, sur une faille REFERMÉE seulement.
- ⚠️ **Les étalons ne portent AUCUNE dorée** : un seul Premier sang ou Second souffle chez un
  champion de référence déplaçait une bande de difficulté (trio sur route calme au niveau 70,
  91 % → 99 %). L'étalon est le joueur médian ; une dorée est un bonus au-dessus de lui.
- La puissance les compte (`powerOpeningW` 0,25, `powerLastStandW` 0,5, mesurés).

Valeurs de départ (le tableau d'origine) :

| Compétence | Effet | Niv. 1 → Niv. 5 |
|---|---|---|
| 🧲 Pillard | chance, sur un lieu de récolte, de ramener une **seconde cargaison**, quelle que soit la ressource | 10 % → 30 % |
| 🕳️ Scelleur de failles | **mana** en plus quand l'équipe referme une faille | +10 % → +40 % |
| ⚡ Premier sang | **dégâts de l'équipe** au premier tour de chaque combat | +30 % → +100 % |
| ✨ Second souffle | une fois par mission, l'équipe **survit à un coup fatal** avec une part de ses PV | 20 % → 40 % des PV |

⚠️ Dans les camps et les failles l'équipe est FUSIONNÉE en un seul combattant : ces effets
s'appliquent à l'équipe entière. Pillard et Scelleur touchent l'économie (or, ressources,
mana → gacha) : leurs plafonds se fixent contre `goldSink`, `campEconomy` et
`riftManaDebit`.

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
   - **garder** ses compétences : la rune est **perdue**, sans compensation (décision de
     l'utilisateur : refuser un remplacement, c'est de l'optimisation — la rendre serait trop
     facile).

Une compétence déjà au **niveau 5** tirée à nouveau : le tirage est **relancé** dans le même
cran (décision de l'utilisateur) — la rune ne se perd pas sur un plafond que le joueur ne
choisit pas. Si toutes les compétences du cran sont au niveau 5, la rune ne peut pas être
utilisée sur ce champion (l'écran le dit).

## 5. D'où viennent les runes

_Révisé le 2026-09-27 (décisions de l'utilisateur) : garantie à l'ascension et à l'Éveil,
partout ailleurs une CHANCE, uniquement sur les lieux de la carte._

### Garanties

- **Ascension** (changement de rang du champion) : une rune, couleur tirée selon le rang
  ATTEINT (`ascensionRuneOdds` : Argent 80/20/0/0 % … Tout-puissant 5/20/45/30 %).
- **Éveil** (doublon au tirage) : une rune par cran, **en plus** du bonus de stats existant
  (+8 % par cran). Couleur tirée selon la **lettre** du champion et le **cran** atteint
  (`awakenRuneOdds`, options B + C) : un X tire mieux qu'un S, un S mieux qu'un A, et le
  6ᵉ cran mieux que le 1ᵉʳ.

### Chance sur les lieux de la carte

Un lieu **réussi** a une chance de lâcher une rune (`rollPlaceRune`) : camps, repaires,
récoltes (mine, puits, sanctuaire, archives, mine de mana), failles refermées, bandes
interceptées, ruines, tanières, caravanes pillées, points de contrôle. La liste est un
`Record<PoiType, boolean>` exhaustif : un type de lieu ajouté sans décision ne compile pas.

**Exclus** : l'arène (héros seul, les runes servent aux champions), l'épave (legacy), et tout
ce qui n'est pas un lieu — sièges, donjons, boss de palier, Labyrinthe, boss entre amis,
Défi 360.

| Lieu, comparé à ton rang | Chance | Couleur (🟢 / 🔵 / 🟣 / 🟠) |
|---|---|---|
| en dessous | 2 % | 85 / 13 / 2 / 0 % |
| ton rang | 5 % | 70 / 22 / 7 / 1 % |
| au-dessus | 12 % | 45 / 33 / 18 / 4 % |
| faille au-dessus, mûre (≥ mi-vie) | 24 % | 25 / 35 / 28 / 12 % |

Une faille refermée compte **double** (treize combats et un gardien). Une mission ratée ne
donne rien.

**Mesuré** (carte simulée 30 jours, missions d'équipe au rythme des créneaux d'Avant-poste +
2 missions du héros, 80 % de réussite, profil régulier 700 XP/jour, ascension comprise) :

| Niveau | Missions / jour | Chance moyenne | Runes / jour | Runes / champion / rang |
|---|---|---|---|---|
| 15 | 6,4 | 4,3 % | 0,27 | 1,8 |
| 35 | 11,2 | 3,5 % | 0,40 | 2,1 |
| 65 | 20,8 | 3,5 % | 0,73 | 3,1 |
| 95 | 28,0 | 3,1 % | 0,87 | 3,5 |

Cible : ~3 runes par champion et par rang, soit un build S presque complet (≈ 13 runes sur
15) vers le rang 5. ⚠️ Le rythme monte avec le niveau (les créneaux croissent plus vite que
le vivier engagé) ; à surveiller à l'usage.

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

✅ **Livré (v0.1242)** : seules les FAILLES visent le rang suivant (`riftLevelFor(…, true)`) ;
les autres lieux, qui tirent aussi leur rang par `riftLevelFor` depuis la v0.1028, gardent
l'écart proportionnel (leur économie est calibrée dessus). `riftManaDebit` reste dans sa
bande. Au dernier rang, l'écart proportionnel reprend.

## 6. Ce que ça touche, et ce qui reste à trancher

### Mesure d'équivalence (2026-09-27)

Gain de puissance d'un champion de référence (`combatPowerRaw`, contre le même champion sans
compétence) : signatures fixes d'aujourd'hui contre **build moyen de runes** simulé au rythme
mesuré (§ 5), joueur qui ne remplace qu'une compétence d'un cran plus bas.

| Rang | Signatures fixes | Runes |
|---|---|---|
| Bronze | ×1,04 | ×1,01 |
| Argent | ×1,07 | ×1,02 |
| Or | ×1,17 | ×1,05 |
| Or noir | ×1,17 | ×1,08 |
| Légendaire | ×1,17 | ×1,11 |
| Demi-dieu | ×1,19 | ×1,14 |
| Divin | ×1,21 | ×1,16 |
| Divin céleste → Tout-puissant | ×1,15 | ×1,18 à ×1,20 |

La fin est équivalente, le milieu plus faible (−10 % vers Or) : les premières runes sont
surtout vertes, utilitaires. Un réglage uniforme ne corrige pas une différence de FORME.
**Décision proposée** : barème inchangé, et les champions de référence portent le build moyen
de leur rang — routes, camps et failles se dimensionnent sur eux, donc suivent d'eux-mêmes.


- **Calibration des combats** : routes, camps, failles et sièges se mesurent contre des
  champions de référence (`REF_CHAMPIONS_BY_RANK`) aux compétences fixes. Il faut leur définir
  un **build moyen** (combien d'emplacements remplis, à quels niveaux, selon le rang) et
  re-mesurer toutes les bandes.
- **Composition des équipes** : les rôles n'étant plus garantis par le roster, un vivier peut
  manquer d'éclaireur ou de soigneur. Accepté (les runes 🟢 sont les plus fréquentes).
  `suggestEscort` (couverture de rôles) est à adapter.
- **Champions déjà possédés** : leurs signatures et rôles disparaissent, **compensés en runes**
  (décision de l'utilisateur) — autant de runes que d'ascensions et de crans d'Éveil déjà
  passés, de la couleur que ces événements auraient donnée.
- **Mentor** : livré en v0.1223 comme rôle fixe (Anselme, Vesper), il devient une compétence
  🔵 ; le champion de référence garde son rôle d'origine jusqu'à la refonte.
- **Persistance** : `Adventurer` gagne ses compétences (JSONB `characters.adventurers`, aucune
  migration de colonne) ; les runes du joueur vont dans une colonne additive (4 compteurs).
- **Écrans** : réserve de runes (plateau de ressources), feuille « utiliser une rune » sur la
  fiche d'un champion, révélation du tirage, choix du remplacement.

## 7. Étapes proposées — ✅ toutes livrées en v0.1242

Stockage : `characters.runes` (migr. 0094 : stock par couleur, décision en attente,
version de compensation) ; les compétences posées vivent sur chaque champion
(`adventurers[].skills`). Une rune de lieu est tirée au DÉPART (lieu réussi, au moins un
champion, maturité de faille à l'ARRIVÉE) et créditée à l'ENCAISSEMENT. Compensation une fois,
au stock, condition dans la requête. Écran : fiche du champion (`SkillRunesPanel`) et puce 🪬
au plateau de ressources.

1. Lib pure : catalogue, barème, cumul, emplacements, tirage, règle de remplacement (+ tests
   et mutations).
2. Sources : ascension, Éveil, archives, failles (dont la faille +1 rang), boss entre amis,
   Défi 360.
3. Calibration : build moyen des champions de référence, re-mesure routes / camps / failles /
   sièges / mana.
4. Migration des champions possédés.
5. Écrans.
