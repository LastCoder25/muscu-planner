# Ascension des champions, progression et éveil de leurs objets

**Date** : 2026-09-21 · **Statut** : spec validée en discussion, à implémenter · **Base** : `origin/main` v0.1004

## Décisions (prises avec l'utilisateur le 2026-09-21)

| #   | Sujet                   | Décision                                                                                                                                    |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ascension des champions | L'XP d'un champion s'arrête au **★5 d'un rang**. Passer au ★1 du rang suivant demande une **ascension** payée en **or + sceaux de rang**.   |
| 2   | Ascension des objets    | Même principe, avec des **sceaux d'objet**, distincts de ceux des champions.                                                                |
| 3   | Niveau des objets       | Gagné **en combattant** avec le champion qui les porte (patron du dressage des familiers), jamais avec une ressource.                       |
| 4   | Éveil des objets        | Par **fusion manuelle** de doublons. Automatique **seulement** pour un objet destiné à un seul champion (arme signature des S, roadmap P4). |
| 5   | Re-mesure               | Convois, sièges, camps et failles re-mesurés après les quatre points ci-dessus.                                                             |
| 6   | Pas de jet              | Les objets de champion n'ont **plus de jet**. Seuls les objets du héros en gardent un. Les deux gestions sont séparées.                     |
| 7   | Source unique           | Les objets de champion ne viennent **que du tirage gacha**. Sièges, embuscades et camps ne donnent plus que des objets du héros.            |

## Le modèle d'un objet de champion

| Attribut         | À l'obtention   | Évolution                                                     |
| ---------------- | --------------- | ------------------------------------------------------------- |
| **Rareté** B/A/S | tirée au gacha  | ne change jamais                                              |
| **Rang**         | celui du joueur | ascension (sceaux d'objet + or)                               |
| **Étoiles**      | ★1              | XP gagnée avec le champion ; bloquée à ★5 jusqu'à l'ascension |
| **Éveil**        | 0               | fusion manuelle d'un doublon (auto pour l'arme signature)     |

Même échelle de rang et d'étoiles que le héros et les champions (`characterRank`, un rang = 10 niveaux,
une étoile = 2 niveaux) : un seul langage de progression dans tout le jeu.

### Stats fixes par modèle

Aujourd'hui les stats d'une pièce sont **tirées** dans le pool de sa lignée : deux « Lame du Serment »
peuvent différer. Un doublon n'a de sens que si les exemplaires sont identiques. Chacun des
72 modèles (`src/data/advGearModels.ts`, lignée × emplacement × lettre) reçoit donc ses **affixes
écrits** (type d'effet, 1 à 2 selon la lettre, rôle civil éventuel). La valeur :

```
valeur = effectBase(type) × RARITY_MULT[rang] × itemLevelMult(niveau) × GEAR_GRADE_SHARE[lettre]
         × awakenMult(éveil) × ADV_GEAR.k
```

- `rankRollMult(rang, jet)` est remplacé par `RARITY_MULT[rang]` (le plancher du rang, jet = 0).
- Le niveau se lit par `itemLevelMult`, le 3ᵉ axe déjà employé par les objets du héros.
- ⚠️ `ADV_GEAR.k` est à re-mesurer (§ Calibration) : retirer le jet baisse la valeur moyenne
  (jet moyen ≈ 0,3), et ajouter niveau + éveil la relève.

### Migration des pièces existantes (sans migration SQL)

`normalizeAdvGearState` (idempotente) relit chaque pièce du stock :

- `roll` ignoré puis retiré ;
- affixes remplacés par ceux de son modèle (la pièce garde lignée, emplacement, lettre, rang) ;
- `level` repart au **plancher du rang** (★1) — le niveau d'objet actuel est tiré, pas gagné ;
- `awaken` = 0.

⚠️ Une pièce peut donc changer de stats au chargement. Le rapport de puissance avant/après
est mesuré sur les 4 comptes réels avant livraison ; si un compte perd plus de ~10 % de
puissance d'escorte, on compense en fixant le niveau d'objet de départ à la moyenne de l'ancien.

## 1. Ascension des champions

- `grantAdvXp` ne fait plus franchir la fin d'un rang : au niveau `rankEndLevel(rang)` (10, 20, …),
  le niveau s'arrête et **l'XP excédentaire est conservée** (règle v0.726 déjà en place au plafond
  du Panthéon). L'annonce de mission dit « ★★★★★ — prêt pour l'ascension ».
- `ascendChampion(adv)` (store) : vérifie le coût, débite, passe au niveau suivant, puis reverse
  l'XP en attente.
- **Plafond** : toujours le niveau du héros (décision 10 de la roadmap gacha) — on ne peut pas
  ascensionner au-delà du rang du joueur.
- **Coût** : `or + N sceaux du rang VISÉ`. N croît avec le rang (proposition : 2, 3, 4, 5, 6, 8, 10, 12, 15
  pour Argent → Tout-puissant), l'or suit la courbe d'un niveau de bâtiment divisée par ~4
  (même dénominateur que `goldSink`). **À mesurer** : une ascension ≈ ½ à 1 journée de revenu.

### Sceaux de rang (champions)

- Tombent du **gardien d'une faille refermée**, au rang de la faille (1 à 2 sceaux).
- Une faille porte déjà un rang tiré entre Bronze et celui du joueur : une ascension vers Or
  demande des sceaux d'Or, donc une faille Or. « Laquelle je referme ? » gagne un enjeu.
- Le sport reste le plafond : aucune faille n'est au-dessus du rang du joueur.
- **À mesurer** : sceaux/semaine au rythme « une faille par jour » vs coût d'une ascension, pour
  qu'un rang de champion prenne l'ordre de grandeur d'un rang de héros (~10 niveaux).

## 2. Ascension des objets

- Même règle : le niveau d'un objet s'arrête au ★5 de son rang ; `ascendAdvGear(pièce)` le fait
  passer au rang suivant en **gardant son éveil**.
- **Plafond** : le rang de l'objet ne dépasse pas celui du champion qui le porte (règle
  `canWearAdvGear` actuelle) ; une pièce au stock ne peut pas monter au-delà du champion le plus
  avancé de sa lignée.
- **Coût** : `or + N sceaux d'objet du rang visé`, N plus bas que pour un champion (4 objets par
  champion : proposition ÷2).

### Sceaux d'objet

- Tombent des **boss de palier** (1 par victoire, 2 à la première victoire), au rang du boss
  plafonné à celui du joueur. Chaque système a ainsi sa source.
- Colonne jsonb additive `characters.seals` `{ champion: {rang: n}, gear: {rang: n} }`,
  affichée au plateau de ressources (une devise qu'on dépense sans voir son solde, cf. v0.735).

## 3. XP des objets

- Un objet **porté** gagne une part de l'XP de son champion à chaque gain : convois, camps,
  failles, défense (tous passent par `grantAdvXp` — un seul point d'entrée à modifier).
- Proposition : 100 % de l'XP du champion, sur la même courbe (`advXpToNext`) — l'objet suit
  alors son porteur, sans jamais le dépasser (plafond = niveau du champion).
- Un objet changé de porteur garde son niveau.

## 4. Éveil des objets

### Fusion manuelle (objets de lignée)

- Doublon = **même modèle** (lignée × emplacement × lettre).
- Stock de la Guilde : une pièce qui a des doublons libres affiche **« ✨ Éveiller (N) »**.
- Consomme **un** exemplaire du même modèle, **jamais une pièce portée ni 🔒**.
- **L'exemplaire gardé est le plus avancé** (rang puis niveau), désigné d'office ; son éveil
  prend `max(éveils) + 1` pour ne jamais perdre un cran déjà gagné sur l'autre.
- **5 crans max**, `+8 %` par cran (barème `AWAKEN.perStep` des champions).
- Au-delà : le doublon rapporte des **éclats** (roadmap P3). En attendant P3, le bouton ne
  propose pas la fusion d'un objet déjà à 5.

### Éveil automatique (arme signature, roadmap P4)

- Une arme par champion S : un doublon tiré l'éveille aussitôt, comme un doublon de champion
  (`grantChampion`).

## 5. Retraits

- **Jet** : `roll` retiré d'`AdvGear`, de `rollAdvGear`, `advGearValue`, `advGearRoleValue`,
  `advGearSellValue`, `capAdvGearToWearable`.
- **Drops** : `rollAdvGearDrop` et `ADV_GEAR_DROP` supprimés, ainsi que leurs appels dans
  `raid.ts` (corps de siège), `caravan.ts` (embuscades), `camp.ts` (butin sans héros) et le store.
  ⚠️ Le butin d'un camp sans le héros perd sa part d'équipement : il ne reste que l'or (et les
  pierres pour les morts-vivants) → `campEconomy` à re-mesurer.
- **Forge morte** : `outfitFromItem`, `planOutfitBatch`, `outfitOptions`, `outfitGoldCost`,
  `outfitRank`, `outfitSlot`, `settleOutfit`, `nextForgeUntil`, `AdvGearState.forges` et les
  actions du store (plus d'écran depuis la fusion du Panthéon).
- La roadmap P6 (« pièces de lignée sur les camps et les failles ») est **annulée** ; seule la
  boutique d'éclats (P3) reste une seconde source, toujours issue du gacha.

## 6. Calibration à refaire

Mesures sur les vraies libs (sondes jetables, chiffres dans les commits) :

1. **Étalon de route** (`refAdvGear`, `refChampions`) : l'escorte de référence porte des pièces B
   à niveau attendu, éveil 0. Bandes d'embuscade (1 → 0 %, 2 → faible, 3 → pari, 4 → quasi sûr).
2. **Sièges** : tenue à enceinte pleine et à 75 %, niveaux 12/28/50/80.
3. **Camps** : un groupe de la bonne taille gagne ~0,7-0,9, un de moins ~0,3-0,6.
4. **Failles** : faille mûre fermée ~0,70 par le groupe de référence.
5. **Or** : ascensions (champions + objets) dans `goldSink` — la part du plafond atteinte sur un an
   doit rester dans 55-90 %.
6. **Sceaux** : rythme d'ascension ≈ rythme de rang du héros.

## Découpage

| Étape | Contenu                                                                    | Estimation |
| ----- | -------------------------------------------------------------------------- | ---------- |
| A     | Retraits (jet, drops, forge) + stats fixes par modèle + migration du stock | ~½ j       |
| B     | Ascension des champions + sceaux de champion (failles) + colonne `seals`   | ~½ j       |
| C     | XP et étoiles des objets + ascension des objets + sceaux d'objet (boss)    | ~½ j       |
| D     | Éveil manuel des objets (Guilde)                                           | ~¼ j       |
| E     | Re-mesures et recalibrage                                                  | ~½ j       |

Chaque étape passe les 5 portes (typecheck, lint, tests, build, smoke) et se pousse seule.

## Points laissés à la mesure

- Nombre de sceaux par ascension et part d'or.
- Part de l'XP du champion reversée à l'objet (100 % proposé).
- `ADV_GEAR.k` après retrait du jet et ajout du niveau + éveil.
