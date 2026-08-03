// Store cardio — sorties (cardio_logs), log global. Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import type { CardioActivity, CardioLog } from '@/lib/types';
import { SCHEMA_VERSION } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { challengeIdsForActivity } from '@/data/cardio';

export interface CardioLogRow {
  id: string;
  activity: string;
  performed_at: string;
  payload: CardioLog;
}

export const useCardioStore = defineStore('cardio', () => {
  const logs = ref<CardioLogRow[]>([]);

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
      activity: payload.activity,
      distance_km: payload.distance_km ?? null,
      duration_min: payload.duration_min ?? null,
      elevation_m: payload.elevation_m ?? null,
      descent_m: payload.descent_m ?? null,
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

  // Sortie « miroir » d'un jour de défi cardio → apparaît dans l'historique Cardio.
  // Déduplication (évite les doublons) :
  //  - au plus UNE sortie par (challenge_id, day) : si elle existe, on la met à jour ;
  //  - si une sortie MANUELLE du même jour couvre déjà ce défi, on ne crée rien.
  // Renvoie 'inserted' | 'updated' | 'skipped'.
  async function upsertFromChallenge(
    userId: string,
    opts: {
      challengeId: string;
      day: number;
      dateIso: string; // YYYY-MM-DD du jour de défi
      exerciseId: string;
      activity: CardioActivity;
      distanceKm?: number;
      durationMin?: number;
    },
  ): Promise<'inserted' | 'updated' | 'skipped'> {
    if (!logs.value.length) {
      try {
        await fetchLogs();
      } catch {
        /* on continue : au pire on (ré)insère */
      }
    }
    const existing = logs.value.find(
      (l) => l.payload.challenge_id === opts.challengeId && l.payload.challenge_day === opts.day,
    );
    if (existing) {
      const payload: CardioLog = {
        ...existing.payload,
        activity: opts.activity,
        ...(opts.distanceKm ? { distance_km: opts.distanceKm } : { distance_km: undefined }),
        ...(opts.durationMin ? { duration_min: opts.durationMin } : { duration_min: undefined }),
      };
      const { error } = await supabase
        .from('cardio_logs')
        .update({
          distance_km: opts.distanceKm ?? null,
          duration_min: opts.durationMin ?? null,
          payload,
        })
        .eq('id', existing.id);
      if (error) throw error;
      existing.payload = payload;
      return 'updated';
    }
    // Une sortie manuelle (non liée à un défi) du même jour couvre-t-elle ce défi ?
    const covered = logs.value.some(
      (l) =>
        !l.payload.challenge_id &&
        l.performed_at.slice(0, 10) === opts.dateIso &&
        challengeIdsForActivity(l.payload.activity).includes(opts.exerciseId),
    );
    if (covered) return 'skipped';

    const id = crypto.randomUUID();
    const performed_at = new Date(`${opts.dateIso}T12:00:00`).toISOString();
    const payload: CardioLog = {
      schema_version: SCHEMA_VERSION,
      type: 'cardio_log',
      id,
      activity: opts.activity,
      performed_at,
      challenge_id: opts.challengeId,
      challenge_day: opts.day,
      ...(opts.distanceKm ? { distance_km: opts.distanceKm } : {}),
      ...(opts.durationMin ? { duration_min: opts.durationMin } : {}),
    };
    const row = {
      id,
      user_id: userId,
      activity: opts.activity,
      distance_km: opts.distanceKm ?? null,
      duration_min: opts.durationMin ?? null,
      elevation_m: null,
      descent_m: null,
      rpe: null,
      comment: null,
      payload,
      performed_at,
    };
    const { error } = await supabase.from('cardio_logs').insert(row);
    if (error) throw error;
    logs.value.unshift({ id, activity: opts.activity, performed_at, payload });
    return 'inserted';
  }

  return { logs, fetchLogs, addLog, remove, upsertFromChallenge };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCardioStore, import.meta.hot));
}
