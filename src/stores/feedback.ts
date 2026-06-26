// Store feedback — backlog : tickets remontés depuis l'app.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';

export type FeedbackKind = 'bug' | 'idea' | 'other';

export type FeedbackStatus = 'open' | 'in_progress' | 'done';

export interface FeedbackRow {
  id: string;
  kind: FeedbackKind;
  message: string;
  status: FeedbackStatus;
  page: string | null;
  app_version: string | null;
  created_at: string;
}

export const useFeedbackStore = defineStore('feedback', () => {
  const mine = ref<FeedbackRow[]>([]);
  const all = ref<FeedbackRow[]>([]);

  // user_id est rempli par défaut (auth.uid()) côté DB.
  async function submit(input: { kind: FeedbackKind; message: string; page: string; app_version: string }) {
    const { error } = await supabase.from('feedback').insert({
      kind: input.kind,
      message: input.message,
      page: input.page,
      app_version: input.app_version,
    });
    if (error) throw error;
  }

  async function fetchMine() {
    const { data, error } = await supabase
      .from('feedback')
      .select('id, kind, message, status, page, app_version, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    mine.value = data ?? [];
    return mine.value;
  }

  // Tous les tickets (gestion admin/testeurs ; RLS read-all depuis 0007).
  async function fetchAll() {
    const { data, error } = await supabase
      .from('feedback')
      .select('id, kind, message, status, page, app_version, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    all.value = data ?? [];
    return all.value;
  }

  async function setStatus(id: string, status: FeedbackStatus) {
    const { error } = await supabase.from('feedback').update({ status }).eq('id', id);
    if (error) throw error;
    const t = all.value.find((x) => x.id === id);
    if (t) t.status = status;
  }

  return { mine, all, submit, fetchMine, fetchAll, setStatus };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFeedbackStore, import.meta.hot));
}
