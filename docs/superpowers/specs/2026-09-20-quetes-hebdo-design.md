# Quêtes hebdomadaires — étude de conception

**État : ÉTUDE, rien n'est implémenté.** Demandée par l'utilisateur le 2026‑09‑20
(« étudier la possibilité de mettre en place des quêtes chaque semaine »). Ce document dit
ce que la mesure a trouvé, les deux conceptions possibles, et la question qui reste à
trancher.

## ⚠️ La première question n'est pas « quelles quêtes », c'est « pourquoi »

Le projet a **DÉJÀ trois boucles hebdomadaires**, et une quatrième liste d'objectifs
risque de payer deux fois le même effort — ce que ce projet corrige à répétition (la prime
des sorties comptée en double, v0.769 ; les séries comptées deux fois, v0.842).

| Boucle              | Ce qu'elle récompense              | Fenêtre          |
| ------------------- | ---------------------------------- | ---------------- |
| **Défi 360**        | le VOLUME full‑body                | 7 jours          |
| **Challenges solo** | la RÉGULARITÉ sur un exercice      | budget de jetons |
| **Boss entre amis** | l'effort COLLECTIF sur un exercice | 7 jours          |

Ces trois‑là couvrent l'**EFFORT**. Une quête qui récompenserait encore l'effort serait un
doublon.

## ✅ Ce que la mesure a trouvé, et qui change la question

Relevé en base le 2026‑09‑20, sur les **quatre comptes réels** :

| compte | 💠 mana | 🗝️ clés | 🔮 pierres | 🔩 ferraille | 🪙 or   | champions |
| ------ | ------- | ------- | ---------- | ------------ | ------- | --------- |
| Last   | **0**   | 17      | **119**    | 207          | 173 220 | 16        |
| Cypher | **0**   | 11      | 30         | 33           | 1 484   | 5         |
| Knat   | **0**   | **0**   | 30         | 35           | 1 999   | **0**     |
| Mimi   | **0**   | **0**   | 2          | 0            | 840     | **0**     |

⚠️ **CE N'EST PAS UN PROBLÈME D'EFFORT, C'EST UN PROBLÈME DE DÉCOUVERTE.** Le mana est à
**zéro partout** (personne n'a encore fermé une faille), **119 pierres d'invocation** et
**17 clés** dorment chez le compte le plus avancé, et deux comptes sur quatre n'ont jamais
recruté personne. Les systèmes existent, ils **ne sont pas touchés**.

C'est le vrai trou, et aucune des trois boucles ne le comble : elles récompensent toutes
ce que le joueur fait DÉJÀ. Rien ne dit « cette semaine, va voir ce que tu n'as jamais
ouvert ».

## ⚠️ Toutes les devises sont mesurées et bornées — il n'y a pas de robinet libre

| Devise       | Son puits                    | Le test qui la borne                     |
| ------------ | ---------------------------- | ---------------------------------------- |
| 🪙 or        | bâtiments, enceinte, soins   | `goldSink` (55‑90 % du plafond sur 1 an) |
| 🔩 ferraille | réparer et monter l'enceinte | `scrapEconomy` (plus dure que l'or)      |
| 🔮 pierres   | boss de palier               | `campEconomy`                            |
| 🗝️ clés      | Labyrinthe                   | 2 à 5 runs/jour au palier de pointe      |
| 💠 mana      | tirage de champion           | débit des failles (v0.936)               |
| ⚡ énergie   | donjons                      | **= l'XP de sport** — intouchable        |

⚠️ **Conséquence directe : toute quête qui paie une de ces devises impose de re‑mesurer
son test d'économie.** Ce n'est pas rédhibitoire, c'est un coût à connaître avant de
promettre la feature. ⚠️ Et **l'XP est exclue d'office** : elle EST l'énergie d'aventure,
donc la payer court‑circuiterait « le sport est le plafond », la règle fondatrice.

## Les deux conceptions possibles

### A — La quête GUIDE (aucune économie touchée)

Un panneau « cette semaine » qui **dérive** de ce que le joueur n'a pas touché : « tu as
17 clés et aucun run de Labyrinthe depuis 12 jours », « une faille arrive à maturité dans
2 jours », « 119 pierres dorment : le boss de palier X est à ta portée ».

- ✅ **Zéro devise, zéro migration, zéro re‑mesure.** Tout est déjà en base.
- ✅ Le patron existe **deux fois** dans le projet : `advUnlocks` (un calendrier dérivé) et
  l'équilibre du corps, qui pointe déjà ce qui manque et ouvre l'écran pour le combler.
- ✅ Ça répond exactement au trou mesuré ci‑dessus.
- ⚠️ Ce n'est pas une « quête » au sens du genre : pas de récompense, donc pas d'urgence.

### B — La quête PAIE (une économie à re‑mesurer)

Trois à cinq objectifs tirés chaque lundi (« ferme 3 failles », « escorte 5 convois »,
« tiens un siège », « boucle un groupe du 360 »), avec une récompense.

- ⚠️ **La récompense doit servir le système qu'elle fait tourner, pas en inflater un
  autre** : « ferme 3 failles » paie du **mana** — la devise que les failles produisent
  déjà. La quête devient un MULTIPLICATEUR d'un robinet existant, borné par une part (à la
  manière de `CARAVAN.yieldShare`), et non un robinet de plus.
- ⚠️ **Écarté d'avance : payer en XP** (cf. ci‑dessus) et **payer en or** (le puits d'or est
  le plus serré du jeu, et il vient d'être re‑mesuré à 9 bâtiments).
- 🤔 **Piste sans aucune devise** : la quête paie une **GARANTIE** (« le prochain tirage
  sera au moins épique »), en posant le pity qui existe déjà. Coût économique nul,
  sensation de récompense réelle. À creuser — c'est peut‑être le meilleur des deux mondes.

## Ce qui est dérivable SANS rien stocker

Tout ce qui suit existe déjà en base et se compte par semaine, sans colonne nouvelle :

- **sport** : `ActivitySources` (séances, cardio, tennis, défis, 360, frappes de boss) —
  déjà écrit, pur, exhaustif par construction (v0.755) ;
- **jeu** : failles fermées (`cleared_dungeons`), sièges tenus (`base.lastReport`), convois
  encaissés (`caravans`, 5 gardés), runs de Labyrinthe (`laby_stats`), boss de palier
  (`defeated_bosses`), tirages (`gacha.pulls`), champions possédés (`adventurers`).

⚠️ **Une seule chose manque : l'HORODATAGE hebdomadaire.** La plupart de ces états sont
cumulatifs, pas datés — on sait _qu'on_ a nettoyé un donjon, pas _quand_. Une quête
« ferme 3 failles cette semaine » demande donc soit un compteur daté (une colonne), soit
de se limiter à ce qui porte déjà une date (les convois, les frappes de boss, les séries du
360, les sorties).

## La question à trancher

1. **A ou B ?** La mesure plaide pour **A** (le trou est la découverte, pas l'effort), et A
   ne coûte aucune re‑mesure. B a plus de mordant, mais engage une économie.
2. Si **B** : quelle récompense — mana borné, ou la garantie de tirage (zéro devise) ?
3. Combien d'objectifs par semaine, et se renouvellent‑ils le lundi ou 7 jours après la
   dernière quête bouclée ? (Le projet sait faire les deux : le Défi 360 a une date de
   début choisie, le boss entre amis un délai de relance.)

## ⚠️ Ce qui n'a PAS été fait

Aucune ligne de code. Aucune mesure de l'impact économique de B (elle demande d'abord de
savoir quelle récompense). Et **aucune décision** : les trois questions ci‑dessus
reviennent à l'utilisateur.
