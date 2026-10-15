# CLAUDE.md — Appli muscu

Brief lu à chaque session. Source de vérité du projet. À tenir à jour quand l'archi évolue.

## Le projet en une phrase

Appli mobile-first de suivi de musculation : créer/importer des séances selon le profil, les exécuter en live (timer, switch d'exo, note d'effort 1–4, commentaires dictés), et générer la séance suivante soit par un moteur déterministe interne, soit via une IA externe — les deux partageant le même contrat JSON.

## Stack

- **Front** : Quasar (Vue 3, `<script setup>`, Vite, TypeScript strict, Pinia).
- **Back + BDD + Auth** : Supabase (Postgres + RLS + Auth email).
- **Hébergement** : front statique sur Vercel (Hobby, build `quasar build`, sortie `dist/spa`). Pas de serveur applicatif.
- Cible : mobile d'abord (usage en salle, grosses cibles tactiles, mains moites).

## Règle d'or

`src/lib/types.ts` est la traduction du **contrat JSON v1.0** et fait autorité. Quatre types de documents : `profile`, `session` (le plan), `session_log` (le bilan), `coach_request` (l'enveloppe d'export IA). Ne jamais diverger de ces structures sans mettre à jour types.ts ET le schéma SQL ensemble. Tout est versionné par `schema_version`.

## Architecture mentale

Le moteur déterministe et l'IA externe prennent la **même entrée** (`coach_request` = profil + historique) et rendent la **même sortie** (`session`). L'app importe une `session` sans savoir d'où elle vient. On démarre 100 % moteur déterministe ; l'IA n'est qu'un fallback pour casser un plateau.

## Couche d'adaptation par niveau (essentiel)

`profile.experience.level` → `level_config` (`src/lib/levelConfig.ts`) → pilote progression, signal d'effort, profondeur d'historique, mode de création. C'est le point UNIQUE où un débutant (progression linéaire, note 1–4 seule, programme généré, UI guidée) et un avancé (double progression + RIR affiché, import libre, UI dense) divergent. **Jamais de code dupliqué par niveau** : on lit `level_config`. Dérivé du niveau, **sans surcharge** : `overridable` a été retiré en v0.1202 (aucun code ne permettait d'écraser un champ), comme `ui_density`/`auto_deload` en v0.1099.

## Ce qui existe déjà

```
src/lib/
  types.ts         contrat JSON en TS — NE PAS contourner
  supabase.ts      client unique (process.env.SUPABASE_URL / _ANON_KEY)
  levelConfig.ts   deriveLevelConfig(level)
  progression.ts   nextSessionDeterministic(plan, lastLog, cfg, history?, opts?) — moteur déterministe. **Plateau sur 3 séances** (2026‑08‑15) : deload si échec sous reps_min sur ≥2 des 3 dernières séances, OU **stagnation** (charge identique + meilleures reps « plates » ±1 sur 3 séances sans atteindre reps_max) → casse le palier (linéaire −10 %, double −5 %). **Décharge planifiée** via `opts` (`ProgressionOpts` : `muscuSessionCount`, `deloadEvery`) : une séance sur `deloadEvery` (BilanPage : `round(sessions_per_week×5.5)`, borné 8–24 → ~5,5 semaines) est allégée (−10 % charge, −1 série/exo) et marquée « · Décharge » (BilanPage affiche une note). `history` = historique COMPLET (BilanPage passe `logs.fetchAll`). Tests `test/progression.test.ts`.
  programBuilder.ts buildProgram(profile, library, split?) — génère les séances selon une **découpe** (`src/data/splits.ts`, `SplitOption`/`SPLIT_CATALOG` 2→6 séances : full-body, PPL, haut/bas, par zones… ; `splitsFor(n)`, `defaultSplit(n,level)`). Les exos sont répartis par muscle dans le(s) jour(s) ciblant ce muscle (round-robin entre jours équivalents, ex. full-body ou « Haut » ×2 ; sinon jour le moins rempli). Choix de la découpe à la génération (onboarding étape 8 + ProfilePage « Régénérer » → sheet). Plafond 6 séances/sem.
    Détails sélection : volume/muscle (objectif+niveau), ajusté par les sports (équilibrage) et priorités, exos filtrés par matériel. Filtrage = l'exo est retenu si TOUS ses atomes `equipment_required` sont possédés (poids du corps = ensemble vide). Atomes : barbell, rack, bench, dumbbells, kettlebell, bands, cable, machine, pullup_bar, dip_station (cf. EquipmentItem + migration 0003). Biblio enrichie à 45 exos. Anciens profils migrés via `migrateEquipment` (profileForm). **Unité** : `exercises.unit` (`reps` défaut / `time`) → `ExerciseTarget.unit` ; pour `time` (gainage), `reps_min/max` = **secondes**, générées 30–60 s, affichées « s » (détail/live/bilan/libre), progression `fixed`. Migration 0006. **Niveau** : `exercises.difficulty` (1/2/3) ; débutant plafonné à 2 (fallback si rien), d'où variantes assistées élastique (tractions/dips assistés, migration 0004). **Unilatéral** : `exercises.unilateral` (migration 0010 ; Fentes, Rowing haltère/kettlebell) → `PlannedExercise.unilateral`/`LiveExercise`/`LoggedExercise`. Durée `estimateDurationMin` ×2 côté exécution ; badge « par côté » (détail/live/libre/bilan). Une série = les deux côtés. **Favoris / aimés moins** : `Profile.favorite_exercises` priorisés et `Profile.disliked_exercises` relégués en dernier (rank 0/1/2 dans `pickForMuscle` : exclusion **douce** — l'exo « aimé moins » n'est choisi que faute d'alternative, jamais retiré). Édités dans ProfilePage (panneau Musculation). À distinguer de `constraints.avoid_exercises` = exclusion **dure**.
  prepaBuilder.ts  buildPrepaSession(profile, prepaLibrary, {duration,level}) — générateur déterministe de **prépa physique** (tennis & co). Ne raisonne PAS par volume musculaire mais par **blocs de patterns** (activation → puissance/pliométrie → agilité/déplacement → gainage/rotation → force/équilibre), 1 activation + round-robin (max 2/bloc) jusqu'à ~durée/5 exos. Sort une `Session` `discipline='prepa_physique'`, source 'engine', tout en poids du corps → **réutilise le moteur muscu** (SessionDetail/Live/Bilan/Historique/Stats). Exos = `exercises.category='prepa_physique'` + `tags[]` (migration 0015, ~16 exos tennis), exclus du générateur muscu. Filtre matériel/niveau/favoris comme programBuilder. Hub : `TennisPage` (`/tennis`).
  drills.ts        buildCourtSession(catalog, {theme,duration,withPartner,level,equipment}) — générateur déterministe de **séance de tennis sur le court** (domaine distinct : coup/figure/partenaire, PAS muscle/charge → types dédiés `DrillSession`/`PlannedDrill`). Structure échauffement → thème → complément → déplacement → jeu (si partenaire) → retour au calme ; catalogue global `drills` (migr. 0016). **Avec partenaire → priorise les drills `partner_required`**. **Filtrage matériel** : raquette/balles/filet supposés ; `equipment` = matériel possédé (panier, machine, mur, cible, plots), une **machine à balles remplace le panier** ; rien = « sans matériel ». Matériel mémorisé dans `profile.preferences.court_equipment` (persisté au wizard). `PlannedDrill.description` (descriptif) + `notes` (conseil) affichés sur aperçu/détail/runner, avec **schéma SVG de trajectoire** `src/components/CourtDiagram.vue` (demi-court + flèches selon pattern/shot/catégorie, miroir pour le revers ; `hasCourtDiagram()` décide de l'affichage) sur la fiche détail et le runner. Store `src/stores/tennis.ts`, écrans `CourtNewPage`/`CourtSessionDetailPage`, libellés + `COURT_EQUIPMENT` `src/data/tennis.ts`.
  tennisCoach.ts   buildCourtPrompt/buildPrepaPrompt + parseDrillSession(raw, catalog) — pont IA tennis, parseur tolérant (rattachement au catalogue par score, id ad-hoc sinon). Utilisé par CourtNewPage (mode IA) ; la prépa IA réutilise parseImportedSession.
  coach.ts         buildCoachRequest(...) + validateImportedSession(raw)
  importSession.ts parseImportedSession(raw, library) — import IA tolérant : strict (coach) → JSON « lâche » → **texte libre** (`parseWorkoutText` : format ChatGPT « 40 kg ×8 — 1 min », en-têtes emoji, back-off, notes 👉) ; enrichissement biblio par **score** (`findLib` : exact>commence par>contient, le plus proche gagne — « Squat »→« Squat barre », pas « Goblet squat ») ; gainage→secondes ; **prescription par série** préservée (pyramide), cf. `PlannedExercise.prescription` — **charge + reps + `rest_seconds` propres à chaque série** (repos croissant) ; `live.start` pré-remplit chaque `LiveSet` (dont son repos), le timer de repos utilise le repos de la série validée, `estimateDurationMin` somme les repos par série, le détail affiche la plage « repos 1–4 min » ; **sous-blocs modificateurs** (`isModifierBlock` : back-off, pause, drop-set, rest-pause, tempo…) **rattachés à l'exo précédent** (mêmes séries, autre protocole → pas d'exo bidon ; label conservé en notes)
  estimates.ts     estimate1RM(load,reps) (Epley) + bestE1RM(performed) — prépare le Bilan (Étape 4.1)
src/data/
  exerciseInstructions.ts  instructions de mouvement FR (débutant : étapes + conseil) par exo ; `exerciseInstructions(id)` → affichées sur la fiche (fallback si pas de `payload.instructions`).
  exerciseImages.ts  illustrations d'exercices (free-exercise-db, domaine public) mappées sur ~62 exos (muscu + conditionnement/challenge + prépa physique ; quelques exos sans correspondance propre — burpees, montées de genoux, jumping jacks, corde à sauter, footwork tennis — gardent l'icône), bundlées dans `public/exercises/<id>.jpg` (pose 0) + `<id>-1.jpg` (pose 1) ; `exerciseImage(id)` (pose 0, fallback statique) et `exerciseFrames(id)` → `[pose0, pose1]`. **Animation d'exécution** = bascule photo départ↔fin des 2 poses, rendue par `src/components/ExerciseAnim.vue` (crossfade CSS en ping-pong, `prefers-reduced-motion` → pose figée). Régénérées par `node scripts/fetch-exercise-frames.mjs` (mapping exo→dossier free-exercise-db inclus dans le script). Affichée sur la fiche exo (ExercisePage), l'exo courant de la séance libre et l'aperçu du wizard de challenge ; tuiles de séance libre = image fixe (fallback icône MDI matériel + couleur muscle si absente). *(un essai de bonhomme SVG procédural — figure.ts/exercisePatterns.ts — a été abandonné : rendu peu lisible.)*
supabase/
  migrations/0001_init.sql   4 tables + RLS (à appliquer dans Supabase)
  seed.sql                   bibliothèque d'exercices globale
docs/
  contrat-json-v1.md         le contrat complet (référence)
  design-system.md           tokens, fonts, mapping Quasar, interactions
  seance-live-mockup.html    référence visuelle de l'écran live
  specs/01..04               specs détaillées par écran
  PROMPTS.md                 prompts à coller, phase par phase
```

Stratégie de stockage : **JSONB canonique + colonnes indexées extraites**. On garde le payload JSON brut pour le round-trip parfait avec l'IA.

**Pour construire** : suivre `docs/PROMPTS.md` (phase 0 → 4), chaque phase s'appuyant sur la spec correspondante dans `docs/specs/`.

## Conventions de code

- TypeScript strict. Named exports. Composition API `<script setup lang="ts">`.
- Toute la logique métier vit dans `src/lib/` (pur, testable), jamais dans les composants.
- State partagé via Pinia stores (`src/stores/`). Accès Supabase centralisé (pas d'appels bruts éparpillés).
- Pas de secret en dur. La clé `anon` est publique (la sécurité = RLS), c'est OK côté client.
- Migrations Supabase **additives** et numérotées (`0002_...`). Ne jamais éditer une migration déjà appliquée.

## Design system (depuis la maquette validée)

Direction « panneau de contrôle d'équipement ». Voir `seance-live-mockup.html` (fourni) comme référence visuelle.

- **Palette** : `--bg #15120E`, `--surface #211C16`, `--line #3A332A`, `--text #F3EEE6`, `--dim #9A8F7E`, accent **jaune voltage `#FFD23F`**. Notes d'effort : d1 `#7BC86C`, d2 `#C6D24A`, d3 `#FFB23F`, d4 `#FF6A45`.
- **Typo** : Oswald (chiffres, titres, timer) + Inter (UI).
- **Écran live — comportements clés** : timer de repos radial qui prend le dessus après validation ; steppers ±2,5 kg / ±1 rep (pas de clavier) ; sélecteur de note **1–4** dans le bloc « ressenti » ; switch d'exo avec onglets **Suggestions** / **Séances passées** (charge conservée) ; dictée micro pour les commentaires ; CTA collant « Valider la série ».

## Feuille de route (construire dans cet ordre)

1. **Auth + onboarding** : login Supabase (email) ; formulaire profil (identité, niveau, objectif, dispos, matériel, contraintes, préférences) → écrit `profiles`, dérive `level_config`, puis bifurque : débutant → « on génère ton premier programme » ; avancé → « importe ou construis ton programme ».
2. **Séance live** : la maquette branchée sur Supabase, écrit un `session_log` à la fin (note 1–4 par série, `swapped_from`, commentaires).
3. **Bilan** : prévu vs réalisé + bouton export `coach_request` (copier vers ChatGPT) + import du JSON renvoyé via `validateImportedSession`.
4. **Historique + génération** : liste des séances, déclencher `nextSessionDeterministic`.

## Spécificités d'environnement (poste Windows/Orange) — IMPORTANT

Décisions prises en Phase 0, contraintes par le poste. À respecter dans les phases suivantes.

- **Registre npm** : le global pointe sur l'Artifactory Orange (`repos.tech.orange`), injoignable hors réseau pro. Un `.npmrc` **local au projet** force `registry.npmjs.org`. Ne pas le supprimer. Hors du dossier projet, passer `--registry=https://registry.npmjs.org/`.
- **AppLocker** : la group policy bloque l'exécution de tout `.cmd`/`.exe` hors `Program Files` (donc les shims de `node_modules/.bin` et le cache npx). Conséquences :
  - Les scripts `package.json` sont routés via `node node_modules/<pkg>/bin/...` (jamais `quasar`/`eslint`/`vue-tsc` directement). Garder ce pattern pour tout nouveau script.
  - Pour lancer la CLI Quasar manuellement : `node node_modules/@quasar/app-vite/bin/quasar.js <cmd>`.
  - `vite-plugin-checker` retiré de `quasar.config.ts` (il spawnait vue-tsc/eslint en sous-process bloqués). Type-check = `npm run typecheck`, lint = `npm run lint`.
- **Env client (app-vite v3)** : les variables d'env sont exposées via **`import.meta.env.X`**, PAS `process.env.X` (la doc historique du repo est dépassée sur ce point). `quasar.config.ts > build.env.clientPrefix = ['QCLI_','SUPABASE_']` expose les `SUPABASE_*`. `supabase.ts` lit `import.meta.env`. Toute nouvelle var client doit être préfixée et typée dans `env.d.ts`.
- **tsconfig** : `exactOptionalPropertyTypes` désactivé dans `tsconfig.json` racine pour intégrer `src/lib` sans le réécrire. `strict: true` conservé.
- **Supabase** : projet « Muscu », ref `wzbxbntqlheelgqswzew` (eu-west-1). Géré par l'agent via la **Management API REST** (`api.supabase.com/v1/projects/<ref>/database/query`) appelée en `node` + PAT dans `.supabase-token` (gitignoré). Schéma `0001_init.sql` + `seed.sql` (29 exercices) déjà appliqués. **Auth email** : `mailer_autoconfirm = true` (signup → session immédiate, pas de lien email à confirmer).

## Mémoire du projet, par domaine

Le détail des décisions, réglages et mesures vit dans `docs/domaines/` (un fichier par domaine,
entrées datées et versionnées). ⚠️ **Lire le fichier du domaine AVANT de toucher à un système** :
c’est là que sont écrits les invariants mesurés, les pièges déjà rencontrés et les décisions de
l’utilisateur. Une nouvelle décision s’ajoute À LA FIN du fichier de son domaine, pas ici.

- [docs/domaines/architecture.md](docs/domaines/architecture.md) — Architecture et technique (stores, pages, layouts, PWA, tests, nav, thèmes, versionning) (29 entrées)
- [docs/domaines/social.md](docs/domaines/social.md) — Amis, boss entre amis, classement, notifications push (33 entrées)
- [docs/domaines/sport.md](docs/domaines/sport.md) — Sport : Défi 360, challenges, séances, cardio, tennis, suivi corporel, accueil, stats, agenda, météo (57 entrées)
- [docs/domaines/champions-gacha.md](docs/domaines/champions-gacha.md) — Champions, gacha, invocation, runes, éveil, ascension, sceaux, aventuriers, Panthéon (156 entrées)
- [docs/domaines/base-sieges.md](docs/domaines/base-sieges.md) — Base, enceinte, sièges, garnison, milice, bâtiments de la cour (81 entrées)
- [docs/domaines/carte-expeditions.md](docs/domaines/carte-expeditions.md) — Carte d’expédition, lieux, failles, camps, convois, points de contrôle, archipel, Labyrinthe (131 entrées)
- [docs/domaines/heros-equipement.md](docs/domaines/heros-equipement.md) — Héros : équipement, raretés, drops, sets, talents, familiers, reliques, trophées, combat, donjons, boss de palier (77 entrées)
- [docs/domaines/divers.md](docs/domaines/divers.md) — Interface transverse et économie (plateau de ressources, boîte à messages, puits d’or, gestes de masse) (62 entrées)

- **🔎 UNE PROPOSITION DU 🪄 S’OUVRE COMME UN ENVOI MANUEL (v1.223.0 ; demandé par l’utilisateur : « choisir une simulation et l’afficher comme si elle était manuelle pour choisir les consommables »)**. Bouton « 🔎 Ouvrir » sur chaque tuile du planificateur : `openPlannedRow` (ExpeditionMapPage) sélectionne le lieu (relu sur la carte) et `prefillTeam` (useExpeditionParty) y pose l’équipe proposée — champions de tous les groupes (plusieurs départs redonnent l’attaque combinée), héros, consommables du plan — à modifier avant de lancer depuis la fiche. ⚠️ L’équipe est posée PAR les watchers de remise à zéro de la sélection (sinon ils l’effaceraient aussitôt). Smoke : gestes `plan-rouvrir` / `plan-calcul` / `plan-ouvrir` (facultatifs) ; montage : bouton présent (1 mutation, 1 rouge).

- **🧝🔙 LE HÉROS RENTRE À SON POSTE APRÈS UN DEMI-TOUR (v1.224.0 ; signalé par l’utilisateur : « envoyé en interception, demi-tour, il a fini à la base au lieu de son point de départ », puis « grosse passe sur le héros qui se téléporte »)**. Cause : le demi-tour d’une attaque combinée EN PRÉPARATION (`recallAttack`) reconstruisait le voyage du héros SANS `homeHero` — or `heroHomePostId` exigeait ce champ (sa place gardée était libérée au tick suivant par `syncHeroAway`) et `expeSettle` aussi (pas de `heroBackToPost`) : il réapparaissait à la base sans marcher. Correctif en trois points : (1) la place gardée au poste garde aussi son instantané (`ControlState.heroAwayUnit`, posé par `unpostHero(…, keepSeat)`, levé avec `heroAway`) ; (2) `recallAttack` le remet en `homeHero` ; (3) `homeId` SUFFIT désormais à dire où revient le héros (`heroHomePostId`, `expeSettle`), `heroBackToPost` prend l’instantané gardé quand le voyage n’en a pas. ⚠️ Passe faite : `expeSettle` est le SEUL point où un voyage du héros se termine (les groupes d’une attaque combinée mettent toujours le héros dans le groupe principal, donc dans `expedition`). Un test existant (`heroAwaySeat`) verrouillait la règle fautive (« sans homeHero, aucun poste ») : réécrit. Tests `heroRecallPost.test.ts`, 5 mutations, 5 rouges.

## Garde-fous

### 📉 TRAFIC SORTANT SUPABASE — on n'écrit plus en relisant la ligne (v1.134, mesuré)

Le compte gratuit dépassait son quota de trafic sortant (5 Go/mois) alors que la base ne pèse
que 21 Mo. Cause : `persist` relisait la ligne `characters` ENTIÈRE après chaque écriture
(`.select(COLS)`, jusqu'à 200 Ko de JSON), et la table compte ~5 000 écritures par jour
(528 000 depuis juin) — ~0,5 Go/jour estimé. `persist` ne relit plus que `updated_at` et
fusionne le patch (`writtenEcho`/`mergeWritten`, `src/lib/characterWrite.ts`). ⚠️ Ne jamais
remettre `.select(COLS)` sur une écriture fréquente. ⚠️ Ce qu'un autre appareil écrit entre-temps
n'arrive plus qu'au prochain `fetchMine`. La boîte 📬 ne garde le détail du duel de gardien
(`party.rift.boss`) que sur les `REPLAY_KEEP` (10) rapports les plus récents ; au-delà le
gardien se rejoue en un coup.

### 🧹 CODE MORT — `npm run dead` (knip, v0.747)

`knip.json` + script `dead` (`node node_modules/knip/bin/knip.js`, AppLocker-safe). **Doit rendre
zéro ligne** ; c'est une porte de plus, à passer lors d'un ménage ou avant de retirer une feature.

- **Première passe mesurée** : 34 exports + 23 types exportés sans importeur, 4 vrais cadavres
  (`LEVEL_MARGIN`, `dropMagnitude`+`MAGNITUDE_PER_LEVEL`, `advRankLabel`, le ré-export
  `ObjectiveOption`), `vite-plugin-checker` encore listé (retiré de la config depuis la Phase 0).
  **110 symboles dé-exportés** (ils restent, privés à leur module) : un `export` que rien
  n'importe ment sur la surface publique du module, et knip ne peut plus rien dire des VRAIS
  morts derrière ce bruit.
- ⚠️ **Dé-exporter ≠ supprimer.** Après la dé-exportation, c'est `npm run lint`
  (`no-unused-vars`) qui désigne les cadavres — 4 sur 110, tous les autres sont utilisés dans
  leur fichier. Supprimer sur la seule foi de knip aurait cassé le build.
- **Exceptions VOULUES, déclarées dans `knip.json` (pas ignorées à la main)** : entrées hors
  graphe Vite (`public/pwa-sw.js`, `scripts/*.mjs`, `supabase/functions/*/index.ts`,
  `postcss.config.js`) ; `src/data/worldBoss.ts` + `src/stores/worldBoss.ts` **dormants par
  décision** (boss mondial sans UI, cf. Aventure) ; `@quasar/extras` (référencé par chaîne dans
  `quasar.config.ts`) ; `npm` = le spécificateur Deno `npm:web-push` de l'edge function. Et par
  tag JSDoc : `/** @public */` sur `PUSH` (contrat miroir de l'edge function) et `Drill`
  (type du contrat), `/** @alias */` sur `ITEM_SETS = VOIE_SETS`.
- **Toujours exportés, appelés nulle part dans l'app mais TESTÉS** : `forgeItem`, `salvageValue`,
  `craftSetCost` (Atelier retiré v0.556), `comboOverachievement` (fusionné v0.621). knip ne les
  voit pas (les tests les importent). Les retirer = retirer leurs tests aussi — décision à
  prendre explicitement, pas un oubli.
- ⚠️ **Piège d'outillage rencontré** : un script passé par `node -e`/heredoc a vu son `\b`
  (frontière de mot regex) transformé en **backspace 0x08** → regex qui ne matchait rien, sans
  erreur. Écrire les scripts dans un fichier (Write) et remplacer `\b` par
  `(?=[^A-Za-z0-9_$]|$)`.

### 🧰 QUELLE SKILL POUR QUOI (v0.699)

Installées dans `~/.claude/skills/` (+ les _bundled_). ⚠️ **Toutes ne conviennent PAS à ce
projet** : la liste des exclusions compte autant que celle des recommandations.

| Besoin                          | Skill                                                                | Ce qu'elle apporte ICI                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code mort, doublons, complexité | **`simplify`** _(bundled)_                                           | 4 agents en PARALLÈLE sur le diff : réemploi (ce qui existe déjà) · simplification (état dérivable, copier-coller, nid) · efficacité (travail refait, I/O répétées, closures qui retiennent tout un scope) · **altitude** (le correctif est-il à la bonne profondeur, ou est-ce un cas particulier posé sur de l'infra partagée ?). C'est l'outil du « gros ménage ». |
| Avant d'écrire une feature      | **`brainstorming`**                                                  | Explore l'intention et les contraintes AVANT de coder. ⚠️ La plus rentable ici : ce projet se conçoit par arbitrages (« comment tu le verrais ? »), et plusieurs features ont été refaites faute d'avoir posé la question d'abord.                                                                                                                                    |
| Chantier en plusieurs étapes    | **`writing-plans`** → **`executing-plans`**                          | Le plan écrit, puis exécuté avec points de contrôle.                                                                                                                                                                                                                                                                                                                  |
| Audit/polish d'un écran         | **`impeccable`**                                                     | Critique d'interface : hiérarchie visuelle, architecture de l'information, charge cognitive, états vides.                                                                                                                                                                                                                                                             |
| Question d'UX précise           | **`ui-ux-pro-max`**                                                  | 99 règles d'UX + cibles Vue. À prendre pour ses **règles**, pas pour ses palettes/polices : la charte est déjà fixée (§ Design system).                                                                                                                                                                                                                               |
| Bug ou test rouge               | **`systematic-debugging`**                                           | La cause avant le correctif.                                                                                                                                                                                                                                                                                                                                          |
| Avant d'annoncer « c'est fait » | **`verification-before-completion`**                                 | Cf. la règle de triple vérification ci-dessus.                                                                                                                                                                                                                                                                                                                        |
| Revue de fin de tâche           | **`requesting-code-review`** / **`receiving-code-review`**           | La seconde impose de VÉRIFIER un retour de revue au lieu d'acquiescer.                                                                                                                                                                                                                                                                                                |
| Plusieurs tâches indépendantes  | **`dispatching-parallel-agents`**, **`subagent-driven-development`** | Agents de revue/implémentation en parallèle (ce qui a servi à l'audit des devises mortes).                                                                                                                                                                                                                                                                            |

### 👁️ SMOKE UI — la seule porte qui REGARDE l'écran (v0.700)

`npm run smoke` (après `npm run build`) — `scripts/smoke-ui.mjs`, Playwright en **Node**.

⚠️ **Pourquoi elle existe** : typecheck, lint, tests et build valident du CODE et sont AVEUGLES
au rendu. Trois défauts livrés le prouvent — un `fill: none` SVG **non cliquable en son centre**
(impossible de bâtir une tourelle), des ornements du rempart **décrochés** parce qu'ils étaient
en coordonnées dures, un panneau « Dernier siège » rendu **deux fois**. Aucun ne pouvait être vu
sans ouvrir un navigateur ; ils sont tous remontés par les yeux de l'utilisateur.

Elle sert `dist/spa` sur un serveur local (avec le repli SPA de Vercel), ouvre Chromium à
**344 / 390 / 600 px** — les seuils que le projet documente déjà (Z Fold plié · téléphone ·
bascule cockpit) — et échoue sur : HTTP ≠ 200, **toute** erreur console ou `pageerror`,
**débordement horizontal** (garde-fou explicite du § Responsive), page quasi vide. Captures dans
`dist/smoke/` (déjà gitignoré via `/dist`).

🗺️ **ELLE OUVRE LA CARTE EN ENTIER DEPUIS LA v0.1213** : le compte de test a un Avant-poste, un Panthéon, deux champions et une expédition du héros en cours (données générées par `createMap`/`startExpedition`/`grantChampion` puis figées dans `smoke-seed.json`, RE-DATÉES à chaque seed). Chaque écran peut déclarer des **gestes** (`{ clic, attendu }`) : sur la carte, toucher le voyage doit montrer son équipe (`.trip-crew`), toucher un lieu doit montrer sa fiche (`.poi-card`) — introuvable ou absent = ÉCHEC, et une fiche cassée fait bien rougir la porte (vérifié). ⚠️ **Jamais de clic forcé** : l'écran de chargement du jeu s'efface en fondu PAR-DESSUS la carte, un clic forcé tombait dessus et ne faisait rien. ⚠️ Le voyage dure ~5 h : ensuite c'est un rapport à récupérer (toujours une tuile) ; `node scripts/seed-smoke-account.mjs` le remet en route.

⚠️ **ELLE PASSE LA CONNEXION DEPUIS LA v0.1103** (avant : elle s'arrêtait à l'écran de connexion,
donc elle ne voyait AUCUN des écrans où les trois défauts cités sont nés). Avec un compte de test,
elle parcourt **14 écrans à 344 et 390 px**, clique les **4 onglets de l'Aventure** et capture
tout. Sans `SMOKE_EMAIL`/`SMOKE_PASSWORD` dans `.env` (gitignoré), elle garde **exactement** son
ancien comportement — aucune régression sur un poste ou une CI qui ne les a pas. Le compte se
(re)pose avec **`node scripts/seed-smoke-account.mjs`** (idempotent, mot de passe TIRÉ AU HASARD
puis ajouté à `.env` ; `.env.example` ne porte que des clés vides). **Jamais d'identifiants dans le
dépôt.**

- ⚠️ **Elle ne va JAMAIS sur `/leaderboard`** : cette page **PUBLIE** les niveaux du compte courant
  dans un classement que tous les joueurs voient.
- ⚠️ Le compte **écrit dans la base de PRODUCTION**, et c'est assumé (RLS own-only). Le script
  passe par **le JWT du compte, jamais en service role** : une policy qui refuse s'apprend là.
- Ses données (`scripts/smoke-seed.json`) sont **GÉNÉRÉES par le code** (`formToProfile`,
  `deriveLevelConfig`, `buildProgram`) puis figées — conformes au contrat par construction. Deux
  bilans de la **même séance** à une semaine d'écart, un exercice qui monte et un qui stagne : le
  minimum pour que le bilan ait une comparaison, des verdicts et des records à montrer.
- ⚠️ **Un onglet introuvable la fait ÉCHOUER.** Le premier sélecteur ne connaissait que `.q-tab`
  alors que l'Aventure utilise des boutons maison (`.seg-b`) : les 4 onglets n'étaient jamais
  cliqués, **en silence**, et elle passait au vert. Un parcours qui saute la moitié des écrans
  sans le dire donne le vert sans la couverture.

🐛 **ET ELLE A TROUVÉ UN DÉFAUT STRUCTUREL DÈS SA PREMIÈRE EXÉCUTION (v0.1103)** : `/program`
débordait de 16 px aux deux largeurs — et la cause n'était pas dans `/program`. Les **36 pages**
s'ouvrent par `<component :is="embedded ? 'div' : 'q-page'">` (la forme du cockpit, où une page
devient un `div` dans le volet droit). Or **`@quasar/app-vite` importe les composants en ANALYSANT
LES TEMPLATES** : il voit `<q-page>` écrit en clair, **pas une CHAÎNE passée à `:is`**. QPage
n'était donc importé nulle part et Vue rendait un **élément HTML inconnu**, donc `display: inline`
— les gouttières de 16 px ne poussaient pas leur contenu (les cartes touchaient les bords) et le
`min-height` calculé depuis la hauteur du header n'existait pas. Corrigé **à la racine**, en une
ligne dans **`src/boot/qpage.ts`** (`app.component('QPage', QPage)`) plutôt que par 36 imports qui
divergeraient : il aurait suffi qu'une page future oublie le sien pour retrouver le même silence.
⚠️ **Tout composant nommé par une CHAÎNE a le même problème** — il n'est jamais auto-importé.

⚠️ **Vérifiée par MUTATION, comme le veut la règle** : un débordement injecté et une erreur JS
injectée dans le build la font échouer toutes les deux. Une porte jamais vue rouge ne prouve rien.

**Environnement (contraintes du poste, déjà éprouvées)** : le binaire Chromium vit dans
`%LOCALAPPDATA%ms-playwright` — **AppLocker ne le bloque PAS** (testé). `npx` restant bloqué,
l'installation passe par node, UNE fois : `node node_modules/playwright-core/cli.js install
chromium`. Dépendance : **`playwright-core` seul** (pas `@playwright/test` : son lanceur de tests
n'est pas utilisé), en devDependency — rien ne part dans le bundle.

**⛔ À NE PAS UTILISER sur ce projet, et pourquoi :**

- **`ui-styling`** (shadcn/ui + Radix + Tailwind) — la stack est **Quasar + SCSS maison** avec ses
  propres tokens. L'appliquer introduirait des dépendances étrangères pour refaire ce qui existe.
- **`frontend-design`** — conçu pour créer une identité visuelle _distinctive_ de zéro. Ici elle
  est **déjà arrêtée** (« panneau de contrôle d'équipement », jaune voltage sur fond sombre) ;
  s'en servir pour un écran le ferait diverger du reste de l'app.
- **`design-system`**, **`brand`**, **`design`** (logo/CIP), **`slides`**, **`banner-design`** — hors sujet
  (identité de marque, présentations, bannières). Les tokens du projet vivent dans `app.scss` et
  `docs/design-system.md`.
- **`protein-tracker`** — autre projet.

⚠️ **AUCUNE skill de SÉCURITÉ n'est installée** (vérifié). La sécurité de ce projet est
spécifique — elle tient presque entièrement aux RLS Supabase —, donc elle est écrite ci-dessous
plutôt que déléguée à un outil générique. `find-skill` permet d'en chercher une si besoin.

### 🔒 SÉCURITÉ — la surface réelle de cette app (v0.699)

Pas de serveur applicatif : **tout le client est public**, y compris la clé `anon` (c'est normal,
la sécurité EST la RLS). Un attaquant a donc le même accès que le code de l'app à l'API Supabase.
Il ne peut être arrêté qu'au niveau de la base.

1. **Toute requête est scopée `auth.uid()`** — jamais de secret en dur côté client.
2. **⚠️ NE JAMAIS se reposer sur la RLS pour FILTRER** (bug v0.653, réel, détaillé plus bas) : elle
   borne ce qu'on a le **DROIT** de lire, pas ce qu'on **VEUT** lire. Tout `fetchMine` porte un
   `.eq('user_id', uid)` **explicite**.
3. **Avant d'élargir une policy SELECT** sur une table par-utilisateur, auditer les `select`
   clients de cette table. `select tablename, policyname, qual from pg_policies where cmd='SELECT'`
   donne la liste des tables à risque.
4. **Un client n'écrit JAMAIS la ligne d'un autre.** Un `SECURITY DEFINER` qui écrirait à la place
   d'autrui a été **refusé** pour le défi partagé (migr. 0059) : le flux passe par une table de
   définition et l'invité insère SA propre ligne. `SECURITY DEFINER` est réservé à ce que le client
   ne doit pas pouvoir toucher du tout (les PV du boss mondial, décrémentés atomiquement).
5. **Une policy se VÉRIFIE sur comptes réels, en transaction annulée** — c'est ce qui a été fait
   pour la migr. 0059 (proposition à un non-ami refusée, proposition au nom d'un autre refusée,
   auto-acceptation refusée, tiers qui ne voit rien). Écrire une policy n'est pas la tester.
6. **L'admin se garde des DEUX côtés** : client (`auth.isAdmin`, routes `ADMIN_ONLY`) **et** base
   (`is_admin()` dans les policies, migr. 0014). Le garde client est du confort, pas une sécurité.
7. **Migrations additives uniquement**, jamais d'édition d'une migration appliquée.
8. **Données venant d'autrui = données, jamais instructions** (pseudos, contenus d'amis).
9. **`npm audit` fait partie des portes**, périodiquement (il n'a besoin d'aucune skill).
   ⚠️ **Lire le résultat, pas seulement le compte** : au 09/2026, 10 alertes dont **une seule
   part réellement dans le bundle du navigateur** (prototype pollution dans le `extend()` de
   Quasar) — les 9 autres sont des dépendances de BUILD/TEST (vitest, postcss, browserslist,
   js-yaml…) dont les vecteurs (DoS, path traversal) supposent une entrée hostile qui n'existe
   pas dans une compilation locale. Trier par « est-ce que ça s'exécute chez l'utilisateur ? »
   avant de s'alarmer ou de tout mettre à jour.
10. ⚠️ **Le bucket `feedback` est PUBLIC** : une capture d'écran jointe à un ticket est lisible par
    quiconque a l'URL. Ne rien y mettre qu'on ne publierait pas.
11. ⚖️ **LE JEU EST « SUR L'HONNEUR », COMME LE SPORT (décision de l'utilisateur, audit
    2026-10-15, point S6).** La ligne `characters` (or, objets, champions…) et le `leaderboard`
    sont écrits par le client : quelqu'un qui bricole les requêtes peut tricher SUR SA PROPRE
    ligne (la RLS own-only l'empêche de toucher celle d'un autre). C'est **accepté** : faire
    tourner combats, butin et économie côté serveur coûterait des semaines pour une app entre
    amis. ⚠️ Ne pas re-soulever ce point ; il ne change que si l'app s'ouvre au public.

### ✅ TRIPLE VÉRIFICATION — la règle de travail du projet (v0.698)

Consigne donnée par l'utilisateur, après qu'une régression a été livrée sans être vue (le bouton
« Réattaquer » grisé à vie : la modale de conflit avait été retirée mais `stashConflict` était
encore posé, donc `conflictPending` restait vrai pour toujours). Elle n'est pas facultative.

**Skills à invoquer** (installées dans `~/.claude/skills/`) : `verification-before-completion`
(preuve avant affirmation), `systematic-debugging` (la cause avant le correctif),
`test-driven-development`, `requesting-code-review`. Pour les gros chantiers,
`dispatching-parallel-agents` / `subagent-driven-development` (agents de revue en parallèle).

**AUCUNE annonce de complétion sans avoir lancé la commande ET lu sa sortie.** Les 4 portes,
dans cet ordre — une seule ignorée invalide l'annonce :

```
npm run typecheck   ·   npm run lint   ·   node node_modules/vitest/vitest.mjs run
node node_modules/@quasar/app-vite/bin/quasar.js build   ·   npm run smoke   (5e porte, voit l’écran)
```

⚠️ La suite inclut depuis la v0.910 une **6ᵉ porte**, `test/mount.test.ts` : elle MONTE les
composants (rendu **client**, `happy-dom`) et attrape les erreurs de setup — TDZ, store mal
lu, prop manquante — qu'aucune des cinq autres ne peut voir. Y ajouter un écran quand on en
touche la logique : `mountIt(composant, props, row)`. ⚠️ **Pas de SSR** : `renderToString`
rend les `watch` inertes, donc il passe au vert sur ce genre de défaut.

⚖️ **Les 3 simulations d'économie sur un an** (`campEconomy`, `goldSink`, `ascensionRhythm`,
~6 min) sont **hors de `npm test`** depuis la v1.210.1 : `npm run test:calib` les joue. **Tout
réglage d'équilibrage passe par `test:calib` avant d'être annoncé.** Les tests ne touchent
jamais le réseau : `test/setup/offlineSupabase.ts` répond 503 à l'URL Supabase factice.

Rapporter fidèlement : un test rouge se dit avec sa sortie, une étape sautée se dit.

**⚠️ Un test VERT ne prouve rien tant qu'il n'a pas été vu ROUGE.** Pour toute logique de calcul
(`src/lib/`), casser volontairement le code sur chacune des garanties annoncées et vérifier
qu'un test tombe **à chaque fois**. C'est ce qui a démontré que le tri des doublons de familiers
tenait vraiment ses 3 axes (v0.697), et c'est ce qui manquait aux tests qui ont laissé passer :
la devise morte de l'arène (le test omettait `'arena'`), l'archive qui payait en fragments
(le test l'**affirmait**), et le puits d'or qui débordait (mauvaise unité au dénominateur).

**⚠️ MESURER, JAMAIS AFFIRMER.** Tout réglage d'équilibrage se justifie par une sonde qui
utilise les VRAIES libs, puis la sonde est supprimée et le chiffre mesuré part dans le commit.
⚠️ **Le piège récurrent est l'UNITÉ**, deux fois de suite : comparer « N séances de sport » à
« N jours » (ferraille vs or), et mesurer un coût de bâtiment contre UNE expédition de mine
quand **79 % de l'or vient des donjons**. Les deux ont produit des conclusions inverses de la
réalité, avec un test vert par-dessus. Nommer l'unité à voix haute avant de conclure.

**Les tests périmés se RÉÉCRIVENT, ils ne se suppriment pas** : plusieurs verrouillaient
activement le défaut qu'ils auraient dû attraper — les supprimer aurait effacé la trace.

**Un test troué est pire que pas de test** : il donne le vert de la confiance sans la couvrir.
Quand une table, une union ou une liste de cas est énumérée dans un test, vérifier qu'elle est
EXHAUSTIVE (ou mieux : la rendre exhaustive par construction — cf. `Record<PoiType, string>`,
qui casse la compilation quand on ajoute un POI sans le nommer).

- Toujours s'appuyer sur les types de `src/lib`. Si un champ manque, l'ajouter au contrat (types.ts + SQL) plutôt que bricoler dans un composant.
- Respecter les RLS : toute requête est scoping `auth.uid()`.
- **⚠️ NE JAMAIS se reposer sur la RLS pour FILTRER côté client** (bug v0.653, réel) : la RLS borne ce qu'on a le **DROIT** de lire, pas ce qu'on **VEUT** lire. `challenges.fetchMine`/`combo.fetchMine` faisaient un `select` NU en comptant sur l'own-only ; la migr. 0058 (`challenges_read_friends`/`combo_read_friends`) a élargi la lecture **aux amis** → la liste « mes défis » s'est mise à contenir ceux des amis. Symptôme observé : `combo.activeOne()` prend le 1er actif trié par `created_at desc` → un ami voyait le **360 du plus récemment créé** (celui de l'autre) à la place du sien ; et son XP Challenges/Muscu comptait l'historique de l'autre (donc niveaux + énergie gonflés). Même piège sur `feedback.fetchMine` (élargi aux admins par `feedback_read_admin`, migr. 0014) → « mes tickets » montrait ceux de tout le monde aux admins. **Tout `fetchMine` porte donc un `.eq('user_id', uid)` explicite** — vérifié un par un en v0.699 : `challenges`, `combo` et `feedback` l'avaient ; `sessions`, `drill_sessions` et `characters` ne l'avaient PAS et ont été durcis (le filtre est un no-op tant que la policy reste own-only — c'est précisément le but). Seul `friendships` en est exempt, à raison : une amitié est bilatérale, un `.eq('user_id')` y masquerait la moitié des liens. Avant d'ajouter une policy SELECT élargie sur une table par-utilisateur, auditer les `select` clients de cette table (`select tablename, policyname, qual from pg_policies where cmd='SELECT'` = la liste des tables à risque).
- Mobile d'abord : tester en largeur ~390 px, cibles tactiles ≥ 44 px.
- **Responsive / Samsung Z Fold** : l'UI reste mobile-first. Au-dessus de **600 px** (tablette, desktop, **Z Fold déplié**), `app.scss` contraint `.q-page-container` à une **colonne centrée** (`--app-max-width`, 560 px) — on n'étire jamais l'UI mobile ; les gouttières prennent le fond ; le header reste pleine largeur. Sous 600 px (téléphones + **Z Fold plié** ~344 px), pleine largeur. Pour toute nouvelle barre dense (puces/chips), prévoir `flex-wrap` (cf. `.topbar` d'AventurePage). Limite connue : un CTA collant `position:fixed` pleine largeur dépasse la colonne sur grand écran (acceptable).
- **Cockpit 2 volets (Z Fold déplié, ≥ 600 px large ET haut)** : le cockpit vit désormais dans **`MainLayout.vue`** (plus dans `HomeCockpit`, supprimé) → il s'applique à **TOUS les écrans sport**, pas seulement l'accueil (ticket 7c6af9c9, Étape 1). Déplié → **deux volets côte à côte défilant indépendamment** : SPORT à gauche = **l'écran courant** (`<router-view v-slot>` → `<component :is embedded>`), AVENTURE à droite = **`AventurePage embedded` ÉPINGLÉE et persistante** (jouable pendant qu'on navigue dans le sport ; reste montée = garde son état). Plié/téléphone → navigation normale plein écran (`<router-view>`). **Toutes** les pages enfants de MainLayout acceptent une prop **`embedded`** → racine `<component :is="embedded ? 'div' : 'q-page'" :class="{ embedded }">` (pas de q-page imbriquée) + `.X-page.embedded{min-height:0}` (le volet gère le scroll). En cockpit, l'entrée de menu **Aventure** est masquée et toute nav vers `/aventure` **rebascule sur `/`** (watch dans MainLayout) pour ne pas la dupliquer à gauche. Le cockpit échappe au plafond 560 via `@media (min-width:600px) and (min-height:600px){ .q-page-container:has(.home-cockpit){ max-width:none } }`. Seuil `WIDE_MIN=600` dans MainLayout (réactif au resize). **Étape 2 livrée (v0.459, ticket 7c6af9c9)** : les écrans jeu profonds (carte d'expédition `/expedition-map`, Labyrinthe `/expedition`) s'ouvrent **DANS le volet droit** en cockpit, via `src/composables/useGamePanel.ts` (état singleton `view` = `'aventure'|'expedition-map'|'expedition'` + `goGame`/`gameBack`/`viewForPath`). MainLayout rend le volet droit par `<component :is="gamePaneComponent">` (mappe `view`→composant, tous lazy). Les pages `AventurePage`/`ExpeditionMapPage`/`ExpeditionPage` acceptent `embedded` : en cockpit (`props.embedded`) leur nav jeu passe par `goGame`/`gameBack` (pas de `router.push`/`router.back`, qui router­aient le volet GAUCHE) ; hors cockpit (téléphone, routes BlankLayout plein écran) elles routent normalement. `AventurePage.openGame(path)` remplace les `router.push('/expedition-*')`, les back des 2 écrans profonds passent par `gameBack`. Un deep-link direct sur `/expedition-map` en grand écran reste plein écran (edge case). Le classement (`/leaderboard`) reste plein écran.
- **🏚️🐺 FOUILLE QUI DURE ET REJEUX DE LA TANIÈRE ET DES RUINES (v0.1215 ; demandé par l'utilisateur)**. Une équipe reste **1 h sur place** dans les ruines d'un héros tombé (`FALLEN_DWELL_MS`, `dwellMsFor`, `Voyage.dwellMs`) : le rapport tombe après la fouille, la tuile de voyage affiche « 🔍 » et « fouille encore … » (`travelPosition().searching`). Les rapports gardent de quoi être rejoués : `PartyResult.den` (duel de tanière, résumé par `bossReplaySteps` — la fin rejouée est celle du combat) et `PartyResult.fallen.supplies` (les trouvailles de la fouille, à part de celles de la route). Deux plateaux en SVG, ouverts par `RiftReplayDialog` et pris par le rejeu automatique : `DenStage.vue` (nuit, sapins, grotte, yeux, rugissement, griffures, barres de PV) et `FallenStage.vue` (ruines au couchant, rayons, l'équipe fouille, chaque consommable jaillit). Ils ne calculent rien. Vus au banc à 344/390/600 px (0 débordement).
- **❤️ LES FAILLES ONT LE PANNEAU DE VIE DE LA TANIÈRE (v0.1216 ; demandé par l'utilisateur)**. Le rejeu d'une incursion avait une barre de groupe en bas et une barre de gardien en haut ; les monstres n'en avaient aucune (le rapport ne gardait que les PV du groupe). `RiftRun.foeTrail` (relayé par `PartyResult.rift.foeTrail`, optionnel) garde, pour chaque monstre AFFRONTÉ, ses PV d'entrée et de fin (0 s'il tombe) — inscrit par le combat, rien n'en dépend (`RiftStageFoe.life`). `RiftStage.vue` affiche un seul panneau en bas, celui de `DenStage` : « Ton groupe » + l'adversaire du moment (le monstre affronté, puis le gardien en rouge, halo quand il enrage). Rapport d'avant : la barre du monstre ne montre que sa chute, sans chiffre. Test `riftFoeLife` (1 mutation, 1 rouge). Vu au banc à 344/390/600 px.
- **🧭 SANS LE HÉROS, LES CHAMPIONS APPRENNENT PLUS (v0.1217 ; demandé par l'utilisateur)**. `SOLO_XP_MULT` = 1,25 multiplie le SOCLE d'XP de chaque champion quand le héros n'est pas du voyage (jamais la part des abattus, bornée par sa marge de portage). `missionXpFor` et `missionXpPreview` prennent un `hero` REQUIS ; tous les voyages le passent (camps, récoltes, failles, interceptions ; un convoi toujours `false`). L'écran d'envoi l'annonce (« 🧭 seuls, ils apprennent plus ») et le facteur « XP partagée ×… » l'inclut. Le héros ne prend toujours AUCUNE part du partage (v0.1109). 2 mutations, 2 rouges. ⚠️ Non re-mesuré : le rythme de montée des champions (convois compris) gagne ~+25 % sur le socle.
- **🕳️💥 LE DÉBORDEMENT D'UNE FAILLE SE DIT ET SE REJOUE (v0.1220 ; demandé par l'utilisateur : « un débordement magnifique »)**. Une faille qui déborde disparaissait de la carte sans un mot. `expeSyncMap` dépose désormais, dans la MÊME écriture que la carte, un message « Une faille a débordé » (`overflowMessage`, `src/lib/overflowStage.ts` : id `ovf_<faille>`, daté du débordement, rien à encaisser, `ExpeditionMessage.overflow` = faction, niveau, lieux harcelés `overflowAmbushed`, et si l'armée marche sur une base). Il se rejoue tout seul (`overflowAutoReplay`, `useOverflowReplay`, mémoire `muscu:overflow:replayed`, après les incursions) et depuis la boîte (« Revoir le débordement »). Plateau `OverflowStage.vue` (dans `OverflowReplayDialog`) : lande sous un ciel teinté par la faille, ta ville sur l'horizon ; le compte à rebours fond à 0, le sol se fend, la faille se déchire (onde, éclair), ses monstres sortent — 4 vont se cacher (silhouettes aux yeux qui luisent), les autres marchent en colonne sur la ville, le gardien en queue — puis elle s'effondre en cristaux de mana. Il ne décide rien. ⚠️ `.hidden` est un utilitaire Quasar (`display: none`) : les embusqués s'appelaient ainsi et disparaissaient, vu au banc (344/390/600 px, 0 débordement).
- **🏴‍☠️ CARAVANE PILLÉE (v0.1224 ; demandé par l'utilisateur, « spawn rare »)**. Nouveau `PoiType` `plunder`, un lieu de RÉCOLTE gardé par des BANDITS (toujours, tirage de faction conservé pour ne pas décaler le flux), gardes des ruines (2 à 3), 5 h de vie. Or : `harvestGold` = celui d'une mine × `PLUNDER_GOLD_MULT` (2), plus les bourses des pillards. ⚠️ RARE PAR UNE CHANCE À PART, pas par la table de tirage : une entrée dans `SPAWN_TABLE` la mettait sur la carte quasiment en permanence. `EXPE.plunderChance` (2,2 %) qu'un lieu d'économie qui apparaît en soit une, une seule à la fois, sur un générateur séparé — mesuré 0,33 par jour, présente 6,8 % du temps. ⚠️ ×3 sortait l'économie de ses bornes (`goldSink` : soins d'urgence à 0,33 journée au niveau 10, un cran à 11,8 jours) ; ×2 y reste. Au passage, le test « le niveau des ennemis est dérivé » de `poiSpawnRank` passait sur 6 cartes seulement et basculait au moindre changement de carte : 20 cartes (la propriété tient, 35 contre 26 sur 60). Test `plunder` (2 mutations, 2 rouges).
- **🔔 LA CARAVANE PILLÉE SE NOTIFIE ET DURE 8 H (v0.1225 ; proposé, non contesté par l'utilisateur)**. ⚠️ La carte n'avance que quand l'app tourne, mais elle est DÉTERMINISTE : `nextPlunderSpawn` la rejoue en avance (pas de 30 min, horizon 48 h) avec `advanceWorld` lui-même, pour trouver l'heure et l'id de la prochaine caravane ; `planPushes` programme alors « 🏴‍☠️ Une caravane pillée » (`dedupe` = son id, donc effacée si un geste du joueur change la carte). `PushContext.plunder` REQUIS. Rien si une caravane est déjà sur la carte. Test `plunderPush` (l'annonce égale ce que la carte fait apparaître ; 1 mutation, 1 rouge).
- **🏰 POINTS DE CONTRÔLE — ÉTAPE 1 : LA MINE FORTIFIÉE (v0.1226 ; décisions de l'utilisateur, mémoire `carte-lieux-controle`)**. `src/lib/controlPoints.ts` (pur/testé). Nouveau `PoiType` `control`, état dans `Poi.control` (`ControlState`, JSONB de la carte → aucune migration). ⚠️ « hold » était déjà pris (mini-jeux du gainage) : on parle de « points de contrôle ».
  - **FIXE** : posé par `ensureControls` (appelé par `expeSyncMap`) à un endroit dérivé de la graine de la carte, dans le disque révélé sans Avant-poste ; hors quota, jamais expiré (`lifespanMs.control` 9e15). **Rang TIRÉ** (`riftLevelFor`, graine carte + id + reprises), jamais lié à la distance, re-tiré à chaque reprise ennemie.
  - **PRISE** : en groupe, **1 à 3 champions, SANS le héros** (`partySendBlocker` : `controlHero` / `controlFull` / `controlHeld` ; `partyHeroBlocker` `control` REQUIS ; `partyCapFor` 3), combat d'un camp (`campSpecOf` lit la troupe ennemie du point). Le point RESTE sur la carte, marqué `assault` (pas deux assauts). Au rapport (`partyTick` → `settleControlAssaults`, repéré par `PartyResult.controlId`) : gagné → l'équipe devient la garnison, ses champions sont **postés** (`Adventurer.posted`, raison d'indisponibilité `posted`, teinte violette) ; raté → l'assaut se lève.
  - **PRODUCTION** : `controlGoldPerHour` = l'or d'une mission de mine de son rang (`harvestGold`) toutes les 8 h × part de garnison (1 → 50 %, 2 → 80 %, 3 → 100 %) ; réserve plafonnée à 24 h, arrêtée à l'heure de l'attaque ; « Récolter » (`collectControlGold`), « Rappeler » (`recallControl` : récolte, libère, le lieu retourne à l'ennemi). ⚠️ Débit NON mesuré contre `goldSink` : calé pour valoir à peu près ce que ces champions auraient ramené en missions.
  - **REPRISE** : à un instant TIRÉ entre 1 et 3 jours après la prise ou la dernière défense (`retakeDelayMs`), résolue par `controlTick` (appelé avec `partyTick` sur la carte et l'Aventure) même si l'app était fermée. Troupe de force ALÉATOIRE (`CONTROL.sizes` [1, 1,5, 2,5, 3,5]) — **mesuré, niveau 30, 600 combats : 1, 2, 3 champions de référence repoussent 10 %, 58 %, 85 % des attaques** (avec [1,5 → 3] : 0 %, 53 %, 94 %). Repoussée : XP de défense et nouvelle attaque ; perdue : garnison à l'infirmerie (datée de l'attaque, idempotente avec l'encaissement), lieu à l'ennemi. Un rapport « 🏰 Attaque repoussée / Mine reprise » arrive dans la boîte 📬 avec l'animation d'XP ; l'or produit jusqu'à l'attaque y est versé, même perdue. ⚠️ **Depuis la v1.104.0** : seule la milice combat ; perdue, les miliciens meurent et les champions postés rentrent à pied sans blessure.
  - **NOTIFICATIONS** : `PushContext.controls` REQUIS ; « l'ennemi marche sur ta mine » 2 h avant, « ta mine est attaquée » à l'heure — sans dire l'issue (elle se joue à l'ouverture de l'app). Clés liées à l'heure de l'attaque.
  - **CARTE** : un FORT carré avec bannière — **rouge à l'ennemi, violet quand nos champions le tiennent**, pointillé pendant un assaut ; un point tenu n'est jamais grisé. Fiche : garnison, or/h, réserve, compte à rebours. Vérifié au banc (344/390/600 px, aucun débordement).
  - **👥 QUI L'OCCUPE, RAMENER, RENFORCER (v0.1230 ; demandé par l'utilisateur)** : la fiche d'un point tenu montre la garnison en tuiles (`AdvPickTile`) ; en toucher une ou plusieurs puis « Ramener » (`releaseFromControl` + `char.releaseControlChampions`) — ⚠️ **quitter une mine ne la rend PAS à l'ennemi** (v0.1231.0, décision de l'utilisateur) : vidée, elle reste à nous, ne produit plus, garde l'or déjà sorti et son attaque prévue — c'est cette attaque, faute de défenseurs, qui la reprend (sauf renfort arrivé avant) ; le rappel complet (`recallControl`) récolte et libère sans `loseControl`. Une place libre (3 au plus, garnison + renforts en route : `controlSeats`/`controlFreeSeats`) propose « Envoyer en renfort » (`reinforceBlocker` = source unique écran/store, `char.reinforceControlPoint`). ⚠️ **Un renfort MARCHE** (`partyLegMin` sans le héros) : `ControlState.reinforcing` {id, at}, champion `posted` + `busyUntil` = arrivée ; il ne rejoint la garnison qu'à l'arrivée (`settleReinforcements`, dans `controlTick`), **jamais après une attaque due** (en route, il ne produit ni ne combat). ⚠️ **L'or déjà produit est mis de côté quand l'effectif change** (`ControlState.banked`, `bankAt`) : sinon le passé serait recalculé au nouveau débit. Point perdu → TOUS les postés sont libérés (renforts en route compris ; seule la garnison part à l'infirmerie). Tests `controlReinforce.test` (8), **5 mutations, 5 rouges**. ⚠️ La fiche d'un point tenu n'est vue par aucune porte (le compte de smoke n'en tient pas).
  - **Reste** : camp d'entraînement (plafond ★5 du rang sous le héros), jardin d'herboriste, tour de guet (trajets, après l'Avant-poste). Tests `controlPoints.test` (17), **6 mutations, 6 rouges**. ⚠️ Non couverts par une porte : le câblage du store et la fiche.
- **🏰 POINTS DE CONTRÔLE — ÉTAPE 2 : CAMP D'ENTRAÎNEMENT, JARDIN, TOUR DE GUET (v0.1232 ; décisions de l'utilisateur)**. `ControlKind` = `mine` · `training` · `garden` · `tower`, les quatre posés par `ensureControls` à un quart de tour d'écart autour de la ville (la mine, première, garde sa place). Nom et emoji par type : `poiLabel`/`poiEmo` (expedition.ts, lus par la fiche, les voyages, les rapports) ; `POI_LABEL.control` = « Point de contrôle ».
  - **🎯 Camp d'entraînement** : chaque champion posté gagne l'XP d'une épreuve de son rang (`trialXpBase`) toutes les 3 h, **plafonnée au ★5 du rang juste sous le héros** (`trainingCapLevel` ; un héros Bronze n'entraîne personne). ⚠️ `trainingRoom` borne l'XP VERSÉE, pas seulement le niveau : `grantAdvXp` conserve l'excédent au-delà de ses plafonds, qui passerait sinon le plafond du camp à la prochaine ascension. Borné aussi par le Panthéon et l'ascension.
  - **🌿 Jardin d'herboriste** : un consommable toutes les 8 h à 3 champions (3 par jour ; 1 par jour à 1 champion), tirés au hasard. ⚠️ Cueillir garde en réserve (`banked`) la fraction d'un consommable en cours : rien n'est perdu.
  - **🗼 Tour de guet** : tenue, elle multiplie TOUS les trajets (héros et équipes) par `1 − 0,2 × part de garnison` (×0,8 à 3, ×0,9 à 1), **après l'Avant-poste** (`controlTravelMult` × `travelTimeMult`, store et carte). Rien à récolter.
  - **Récolte générale** : `collectControl` rend or, XP par champion et consommables ; le store applique (`harvestControlIn` : XP bornée, animation d'XP) via « Récolter / Faire progresser / Cueillir » (`collectControlPoint`), au rappel, et AVANT chaque combat de reprise (rien de produit n'est perdu, les consommables partent dans le rapport). Notifications au nom du point (`PushContext.controls[].label`).
  - **Accordé aux renforts et au rappel partiel (v0.1230-1231)** : la réserve mise de côté quand l'effectif change (`bankAt`) vaut pour les trois productions (`stockUnits`, dans l'unité du point). ⚠️ Au camp, un renfort qui arrive partage l'XP déjà mise de côté.
  - Vu au banc (344/390/600 px). Tests `controlPoints.test` (23), **6 mutations, 6 rouges**. ⚠️ Débits d'XP et de consommables non mesurés contre l'économie : premier calage.
- **🏰 POINTS DE CONTRÔLE : PRENABLES À SON NIVEAU, LE JARDIN GARDE UN SEUL CHAMPION, ON CHOISIT QUI RESTE (v0.1235, mesuré ; signalé par l'utilisateur : « la tour de guet est en difficulté légendaire, imprenable à mon niveau »)**.
  - **Deux causes** : le niveau d'un point était tiré comme une faille, place « au-dessus du joueur » comprise — et un point FIXE tiré là restait hors d'atteinte pour toujours ; et la troupe qui le tient allait jusqu'à 3,5 champions de référence, quand on n'en envoie que 3.
  - **Correctif** : `controlLevel` ne dépasse jamais le niveau du joueur (la place au-dessus est marquée prise) ; la troupe à PRENDRE se tire dans `CONTROL.captureSizes` [1 ; 1,5 ; 2 ; 2,5] (les reprises gardent `CONTROL.sizes`). `ensureControls` re-tire au chargement les points ennemis trop hauts ou trop gros (idempotent). Mesuré au niveau 30 : 3 champions prennent le point le plus dur **95 %**, 2 champions **30 %**.
  - **🌿 Jardin** : `CONTROL_SEATS` / `seatsOf` (jardin 1, les autres 3) bornent garnison, renforts et places libres ; 1 consommable toutes les 12 h. La reprise se met à l'échelle des places (`retakeForce` × places/3) : un jardinier seul repousse **75 %** des reprises (une mine à 3 : 85 %).
  - **Qui reste ?** : à l'envoi vers un point, si l'équipe dépasse les places, des puces choisissent qui reste en garnison (`useExpeditionParty` : `stayIds`/`toggleStay`) ; le rapport porte `PartyResult.stay`, et `settleControlAssaults` poste la garnison RÉELLEMENT posée (un champion en trop n'est plus marqué « posté » hors garnison). Les autres rentrent.
  - Tests `controlPoints.test` (4 ajoutés, 2 recalés), **5 mutations, 5 rouges**. Puces vues au banc (344/390/600 px, 44 px). ⚠️ Non couverts : le choix de qui reste (composable et store).
