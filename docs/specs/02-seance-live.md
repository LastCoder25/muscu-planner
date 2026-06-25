# Spec 02 — Séance live

## But
Exécuter une `session` exercice par exercice, série par série, et produire un `session_log` à la fin. Référence visuelle : `docs/seance-live-mockup.html` (à reproduire fidèlement en Quasar).

## Données
- **In** : une `session` (depuis `sessions`).
- **Out** : un `session_log` inséré dans `session_logs` à la fin (payload = objet `SessionLog`).
- Types : `Session`, `SessionLog`, `PerformedSet`, `LoggedExercise`.

## Écran (par exercice)
- En-tête : nom séance, position (exo N/total), chrono global.
- Exercice courant : nom, muscle, matériel, cible (`4 × 8–10`), bouton **Changer**.
- **Timer de repos radial** : démarre à la validation d'une série (durée = `rest_seconds`) ; `+15 s`, `Passer`.
- **Liste des séries** : validées (lecture + pastille note), courante (éditable), à venir (grisées).
- **Série courante** : steppers ±2,5 kg (charge) / ±1 rep ; poids du corps → `added_kg`.
- **Ressenti** : note 1–4 (requise) + commentaire texte/dictée (optionnel).
- **+ Ajouter une série** / retirer.
- CTA collant « Valider la série ».

## Comportements
- **Valider la série** → enregistre `PerformedSet` {set, load_kg, reps, difficulty, rir?, comment} ; avance ; lance le repos.
- **Changer d'exo** → sheet 2 onglets : *Suggestions* (via `alternatives` + même `muscle_primary`) et *Séances passées* (requête `session_logs`, dernière charge + note). Sélection → remplace l'exo, **conserve la charge**, renseigne `swapped_from`.
- **Live edits** : modifier sets/reps/charge à la volée (le réalisé peut diverger du prévu — c'est attendu, on logge les deux).
- **Fin de séance** → commentaire global + note globale 1–4 → insert `session_logs` (avec `planned` figé par exo).
- **Persistance** : sauvegarder l'état en cours (reprise si l'app se ferme) — local d'abord, sync Supabase à la fin.

## Adaptation niveau
- `effort_signal = rir` (avancé) → champ RIR optionnel à côté de la note 1–4. Sinon masqué.
- `ui_density = dense` → afficher tonnage/série, repos par défaut plus court.

## Done
- Une séance complète produit un `session_log` valide réimportable par `progression.ts`.
- Switch d'exo et edits live fonctionnent et sont tracés.
- Reprise après fermeture de l'app.
