# Roadmap : refonte du gacha des champions

**Date** : 2026-09-21 · **Statut** : à préciser avant lancement · **Base** :
`docs/superpowers/specs/2026-09-21-gacha-refonte-etude.md` (scénario B, complet).

## Décisions prises (2026-09-21)

| # | Question | Réponse |
|---|---|---|
| 1 | Ampleur | **Refonte complète** (tout le scénario B) |
| 2 | Noms des raretés | **★3 / ★4 / ★5** — et même échelle pour les armes (à confirmer, Q-A) |
| 3 | Vedette | **Rotation chaque semaine** ; compteur de garantie **comme dans le genre** |
| 4 | Étincelle | à confirmer (Q-B) — ce que « par points » veut dire est expliqué ci-dessous |
| 5 | Arme signature des ★5 | **Oui** |
| 6 | Roster | **Ajouter des champions** au fil du temps |

### « Comme dans le genre » pour le compteur (Q3), concrètement

- **Deux familles de bannières, deux compteurs** : la **standard** a le sien, **toutes les vedettes
  partagent le leur**. Changer de semaine ne remet rien à zéro : le compteur de la vedette suit
  d'une rotation à l'autre.
- Dans chaque famille : ★5 garanti au **90ᵉ** (taux qui monte dès le 75ᵉ), ★4 ou mieux tous les
  **10** (compteur à part).
- **50/50 sur la vedette** : quand un ★5 tombe, c'est le champion vedette une fois sur deux ; si ce
  n'est pas lui, le **prochain ★5 est garanti** vedette. Cette garantie **se conserve** d'une semaine
  à l'autre (on ne la perd jamais en s'absentant).
- Les deux **★4 vedettes** se partagent la moitié des ★4 de la bannière.

### « Par points » (Q4), concrètement

Chaque tirage (standard ou vedette) donne **1 point d'étincelle**. À **N points** (≈ 150-200, à
mesurer), on **échange** les points contre **un ★5 choisi** dans le pool. C'est le filet contre la
malchance **longue** (celle que le pity de 90 ne couvre pas : tomber sur le mauvais ★5 plusieurs fois
d'affilée). ⚠️ Dans plusieurs jeux les points **expirent avec la bannière** ; ici ils **se gardent**
(on ne punit pas l'absence).

---

## Phases

Chaque phase se livre, se teste et se pousse seule. Durées = estimation de travail, portes comprises.

### P0 — Verrouiller les chiffres (~½ j)
- Répondre aux questions ouvertes (bas de page).
- Mesures de départ, sur les vraies libs : débit ★5/an avec 3 raretés et plancher corrigé (cible
  10-20), seuil d'étincelle, écart de puissance ★3/★4/★5.
- Relevé des 4 comptes réels : champions, copies, compteurs de pity, mana en réserve.

### P1 — Trois raretés, rareté fixe (~1 j) · *le cœur*
- `Champion.rarity` passe à ★3/★4/★5 ; roster redistribué **8 ★3 · 12 ★4 · 12 ★5** (rôles
  répartis dans chaque rareté).
- Budget de stats sur 3 crans ; « un ★3 investi bat un ★5 nu » et « à Éveil égal la rareté gagne »
  restent vrais (tests).
- **Rareté fixe** : suppression de la rareté effective et de « mène du Bronze » ; l'équipement et
  les compagnons sont bornés par le **rang du champion** (son niveau).
- Recalibrage des étalons (`refChampions`) : bandes d'embuscade, tenue des sièges, camps, failles
  (les deux camps bougent ensemble — leçon v0.795).
- **Migration** des comptes réels : table de correspondance, copies et niveaux conservés, compteur
  de pity reporté.
- Écrans : Codex, collection du Panthéon, roulette, tuiles d'escorte en ★.

### P2 — Bannières et compteurs (~1 j)
- Bannière **standard** + bannière **vedette** hebdomadaire (1 ★5 + 2 ★4), calendrier
  **déterministe** tiré de la semaine (aucun serveur, patron du boss mondial).
- Compteurs séparés par famille, **50/50 + garantie** conservée, plancher « ★4 ou mieux » au taux
  de base (fini les 45 %).
- **Liste de souhaits** sur la standard (2-3 ★5 désignés, priorité au tirage).
- **Historique** des 100 derniers tirages (jsonb, migration additive).

### P3 — Doublons, éclats, étincelle (~1 j)
- Au-delà de C6 : des **éclats** au lieu du mana (**suppression de la boucle mana**).
- **Points d'étincelle** (1 par tirage) et échange contre un ★5 choisi.
- **Boutique d'éclats** : ★4 choisi, cran d'Éveil d'un champion possédé, pièces d'équipement.
- Mesures : débit ★5/an, saturation à 1/3/6/12 mois.

### P4 — Armes signature des ★5 (~1 j)
- Une arme par ★5, débloquée à **C1** ou achetable en boutique d'éclats.
- Emplacement arme du champion ; effet propre à chaque arme (écrit, mesuré).
- Pas de bannière d'armes (décision v0.556 maintenue).

### P5 — Écran d'invocation (~1 j)
- Deux onglets de bannière (vedette / standard), calendrier des prochaines vedettes.
- **Lueur graduée** avant la révélation (bleu ★3, violet ★4, or ★5).
- Compteurs de pity, 50/50 et points d'étincelle toujours visibles ; historique ; taux par bannière.

### P6 — Équipement des champions (~½-1 j)
- Pièces de lignée sur les **camps** et les **failles**, et en boutique d'éclats.
- ⚠️ Touche `ADV_GEAR.k` et la calibration des embuscades et sièges : à mesurer.

### P7 — Nouveaux champions (~½ j pour la chaîne, puis ~30 min par champion)
- Chaîne d'ajout : données, portrait (script existant), tests de roster, place dans le calendrier.
- Rythme cible ~2 ★5 (ou ★4) par mois, chacun vedette de sa semaine de sortie.
- ⚠️ Règle v0.939 : **jamais de ★3 en plus**.

**Total : ~6 à 7 jours.** Ordre imposé : P0 → P1 → P2 → P3 ; P4 à P7 dans n'importe quel ordre ensuite.

---

## Questions ouvertes (à trancher en P0)

- **Q-A — Armes en ★** : tu as dit « pareil pour les armes ? ». Proposition : l'**arme signature**
  est toujours ★5 ; l'**équipement de lignée** passe aussi en ★3/★4/★5 (aujourd'hui il suit les 8
  rangs). Ça rend tout lisible avec la même échelle, mais c'est une migration de plus.
  L'**équipement du héros** garde ses 8 rangs (il suit le sport, pas le gacha). OK ?
- **Q-B — Étincelle** : oui avec des points qui **ne s'effacent jamais** ? Seuil visé : un ★5
  choisi tous les ~2 mois pour un joueur qui ferme une faille par jour ?
- **Q-C — Comptes existants** : les 4 comptes gardent tout (champions, copies, niveaux) ; faut-il
  **offrir un geste** (tirages, ou des points d'étincelle) pour marquer la refonte ?
- **Q-D — Vedette ★5 inédite** : un champion ajouté est-il **tirable uniquement en vedette**
  pendant sa semaine de sortie, puis rejoint la standard ? (Ce n'est pas une exclusivité, juste un
  lancement.) Ou dans la standard dès le premier jour ?
- **Q-E — Écran à part** : l'invocation vit aujourd'hui dans le panneau du Panthéon. Avec les
  bannières, la boutique et l'historique, elle mérite **son propre onglet** dans l'Aventure. D'accord ?
- **Q-F — Niveau max par rareté** : même plafond de niveau pour un ★3 et un ★5 (comme dans le
  genre, la rareté ne joue que sur les stats), ou un ★3 plafonné plus bas ?

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

## Q-G — Lettres S / A / B au lieu des étoiles (demandé le 2026-09-21)

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
