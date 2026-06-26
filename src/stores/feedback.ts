// Store feedback — backlog : tickets remontés depuis l'app.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';

export type FeedbackKind = 'bug' | 'idea' | 'other';

export interface FeedbackRow {
  id: string;
  kind: FeedbackKind;
  message: string;
  status: 'open' | 'in_progress' | 'done';
  page: string | null;
  created_at: string;
}

export const useFeedbackStore = defineStore('feedback', () => {
  const mine = ref<FeedbackRow[]>([]);

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
      .select('id, kind, message, status, page, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    mine.value = data ?? [];
    return mine.value;
  }

  return { mine, submit, fetchMine };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFeedbackStore, import.meta.hot));
}
