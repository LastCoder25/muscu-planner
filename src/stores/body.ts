// Store body — suivi corporel (poids, sommeil, circonférences).
// Accès Supabase centralisé. Une ligne = une saisie (check-in).
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';

export interface BodyEntry {
  id: string;
  measured_at: string; // date (YYYY-MM-DD)
  weight_kg: number | null;
  sleep_hours: number | null;
  measurements: Record<string, number> | null; // circonférences (cm)
  note: string | null;
  created_at: string;
}

export interface BodyEntryInput {
  measured_at?: string;
  weight_kg?: number | null;
  sleep_hours?: number | null;
  measurements?: Record<string, number> | null;
  note?: string | null;
}

export const useBodyStore = defineStore('body', () => {
  // Trié par date croissante (pratique pour les courbes) ; le dernier = le plus récent.
  const entries = ref<BodyEntry[]>([]);

  async function fetchRecent(limit = 90) {
    const { data, error } = await supabase
      .from('body_entries')
      .select('id, measured_at, weight_kg, sleep_hours, measurements, note, created_at')
      .order('measured_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    entries.value = (data ?? []).slice().reverse();
    return entries.value;
  }

  async function add(input: BodyEntryInput) {
    const { data, error } = await supabase
      .from('body_entries')
      .insert({
        measured_at: input.measured_at,
        weight_kg: input.weight_kg ?? null,
        sleep_hours: input.sleep_hours ?? null,
        measurements: input.measurements ?? null,
        note: input.note ?? null,
      })
      .select('id, measured_at, weight_kg, sleep_hours, measurements, note, created_at')
      .single();
    if (error) throw error;
    entries.value.push(data);
    entries.value.sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    return data;
  }

  async function remove(id: string) {
    const { error } = await supabase.from('body_entries').delete().eq('id', id);
    if (error) throw error;
    entries.value = entries.value.filter((e) => e.id !== id);
  }

  return { entries, fetchRecent, add, remove };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useBodyStore, import.meta.hot));
}
