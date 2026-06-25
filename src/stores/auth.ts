// Store auth — session Supabase + utilisateur courant.
// Accès Supabase centralisé ici (pas d'appels bruts dans les composants).
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const initialized = ref(false);

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

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
    user.value = null;
  }

  return { user, initialized, init, signIn, signUp, signOut };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
}
