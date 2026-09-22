# Étude — refonte de l'équipement du héros : 7 emplacements, stats par objet, sets, relique à pouvoir

_2026-09-22 · étude complète, rien d'implémenté. Remplace les deux études du même jour
([affixes par emplacement](2026-09-22-affixes-par-emplacement-design.md),
[boosts et relique](2026-09-22-boosts-par-equipement-et-relique.md)), qui restent comme
historique de la réflexion._

**Ce qui est demandé** : passer à arme · armure · bouclier · casque · bottes · anneau ·
relique ; chaque objet donne des stats **liées à ce qu'il fait** ; revoir les sets ; la
relique devient une attaque spéciale qui se charge ; **repartir de zéro pour l'équilibrage
si besoin** ; **pas de demi-chantier** — tout est livré d'un coup, et bien.

---

## Décisions (2026-09-22) — l'étude est validée

- **Combat de base** : les chances passent à un rendement décroissant, l'élan se compte par
  tour (§ 3). ✅
- **Emplacements** : le tableau du § 4, avec **riposte** au lieu d'élan sur les bottes. ✅
- **Budget** : on garde la progression d'aujourd'hui (§ 5). ✅
- **Sets** : 6 pièces, bonus à 2 / 4 / 6. Les pièces offertes au passage sont **un rang en
  dessous**, pour qu'il reste quelque chose à farmer (§ 9). ✅
- **Effets uniques** : 8 signatures de set, **19** effets légendaires (dont 8 nouveaux),
  **chacun limité aux stats de son emplacement**, et **12** pouvoirs de relique (§ 6.3,
  § 7). ✅
- **Objets existants** : convertis (§ 9). ✅
- **Premier point de contrôle** : l'étape 1 (combat de base), à mesurer avant d'aller plus
  loin.

## 0. En une page

1. **Le problème n'est pas seulement le tirage.** La mesure (§ 1) montre qu'une arme porte
   des PV **parce que c'est la meilleure stat possible** : le critique, la réduction et
   l'esquive sont **déjà au plafond dès le niveau 20, par le sport seul**, et l'élan est
   au maximum dès le premier tour (37 coups par tour au niveau 90). Ranger les stats par
   emplacement sans corriger ça reproduirait des objets à stats mortes.
2. **Refonte en quatre couches, livrées ensemble** :
   - **les stats** : critique, esquive, réduction, blocage et parade passent à un
     **rendement décroissant** au lieu d'un plafond sec (chaque point compte toujours) ;
     l'élan se compte **par tour** ; 10 stats nouvelles ;
   - **les objets** : 7 emplacements, chacun avec sa liste de stats (§ 4) et un **poids**
     dans le budget de puissance ;
   - **les sets** : pièces sur les 6 emplacements hors relique, **bonus à 2 / 4 / 6
     pièces**, effet signature à 6 dans sa voie, et la **relique de la voie** porte le
     pouvoir de la voie ;
   - **la relique** : un pouvoir à jauge (14 pouvoirs, § 7).
3. **L'équilibrage repart d'un modèle unique** : une courbe explicite de ce que
   l'équipement doit apporter à chaque niveau (le **budget**). Toutes les valeurs d'objets
   en découlent, tout le contenu (donjons, boss, Labyrinthe) se cale dessus. Les **cinq
   tables correctives empilées** depuis la v0.848 sont supprimées.
4. **Personne ne perd rien au passage** : les objets possédés sont **convertis** (même
   rang, même jet, même niveau d'objet, stat traduite vers celle de son emplacement), et
   chaque emplacement neuf reçoit une pièce de départ.
5. **Volume : ~15 à 19 jours**, sur une seule branche, livrés en une fois (§ 12).

---

## 1. Ce que la mesure montre aujourd'hui

Sonde jetable (supprimée) sur les vraies fonctions : joueur de référence du projet
(`test/helpers/gearedFighter` — butin des 13 derniers niveaux aux taux réels,
optimiseur du jeu, familiers et talent), 4 tirages par niveau.

| Niveau | Nu     | Avec objets | Avec tout | Perte si on retire UN emplacement | Familier |
| ------ | ------ | ----------- | --------- | --------------------------------- | -------- |
| 10     | 117    | ×1,21       | ×1,37     | ~4 %                              | 2,8 %    |
| 30     | 1 976  | ×1,72       | ×1,93     | 8 à 11 %                          | 4,7 %    |
| 50     | 7 985  | ×2,32       | ×2,73     | 13 à 15 %                         | 7,4 %    |
| 70     | 20 816 | ×4,24       | ×5,03     | ~22 %                             | 6,8 %    |
| 90     | 43 096 | ×5,30       | ×6,78     | ~22,5 %                           | 12,3 %   |

**Cinq constats.**

1. **Les canaux plafonnés sont saturés par le sport seul.** Dès le niveau 20, le héros de
   référence est à **51 % de critique** (plafond 50-60 %), **46 % de réduction** (plafond
   50 %) et **40 % d'esquive — pile au plafond**. Donc une stat d'objet de critique, de
   réduction ou d'esquive **ne rapporte presque rien**. Ajouter « esquive » sur des bottes
   ou « blocage » à côté de la réduction, **sans refondre les plafonds**, créerait des
   objets morts.
2. **C'est pour ça que l'optimiseur met des PV sur l'arme.** Aux niveaux 50 et 90, **4
   armes sur 4** du build retenu portent des PV. Ce n'est pas un hasard de tirage : les PV
   (jusqu'à +259 % au niveau 90) et les dégâts ne sont pas plafonnés, ce sont les seules
   stats qui montent encore.
3. **L'élan est sur les 4 emplacements dès le niveau 50.** Le héros frappe **5 fois par
   tour au niveau 30, 12 au niveau 50, 37 au niveau 90** : l'élan (plafonné à 6 coups)
   est au maximum avant la fin du premier tour. Ce n'est plus un bonus conditionnel, c'est
   des dégâts sous un autre nom. **Tout ce qui se compte « par coup porté » a ce défaut.**
4. **L'équipement pèse de plus en plus**, ce qui est voulu, mais **sa courbe n'est écrite
   nulle part** : `gearExpect` suppose ×4,2 en attaque au niveau 90, les objets rendent
   ×5,3. L'écart a été rattrapé par couches successives : `ITEM_RANK_RELIEF`,
   `RANK_OPENING_RELIEF`, `PROC_DUNGEON_BOOST`, `LABY_CONTENT_BOOST`,
   `bossContentBoost`. Chacune est juste, mais l'ensemble n'est plus lisible et chaque
   réglage futur doit repasser par les cinq.
5. **Les stats sont tirées sans regarder l'emplacement** (étude précédente) : la table par
   emplacement `SLOT_EFFECTS` n'est plus lue que par du code mort.

**Conséquence** : une refonte qui ne fait que ranger les stats par emplacement laisserait
les points 1 à 4 en place. C'est pourquoi l'étude touche aussi aux stats elles-mêmes et au
modèle d'équilibrage.

---

## 2. Principes

1. **Un objet donne ce qu'il fait.** L'arme agit sur le coup porté, les protections sur les
   coups reçus, les bijoux sur des choses indirectes.
2. **Aucune stat morte.** Toute stat portée par un objet doit rapporter quelque chose, à
   tout niveau. Pas de plafond sec atteint par le sport seul.
3. **Une stat vit sur 2 emplacements au plus**, pour que chaque emplacement garde une
   identité.
4. **L'attaque et la survie ont le même budget.** La puissance vaut √(attaque × survie) :
   si les emplacements défensifs pèsent plus, l'équilibre se fait tout seul du mauvais
   côté.
5. **Une seule courbe décide de la difficulté** : le budget d'équipement (§ 5). Pas de
   table de rattrapage.
6. **Le sport reste le plafond** : les rangs et l'ouverture des rangs (v0.894-0.895) ne
   bougent pas ; le jet et le niveau d'objet non plus.
7. **On ne réécrit jamais un objet vers moins bien** (règle v0.731). La conversion garde
   rang, jet et niveau d'objet.

---

## 3. Refonte des stats (le socle)

### 3.1 Les chances passent à un rendement décroissant

Critique, esquive, réduction, blocage et parade deviennent des **notes** qui s'additionnent
(sport + objets + talents + familier), converties en pourcentage par une courbe qui
**approche le plafond sans jamais l'atteindre** :

> chance = plafond × note / (note + K(niveau))

- Chaque point de note rapporte **toujours** quelque chose, juste un peu moins que le
  précédent. Plus de mur à 40 ou 50 %.
- `K` grandit avec le niveau, pour qu'un même build garde le même pourcentage en montant :
  c'est ce qui empêche qu'un joueur de haut niveau soit au plafond sans rien porter.
- Le **sport** donne toujours une part de la note (agilité → critique et esquive, puissance
  → réduction) : les trois piliers du combat (v0.845) sont conservés, simplement ils ne
  remplissent plus le compteur à eux seuls.
- Plafonds proposés (les valeurs se mesurent, cf. § 10) : critique 75 %, esquive 50 %,
  réduction 65 %, blocage 60 %, parade 25 %.

⚠️ **Ce point touche le combat de base**, pas seulement l'équipement : il faut re-vérifier
que le build équilibré reste le meilleur (`combat.test`) et recalibrer les monstres
(§ 10). C'est la partie la plus risquée, et c'est aussi celle qui rend tout le reste
possible.

### 3.2 Ce qui se comptait « par coup » se compte « par tour »

À 37 coups par tour, tout ce qui compte les coups est rempli instantanément.

- **Élan** : +X % par **tour** de combat, jusqu'à 6 tours.
- **Saignement** (nouveau) : cumul par tour.
- **Vol de vie** : garde sa limite de soin par tour (déjà en place).
- **Jauge de la relique** : se remplit par tour ou par événement rare (blocage, critique
  reçu…), jamais par coup porté.

### 3.3 Le catalogue : 21 stats

| Stat                                    | Ce qu'elle fait                               | Type               | État                                 |
| --------------------------------------- | --------------------------------------------- | ------------------ | ------------------------------------ |
| Dégâts                                  | + % sur chaque coup                           | attaque            | existe                               |
| **Dégâts critiques**                    | un critique fait plus que ×2                  | attaque            | nouvelle                             |
| **Précision**                           | réduit l'esquive de l'ennemi                  | attaque            | nouvelle                             |
| Élan                                    | + dégâts par tour de combat, jusqu'à 6        | attaque            | redéfinie (§ 3.2)                    |
| Exécution                               | + dégâts sur un ennemi sous 25 %              | attaque            | existe                               |
| **Saignement**                          | les coups laissent des dégâts sur la durée    | attaque            | nouvelle                             |
| Vol de vie                              | soin sur les dégâts infligés                  | attaque / survie   | existe                               |
| Chance de critique                      | note de critique                              | attaque (indirect) | redéfinie (§ 3.1)                    |
| Rage                                    | + dégâts sous 30 % de PV                      | attaque (indirect) | existe                               |
| PV                                      | + % de PV max                                 | survie             | existe                               |
| Réduction                               | note de réduction                             | survie             | redéfinie (§ 3.1)                    |
| **Blocage**                             | note : un coup reçu ne fait que 25 %          | survie             | nouvelle                             |
| **Parade**                              | note : coup évité, l'ennemi saute un tour     | survie             | nouvelle                             |
| **Riposte**                             | après un coup reçu, chance de contre-attaquer | survie / attaque   | nouvelle                             |
| Épines                                  | renvoie une part des dégâts reçus             | survie / attaque   | existe                               |
| **Résistance aux critiques**            | les critiques ennemis font moins mal          | survie             | nouvelle                             |
| **Bouclier de départ**                  | barrière de X % des PV au début du combat     | survie             | nouvelle                             |
| Régénération                            | PV récupérés entre deux combats               | survie (indirect)  | existe                               |
| Esquive                                 | note d'esquive                                | survie (indirect)  | existe (talents), nouvelle sur objet |
| Initiative                              | commencer le combat en premier                | indirect           | existe                               |
| Or · Découverte d'objets · **Dressage** | économie, butin, XP du familier               | confort            | dressage nouvelle                    |

**Retirées du projet d'objets** : vitesse d'attaque (le sport en donne déjà jusqu'à 37 par
tour, en ajouter exploserait), pénétration (presque aucun monstre n'a de réduction), XP,
énergie, pierres d'invocation, clés (le sport fixe la progression).

---

## 4. Les 7 emplacements

| Emplacement     | Rôle                 | Stats principales (#1)    | Stats de soutien (#2, #3)                                   |
| --------------- | -------------------- | ------------------------- | ----------------------------------------------------------- |
| ⚔️ **Arme**     | le coup porté        | dégâts · dégâts critiques | précision · élan · exécution · saignement · vol de vie      |
| 🥋 **Armure**   | encaisser            | PV · réduction            | épines · régénération · bouclier de départ                  |
| 🛡️ **Bouclier** | arrêter le coup      | blocage · parade          | riposte · épines · résistance aux critiques                 |
| ⛑️ **Casque**   | protéger, voir venir | PV · précision            | initiative · résistance aux critiques · découverte d'objets |
| 🥾 **Bottes**   | le jeu de jambes     | esquive · initiative      | riposte · régénération                                      |
| 💍 **Anneau**   | les bonus indirects  | chance de critique · rage | vol de vie · or · découverte d'objets · dressage            |
| 🔮 **Relique**  | l'attaque spéciale   | **un pouvoir** (§ 7)      | —                                                           |

- **Chaque stat vit sur 1 ou 2 emplacements**, jamais plus.
- Le nombre d'affixes par rareté ne change pas (1 en Commun/Inhabituel, 2 en
  Magique/Rare, 3 à partir d'Épique) ; l'affixe #1 est tiré dans les stats principales de
  l'emplacement, les #2 et #3 dans ses stats de soutien, sans doublon.
- **Noms** : l'accessoire devient l'anneau (Anneau, Chevalière, Bague, Sceau) ; bouclier
  (Écu, Pavois, Rondache, Targe) ; casque (Heaume, Casque, Bassinet, Morion) ; bottes
  (Bottes, Grèves, Solerets, Jambières). Les icônes suivent le nom (`NOUN_ICON`).

### Le poids de chaque emplacement

Le budget total de l'équipement (§ 5) est réparti par emplacement, de façon à ce que
**l'attaque et la survie reçoivent autant l'une que l'autre** :

| Emplacement | Poids | Côté                         |
| ----------- | ----- | ---------------------------- |
| Arme        | 1,5   | attaque                      |
| Anneau      | 1     | attaque (indirect)           |
| Armure      | 1     | survie                       |
| Bouclier    | 0,75  | survie                       |
| Casque      | 0,75  | survie / attaque (précision) |
| Bottes      | 0,5   | survie / tempo               |
| Relique     | 1     | selon le pouvoir             |

La valeur d'une stat devient : **base × rang et jet × niveau d'objet × poids de
l'emplacement**. Les poids sont un point de départ : ils se règlent à la mesure (§ 10),
jusqu'à ce que retirer n'importe quel emplacement coûte une part de puissance
proportionnelle à son poids.

---

## 5. Le budget : repartir d'une seule courbe

Aujourd'hui, l'équipement rend une certaine puissance, le contenu en suppose une autre, et
cinq tables rattrapent l'écart. Proposition :

1. **On écrit la courbe** : `gearBudget(L)` = ce que l'équipement complet d'un joueur
   réaliste doit apporter au niveau L, en attaque et en survie. Point de départ : la courbe
   mesurée aujourd'hui (×1,2 au niveau 10 → ×5,3 au niveau 90 pour les objets, § 1), pour
   ne pas changer la sensation de progression. Tu peux aussi la choisir plus douce.
2. **Les objets sont calibrés pour la tenir** : le joueur de référence (même modèle
   qu'aujourd'hui, étendu aux 7 emplacements) doit atteindre `gearBudget(L)` à chaque
   niveau. C'est le réglage des bases de stats et des poids d'emplacement.
3. **Le contenu est calibré sur la même courbe** : `gearExpect` **est** `gearBudget` (et
   `bossGearExpect` en dérive), plus un coefficient de difficulté par type de contenu
   (donjon, boss, Labyrinthe, arène).
4. **Suppression** de `ITEM_RANK_RELIEF`, `RANK_OPENING_RELIEF`, `PROC_DUNGEON_BOOST`,
   `LABY_CONTENT_BOOST` et `bossContentBoost`. S'il reste un écart mesuré, il se corrige
   dans la courbe ou dans le coefficient du contenu, jamais dans une table de plus.

⚠️ `RANK_OPENING_RELIEF` compense l'ouverture progressive des rangs (v0.894) : ce
phénomène ne disparaît pas. Il doit être **intégré** au joueur de référence (qui accumule
déjà son butin niveau par niveau), pas corrigé après coup. C'est le point à surveiller.

---

## 6. Les sets de voie

### 6.1 Nouveau format : 6 pièces, bonus à 2 / 4 / 6

- Chacun des **8 sets de voie** a une pièce pour chacun des **6 emplacements hors
  relique**.
- Bonus à **2, 4 et 6 pièces** (au lieu de 2, 3 et 4). L'**effet signature** (Carnage,
  Bastion, Coup de grâce…) se déclenche à **6 pièces**, toujours seulement dans la voie du
  set.
- **La relique de la voie** existe aussi : elle porte le pouvoir de cette voie (§ 7). Elle
  ne compte pas dans les 6 : un Gardien peut porter la relique du Gardien sans le set, ou
  le set avec une autre relique.

**Pourquoi 2 / 4 / 6 plutôt que « 4 pièces parmi 6 »** : ça crée la vraie décision de fin
de partie. Tu peux porter **6 pièces pour la signature**, ou **4 pièces pour le bonus
intermédiaire, et 2 emplacements pour des objets légendaires**. Les deux doivent se valoir
à peu près (§ 10), ce qui force le joueur à choisir un style.

### 6.2 Ce qui change dans les réglages des sets

- `SET_PIECE_MAJOR_K`, `SET_AFFINITY_K`, `tierScale` et les poids des signatures sont
  **recalibrés à zéro** sur le nouveau format, avec la même cible qu'aujourd'hui : un set
  complet dans sa voie vaut **+5 à +10 %** de plus que les meilleurs drops, et la voie du
  set est bien la meilleure pour lui.
- La stat principale d'une pièce de set suit la liste de son emplacement (§ 4), comme un
  drop. L'identité du set est toujours portée par ses bonus.
- Les boss continuent de donner des pièces de set au hasard, sur 6 emplacements au lieu
  de 4.
- « Mes sets » affiche la collection sur 6 ; le rangement automatique, les doublons et
  « Porter ce set » passent à 6 emplacements (`setFiling`, `ownedInLoadouts`).

### 6.3 Les effets légendaires : 19, chacun à sa place

**Règle nouvelle (décision du 2026-09-22) : un effet légendaire ne prolonge QUE des stats
de son emplacement.** Son « écho » (les stats qu'il prolonge, déjà un champ du code) doit
être inclus dans la liste de stats de l'emplacement (§ 4). Aujourd'hui les effets ont bien
un emplacement, mais l'accord avec la fonction de l'objet n'est pas garanti :

| Effet actuel                                      | Emplacement actuel | Ce qui ne va pas                                 |
| ------------------------------------------------- | ------------------ | ------------------------------------------------ |
| Vampirisme (les critiques soignent)               | accessoire         | le soin par le coup porté est une affaire d'arme |
| Endurance (−35 % de dégâts sous 50 % de PV)       | accessoire         | effet défensif sur un bijou                      |
| Soif (vol de PV sous 50 %)                        | armure             | du vol de vie sur une armure                     |
| Riposte affûtée (critiques après un coup reçu)    | armure             | parer et riposter, c'est le bouclier             |
| Égide (la 1re attaque perd 45 %)                  | armure             | arrêter le premier coup, c'est le bouclier       |
| Initiative (1er tour ×2, inesquivable)            | arme               | frapper avant l'autre, c'est la vitesse (bottes) |
| Œil du prédateur (critiques les 3 premiers tours) | accessoire         | le regard, c'est le casque                       |

**La répartition** : 11 effets gardés (dont 8 changent d'emplacement — les 7 ci-dessus plus
Rétorsion, qui passe de l'armure au bouclier pour lui laisser trois effets — et 2 sont
retravaillés) et 8 nouveaux, soit
**19**, 3 ou 4 par emplacement, jamais le même effet sur deux emplacements (c'est ce qui
garantit des effets différents sur un set complet).

| Emplacement     | Effets légendaires                                                                                                                                                                                                  | Stats qu'ils prolongent                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| ⚔️ **Arme**     | **Bourreau** (achève un ennemi sous 15 %) · **Charge** (+30 % les 3 premiers tours) · **Cadence** (+18 % à partir du 3ᵉ tour) · **Vampirisme** ↪ (tes critiques te soignent)                                        | exécution · dégâts · élan · vol de vie · dégâts critiques |
| 🥋 **Armure**   | **Endurance** ↪ (−35 % de dégâts sous 50 % de PV) · ✨ **Cuirasse vivante** (sous 30 % de PV, une barrière de 20 % des PV, une fois) · ✨ **Cicatrisation** (régénération doublée entre deux combats)               | réduction · PV · bouclier de départ · régénération        |
| 🛡️ **Bouclier** | **Égide** ↪ (la 1re attaque est bloquée d'office) · **Riposte affûtée** ↪ (tes ripostes sont des critiques) · **Rétorsion** ↪ (les 3 premiers coups reçus renvoient 7 % des PV max de l'ennemi)                     | blocage · riposte · épines                                |
| ⛑️ **Casque**   | **Œil du prédateur** ↪ (3 premiers tours : tes coups ne peuvent pas être esquivés) · ✨ **Vigilance** (le 1er critique reçu est annulé) · ✨ **Sang-froid** (sous 30 % de PV, les critiques ennemis n'en sont plus) | précision · résistance aux critiques · PV                 |
| 🥾 **Bottes**   | **Initiative** ↪ (1er tour : coups ×2, inesquivables) · ✨ **Pas de côté** (la 1re attaque est esquivée) · ✨ **Pas de danse** (chaque esquive déclenche une riposte)                                               | initiative · esquive · riposte                            |
| 💍 **Anneau**   | **Soif** ↪ retravaillée (sous 50 % de PV, ton vol de vie est triplé) · ✨ **Sceau de rage** (la rage s'active dès 50 % de PV) · ✨ **Chasseur** (critique certain sur un ennemi sous 25 %)                          | vol de vie · rage · chance de critique                    |

↪ = effet existant déplacé ou retravaillé · ✨ = nouveau. Œil du prédateur passe de
« critiques garantis » à « inesquivable », pour prolonger la précision (stat du casque) au
lieu du critique (stat de l'anneau).

**Un test garantira la règle** : pour chaque effet, chaque stat de son écho appartient à la
liste de son emplacement. Ajouter un effet mal placé ne passera plus.

**Effet sur les sets** : une pièce de set tire un effet cohérent avec le thème de son set
**et** avec son emplacement. Quand aucun effet de l'emplacement ne prolonge le thème (une
arme du Gardien, dont le thème est réduction, PV, épines), elle tire dans les effets de son
emplacement : c'est déjà le comportement de repli aujourd'hui, il sera simplement plus
fréquent. À mesurer : la part de pièces de set avec un effet dans le thème (34 % avant la
v0.701, cible > 60 %).

**✅ Livré à l'étape 5 (2026-09-22) — ce que la mesure a dit.**

- **Couverture du thème : 22 cases sur 48 (46 %)**, pas les 60 % visés. C'est STRUCTUREL :
  un thème de 3 stats, face à 6 listes d'emplacement disjointes, couvre au mieux ~3
  emplacements sur 6. Le bouclier et les bottes n'ont presque jamais d'effet dans le thème
  (leurs stats — blocage, parade, riposte, esquive — n'apparaissent dans aucun thème de
  set). Pour dépasser 60 %, il faudrait réécrire les thèmes des sets avec les nouvelles
  stats : une décision à part, non prise ici.
- **Un set est désormais compté sur ses 6 emplacements hors relique** (compteur, bonus,
  signature, collection, « Mes sets »). Une ancienne pièce de set de RELIQUE ne compte plus :
  l'étape 8 la convertira.
- **Le capstone est le DERNIER palier du set**, plus « 4 pièces » : les sets d'avant (2/3/4)
  gardent leur règle sans cas particulier.
- **L'optimiseur a dû suivre** : l'échange de deux pièces d'un même set ne suffisait plus
  (117/120 sur la recherche exhaustive à 4 emplacements, pire cas −1,1 %). Les builds ratés
  quittaient un set pour deux drops, ou échangeaient deux pièces de sets DIFFÉRENTS. Un
  échange de deux pièces quelconques, lancé seulement quand plus aucun échange simple ne
  paie, rétablit 120/120 — 79 ms sur un sac de 800 objets.
- **Phénix, Second souffle et Curée ne sont plus tirés** (la relique n'a plus d'effet
  légendaire) mais restent lus par le combat et l'écran pour les reliques pas encore
  converties.
- **Égide** passe de −45 % à −75 % (« bloquée d'office » = un blocage) ; la **Soif**
  d'avant (drain au passage sous 50 %) est remplacée par le vol de vie triplé.
- **Mutations : 18, 18 rouges** après correction (un test de Chasseur trop large ; un
  échange groupé par set, mesuré redondant, retiré).
- **Fait à l'étape 7** (cf. § 10) : poids et réglages des effets, et sets à 6 pièces.
- ~~Reste à l'étape 7~~ : les poids de puissance des 8 nouveaux effets (0,16 de départ), et
  le réglage des sets à 6 pièces (`tierScale`, `SET_PIECE_MAJOR_K`, affinité, poids des
  signatures) contre la cible +5 à +10 % — il dépend de la courbe de budget.

**Les 19 sont re-mesurés** : même cible qu'en v0.837, environ +8 % de puissance chacun, y
compris les effets déplacés (leur valeur change avec leur nouveau contexte).

---

## 7. La relique : une attaque spéciale qui se charge

- Une jauge se remplit selon **une action propre à chaque pouvoir** (bloquer, faire un
  critique, être touché…). Pleine, le pouvoir se déclenche tout seul et la jauge repart
  à zéro.
- **La jauge est conservée d'un combat à l'autre** dans un donjon, comme les PV.
- **Rareté, jet et niveau d'objet** règlent la force du pouvoir ; à partir de Légendaire,
  la jauge se remplit aussi plus vite.
- **Limites** : un effet en % des PV max de l'ennemi est plafonné (sinon il écrase les
  boss) ; un soin passe par la limite de soin par tour ; un étourdissement ne peut pas
  s'enchaîner.

**Les 12 pouvoirs** (décision du 2026-09-22) : les 8 de voie — Brasier (Berserker),
Rempart vengeur (Gardien), Coup fatal (Assassin), Festin (Vampire), Carapace (Colosse),
Riposte parfaite (Duelliste), Éclat de ronces (Épineux), Tempête (Frénétique) — et 4 autres :
Ouverture, Moisson, Phénix, Second souffle. Contre-temps et Source sont écartés : ils
recoupaient Riposte parfaite et le soin des autres pouvoirs. Le détail de chacun (ce qui
charge la jauge, ce qu'il fait) est dans l'[étude précédente, Partie 3](2026-09-22-boosts-par-equipement-et-relique.md).

Une relique trouvée hors set tire un pouvoir parmi les 12. La relique d'une voie a
toujours le pouvoir de sa voie. Chaque pouvoir est mesuré **avec** un build qui a la stat
qui le charge et **sans** : un pouvoir lié à une stat ne doit pas devenir une pièce morte
dans un build ordinaire.

---

### Remplacer sa relique par une meilleure du même pouvoir (demande du 2026-09-22)

Une fois un pouvoir choisi, il faut pouvoir **trouver une relique plus forte avec ce même
pouvoir**. Sinon on reste bloqué sur sa première relique, ou on doit changer de pouvoir
pour progresser. Trois conditions :

1. **La force du pouvoir suit le rang, les étoiles et le niveau d'objet**, avec la même
   formule que les stats. Deux reliques avec le même pouvoir se comparent donc comme deux
   armes : celle de rang, d'étoiles ou de niveau supérieur est **strictement meilleure**.
   L'équipement conseillé, la comparaison du sac et le verdict « ↑ » la montrent sans cas
   particulier. **Test** : même pouvoir, rang (ou jet, ou niveau d'objet) plus haut ⇒
   puissance plus haute, pour les 12 pouvoirs.
2. **Il doit en tomber assez souvent.** Mesuré aujourd'hui, un niveau finance 79 (niv. 10)
   à 650 (niv. 90) objets. Avec 7 emplacements, ça fait ~11 à ~93 reliques par niveau. Mais
   avec 12 pouvoirs tirés au hasard, seules ~1 à 8 ont **ton** pouvoir, et au début d'un
   rang presque aucune n'est à ton rang (v0.895) : l'amélioration serait trop rare.
3. **D'où une affinité** : une relique trouvée a **1 chance sur 3 de porter le pouvoir de
   la relique que tu portes**. Sinon, elle tire parmi les 12, ce qui laisse de quoi
   découvrir un autre pouvoir. C'est le même principe que le ciblage de l'Autel pour les
   pièces de set.
4. **Les pouvoirs de voie ont en plus une source sûre** : la relique d'un set de voie porte
   toujours son pouvoir et tombe des boss, comme les autres pièces de set (≈ 1,8 à 15
   pièces par set et par niveau, dont une sur 7 est la relique).

À mesurer au point 11 du § 10 : nombre de niveaux pour passer ta relique au rang
supérieur, avec le même pouvoir. Cible : le même rythme que les autres emplacements.

### ✅ Livré à l'étape 4 (2026-09-22)

- **Moteur** (`simulateCombat`, `RELIC`) : jauge de 0 à 100, reportée d'un combat à l'autre
  dans un donjon et dans le Labyrinthe (simulé ET joué), et inscrite sur chaque événement du
  journal (`CombatEvent.gauge`) pour l'animation. Aucun pouvoir ne consomme de tirage : sans
  relique, un combat seedé est inchangé (empreintes d'avant toujours vertes).
- **Ce qui charge chaque jauge** : Brasier (chaque tour sous le seuil de rage), Rempart
  vengeur (chaque blocage, stock des dégâts évités), Coup fatal (chaque critique), Festin (le
  soin perdu au plafond du tour), Tempête (chaque tour élan au maximum), Riposte parfaite
  (parade ou riposte), Éclat de ronces (chaque coup d'épines, stock des dégâts renvoyés),
  Carapace (les dégâts encaissés), Ouverture (pleine au début de chaque combat, puis 5 par
  tour), Moisson (50 par monstre abattu). Phénix et Second souffle : sans jauge.
- **Force** = racine de (rang × jet × niveau d'objet) : un pouvoir agit en pourcentages
  entiers, une force linéaire aurait rendu une relique primordiale écrasante. Strictement
  croissante sur chaque axe (test pour les 12 pouvoirs). Légendaire+ : jauge ×1,25.
- **Plafond des stocks** (Rempart, Ronces, Festin) : 20 % des PV max de l'ennemi × force.
- **Tirage** : une relique trouvée porte un pouvoir, aucune stat, aucun effet légendaire ;
  affinité 1/3 pour le pouvoir de la relique portée, branchée sur les 6 drops JOUÉS
  (donjons, boss, Portail sans fin, Labyrinthe). ⚠️ Pas sur les drops d'expédition idle ni
  de siège (libs sans accès à l'équipement porté) : à brancher à l'étape 8 si besoin.
- **Relique de voie** : un boss tire les 6 emplacements du set ET la relique (1 chance sur
  7). Elle ne compte pas dans le set et porte toujours le pouvoir de sa voie.
- **Optimiseur** : le tri par dominance compare les reliques à pouvoir ÉGAL et sur leur
  force (sans ça, toutes les reliques paraissaient identiques : 15/40 au test d'optimalité).
- **Fait à l'étape 7** (cf. § 10) : poids et réglages des pouvoirs, rythme de remplacement.
- ~~Reste à l'étape 7~~ : poids des 12 pouvoirs dans la puissance (0,16 × force pour
  l'instant) et leurs réglages, mesurés avec ET sans la stat qui les charge ; rythme de
  remplacement d'une relique au même pouvoir (point 11 du § 10).
- **Reste à l'étape 8** : les reliques déjà possédées gardent leurs stats tant qu'elles ne
  sont pas converties. **Étape 9** : la jauge à l'écran (le journal la porte déjà).
- Mutations : 21, 21 rouges (après avoir renforcé 3 tests : Coup fatal inesquivable,
  retombée de la Tempête, Phénix qui suit la force).

## 7 bis. Le trophée (boss entre amis) — à revoir aussi (demande du 2026-09-22)

Le trophée est une 8ᵉ pièce portée, à part : il ne tombe pas en donjon, son rang est celui
du joueur, sa stat principale vient de la **famille d'exercice** du boss (`TROPHY_MAINS`),
et ses affixes #2 et #3 sont tirés **dans les listes communes**, comme un drop
d'aujourd'hui. Sa valeur vaut 40 % d'une pièce (`TROPHY_K`). Trois choses changent avec
la refonte :

1. **Ses stats principales actuelles tombent sur les défauts mesurés au § 1** : l'élan
   (conditionnement) devient une stat par tour propre à l'arme, et le critique et la
   réduction (tirage, gainage) étaient les stats mortes. Déjà en v0.880, le tirage et le
   gainage étaient les trophées les plus faibles.
2. **Ses affixes #2 et #3 sont tirés dans les listes communes**, qui n'existent plus : ils
   doivent venir de la liste **de sa famille**.
3. **Sa valeur (`TROPHY_K`)** se recalcule avec le budget (§ 5) : il reste un bonus modeste
   (+2 à +5 % de puissance, la cible de la v0.866), pas une 8ᵉ pièce entière.

**Le trophée prend les stats de ce que l'exercice travaille :**

| Famille d'exercice                   | Stats principales         | Stats de soutien                              |
| ------------------------------------ | ------------------------- | --------------------------------------------- |
| 💪 Poussée (pompes, dips…)           | dégâts · dégâts critiques | exécution · épines                            |
| 🦵 Jambes (squats, fentes…)          | PV · esquive              | régénération · initiative                     |
| 🧗 Tirage (tractions, rowing…)       | précision · vol de vie    | chance de critique · riposte                  |
| 🧱 Gainage (planche…)                | réduction · blocage       | bouclier de départ · résistance aux critiques |
| 🔥 Conditionnement (burpees, corde…) | initiative · rage         | élan · régénération                           |

Même règle que pour les objets : un trophée ne porte que des stats de sa famille. La
famille décide du rôle (le gainage protège, la poussée frappe), le cran du boss et le
« tué tôt » décident des étoiles et du niveau d'objet, comme aujourd'hui.

**Trophées existants** : convertis comme les objets (§ 9) — même rang, même jet, même
niveau d'objet, stats traduites vers la liste de leur famille.

## 8. L'optimiseur (équipement conseillé)

`bestGearLoadout` essaie toutes les combinaisons, avec **une boucle imbriquée par
emplacement**. Il prend déjà ~3 s sur 4 emplacements. Avec 7, le nombre de combinaisons
est multiplié par plusieurs milliers : **il faut un autre algorithme**.

- **Amélioration emplacement par emplacement** (déjà la passe finale depuis la v0.741),
  lancée depuis **plusieurs équipements de départ** : l'actuel, le meilleur objet de chaque
  emplacement pris seul, et pour chaque set possédé « le set le plus complet + le
  meilleur ailleurs ».
- Des **échanges par paires** en plus des échanges simples, pour trouver les bonus de set
  que l'on ne gagne qu'en changeant deux pièces à la fois.
- On garde : ne jamais proposer moins bien que l'actuel, les pièces imposées par « Porter
  ce set », l'élimination préalable des objets moins bons sur tous les points, et le
  calcul qui rend la main entre deux voies (sinon l'écran se fige).
- **Mesure demandée** : comparer au calcul exhaustif actuel sur 4 emplacements (même
  résultat attendu dans ≥ 98 % des cas) et temps < 2 s sur 7 emplacements avec un sac de
  ~800 objets.

---

## 9. Passage à la nouvelle version (migration)

**Aucune migration SQL** : tout vit dans les JSON `equipped` / `inventory` / `loadouts`,
convertis **au chargement**, de façon idempotente (même politique que les changements
précédents).

1. **Identifiants** : `weapon`, `armor`, `accessory` (qui devient l'anneau à l'écran) et
   `relic` sont conservés ; on ajoute `shield`, `helmet` et `boots`.
2. **Conversion des objets** : chaque affixe qui n'appartient plus à la liste de son
   emplacement est **traduit** vers une stat de cet emplacement, **au même rang, même jet,
   même niveau d'objet**. Exemples : PV sur une arme → dégâts ; critique sur une armure →
   réduction. Table de traduction écrite et testée. Le joueur garde la valeur de son
   objet, sous une forme qui a du sens. Les valeurs sont ensuite recalculées avec le
   nouveau barème.
3. **Reliques** : chaque relique reçoit un pouvoir à sa rareté ; une relique de set reçoit
   celui de sa voie.
   3 bis. **Effets légendaires déplacés** : un objet dont l'effet n'appartient plus à son
   emplacement (un accessoire avec Vampirisme, une armure avec Égide…) reçoit un effet de
   la liste de son emplacement, **choisi dans les mêmes stats prolongées si possible**, sinon
   au hasard. Le tirage utilise l'identifiant de l'objet, donc il donne toujours le même
   résultat. L'objet garde son rang, son jet et son niveau.
4. **Pièces de set** : elles gardent leur emplacement. ⚠️ **Un set complet d'aujourd'hui
   n'a que 3 pièces sur les 6 du nouveau format** : son arme, son armure et son accessoire
   (qui devient l'anneau). Sa relique devient la relique de la voie (§ 7). Il lui manque
   donc le bouclier, le casque et les bottes, et il perdrait son effet signature. On
   **offre ces 3 pièces** pour chaque set possédé en entier, **un rang en dessous** du rang
   moyen de ses pièces, avec un jet moyen (décision du 2026-09-22). Le set garde sa
   signature dès la mise à jour, mais ses bonus, calculés sur le rang moyen des pièces,
   baissent un peu : les remplacer par des pièces farmées à son rang est un vrai gain. Un
   set déjà au rang le plus bas reçoit des pièces à son rang, avec un jet faible.
5. **Emplacements neufs vides** : une **pièce de départ** par emplacement encore vide après
   le point 4, **un rang en dessous** du rang du joueur, avec un jet moyen. Même raison :
   on ne repart pas les mains vides, mais le premier drop à son rang est une amélioration.
6. **Marqueur de version** sur la ligne du personnage (champ JSON), pour ne convertir
   qu'une fois et pouvoir le vérifier.

Vérification sur les 4 comptes réels avant livraison : puissance avant / après
conversion, qui ne doit baisser pour personne.

### ✅ Livré à l'étape 8 (2026-09-22)

- **Conversion au chargement** (`migrateGearItem`, dans `normalizeRow`, après les anciennes
  migrations) : affixes traduits (`AFFIX_TRANSLATION`, 3 emplacements × 13 stats d'avant),
  stat principale d'emplacement en tête, aucun doublon, **même nombre d'affixes** ; valeurs
  recalculées au nouveau barème (`affixValue`, désormais la formule unique de `rollDrop` et
  `rollSetPiece` — ordre des multiplications conservé, drops seedés inchangés) ; relique →
  pouvoir (celui de sa voie pour une relique de set, Phénix/Second souffle hérités d'un effet
  légendaire, sinon tiré sur l'id), sans stat ni `setId` ; effet légendaire déplacé → un
  effet de son emplacement, dans les stats prolongées si possible. **Idempotente** (test sur
  400 drops et pièces de set neufs) : elle tourne à chaque chargement, donc un objet d'avant
  crédité plus tard (boîte 📬, récompense en attente) est converti aussi.
- **Cadeaux** (`gearRefonteGifts`, une seule fois, gardés par `characters.gear_version`,
  migr. 0088, écrits dans la même requête que l'équipement) : bouclier, casque et bottes de
  chaque set possédé en entier (arme, armure, anneau), un rang sous le rang moyen, jet 0,5
  (0,2 au rang le plus bas), équipés si le set est porté, sinon au sac (rangés dans « Mes
  sets ») ; puis une pièce de départ par emplacement neuf vide, un rang sous le rang du
  joueur. Appelés par l'Aventure une fois `progress.ready`. Un personnage neuf naît à la
  version courante (pas de cadeau).
- **Vérifié sur les comptes réels** — réussite au donjon de leur niveau, **ancien code contre
  nouveau**, mêmes stats (niveau estimé par l'ilvl porté) :

  | Compte | Niveau | Avant | Après | Puissance / référence avant → après |
  | ------ | ------ | ----- | ----- | ----------------------------------- |
  | Last   | 30     | 98 %  | 78 %  | 1,39 → 0,95                         |
  | Cypher | 19     | 100 % | 94 %  | 1,46 → 1,28                         |
  | Knat   | 5      | 81 %  | 56 %  | 0,91 → 0,91                         |
  | Mimi   | 6      | 100 % | 100 % | 0,89 → 0,89                         |

  ⚠️ **La condition « ne baisse pour personne » n'est PAS tenue, et la conversion n'en est pas
  la cause.** Last portait de l'élan sur ses 4 objets : sans lui, dans l'ANCIEN code, il
  tombe déjà de 5 403 à 3 866 de puissance (référence 3 895) et de 98 % à 34 % — son avance
  venait tout entière de l'élan compté par coup, corrigé à l'étape 1. Converti, il fait
  mieux (78 %). Knat garde exactement sa puissance relative : sa baisse vient du recalage du
  début de chaîne (étape 7). Cadeaux à son rang au lieu d'un rang dessous : Last 87 %, Cypher
  97 % — mesuré, non retenu (décision du 2026-09-22).

- Mutations : 14, 14 rouges (dont une qui a d'abord survécu : sans dédoublonnage, un objet
  dont deux stats se traduisent vers la même perdait un affixe en silence).

---

## 10. Recalibration : ce qu'on mesure, dans l'ordre

Chaque ligne est une propriété déjà tenue par le projet, à retrouver sur le nouveau
modèle.

| #   | Ce qu'on mesure                                                         | Cible                                                                                                  |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Build équilibré meilleur que les extrêmes (nouvelles courbes de chance) | comme `combat.test` aujourd'hui                                                                        |
| 2   | Joueur de référence sur 7 emplacements                                  | tient `gearBudget(L)` à ±5 %                                                                           |
| 3   | Part de chaque emplacement                                              | proportionnelle à son poids ; aucune stat morte                                                        |
| 4   | Donjons                                                                 | ~70 % de réussite au niveau conseillé ; mur à +3 / +6 niveaux                                          |
| 5   | Boss de palier                                                          | 50 à 60 % au palier                                                                                    |
| 6   | Labyrinthe                                                              | ~70 % au niveau conseillé, ~90 % sur les paliers d'initiation                                          |
| 7   | Arène, sièges (le héros défend)                                         | tenue comme aujourd'hui                                                                                |
| 8   | Sets                                                                    | set complet de sa voie : +5 à +10 % contre les meilleurs drops ; « 4 + 2 légendaires » à ±3 % de « 6 » |
| 9   | Voies                                                                   | la voie du set est la meilleure pour lui (exceptions listées)                                          |
| 10  | Effets légendaires et pouvoirs de relique                               | ~+8 % chacun ; pouvoirs mesurés avec et sans leur stat                                                 |
| 11  | Ouverture des rangs                                                     | 4 emplacements… désormais 6, à son rang vers la moitié du rang ; ajuster le nombre de drops si besoin  |
| 12  | Puissance affichée                                                      | fidèle au vrai combat pour chaque stat nouvelle (poids dans `combatPower`)                             |
| 13  | Optimiseur                                                              | ≥ 98 % d'accord avec l'exhaustif sur 4 emplacements ; < 2 s sur 7                                      |
| 14  | Migration                                                               | aucune baisse de puissance sur les 4 comptes réels                                                     |

### ✅ Livré à l'étape 7 (2026-09-22)

- **Budget unique** (`gearBudget`) : un segment par rang, mesuré à chaque niveau sur le joueur
  de référence, plus la part que `offenseOf`/`survivalOf` ne voient pas (effets légendaires,
  relique) : ×1,05 à ×1,23 à partir du rang 31. `CONTENT_K` : donjon 1, boss 1,17,
  Labyrinthe 1,47. Retirés : `ITEM_RANK_RELIEF`, `RANK_OPENING_RELIEF`,
  `PROC_DUNGEON_BOOST`, `LABY_CONTENT_BOOST`, `bossContentBoost`. Fournaise ×0,85,
  Nécropole ×0,76. Failles re-bisectées (niveaux 10-11 et 51-60).
- **Sets (#8)** : set complet de sa voie **+5,8 à +12,3 %** en vrai combat contre les
  meilleurs drops ; « 4 + 2 » à −1,6/+3,2 points de « 6 ». `tierScale` (paliers 2 et 4) et
  `capScale` (palier 6) par voie. ⚠️ C'est bien moins que les +24 % de la v0.837 : les
  signatures sont ramenées à +2..+6 %.
- **Voies (#9)** : passifs à ~1 % ; la voie du set perd 2 fois sur 288.
- **Puissance affichée (#12)** : le vol de vie compte pour son vrai soin par tour, plafonné.
- **Optimiseur (#13)** : 118/120 contre l'exhaustif (paires de pièces dans la passe finale).
- **Effets légendaires et pouvoirs (#10)**, mesurés en vrai combat aux niveaux 60 et 90
  (boss et donjon) : effets légendaires surtout entre **4 et 9 %** ; pouvoirs entre **5 et
  12 %**, puissance affichée 7 à 9 %. Retouchés parce qu'ils ne valaient presque rien :
  Charge (×2 sur 4 tours), Chasseur (sous 75 %), Sang-froid et Sceau de rage (sans seuil de
  PV), Vigilance (3 critiques), Œil du prédateur (+30 % de dégâts), Riposte affûtée (×3),
  Cicatrisation (2 % des PV max par tour), Soif (plafond de soin ×1,4 au lieu du vol de vie
  triplé), Vampirisme (réserve propre de 2 % par tour) ; Brasier (seuil propre à 60 %),
  Rempart vengeur et Éclat de ronces (une volée ×1,5 au lieu du stock). ⚠️ Écarts connus :
  **Moisson vaut 0 contre un boss** (sa jauge se remplit en abattant, un boss est un seul
  combat) et **Initiative / Œil du prédateur** tombent à −1 / +0,4 % contre le boss du niveau 90
  (8 / 4,5 % en donjon).
- **Ouverture des rangs (#11)**, simulé : 6 emplacements à ton rang en médiane au **5e
  niveau** du rang avec les pièces de ton set de voie (7 avec les seuls drops ; un boss tire
  les pièces des 8 sets, donc en pratique plus vite encore). Aucun réglage du nombre de drops.
- **Relique au même pouvoir, à ton rang** : cumul ~2 à mi-rang pour le pouvoir de ta voie
  (plus vite que les autres emplacements, 1,4) ; **~0,6 à mi-rang et 1,8 sur le rang** pour un
  autre pouvoir, soit ~2,5 fois plus lent. Laissé tel quel : l'affinité 1/3 est le choix de
  conception.
- **Trophée** : `TROPHY_FAMILY_K` par famille ; tirage = précision + dégâts critiques,
  conditionnement = PV + initiative.
- Mutations : 8 (7a) + 9 (7b) + 9 (7c), toutes rouges.

**Hors périmètre, non touchés** : l'équipement des aventuriers, les caravanes, les
camps, les failles (ils ne lisent pas l'équipement du héros), et la défense de la base
(elle ne le lit qu'à travers le héros présent, re-mesurée au point 7).

---

## 11. L'écran

- **Grille d'équipement** 3 × 3 : arme, armure, bouclier / casque, bottes, anneau /
  relique, familier, trophée. À vérifier à 344 px.
- **Avatar** (`AventureAvatar.vue`) : dessiner bouclier, casque et bottes, teintés de leur
  rang, comme les pièces actuelles. C'est ce qui rend la refonte visible.
- **Relique** : la jauge dans l'animation de combat (`CombatStage`), le pouvoir écrit en
  toutes lettres sur la fiche.
- **Fiches et comparaisons** : la note de critique, d'esquive, etc. s'affiche **en
  pourcentage réel** (« critique 38 % → 41 % »), jamais en note brute.
- **Mes sets**, Codex (journal des sets sur 6), rangement automatique, boss entre amis
  (`heroLook` : apparence partagée avec les amis).
- Aide « rang et étoiles » inchangée.

---

## 12. Plan de travail — une branche, une livraison

Tout est fait sur une branche et livré ensemble. Les étapes ci-dessous sont des points de
contrôle internes, pas des livraisons.

| #   | Étape                                                                                                      | Estimation         |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | Courbes de chance à rendement décroissant, élan par tour, recalibration du combat de base                  | 2 j                |
| 2   | 7 emplacements : types, noms, icônes, tirage des drops, listes de stats, poids                             | 1 j                |
| 3   | 10 stats nouvelles dans le moteur de combat et dans `combatPower`                                          | 2 j                |
| 4   | Relique : jauge, 12 pouvoirs                                                                               | 2 j                |
| 5   | Sets à 6 pièces, 18 effets légendaires, rangement et « Mes sets »                                          | 1,5 j              |
| 6   | Nouvel optimiseur                                                                                          | 1 j                |
| 7   | Budget `gearBudget`, joueur de référence, suppression des 5 tables, recalibration du contenu               | 2 à 3 j            |
| 8   | Migration + vérification sur les comptes réels                                                             | 1 j                |
| 9   | Écran : grille, avatar, jauge, fiches                                                                      | 2 j                |
| 10  | Tests réécrits (items, combat, sets, voies, contenu procédural, Labyrinthe, trophée…), mutations, 6 portes | 1,5 à 2,5 j        |
|     | **Total**                                                                                                  | **~15 à 19 jours** |

Ordre imposé par les dépendances : 1 → 2 → 3 → (4, 5, 6 en parallèle) → 7 → 8 → 9 → 10.
La recalibration (7) vient après toutes les briques : la faire avant reviendrait à la
refaire.

---

## 13. Risques

- **Le combat de base bouge (§ 3.1).** Toute la calibration mesurée depuis la v0.600
  (sièges, arène, embuscades du héros) repose dessus. Les tests existants le diront, mais
  il faudra les réécrire un par un, pas les relâcher.
- **Un chantier long sur une branche** pendant que d'autres instances poussent sur `main` :
  fusionner `main` dans la branche souvent, et figer la zone équipement/combat pendant le
  chantier.
- **Le farm devient plus long** (6 emplacements à remplir au lieu de 4) : mesuré au
  point 11 du § 10, compensé par le nombre de drops si besoin.
- **Des stats liées à une condition** (parade, riposte, pouvoirs) sont difficiles à
  valoriser dans la puissance affichée : c'est ce qui a demandé toute la v0.837. Même
  méthode ici : mesure en vrai combat pour chaque nouvelle stat.

---

## 14. À décider par toi avant de commencer

1. **Les courbes de chance à rendement décroissant (§ 3.1)** : d'accord pour toucher le
   combat de base ? Sans ça, esquive, blocage et une partie des autres stats seront mortes.
2. **Le tableau des 7 emplacements (§ 4)**, en particulier le casque (PV · précision) et
   les bottes (esquive · initiative).
3. **Le budget (§ 5)** : garder la progression d'aujourd'hui (objets ×5,3 au niveau 90),
   ou une courbe plus douce ?
4. **Les sets à 6 pièces, bonus 2 / 4 / 6**, avec les 2 pièces offertes pour les sets
   complets déjà possédés.
5. **Les 7 nouveaux effets légendaires** (§ 6.3) et les **14 pouvoirs** (§ 7).
6. **La conversion des objets** (§ 9) plutôt que les laisser tels quels.
