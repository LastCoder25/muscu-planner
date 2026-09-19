# Failles — étude de conception

**État : ÉTUDE, rien n'est implémenté.** Quatre décisions prises avec l'utilisateur le
2026‑09‑19, les mesures qui les encadrent, et ce qui reste à trancher.

## L'intention

> « La faille est un monde ouvert, donc le boss doit être défait pour fermer la faille.
> Le héros devra explorer la faille et combattre des monstres jusqu'à croiser le boss. »

## Décisions prises

1. **Deux modes DISTINCTS** — la faille ne remplace pas le Labyrinthe.
2. **Les sets EN PLUS** — les boss de palier gardent leur pièce garantie.
3. **Une faille ouverte MENACE LA BASE** — c'est ce qui donne un sens à « fermer ».
4. **Elle apparaît sur la CARTE D'EXPÉDITION**, comme un lieu.

## ⚠️ Ce qui sépare une faille du Labyrinthe

C'est LA question de cette feature : sans réponse nette, on obtient deux fois le même
mode sous deux noms. Le Labyrinthe fait déjà « explorer → combattre → boss au bout ».

|                  | **Labyrinthe** (existant)                      | **Faille**                                           |
| ---------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Espace           | grille de salles + couloirs, brouillard        | **zone ouverte**, aucune carte                       |
| Avancée          | on CHOISIT sa salle, on descend d'étage        | on **erre**, les rencontres s'enchaînent             |
| Le boss          | attend au dernier étage, profondeur **connue** | **surgit**, profondeur **incertaine**                |
| Déclenchement    | lancé à froid, par palier                      | **apparaît** — c'est un événement daté               |
| Tension          | « quelle salle j'ouvre, quand je repars »      | « jusqu'où je pousse avant qu'il sorte »             |
| Enjeu de l'échec | perte partielle du butin selon la profondeur   | la faille **reste ouverte** et la base reste menacée |

La différence de FEEL tient à une seule idée : au Labyrinthe on **décide** de son chemin,
dans une faille on **subit** une montée de tension. Deux formes de push‑your‑luck, pas la
même décision.

## Cycle de vie (proposé)

1. Une faille **apparaît** parmi les POI de la carte (spawn, expiration, distance et
   niveau dérivé de la distance : tout est déjà en place, cf. `expedition.ts`).
2. Tant qu'elle est ouverte, **les armées qui assiègent la base sont renforcées**.
3. On s'y rend, puis un **mode ACTIF** s'ouvre (à la différence d'un convoi, qu'on envoie).
4. On avance de rencontre en rencontre ; le boss finit par **surgir** (probabilité
   croissante, pas une profondeur fixe).
5. Le tuer **ferme** la faille. Repartir sans lui la laisse ouverte.

## Contraintes MESURÉES

### Le renfort de menace : ×1,3

Tenue d'un siège, enceinte à niveau, héros présent, vivier complet (150 sièges par case) :

| renfort            | niv 12 | 28     | 50     | 80     |
| ------------------ | ------ | ------ | ------ | ------ |
| ×1 (aucune faille) | 90     | 91     | 85     | 89     |
| ×1,15              | 70     | 83     | 67     | 74     |
| **×1,3**           | **53** | **71** | **52** | **51** |
| ×1,5               | 32     | 52     | 29     | 27     |
| ×2                 | 2      | 11     | 0      | 0      |

**×1,3** fait tomber la tenue de ~89 % à ~55 % : un vrai risque, jamais perdu d'avance, et
**plat selon le niveau** — la propriété qui autorise une valeur unique. ×1,5 punit trop,
×1,15 ne se sent pas.

### ⚠️ Le point d'accroche existe déjà

`rollRaid` pose un `threat` par groupe (`earlyThreatMult`), **figé AU TIRAGE**. Une faille
n'aurait qu'à le multiplier. Conséquence heureuse et à assumer : **fermer une faille
n'affaiblit pas une armée déjà en marche** — elle garde la force que la Tour de guet a
annoncée. Fermer agit sur les sièges SUIVANTS, ce qui se dit simplement : « ferme‑la avant
la prochaine armée ».

### ⚠️ La règle 1 des sièges doit tenir

« On ne perd jamais parce qu'on n'a pas ouvert l'app. » Une faille qui renforce les sièges
ne doit pas punir une absence. Deux garde‑fous, tous deux déjà dans le moteur :

- un POI **EXPIRE** (`expiresAt`) : ignorée, la faille disparaît d'elle‑même, et sa menace
  avec elle ;
- `advanceBase` **repousse l'échéance du siège pendant l'inactivité**, donc aucun siège
  renforcé ne s'accumule pendant une absence.

### ⚠️ Le cumul doit être borné

Mesuré : deux failles ouvertes à ×1,3 donneraient ×1,69 (≈ 30 % de tenue) et trois ×2,2
(0 %). Il faut **une seule faille à la fois**, ou **plafonner** le renfort (~×1,45).

## Récompenses

Les pièces de set viennent **EN PLUS** des trois sources existantes — aucune calibration
touchée :

| Source                    | Rythme                | Conditionnée par                                 |
| ------------------------- | --------------------- | ------------------------------------------------ |
| Boss de palier            | **garanti**           | pierres d'invocation (≈ 4 / nettoyage de donjon) |
| Labyrinthe                | ~25 % au trésor final | 1 à 4 clés selon le palier                       |
| Expédition idle (repaire) | occasionnel           | or + temps réel                                  |
| **Faille**                | à définir             | à définir                                        |

⚠️ À mesurer une fois le taux choisi : le rythme d'équipement de tout le jeu en dépend.

## Reste à trancher

- **Le coût d'entrée** : rien (le trajet suffit) ? de l'énergie ? une ressource dédiée ?
- **La forme de la montée en tension** : les monstres se renforcent à chaque rencontre, ou
  seule la probabilité d'apparition du boss monte ?
- **Ce qu'on perd en repartant** sans avoir tué le boss.
- **Le taux de pièce de set**, et la mesure du rythme d'équipement qui suit.
- **Une seule faille à la fois** ou plafond de menace.
- **Le rendu** : la carte d'expédition est un SVG ; une faille doit s'y voir du premier
  coup d'œil (et ⚠️ aucune porte ne regarde cet écran — banc jetable obligatoire).
