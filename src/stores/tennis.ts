// Store tennis — catalogue de drills (global) + séances de court (drill_sessions).
// Accès Supabase centralisé. Le catalogue est mis en cache après le 1er fetch.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import type { DrillSession, DrillLog } from '@/lib/types';
import type { DrillDef } from '@/lib/drills';
import { supabase } from '@/lib/supabase';

export interface DrillSessionRow {
  id: string;
  name: string;
  payload: DrillSession;
  created_at: string;
}

export interface DrillLogRow {
  id: string;
  name: string | null;
  performed_at: string;
  payload: DrillLog;
}

const DRILL_COLS =
  'id, sport, name, category, shot, pattern, partner_required, players, equipment, intensity, focus, level, default_format, description, instructions, tips';

export const useTennisStore = defineStore('tennis', () => {
  const catalog = ref<DrillDef[]>([]);
  const sessions = ref<DrillSessionRow[]>([]);
  const logs = ref<DrillLogRow[]>([]);

  async function fetchCatalog(force = false) {
    if (catalog.value.length && !force) return catalog.value;
    const { data, error } = await supabase.from('drills').select(DRILL_COLS).order('id');
    if (error) throw error;
    catalog.value = data ?? [];
    return catalog.value;
  }

  async function fetchMine() {
    const { data, error } = await supabase
      .from('drill_sessions')
      .select('id, name, payload, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    sessions.value = data ?? [];
    return sessions.value;
  }

  async function create(userId: string, session: DrillSession) {
    const id = session.id || crypto.randomUUID();
    const payload: DrillSession = {
      ...session,
      id,
      created_at: session.created_at ?? new Date().toISOString(),
    };
    const row = {
      id,
      user_id: userId,
      name: payload.name,
      theme: payload.theme ?? null,
      with_partner: payload.with_partner,
      level: payload.level ?? null,
      source: payload.source ?? 'engine',
      payload,
    };
    const { error } = await supabase.from('drill_sessions').insert(row);
    if (error) throw error;
    sessions.value.unshift({ id, name: payload.name, payload, created_at: payload.created_at! });
    return id;
  }

  async function remove(id: string) {
    const { error } = await supabase.from('drill_sessions').delete().eq('id', id);
    if (error) throw error;
    sessions.value = sessions.value.filter((s) => s.id !== id);
  }

  function byId(id: string) {
    return sessions.value.find((s) => s.id === id) ?? null;
  }

  // ————— Bilans (drill_logs) —————
  async function addLog(userId: string, log: DrillLog) {
    const row = {
      id: log.id,
      user_id: userId,
      drill_session_id: log.drill_session_id ?? null,
      name: log.name ?? null,
      sport: log.sport,
      duration_min: log.duration_min ?? null,
      global_difficulty: log.global_difficulty ?? null,
      payload: log,
      performed_at: log.ended_at ?? new Date().toISOString(),
    };
    const { error } = await supabase.from('drill_logs').insert(row);
    if (error) throw error;
    logs.value.unshift({
      id: log.id,
      name: log.name ?? null,
      performed_at: row.performed_at,
      payload: log,
    });
  }

  async function fetchLogs(limit = 50) {
    const { data, error } = await supabase
      .from('drill_logs')
      .select('id, name, performed_at, payload')
      .order('performed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    logs.value = data ?? [];
    return logs.value;
  }

  async function fetchLogById(id: string): Promise<DrillLog | null> {
    const cached = logs.value.find((l) => l.id === id);
    if (cached) return cached.payload;
    const { data, error } = await supabase
      .from('drill_logs')
      .select('payload')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data?.payload as DrillLog) ?? null;
  }

  async function removeLog(id: string) {
    const { error } = await supabase.from('drill_logs').delete().eq('id', id);
    if (error) throw error;
    logs.value = logs.value.filter((l) => l.id !== id);
  }

  return {
    catalog,
    sessions,
    logs,
    fetchCatalog,
    fetchMine,
    create,
    remove,
    byId,
    addLog,
    fetchLogs,
    fetchLogById,
    removeLog,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTennisStore, import.meta.hot));
}
