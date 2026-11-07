# Étude : le gacha des champions, comparé au genre — et ce qu'il faudrait changer

**Date** : 2026-09-21 · **Statut** : étude, rien d'implémenté · **Demandé par** l'utilisateur :
« une étude détaillée du fonctionnement des gacha, des bannières, des champions, armes, pity,
nombre de raretés… je pense qu'il faut changer pas mal de choses ».

Suite de deux études : `2026-09-19-gacha-design.md` (conception d'origine) et
`2026-09-20-gacha-integrable-design.md` (ce qui est intégrable, saturation mesurée).

---

## 1. En une page

Le socle est **conforme au genre sur ce qui compte le plus** : taux du sommet à 0,6 %, pity
dur à 90 avec montée dès 75, garantie tous les 10, compteur persisté, tirage offert quotidien,
lot ×10 remisé, doublons qui réveillent le champion.

Il s'en **écarte sur cinq points**, et ce sont eux qui donnent l'impression que « quelque chose
cloche » :

| # | Écart | Effet ressenti | Gravité |
|---|---|---|---|
| 1 | **8 raretés** là où le genre en tire **3** | un lot de 10 ressemble à un nuancier (5 couleurs), aucune n'est « le jackpot » ni « le fond » | haute |
| 2 | **Rareté ≠ rang**, et la rareté est **plafonnée par le niveau du joueur** | un Primordial tiré au niveau 5 « ne mène que du Bronze » : le jackpot ne se sent pas | haute |
| 3 | **La garantie tous les 10 donne trop** (45 % des garantis dépassent l'épique) | le haut de la pyramide arrive trop souvent, puis la collection s'épuise | moyenne |
| 4 | **Aucune bannière, aucun choix** | on ne vise rien : le gacha n'a ni direction ni événement | moyenne |
| 5 | **La copie de trop rend du mana** (55 💠) | le gacha s'alimente lui-même, débit ×2 mesuré, saturation vers 6 mois | haute |

Recommandation : **scénario B « refonte ciblée »** (§ 7) — 3 raretés de tirage, rang séparé,
une bannière vedette permanente qui tourne, une liste de souhaits, et les doublons de trop
convertis en **éclats** qui achètent un champion choisi (étincelle) au lieu du mana.

---

## 2. Ce qu'on a aujourd'hui (fiche)

Source : `src/lib/gacha.ts`, `src/data/champions.ts`, `src/lib/adventurers.ts`, CLAUDE.md.

| Élément | Valeur actuelle |
|---|---|
| Monnaie | pierres de mana 💠 (failles + mines résiduelles + 110 💠/jour offerts à la connexion) |
| Prix | 110 💠 le tirage · ×10 pour 990 💠 (1 offert) |
| Débit mesuré | 63 · 91 · 157 · 240 💠/jour aux niveaux 12 · 30 · 60 · 100 (une faille/jour) |
| Raretés | **8** : Commun 30 % · Inhabituel 25 · Magique 18 · Rare 12 · Épique 8 · Légendaire 4 · Mythique 2,4 · Primordial 0,6 |
| Pity sommet | montée de 75 à 90, garanti au 90ᵉ, compteur conservé |
| Pity plancher | tous les 10 : **Épique ou mieux**, re-tiré dans toute la tranche ≥ Épique → **45 %** de ces garantis sont Légendaire+ |
| Bannières | **aucune** : un seul pool de 32 champions, tirage uniforme dans la rareté obtenue |
| Roster | **32 champions**, 4 par rareté (un par rôle de convoi) |
| Doublons | Éveil C0→C6 (+8 %/cran, + 1-2 crans qui montent une signature) ; au-delà, **55 💠 rendus** |
| Rareté effective | plafonnée par le **rang du joueur** (un Primordial au niveau 5 porte du Bronze) |
| Armes / équipement | **pas de gacha** : pièces par lignée, via sièges (2 %), embuscades repoussées (25 %), Équipementier (fonte d'objets) — stock du compte réel **à zéro** |
| Déploiement | `engageCap` (Panthéon) borne groupe, escorte et rempart ; failles plafonnées à 3 |

Mesures déjà faites (v0.969) : **2 comptes sur 4 n'avaient jamais tiré** ; saturation (tirages
qui ne font plus que rendre du mana) **0 % à 1 mois, 18 % à 3, 45 % à 6, 68 % à un an** ;
collection complète **~1 an** ; la conversion des doublons **double** le débit (39 raretés max/an
au niveau 60 pour une cible de 10-20).

---

## 3. Comment fonctionnent les gachas du genre

> ⚠️ Chiffres publics tirés des jeux de référence, cités pour l'ordre de grandeur. À revérifier
> jeu par jeu si l'un d'eux sert de valeur à reprendre telle quelle.

### 3.1 Nombre de raretés

**Presque tous tirent 3 raretés** (★3/★4/★5, R/SR/SSR) :

- **Le bas** (★3, ~94 %) est du **fourrage** : ce n'est souvent même pas un personnage mais une
  arme ou un matériau. Il sert à rendre le haut rare *par contraste*.
- **Le milieu** (★4, ~5 %) est **garanti tous les 10** : c'est le « petit gain » de chaque lot.
- **Le sommet** (★5, ~0,6 %) est **l'événement** : animation dédiée, pity, et c'est lui qu'on
  vient chercher.

Exceptions : Arknights tire 4 raretés (★3 à ★6, 6★ à 2 %) ; Summoners War a des raretés
« naturelles » 1★ à 5★. Mais même là, **seules deux raretés comptent** dans la tête du joueur.

Pourquoi c'est important : **un gacha est lisible parce qu'il est binaire**. « Est-ce que j'ai eu
mon ★5 ? » est une question à laquelle on répond d'un coup d'œil. À 8 raretés, la réponse est
un dégradé — et un dégradé ne fait pas vibrer.

### 3.2 Rareté et puissance

Dans le genre, **la rareté d'un personnage est FIXE et ne dépend pas du niveau du compte**. Ce
qui borne un ★5 tiré tôt, c'est :

- son **niveau**, plafonné par l'**ascension** (paliers débloqués par des matériaux et le niveau
  du compte) ;
- son **équipement** (armes, artefacts) qu'il faut farmer ;
- les **doublons** (constellations, potentiels, limit break).

Le joueur **sent** donc le ★5 immédiatement (visuel, kit, talents), même si sa puissance brute
reste bornée par sa progression. Ici, on fait l'inverse : on **rétrograde l'étiquette** (le
Primordial « mène du Bronze »), ce qui retire le frisson sans rien apporter de plus que ce qu'un
plafond de niveau apporterait déjà.

### 3.3 Pity

| Jeu | Sommet | Pity sommet | Plancher | Particularités |
|---|---|---|---|---|
| Genshin / Honkai Star Rail | 0,6 % | montée vers 74, dur à 90 | ★4 tous les 10 | 50/50 sur bannière limitée, garanti ensuite ; compteur conservé entre bannières du même type |
| Genshin — bannière d'armes | 0,7 % | dur à 80 | ★4 tous les 10 | « trajectoire » : on choisit l'arme visée |
| Arknights | 2 % (★6) | +2 % par tirage après 50 | ★5 dans les 10 premiers seulement | étincelle à 300 sur bannières limitées |
| Blue Archive / Uma Musume | 3 % | aucun pity progressif | ★2 garanti au 10ᵉ | **étincelle à 200** : on échange des points contre le personnage vedette |
| Nikke | 4 % | aucun | — | kilométrage (étincelle) à 200 |
| Fire Emblem Heroes | 3-6 % | +0,5 % tous les 5 tirages sans ★5 | — | étincelle à 40 sur certaines bannières |
| Epic Seven | 1,25 % | mystique via médailles | — | bannière d'artefacts séparée |

Deux familles :

- **Pity progressif** (Genshin, Arknights, FEH) : le taux monte, puis le sommet est garanti.
- **Étincelle** (Blue Archive, Nikke, Uma) : pas de montée, mais chaque tirage rapporte un point,
  et à N points on **choisit** le personnage.

Le **plancher** du genre donne **« ★4 ou mieux »**, mais le « mieux » n'y vaut que le taux de
base du ★5 rapporté à la tranche (~10 % chez Genshin). **Ici, 45 %** : notre garantie re-tire dans
toute la tranche ≥ Épique, où Légendaire + Mythique + Primordial pèsent lourd face à l'Épique.

### 3.4 Bannières

- **Bannière permanente** (standard) : tout le pool, jamais de vedette.
- **Bannière vedette** (limitée) : un personnage à **50 %** du sommet ; si on « perd le 50/50 »,
  le suivant est garanti vedette. Durée ~3 semaines, rotation continue.
- **Bannière de débutant** : 20-50 tirages remisés, sommet garanti une fois.
- **Bannière d'armes** : pool séparé, pity séparé.
- **Liste de souhaits** (AFK Arena, Summoners War) : le joueur **désigne** quelques personnages
  du pool, et le sommet tombe sur eux en priorité.

⚠️ La bannière **limitée dans le temps** existe pour **vendre** (peur de rater, achat
d'urgence). Sans argent réel, elle n'a que son défaut : elle **punit l'absence**, ce que ce
projet refuse partout (règle 1 des sièges). Ce qu'on peut garder d'elle, c'est la **direction**
(« cette semaine je vise X ») et le **rythme** (quelque chose change chaque semaine), sans
l'exclusivité.

### 3.5 Doublons et monnaie de repli

| Jeu | Doublon | Au-delà du max |
|---|---|---|
| Genshin | constellation C1→C6 | **Starglitter** → boutique : acheter des ★4 choisis, des tirages |
| HSR | eidolon E1→E6 | **Undying Embers/Starlight** → boutique |
| Arknights | potentiel 1→6 | **jetons** → boutique de certificats (échanger contre un opérateur) |
| Blue Archive | éléments d'amélioration | **eligma** → échanger contre les éléments du personnage voulu |

**Personne ne rend la monnaie de tirage elle-même.** Le repli est une **seconde monnaie**, qui
achète un **choix** (un personnage désigné, un matériau). C'est ce qui empêche la boucle
« tirer rapporte de quoi tirer » — exactement le défaut mesuré ici (débit ×2).

### 3.6 Armes

Deux modèles :

- **Gacha d'armes séparé** (Genshin, HSR, Epic Seven) : bannière propre, pity propre, souvent
  une **arme signature** par personnage vedette.
- **Armes farmées / fabriquées** (Arknights, Blue Archive) : l'équipement vient du jeu, le gacha
  ne vend que les personnages.

Ce projet a tranché **« pas de gacha d'équipement »** (drops-only gear, v0.556) et c'est cohérent
avec l'absence d'argent réel : un second gacha **coupe en deux** le seul puits de mana. Le vrai
problème n'est pas le modèle mais le **débit** : le stock d'équipement des champions du compte
réel est **à zéro**.

### 3.7 Rythme et roster

Un gacha vivant **ajoute des personnages** (typiquement 2 toutes les 5-6 semaines) : la
collection ne se termine jamais, et la saturation est repoussée par le contenu, pas par les taux.
Un roster fixe finit **toujours** par saturer — ici en ~1 an (32 champions).

---

## 4. Diagnostic détaillé

### 4.1 Huit raretés : le lot est un nuancier

Sur 10 tirages, l'espérance actuelle est **3 Communs, 2,5 Inhabituels, 1,8 Magiques, 1,2 Rares,
~1,5 Épiques+** : cinq couleurs différentes, dont aucune n'est rare. Le tirage de l'utilisateur
(3 · 2 · 3 · 2 · 1) est **exactement** cette espérance — les taux sont bons, c'est la **forme**
qui ne produit pas d'émotion. Le Commun, l'Inhabituel et le Magique pèsent **73 %** des tirages
et ne se distinguent pas vraiment les uns des autres à l'écran.

### 4.2 Rareté plafonnée par le niveau : le jackpot qui ne se sent pas

`championRarity` plafonne la rareté **effective** par le rang de prestige du joueur. C'était la
bonne réponse à une vraie question (« le sport est le plafond », mesuré en v0.938 : sans plafond
une escorte vaut ×3,9 à ×5,6 l'étalon au niveau 12). Mais elle a été appliquée **à l'étiquette**
plutôt qu'**au niveau** du champion, d'où la confusion rareté/rang déjà corrigée deux fois
(v0.962, v0.977).

Le genre pose la même borne autrement : **le personnage garde sa rareté, son NIVEAU est plafonné**
par la progression du compte. On garde « le sport est le plafond » (via le niveau et le budget de
stats plafonné), et on rend au tirage son frisson.

### 4.3 La garantie de 10 est trop généreuse

45 % des tirages garantis sont Légendaire ou mieux, contre ~10 % dans le genre. Conséquence : le
haut de la pyramide (12 champions sur 32) arrive vite, et c'est une des causes de la saturation à
6 mois.

### 4.4 Pas de direction

Tous les champions d'une rareté se partagent le taux uniformément : on ne **vise** rien. Or viser
est ce qui donne du sens à l'épargne (« je garde mon mana pour X ») — et l'épargne est ce qui fait
qu'un joueur revient.

### 4.5 La boucle de mana

La copie de trop rend 55 💠 : plus on est saturé, plus on tire, plus on sature (§ 2). Aucun jeu du
genre ne fait ça.

### 4.6 Équipement des champions à sec

Deux sources de drop sur trois sont rares (2 % sur les corps d'un siège), et l'Équipementier
consomme un objet du héros. Résultat mesuré : **0 pièce** en stock pour 9 champions.

---

## 5. Propositions, thème par thème

### 5.1 Raretés : passer à **3 raretés de tirage**

| Rareté de tirage | Taux | Rôle |
|---|---|---|
| ★3 **Recrue** | ~85 % | fourrage : Éveil des ★3, et **éclats** (§ 5.4) |
| ★4 **Vétéran** | ~14 % · garanti tous les 10 | le petit gain de chaque lot |
| ★5 **Légende** | 0,6 % · montée 75 → garanti 90 | l'événement |

- Les 32 champions se répartissent sur les 3 raretés (par ex. **8 ★3 · 12 ★4 · 12 ★5**, pyramide
  **inversée** du genre : le haut est la collection, le bas l'entrée).
- Le **rang** (Bronze → Tout-puissant) reste l'échelle de progression de TOUT le jeu : c'est le
  **niveau** du champion qui le fait monter, comme le héros. On cesse de mélanger les deux mots.
- Le **budget de stats** passe de 8 crans à 3 (écart ★3/★5 à re-mesurer : aujourd'hui ×5,3 entre
  les extrêmes, ~×2 à ×2,5 suffirait avec l'Éveil et le niveau par-dessus).

Alternative moins lourde (**scénario A**) : garder les 8 raretés mais **n'en faire parler que 3 à
l'écran** (une couleur « fond » pour Commun→Rare, « or » pour Épique/Légendaire, « arc-en-ciel »
pour Mythique/Primordial) et ne jouer l'animation que pour les deux derniers groupes.

### 5.2 Rareté fixe, niveau plafonné

- Un ★5 tiré au niveau 5 **reste un ★5** partout (portrait, écran, étiquette).
- Son **niveau** est plafonné par le Panthéon (déjà le cas, `grantAdvXp`) et son **budget de stats**
  par le rang du joueur (déjà le cas, `championBudget`) : la protection « le sport est le plafond »
  ne bouge pas, elle change seulement de **place**.
- Supprime `championRarity` (rareté effective) et tous les « il mène du Bronze ».
- ⚠️ À re-mesurer : l'équipement et les compagnons étaient bornés par la rareté effective. Il faut
  les borner par le **rang du champion** (son niveau) à la place.

### 5.3 Pity

- **Sommet** : inchangé (0,6 %, montée dès 75, garanti 90, compteur persisté).
- **Plancher** : « ★4 **ou mieux** », mais le « mieux » **au taux de base** rapporté à la tranche
  (~4 % des garantis), plus 45 %. Conforme au genre.
- **Bannière vedette** (§ 5.5) : **50/50**, garanti au suivant si perdu. Le compteur « perdu » se
  conserve d'une rotation à l'autre (on ne perd jamais une garantie en s'absentant).

### 5.4 Doublons : éclats et étincelle au lieu du mana

- Au-delà de C6, un doublon rend des **éclats** (nouvelle monnaie, pas du mana). Les ★3 en
  rendent un peu, les ★5 beaucoup.
- Chaque tirage rend aussi **1 point d'étincelle**. À **N points** (~150-200, à mesurer), on
  **choisit** un champion ★5 du pool.
- La **boutique d'éclats** vend : un ★4 choisi, un cran d'Éveil d'un champion possédé, des pièces
  d'équipement de champion (§ 5.6). **Jamais** du mana ni des tirages.
- Effet mesurable attendu : la boucle ×2 disparaît (le débit revient dans la bande 10-20 ★5/an), et
  la saturation cesse d'être du vide : elle devient du **choix**.

### 5.5 Bannières : vedette permanente qui tourne, + liste de souhaits

- **Bannière standard** : tout le pool, toujours ouverte.
- **Bannière vedette** : un ★5 (et deux ★4) mis en avant, **qui change chaque semaine** (rotation
  fixe, annoncée à l'avance dans un calendrier). **Aucune exclusivité** : le vedette reste tirable
  en standard et à l'étincelle. On garde la direction et le rythme, pas la punition.
- **Liste de souhaits** (standard) : le joueur désigne 2-3 ★5 ; quand un ★5 tombe en standard, il
  tombe sur la liste avec une probabilité majorée. Même pity que la standard.
- **Pas de bannière de débutant** : le tirage offert quotidien joue déjà ce rôle (64 % des tirages
  au niveau 12).
- ⚠️ À trancher : le pity se partage-t-il entre standard et vedette ? Dans le genre, **non**
  (compteurs séparés par type de bannière). Ici, un compteur **commun** est plus simple et ne
  pénalise personne ; à choisir.

### 5.6 Armes et équipement : pas de gacha, mais une arme signature et un vrai débit

- **Pas de bannière d'armes** : elle couperait le puits de mana en deux et ajouterait un second
  pity à suivre. Décision v0.556 maintenue.
- **Arme signature** par ★5 : débloquée par l'Éveil (C1 ou C2), ou achetable en boutique d'éclats.
  Donne un vrai objectif aux doublons, et l'identité visuelle que le genre obtient par la bannière
  d'armes.
- **Équipement de lignée** (existant) : relever son débit — pièces sur les **camps** et les
  **failles** (4ᵉ et 5ᵉ sources), et en boutique d'éclats. ⚠️ Touche `ADV_GEAR.k` et la calibration
  des embuscades et des sièges : à mesurer.

### 5.7 Roster et rythme

- Garder **32 champions** comme première vague, mais **ajouter ~2 ★5 par mois** pendant un temps :
  le seul remède durable à la saturation dans le genre. Chaque ajout est la **vedette** de sa
  semaine de sortie.
- ⚠️ Règle déjà écrite (v0.939) : **on n'ajoute jamais en bas**. Avec 3 raretés : jamais de ★3 en
  plus.

### 5.8 Écran d'invocation

- Animation **graduée par rareté** : lueur de fond (bleu ★3, violet ★4, or ★5) visible avant la
  révélation, comme dans le genre — c'est elle qui fait vibrer, bien plus que la roulette.
- Historique des tirages (100 derniers) et compteur de pity visible en permanence.
- Taux affichés par bannière (obligation légale dans plusieurs pays, déjà fait en v0.966).

---

## 6. Ce qui NE doit PAS changer

- **Le sport est le plafond** : budget de stats plafonné par le rang du joueur, niveau plafonné par
  le Panthéon. Seule l'étiquette de rareté change.
- **Aucune bannière limitée dans le temps** avec exclusivité : elle punit l'absence.
- **Aucun gacha d'équipement.**
- **Le prix d'un tirage reste indexé sur le débit des failles**, sans remise de bâtiment.
- **Un tirage n'est jamais perdu** : le doublon au-delà de C6 rend des éclats.

---

## 7. Deux scénarios

### A — Ajustements (~1 journée)

1. Plancher « ★4 ou mieux » au taux de base (45 % → ~5 % au-dessus de l'Épique).
2. Doublon au-delà de C6 → éclats + boutique minimale (★4 choisi, cran d'Éveil). Mana supprimé.
3. Étincelle : 1 point par tirage, champion ★5 choisi à N points.
4. Écran : 3 groupes de couleurs, animation seulement pour Épique+ ; plus de « mène du Bronze ».
5. Bannière vedette hebdomadaire sans exclusivité.

Garde les 8 raretés, les 32 champions et la calibration des stats. Règle 4 des 5 écarts
(pas le n°1 en profondeur).

### B — Refonte ciblée (~3-4 jours, recommandé)

Tout A, plus :

1. **3 raretés de tirage** (★3/★4/★5), roster redistribué (8/12/12), budget de stats sur 3 crans.
2. **Rareté fixe**, rang = niveau ; suppression de la rareté effective et re-bornage de
   l'équipement et des compagnons par le rang du champion.
3. **Liste de souhaits** sur la standard.
4. **Arme signature** des ★5, débloquée à C1.
5. Calendrier de rotation des vedettes, et plan d'ajout de champions.

⚠️ Migration : les champions déjà possédés prennent leur nouvelle rareté par table de
correspondance (Commun/Inhabituel/Magique → ★3, Rare/Épique → ★4, Légendaire+ → ★5, à ajuster
pour tenir 8/12/12) ; leurs copies et leur niveau sont conservés. Les 4 comptes réels sont petits
(≤ 16 champions), la migration se vérifie à la main.

---

## 8. Mesures à faire avant d'implémenter

1. **Débit ★5/an** avec 3 raretés, plancher corrigé et étincelle, aux niveaux 12/30/60/100 — cible
   10-20 (bande actuelle).
2. **Saturation** à 1/3/6/12 mois avec éclats au lieu du mana.
3. **Écart de puissance ★3/★4/★5** à niveau égal et à Éveil égal : garder « un ★3 investi bat un ★5
   nu » (propriété défendue en v0.938) et « à Éveil égal, la rareté gagne ».
4. **Bandes d'embuscade et tenue des sièges** avec le nouvel étalon (`refChampions`) : une rareté
   de référence change, donc la route et le rempart se recalibrent (leçon v0.795 : les deux camps
   bougent ensemble).
5. **Seuil d'étincelle** : à quel N un joueur à une faille/jour choisit un ★5 tous les ~2 mois.

---

## 9. Questions pour l'utilisateur

1. **Scénario A ou B ?** (B recommandé : c'est le seul qui règle le nuancier et le jackpot qui ne
   se sent pas.)
2. **3 raretés** : noms ★3/★4/★5, ou des mots (Recrue / Vétéran / Légende) ?
3. **Bannière vedette** : rotation **hebdomadaire** ou **tous les 15 jours** ? Pity partagé avec
   la standard, ou séparé ?
4. **Étincelle** : oui/non, et vers quel rythme (un ★5 choisi tous les ~2 mois ?) ?
5. **Arme signature** des ★5 : oui/non ?
6. **Ajouter des champions** au fil du temps (~2/mois), ou rester à 32 ?
