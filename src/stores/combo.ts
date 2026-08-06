// Store combo — Défi 360 (défi combiné hebdo). Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { comboComplete, type ComboChallenge, type ComboLeg } from '@/lib/combo';

export interface ComboRow extends ComboChallenge {
  user_id?: string;
}

export class ComboActiveError extends Error {
  constructor() {
    super('Tu as déjà un Défi 360 en cours (1 max).');
    this.name = 'ComboActiveError';
  }
}

const COLS = 'id, name, start_date, duration_days, status, legs';

export interface NewCombo {
  name: string;
  start_date: string;
  duration_days: number;
  legs: ComboLeg[];
}

export const useComboStore = defineStore('combo', () => {
  const list = ref<ComboRow[]>([]);
  const loaded = ref(false);

  async function fetchMine() {
    const { data, error } = await supabase
      .from('combo_challenges')
      .select(COLS)
      .order('created_at', { ascending: false });
    if (error) throw error;
    list.value = data ?? [];
    loaded.value = true;
    return list.value;
  }

  const activeOne = () => list.value.find((c) => c.status === 'active') ?? null;

  async function create(input: NewCombo): Promise<ComboRow> {
    if (list.value.some((c) => c.status === 'active')) throw new ComboActiveError();
    const { data, error } = await supabase
      .from('combo_challenges')
      .insert({ ...input, status: 'active' })
      .select(COLS)
      .single();
    if (error) throw error;
    list.value.unshift(data);
    return data;
  }

  async function persistLegs(id: string, legs: ComboLeg[], status?: string) {
    const patch: Record<string, unknown> = { legs, updated_at: new Date().toISOString() };
    if (status) patch.status = status;
    const { error } = await supabase.from('combo_challenges').update(patch).eq('id', id);
    if (error) throw error;
    const c = list.value.find((x) => x.id === id);
    if (c) {
      c.legs = legs;
      if (status) c.status = status as ComboRow['status'];
    }
  }

  // Ajoute des reps sur un exo (cumulées sur la date donnée). Passe à « done »
  // dès que tous les exos atteignent leur cible.
  async function addReps(id: string, exerciseId: string, date: string, reps: number) {
    const c = list.value.find((x) => x.id === id);
    if (!c || reps === 0) return;
    const legs: ComboLeg[] = c.legs.map((l) => ({
      ...l,
      progress: l.progress.map((p) => ({ ...p })),
    }));
    const leg = legs.find((l) => l.exercise_id === exerciseId);
    if (!leg) return;
    const entry = leg.progress.find((p) => p.date === date);
    if (entry) entry.reps = Math.max(0, entry.reps + reps);
    else leg.progress.push({ date, reps: Math.max(0, reps) });
    const status = comboComplete({ ...c, legs })
      ? 'done'
      : c.status === 'done'
        ? 'active'
        : undefined;
    await persistLegs(id, legs, status);
  }

  // Met à jour la charge (kg) d'un exo.
  async function setWeight(id: string, exerciseId: string, weightKg: number | null) {
    const c = list.value.find((x) => x.id === id);
    if (!c) return;
    const legs = c.legs.map((l) =>
      l.exercise_id === exerciseId ? { ...l, weight_kg: weightKg } : l,
    );
    await persistLegs(id, legs);
  }

  async function setStatus(id: string, status: 'active' | 'done' | 'abandoned') {
    const { error } = await supabase.from('combo_challenges').update({ status }).eq('id', id);
    if (error) throw error;
    const c = list.value.find((x) => x.id === id);
    if (c) c.status = status;
  }

  async function remove(id: string) {
    const { error } = await supabase.from('combo_challenges').delete().eq('id', id);
    if (error) throw error;
    list.value = list.value.filter((c) => c.id !== id);
  }

  return { list, loaded, fetchMine, activeOne, create, addReps, setWeight, setStatus, remove };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useComboStore, import.meta.hot));
}
