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
  programBuilder.ts buildProgram(profile, library) — génère N séances : volume/muscle (objectif+niveau), ajusté par les sports (équilibrage) et priorités, exos filtrés par matériel. Filtrage = l'exo est retenu si TOUS ses atomes `equipment_required` sont possédés (poids du corps = ensemble vide). Atomes : barbell, rack, bench, dumbbells, kettlebell, bands, cable, machine, pullup_bar, dip_station (cf. EquipmentItem + migration 0003). Biblio enrichie à 45 exos. Anciens profils migrés via `migrateEquipment` (profileForm). **Niveau** : `exercises.difficulty` (1/2/3) ; débutant plafonné à 2 (fallback si rien), d'où variantes assistées élastique (tractions/dips assistés, migration 0004). **Favoris** : `Profile.favorite_exercises` (ids) priorisés dans le tri des candidats (s'ils passent matériel+niveau).
  coach.ts         buildCoachRequest(...) + validateImportedSession(raw)
src/data/
  templates.ts     programmes débutant (Full-Body A/B/C) + suggestTemplates()
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
- `src/pages/` : `LoginPage` (email/mdp), `OnboardingPage` (8 étapes ; Matériel checklist, étape Sports ; étape finale **génère** via `buildProgram` ; import IA en mode `free`), `HomePage` (carte → détail, ▶ → live), `SessionDetailPage` (`/session/:id/detail` : aperçu lecture seule des exos/cibles + CTA Démarrer), `ProfilePage` (`/profile` : édite tous les réglages → `profile.update`, + **Régénérer mon programme** → `sessions.replaceAll`). Navigation depuis le header `MainLayout` (icône Réglages → /profile, brand → home, logout). (liste séances, ▶ → /session/:id), `SessionLivePage` (exécution : timer radial, steppers, note 1–4, RIR si `effort_signal=rir`, dictée Web Speech, switch d'exo, reprise, → insert session_log).
- `src/components/SwapSheet.vue` : sheet bas onglets Suggestions (library par muscle) / Séances passées (logs).
- Layouts : `MainLayout` (header brand + logout) enveloppe l'app ; `BlankLayout` (plein écran) pour login/onboarding/session. Routes `/login`, `/onboarding`, `/session/:id`, `/` (home).
- Plugin Quasar `Notify` activé.
- **Versionning** : `package.json` `version` (semver) = source de vérité. Injectée au build via `quasar.config > build.define` (`__APP_VERSION__`, + `__APP_COMMIT__` = `VERCEL_GIT_COMMIT_SHA`, `__APP_BUILD__` = date), typée dans `env.d.ts`, affichée par `src/components/VersionBadge.vue` (bas-gauche, monté dans `App.vue`). Bumper la version à chaque feature/phase.
- **Lint** : eslint est le gate du projet. SonarLint (IDE) génère des faux positifs sur l'archi Pinia setup-store (S7721 « move async to outer scope ») — ignorer ; se fier à `npm run lint`/`typecheck`.

## Garde-fous
- Toujours s'appuyer sur les types de `src/lib`. Si un champ manque, l'ajouter au contrat (types.ts + SQL) plutôt que bricoler dans un composant.
- Respecter les RLS : toute requête est scoping `auth.uid()`.
- Mobile d'abord : tester en largeur ~390 px, cibles tactiles ≥ 44 px.
