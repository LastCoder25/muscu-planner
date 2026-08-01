// Store tennis — catalogue de drills (global) + séances de court (drill_sessions).
// Accès Supabase centralisé. Le catalogue est mis en cache après le 1er fetch.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import type { DrillSession } from '@/lib/types';
import type { DrillDef } from '@/lib/drills';
import { supabase } from '@/lib/supabase';

export interface DrillSessionRow {
  id: string;
  name: string;
  payload: DrillSession;
  created_at: string;
}

const DRILL_COLS =
  'id, sport, name, category, shot, pattern, partner_required, players, equipment, intensity, focus, level, default_format, description, instructions, tips';

export const useTennisStore = defineStore('tennis', () => {
  const catalog = ref<DrillDef[]>([]);
  const sessions = ref<DrillSessionRow[]>([]);

  async function fetchCatalog(force = false) {
    if (catalog.value.length && !force) return catalog.value;
    const { data, error } = await supabase.from('drills').select(DRILL_COLS).order('id');
    if (error) throw error;
    catalog.value = (data) ?? [];
    return catalog.value;
  }

  async function fetchMine() {
    const { data, error } = await supabase
      .from('drill_sessions')
      .select('id, name, payload, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    sessions.value = (data) ?? [];
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

  return { catalog, sessions, fetchCatalog, fetchMine, create, remove, byId };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTennisStore, import.meta.hot));
}
