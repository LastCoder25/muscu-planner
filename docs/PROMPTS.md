# Prompts pour Claude Code

À coller dans le panneau Claude Code, dans l'ordre. **Mets-le en Plan mode** pour les phases lourdes : il écrit un plan que tu valides avant qu'il code. Construis et valide une phase avant la suivante.

---

### Phase 0 — Init & câblage
```
Lis CLAUDE.md et docs/. Initialise un projet Quasar (Vue 3, Vite, TypeScript strict, Pinia)
dans ce dossier. Installe @supabase/supabase-js. Intègre les fichiers src/lib/ et src/data/
existants SANS les réécrire. Applique le design system (docs/design-system.md) :
quasar.variables.sass, mode sombre forcé, fonts Oswald + Inter. Configure le chargement
des variables d'env (.env → process.env). Ne construis aucune page métier pour l'instant.
Termine par un check : l'app build et la connexion Supabase répond (select sur sessions).
```

### Phase 1 — Auth + Onboarding
```
Implémente docs/specs/01-onboarding.md. Auth Supabase email, puis l'onboarding multi-étapes
qui écrit profiles (payload Profile + colonnes extraites + level_config via deriveLevelConfig),
et bifurque selon level_config.program_mode. Pour le débutant, utilise suggestTemplates()
(src/data/templates.ts) et insère le template choisi comme session de l'utilisateur.
Respecte les types de src/lib/types.ts et les RLS. Mobile d'abord.
```

### Phase 2 — Séance live
```
Implémente docs/specs/02-seance-live.md en reproduisant fidèlement docs/seance-live-mockup.html
en composants Quasar. Branche sur Supabase : lit une session, produit un session_log à la fin.
Timer de repos radial, steppers, note 1–4, switch d'exo (onglets Suggestions / Séances passées),
dictée micro, edits live, reprise après fermeture. Toute la logique métier reste dans src/lib.
```

### Phase 3 — Bilan & coach
```
Implémente docs/specs/03-bilan.md. Vue prévu vs réalisé, puis les deux chemins de génération :
moteur (nextSessionDeterministic) et IA (buildCoachRequest pour l'export + validateImportedSession
pour l'import, avec gestion d'erreurs lisible). Insère la nouvelle session.
```

### Phase 4 — Home, historique, bibliothèque
```
Implémente docs/specs/04-historique.md : home (démarrer la prochaine séance), historique des
session_logs avec courbes de progression par exo, CRUD des sessions et de la bibliothèque
d'exercices (table exercises, perso + globaux). Respecte les RLS et l'adaptation par ui_density.
```

---

### Bonnes pratiques de session
- Une phase = une session Claude Code propre. `/compact` avant de changer de phase.
- Après chaque phase : teste, commit, puis passe à la suivante.
- Si tu ajoutes un champ au modèle : mets à jour `src/lib/types.ts` ET le SQL ensemble, et note-le dans CLAUDE.md.
- Quand une décision d'archi/design se pose, reviens vers le chat de conception pour le « quoi », puis répercute dans CLAUDE.md.
