// 🔒 RGPD — droits d'accès/portabilité et d'effacement (audit 2026-10-15).
// Accès Supabase centralisé ici, comme les autres stores.
import { defineStore } from 'pinia';
import { supabase } from '@/lib/supabase';
import { EXPORT_TABLES, exportFileName } from '@/lib/privacyExport';

export const usePrivacyStore = defineStore('privacy', () => {
  /** 📦 Toutes mes données, en un objet JSON. Lit chaque table par MA colonne d'utilisateur
   *  (filtre explicite : la RLS borne ce qu'on a le droit de lire, pas ce qu'on veut). */
  async function exportAll(): Promise<Record<string, unknown>> {
    const { data: u } = await supabase.auth.getUser();
    const user = u.user;
    if (!user) throw new Error('Non connecté.');
    const out: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        metadata: user.user_metadata,
      },
    };
    for (const t of EXPORT_TABLES) {
      let q = supabase.from(t.table).select('*');
      q =
        t.cols.length === 1
          ? q.eq(t.cols[0]!, user.id)
          : q.or(t.cols.map((c) => `${c}.eq.${user.id}`).join(','));
      const { data, error } = await q;
      out[t.table] = error ? { erreur: error.message } : (data ?? []);
    }
    const files = await supabase.storage.from('feedback').list(user.id);
    out.fichiers = (files.data ?? []).map((f) => `feedback/${user.id}/${f.name}`);
    return out;
  }

  /** Télécharge l'export dans le navigateur. */
  async function downloadExport(): Promise<void> {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(new Date());
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** 🗑️ Supprime le compte : mot de passe redemandé, fichiers effacés, puis toutes les lignes
   *  partent par cascade côté base (`delete_my_account`, migr. 0109). */
  async function deleteAccount(password: string): Promise<void> {
    const { data: u } = await supabase.auth.getUser();
    const email = u.user?.email;
    if (!u.user || !email) throw new Error('Non connecté.');
    const { error: e1 } = await supabase.auth.signInWithPassword({ email, password });
    if (e1) throw new Error('Mot de passe incorrect.');
    const files = await supabase.storage.from('feedback').list(u.user.id);
    const names = (files.data ?? []).map((f) => `${u.user.id}/${f.name}`);
    if (names.length) await supabase.storage.from('feedback').remove(names);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;
    // Effacer aussi ce que l'app garde dans CE navigateur.
    try {
      for (const k of Object.keys(localStorage))
        if (k.startsWith('muscu:')) localStorage.removeItem(k);
    } catch {
      /* stockage indisponible */
    }
    await supabase.auth.signOut({ scope: 'local' });
  }

  return { exportAll, downloadExport, deleteAccount };
});
