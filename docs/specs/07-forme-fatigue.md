# Spec 07 — Forme & fatigue

> **Statut : proposition à valider.**

## But
Avant de démarrer une séance, un **check rapide** (forme / sommeil / courbatures) qui **propose** — mais
**n'impose jamais** — un **allègement** de la séance si tu es fatigué. Capture aussi la « forme du jour »
dans le bilan (utile pour le futur deload auto).

## Données
- **In** : la `session` à démarrer + saisie du check.
- **Out** : influence l'exécution (allégé ou normal) + `readiness` stocké dans le `session_log`.
- Contrat : ajout **additif optionnel** `SessionLog.readiness?: number` (1–5, 5 = top forme).
  (Pas de table dédiée ; on reste léger.)

## Écran (`/session/:id/ready`, BlankLayout) — « Forme du jour »
- 3 mini-échelles (3 niveaux chacune, gros boutons) :
  - **Forme générale** (faible / ok / en forme)
  - **Sommeil** (mauvais / correct / bon)
  - **Courbatures** (fortes / légères / aucune)
- **Score readiness** (1–5) dérivé simplement de ces 3 réponses.
- **Suggestion** (jamais imposée) : si score bas → carte « Journée fatiguée — séance allégée conseillée » ;
  sinon « En forme — séance normale ».
- **Deux boutons** : « Séance normale » / « Séance allégée ». + lien discret « Passer » (= normale, sans noter).
- **Reprise** : si une séance est déjà en cours pour cette `session` (`live.hasSaved`), on **saute** ce check
  et on va directement à l'exécution.

## Allègement (proposé)
- **−1 série par exercice** (plancher 2 séries). Concret et lisible (les charges sont souvent « à définir »
  en début de programme). *(À valider : variante possible = −10 % de charge, ou les deux.)*

## Comportements
- « Démarrer » (Home ▶ / détail de séance) → `/session/:id/ready` (sauf reprise → live direct).
- Choix → `live.start(session, { light, readiness })` (run frais, allégé si demandé) → `/session/:id` (live).
- `readiness` inclus dans le `session_log` au `buildLog`.

## Done
- Le check s'affiche avant une nouvelle séance, se saute en cas de reprise.
- L'allègement réduit réellement le volume (séries) **si** choisi ; sinon séance normale.
- Rien n'est imposé ; `readiness` se retrouve dans le bilan/historique.
