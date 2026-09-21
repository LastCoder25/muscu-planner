# Roadmap : refonte du gacha des champions

**Date** : 2026-09-21 · **Statut** : à préciser avant lancement · **Base** :
`docs/superpowers/specs/2026-09-21-gacha-refonte-etude.md` (scénario B, complet).

## Décisions prises (2026-09-21)

| # | Sujet | Décision |
|---|---|---|
| 1 | Ampleur | **Refonte complète** (tout le scénario B) |
| 2 | Échelle du gacha | **Lettres S / A / B**, pas d'étoiles (déjà prises dans l'app). Champions **S et A** ; **B** = le fond du tirage (pièce d'équipement de lignée ou matériau d'Éveil), jamais un champion |
| 3 | Armes / équipement des champions | **Aussi en S / A / B** : arme signature S, équipement de lignée en S/A/B. L'équipement **du héros** garde ses 8 raretés (il suit le sport, pas le gacha) |
| 4 | Vedette | **Rotation chaque semaine** ; compteurs **comme dans le genre** (voir plus bas) ; un champion **nouveau** n'est tirable **qu'en vedette** pendant sa semaine de sortie, puis rejoint la standard |
| 5 | Filet contre la malchance longue | **Points d'étincelle** : 1 point par tirage (standard comme vedette), échangé contre **un S choisi** à ~200 points (seuil à mesurer). Les points **ne s'effacent jamais** et n'ont aucun autre usage. Pas d'objectif de rythme imposé |
| 6 | Arme signature des S | **Oui** |
| 7 | Roster | **Ajouter des champions** au fil du temps |
| 8 | Comptes existants | **Reset des champions + compensation** |
| 9 | Écran | l'invocation a **son propre onglet** dans l'Aventure |
| 10 | Niveau max | **le même pour tous** : celui du héros (S comme A) |
| 11 | Le héros dans les failles | **il compte dans la limite de 3** |
| 12 | Notification | **le lundi**, quand la vedette change (nom seulement) |
| 13 | Revenu de mana | **Plat comme dans le genre** : le mana d'une faille ne suit plus son niveau ; cible **~1,5-2 tirages/jour** à tout niveau, 90 tirages en ~45-60 j pour un joueur qui ferme une faille par jour (valeur de référence : le niveau 30 actuel) |
| 14 | Tirage offert | **entier** un jour d'entraînement, **demi** les autres jours |
| 15 | Nouvelles sources | **Oui** : mana de première réussite (donjon, boss, palier du Labyrinthe) + petit événement hebdo lié à la vedette |
| 16 | Compensation du reset | en pierres de mana, **selon les tirages déjà faits** ; le compteur de garantie **repart à zéro** |

### « Comme dans le genre » pour le compteur (Q3), concrètement

- **Deux familles de bannières, deux compteurs** : la **standard** a le sien, **toutes les vedettes
  partagent le leur**. Changer de semaine ne remet rien à zéro : le compteur de la vedette suit
  d'une rotation à l'autre.
- Dans chaque famille : S garanti au **90ᵉ** (taux qui monte dès le 75ᵉ), A ou mieux tous les
  **10** (compteur à part).
- **50/50 sur la vedette** : quand un S tombe, c'est le champion vedette une fois sur deux ; si ce
  n'est pas lui, le **prochain S est garanti** vedette. Cette garantie **se conserve** d'une semaine
  à l'autre (on ne la perd jamais en s'absentant).
- Les deux **A vedettes** se partagent la moitié des A de la bannière.

### Filet contre la malchance longue

Voir la décision 5 : **points d'étincelle**, 1 par tirage, échangés contre un S choisi.

---

## Phases

Chaque phase se livre, se teste et se pousse seule. Durées = estimation de travail, portes comprises.

### P0 — Verrouiller les chiffres (~½ j)
- Répondre aux questions ouvertes (bas de page).
- Mesures de départ, sur les vraies libs : débit S/an avec 3 raretés et plancher corrigé (cible
  10-20), seuil d'étincelle, écart de puissance B/A/S.
- Relevé des 4 comptes réels : champions, copies, compteurs de pity, mana en réserve.

### P1 — Trois raretés, rareté fixe (~1 j) · *le cœur* — ✅ LIVRÉ v0.989
- `Champion.rarity` passe à **S / A** ; roster redistribué **~16 S · 16 A** (rôles répartis dans
  chaque rareté). **B** = pièces d'équipement de lignée et matériaux d'Éveil, jamais un champion.
- Budget de stats sur 3 crans ; « un A investi bat un S nu » et « à Éveil égal la rareté gagne »
  restent vrais (tests).
- **Rareté fixe** : suppression de la rareté effective et de « mène du Bronze » ; l'équipement et
  les compagnons sont bornés par le **rang du champion** (son niveau).
- Recalibrage des étalons (`refChampions`) : bandes d'embuscade, tenue des sièges, camps, failles
  (les deux camps bougent ensemble — leçon v0.795).
- **Reset des champions** des comptes réels, avec **compensation** (cf. Q-K).
- **Le héros compte dans la limite de 3** d'une faille (indépendant du reste, peut partir avant).
- Écrans : Codex, collection du Panthéon, roulette, tuiles d'escorte en S/A/B.

### P2 — Bannières et compteurs (~1 j)
- Bannière **standard** + bannière **vedette** hebdomadaire (1 S + 2 A), calendrier
  **déterministe** tiré de la semaine (aucun serveur, patron du boss mondial).
- Compteurs séparés par famille, **50/50 + garantie** conservée, plancher « A ou mieux » au taux
  de base (fini les 45 %).
- **Liste de souhaits** sur la standard (2-3 S désignés, priorité au tirage).
- **Historique** des 100 derniers tirages (jsonb, migration additive).

### P3 — Doublons, éclats, étincelle (~1 j)
- Au-delà de C6 : des **éclats** au lieu du mana (**suppression de la boucle mana**).
- **Points d'étincelle** (1 par tirage, jamais effacés) et échange contre un S choisi.
- **Boutique d'éclats** : A choisi, cran d'Éveil d'un champion possédé, pièces d'équipement.
- Mesures : débit S/an, saturation à 1/3/6/12 mois.

### P4 — Armes signature des S (~1 j)
- Une arme par S, débloquée à **C1** ou achetable en boutique d'éclats.
- Emplacement arme du champion ; effet propre à chaque arme (écrit, mesuré).
- Pas de bannière d'armes (décision v0.556 maintenue).

### P5 — Écran d'invocation (~1 j)
- **Onglet dédié** dans l'Aventure ; notification push le **lundi** quand la vedette change.
- Deux onglets de bannière (vedette / standard), calendrier des prochaines vedettes.
- **Lueur graduée** avant la révélation (bleu B, violet A, or S).
- Compteurs de pity, 50/50 et points d'étincelle toujours visibles ; historique ; taux par bannière.

### P6 — Équipement des champions (~½-1 j)
- Pièces de lignée sur les **camps** et les **failles**, et en boutique d'éclats.
- ⚠️ Touche `ADV_GEAR.k` et la calibration des embuscades et sièges : à mesurer.

### P7 — Nouveaux champions (~½ j pour la chaîne, puis ~30 min par champion)
- Chaîne d'ajout : données, portrait (script existant), tests de roster, place dans le calendrier.
- Un nouveau champion n'est tirable **qu'en vedette** pendant sa semaine de sortie.
- Rythme cible ~2 S (ou A) par mois, chacun vedette de sa semaine de sortie.
- ⚠️ Règle v0.939 : **jamais de champion B** (il n'en existe pas).

**Total : ~6 à 7 jours.** Ordre imposé : P0 → P1 → P2 → P3 ; P4 à P7 dans n'importe quel ordre ensuite.

---

## Questions encore ouvertes (à trancher en P0)

Aucune : tout est tranché. Reste à mesurer en P0 (seuil d'étincelle, revenu plat, prix du tirage offert).

## Améliorations proposées en plus (hors refonte, à prendre ou laisser)

- **Vitrine d'un champion chez tes amis** (patron déjà en place : `friend_boss_members.look`).
- **Notification push** quand la vedette change (le lundi), avec le nom seulement.
- **Le héros dans les failles** (arbitrage ouvert v0.979) : à régler avant P1 : c'est le moment de
  décider si le héros compte dans la limite de 3.

---

## Économie du mana, mesurée (2026-09-21)

Sonde sur les vraies libs (carte simulée un an, 4 graines, tirages réels avec pity et Éveil).
Joueur qui ferme 0, 1 ou 2 failles par jour et récolte les mines résiduelles par convoi.

### Tirages par jour et délai pour 90 tirages

Sans la conversion des doublons (ce que la refonte prévoit) :

| Niveau | 0 faille/j | 1 faille/j | 2 failles/j |
|---|---|---|---|
| 12 | 1,1/j · 90 tirages en **82 j** | 1,7/j · **56 j** | 1,5/j · 64 j |
| 30 | 1,2/j · 79 j | 2,0/j · **48 j** | 1,7/j · 55 j |
| 60 | 1,3/j · 69 j | 2,7/j · **36 j** | 2,2/j · 43 j |
| 100 | 1,6/j · 59 j | 3,7/j · **29 j** | 2,9/j · 35 j |

Avec la conversion actuelle (55 💠 par doublon de trop), l'année monte à **1,6 à 6,8 tirages/j**
et la conversion devient la **première source** du jeu (60 à 340 💠/j, plus que les failles) :
c'est la boucle déjà relevée en v0.969, elle est confirmée.

### Comparaison avec un gacha classique

Ordre de grandeur public pour un joueur gratuit de Genshin / Star Rail : **~1,5 à 2 tirages par
jour** en moyenne, soit **90 tirages en ~45-60 jours**, et un ★5 vedette garanti (180) en
~3-4 mois. Ce revenu est **à peu près plat** : il ne monte presque pas avec le niveau du compte.

- **Niveaux 12-30 : cohérent** (1,5 à 2 tirages/j, 90 tirages en 48-64 j).
- **Niveaux 60-100 : trop rapide** (jusqu'à 3,7/j, 90 tirages en 29 j) — le mana d'une faille est
  indexé sur son niveau (×4 du niveau 12 au 100), alors que le genre garde un revenu plat.
- **Le tirage offert quotidien pèse lourd** : 1 tirage/j à lui seul, soit **50 à 90 %** du revenu
  selon le profil. Dans le genre, la corvée quotidienne ne rapporte qu'**~⅓ de tirage** ; le reste
  vient de l'endgame récurrent (Abysses) et surtout des **événements et contenus à première
  complétion**.
- **Fermer 2 failles par jour rapporte moins qu'une** (failles plus jeunes, donc plus pauvres) :
  voulu (v0.936), à garder.

### Sources, comparées

| Genre (Genshin) | Part | Équivalent ici |
|---|---|---|
| Corvée quotidienne (missions du jour) | ~30 % | tirage offert à la connexion — **3× plus généreux**, et sans effort |
| Endgame récurrent (Abysses, ~mensuel) | ~15-20 % | **failles** (quotidiennes) |
| Événements de version | ~30-40 % | **rien** |
| Première complétion (exploration, quêtes, succès) | gros au début, s'épuise | **rien** |
| Boutique de poussière (doublons) | ~5 tirages/mois | conversion en mana (à remplacer par les éclats) |

### Propositions pour P0

1. **Revenu plat** : le mana d'une faille ne suit plus le niveau (ou très peu), pour tenir **~1,5-2
   tirages/j** à tout niveau. Cible : 90 tirages en ~45-60 jours pour un joueur qui ferme une faille
   par jour.
2. **Tirage offert réduit à ~½ tirage/jour** (55 💠), ou gardé plein mais conditionné à un **jour
   actif** de sport — la corvée du genre, version app. ⚠️ À trancher : adosser au sport rouvre la
   règle « rien adossé aux reps » (v0.769) ; un **jour actif** n'est pas une rep, mais c'est une
   décision.
3. **Mana de première complétion** : premier nettoyage d'un donjon, première victoire sur un boss,
   premier palier du Labyrinthe, succès. C'est l'« exploration » du genre : un gros départ pour le
   nouveau joueur (aujourd'hui 1,1 tirage/j le premier mois), qui s'épuise ensuite.
4. **Événement hebdomadaire lié à la vedette** : une faille « vedette » ou un défi de la semaine qui
   rapporte un bonus, pour la part « événements ».
5. **Conversion des doublons en mana supprimée** (déjà dans P3).

---

## Q-G — Lettres S / A / B au lieu des étoiles — ✅ DÉCIDÉ (décisions 2 et 3)

Précédent direct : **Zenless Zone Zero** classe ses personnages **S / A** et ses armes **S / A / B**.
Avantages : se lit d'un coup d'œil, et ne se confond pas avec les **étoiles** déjà utilisées pour la
**qualité** d'un objet (★1-★5 dans son rang) et pour les **étoiles de rang** des champions.

Proposition qui va avec :

- **Champions : S et A seulement** (comme ZZZ). Plus de champions « de fond ».
- **B = le fond du tirage**, mais ce n'est **pas un champion** : c'est une **pièce d'équipement de
  lignée** ou un **matériau d'Éveil**. Ça donne le « fond » du genre sans diluer le roster, et ça
  **règle le stock d'équipement vide** au passage.
- **Armes signature : S** (ou A pour les champions A), sans bannière dédiée.
- Répartition du roster : les 32 deviennent ~**16 S · 16 A** (à écrire).

⚠️ Trois échelles cohabiteraient : **rang** (Bronze → Tout-puissant, la progression), **rareté
d'objet** du héros (Commun → Primordial, le butin du sport) et **S/A/B** (le gacha). Elles
parlent de trois domaines différents, mais il faudra que chaque écran n'en montre qu'une à la fois.

---

## ✅ P0 — Chiffres verrouillés (2026-09-21)

### Comptes réels (relevé en base)

| Compte | Mana | Tirages faits | Champions |
|---|---|---|---|
| Last | 892 | 11 | 11, tous niveau 1, aucun Éveil |
| Cypher | 33 | 6 | 6, tous niveau 1 |
| Mimi | 110 | 0 | 0 |
| Knat | 0 | 0 | 0 |

**Compensation du reset** = tirages faits × 110 💠 : **Last +1 210 · Cypher +660** (le mana en
réserve est conservé). Compteurs de garantie remis à zéro. Aucun niveau ni Éveil perdu (tous au
niveau 1) : le reset ne coûte rien d'autre.

### Tirage (simulé, 200 joueurs × 1 an)

| Réglage | Valeur |
|---|---|
| S | **0,6 %** de base ; taux qui monte de **+6 pts par tirage dès le 74ᵉ**, garanti au **90ᵉ** |
| A | **5,1 %** ; garanti tous les **10** (le 10ᵉ peut quand même être un S, au taux du moment) |
| B | le reste (~94 %) : pièce d'équipement de lignée ou matériau d'Éveil |
| Vedette | **50/50**, le S suivant garanti vedette si perdu ; compteurs partagés entre toutes les vedettes, séparés de la standard |
| Étincelle | **200 points** (1 par tirage) → un S choisi |

Mesuré : **taux S effectif 1,56 %** (Genshin ≈ 1,6 %), pire attente moyenne entre deux S ≈ 80
tirages. Selon le rythme de tirage :

| Tirages/jour | 90 tirages en | S/an (dont vedette) | + S à l'étincelle | A/an |
|---|---|---|---|---|
| 0,95 | 95 j | 5,2 (3,3) | +1 | 41 |
| 1,4 | 65 j | 7,9 (5,1) | +2 | 60 |
| **1,9** | **48 j** | **10,8 (7,1)** | **+3** | **82** |
| 2,4 | 38 j | 13,7 (9,0) | +4 | 103 |

Repère genre : un joueur gratuit de Genshin, ~1,8 tirage/jour, ~11 ★5/an.

### Revenu cible : ~1,85 tirage/jour pour un joueur régulier, à TOUT niveau

Prix du tirage inchangé (110 💠). Joueur type : 4 jours d'entraînement sur 7, une faille fermée
par jour.

| Source | 💠/jour | Tirages/jour |
|---|---|---|
| Tirage offert (entier les jours d'entraînement, demi sinon) | 86 | 0,78 |
| Failles — **mana plat**, calé sur **~85 💠 pour une faille/jour** (≈ le niveau 20 actuel) | 85 | 0,77 |
| Événement hebdo de la vedette : **2 tirages/semaine** | 31 | 0,29 |
| **Total** | **~202** | **~1,85** |

- **Joueur qui ne combat pas** (aucune faille) : tirage offert + mines résiduelles (~15 💠/j) +
  événement ≈ **1,2 tirage/jour** — il tire, moins vite.
- **Deux failles/jour** : un peu moins qu'une (failles plus jeunes) — voulu (v0.936).
- **Première réussite** (donjons, boss, paliers du Labyrinthe) : **en plus**, une fois pour
  toutes — le coup de pouce des premières semaines. Montants à régler en P3 pour qu'ils pèsent
  ~40-60 tirages sur les deux premiers mois, comme l'exploration du genre.
- ⚠️ La mine résiduelle suit le même aplatissement (sinon elle redevient la source qui monte avec
  le niveau).

### Puissance S / A (cible pour P1)

- **Un A à Éveil complet ≈ un S nu** — le contrat du genre (4★ C6 ≈ 5★ C0), et c'est exactement
  ce que l'Éveil actuel mesure (×1,48 ≈ un cran). Donc **budget S ≈ 1,45 × budget A**.
- **À Éveil égal, le S gagne toujours.** Niveau max identique (celui du héros) : le niveau domine
  la rareté, donc **un A investi bat un S nu** reste vrai.
- ⚠️ La valeur absolue des budgets se cale sur l'étalon des combats (`refChampions`) en P1 —
  convois, sièges, camps et failles bougent ensemble.

### Déjà fait en marge de P0

- **Le héros compte dans la limite de 3 d'une faille** (v0.984, `partyCapFor(poi, engage, hero)`,
  paramètre requis) ; l'écran retire le dernier champion coché s'il n'y a plus de place.
