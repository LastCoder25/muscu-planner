# Spec 06 — Fiche exercice

> **Statut : proposition à valider.**

## But
Afficher le **détail d'un exercice** de la bibliothèque : muscles travaillés, matériel requis, niveau,
instructions / média (si disponibles), et **alternatives** (cliquables). Accessible depuis le détail de
séance, le picker de séance libre, et plus tard la bibliothèque (Étape 4.5).

## Données
- **In** : un `exercise` (table `exercises`) par `id` → nouvelle fonction `library.fetchOne(id)` qui
  sélectionne **toutes** les colonnes utiles : `id, name, muscle_primary, muscle_secondary, equipment,
  equipment_required, difficulty, payload`.
- `payload` (JSONB, déjà flexible) peut contenir, **tous optionnels** : `alternatives: string[]`,
  `notes: string`, `instructions: string`, `media_url: string`. **Aucune migration** nécessaire (on lit
  ce qui est là ; le contenu pourra être enrichi plus tard via le backlog/admin).
- Hors contrat JSON (donnée de référence).

## Écran (`/exercise/:id`, BlankLayout, header retour)
- **En-tête** : nom + badge **niveau** (`difficulty` 1/2/3 → Débutant / Intermédiaire / Avancé).
- **Média** : si `payload.media_url` → image ; sinon vignette neutre (icône haltère).
- **Muscles** : primaire (chip accent) + secondaires (chips).
- **Matériel** : `equipment` (libellé) + **matériel requis** (`equipment_required` → libellés FR via la
  table d'atomes des options profil).
- **Instructions** : `payload.instructions` si présent ; sinon message discret « Pas encore d'instructions »
  + lien « Envoyer un retour » (backlog) pour en proposer.
- **Alternatives** : `payload.alternatives` → `library.fetchByIds` → liste cliquable → ouvre la fiche de
  l'alternative (`/exercise/:altId`).

## Accès (entrées)
- **Détail de séance** (`SessionDetailPage`) : taper un exercice → `/exercise/:id`.
- **Picker séance libre** (`FreeSessionPage`) : icône info sur chaque exo → `/exercise/:id`.
- (Switch d'exo en live & bibliothèque : liens ajoutés plus tard / Étape 4.5.)

## Done
- La fiche affiche les infos structurées d'un exo (muscles, matériel requis, niveau, alternatives).
- Navigation depuis le détail de séance ; alternatives cliquables (fiche → fiche).
- Instructions/média s'affichent **si** présents dans `payload` (extensible sans migration).
