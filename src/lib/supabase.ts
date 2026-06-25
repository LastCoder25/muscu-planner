// supabase.ts — client unique, partagé dans toute l'app.
// @quasar/app-vite (v3) charge automatiquement .env / .env.local et expose
// au code client les variables préfixées (cf. build.env.clientPrefix dans
// quasar.config.ts) via import.meta.env.*. La clé "anon" est PUBLIQUE par
// design (la sécurité repose sur les RLS Postgres), donc OK côté client.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.SUPABASE_URL;
const key = import.meta.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] SUPABASE_URL / SUPABASE_ANON_KEY manquants — vérifie ton .env');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
