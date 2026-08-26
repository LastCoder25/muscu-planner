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
  challenge_only?: boolean | null; // exo réservé aux défis (exclu du générateur)
  category?: string | null; // 'musculation' (défaut) ou 'prepa_physique'
  tags?: string[] | null; // tags libres (tennis, agilite, pliometrie…)
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
      .select(
        'id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, payload',
      )
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as ExerciseFull) ?? null;
  }

  async function fetchAll() {
    const { data, error } = await supabase
      .from('exercises')
      .select(
        'id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, challenge_only, category, tags',
      );
    if (error) throw error;
    return (data as ExerciseRow[]) ?? [];
  }

  // Exercices de prépa physique (category = 'prepa_physique'), pour le générateur
  // de séance de prépa. Optionnellement filtrés par tag (ex. 'tennis').
  async function fetchPrepa(tag?: string) {
    let q = supabase
      .from('exercises')
      .select(
        'id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, category, tags',
      )
      .eq('category', 'prepa_physique');
    if (tag) q = q.contains('tags', [tag]);
    const { data, error } = await q;
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
      .select('id, name, muscle_primary, equipment, equipment_required, tags')
      .in('id', ids);
    if (error) throw error;
    return (data as ExerciseRow[]) ?? [];
  }

  return { fetchOne, fetchAll, fetchPrepa, fetchByMuscle, fetchByIds };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLibraryStore, import.meta.hot));
}
