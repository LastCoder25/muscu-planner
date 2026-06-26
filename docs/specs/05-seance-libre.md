# Spec 05 — Séance libre

> **Statut : proposition à valider.**

## But
S'entraîner **sans plan** : on ajoute les exercices au fur et à mesure, on logge les séries
(charge / reps / note 1–4), et on produit un **`session_log`** à la fin — qui intègre l'historique
(et nourrit donc l'IA et les stats). Pas de progression automatique (il n'y a pas de séance source).

## Données
- **In** : rien (juste `level_config` pour la note d'effort / RIR).
- **Out** : un `session_log` inséré avec **`session_id = null`** (aucun plan source).
- Types : `SessionLog`, `LoggedExercise`, `PerformedSet` (`src/lib/types.ts`). `planned` reste vide
  (pas de cible) ; `performed` = ce qui est saisi. `bibliothèque` lue via `library.fetchAll`.

## Écran (`/free`, plein écran)
- **En-tête** : « Séance libre » + **chrono global** (depuis le démarrage) + bouton quitter.
- **Liste des exercices ajoutés** : chacun = nom + muscle, puis ses **séries** (charge / reps + pastille note),
  steppers ±2,5 kg / ±1 rep sur la série en cours d'édition, **note 1–4** (requise par série),
  **+ série** / retirer, **RIR** si `effort_signal = rir`.
- **« + Ajouter un exercice »** → **sheet picker** : recherche dans la bibliothèque (comme `SwapSheet`),
  sélection → ajoute l'exo (avec une 1ʳᵉ série vierge).
- **CTA « Terminer »** → note globale 1–4 + commentaire → construit le `session_log` → écran **Bilan**
  (réutilisé : pas de progression moteur car pas de plan, mais récap + réalisé + export IA dispo).

## Comportements
- Terminer requiert **≥ 1 exercice avec ≥ 1 série faite**.
- Reprise : l'état tient en mémoire pendant la séance (persistance localStorage **optionnelle v1**, comme
  la séance plan ; à confirmer — sinon simple state de page).
- Pas de timer de repos en v1 (chrono global seulement) — extensible plus tard.

## Adaptation niveau
- `effort_signal = rir` → champ RIR par série (comme la séance plan).

## Done
- Une séance libre complète produit un `session_log` valide (`session_id` null), visible plus tard dans
  l'historique (Étape 4.5).
- Accessible depuis la **home** (bouton « Séance libre »).
