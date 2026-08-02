// Store cardio — sorties course/trail (cardio_logs). Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import type { CardioLog, CardioPlan } from '@/lib/types';
import { supabase } from '@/lib/supabase';

export interface CardioLogRow {
  id: string;
  activity: string;
  performed_at: string;
  payload: CardioLog;
}

export interface CardioPlanRow {
  id: string;
  name: string;
  race_date: string | null;
  payload: CardioPlan;
  created_at: string;
}

export const useCardioStore = defineStore('cardio', () => {
  const logs = ref<CardioLogRow[]>([]);
  const plans = ref<CardioPlanRow[]>([]);

  async function fetchLogs(limit = 100) {
    const { data, error } = await supabase
      .from('cardio_logs')
      .select('id, activity, performed_at, payload')
      .order('performed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    logs.value = data ?? [];
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
      activity: payload.activity,
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
    logs.value.unshift({ id, activity: payload.activity, performed_at, payload });
    return id;
  }

  async function remove(id: string) {
    const { error } = await supabase.from('cardio_logs').delete().eq('id', id);
    if (error) throw error;
    logs.value = logs.value.filter((l) => l.id !== id);
  }

  // ————— Plans d'entraînement —————
  async function fetchPlans() {
    const { data, error } = await supabase
      .from('cardio_plans')
      .select('id, name, race_date, payload, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    plans.value = data ?? [];
    return plans.value;
  }

  async function createPlan(userId: string, plan: CardioPlan) {
    const id = plan.id || crypto.randomUUID();
    const payload: CardioPlan = {
      ...plan,
      id,
      created_at: plan.created_at ?? new Date().toISOString(),
    };
    const row = {
      id,
      user_id: userId,
      name: payload.name,
      race_type: payload.goal.race_type,
      race_date: payload.goal.race_date,
      payload,
    };
    const { error } = await supabase.from('cardio_plans').insert(row);
    if (error) throw error;
    plans.value.unshift({
      id,
      name: payload.name,
      race_date: payload.goal.race_date,
      payload,
      created_at: payload.created_at!,
    });
    return id;
  }

  // Met à jour le plan (ex. séance cochée « faite »).
  async function updatePlan(plan: CardioPlan) {
    const { error } = await supabase
      .from('cardio_plans')
      .update({ payload: plan })
      .eq('id', plan.id);
    if (error) throw error;
    const row = plans.value.find((p) => p.id === plan.id);
    if (row) row.payload = plan;
  }

  async function removePlan(id: string) {
    const { error } = await supabase.from('cardio_plans').delete().eq('id', id);
    if (error) throw error;
    plans.value = plans.value.filter((p) => p.id !== id);
  }

  return { logs, plans, fetchLogs, addLog, remove, fetchPlans, createPlan, updatePlan, removePlan };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCardioStore, import.meta.hot));
}
