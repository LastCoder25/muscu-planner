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

  // Un bilan par son id (écran Bilan).
  async function fetchById(id: string): Promise<SessionLog | null> {
    const { data, error } = await supabase
      .from('session_logs')
      .select('payload')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data?.payload as SessionLog) ?? null;
  }

  // Dernier bilan d'une séance donnée → entrée de nextSessionDeterministic.
  async function lastForSession(sessionId: string): Promise<SessionLog | null> {
    const { data, error } = await supabase
      .from('session_logs')
      .select('payload')
      .eq('session_id', sessionId)
      .order('performed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data?.payload as SessionLog) ?? null;
  }

  // Les `depth` derniers bilans (depth = level_config.coach_history_depth)
  // → paramètre `history` du moteur et de coach.buildCoachRequest.
  async function fetchHistory(depth: number): Promise<SessionLog[]> {
    const { data, error } = await supabase
      .from('session_logs')
      .select('payload')
      .order('performed_at', { ascending: false })
      .limit(Math.max(1, depth));
    if (error) throw error;
    return ((data ?? []) as { payload: SessionLog }[]).map((r) => r.payload);
  }

  return { recent, insert, fetchRecent, fetchById, lastForSession, fetchHistory };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLogsStore, import.meta.hot));
}
