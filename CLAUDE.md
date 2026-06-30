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
`profile.experience.level` → `level_config` (`src/lib/levelConfig.ts`) → pilote progression, signal d'effort, profondeur d'historique, mode de création, densité UI. C'est le point UNIQUE où un débutant (progression linéaire, note 1–4 seule, programme généré, UI guidée) et un avancé (double progression + RIR affiché, import libre, UI dense) divergent. **Jamais de code dupliqué par niveau** : on lit `level_config`. Dérivé mais surchargeable.

## Ce qui existe déjà
```
src/lib/
  types.ts         contrat JSON en TS — NE PAS contourner
  supabase.ts      client unique (process.env.SUPABASE_URL / _ANON_KEY)
  levelConfig.ts   deriveLevelConfig(level)
  progression.ts   nextSessionDeterministic(plan, lastLog, cfg, history?)
  programBuilder.ts buildProgram(profile, library, split?) — génère les séances selon une **découpe** (`src/data/splits.ts`, `SplitOption`/`SPLIT_CATALOG` 2→6 séances : full-body, PPL, haut/bas, par zones… ; `splitsFor(n)`, `defaultSplit(n,level)`). Les exos sont répartis par muscle dans le(s) jour(s) ciblant ce muscle (round-robin entre jours équivalents, ex. full-body ou « Haut » ×2 ; sinon jour le moins rempli). Choix de la découpe à la génération (onboarding étape 8 + ProfilePage « Régénérer » → sheet). Plafond 6 séances/sem.
    Détails sélection : volume/muscle (objectif+niveau), ajusté par les sports (équilibrage) et priorités, exos filtrés par matériel. Filtrage = l'exo est retenu si TOUS ses atomes `equipment_required` sont possédés (poids du corps = ensemble vide). Atomes : barbell, rack, bench, dumbbells, kettlebell, bands, cable, machine, pullup_bar, dip_station (cf. EquipmentItem + migration 0003). Biblio enrichie à 45 exos. Anciens profils migrés via `migrateEquipment` (profileForm). **Unité** : `exercises.unit` (`reps` défaut / `time`) → `ExerciseTarget.unit` ; pour `time` (gainage), `reps_min/max` = **secondes**, générées 30–60 s, affichées « s » (détail/live/bilan/libre), progression `fixed`. Migration 0006. **Niveau** : `exercises.difficulty` (1/2/3) ; débutant plafonné à 2 (fallback si rien), d'où variantes assistées élastique (tractions/dips assistés, migration 0004). **Unilatéral** : `exercises.unilateral` (migration 0010 ; Fentes, Rowing haltère/kettlebell) → `PlannedExercise.unilateral`/`LiveExercise`/`LoggedExercise`. Durée `estimateDurationMin` ×2 côté exécution ; badge « par côté » (détail/live/libre/bilan). Une série = les deux côtés. **Favoris / aimés moins** : `Profile.favorite_exercises` priorisés et `Profile.disliked_exercises` relégués en dernier (rank 0/1/2 dans `pickForMuscle` : exclusion **douce** — l'exo « aimé moins » n'est choisi que faute d'alternative, jamais retiré). Édités dans ProfilePage (panneau Musculation). À distinguer de `constraints.avoid_exercises` = exclusion **dure**.
  coach.ts         buildCoachRequest(...) + validateImportedSession(raw)
  importSession.ts parseImportedSession(raw, library) — import IA tolérant : strict (coach) → JSON « lâche » → **texte libre** (`parseWorkoutText` : format ChatGPT « 40 kg ×8 — 1 min », en-têtes emoji, back-off, notes 👉) ; enrichissement biblio par **score** (`findLib` : exact>commence par>contient, le plus proche gagne — « Squat »→« Squat barre », pas « Goblet squat ») ; gainage→secondes ; **prescription par série** préservée (pyramide), cf. `PlannedExercise.prescription` — **charge + reps + `rest_seconds` propres à chaque série** (repos croissant) ; `live.start` pré-remplit chaque `LiveSet` (dont son repos), le timer de repos utilise le repos de la série validée, `estimateDurationMin` somme les repos par série, le détail affiche la plage « repos 1–4 min » ; **sous-blocs modificateurs** (`isModifierBlock` : back-off, pause, drop-set, rest-pause, tempo…) **rattachés à l'exo précédent** (mêmes séries, autre protocole → pas d'exo bidon ; label conservé en notes)
  estimates.ts     estimate1RM(load,reps) (Epley) + bestE1RM(performed) — prépare le Bilan (Étape 4.1)
src/data/
  templates.ts     programmes débutant (Full-Body A/B/C) + suggestTemplates()
  exerciseInstructions.ts  instructions de mouvement FR (débutant : étapes + conseil) par exo ; `exerciseInstructions(id)` → affichées sur la fiche (fallback si pas de `payload.instructions`).
  exerciseImages.ts  illustrations d'exercices (free-exercise-db, domaine public) mappées sur nos 47 exos, bundlées dans `public/exercises/<id>.jpg` ; `exerciseImage(id)`. Affichées sur les tuiles de séance libre (fallback icône MDI matériel + couleur muscle si absente).
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

## Couche app
- `src/stores/` : `auth` (session/user Supabase), `profile` (ligne profiles + level_config), `sessions` (plans), `live` (séance en cours, persistée localStorage `muscu:live:<id>`, construit le SessionLog), `logs` (session_logs : insert + fetchRecent), `library` (exercises : fetchByMuscle/fetchByIds). Tout accès Supabase passe par les stores.
- `src/boot/auth.ts` : init session avant rendu + garde de navigation (non connecté→/login, connecté sans profil→/onboarding, sinon app).
- Options/form profil **factorisés** : `src/data/profileOptions.ts` (listes) + `src/lib/profileForm.ts` (`ProfileForm`, `emptyProfileForm`, `profileToForm`, `formToProfile`, `deriveCoarseEquipment`) — partagés par onboarding ET profil pour rester synchrones.
- `src/pages/` : `LoginPage` (email/mdp), `OnboardingPage` (8 étapes ; Matériel checklist, étape Sports ; étape finale **génère** via `buildProgram` ; import IA en mode `free`), `HomePage` (résumé dernière séance, carte → détail, ▶ → /ready), `HistoryPage` (`/history` : liste des session_logs → bilan lecture seule `?h=1` ; **supprimer** une séance passée via `logs.remove`), `ImportPage` (`/import` : prompt à copier pour ChatGPT + collage du JSON → `parseImportedSession` → aperçu → insert source 'ai' ; bouton sur la Home), `SessionDetailPage` (`/session/:id/detail` : aperçu lecture seule des exos/cibles + CTA Démarrer), `ProfilePage` (`/profile` : édite tous les réglages → `profile.update`, + **Régénérer mon programme** → `sessions.replaceAll`). Navigation depuis le header `MainLayout` (icône Réglages → /profile, brand → home, logout). (liste séances, ▶ → /session/:id), `ReadinessPage` (`/session/:id/ready` : check « Forme du jour » avant la séance — forme/sommeil/courbatures → `readiness` 1–5 ; propose séance allégée (−1 série/exo) sans imposer ; sauté en reprise ; `live.start(session,{light,readiness})`), `SessionLivePage` (exécution : timer radial, steppers, note 1–4, RIR si `effort_signal=rir`, dictée Web Speech, switch d'exo, reprise, → insert session_log → redirige vers le Bilan ; sheet de fin = Enregistrer **ou** « Arrêter sans enregistrer » `stopSession` → `live.clear`), `ExercisePage` (`/exercise/:id` : fiche lecture seule — niveau, muscles, matériel requis, instructions/média si présents dans `payload`, alternatives cliquables ; via `library.fetchOne` ; liens depuis détail de séance + picker libre), `FreeSessionPage` (`/free` : séance libre **au fil de l'eau** calquée sur `SessionLivePage` — exo courant unique, valider la série (difficulté **après** l'avoir faite, jamais à la création), timer de repos radial, picker tuiles/liste avec illustrations pour ajouter l'exo suivant, navigation par pastilles, Terminer dès ≥1 série faite, Annuler (corbeille) + bannière reprise/abandon sur la Home ; `live.addExercise` crée la série en `done:false` ; → session_log `session_id` null → bilan), `BilanPage` (`/bilan/:id` : prévu vs réalisé, max estimé `bestE1RM`, **« Appliquer la progression »** = `nextSessionDeterministic` puis `sessions.updatePlan` → **report des poids en place** ; export/import IA via `coach.ts`).
- `src/components/SwapSheet.vue` : sheet bas onglets Suggestions (library par muscle) / Séances passées (logs).
- Layouts : `MainLayout` (header brand + logout) enveloppe l'app ; `BlankLayout` (plein écran) pour login/onboarding/session. Routes `/login`, `/onboarding`, `/session/:id`, `/` (home).
- Plugin Quasar `Notify` activé.
- **Thèmes** : `src/data/themes.ts` (6 sombres + 4 clairs, flag `dark`) appliqués au runtime par `src/composables/useTheme.ts` (`Dark.set(theme.dark)` → composants Quasar suivent + variables CSS sur `:root` + `setCssVar('primary')`), persistés `localStorage muscu:theme`, init au boot `src/boot/theme.ts`. Notes d'effort `--d1..d4` constantes. **Important** : ne PAS mettre l'attribut `dark` en dur sur les composants Quasar (ils doivent suivre le mode ambiant) ; texte sur accent = `text-color="dark"` (OK clair/sombre).
- **Backlog** : table `feedback` (migr. 0005 RLS own + 0007 read/update-all + 0009 colonne `screenshots text[]`). Store `src/stores/feedback.ts` (submit/fetchMine/fetchAll/setStatus + `uploadScreenshots`). **Saisie = FAB global** `src/components/FeedbackFab.vue` (monté dans `App.vue`, bas-droite) ; **gestion** dans `BacklogPage` (`/backlog`). Accès icône Backlog dans le header (`MainLayout`). **Captures** : bucket Storage **public** `feedback` (migr. 0009), jusqu'à 4 images/ticket (URLs publiques), affichées en vignettes. Hors-app : `node scripts/backlog.mjs`.
- **Suivi corporel** : table `body_entries` (migr. 0008, RLS own) — poids, sommeil, circonférences (`measurements` jsonb : biceps/cuisse/taille/hanches/poitrine/mollet/avant_bras), une ligne = un check-in. Store `src/stores/body.ts` (fetchRecent/add/remove). `BodyPage` (`/body`, menu ⋮) : saisie repliable, dernières valeurs + delta, courbe de poids (SVG), historique. Fréquence/jour/heure de rappel dans `Profile.preferences` (`tracking_frequency` day/week/month, `tracking_day` 0–6 ou 1–28, `tracking_time` HH:MM) → bannière « due » + **notification navigateur quand l'app est ouverte** via `src/composables/useBodyReminder.ts` (monté dans `App.vue` ; pas de push hors-ligne). Pas de photos (volontaire).
- **Nav** : header `MainLayout` a un **bouton retour** (`router.back`, visible sauf accueil) couvrant les pages du menu ; les écrans BlankLayout ont leur propre retour. `ProfilePage` = **panneaux repliables** (Profil & objectif / Musculation / Matériel / Autres sports).
- **Versionning** : `package.json` `version` (semver) = source de vérité. Injectée au build via `quasar.config > build.define` (`__APP_VERSION__`, + `__APP_COMMIT__` = `VERCEL_GIT_COMMIT_SHA`, `__APP_BUILD__` = date), typée dans `env.d.ts`, affichée par `src/components/VersionBadge.vue` (bas-gauche, monté dans `App.vue`). Bumper la version à chaque feature/phase.
- **Lint** : eslint est le gate du projet. SonarLint (IDE) génère des faux positifs sur l'archi Pinia setup-store (S7721 « move async to outer scope ») — ignorer ; se fier à `npm run lint`/`typecheck`.

## Garde-fous
- Toujours s'appuyer sur les types de `src/lib`. Si un champ manque, l'ajouter au contrat (types.ts + SQL) plutôt que bricoler dans un composant.
- Respecter les RLS : toute requête est scoping `auth.uid()`.
- Mobile d'abord : tester en largeur ~390 px, cibles tactiles ≥ 44 px.
