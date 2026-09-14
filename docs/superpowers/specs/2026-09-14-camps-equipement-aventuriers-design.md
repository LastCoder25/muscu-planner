# Camps de faction, équipement des aventuriers, combat de groupe — conception

Date : 2026-09-14 · Statut : validée en discussion, à relire avant le plan

Regroupe trois points de la todo : « Camps de bandits / morts-vivants / monstres », « équiper les
aventuriers » et « convois sur les lieux de combat ».

## Décisions prises avec l'utilisateur

| Question | Décision |
| --- | --- |
| Nature d'un camp | Combat de groupe simple (pas de fortification) |
| Place sur la carte | Remplace les camps et repaires actuels |
| Butin sans le héros | Équipement destiné aux aventuriers |
| Forme de l'équipement | Stock à part du sac du héros, rareté plafonnée par la classe |
| Spécificité | Équipements différents selon la classe de base |
| Sources | Camps sans héros, fouille après siège, embuscades de convoi repoussées, bâtiment Équipementier |
| Déroulé d'une attaque | Comme un convoi : temps réel, zéro énergie |
| XP | Partagée au prorata des ennemis abattus, camps ET embuscades de convoi |

## Découpage en trois étapes livrables

Chaque étape passe les 5 portes (typecheck, lint, tests, build, smoke) et a sa version.

1. **Équipement des aventuriers** — sans lui les camps n'ont rien à rapporter.
2. **Combat de groupe + XP partagée** — le moteur, branché d'abord sur les embuscades de convoi.
3. **Camps de faction** sur la carte.

## Étape 1 — Équipement des aventuriers

### Modèle

- Stock **séparé** du sac du héros (colonne JSONB additive sur `characters`, migration 0067) :
  le héros ne porte pas ces objets, les aventuriers ne portent pas les siens.
- Chaque aventurier porte au plus **3 pièces** (arme, armure, accessoire), rangées sur sa fiche.
- **Rareté plafonnée par la classe** : même règle que `canAdvTalent` / `canAdvFamiliar` — une
  pièce ne dépasse pas la rareté de la classe de son porteur ; chaque promotion ouvre la suivante.
  Lue par le combat (une pièce devenue trop rare ne compte pas), le sélecteur et le store.
- **Axes de magnitude** : rareté + jet + niveau d'objet, comme les objets du héros (mêmes
  helpers `rankRollMult`, `itemLevelMult`).

### Équipement propre à chaque classe de base

Une pièce appartient à une **lignée** (la classe de base, `path[0]`) et ne se porte que par un
aventurier de cette lignée. Chaque lignée a ses trois pièces, leur nom et leur réserve de stats,
alignées sur la forme de la classe :

| Lignée | Arme | Armure | Accessoire | Stats privilégiées |
| --- | --- | --- | --- | --- |
| ⚔️ Guerrier | Épée | Cuirasse | Gantelets | dégâts, PV, critique |
| 🏹 Archer | Arc | Cuir | Carquois | critique, dégâts, élan |
| 🔮 Mage | Bâton | Robe | Grimoire | dégâts, exécution, vol de vie |
| 🛡️ Homme d'armes | Masse | Plates | Bouclier | réduction, PV, épines |
| 🧭 Éclaireur | Dague | Cape | Longue-vue | critique, dégâts + trajet raccourci |
| 🐫 Caravanier | Bâton de marche | Manteau | Bât | PV, réduction + cargaison |

Pas de nouvelle stat : toutes les pièces puisent dans les `EffectType` existants.

- Les deux lignées civiles portent en affixe mineur un **bonus de rôle** (trajet −x %,
  cargaison +x %), borné par les mêmes plafonds que les rôles de classe — c'est ce qui rend
  leur équipement désirable sans en faire des combattants.
- Le tirage d'une pièce choisit une lignée (parmi celles présentes dans le vivier, pour ne pas
  remplir le stock d'objets que personne ne peut porter).

### Effets et équilibrage

- Les effets sont lus par **une seule fonction** partagée entre route et rempart (même principe
  que `companionEffects` : un chiffre affiché = le chiffre du combat).
- ⚠️ **À recaler, mesures à l'appui** :
  - l'escorte de référence de `roadFoe` (comme `refCompanions` pour les familiers) — sinon la
    décision « combien j'envoie » disparaît ;
  - la tenue des sièges (le vivier pèse désormais +16 à +27 points) ;
  - `goldSink` : un 11ᵉ bâtiment approfondit le puits d'or (`plotCap` dérivé du roster).

### Sources

1. **Camp pris sans le héros** : source principale (étape 3).
2. **Fouille des corps après un siège** : un tirage de pièce d'aventurier dans `lootCorpses`.
3. **Embuscade de convoi repoussée** : une chance de pièce (jamais d'objet du héros).
4. **Équipementier** (nouveau bâtiment) : transforme un objet du héros en pièce d'aventurier,
   pour une lignée choisie ; temps de fabrication (asymptotique en niveau, jamais instantané) ;
   rang tiré autour du niveau de l'aventurier visé (pyramide des drops). Aucun niveau mort
   jusqu'à 100 (`beyondCap`).

### Écrans

- Fiche d'aventurier (Guilde) : trois emplacements, sélecteur filtré (lignée, rareté permise,
  non porté ailleurs), puissance recalculée avec l'écart apporté.
- « Confier au mieux » étendu à l'équipement.
- Stock d'équipement d'aventurier : vendre / recycler, 🔒 comme le sac.

## Étape 2 — Combat de groupe et XP partagée

- **Un moteur** (`src/lib/skirmish.ts`, pur/testé) : groupe du joueur (héros et/ou aventuriers,
  chacun avec compagnon, talent, équipement) contre une troupe. Unités distinctes, PV reportés,
  ciblage simple, **journal des morts** (qui a abattu qui).
- **Danger absolu** : la troupe dépend du niveau du lieu et de sa taille, jamais du groupe envoyé.
  Calibrée sur un groupe de référence équipé (3 aventuriers de la lignée de référence).
- **XP** : chaque ennemi abattu vaut de l'XP ; le total est **partagé entre les membres
  présents**, avec le rendement décroissant de `missionXp` (un vétéran sur un lieu faible gagne
  peu, et ne fait pas monter les recrues à sa place).
- **Embuscades de convoi** : passent sur ce moteur et cette règle d'XP (remplace le bonus
  forfaitaire par combat traversé).

## Étape 3 — Camps de faction

- **Carte** : `camp` et `lair` deviennent des camps de faction (bandits, bêtes, morts-vivants),
  rosters repris de `raid.ts`. Camp = troupe + chef ; repaire = troupe plus grande + champion.
  Niveau dérivé de la distance (règle v0.683 inchangée).
- **Répartition** : de tout un peu partout — faction et taille (camp / repaire) tirées
  uniformément, sans biais de région ni de distance (seul le niveau suit la distance).
- **Taille de camp** : variable ; certains gros camps demandent de nombreux aventuriers. La
  troupe reste à danger ABSOLU (fixée par le niveau et la taille du camp).
- **Envoi** : on choisit le héros (oui/non) et **autant d'aventuriers disponibles qu'on veut —
  aucune taille maximale de groupe** (pour pouvoir affronter les gros camps). Le vivier
  disponible est la seule limite. Départ comme un
  convoi : trajet en temps réel, zéro énergie ; le héros présent est en expédition jusqu'au retour.
  `poiOffers` s'ouvre aux camps pour les groupes.
- **Butin** :
  - avec le héros : butin actuel (camp → objet, repaire → pièce de set + pierres) ;
  - sans le héros : or, ferraille, clés, pierres, **pièce d'aventurier**.
- **Défaite** : aventuriers à l'infirmerie ; le héros rentre sans butin (échec d'expédition
  actuel), sans blessure.
- **Rapport** (boîte 📬, encaissé au retour) : groupe, abattus, XP de chacun, journal. Mise en
  scène animée : plus tard.

## Hors périmètre (v1)

- Rejeu animé du combat de groupe.
- Siège inversé (camps fortifiés).
- Plus de trois emplacements par aventurier.

## Tranché après relecture

- Esquive : non, pas de nouvelle stat (Éclaireur = critique, dégâts, trajet).
- Taille de groupe : aucune limite pour les camps. ⚠️ Les convois gardent `escortMax` (leur
  calibration mesurée en dépend) ; seuls les camps en sont libérés.
- Répartition : de tout un peu partout (tirage uniforme faction × taille).
