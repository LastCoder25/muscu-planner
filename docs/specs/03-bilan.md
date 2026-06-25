# Spec 03 — Bilan & coach

## But
Afficher le bilan de la séance (prévu vs réalisé), puis générer la suivante — soit par le moteur déterministe, soit via export/import IA.

## Données
- **In** : le `session_log` qui vient d'être créé + la `session` source + `profile` + historique récent.
- **Out** : une nouvelle `session` (insérée), source `engine` ou `ai`.
- Types/fonctions : `nextSessionDeterministic` (`progression.ts`), `buildCoachRequest` / `validateImportedSession` (`coach.ts`).

## Écran bilan
- Par exercice : **prévu vs réalisé** (cible vs séries faites), notes 1–4 par série, commentaires, `swapped_from` si switch.
- Récap : volume total, durée, note globale, commentaire global.
- Suggestions auto du moteur : « +2,5 kg au développé couché la prochaine fois » (issu de la simulation `nextSessionDeterministic`).

## Deux chemins pour la séance suivante
1. **Moteur (défaut)** : bouton « Générer la prochaine séance » → `nextSessionDeterministic(plan, lastLog, level_config, history)` → insert `sessions`.
2. **IA (fallback)** :
   - « Exporter pour une IA » → `buildCoachRequest(profile, history, lastSession)` → afficher le JSON + bouton **Copier** (profondeur d'historique = `level_config.coach_history_depth`).
   - « Importer une séance » → zone de collage → `validateImportedSession(raw)` → aperçu → insert `sessions` (source `ai`). Erreurs affichées lisiblement (type/version/exos manquants).

## Adaptation niveau
- `program_mode = guided` (débutant) : pousser le chemin moteur, masquer l'export IA par défaut.
- `program_mode = free` (avancé) : export/import IA en avant.

## Done
- Le bilan reflète fidèlement `planned` vs `performed`.
- Les deux chemins produisent une `session` valide insérée.
- Le round-trip IA (export → coller dans ChatGPT → réimport) fonctionne de bout en bout.
