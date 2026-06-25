# Spec 01 — Auth + Onboarding

## But
Connecter l'utilisateur (Supabase Auth email) puis collecter son profil, écrire `profiles`, dériver `level_config`, et bifurquer selon le niveau.

## Données
- **In** : saisie utilisateur.
- **Out** : 1 ligne `profiles` (`payload` = objet `Profile` complet ; colonnes extraites `level`, `objective`, `sessions_per_week`, `units` ; `level_config` = `deriveLevelConfig(level)`).
- Types : `Profile`, `LevelConfig` (`src/lib/types.ts`, `src/lib/levelConfig.ts`).

## Auth
- Écran login/signup email (lien magique ou mot de passe). Client : `src/lib/supabase.ts`.
- Après login, si pas de ligne `profiles` → onboarding ; sinon → home.

## Formulaire (les 7 blocs, dans cet ordre)
1. **Identité** : prénom (requis), sexe, année de naissance, taille (cm), poids (kg).
2. **Niveau** : `debutant` / `intermediaire` / `avance` (cards explicatives). Optionnel : ancienneté (mois), 1RM connus.
3. **Objectif** : force / hypertrophie / endurance / remise_en_forme / perte_de_gras (un seul).
4. **Disponibilités** : séances/semaine (2–6), durée/séance (30/45/60/90), jours préférés.
5. **Matériel** : salle_complete / home_gym / halteres / poids_du_corps.
6. **Contraintes** : blessures/zones sensibles (multi), exos à éviter.
7. **Préférences** : muscles à prioriser, unités kg/lb.

Présentation : stepper multi-étapes, une question majeure par écran, gros boutons (mobile).

## Validations
- Prénom requis ; poids/taille numériques plausibles ; séances/semaine 2–6 ; au moins objectif + niveau + matériel.
- Champs optionnels clairement marqués.

## Bifurcation finale (selon `level_config.program_mode`)
- `guided` (débutant) → écran « On te génère ton premier programme » : matcher déterministe `niveau + séances/sem + durée + matériel + contraintes` → template (`src/data/templates.ts`), inséré comme `sessions` de l'utilisateur.
- `assisted` (intermédiaire) → propose un template **éditable**.
- `free` (avancé) → écran « Importe (JSON via `coach.ts`) ou construis ta séance ».

## Done
- Une ligne `profiles` cohérente est créée, `level_config` stocké.
- Au moins une `session` existe pour l'utilisateur à la sortie (template ou importée).
- RLS OK : l'utilisateur ne lit/écrit que ses données.
