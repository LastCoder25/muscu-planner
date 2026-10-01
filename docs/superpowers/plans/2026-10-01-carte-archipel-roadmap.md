# Carte de conquête : l'archipel — roadmap

> Conçue avec l'utilisateur le 2026-10-01. **Étape 0 faite (mesures), rien de codé.**
> Prochaine étape : **1 — le mode archipel, île 1**, sur le compte admin seul.
> Page visuelle (carte dessinée, tableaux) : https://claude.ai/artifact/JK5zL5fjbPojaXwpM8ZPJc

## Pourquoi

La carte unique s'étend et les trajets grandissent avec le niveau (×3 au niveau 100) : le jeu
devenait long à gérer et les lieux à attaquer trop loin. L'archipel garde chaque île petite,
fait avancer le joueur sans jamais régresser, et laisse derrière lui des îles qui ne demandent
plus rien.

## Le modèle

- **5 îles, une par tranche de 20 niveaux, deux rangs chacune.** L'île 1 est la carte actuelle.
  | Île | Niveaux | Rangs des lieux | Menace | Forteresse portuaire |
  |---|---|---|---|---|
  | 1 · Brigands | 1-20 | Bronze, Argent | 2 camps de brigands (pillent ce qui n'est pas récolté, attaquent les lieux fixes) | Le Fort des pillards |
  | 2 · Bêtes | 21-40 | Or, Or noir | 3 nids (un nid non détruit en fait naître un autre ; embuscades) | La Tanière-port |
  | 3 · Morts-vivants | 41-60 | Légendaire, Demi-dieu | 2 cimetières (les morts se relèvent) + la citadelle actuelle | Le Bastion des marées |
  | 4 · Seigneur de guerre | 61-80 | Divin, Divin ancestral | 3 camps de guerre, armée mobile qui vise le moins défendu, convois | Le Fort du seigneur |
  | 5 · Maudite | 81-100 | Divin céleste, Tout-puissant | 3 sanctuaires maudits (failles corrompues, invasions combinées) | La Citadelle maudite (puis sans fin) |
- **Une seule île active** : toute l'activité y vit, failles comprises (le gacha se farme là où
  on joue). Les lieux tirent leur rang comme aujourd'hui (jamais au-dessus du joueur), bornés
  à la tranche de l'île ; au-delà ils restent au plafond, ce qui pousse à avancer.
- **Une île en quatre temps** : débarquer au **port d'arrivée** (c'est la base de l'île) →
  prendre **2 avant-postes** sur le chemin → détruire les **objectifs secondaires** → abattre
  la **forteresse portuaire**, qui devient le port de départ.
- **Pacifier** = objectifs secondaires + forteresse détruits. Ensuite plus aucune attaque.
- **On ne recule jamais** : une base reste à toi (siège perdu = dégâts, réparation), une île
  débloquée reste ouverte.

## Les règles décidées

1. **Trajets** : plus de multiplicateur de niveau ; distance mesurée en part de l'île ; 2 h
   aller au maximum depuis un point tenu (4 h aller-retour). L'Avant-poste règle la vitesse.
2. **La récompense suit la difficulté**, pas la distance (déjà la règle depuis la v0.1153).
3. **Traversée** : ~2 h, **un départ chaque heure**, depuis la forteresse portuaire abattue.
   Pas de niveau minimum : la forteresse fait office de porte.
4. **Bâtiments en continuité** sur toutes les îles (même niveau, montent jusqu'au 100) ; un
   bâtiment propre à une île repartirait de zéro (probablement aucun). Panthéon et Guilde dans
   chaque base. **Ressources en stock unique.**
5. **Héros, champions et milice sont sur une île à la fois.** Un nouveau champion apparaît sur
   l'île active. **Milice : une réserve par île**, produite par la Caserne sur place, qui
   continue de produire quand le joueur est parti.
6. **Trêve de débarquement sans durée fixe** : le port n'est assiégé qu'une fois son enceinte
   prête (règle actuelle), puis au rythme du sport ; les avant-postes au rythme d'utilisation
   de la carte.
7. **Forteresse portuaire** : **verrou + affaiblissement**. Elle ne s'attaque qu'après 2
   objectifs secondaires détruits ; intacte, un rang au-dessus du plafond de l'île et une
   troupe de 12 ; chaque objectif détruit la fait redescendre ; tous détruits, une troupe de
   **8 champions de référence au plafond de l'île**.
8. **Objectifs secondaires** : troupes de **3** (les premiers), puis **4** (les derniers).
9. **Récompenses** : forteresse abattue → runes (couleur selon l'île) + sceaux d'ascension au
   rang de l'île ; premier débarquement → l'équivalent de **10 tirages en pierres de mana**
   (dérivé du prix d'un tirage). Jamais d'XP ni de tickets sur la carte.
10. **Île pacifiée** : ses **spécialités produisent à plein** ; le **socle (mine, source de
    mana) à 25 %, sans crans**.
11. **Mine tenue recalée** à un passage toutes les **24 h** (au lieu de 8 h), **en même temps
    que l'archipel, pas avant**.
12. **Comptes existants** : tout le monde repart de l'île 1 ; bâtiments conservés, lieux tenus
    compensés.
13. **Donjons, boss, Labyrinthe restent à part.**
14. **Mis de côté** : hameaux, quêtes, hôpitaux de campagne.
15. **Développement en parallèle sur le compte admin** (interrupteur), étoffé au fur et à
    mesure ; bascule de tous les comptes à la fin.

## Les lieux fixes

Aucun ne s'améliore : production selon l'effectif (jusqu'à 5, champions et miliciens ; camp :
3 champions) et les crans d'ancienneté (jusqu'à 10, +5 % chacun). ⚠️ Aujourd'hui un lieu tenu
produit au **niveau du héros** ; dans l'archipel il produira au **rang de son île**.

**Existants** (débits actuels) : ⛏️ mine d'or (une mission de mine / 8 h, à recaler à 24 h) ·
🎯 camp d'entraînement (XP champions + pièces, la forge y est fusionnée) · 🌿 jardin
(consommables) · 🗼 tour de guet (−20 % trajets, préavis +50 %) · 📜 scriptorium (runes) ·
⛲ source de mana (½ faille refermée / jour).

**À inventer** (débits décidés à l'étape 0) :
| Lieu | Produit | Débit | Apport mesuré |
|---|---|---|---|
| 📖 Archives | Clés du Labyrinthe | 1 entrée du palier de l'île / 2 jours | +20 à +24 % |
| 💀 Ossuaire | Sceaux de champion au rang de l'île | 1 / 3 jours | +13 % |
| 🛡️ Arsenal | Sceaux d'objet au rang de l'île | ⅙ de ruine / jour | +20 % |
| 🔮 Sanctuaire d'invocation | Pierres d'invocation | 1 tentative de boss / 2 jours | +18 % |
| 🪬 Autel des runes | Runes multicolores à partir du bleu | 1 / 2 jours | modéré |

**Répartition** (socle mine + camp + source de mana sur chaque île ; 2 lieux sur le chemin
servent d'avant-postes) :
- Île 1 : mine, camp, source de mana, jardin, tour de guet, scriptorium (la carte actuelle).
- Île 2 : socle + tour de guet + **archives**.
- Île 3 : socle + jardin + **ossuaire**.
- Île 4 : socle + **arsenal** + **sanctuaire d'invocation**.
- Île 5 : socle + scriptorium + **autel des runes**.

## Étape 0 — mesures (2026-10-01)

Faites sur les vraies fonctions (`campWinPct` avec champions de référence équipés, 120 combats
par case ; `stonesPerDay`, `fullGoldPerDay` ; débits des sources actuelles). Sonde supprimée.

- **Forteresse affaiblie au max (troupe 8, au plafond de l'île)**, % de victoire selon
  l'équipe au plafond : 5 champions **0 / 28 / 8 / 5 / 2 %** (îles 1→5), 8 champions
  **97 / 100 / 100 / 88 / 96 %**. Équipe 10 niveaux sous le plafond : 12 champions 71-100 %.
  **Intacte (rang au-dessus, troupe 12)** avec 12 champions : **0 / 0 / 8 / 51 / 82 %** — un
  rang pèse peu en fin de partie, d'où le verrou.
- **Objectifs secondaires** (niveau du joueur) : troupe 3 → 3 champions 86-100 %, 2 champions
  0-28 % ; troupe 4 → 3 champions 3-81 %, 5 champions 99-100 %.
- **Rente des îles pacifiées** (1 mine + 1 source chacune), en part du revenu complet / de 2
  failles par jour : pleine cran 10 → or **+39 % (niv 30) à +247 % (niv 90)**, mana +27 à
  +87 % ; socle à 25 % sans cran → or **+7 à +41 %**, mana **+4 à +15 %** (retenu).
- **⚠️ Déjà aujourd'hui** : la mine tenue à 3 (niveau du héros) rend **48 % du revenu complet
  au niveau 30, 94 % au 50, 136 % au 90**, hors modèle `goldSink`. Recalage à 24 h prévu avec
  l'archipel (16 à 46 %).
- **Trajets** sans facteur de niveau : 30 min à 25 unités, 1 h à 35, **2 h à 54** d'un point
  tenu → rayon d'une île.
- **Milice par île** (Caserne au niveau du joueur) : 11 (niv 20) · 18 · 25 · 31 · 38 (niv 100).
- **Champions** (joueur régulier, vrai tirage) : 3 (niv 10) · 9 (20) · 15 (30) · 20 (40) ·
  26 (60) · 30 (80) · 32 (100).

## La roadmap

### Fondations
- [x] **0. Conception figée** (~2 j) — mesures ci-dessus, décisions prises.
- [ ] **1. Le mode archipel, île 1** (~3 j) — interrupteur admin (ce compte seul) ; la carte
  devient l'île 1 : rangs plafonnés à Argent, trajets sans multiplicateur de niveau, Avant-poste
  = vitesse ; production des lieux au rang de l'île ; vue d'ensemble de l'archipel.
- [ ] **2. Pacifier l'île 1** (~4 j) — objectifs secondaires (camps de brigands), forteresse
  portuaire (verrou, affaiblissement, calage), île pacifiée (plus d'attaques ; spécialités à
  plein, socle à 25 % sans crans), recalage de la mine tenue à 24 h.

### Traverser
- [ ] **3. La traversée et l'île 2** (~5 j) — héros/champions/milice rattachés à une île,
  traversée avec un départ chaque heure, débarquement, base au port, zone jouable à portée des
  points tenus, avant-postes, récompenses (forteresse, premier débarquement).
- [ ] **4. Les menaces de l'île 2** (~3 j) — nids qui se multiplient, embuscades ; archives.

### Étoffer
- [ ] **5. Îles 3, 4 et 5** (~3-4 j chacune) — une à la fois, quand le compte admin y arrive.
- [ ] **6. Équilibrage du niveau 1 au 100** (~3 j) — parties simulées complètes (économie,
  défense, durée de chaque île, 5 îles de rente).
- [ ] **7. Bascule de tous les comptes** (~2 j) — départ de l'île 1, compensation.
