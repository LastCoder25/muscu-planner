# Étude — des stats en rapport avec l'emplacement (équipement du héros)

_2026-09-22 · étude, rien d'implémenté._

Demande : « pas de % PV sur une arme mais sur une armure, des dégâts sur une arme,
des épines sur une armure (ou un bouclier à la limite) ». L'idée est que le type
d'objet dise ce qu'il fait, sans avoir à lire ses stats.

## 1. Ce qui se passe aujourd'hui

**Un drop tire ses stats sans regarder l'emplacement.** `rollDrop` (`src/lib/items.ts`)
tire un affixe par tier (`AFFIX_TIERS`), et ces pools sont les mêmes pour les quatre
emplacements :

| Tier | Affixe | Tiré parmi (quel que soit l'emplacement) |
| --- | --- | --- |
| Majeur | #1, toujours présent | dégâts · PV · réduction · critique |
| Secondaire | #2, à partir de Magique | vol de vie · épines · exécution · rage · élan |
| Mineur | #3, à partir d'Épique | or · découverte d'objets · régénération · initiative |

D'où ce qu'on voit en jeu :

- **une arme sur deux** a pour stat principale des **PV ou de la réduction** (2 chances sur 4) ;
- **une arme sur cinq** qui a un 2ᵉ affixe porte des **épines** ;
- une armure a une chance sur deux d'avoir des **dégâts ou du critique** en stat principale.

**La table par emplacement existe déjà, mais elle est morte.** `SLOT_EFFECTS` (arme =
dégâts/critique/vol de vie/exécution/élan, armure = réduction/PV/épines…) n'est plus
lue que par `availableEffects` → `forgeItem`, c'est-à-dire l'Atelier, retiré en v0.556.
Le passage aux tiers d'affixe (v0.581) a remplacé les pools par emplacement par des
pools communs, et le lien s'est perdu.

**Ce qui est déjà rangé par emplacement :**

- **les pièces de set**, pour leur stat principale seulement (`SET_SLOT_MAJORS` : arme et
  accessoire → dégâts, armure et relique → PV). Leurs affixes #2 et #3 sont libres ;
- **les 14 effets légendaires**, qui ont chacun leur emplacement (`LEGENDARY_PROCS.slots`) ;
- **le trophée**, dont la stat principale vient de l'exercice du boss.

Il n'y a **pas d'emplacement bouclier**. Les quatre emplacements sont : arme,
armure (Plastron, Cotte, Cuirasse, Harnois), accessoire (Anneau, Amulette, Talisman,
Bracelet) et relique (Éclat, Totem, Sceau, Idole).

## 2. Les contraintes que la proposition doit tenir

1. **Chaque emplacement garde au moins deux stats majeures.** Avec une seule, toutes
   les armes auraient la même stat principale et le jet deviendrait la seule différence
   entre deux armes.
2. **Aucune stat plafonnée ne doit être seule sur un emplacement.** Le critique est
   plafonné à 60 % et la réduction à 50 %, et le héros de référence est déjà au plafond
   du critique vers le niveau 30 (mesure de la v0.803). Un emplacement dont la seule
   stat majeure serait le critique produirait des objets sans valeur à haut niveau.
3. **L'attaque et la défense restent réparties.** La puissance vaut
   √(attaque × survie) : un build équilibré gagne toujours. Si deux emplacements
   n'offrent que de l'attaque et deux que de la défense, l'optimiseur tombe
   naturellement sur un build équilibré, sans être forcé.
4. **Aucun tier ne peut être vide pour un emplacement.** Épines (niv. 9), exécution (12),
   rage (15) et élan (18) sont débloqués par niveau. En pratique un 2ᵉ affixe n'apparaît
   qu'à partir de la rareté Magique, donc du niveau 21 (v0.875) : les verrous sont déjà
   levés à ce moment-là. Mais un tier doit quand même avoir une stat disponible dès le
   niveau 1, faute de quoi le code saute l'affixe sans rien dire.
5. **Chaque stat doit exister quelque part**, sinon on retire une stat du jeu sans le
   vouloir.

## 3. Proposition : quelles stats sur quel emplacement

Le principe : **l'arme frappe, l'armure encaisse, l'accessoire affûte, la relique
protège la vie.**

| Emplacement | Majeur (#1) | Secondaire (#2) | Mineur (#3) |
| --- | --- | --- | --- |
| ⚔️ **Arme** | **dégâts** · critique | vol de vie · **exécution** · **élan** | initiative |
| 🛡️ **Armure** | **PV** · **réduction** | **épines** · vol de vie¹ | régénération |
| 💍 **Accessoire** | critique · dégâts | vol de vie · élan · rage | **or** · **découverte d'objets** |
| 🔮 **Relique** | PV · réduction | **rage** · exécution · épines | régénération · initiative |

¹ Pour que le tier secondaire de l'armure ne soit pas vide avant le niveau 9 (contrainte 4).
Ça reprend ce que fait déjà l'effet légendaire Soif, qui est sur l'armure. Autre solution :
retirer le verrou de niveau des épines, mais seulement sur l'armure.

**Pourquoi chaque stat va là :**

- **Dégâts** : arme (sa fonction) et accessoire (bague de force). Aucune pièce défensive.
- **Critique** : arme et accessoire. On le retire de la relique, où il était jusqu'ici
  sans raison particulière.
- **PV** : armure et relique. **Jamais sur l'arme** (demande explicite).
- **Réduction** : armure et relique. Elle quitte l'accessoire.
- **Épines** : armure (demande explicite) et relique, en second choix, pour laisser au
  Gardien/Épineux deux emplacements où les chercher. Jamais sur une arme.
- **Vol de vie** : arme (la lame qui boit) et accessoire. Présent en secondaire sur
  l'armure seulement pour la contrainte 4.
- **Exécution** : arme (achever) et relique, en second choix.
- **Élan** : arme (enchaîner les coups) et accessoire.
- **Rage** : relique (fureur, dernier souffle) et accessoire.
- **Or et découverte d'objets** : accessoire seulement (l'« anneau de fortune »). C'est
  aussi le seul emplacement où ces stats ne font concurrence à aucune stat de survie.
- **Régénération** : armure et relique (on récupère entre deux combats).
- **Initiative** : arme (dégainer le premier) et relique.

**Vérification :** chaque emplacement a deux stats majeures, les treize stats sont
présentes, le critique et la réduction ne sont jamais seuls sur un emplacement, et
l'attaque (arme et accessoire) comme la défense (armure et relique) ont deux emplacements
chacune.

**Les pièces de set restent compatibles :** leur stat principale actuelle (dégâts, PV,
dégâts, PV) est dans la colonne majeur de chaque emplacement. Il suffit que leurs
affixes #2 et #3 soient tirés dans le pool de leur emplacement, comme les drops.

**Les effets légendaires sont déjà rangés par emplacement.** Deux seulement vont moins
bien avec la matrice :

- **Endurance** (réduction sous 50 % de PV) est sur l'accessoire, qui devient un
  emplacement offensif. Sa place serait plutôt sur la relique ;
- **Riposte affûtée** (critique après un coup reçu) est sur l'armure, ce qui se défend
  (on riposte après avoir encaissé).

Attention : `rollSetLegendaryProc` suppose que les effets légendaires de chaque
emplacement sont disjoints, pour garantir 4 effets différents sur un set complet. On
peut **déplacer** un effet d'un emplacement à un autre, pas le **dupliquer**.

## 4. Ce que ça change pour l'équilibrage (à mesurer, pas à supposer)

La proposition réduit les choix possibles par emplacement, et **la meilleure
puissance atteignable ne peut que baisser ou rester identique** : un build qui
empilait des dégâts sur trois emplacements n'est plus possible. La baisse devrait être
faible, puisque l'optimiseur choisit déjà un build équilibré, mais trois calibrages
reposent sur des tirages sans rapport avec l'emplacement :

- `gearExpect` / `bossGearExpect` et les renforts de contenu (`PROC_DUNGEON_BOOST`,
  `LABY_CONTENT_BOOST`, `ITEM_RANK_RELIEF`, `RANK_OPENING_RELIEF`) ;
- l'écart entre un set complet et les meilleurs drops (cible +5 à +10 %, v0.803). Les
  drops seront moins libres, donc **les sets remonteront un peu** en comparaison ;
- l'affinité de voie (v0.811), qui compte les cas où la voie du set n'est pas la
  meilleure.

**Mesures à faire avant d'implémenter** (même méthode que les fois précédentes : une
sonde qui utilise les vraies fonctions, jetée après usage, et les chiffres notés dans
le commit) :

1. puissance du meilleur build (`gearedFighter`, 3 profils × plusieurs tirages) aux
   niveaux 20/35/50/70/90, avec les pools actuels puis avec la matrice ;
2. si la baisse dépasse ~3 %, taux de victoire aux niveaux de référence des donjons, des
   boss et du Labyrinthe, avec la même méthode de réglage que pour la table des renforts ;
3. set complet contre meilleurs drops, pour les 8 voies ;
4. répartition des effets secondaires : l'exécution et l'élan, aujourd'hui tirés sur
   tous les emplacements, n'en ont plus que deux. Ils deviendront plus rares.

## 5. Les objets déjà possédés

**On ne les réécrit pas.** C'est la règle déjà appliquée pour l'équipement des
aventuriers (v0.900) : une arme à % PV reste telle quelle et sera remplacée
naturellement par les nouveaux drops. Le seul changement est pour l'avenir. Il
n'y a **aucune migration à faire** (JSONB, aucun champ nouveau).

On peut aussi recalculer au chargement les objets qui ne respectent pas la matrice.
Je ne le conseille pas : le joueur verrait des objets changer sans raison.

## 6. Plan d'implémentation (si tu valides)

1. Remplacer `SLOT_EFFECTS` par une table `SLOT_AFFIXES: Record<ItemSlot, Record<AffixTier,
   EffectType[]>>`, en `Record` exhaustif pour qu'un emplacement ou une stat oubliés
   bloquent la compilation.
2. `tierPool(tier, level)` → `slotTierPool(slot, tier, level)`, avec la stat par défaut
   de l'emplacement si le pool est vide. Utilisé par `rollDrop`, `rollSetPiece` (affixes #2
   et #3) et le re-tirage d'affixes au chargement (`items.ts` l. ~488).
3. `EFFECT_BASE` est calculé à partir de `SLOT_EFFECTS` : il faut le recalculer
   autrement, **sans changer les valeurs** (sinon toutes les magnitudes changent).
4. Supprimer `forgeItem`/`availableEffects` ou les brancher sur la nouvelle table (c'est
   du code mort qui garde encore l'ancienne logique).
5. Tests : chaque stat présente sur au moins un emplacement, jamais de PV ni de
   réduction sur une arme, jamais de dégâts sur une armure, pas de tier vide au niveau 1,
   les pièces de set respectent le pool de leur emplacement. Vérifier ensuite par
   mutation (remettre le pool commun doit faire échouer les tests).
6. Faire les mesures du § 4, puis ajuster si besoin.

À titre indicatif : environ ½ journée de code et de tests, plus ½ à 1 journée de mesures
et de réglage si la puissance baisse de plus de 3 %.

## 7. À décider par toi

1. **La matrice elle-même**, en particulier deux choix discutables :
   - l'**accessoire offensif** (critique/dégâts) et la **relique défensive** (PV/réduction).
     L'alternative serait deux emplacements mixtes (anneau de protection + relique de
     puissance), avec plus de variété mais une identité moins claire ;
   - l'**or et la découverte d'objets uniquement sur l'accessoire**.
2. **Le bouclier** : pas d'emplacement aujourd'hui. Trois possibilités :
   - (a) rien, les épines restent sur l'armure et la relique ;
   - (b) renommer une partie des reliques en boucliers (« Écu », « Pavois »), ce qui ne
     change que l'apparence ;
   - (c) créer un vrai 5ᵉ emplacement, ce qui oblige à recalibrer tout le combat
     (5 emplacements au lieu de 4 partout), donc à déconseiller.
3. **Endurance** : la laisser sur l'accessoire ou la déplacer sur la relique.
4. **L'équipement des aventuriers** (`advGear.ts`) a son propre système, déjà rangé par
   lignée. Faut-il appliquer la même règle (pas de PV sur une arme) ? Ce n'est pas
   dans le périmètre de cette étude.
