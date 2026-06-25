# Spec 04 — Home, historique, bibliothèque

## But
Point d'entrée de l'app : lancer une séance, voir l'historique, gérer la bibliothèque d'exos. À construire après 01–03.

## Home
- Prochaine séance prévue (carte) → bouton **Démarrer** (ouvre l'écran live).
- Mini-résumé : dernière séance (date, volume, note globale), série en cours (streak de séances tenues, optionnel).
- Accès rapides : Historique, Mes séances, Profil.

## Historique
- Liste des `session_logs` (récents d'abord), filtrable par exo/période.
- Détail d'un log = vue bilan en lecture seule.
- Courbes simples par exo : charge et volume dans le temps (progression visible). Données depuis `session_logs.payload`.

## Mes séances (plans)
- Liste des `sessions` ; dupliquer, éditer, supprimer ; marquer comme prochaine.
- Bouton « Nouvelle séance » : moteur, IA (import) ou construction manuelle.

## Bibliothèque d'exos
- Table `exercises` (globaux + perso). Recherche par muscle/matériel.
- Créer un exo perso (owner = utilisateur) avec `alternatives`.
- Utilisée par le switch d'exo (spec 02) et la construction de séances.

## Adaptation niveau
- `ui_density = dense` (avancé) : afficher tonnage, tendances, PR. `comfortable` (débutant) : épuré, conseils.

## Done
- Démarrer une séance depuis la home fonctionne.
- L'historique montre la progression réelle par exo.
- CRUD séances + exos perso opérationnel, RLS respecté.
