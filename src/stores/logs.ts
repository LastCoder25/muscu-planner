// Store logs — bilans de séance (`session_logs`).
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import type { SessionLog } from '@/lib/types';
import { supabase } from '@/lib/supabase';

export interface LogRow {
  id: string;
  name: string | null;
  performed_at: string;
  payload: SessionLog;
}

export const useLogsStore = defineStore('logs', () => {
  const recent = ref<LogRow[]>([]);

  async function insert(userId: string, log: SessionLog) {
    const { error } = await supabase.from('session_logs').insert({
      id: log.id,
      user_id: userId,
      session_id: log.session_id ?? null,
      name: log.name ?? null,
      duration_min: log.duration_min ?? null,
      global_difficulty: log.global_difficulty ?? null,
      payload: log,
    });
    if (error) throw error;
  }

  async function fetchRecent(limit = 12) {
    const { data, error } = await supabase
      .from('session_logs')
      .select('id, name, performed_at, payload')
      .order('performed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    recent.value = data ?? [];
    return recent.value;
  }

  return { recent, insert, fetchRecent };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLogsStore, import.meta.hot));
}
