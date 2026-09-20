# Ce qui est intégrable des gachas — étude

**État : ÉTUDE, rien n'est implémenté.** Demandé par l'utilisateur : « voir ce qui est
intégrable des gâcha sur l'app et qui va avec ce qu'on a mis ».

⚠️ **CETTE ÉTUDE NE PROPOSE PAS UNE LISTE DE MÉCANIQUES.** Trois mesures, faites avant
d'écrire une ligne, recadrent la question — et deux d'entre elles contredisent ce que
j'allais proposer. Elles sont en tête ; le tri des mécaniques en découle.

---

## Ce qui est DÉJÀ en place — à ne pas redemander

| Mécanique du genre                 | Où elle vit                               | Depuis |
| ---------------------------------- | ----------------------------------------- | ------ |
| Pity double (grand + plancher)     | `GACHA.hardPity/softPityStart/minorPity`  | v0.937 |
| Pity **persisté**                  | `characters.gacha` (migr. 0081)           | v0.950 |
| Taux affichés, dérivés de la table | `gachaOdds`                               | v0.966 |
| Tirage **offert** quotidien        | `claimDailyLogin` + `dailyFreeMana`       | v0.950 |
| Éveil par doublons (C0→C6)         | `AWAKEN`, `awakenLevel`                   | v0.939 |
| Copie de trop **jamais perdue**    | `OVERFLOW_MANA` (55 💠)                   | v0.950 |
| Roulette de révélation             | `gachaReveal.ts` + `GachaReveal.vue`      | v0.960 |
| Lot de ×10, une seule roulette     | `multiPullCost` (9 payés pour 10)         | v0.968 |
| Galerie de collection (Codex)      | `codex.ts`, 32 entrées, ❔ pour l'inconnu | v0.953 |

C'est déjà l'essentiel du socle d'un gacha moderne. **Ce qui manque n'est donc pas une
brique standard** — c'est ce que les trois mesures ci-dessous désignent.

---

## ⚠️ MESURE 1 — LE GACHA N'EST PAS SATURÉ, IL N'EST PAS COMMENCÉ

Relevé **en base**, sur les quatre comptes réels, le 2026-09-20 :

| Compte | 💠 mana | Champions | Tirages |
| ------ | ------- | --------- | ------- |
| Last   | 342     | **12**    | 30 ¹    |
| Cypher | 0       | 5         | 5       |
| Mimi   | 110     | **0**     | **0**   |
| Knat   | 0       | **0**     | **0**   |

¹ dont **16 conservés au wipe** (v0.951) — soit ~14 tirages réels.

⚠️ **DEUX COMPTES SUR QUATRE N'ONT JAMAIS TIRÉ**, et Mimi porte **exactement 110 💠** :
un tirage offert, jamais dépensé. C'est **le même constat que l'étude des quêtes hebdo**
(v0.955) : le trou n'est pas l'effort ni la malchance, c'est la **DÉCOUVERTE**.

**Conséquence directe sur le tri** : toutes les mécaniques du genre qui visent « j'ai
beaucoup tiré et je n'ai pas eu ce que je veux » (bannière focus, 50/50, spark, échange
ciblé) **répondent à un problème que personne n'a encore ici**. Les ajouter maintenant,
c'est meubler une pièce où personne n'est entré.

---

## ⚠️ MESURE 2 — IL SATURE VERS 6 MOIS, ET LA COLLECTION SE BOUCLE EN UN AN

Simulé sur le vrai tirage (`pullChampion`, pity compris), au débit de mana mesuré en
v0.936 (63 💠/j au niveau 12), tirage offert et lots compris, **conversion recréditée** :

| Échéance | Champions obtenus | Au **C6** | Part des tirages **convertis** |
| -------- | ----------------- | --------- | ------------------------------ |
| j+30     | 20,7 / 32         | 0,4       | 0 %                            |
| j+90     | 28,0 / 32         | 9,4       | **18 %**                       |
| j+180    | 30,6 / 32         | 17,4      | **45 %**                       |
| j+365    | 31,8 / 32         | 22,9      | **68 %**                       |
| j+730    | 32,0 / 32         | 28,5      | **82 %**                       |

Au niveau 60 c'est plus rapide encore : **37 % convertis dès j+90**, 78 % à un an.

⚠️ **À six mois, un tirage sur deux ne donne plus rien qu'un demi-remboursement.** À deux
ans, quatre sur cinq. **Le gacha a une date de péremption mesurée**, et elle tombe dans
l'horizon d'usage de cette app.

⚠️ **Ce n'est pas un défaut de calibrage, c'est une propriété du ROSTER** : 32 champions ×
7 copies utiles = **224 copies utiles en tout**, pour ~600 tirages la première année.

---

## ⚠️ MESURE 3 — LA CONVERSION DES COPIES DE TROP DOUBLE LE DÉBIT, ET CASSE LA BANDE

`OVERFLOW_MANA` rend la moitié du prix d'un tirage quand l'Éveil est plein — et cette
mana **retourne dans la loterie** (vérifié : `character.ts`, `mana: cur.mana - cout +
manaBack`). Donc **plus on est saturé, plus on tire, plus on sature** : une boucle
positive que personne n'avait mesurée.

Raretés **maximales par an** — la cible documentée (v0.937) est **10 à 20 sur la plage
réaliste, niveaux 12 à 60** :

| Niveau | À l'unité, sans conversion | En lots, sans conversion | En lots, **avec conversion** |
| ------ | -------------------------- | ------------------------ | ---------------------------- |
| 12     | 11,4                       | 12,5                     | **22,9**                     |
| 30     | 13,4                       | 14,9                     | **28,0**                     |
| 60     | 17,9                       | 19,6                     | **39,0** ❌                  |
| 100    | 24,0                       | 26,7                     | 54,2                         |

✅ **LE LOT ×10 N'Y EST POUR RIEN** : sans la conversion il donne 19,6 au niveau 60, sous
le plafond de 20 — exactement ce que la v0.968 avait mesuré (19,9 à 10 % de remise ; le
harnais concorde, ce qui valide les deux). **C'est la conversion qui double le débit, et
elle date de la v0.950 — jamais re-mesurée depuis.**

⚠️ **Rien de tout ça n'est cassé pour le joueur** : le mana n'a qu'un puits, donc « trop de
tirages » ne déborde sur aucune autre économie. Ce qui est faux, c'est **la phrase écrite
dans `gacha.ts`** (« la bande que la spec vise, tenue sur toute la plage réaliste ») :
elle décrit un modèle sans conversion, qui n'est plus le jeu.

---

## ⚠️ CE QUE J'ALLAIS PROPOSER, ET QUE LA MESURE A ÉCARTÉ

**« Agrandir le roster repousse le mur »** — **FAUX, mesuré.** La règle d'extension du
projet (par le HAUT uniquement) ne déplace quasiment pas la part de tirages convertis :

| Roster (par rareté, du commun au primordial) | Convertis à 6 mois | Au C6 à 2 ans    |
| -------------------------------------------- | ------------------ | ---------------- |
| **actuel** 4·4·4·4·4·4·4·4 (32)              | 67 %               | **32 / 32** ❌   |
| pyramide douce 3·3·4·4·5·6·7·8 (40)          | 68 %               | 38,8 / 40        |
| pyramide du genre 2·3·4·5·7·9·12·14 (56)     | 66 %               | 44,5 / 56        |
| haut seulement 4·4·4·4·8·12·16·20 (72)       | **63 %**           | **46,9 / 72** ✅ |

⚠️ **La saturation vient du BAS, et le bas est interdit d'extension.** Commun +
inhabituel + magique = **73 % des tirages** : un commun sur un pool de 4 atteint son C6
en quelques dizaines de tirages quoi qu'on écrive en haut. Multiplier le roster par 2,25
ne gagne que **4 points** de conversion.

✅ **MAIS la même mesure sauve la proposition par l'autre bout** : ce qui bouge
énormément, c'est **ce qu'il RESTE à faire**. Roster actuel → **tout est C6 à deux ans** ;
à 72 champions il en reste **25 à monter**. Pour le joueur, c'est ça qui compte — pas le
pourcentage de conversion.

---

## Le tri : trois familles

### 🟢 Famille A — ne touchent NI le rythme NI l'équilibrage (gratuites)

| Mécanique                             | Ce qu'elle apporte ici                                                               | Coût |
| ------------------------------------- | ------------------------------------------------------------------------------------ | ---- |
| **Vitrine de champion sur le profil** | La collection devient **visible par quelqu'un** — les amis et le classement existent | Bas  |
| **Historique des derniers tirages**   | Lisibilité pure ; `pulls` existe déjà dans `characters.gacha`                        | Bas  |
| **Filtres / tri du Codex**            | Chercher « ce qu'il me manque » quand le roster grandira                             | Bas  |

⚠️ **La vitrine a déjà son patron** : `friend_boss_members.look` (v0.873) publie un
instantané d'apparence pour contourner le fait que `characters` est own-only. **Aucune
policy nouvelle à écrire**, c'est le même geste.

### 🟡 Famille B — **accélèrent l'obtention**, donc rapprochent le mur

| Mécanique                     | Verdict                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| **Bannière focus (rate-up)**  | ⚠️ Répond à un problème que personne n'a (mesure 1) **et** avance la saturation (mesure 2)       |
| **Spark / plafond de poisse** | ⚠️ Inutile ici : un primordial **précis** tombe en **159 tirages médians** — ~3 mois, pas un mur |
| **Échange de doublons ciblé** | ⚠️ Séduisant, mais à 1 an on a **31,8/32 champions** : il n'y a plus rien à cibler               |
| **Garantie « nouveau »**      | ⚠️ **TUE l'Éveil**, qui EST la valeur des doublons. Au mieux : « le PREMIER d'une rareté »       |

⚠️ **À n'ouvrir qu'APRÈS avoir repoussé la fin de la collection** — sinon on accélère
l'arrivée à un endroit où il n'y a rien.

### 🔴 Famille C — écartées, et pourquoi

| Mécanique                              | Pourquoi elle n'a pas d'objet ici                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| **Bannière LIMITÉE dans le temps**     | **Punit l'absence** — interdit par la règle 1 des sièges, tenue partout dans le projet  |
| **50/50 sur le focus**                 | Existe pour **vendre** de la frustration ; sans argent réel, c'est de la frustration    |
| **Packs, passe payant, cadeaux datés** | **Aucun argent réel** dans cette app                                                    |
| **Bannière débutante à prix cassé**    | Redondante : le tirage offert fait **64 % des tirages** au niveau 12 (v0.950)           |
| **Montée de rareté par fusion**        | **Tranché NON** (spec v0.949 : la rareté est figée, c'est le rang qui monte)            |
| **Gacha d'équipement**                 | **Tranché NON** — l'équipement vient du farm (drops-only gear, v0.556)                  |
| **Missions / passe de progression**    | **Doublon avec l'étude quêtes hebdo** (v0.955), qui a déjà tranché le sujet             |
| **Champion d'ami en renfort**          | Touche le COMBAT, donc sièges + camps + convois : chantier de calibration, pas un ajout |

---

## ⚠️ LE VRAI SUJET : LE MANA N'A QU'UN PUITS, ET CE PUITS SE FERME

Quand tout est C6, le mana continue d'entrer (les failles tournent) et **n'achète plus
rien** — chaque tirage rend la moitié de son prix, indéfiniment. Dans le vocabulaire de ce
projet, c'est le chemin vers une **devise morte** : une devise dont le puits a disparu.
Le projet a déjà payé ce défaut deux fois (poussière ✨, parchemins 📜).

**Cinq destinations possibles pour le surplus** — aucune n'est recommandée ici, c'est une
décision de conception :

1. **Écrire des champions au fil du temps** (la réponse du genre). Ne change pas la
   conversion (mesuré : −4 points) mais repousse **la fin de la collection**, qui est ce
   qui compte. ✅ La règle d'extension par le haut est **déjà écrite** pour ça.
2. **Plus de crans d'Éveil** au-delà de C6, barème dégressif. ⚠️ Deux tests bornent
   l'Éveil à **un cran de rareté** : les dépasser rouvrirait « à Éveil égal la rareté
   gagne toujours », qui préserve le tirage.
3. **Le surplus achète autre chose** qu'un tirage. ⚠️ Tous les candidats (clés, pierres
   d'invocation, ferraille) ont un **débit mesuré et borné par un test** : ce serait un
   robinet de plus sur une économie calibrée.
4. **Le surplus ne rend rien.** Casse « un tirage n'est jamais perdu », la promesse que
   `OVERFLOW_MANA` existe pour tenir.
5. **Assumer la fin** : collection complète → le bouton le dit, le mana cesse d'être
   proposé. ⚠️ Honnête, mais il faut alors **fermer aussi le robinet** côté failles,
   sinon on produit une devise que rien ne consomme.

---

## Trois questions pour l'utilisateur

1. **La bande de débit** (10–20 raretés maximales/an) est dépassée d'un facteur ~2 par la
   conversion. **On la restaure** (en baissant `OVERFLOW_MANA`, ou en ne recréditant pas
   en mana) **ou on l'élargit** en actant que la conversion en fait partie ?
2. **La fin de collection à ~1 an** : on l'accepte, ou on écrit d'autres champions ?
   (⚠️ c'est la seule réponse mesurée qui repousse vraiment ce qu'il reste à faire.)
3. **Parmi la famille A** (gratuites en équilibrage), laquelle vaut le coup — la
   **vitrine de champion** chez les amis est la plus porteuse, et elle a déjà son patron.

---

## Ce qui n'a PAS été mesuré, et qu'il faudrait mesurer avant d'implémenter

- **L'effet d'une baisse d'`OVERFLOW_MANA`** sur le sentiment « un tirage n'est jamais
  perdu » — c'est une question de ressenti, pas de chiffre.
- **Le coût réel d'écrire un champion** (kit + Éveil + équilibrage des signatures) : la
  v0.939 l'estimait à ~64 lignes pour 32 champions, jamais vérifié à l'échelle d'un ajout
  isolé.
- **Le rythme des failles** si le mana cessait d'avoir un puits : le débit est calibré
  (`riftManaDebit.test`) **en supposant** que tout part dans le gacha.

---

## Méthode

Toutes les mesures sont faites par des sondes jetables branchées sur les **vraies
fonctions** (`pullChampion`, `pullRarity`, `createMap`/`advanceWorld`/`riftClearMana`,
`harvestYield`), supprimées après usage — les chiffres vivent ici. Le relevé des comptes
est une lecture en base via la Management API.

⚠️ **Une sonde fausse a été corrigée en chemin** : la première version « en lots »
dépensait le mana dès 110 💠, si bien que le seuil du lot (990) n'était **jamais atteint**
et que la branche mesurait des tirages à l'unité. Elle annonçait « le lot ne change
rien » (11,4 contre 11,4) — un résultat identique à la décimale près est un signal de
sonde cassée, pas une découverte.
