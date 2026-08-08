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

  // Ajoute une SÉRIE (reps + poids) sur un exo, à la date donnée. OPTIMISTE : la
  // liste locale est mise à jour tout de suite (réponse instantanée), la
  // persistance Supabase part en arrière-plan. Mémorise le poids (préremplissage).
  // Passe à « done » dès que tous les exos atteignent leur cible de séries.
  function addSet(
    id: string,
    exerciseId: string,
    date: string,
    reps: number,
    weight: number | null,
    assisted = false,
  ) {
    const c = list.value.find((x) => x.id === id);
    if (!c || reps <= 0) return;
    const leg = c.legs.find((l) => l.exercise_id === exerciseId);
    if (!leg) return;
    if (!leg.sets) leg.sets = []; // migration : ancien format sans `sets`
    leg.sets.push({ date, reps, weight: weight ?? null, assisted });
    if (weight != null) leg.weight_kg = weight; // dernier poids → préremplissage
    if (comboComplete(c)) c.status = 'done';
    else if (c.status === 'done') c.status = 'active';
    void supabase
      .from('combo_challenges')
      .update({ legs: c.legs, status: c.status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('combo addSet persist', error);
      });
  }

  // Retire la dernière série d'un exo (correction). OPTIMISTE.
  function removeLastSet(id: string, exerciseId: string) {
    const c = list.value.find((x) => x.id === id);
    if (!c) return;
    const leg = c.legs.find((l) => l.exercise_id === exerciseId);
    if (!leg?.sets?.length) return;
    leg.sets.pop();
    // Plus aucune série → on efface aussi le poids mémorisé (souvent une saisie
    // erronée qu'on vient de retirer) pour ne pas le repré-remplir.
    if (!leg.sets.length) leg.weight_kg = null;
    if (comboComplete(c)) c.status = 'done';
    else if (c.status === 'done') c.status = 'active';
    void supabase
      .from('combo_challenges')
      .update({ legs: c.legs, status: c.status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('combo removeLastSet persist', error);
      });
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

  return {
    list,
    loaded,
    fetchMine,
    activeOne,
    create,
    addSet,
    removeLastSet,
    setWeight,
    setStatus,
    remove,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useComboStore, import.meta.hot));
}
