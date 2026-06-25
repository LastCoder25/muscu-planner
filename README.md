# Appli muscu — setup

Stack : **Quasar (Vue 3 / Vite / TS)** côté front, **Supabase** (Postgres + auth) côté back, **Vercel** (Hobby, gratuit) pour héberger le front statique. Tout repose sur le contrat JSON v1.0.

Arborescence à reporter dans ton projet Quasar :

```
mon-projet-quasar/
├─ .env                      ← copié depuis .env.example, rempli
├─ vercel.json               ← routing SPA pour Vercel
├─ supabase/
│  └─ migrations/0001_init.sql
└─ src/lib/
   ├─ supabase.ts            ← client
   ├─ types.ts               ← types = contrat JSON
   ├─ levelConfig.ts         ← adaptation par niveau
   ├─ progression.ts         ← moteur déterministe
   └─ coach.ts               ← export/import IA
```

## Étape 1 — Supabase (base + auth)

1. [supabase.com](https://supabase.com) → **New project**. Note la **région** (Europe, ex. Paris/Frankfurt) et le **mot de passe** de la base.
2. Une fois le projet créé : **Project Settings → API**. Copie l'**URL** et la clé **anon public**.
3. **SQL Editor → New query** → colle tout `supabase/migrations/0001_init.sql` → **Run**. Ça crée les 4 tables + les RLS.
4. **Authentication → Providers → Email** : active-le (lien magique ou mot de passe, au choix).

## Étape 2 — App Quasar

```bash
npm init quasar           # → App with Quasar CLI ; Vite ; Vue 3 ; TypeScript ; Pinia
cd mon-projet-quasar
npm i @supabase/supabase-js
```

- Copie le dossier `src/lib/` et `supabase/` fournis dans le projet.
- Copie `.env.example` en `.env` et renseigne `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
- Test rapide :

```ts
import { supabase } from 'src/lib/supabase';
const { data, error } = await supabase.from('sessions').select('*');
console.log(data, error);   // [] sans erreur = connexion + RLS OK
```

## Étape 3 — Déploiement Vercel (gratuit)

1. Pousse le projet sur un dépôt **GitHub**.
2. [vercel.com](https://vercel.com) → **Add New → Project** → importe le dépôt.
3. Réglages de build :
   - **Framework Preset** : `Other`
   - **Build Command** : `quasar build`
   - **Output Directory** : `dist/spa`
   - **Install Command** : `npm install`
4. **Environment Variables** : ajoute `SUPABASE_URL` et `SUPABASE_ANON_KEY` (mêmes valeurs que le `.env`).
5. **Deploy**. Le `vercel.json` fourni gère le routing SPA (toutes les routes → `index.html`).

> Rappel : le plan **Hobby est gratuit mais réservé à un usage personnel non-commercial** — ce qui correspond à ton cas (toi + ton pote, aucun revenu).

## Comment les pièces s'emboîtent

- `types.ts` est la traduction TS du contrat. Tout le reste s'appuie dessus.
- `levelConfig.ts` : `experience.level` → `level_config` → comportement (progression, signal d'effort, densité UI…). C'est ici que toi (débutant, linéaire) et ton pote (avancé, double + RIR) divergent **sans code dupliqué**.
- `progression.ts` : le moteur « sans IA ». Lit le dernier `session_log`, applique les règles, renvoie une `session`.
- `coach.ts` : `buildCoachRequest()` pour exporter vers ChatGPT, `validateImportedSession()` pour réimporter le JSON renvoyé en toute sécurité (whitelist stricte).

Moteur et IA produisent **le même type** (`Session`) — l'app les traite de façon identique.

## Prochaines étapes (UI)

1. Page **onboarding** (remplit `profiles`, dérive `level_config`, bifurque selon le niveau).
2. Page **séance live** (la maquette → branchée sur Supabase + `progression.ts`).
3. Page **bilan** (prévu vs réalisé + bouton export `coach.ts`).
