# Spec 08 — Backlog (remontée de tickets)

> **Statut : proposition à valider.** Adaptée à la stack réelle (Supabase, pas Laravel).

## But
Permettre au testeur (toi / ton pote) de **remonter un ticket** (bug, idée, amélioration) **depuis l'app**,
en un geste, avec le contexte utile (page courante, version). Les tickets sont **traités hors-app** par
Claude Code via un futur `docs/BACKLOG-RUN.md` qui s'appuie sur `scripts/backlog.mjs`.

C'est l'outil de **développement courant** une fois la roadmap posée (cf. fin de `ROADMAP-RUN.md`).

## Données
- **Table `feedback`** (migration **0005**, additive) :
  | colonne | type | notes |
  |---|---|---|
  | `id` | uuid PK | `gen_random_uuid()` |
  | `user_id` | uuid | → `auth.users`, `default auth.uid()` |
  | `kind` | text | `bug` \| `idea` \| `other` |
  | `message` | text | le ticket (requis) |
  | `page` | text | route au moment de l'envoi (ex. `/session/:id`) |
  | `app_version` | text | `__APP_VERSION__` |
  | `status` | text | `open` \| `in_progress` \| `done`, défaut `open` |
  | `created_at` / `updated_at` | timestamptz | |
- **RLS** : un utilisateur connecté **insère** son ticket (`with check user_id = auth.uid()`) et **lit les siens**.
  La lecture/màj **globale** (traitement) se fait via **service_role** dans le script, **jamais** via l'app.
- **Hors contrat JSON** : donnée d'app, ce n'est pas un des 4 documents (`profile`/`session`/`session_log`/`coach_request`).

## Écran (intégré aux Paramètres, cf. spec 09)
- Bouton **« Envoyer un retour »** → dialog :
  - **Type** : Bug / Idée / Autre (3 boutons).
  - **Message** : textarea (requis).
  - Envoi → insert dans `feedback`, toast de confirmation.
- **Pré-rempli automatiquement** : `page` (route courante) + `app_version` (`__APP_VERSION__`).
- **Liste in-app** : sous le bouton, **tes propres tickets** (RLS read own) avec leur **statut** (open /
  in-progress / done) et leur type, triés récents d'abord. Lecture seule (le traitement reste hors-app).
  Mobile-first, « proposer jamais imposer ».

## Script — `scripts/backlog.mjs` (Node, comme les smokes)
- Récupère la **clé service_role** via la Management API (`.supabase-token`) — même mécanisme que les vérifs.
- **Par défaut** : liste les tickets `status = open` (id court, kind, message, page, version, date), triés récents d'abord.
- `--all` : inclut `in_progress` / `done`. `--done <id>` : passe un ticket à `done`. `--wip <id>` : `in_progress`.
- Sortie lisible (1 ticket = 1 bloc), pensée pour être collée/parcourue par `BACKLOG-RUN.md`.
- **Aucun secret en dur** ; n'écrit rien d'autre que le statut.

## Done
- Un ticket s'insère depuis les Paramètres (RLS OK), avec `page` + `app_version` corrects.
- `node scripts/backlog.mjs` liste les tickets ouverts ; `--done <id>` les clôture.
