# Étude — les boosts possibles par type d'équipement, et une relique à pouvoir unique

_2026-09-22 · étude, rien d'implémenté. Fait suite à
[2026-09-22-affixes-par-emplacement-design.md](2026-09-22-affixes-par-emplacement-design.md)._

Principe retenu avec toi : **chaque objet donne des boosts liés à ce qu'il fait.** L'arme
agit sur le coup que tu portes, l'armure sur les coups que tu reçois, et l'accessoire
donne des bonus indirects. La relique change de nature : au lieu de stats, elle porte un
**pouvoir unique**.

## Partie 1 — catalogue des boosts par type d'équipement

### Ce que le moteur de combat sait faire aujourd'hui

`simulateCombat` (`src/lib/combat.ts`) gère : des dégâts par coup, **plusieurs coups par
tour** (multi-frappe), la chance de critique (le critique fait toujours ×2), l'esquive,
l'initiative, la réduction de dégâts, le vol de vie (limité à 8 % des PV par tour), les
épines, l'exécution, la rage, l'élan, et les effets légendaires qui se déclenchent une
seule fois. La régénération ne s'applique **qu'entre deux combats**, jamais pendant.
L'esquive existe dans le calcul (`dodgeAdd`) mais seuls les talents la donnent : aucun
objet n'en porte.

**Difficulté de chaque boost :**
- 🟢 **existe** : il suffit de le proposer sur cet emplacement ;
- 🟡 **simple** : le moteur a déjà le champ qu'il faut, il faut juste le brancher ;
- 🟠 **nouveau** : il faut ajouter une petite règle au moteur de combat ;
- 🔴 **lourd** : nouvelle mécanique, avec un vrai risque pour l'équilibrage.

⚠️ **Règle pour tout ce qui est 🟠 ou 🔴 :** un boost qui tire au hasard (blocage,
étourdissement…) ne doit faire ce tirage **que si le joueur a ce boost**. C'est déjà la
règle des effets légendaires. Sinon, tous les combats générés à partir d'une graine
changeraient de résultat, et avec eux toute la calibration du jeu.

### ⚔️ Arme — le coup porté

| Boost | Ce qu'il fait | Difficulté | Avis |
| --- | --- | --- | --- |
| Dégâts | + % sur chaque coup | 🟢 | ✅ stat principale |
| Élan | + dégâts à chaque coup porté pendant le combat, jusqu'à 6 coups | 🟢 | ✅ |
| Vol de vie | tu récupères une part des dégâts infligés | 🟢 | ✅ |
| Exécution | + dégâts quand l'ennemi a moins de 25 % de ses PV | 🟢 | ✅ |
| Critique (chance) | chance de faire un coup critique | 🟢 | ⚠️ plafonné vers le niveau 30 : à mettre plutôt sur l'accessoire, voir plus bas |
| **Dégâts critiques** | un critique fait plus que ×2 | 🟡 | ✅ **à ajouter**. Pas de plafond, garde sa valeur en fin de partie |
| **Précision** | réduit la chance d'esquive de l'ennemi | 🟡 | ✅ utile contre les monstres « insaisissables » |
| **Vitesse d'attaque** | + coups par tour | 🟡 | ⚠️ très puissant : chaque coup profite aussi du vol de vie et de l'élan. À réserver aux valeurs faibles ou aux pièces rares |
| **Saignement** | les coups laissent des dégâts qui continuent sur plusieurs tours | 🟠 | 👍 donne un vrai style de jeu |
| **Étourdissement** | chance que l'ennemi saute son prochain tour | 🟠 | ⚠️ fort contre les boss, à limiter en fréquence |
| Pénétration | ignore une part de la réduction de l'ennemi | 🟡 | ❌ très peu de monstres ont de la réduction, donc presque sans effet |

### 🛡️ Armure — les coups encaissés

| Boost | Ce qu'il fait | Difficulté | Avis |
| --- | --- | --- | --- |
| PV | + % de PV max | 🟢 | ✅ stat principale |
| Réduction de dégâts | − % sur chaque coup reçu, plafonné à 50 % | 🟢 | ✅ stat principale |
| Épines | renvoie une part des dégâts reçus à l'ennemi | 🟢 | ✅ |
| Régénération | + PV récupérés **entre** deux combats | 🟢 | ✅ |
| **Blocage** | chance d'encaisser un coup presque sans dégâts (−75 %) | 🟠 | ✅ **ta proposition, et elle est bonne**. La réduction enlève un peu sur chaque coup, le blocage enlève beaucoup sur quelques coups : c'est un autre style de défense |
| **Résistance aux critiques** | les critiques de l'ennemi font moins mal | 🟡 | ✅ utile contre les monstres « féroces » |
| **Bouclier de départ** | tu commences le combat avec une barrière égale à X % de tes PV | 🟠 | 👍 simple à comprendre, facile à montrer dans l'animation |
| **Récupération en combat** | + X % de PV à chaque tour | 🟠 | ⚠️ c'est le risque de héros impossible à tuer : il faut qu'elle compte dans la même limite de soin par tour que le vol de vie |
| **Riposte** | chance de contre-attaquer quand on te frappe | 🟠 | 👍 correspond bien à « l'armure qui encaisse et répond » |
| Plafond par coup | aucun coup ne retire plus de X % de tes PV | 🟠 | ❌ c'est déjà l'effet du set complet du Colosse, ce serait un doublon |

### 💍 Accessoire — les bonus indirects

| Boost | Ce qu'il fait | Difficulté | Avis |
| --- | --- | --- | --- |
| Critique (chance) | chance de faire un coup critique | 🟢 | ✅ stat principale, à associer aux dégâts critiques de l'arme |
| Rage | + dégâts quand tu as moins de 30 % de tes PV | 🟢 | ✅ |
| Initiative | tu commences le combat en premier plus souvent | 🟢 | ✅ |
| Or | + or gagné | 🟢 | ✅ |
| Découverte d'objets | + chance de meilleurs objets (déjà limitée à ton rang) | 🟢 | ✅ |
| Régénération | + PV récupérés entre deux combats | 🟢 | ✅ si tu la veux aussi ici |
| **Esquive** | chance d'éviter complètement un coup (plafonnée à 40 %) | 🟡 | ✅ déjà calculée pour les talents, un « anneau d'agilité » a du sens |
| **Dressage des familiers** | + XP gagnée par ton familier | 🟡 | 👍 indirect et ne touche pas au sport |
| XP ou énergie | + XP ou énergie gagnée | — | ❌ **exclu** : le sport doit rester la seule source de progression |
| Pierres d'invocation, clés | + ressources de boss ou de Labyrinthe | — | ❌ **exclu** : ces ressources relient les activités entre elles, les donner en bonus casserait ce lien |
| Trajet des expéditions | expéditions plus rapides | — | ❌ c'est déjà le rôle de l'Avant-poste |

### Ce qui en ressort

- **Critique : la chance va sur l'accessoire, la puissance sur l'arme** (dégâts
  critiques). Chaque objet garde une stat qui lui ressemble, et le plafond du critique
  ne rend plus une arme inutile.
- **Il faut des stats nouvelles pour que chaque objet ait de la variété** : armure
  **blocage + résistance aux critiques**, arme **dégâts critiques + précision**,
  accessoire **esquive**. Avec les stats d'aujourd'hui seulement, l'armure n'aurait que
  4 stats.
- **Je déconseille de tout faire d'un coup.** Chaque stat nouvelle doit être mesurée en
  vrai combat, puis pesée dans `combatPower`, sinon l'optimiseur et les comparaisons
  d'objets se trompent (c'est la leçon de la v0.837). Le premier lot que je propose est
  **dégâts critiques, blocage et esquive** : peu de travail sur le moteur, et le plus
  gros effet sur la variété.
- **Ce qu'il faut mesurer** : avec ce découpage, seule l'arme donne de l'attaque directe
  et seule l'armure de la défense directe. Il faudra régler les valeurs des bonus
  indirects pour que le héros ne s'affaiblisse pas globalement (voir la réponse
  précédente).

## Partie 2 — une relique qui porte un pouvoir unique

### L'idée

La relique ne donne plus de stats. Elle porte **un pouvoir** : un effet qu'on voit se
déclencher pendant le combat, comme les compétences des jeux d'action. **Le combat
reste automatique**, le pouvoir se déclenche tout seul. Choisir sa relique revient à
choisir **comment** on veut que le combat se passe, pas à ajouter un peu plus d'une stat.

Il y a une base pour ça. Les trois effets légendaires de la relique (**Phénix**, **Second
souffle** et **Curée**) sont déjà des pouvoirs : ils agissent au bord de la mort. Et
l'animation de combat a déjà un bandeau qui affiche les compétences déclenchées (v0.944).

### Trois façons de le faire

**A. Un pouvoir qui se déclenche sur une condition.** Exemples : « la première fois que tu
passes sous 30 % de PV… », « quand l'ennemi est sous 25 %… ». C'est le fonctionnement des
effets légendaires, avec un effet qui grandit avec la rareté. Le moins de travail, mais
les pouvoirs se ressemblent (ils attendent tous un seuil).

**B. Un pouvoir à jauge.** Une jauge se remplit à chaque coup donné ou reçu. Quand elle est
pleine, le pouvoir se déclenche, puis la jauge repart de zéro. C'est la plus lisible (on
voit la jauge monter dans l'animation) et celle qui donne le plus de styles différents :
certains pouvoirs se rechargent vite et font peu, d'autres rarement et font beaucoup. Il
faut une nouvelle mécanique dans le moteur et un affichage de la jauge.

**C. Un pouvoir hors combat.** Exemples : révéler la carte du Labyrinthe, relancer un
coffre, avoir une salle bonus. Original, mais la relique sortirait du combat alors que
tout le reste de l'équipement y agit, et elle deviendrait difficile à comparer aux autres
objets.

**Je conseille B, avec quelques pouvoirs de A**, parce que Phénix et Second souffle
fonctionnent déjà sur une condition et qu'on les garde tels quels.

### Des pouvoirs possibles

| Pouvoir | Type | Effet | Ce que la rareté améliore |
| --- | --- | --- | --- |
| ⚡ **Frappe céleste** | jauge, attaque | retire X % des PV max de l'ennemi | la valeur de X |
| 🛡️ **Bouclier sacré** | jauge, défense | barrière égale à X % de tes PV | la taille de la barrière |
| 🔥 **Phénix** | condition | un coup mortel ne te tue pas, tu repars avec X % de PV | la valeur de X |
| 💨 **Second souffle** | condition | tu récupères X % de tes PV la 1re fois que tu passes sous 30 % | la valeur de X |
| ⏳ **Arrêt du temps** | jauge | tu joues un tour de plus | la vitesse de recharge |
| 🕯️ **Malédiction** | jauge | l'ennemi fait −X % de dégâts pendant N tours | X et N |
| 👻 **Drain d'âme** | jauge | tu retires X % des PV max de l'ennemi et tu les récupères | la valeur de X |
| 🥁 **Totem de guerre** | jauge | + X % de dégâts pendant N tours | X et N |
| 🪞 **Miroir** | jauge | le prochain coup reçu est renvoyé à l'ennemi | la part renvoyée |

⚠️ **Plafonner les effets en « % des PV max de l'ennemi »**, sinon ils écrasent les boss
qui ont beaucoup de PV. L'effet légendaire Rétorsion (7 % des PV max par coup) montre
déjà l'ordre de grandeur acceptable.

### Relier les pouvoirs aux voies

**Il y a 8 voies et 8 sets de voie. Chaque set pourrait avoir sa relique, avec le pouvoir
de sa voie :**

| Voie | Pouvoir de sa relique |
| --- | --- |
| 💥 Berserker | Totem de guerre |
| 🛡️ Gardien | Bouclier sacré |
| 🗡️ Assassin | Frappe céleste |
| 🩸 Vampire | Drain d'âme |
| 🪨 Colosse | Phénix |
| 🤺 Duelliste | Arrêt du temps |
| 🌵 Épineux | Miroir |
| 🌀 Frénétique | Malédiction, ou un pouvoir d'élan |

Les reliques trouvées en dehors des sets tirent un pouvoir au hasard dans la liste. La
relique d'un set donne ainsi une identité visible à sa voie, et comme le pouvoir marche
avec toutes les voies, on ne pénalise pas celui qui porte un set qui n'est pas le sien.

### Ce que ça change dans le reste du jeu

- **Rareté, jet et niveau d'objet** gardent leur rôle : ils règlent la **force** du
  pouvoir, avec la même formule que les stats. Une relique Légendaire n'aurait pas
  d'effet légendaire en plus : son pouvoir devient **amélioré** (une deuxième charge, ou
  une recharge plus rapide).
- **Les 14 effets légendaires** : les 3 de la relique (Phénix, Second souffle, Curée)
  deviennent des pouvoirs de relique. Il reste 11 effets légendaires pour les trois
  autres emplacements, toujours un effet par emplacement pour qu'un set complet en ait
  toujours 4 différents (`rollSetLegendaryProc`).
- **Les paliers des sets** (bonus à 2, 3 et 4 pièces) : la relique compte toujours comme
  une pièce. Mais la stat principale des pièces de set est aujourd'hui des PV sur la
  relique, et les calculs de set ont été calibrés avec ça (`SET_PIECE_MAJOR_K`). Il
  faudra refaire la mesure set complet contre meilleurs drops.
- **La puissance affichée** doit compter le pouvoir, avec une valeur **mesurée en vrai
  combat** comme pour les effets légendaires (v0.837), et qui grandit avec la rareté.
  Sans ça, l'optimiseur ne saurait pas choisir entre deux reliques.
- **Les reliques déjà possédées** : elles ne peuvent pas rester des objets à stats, sinon
  on aurait deux sortes de reliques. Soit on leur donne un pouvoir au hasard à leur
  rareté au prochain chargement, soit on les rembourse. Je conseille de leur donner un
  pouvoir : le joueur ne perd rien.
- **L'animation de combat** doit montrer la jauge et le déclenchement. C'est ce qui
  donne son intérêt au pouvoir. Le bandeau de compétences existe déjà, la jauge est à
  faire.
- **L'écran** : afficher le pouvoir en toutes lettres sur la relique (« Bouclier sacré :
  barrière de 18 % tous les 6 coups reçus »), jamais un pourcentage seul.

### Ce que ça demande

1. Moteur : la jauge et les 8 à 9 pouvoirs, chacun ne tirant au hasard que s'il est porté
   (≈ 1 jour).
2. Objets : le tirage d'un pouvoir, la reprise des reliques existantes, le pouvoir de
   chaque relique de set (≈ ½ jour).
3. Calibrage : chaque pouvoir mesuré en vrai combat pour valoir autant qu'une relique
   d'aujourd'hui, puis pesé dans `combatPower`, puis la mesure des sets refaite
   (≈ 1 jour).
4. Animation de la jauge et du déclenchement, fiche de l'objet (≈ ½ jour).

**Au total, environ 3 jours**, plus que la répartition des stats (Partie 1). Les deux
sont indépendantes. On peut commencer par la Partie 1 et garder les reliques actuelles
en attendant.

## À décider par toi

1. **Les nouvelles stats du premier lot** : dégâts critiques, blocage, esquive. Et
   ensuite lesquelles, parmi résistance aux critiques, bouclier de départ, riposte,
   précision, saignement.
2. **Le critique** : la chance sur l'accessoire et la puissance (dégâts critiques) sur
   l'arme, d'accord ?
3. **La relique** :
   - quelle version : à jauge (B), sur condition (A), ou les deux ?
   - relier chaque set de voie à un pouvoir : oui ou non ?
   - la relique garde-t-elle une petite stat en plus de son pouvoir, ou seulement le pouvoir ?
4. **L'ordre de travail** : la répartition des stats d'abord, ou les deux ensemble ?

---

## Partie 3 — mise à jour après tes retours (2026-09-22)

### Armure : blocage, parade, riposte

L'étourdissement quitte l'arme et devient la **Parade**, sur l'armure. Tu as parlé d'un
bouclier : il n'y a pas d'emplacement bouclier, donc ces stats vont sur l'armure. Si tu
veux que ça se voie, on peut ajouter « Écu » et « Pavois » aux noms d'armure.

| Stat | Quand elle se déclenche | Ce qu'elle fait | Ce qu'elle ne fait pas |
| --- | --- | --- | --- |
| **Blocage** | une chance sur chaque coup reçu | le coup ne fait que 25 % de ses dégâts | pas de contre-attaque |
| **Parade** | une chance sur chaque coup reçu | tu évites le coup, et l'ennemi saute son prochain tour | pas de dégâts |
| **Riposte** | une chance sur chaque coup reçu | tu évites le coup et tu contre-attaques | l'ennemi n'est pas étourdi |

⚠️ **La parade est la plus dangereuse pour l'équilibrage.** Quand l'ennemi saute un tour,
toi tu frappes plusieurs fois pendant ce tour (multi-frappe). Il faut trois limites : la
chance de parade doit rester basse, l'ennemi ne peut pas être étourdi deux tours de suite,
et les boss résistent en partie à l'étourdissement.

Ces trois stats tirent au hasard : elles ne doivent le faire **que si le héros les
porte**. Sinon, tous les combats générés par graine changent de résultat.

**Armure, cible à 6 stats** : 2 principales (PV, réduction) + 4 de soutien, à choisir parmi
épines · régénération · blocage · parade · riposte · résistance aux critiques. C'est une
de trop, voir la question 1 en fin de document.

### Relique : un pouvoir qui se charge

**Les règles communes à tous les pouvoirs :**

- La jauge se remplit selon **une action propre à chaque pouvoir** : bloquer, faire un
  critique, être touché… C'est ce qui lie la relique au reste du build.
- **La jauge est conservée d'un combat à l'autre pendant un donjon ou un Labyrinthe**,
  comme les PV. Sans ça, contre les petits monstres, le combat serait fini avant que le
  pouvoir se déclenche.
- **La rareté augmente la force** du pouvoir. **À partir de Légendaire**, la jauge se
  remplit aussi plus vite.
- **Limites** : un pouvoir qui retire des « % des PV max de l'ennemi » est plafonné, sinon
  il écrase les boss. Un pouvoir qui soigne passe par la même limite de soin par tour que
  le vol de vie. Un pouvoir ne peut pas étourdir l'ennemi deux tours de suite.

#### Les pouvoirs liés à une stat

La relique renforce un build : elle est d'autant plus efficace que le reste de l'équipement
déclenche souvent l'action qui la charge.

| Pouvoir | Ce qui remplit la jauge | Ce qu'il fait quand elle est pleine | Stat liée |
| --- | --- | --- | --- |
| 🛡️ **Rempart vengeur** | les dégâts évités par tes blocages s'accumulent | renvoie tout le stock à l'ennemi d'un coup | blocage |
| 🌵 **Éclat de ronces** | les dégâts renvoyés par tes épines s'accumulent | une explosion qui inflige tout ce qui a été accumulé | épines |
| 🎯 **Coup fatal** | chaque coup critique | ton prochain coup est un critique ×3 que l'ennemi ne peut pas esquiver | critique |
| 🩸 **Festin** | le soin perdu parce que ton vol de vie a atteint sa limite | ce soin perdu est converti en dégâts, ou en barrière | vol de vie |
| 🌀 **Tempête** | l'élan arrive à son maximum | l'élan retombe à zéro, en échange d'une rafale de coups gratuits | élan |
| 💨 **Contre-temps** | chaque coup esquivé | tu joues un tour de plus | esquive |
| 🤺 **Riposte parfaite** | chaque parade | ta prochaine riposte est un critique certain | parade / riposte |
| 🔥 **Brasier** | la jauge ne se remplit que si tu as moins de 30 % de PV, mais très vite | un coup dont la force dépend des PV qui te manquent | rage |
| 🧱 **Carapace** | les dégâts que tu encaisses | une barrière égale à une part de ces dégâts | PV / réduction |
| 💧 **Source** | un peu à chaque tour | tu récupères X % de tes PV max | régénération |
| ⚡ **Ouverture** | la jauge est **pleine au début du combat**, puis se recharge lentement | une grosse frappe dès le premier tour | initiative |
| ⚰️ **Moisson** | chaque monstre tué pendant un donjon | le combat suivant commence avec un bonus de dégâts | exécution |

**Phénix** et **Second souffle** (aujourd'hui des effets légendaires de relique) restent des
pouvoirs **déclenchés par une condition**, sans jauge : ce sont des filets de sécurité.

#### Le pouvoir de chaque voie (la relique de son set)

| Voie | Pouvoir de sa relique | Pourquoi |
| --- | --- | --- |
| 💥 Berserker | 🔥 Brasier | plus il perd de PV, plus il frappe fort |
| 🛡️ Gardien | 🛡️ Rempart vengeur | il bloque les coups et les rend d'un seul coup |
| 🗡️ Assassin | 🎯 Coup fatal | le critique qui achève |
| 🩸 Vampire | 🩸 Festin | le soin en trop devient une arme |
| 🪨 Colosse | 🧱 Carapace | il encaisse et se renforce |
| 🤺 Duelliste | 🤺 Riposte parfaite | parer, puis punir |
| 🌵 Épineux | 🌵 Éclat de ronces | les épines accumulées explosent |
| 🌀 Frénétique | 🌀 Tempête | l'élan qui déborde en rafale |

Ça fait **14 pouvoirs** : 8 pour les voies et 6 autres (Contre-temps, Source, Ouverture,
Moisson, Phénix, Second souffle). Une relique trouvée en dehors d'un set tire un pouvoir
au hasard parmi les 14. Une relique de set a toujours le pouvoir de sa voie.

Ce découpage a un effet voulu : la relique de set **pousse à porter les stats qui la
chargent**. Le Rempart vengeur du Gardien ne vaut rien sans blocage, le Festin du Vampire
sans vol de vie. La voie choisie oriente donc aussi ce qu'on cherche sur l'armure et
l'arme, sans qu'aucune règle ne l'impose.

⚠️ **Contrepartie à mesurer** : un pouvoir lié à une stat vaut **presque rien sans cette
stat**. Si les drops ne donnent pas assez souvent la stat qui charge, la relique de set
devient une mauvaise pièce. Chaque pouvoir doit donc être mesuré **deux fois** : avec un
build qui a la stat, et avec un build moyen.

### Questions ouvertes

1. **L'armure a une stat de soutien de trop** (5 candidates pour 4 places). Soit on retire
   la résistance aux critiques, soit on accepte 7 stats sur l'armure.
2. **Parade** : faut-il qu'un boss y résiste (l'étourdissement ne marcherait qu'un tour sur
   deux contre lui, par exemple), ou que ce soit la même règle pour tout le monde ?
3. **La jauge conservée d'un combat à l'autre** en donjon : d'accord ?
4. **Les 14 pouvoirs** : lesquels tu retires, lesquels tu ajoutes ?

---

## Partie 4 — passer de 4 à 7 emplacements

Proposition : **arme · armure · bouclier · casque · bottes · anneau · relique**, en plus du
familier et du trophée qui ne changent pas. Neuf pièces portées au total.

### Ce que ça permet

Chaque objet peut avoir des stats qui lui correspondent, avec moins de stats par objet.
Avec quatre emplacements, l'armure devait tout porter : PV, réduction, blocage, parade,
épines. Sur sept, chaque objet a un rôle clair.

| Emplacement | Stats principales | Stats de soutien | Rôle |
| --- | --- | --- | --- |
| ⚔️ **Arme** | dégâts · dégâts critiques | élan · vol de vie · exécution · précision | le coup porté |
| 🥋 **Armure** | PV · réduction | épines · régénération | encaisser |
| 🛡️ **Bouclier** | blocage · réduction | parade · riposte · épines | arrêter le coup |
| ⛑️ **Casque** | PV · résistance aux critiques | initiative · découverte d'objets | protéger, voir venir |
| 🥾 **Bottes** | esquive · initiative | vitesse d'attaque (faible) · régénération | le jeu de jambes |
| 💍 **Anneau** | chance de critique · rage | or · découverte d'objets · dressage des familiers | bonus indirects |
| 🔮 **Relique** | **un pouvoir** (Partie 3) | aucune | l'attaque spéciale |

**4 à 7 stats par emplacement**, contre 6 visées dans la Partie 3. Ça suffit : avec sept
emplacements, c'est l'ensemble de l'équipement qui fait la variété, plus un objet isolé.
**Aucune stat n'est sur plus de 2 emplacements.** Les stats plafonnées sont réparties sur
des emplacements différents : critique (anneau), esquive (bottes), réduction (armure et
bouclier, qui partagent le même plafond de 50 %).

### Ce que ça coûte

#### 1. La puissance du héros

Trois emplacements de plus, c'est trois objets de plus, donc plus de puissance. Trois façons
de le gérer :

- **(A) Garder la même puissance totale** : chaque objet vaut 4/7 de sa valeur actuelle.
  ⚠️ Une arme que tu possèdes déjà serait plus forte que toutes les nouvelles armes, et plus
  aucun drop ne la remplacerait. **Déconseillé.**
- **(B) Les 4 emplacements actuels gardent leur valeur, les 3 nouveaux valent la moitié**
  (bouclier, casque, bottes à ~0,5). La puissance totale de l'équipement monte d'environ
  +35 %, et on recalibre la difficulté (`gearExpect`, `bossGearExpect`, tables de
  renfort) d'autant, après mesure. **Recommandé.**
- **(C) Les 7 emplacements valent pareil** : +75 % de puissance, une recalibration plus
  lourde, et le bouclier vaudrait autant que l'arme.

**Au moment du changement, les trois nouveaux emplacements sont vides.** Avec la
recalibration de (B), les joueurs seraient plus faibles tant qu'ils ne les ont pas remplis.
La solution : **donner une pièce de départ par nouvel emplacement** au premier chargement,
au rang du joueur et avec un jet moyen. On repart au même niveau sans farmer, et les drops
remplacent ensuite ces pièces.

#### 2. Les sets

Aujourd'hui un set compte **4 pièces**, une par emplacement, avec des bonus à 2, 3 et 4
pièces. Le code considère qu'un set est complet quand il couvre tous les emplacements
(`SLOTS.length`), donc ça ne s'adapte pas tout seul. Deux options :

- **(a) Un set garde 4 pièces**, qui peuvent tomber sur **n'importe lequel des 6
  emplacements** (la relique porte le pouvoir de sa voie, voir la Partie 3). Tu choisis
  tes 4 pièces et il te reste 2 emplacements pour des drops ou des objets légendaires.
  Ça colle à la fin de partie prévue, qui mélange set de voie et légendaires, et les
  **bonus de set actuels restent valables**. **Recommandé.**
- **(b) Un set passe à 6 pièces**, avec des bonus à 2, 4 et 6 pièces. Plus engageant, mais
  un set complet demande bien plus de temps et chaque bonus est à recalibrer.

#### 3. L'optimiseur

`bestGearLoadout` teste **toutes les combinaisons** avec **4 boucles imbriquées**, une par
emplacement. Il prend déjà environ 3 s sur un vrai sac (mesuré en v0.742). Avec 7
emplacements, il y aurait **7 boucles imbriquées**, soit des milliers de fois plus de
combinaisons : **impossible de le garder tel quel.** Il faut passer à une amélioration
emplacement par emplacement, lancée depuis plusieurs équipements de départ. Ce mécanisme
existe déjà : c'est la passe finale d'amélioration locale de la v0.741. On garde la
garantie qu'aucun échange d'un seul objet ne peut améliorer le résultat. On perd la
garantie d'avoir trouvé la meilleure combinaison parmi tous les candidats. Il faut mesurer
l'écart et le temps de calcul.

#### 4. Les drops

L'emplacement d'un objet est tiré au hasard. Il y aurait 6 emplacements à tirer au lieu
de 4 (la relique a son propre tirage), donc chaque emplacement recevrait **environ ⅔ des
objets qu'il reçoit aujourd'hui**, et un équipement complet demanderait plus de temps.
Soit on l'accepte, soit on augmente un peu le nombre de drops. À mesurer avec le test déjà
en place sur la durée d'un rang (v0.894 : les 4 emplacements atteignent ton rang vers le
milieu du rang).

#### 5. Les effets légendaires

Les 14 effets sont répartis sur les 4 emplacements sans qu'un effet soit sur deux
emplacements, pour qu'un set complet ait toujours 4 effets différents. Il faut les
répartir sur 6 emplacements, deux ou trois chacun. Presque rien n'est à écrire : il suffit
de déplacer **Égide** et **Riposte affûtée** sur le bouclier, **Endurance** sur le casque
et **Initiative** sur les bottes.

#### 6. Les objets déjà possédés : presque aucune migration

**On garde les identifiants actuels** (`weapon`, `armor`, `accessory`, `relic`) et on
**ajoute** `shield`, `helmet` et `boots`. **L'accessoire devient l'anneau** : seul son nom
change. Les objets déjà possédés restent valides, **sans migration de données**. Les
réserves de set (en JSON) acceptent les nouveaux emplacements, qui commencent vides. Seule
la relique change vraiment (Partie 3).

#### 7. L'écran

- **La grille d'équipement** passe de 4 à 7 cases, plus le familier et le trophée. À
  vérifier sur le Z Fold plié (344 px) : 3 × 3 tient.
- **L'avatar** doit dessiner le **bouclier**, le **casque** et les **bottes**
  (`AventureAvatar.vue`). C'est ce qui rend le changement visible, et c'est un vrai
  travail de dessin SVG.
- **L'apparence du héros vue par les amis** (`heroLook`) doit inclure les nouveaux
  emplacements.
- L'**équipement des aventuriers** a ses propres emplacements et n'est pas concerné.

### Volume de travail

Ce chantier inclut tout le reste : les stats par emplacement, les nouvelles stats et la
relique à pouvoir. Mieux vaut tout faire dans le même chantier : sinon il faudrait
rééquilibrer deux fois.

| Étape | Estimation |
| --- | --- |
| Types, emplacements, tirage des drops, stats par emplacement, pièces de départ | 1 j |
| Nouvelles stats dans le moteur de combat (dégâts critiques, blocage, parade, riposte, esquive, résistance aux critiques, précision) | 1 à 1,5 j |
| Relique à pouvoir (jauge, 14 pouvoirs, animation) | 2 à 3 j |
| Sets sur 6 emplacements, nouvelle répartition des légendaires | ½ j |
| Nouvel optimiseur, avec mesure du temps et du résultat | 1 j |
| Écran : grille, avatar (bouclier, casque, bottes), fiches | 1 à 1,5 j |
| Mesures et recalibration (puissance, donjons, boss, Labyrinthe, sets, voies, drops) | 2 j |
| **Total** | **9 à 11 jours** |

**Découpage conseillé** : chaque étape peut être livrée seule sans casser le jeu.

1. **Les 7 emplacements et les stats par emplacement**, avec seulement les stats qui
   existent déjà, plus les pièces de départ. Puis mesure et recalibration.
2. **Les nouvelles stats**, par lots, chacune mesurée.
3. **La relique à pouvoir.**

### À décider

1. **Puissance** : option (B), avec des emplacements secondaires à moitié de valeur et des
   pièces de départ ?
2. **Sets** : 4 pièces sur n'importe quel emplacement (a), ou 6 pièces (b) ?
3. **Drops** : accepter qu'un équipement complet prenne plus de temps, ou augmenter le
   nombre de drops ?
4. **Le tableau des stats**, surtout le casque et les bottes, qui sont les moins évidents.
