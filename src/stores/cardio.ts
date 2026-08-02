// Store cardio — sorties course/trail (cardio_logs). Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import type { CardioLog } from '@/lib/types';
import { supabase } from '@/lib/supabase';

export interface CardioLogRow {
  id: string;
  run_type: string;
  performed_at: string;
  payload: CardioLog;
}

export const useCardioStore = defineStore('cardio', () => {
  const logs = ref<CardioLogRow[]>([]);

  async function fetchLogs(limit = 100) {
    const { data, error } = await supabase
      .from('cardio_logs')
      .select('id, run_type, performed_at, payload')
      .order('performed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    logs.value = (data) ?? [];
    return logs.value;
  }

  async function addLog(userId: string, log: CardioLog) {
    const id = log.id || crypto.randomUUID();
    const payload: CardioLog = { ...log, id };
    const performed_at = payload.performed_at ?? new Date().toISOString();
    const row = {
      id,
      user_id: userId,
      cardio_session_id: payload.cardio_session_id ?? null,
      run_type: payload.run_type,
      distance_km: payload.distance_km ?? null,
      duration_min: payload.duration_min ?? null,
      elevation_m: payload.elevation_m ?? null,
      rpe: payload.rpe ?? null,
      comment: payload.comment ?? null,
      payload,
      performed_at,
    };
    const { error } = await supabase.from('cardio_logs').insert(row);
    if (error) throw error;
    logs.value.unshift({ id, run_type: payload.run_type, performed_at, payload });
    return id;
  }

  async function remove(id: string) {
    const { error } = await supabase.from('cardio_logs').delete().eq('id', id);
    if (error) throw error;
    logs.value = logs.value.filter((l) => l.id !== id);
  }

  return { logs, fetchLogs, addLog, remove };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCardioStore, import.meta.hot));
}
