// Store challenges — défis + succès débloqués. Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import type {
  Challenge,
  ChallengeStatus,
  DayProgress,
  ChallengeConfig,
  ChallengeFormat,
} from '@/lib/challenges';

const COLS =
  'id, exercise_id, exercise_name, unit, format, duration_days, start_date, config, daily_targets, progress, status';

export interface NewChallenge {
  exercise_id: string;
  exercise_name: string;
  unit: 'reps' | 'time';
  format: ChallengeFormat;
  duration_days: number;
  start_date: string;
  config: ChallengeConfig;
  daily_targets: number[];
}

export const useChallengesStore = defineStore('challenges', () => {
  const list = ref<Challenge[]>([]);
  const unlocked = ref<string[]>([]);
  const loaded = ref(false); // vrai après le 1er fetchMine (base pour la montée de rang)

  async function fetchMine() {
    const { data, error } = await supabase
      .from('challenges')
      .select(COLS)
      .order('created_at', { ascending: false });
    if (error) throw error;
    list.value = data ?? [];
    loaded.value = true;
    return list.value;
  }

  async function create(input: NewChallenge): Promise<Challenge> {
    const { data, error } = await supabase
      .from('challenges')
      .insert({ ...input, progress: [], status: 'active' })
      .select(COLS)
      .single();
    if (error) throw error;
    list.value.unshift(data);
    return data;
  }

  async function updateProgress(id: string, progress: DayProgress[], status?: ChallengeStatus) {
    const patch: Record<string, unknown> = { progress, updated_at: new Date().toISOString() };
    if (status) patch.status = status;
    const { error } = await supabase.from('challenges').update(patch).eq('id', id);
    if (error) throw error;
    const c = list.value.find((x) => x.id === id);
    if (c) {
      c.progress = progress;
      if (status) c.status = status;
    }
  }

  // Recalibrage : met à jour le plan (objectifs des jours restants + config).
  async function updatePlan(id: string, daily_targets: number[], config: ChallengeConfig) {
    const { error } = await supabase
      .from('challenges')
      .update({ daily_targets, config, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    const c = list.value.find((x) => x.id === id);
    if (c) {
      c.daily_targets = daily_targets;
      c.config = config;
    }
  }

  async function setStatus(id: string, status: ChallengeStatus) {
    const { error } = await supabase.from('challenges').update({ status }).eq('id', id);
    if (error) throw error;
    const c = list.value.find((x) => x.id === id);
    if (c) c.status = status;
  }

  async function remove(id: string) {
    const { error } = await supabase.from('challenges').delete().eq('id', id);
    if (error) throw error;
    list.value = list.value.filter((c) => c.id !== id);
  }

  async function fetchAchievements() {
    const { data, error } = await supabase.from('achievements').select('code');
    if (error) throw error;
    unlocked.value = (data ?? []).map((r: { code: string }) => r.code);
    return unlocked.value;
  }

  // Débloque les codes non encore obtenus ; renvoie les nouveaux.
  async function unlock(codes: string[]): Promise<string[]> {
    const fresh = codes.filter((c) => !unlocked.value.includes(c));
    if (fresh.length === 0) return [];
    const { error } = await supabase.from('achievements').upsert(
      fresh.map((code) => ({ code })),
      { onConflict: 'user_id,code', ignoreDuplicates: true },
    );
    if (error) throw error;
    unlocked.value.push(...fresh);
    return fresh;
  }

  return {
    list,
    unlocked,
    loaded,
    fetchMine,
    create,
    updateProgress,
    updatePlan,
    setStatus,
    remove,
    fetchAchievements,
    unlock,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useChallengesStore, import.meta.hot));
}
