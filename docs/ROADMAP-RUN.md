# ROADMAP-RUN — dérouler la roadmap sans refaire l'existant

Le projet a déjà : **auth, onboarding, écran de séance** (en partie). Ce protocole guide Claude Code
pour **compléter** la roadmap sans jamais reconstruire ce qui marche déjà.

## Règle d'or (s'applique à CHAQUE étape)
1. **Inventorier avant de créer.** Cherche dans le code si la fonctionnalité / le fichier existe déjà.
2. **Si ça existe → adapter / étendre, jamais réécrire de zéro.** Si ça manque → créer.
3. **Une seule source de vérité** : le contrat `types.ts`. Tout s'y aligne.
4. **Plan mode** pour chaque étape : proposer un plan, attendre la validation avant d'écrire.
5. **Un commit par étape**, message clair.
6. **En cas de doute ou de risque d'écrasement → s'arrêter et demander.** Ne jamais écraser à l'aveugle.
7. Respecter `CLAUDE.md` : mobile-first, couleurs via variables CSS (thèmes), RLS, « proposer jamais imposer ».

Construire dans l'ordre ci-dessous. Coller une étape, valider le plan, exécuter, puis passer à la suivante.

---

### Étape 0 — État des lieux & alignement du contrat (PRIORITÉ ABSOLUE)
```
Fais l'inventaire du projet existant (auth, onboarding, séance) et compare les structures de
données réellement écrites/lues (profil, sessions, session_logs) avec le contrat src/lib/types.ts
et le schéma supabase/migrations. Liste les divergences (champs, schéma DB, level_config, note 1–4…).
Propose un plan pour CONVERGER vers un seul contrat : adapter l'existant sans tout réécrire,
et migrations ADDITIVES pour la base. Ne modifie rien : donne l'état des lieux + le plan, j'attends.
```

### Étape 1 — Brancher l'intelligence sur l'existant (src/lib)
```
Sans refaire les écrans existants, branche les modules src/lib sur ce qui est déjà là :
- onboarding → dérive et stocke level_config (levelConfig.ts) ;
- séance → écrit un session_log conforme au contrat ;
- prépare l'appel à progression.ts / estimates.ts / coach.ts pour la suite.
Vérifie d'abord ce qui est déjà câblé pour ne pas dupliquer. Plan d'abord.
```

### Étape 2 — Compléter onboarding & séance (specs 01 & 02) — seulement les manques
```
Compare l'onboarding et l'écran de séance existants avec docs/specs/01-onboarding.md et
02-seance-live.md. Ajoute UNIQUEMENT ce qui manque : objectif guidé (src/data/objectives.ts),
note d'effort 1–4, switch d'exo (Suggestions / Séances passées), assistance élastique/machine,
dictée, steppers, timer de repos. Ne reconstruis pas ce qui fonctionne déjà. Plan d'abord.
```

### Étape 3 — Quick wins indépendants
```
Implémente, en vérifiant qu'ils n'existent pas déjà :
- le Backlog (docs/specs/08-backlog.md, migration 0002, scripts/backlog.mjs) — strictement tester/admin ;
- les Paramètres + 10 thèmes (docs/specs/09-parametres.md, src/data/themes.ts).
Ces deux blocs sont indépendants du reste. Plan d'abord.
```

### Étape 4 — Écrans manquants, dans cet ordre
```
Pour chacun : vérifie s'il existe déjà, sinon construis-le selon sa spec. Un écran = un commit.
1. Bilan + coach (03)         — prévu vs réalisé, génération moteur/IA, max estimé (estimates.ts)
2. Séance libre (05)          — sans plan, picker d'exos, chrono basique
3. Fiche exercice (06)        — média/instructions, accessible depuis picker/live/bibliothèque
4. Forme & fatigue (07)       — check pré-séance + allègement proposé (jamais imposé)
5. Home + historique (04)     — démarrage, courbes de progression, CRUD séances/exos
Plan d'abord pour chaque écran.
```

### Étape 5 — Mise en ligne (quand prêt)
```
Déploie le front sur Vercel depuis GitHub (build quasar build, sortie dist/spa, 2 variables d'env),
vérifie le vercel.json (routing SPA) et teste la version prod.
```

---

## Après la roadmap
Le développement courant passe par le **backlog** : tu remontes des tickets depuis l'app, puis tu lances
`docs/BACKLOG-RUN.md` pour que Claude Code les traite un par un. La roadmap pose le socle ; le backlog fait vivre l'app.
