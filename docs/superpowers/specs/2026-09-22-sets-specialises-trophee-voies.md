# Sets spécialisés, trophée à quête, reliques et voies

Date : 2026-09-22 · Statut : **en validation** (aucun code écrit) · Suite de la refonte à 7
emplacements (`2026-09-22-refonte-equipement-7-emplacements.md`, livrée en v0.1071).

## 1. Ce qui a été décidé avec l'utilisateur

1. **Les pièces normales ne portent que des stats de base.** Les stats spécialisées
   (épines, exécution, vol de vie…) deviennent **exclusives aux sets**.
2. **Une pièce de set garde une stat principale de base** (celle de son emplacement) ; ses
   stats #2 et #3 sont tirées dans **les stats de sa voie**. Exemple : l'Épineux porte des
   épines sur ses 6 pièces.
3. **Le trophée ne porte plus de stats : seulement un pouvoir.** Pendant le combat, une
   quête se remplit ; accomplie, **une règle du combat est pliée** (sans dégâts chiffrés —
   ça, c'est la relique).
4. **Le pouvoir d'un trophée est tiré au hasard parmi 8** (un par voie), **sans lien avec
   l'exercice** du boss entre amis.
5. **La quête continue tant que le héros enchaîne les combats** (donjon, Labyrinthe, arène),
   et repart de zéro à la fin de la descente.
6. **La voie se DÉDUIT du set porté** (option A, § 6) : plus de sélecteur, plus de passif,
   plus d'affinité.
7. **Reliques** : l'affinité de pouvoir au drop **reste à 1/3** ; la relique de voie
   **ne devient pas** une 7ᵉ pièce du set.
8. **On refait une passe sur les 8 sets** pour leur donner des **profils bien distincts**
   (§ 4). La stat du Colosse se décide après cette passe.
9. **On écrit la spec avant tout code.**

## 2. Le principe : une couche, un métier

| Couche            | Source                   | Ce qu'elle apporte                                      |
| ----------------- | ------------------------ | ------------------------------------------------------- |
| **Pièce normale** | donjons, expéditions…    | des **stats de base**, solides, qui comptent toujours   |
| **Pièce de set**  | boss de palier           | une stat de base + **les stats de sa voie**             |
| **Bonus de set**  | 2 / 4 / 6 pièces portées | paliers + signature                                     |
| **Relique**       | drops, relique de set    | un **coup d'éclat** à jauge, dont la force est chiffrée |
| **Trophée**       | boss entre amis          | une **quête** qui, accomplie, **plie une règle**        |

Le choix « set ou drop » devient lisible : des stats qui comptent toujours, contre la
mécanique de ta voie, qu'aucun drop ne peut te donner.

## 3. Stats de base et stats spécialisées

### 3.1 Le découpage

| Stats de base (drops ET sets)                           | Stats spécialisées (sets seulement)      |
| ------------------------------------------------------- | ---------------------------------------- |
| dégâts, dégâts critiques, chance de critique, précision | exécution, rage, élan, saignement        |
| PV, réduction, blocage, esquive                         | vol de vie, épines, riposte, parade      |
| initiative, régénération, résistance aux critiques      | bouclier de départ                       |
| or, découverte d'objets (hors combat)                   | + une stat à créer pour le Colosse (§ 4) |

### 3.2 Les pièces normales après le retrait (proposition)

Retirer les stats spécialisées laissait certains emplacements avec **une seule** stat
possible. Proposition : chaque emplacement garde **2 principales et au moins 2 stats de
soutien**, en ajoutant des stats de base qui ont un sens pour l'objet. Les ajouts sont en
gras.

| Emplacement | Principales                               | Soutien                                             |
| ----------- | ----------------------------------------- | --------------------------------------------------- |
| Arme        | dégâts · dégâts critiques                 | précision · **chance de critique** · **initiative** |
| Armure      | PV · réduction                            | régénération · résistance aux critiques             |
| Bouclier    | blocage · **réduction**                   | résistance aux critiques · **PV**                   |
| Casque      | PV · précision                            | initiative · résistance aux critiques · découverte  |
| Bottes      | esquive · initiative                      | régénération · **résistance aux critiques**         |
| Anneau      | chance de critique · **dégâts critiques** | or · découverte · **précision**                     |

- **Bouclier** : la parade part au Gardien ; la **réduction** reprend sa place de principale
  (un bouclier arrête les coups).
- **Anneau** : la rage part au Berserker et au Vampire ; les **dégâts critiques** en
  deviennent l'autre principale, cohérents avec la chance de critique.
- **Arme et bottes** : un soutien de plus chacune, sans stat spécialisée.
- Chaque stat ajoutée existe déjà dans le moteur : aucune nouvelle mécanique.

### 3.3 Ce que les ennemis savent faire (vérifié le 2026-09-22)

Une stat qui agit sur l'ennemi ne vaut que si l'ennemi a de quoi la subir. Relevé dans le
code, pour **tous** les adversaires du héros (monstres écrits et procéduraux, boss de
palier, Labyrinthe, expéditions, failles, camps, embuscades) :

| L'ennemi…          | Réalité                                               | Conséquence                                                           |
| ------------------ | ----------------------------------------------------- | --------------------------------------------------------------------- |
| fait des critiques | **oui**, 2 à 20 % (souvent 5 à 14 %)                  | résistance aux critiques vivante, mais **faible** : à mesurer         |
| esquive            | **oui**, 0 à 16 % (souvent 5 %)                       | la précision agit, surtout par son **second effet** (dégâts d'entrée) |
| frappe             | **une fois par tour** (deux pour l'archétype « vif ») | blocage, parade, riposte, épines se déclenchent peu : à calibrer      |
| a de la réduction  | **non, jamais**                                       | tout effet « ignore la réduction » serait **vide**                    |
| bloque ou pare     | **non, jamais**                                       | tout effet « ignore le blocage / la parade » serait **vide**          |
| se soigne          | seulement la « sangsue » du Labyrinthe                | un effet « anti-soin » ne servirait presque nulle part                |

**Corrections faites dans cette spec** : les trophées Berserker (« ignore la réduction et le
blocage ») et Assassin (« ni esquiver ni parer ») visaient des stats que les ennemis n'ont
pas. Ils deviennent : le Berserker **déclenche sa rage à plein** quels que soient ses PV,
l'Assassin **exécute son prochain coup** comme si l'ennemi était à terre (§ 5.2).

**À surveiller à la mesure** : la résistance aux critiques pèse peu tant que les ennemis
critiquent à 5-14 %. Si elle reste marginale, on la garde en soutien seulement, ou on
relève le critique des ennemis (ce qui recalerait le contenu).

## 4. Les 8 profils

Chaque voie a **un rôle en combat**, **une stat exclusive** (sa marque), **une stat partagée**
avec une voisine, un terrain où elle **brille** et un où elle **peine**. Relique et trophée
reprennent son geste. Les deux voies défensives sont séparées nettement :
**Gardien = défense ACTIVE** (bloquer, parer), **Colosse = défense PASSIVE** (encaisser).

| Voie          | Rôle                                      | Stat exclusive           | Stat partagée      |
| ------------- | ----------------------------------------- | ------------------------ | ------------------ |
| 💥 Berserker  | plus il est blessé, plus il frappe        | rage                     | saignement         |
| 🗡️ Assassin   | ouvre, fait saigner, achève               | exécution                | saignement         |
| 🩸 Vampire    | tient en se soignant sur chaque coup      | vol de vie               | rage               |
| 🌀 Frénétique | lent au départ, écrasant en fin de combat | élan                     | vol de vie         |
| 🌵 Épineux    | punit qui le frappe                       | épines                   | riposte            |
| 🤺 Duelliste  | évite, puis contre                        | riposte                  | parade             |
| 🛡️ Gardien    | bloque et pare tout ce qui passe          | parade                   | bouclier de départ |
| 🪨 Colosse    | encaisse les gros coups sans broncher     | **stat à créer** (§ 4.2) | bouclier de départ |

### 4.1 Forces, faiblesses, relique, trophée

| Voie          | Brille contre…                         | Peine contre…                         | Relique (existante) | Quête du trophée            |
| ------------- | -------------------------------------- | ------------------------------------- | ------------------- | --------------------------- |
| 💥 Berserker  | les combats longs, les boss            | les ennemis qui tuent vite            | Brasier             | perdre des PV               |
| 🗡️ Assassin   | les boss à gros réservoir de PV        | les hordes (l'exécution sert peu)     | Coup fatal          | porter des critiques        |
| 🩸 Vampire    | les longues descentes                  | les coups énormes qui passent le soin | Festin              | se soigner par vol de vie   |
| 🌀 Frénétique | les combats longs                      | les combats courts                    | Tempête             | tenir l'élan au maximum     |
| 🌵 Épineux    | les hordes qui frappent souvent        | les boss qui frappent peu             | Éclat de ronces     | renvoyer des coups d'épines |
| 🤺 Duelliste  | les ennemis qui frappent peu mais fort | les hordes (trop de coups à lire)     | Riposte parfaite    | riposter                    |
| 🛡️ Gardien    | les coups nombreux et moyens           | les attaques qui ignorent le blocage  | Rempart vengeur     | parer                       |
| 🪨 Colosse    | les gros coups espacés                 | l'usure (beaucoup de petits coups)    | Carapace            | encaisser des coups         |

Ces forces et faiblesses sont **des cibles de mesure** (§ 8) : chaque set doit rester
jouable partout, mais être nettement meilleur sur son terrain.

### 4.2 La stat du Colosse (à décider après validation des profils)

Aucune stat existante ne dit « encaisser un gros coup ». Piste : **robustesse** — un coup
qui dépasse une part de tes PV max est réduit. Elle colle à son terrain (gros coups
espacés) et à sa signature Inébranlable, sans recouvrir la réduction (qui agit sur tous les
coups) ni le blocage (qui dépend du hasard).

## 5. Le trophée à quête

### 5.1 Le fonctionnement

- **Au drop** : un des 8 pouvoirs, tiré au hasard. Rang et étoiles comme aujourd'hui.
  **Aucune stat.**
- **La quête** suit le geste d'une voie. Avec la voie correspondante — donc le set porté,
  la voie se déduisant du set — elle se remplit **deux fois plus vite** ; avec une autre,
  plus lentement.
- **Accomplie** : l'effet se déclenche, puis la quête recommence.
- **Rang et étoiles** raccourcissent la quête (par exemple 10 gestes en Bronze ★1, 4 au
  sommet). Aucun chiffre de dégâts : seulement la fréquence.
- **La quête se voit dans le rejeu du combat** (petite barre « 🧱 5/8 », éclat à
  l'accomplissement), sinon le joueur ne comprend pas pourquoi l'ennemi a perdu son tour.

### 5.2 Les 8 pouvoirs (noms provisoires)

Chaque récompense appartient à une **famille différente**, pour qu'aucune ne ressemble à
une autre : déchaîner, achever, annuler, retourner, étaler, désarmer, renvoyer, accélérer.

| Voie          | Quête                       | Accomplie, il se passe…                                                 | Famille   |
| ------------- | --------------------------- | ----------------------------------------------------------------------- | --------- |
| 💥 Berserker  | perdre des PV               | ta rage joue à plein pendant ton prochain tour, quels que soient tes PV | déchaîner |
| 🗡️ Assassin   | porter des critiques        | ton prochain coup exécute, comme si l'ennemi était déjà à terre         | achever   |
| 🛡️ Gardien    | parer                       | le prochain coup ennemi est annulé                                      | annuler   |
| 🩸 Vampire    | se soigner par vol de vie   | le prochain coup ennemi te soigne au lieu de te blesser                 | retourner |
| 🪨 Colosse    | encaisser des coups         | le prochain coup ennemi est **étalé sur trois tours**                   | étaler    |
| 🤺 Duelliste  | riposter                    | **l'ennemi est désarmé : il perd son prochain tour**                    | désarmer  |
| 🌵 Épineux    | renvoyer des coups d'épines | le prochain coup ennemi lui revient en entier, sans que tu le subisses  | renvoyer  |
| 🌀 Frénétique | tenir l'élan au maximum     | tu joues un tour supplémentaire                                         | accélérer |

- **Colosse** : l'effet « l'ennemi perd son tour » passe au Duelliste (un duelliste désarme,
  c'est son métier). Le Colosse reçoit un effet de tank passif : un coup énorme devient
  trois coups supportables.
- **Frénétique** garde le tour supplémentaire, qui n'a plus de doublon.
- ⚠️ **Noms à choisir hors de ceux déjà pris** : signatures de set (Carnage, Bastion, Coup de
  grâce, Soif éternelle, Inébranlable, Botte secrète, Ronces, Transe) et pouvoirs de relique
  (Brasier, Rempart vengeur, Coup fatal, Festin, Tempête, Riposte parfaite, Éclat de ronces,
  Carapace, Ouverture, Moisson, Phénix, Second souffle).

### 5.3 Contraintes

- **On compte les coups REÇUS, les tours, les critiques, les ripostes** — jamais les coups
  portés : le héros frappe ~17 fois par tour au niveau 60, un compteur sur ses coups ne vaut
  rien.
- **Contre un boss seul**, la quête doit s'accomplir **au moins une fois en Bronze**. On
  mesure la durée réelle d'un combat de boss pour caler les longueurs.
- **Le trophée reste un bonus modeste** (+2 à +5 % de puissance, sa valeur d'aujourd'hui) :
  un joueur sans amis ne doit pas être en retard.
- **L'arbitre de puissance doit connaître chaque pouvoir**, sinon l'optimiseur et les
  comparatifs ne le voient pas.

## 6. Voies et reliques

### 6.1 Le constat : la voie faisait doublon

Aujourd'hui une voie donne un passif (~1 % de puissance), le doublement des paliers 2 et 4
de son set, le palier 6 et la signature de son set, et le pouvoir de relique de la voie. Le
seul vrai choix était donc « quel set je porte ».

### 6.2 Décision : la voie se déduit du set porté (option A)

- **Ta voie = celle du set dont tu portes le plus de pièces**, à partir de 2. À égalité, le
  set le plus avancé (le plus de pièces au rang le plus haut) l'emporte. Sans set, pas de
  voie.
- **Supprimés** : le sélecteur de voie, le passif de voie, l'affinité de set
  (`SET_AFFINITY_K`), le gating du palier 6 par la voie (il suffit de porter les 6 pièces).
- **Les paliers se redimensionnent directement** : ce que l'affinité doublait est intégré à
  la valeur des paliers.
- **Le mot « voie » reste** comme identité affichée (fiche, avatar, codex).
- **L'optimiseur se simplifie** : il n'essaie plus chaque voie tour à tour.
- **Ce que la voie déduite pilote** : la vitesse de la quête du trophée, et la voie affichée.

### 6.3 Reliques

- **Inchangé** : un pouvoir à jauge, dont la force suit rang, jet et niveau d'objet, et qui
  se remplit plus vite à partir du rang Légendaire.
- **Affinité de pouvoir au drop : reste à 1/3.**
- **La relique de voie n'est pas une pièce du set** (le set compte toujours 6 pièces).
- **Lien avec les sets spécialisés** : les jauges de voie se chargent sur le geste de la voie
  (parade, critique, épines…). Les stats spécialisées des sets alimentent donc directement la
  relique de la même voie.
- ⚠️ **Le Rempart vengeur (Gardien) se charge aujourd'hui sur le BLOCAGE**, qui reste une stat
  de base. À voir à la mesure : le passer sur la parade, ou le laisser sur le blocage (tout le
  monde peut alors le charger).

## 7. Migration des objets existants

Au chargement, idempotent, sur le modèle de `migrateGearItem` :

- **Pièce normale** : ses stats spécialisées deviennent des stats de base de son emplacement,
  même rang, même jet, même niveau d'objet.
- **Pièce de set** : ses stats #2 et #3 sont retirées dans les stats de sa voie (tirage
  déterministe sur l'id de l'objet, pour que la conversion soit stable).
- **Trophée** : il reçoit un pouvoir tiré sur son id, garde son rang et ses étoiles, perd ses
  stats.
- **Voie** : la colonne `characters.voie` n'est plus lue ; rien à migrer.

## 8. Plan de mesure

Tout se mesure avec les vraies libs et le joueur de référence (`test/helpers/gearedFighter`),
puis les sondes sont supprimées et les chiffres vont dans le commit.

1. **Valeur de chaque stat spécialisée** en vrai combat, contre une stat de base, pour fixer
   son barème (une stat conditionnelle doit valoir plus pour compenser).
2. **Poids dans l'arbitre de puissance** (`combatPower`) : chaque stat doit y peser sa vraie
   valeur de combat (précédent : vol de vie, épines et élan mal jugés en v0.837).
3. **Par voie** :
   - le set complet bat nettement 6 bons drops ;
   - des mélanges set + drops restent viables ;
   - le set d'une autre voie fait moins bien que des drops.
4. **Profils** (§ 4.1) : chaque set sur son terrain favori et sur son terrain difficile
   (boss à gros coups espacés, horde, combat court, combat long). Il doit être nettement
   meilleur sur le premier, et rester jouable sur le second.
5. **Trophée** : au moins un accomplissement par combat de boss en Bronze, et un gain total
   de +2 à +5 % de puissance.
6. **Recalage du contenu** (donjons, boss de palier, Labyrinthe) sur le nouveau joueur de
   référence, comme pour la refonte à 7 emplacements.
7. **Économie** inchangée (aucune devise touchée), mais on vérifie que les tests
   `goldSink` / `scrapEconomy` restent verts.

## 9. Étapes et estimation

| Étape | Contenu                                                                  | Estimation |
| ----- | ------------------------------------------------------------------------ | ---------- |
| 1     | Découpage des stats, listes de drops enrichies, tirage des pièces de set | 0,5 j      |
| 2     | Stat du Colosse, barème des stats spécialisées (mesures 1-2)             | 1 j        |
| 3     | Équilibrage des 8 profils (mesures 3-4), paliers et signatures           | 1,5 à 2 j  |
| 4     | Voie déduite du set, suppression du sélecteur et du passif               | 0,5 à 1 j  |
| 5     | Trophée à quête : moteur, 8 pouvoirs, affichage dans le rejeu            | 1 à 1,5 j  |
| 6     | Migration des objets, recalage du contenu, tests réécrits, mutations     | 1 à 1,5 j  |

**Total : environ 5,5 à 7,5 jours.**

## 10. Questions ouvertes

Validés : les 8 profils, la robustesse du Colosse, les 8 pouvoirs de trophée (avec les
corrections Berserker/Assassin du § 3.3). L'équilibrage prendra du temps (§ 8).

1. **Rempart vengeur** (pouvoir de relique du Gardien) : il se charge sur le **blocage**, qui
   reste une stat de base que tout le monde peut avoir. Le laisser, ou le passer sur la
   **parade**, qui devient la stat du Gardien ?
