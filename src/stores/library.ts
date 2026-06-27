// Store library — bibliothèque d'exercices (`exercises`, globaux + perso).
import { defineStore, acceptHMRUpdate } from 'pinia';
import { supabase } from '@/lib/supabase';

export interface ExerciseRow {
  id: string;
  name: string;
  muscle_primary: string | null;
  muscle_secondary?: string[] | null;
  equipment: string | null;
  equipment_required?: string[] | null;
  difficulty?: number | null;
  unit?: string | null; // 'reps' (défaut) ou 'time'
  unilateral?: boolean | null; // un côté à la fois
}

export interface ExerciseFull extends ExerciseRow {
  payload?: {
    alternatives?: string[];
    notes?: string;
    instructions?: string;
    media_url?: string;
  } | null;
}

export const useLibraryStore = defineStore('library', () => {
  async function fetchOne(id: string) {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, payload')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as ExerciseFull) ?? null;
  }

  async function fetchAll() {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral');
    if (error) throw error;
    return (data as ExerciseRow[]) ?? [];
  }

  async function fetchByMuscle(muscle: string) {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, muscle_primary, equipment')
      .eq('muscle_primary', muscle);
    if (error) throw error;
    return (data as ExerciseRow[]) ?? [];
  }

  async function fetchByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, muscle_primary, equipment')
      .in('id', ids);
    if (error) throw error;
    return (data as ExerciseRow[]) ?? [];
  }

  return { fetchOne, fetchAll, fetchByMuscle, fetchByIds };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLibraryStore, import.meta.hot));
}
