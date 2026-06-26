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
  screenshots: string[] | null;
  created_at: string;
}

const COLS = 'id, kind, message, status, page, app_version, screenshots, created_at';

export const useFeedbackStore = defineStore('feedback', () => {
  const mine = ref<FeedbackRow[]>([]);
  const all = ref<FeedbackRow[]>([]);

  // Upload des captures dans le bucket public `feedback` → URLs publiques.
  async function uploadScreenshots(files: File[]): Promise<string[]> {
    const urls: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('feedback').upload(path, file, { contentType: file.type });
      if (error) throw error;
      urls.push(supabase.storage.from('feedback').getPublicUrl(path).data.publicUrl);
    }
    return urls;
  }

  // user_id est rempli par défaut (auth.uid()) côté DB.
  async function submit(input: { kind: FeedbackKind; message: string; page: string; app_version: string; screenshots?: string[] }) {
    const { error } = await supabase.from('feedback').insert({
      kind: input.kind,
      message: input.message,
      page: input.page,
      app_version: input.app_version,
      screenshots: input.screenshots?.length ? input.screenshots : null,
    });
    if (error) throw error;
  }

  async function fetchMine() {
    const { data, error } = await supabase
      .from('feedback')
      .select(COLS)
      .order('created_at', { ascending: false });
    if (error) throw error;
    mine.value = data ?? [];
    return mine.value;
  }

  // Tous les tickets (gestion admin/testeurs ; RLS read-all depuis 0007).
  async function fetchAll() {
    const { data, error } = await supabase
      .from('feedback')
      .select(COLS)
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

  return { mine, all, uploadScreenshots, submit, fetchMine, fetchAll, setStatus };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFeedbackStore, import.meta.hot));
}
