// Store auth — session Supabase + utilisateur courant.
// Accès Supabase centralisé ici (pas d'appels bruts dans les composants).
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref, computed } from 'vue';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { consentMeta, hasConsented } from '@/lib/privacy';

// Comptes autorisés à gérer le backlog. La vérification fait aussi autorité
// côté Postgres (fonction is_admin() + RLS feedback) — ceci n'est que l'UI.
const ADMIN_EMAILS = ['martinez.alban25@gmail.com'];

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const initialized = ref(false);

  const isAdmin = computed(() => {
    const email = user.value?.email?.toLowerCase();
    return !!email && ADMIN_EMAILS.includes(email);
  });

  // Appelé une fois au boot : lit la session existante puis écoute les changements.
  async function init() {
    if (initialized.value) return;
    const { data } = await supabase.auth.getSession();
    user.value = data.session?.user ?? null;
    supabase.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user ?? null;
    });
    initialized.value = true;
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  /** 🔒 Le consentement est enregistré DATÉ dans les métadonnées du compte (RGPD). */
  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: consentMeta(new Date()) },
    });
    if (error) throw error;
  }

  /** Le compte a-t-il accepté la version courante de la politique de confidentialité ? */
  const consented = computed(() => hasConsented(user.value?.user_metadata));

  async function acceptPrivacy() {
    const { data, error } = await supabase.auth.updateUser({ data: consentMeta(new Date()) });
    if (error) throw error;
    user.value = data.user;
  }

  async function signOut() {
    await supabase.auth.signOut();
    user.value = null;
  }

  // Envoie l'email de réinitialisation ; le lien ramène sur l'app (session de
  // recovery) → boot/auth route vers /reset-password.
  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  }

  // Définit le nouveau mot de passe (nécessite une session de recovery active).
  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    // 🔒 Mot de passe changé = toutes les AUTRES sessions et leurs jetons sont révoqués.
    await supabase.auth.signOut({ scope: 'others' });
  }

  return {
    user,
    initialized,
    isAdmin,
    init,
    signIn,
    signUp,
    consented,
    acceptPrivacy,
    signOut,
    resetPassword,
    updatePassword,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
}
