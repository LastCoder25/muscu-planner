# Sets spécialisés, trophée à quête, reliques et voies

Date : 2026-09-22 · Statut : **à valider** (aucun code écrit) · Suite de la refonte à 7
emplacements (`2026-09-22-refonte-equipement-7-emplacements.md`, livrée en v0.1071).

## 1. Ce qui a été décidé avec l'utilisateur

1. **Les pièces normales ne portent que des stats de base.** Les stats spécialisées
   (épines, exécution, vol de vie…) deviennent **exclusives aux sets**.
2. **Une pièce de set garde une stat principale de base** (celle de son emplacement) ; ses
   stats #2 et #3 sont tirées dans **les stats de sa voie**. Exemple : l'Épineux porte des
   épines sur ses 6 pièces.
3. **Le trophée perd son rôle de pièce de stats** et devient un objet à **quête** : pendant
   le combat, une condition se remplit ; accomplie, **une règle du combat est pliée**
   (sans dégâts chiffrés — ça, c'est la relique).
4. **Le pouvoir d'un trophée est tiré au hasard parmi 8** (un par voie), **sans lien avec
   l'exercice** du boss entre amis.
5. **La quête continue tant que le héros enchaîne les combats** (donjon, Labyrinthe, arène),
   et repart de zéro à la fin de la descente.
6. **Reliques et voies sont revues dans le même chantier.** L'utilisateur trouve que la voie
   fait doublon avec le bonus de set (§ 6).
7. **On écrit la spec avant tout code.**

## 2. Le principe : une couche, un métier

| Couche            | Source                   | Ce qu'elle apporte                                      |
| ----------------- | ------------------------ | ------------------------------------------------------- |
| **Pièce normale** | donjons, expéditions…    | des **stats de base**, solides, qui comptent toujours   |
| **Pièce de set**  | boss de palier           | une stat de base + **les stats de sa voie**             |
| **Bonus de set**  | 2 / 4 / 6 pièces portées | paliers + signature (inchangé dans son principe)        |
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

### 3.2 Ce que ça fait aux pièces normales (à vérifier)

Retirer les stats spécialisées **appauvrit** certaines listes d'emplacement. Tableau de
travail, à ajuster pendant la mesure :

| Emplacement | Principale (drop)     | Soutien (drop), après retrait                    | Problème                            |
| ----------- | --------------------- | ------------------------------------------------ | ----------------------------------- |
| Arme        | dégâts · dégâts crit. | précision                                        | une seule stat de soutien           |
| Armure      | PV · réduction        | régénération, résistance aux critiques           | —                                   |
| Bouclier    | blocage               | résistance aux critiques                         | parade part : une seule principale  |
| Casque      | PV · précision        | initiative, résistance aux critiques, découverte | —                                   |
| Bottes      | esquive · initiative  | régénération                                     | une seule stat de soutien           |
| Anneau      | chance de critique    | or, découverte                                   | la rage part : une seule principale |

**Décision à prendre à l'implémentation :** enrichir les listes de base (par exemple autoriser
la réduction en soutien du bouclier, la chance de critique en soutien de l'arme, les dégâts
critiques en soutien de l'anneau) pour qu'aucun emplacement n'ait une seule stat possible.

## 4. Les 8 sets spécialisés

Chaque voie a **une stat exclusive** (sa marque) et **une stat partagée** avec une autre
voie. Les stats #2 et #3 d'une pièce de set sont tirées dans ces deux-là (plus une stat de
base si l'emplacement l'exige).

| Voie          | Stat exclusive   | Stat partagée      |
| ------------- | ---------------- | ------------------ |
| 💥 Berserker  | rage             | saignement         |
| 🗡️ Assassin   | exécution        | saignement         |
| 🩸 Vampire    | vol de vie       | rage               |
| 🌀 Frénétique | élan             | vol de vie         |
| 🌵 Épineux    | épines           | riposte            |
| 🤺 Duelliste  | riposte          | parade             |
| 🛡️ Gardien    | parade           | bouclier de départ |
| 🪨 Colosse    | **stat à créer** | bouclier de départ |

⚠️ **Le Colosse n'a pas de stat à lui** parmi celles qui existent. Piste : une stat
« robustesse » (un coup qui dépasse une part de tes PV max est réduit), dans l'esprit de sa
signature Inébranlable. À concevoir et à mesurer.

⚠️ **Plusieurs stats dépendent de l'ennemi** : les épines ne valent rien contre un boss qui
frappe peu, l'exécution rien tant que l'ennemi est haut. Chaque set doit rester viable
contre **un boss à gros coups espacés** comme contre **une horde qui frappe souvent** (§ 8).

## 5. Le trophée à quête

### 5.1 Le fonctionnement

- **Au drop** : un des 8 pouvoirs, tiré au hasard. Rang et étoiles comme aujourd'hui.
- **La quête** suit le geste d'une voie. Avec la voie correspondante, elle se remplit
  **deux fois plus vite** ; avec une autre, plus lentement. Tirer le trophée d'une autre
  voie pose donc une question : le garder, ou changer de voie.
- **Accomplie** : l'effet se déclenche, puis la quête recommence.
- **Rang et étoiles** raccourcissent la quête (par exemple 10 gestes en Bronze ★1, 4 au
  sommet). Aucun chiffre de dégâts : seulement la fréquence.
- **La quête se voit dans le rejeu du combat** (petite barre « 🧱 5/8 », éclat à
  l'accomplissement), sinon le joueur ne comprend pas pourquoi l'ennemi a perdu son tour.

### 5.2 Premier jet des 8 pouvoirs

| Voie          | Quête                       | Accomplie, il se passe…                                                |
| ------------- | --------------------------- | ---------------------------------------------------------------------- |
| 💥 Berserker  | perdre des PV               | tes coups du prochain tour ignorent la réduction ennemie               |
| 🛡️ Gardien    | bloquer des coups           | le prochain coup ennemi est annulé                                     |
| 🗡️ Assassin   | porter des critiques        | l'ennemi ne peut plus esquiver pendant ton prochain tour               |
| 🩸 Vampire    | se soigner par vol de vie   | le prochain coup ennemi te soigne au lieu de te blesser                |
| 🪨 Colosse    | encaisser des coups         | l'ennemi perd son prochain tour                                        |
| 🤺 Duelliste  | parer ou riposter           | **à retravailler** (trop proche du Gardien)                            |
| 🌵 Épineux    | renvoyer des coups d'épines | le prochain coup ennemi lui revient en entier, sans que tu le subisses |
| 🌀 Frénétique | tenir l'élan au maximum     | tu joues un tour supplémentaire (**trop proche du Colosse**)           |

⚠️ **Noms à choisir hors de ceux déjà pris** : signatures de set (Carnage, Bastion, Coup de
grâce, Soif éternelle, Inébranlable, Botte secrète, Ronces, **Transe**) et pouvoirs de
relique (Brasier, Rempart vengeur, Coup fatal, Festin, Tempête, Riposte parfaite, Éclat de
ronces, Carapace, Ouverture, Moisson, Phénix, Second souffle).

### 5.3 Contraintes

- **On compte les coups REÇUS, les tours, les critiques** — jamais les coups portés : le
  héros frappe ~17 fois par tour au niveau 60, un compteur sur ses coups ne vaut rien.
- **Contre un boss seul**, la quête doit s'accomplir **au moins une fois en Bronze**. On
  mesure la durée réelle d'un combat de boss pour caler les longueurs.
- **Le trophée reste un bonus modeste** (+2 à +5 % de puissance, sa valeur d'aujourd'hui) :
  un joueur sans amis ne doit pas être en retard.
- **L'arbitre de puissance doit connaître chaque pouvoir**, sinon l'optimiseur et les
  comparatifs ne le voient pas.

## 6. Voies et reliques

### 6.1 Le constat : la voie fait doublon

Aujourd'hui une voie donne :

- un **passif** d'environ 1 % de puissance ;
- le **doublement des paliers 2 et 4** de son set (`SET_AFFINITY_K`) ;
- le **palier 6 et la signature** de son set, réservés à elle ;
- le **pouvoir de relique** de la voie, porté par la relique de son set.

Le seul vrai choix est donc « quel set je porte » : choisir une voie sans porter son set
ne donne presque rien, et porter un set sans sa voie le prive de son sommet. Le bouton
« Porter ce set » règle d'ailleurs déjà la voie tout seul.

### 6.2 Trois options

- **A — La voie se DÉDUIT du set porté** (recommandée). Tu es de la voie du set dont tu
  portes le plus de pièces (à partir de 2). Plus de sélecteur, plus de passif séparé, plus
  d'« affinité » : les paliers sont dimensionnés directement. Le mot « voie » reste comme
  identité affichée. La quête du trophée et la charge de la relique regardent cette voie.
  - _Simplifie aussi l'optimiseur_, qui essaie aujourd'hui chaque voie tour à tour.
- **B — La voie reste un choix, avec un rôle à elle** : par exemple, elle seule accélère
  la quête du trophée et la jauge de la relique. Garde un sélecteur, mais lui donne enfin
  un effet qui n'est pas celui du set.
- **C — On supprime la notion de voie**, tout passe par les sets. Plus radical ; perd un
  mot que le jeu utilise partout (codex, avatar, écrans).

### 6.3 Reliques

- **Inchangé dans le principe** : un pouvoir à jauge, dont la force suit rang, jet et niveau
  d'objet, et qui monte d'un cran de vitesse au rang Légendaire.
- **Lien avec les sets spécialisés** : les jauges de voie se chargent déjà sur le geste de
  la voie (blocage, critique, épines…). Les stats spécialisées des sets alimentent donc
  directement la relique de la même voie — c'est cohérent, rien à ajouter.
- **À trancher** : l'affinité de pouvoir au drop (tirer le pouvoir de ta relique portée)
  passe-t-elle de 1/3 à 1/2 ?
- **À trancher** : la relique de voie devient-elle une **7ᵉ pièce du set** ? Aujourd'hui
  elle n'en fait pas partie (le set compte 6 pièces).

## 7. Migration des objets existants

Au chargement, idempotent, sur le modèle de `migrateGearItem` :

- **Pièce normale** : ses stats spécialisées deviennent des stats de base de son emplacement,
  même rang, même jet, même niveau d'objet.
- **Pièce de set** : ses stats #2 et #3 sont retirées dans les stats de sa voie (tirage
  déterministe sur l'id de l'objet, pour que la conversion soit stable).
- **Trophée** : il reçoit un pouvoir tiré sur son id, garde son rang et ses étoiles, perd ses
  stats (si l'option « pouvoir seulement » est retenue).
- **Voie** (option A) : la colonne `characters.voie` n'est plus lue ; rien à migrer.

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
4. **Robustesse** : chaque set contre un boss à gros coups espacés **et** contre une horde.
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
| 2     | Stat du Colosse, barème des stats spécialisées (mesure 1-2)              | 1 j        |
| 3     | Équilibrage des 8 sets (mesures 3-4), paliers et signatures              | 1 à 1,5 j  |
| 4     | Voie (option retenue) et reliques                                        | 0,5 à 1 j  |
| 5     | Trophée à quête : moteur, 8 pouvoirs, affichage dans le rejeu            | 1 à 1,5 j  |
| 6     | Migration des objets, recalage du contenu, tests réécrits, mutations     | 1 à 1,5 j  |

**Total : environ 5 à 7 jours.**

## 10. Questions ouvertes

1. **Voie** : option A (déduite du set), B (choix avec un rôle propre) ou C (supprimée) ?
2. **Trophée** : pouvoir seulement, ou pouvoir + quelques stats ?
3. **Pouvoirs du Duelliste et du Frénétique** à retravailler (§ 5.2).
4. **Stat exclusive du Colosse** : la « robustesse » convient-elle ?
5. **Relique** : affinité 1/3 → 1/2 ? Relique de voie comptée comme 7ᵉ pièce du set ?
6. **Listes de base appauvries** (§ 3.2) : quelles stats ajouter aux emplacements concernés ?
