# START — par où commencer

Ordre à suivre une seule fois. Coche au fur et à mesure.

## 1. Dossier + fichiers
- [ ] Créer un dossier `muscu-app`, y déposer tous ces fichiers.
- [ ] L'ouvrir dans VS Code. (Pré-requis : Node 18+ déjà installé.)

## 2. Git local
```bash
git init
git add .
git commit -m "scaffold initial (contrat, lib, specs, prompts)"
```
> Le `.gitignore` fourni protège déjà `.env` et `node_modules` — tes clés ne partiront jamais sur GitHub.

## 3. GitHub (repo privé, maintenant)
- [ ] Sur github.com : **New repository** → nom `muscu-app` → **Private** → **ne coche rien** (pas de README/.gitignore/licence, pour éviter les conflits).
```bash
git remote add origin git@github.com:TON_PSEUDO/muscu-app.git
git branch -M main
git push -u origin main
```

## 4. Supabase (seul compte requis pour construire)
- [ ] supabase.com → **New project** (région Europe). Noter le mot de passe de la base.
- [ ] **SQL Editor** → exécuter `supabase/migrations/0001_init.sql`.
- [ ] **SQL Editor** → exécuter `supabase/seed.sql`.
- [ ] **Project Settings → API** → copier l'**URL** et la clé **anon public**.
- [ ] **Authentication → Providers → Email** → activer.

## 5. Claude Code — Phase 0
- [ ] Ouvrir le panneau Claude Code, **Plan mode**, coller le prompt **Phase 0** de `docs/PROMPTS.md`.
- [ ] Une fois l'init Quasar terminée : créer `.env` à partir de `.env.example` avec ton URL + clé anon.
> Si le scaffolder Quasar refuse un dossier non vide : demande à Claude Code de « scaffolder dans un sous-dossier temporaire puis fusionner ».

## 6. Lancer en local
```bash
npm run dev
```
- [ ] L'app tourne sur `localhost`. Test connexion Supabase OK (cf. README).

## 7. Construire, tester, committer
- [ ] Enchaîner les prompts Phase 1 → 4 (`docs/PROMPTS.md`), une phase à la fois.
- [ ] Après chaque phase : tester, puis `git commit` + `git push`.

## 8. Vercel — plus tard (mise en ligne)
- [ ] vercel.com → **Add New → Project** → importer le repo GitHub.
- [ ] Build : preset `Other`, build `quasar build`, output `dist/spa`.
- [ ] Ajouter les 2 variables d'env (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
- [ ] Deploy. (Le `vercel.json` gère déjà le routing SPA.)

---
**Ta toute première action** : étapes 1 → 3 (dossier + git + push GitHub) en parallèle de l'ouverture du compte Supabase (étape 4). Les deux débloquent la Phase 0.
