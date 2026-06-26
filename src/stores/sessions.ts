// Store sessions — les plans (`sessions`) de l'utilisateur.
// Stratégie BDD : payload JSONB canonique + colonnes extraites indexées.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import type { Session } from '@/lib/types';
import { supabase } from '@/lib/supabase';

export interface SessionRow {
  id: string;
  name: string;
  payload: Session;
  created_at: string;
}

export const useSessionsStore = defineStore('sessions', () => {
  const list = ref<SessionRow[]>([]);

  async function fetchMine() {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, name, payload, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    list.value = (data) ?? [];
    return list.value;
  }

  // Insère une Session : on garde le même id pour la ligne et le payload.
  async function insert(userId: string, session: Session) {
    const id = session.id || crypto.randomUUID();
    const payload: Session = {
      ...session,
      id,
      created_at: session.created_at ?? new Date().toISOString(),
    };
    const row = {
      id,
      user_id: userId,
      name: payload.name,
      split: payload.split ?? null,
      objective: payload.objective ?? null,
      level: payload.level ?? null,
      source: payload.source ?? 'app',
      payload,
    };
    const { error } = await supabase.from('sessions').insert(row);
    if (error) throw error;
    return id;
  }

  async function deleteAll(userId: string) {
    const { error } = await supabase.from('sessions').delete().eq('user_id', userId);
    if (error) throw error;
    list.value = [];
  }

  // Remplace toutes les séances de l'utilisateur (régénération de programme).
  async function replaceAll(userId: string, newSessions: Session[]) {
    await deleteAll(userId);
    for (const s of newSessions) await insert(userId, s);
    await fetchMine();
  }

  return { list, fetchMine, insert, deleteAll, replaceAll };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSessionsStore, import.meta.hot));
}
