// Store challenges — défis + succès débloqués. Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import {
  addContribution,
  removeContribution,
  isChallengeComplete,
  evaluateAchievements,
  type Challenge,
  type ChallengeStatus,
  type DayProgress,
  type ChallengeConfig,
  type ChallengeFormat,
} from '@/lib/challenges';
import { challengeIdsForActivity, isCardioTrackChallenge } from '@/data/cardio';
import {
  canAddChallenge,
  isAccessoryMuscle,
  type AddDenyReason,
  type LaneChallenge,
} from '@/lib/challengeLimits';
import type { CardioActivity } from '@/lib/types';

// Voie d'un défi (budget séparé) : cardio vs muscu. La voie CARDIO regroupe les
// vraies sorties (marche/course/vélo, distance) ET les exos de CONDITIONNEMENT
// (jumping jacks, burpees…) — leur XP va déjà à la piste Cardio, donc ils vivent
// dans la voie cardio (budget + affichage), pas en muscu.
export function isCardioChallengeRow(c: { unit: string; exercise_id: string }): boolean {
  return isCardioTrackChallenge(c);
}

export class ChallengeLimitError extends Error {
  constructor(cardio: boolean, reason: AddDenyReason) {
    const lane = cardio ? 'cardio' : 'muscu';
    super(
      reason === 'accessory'
        ? `Tu as déjà un défi accessoire ${lane} en cours (1 max).`
        : `Plus assez de place pour un défi ${lane} : termine-en un ou choisis une durée plus courte.`,
    );
    this.name = 'ChallengeLimitError';
  }
}

const COLS =
  'id, exercise_id, exercise_name, muscle_primary, rep_weight, unit, format, duration_days, start_date, config, daily_targets, progress, status';

export interface NewChallenge {
  exercise_id: string;
  exercise_name: string;
  muscle_primary?: string | null;
  rep_weight?: number | null;
  unit: 'reps' | 'time' | 'distance';
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
    // Limite « jetons par durée » + slot accessoire, par voie (muscu / cardio).
    const cardio = isCardioChallengeRow(input);
    const sameLane: LaneChallenge[] = list.value
      .filter((c) => c.status === 'active' && isCardioChallengeRow(c) === cardio)
      .map((c) => ({
        accessory: isAccessoryMuscle(c.muscle_primary),
        durationDays: c.duration_days,
      }));
    // Accessoire (exo d'appoint) : limité à 1 semaine.
    if (isAccessoryMuscle(input.muscle_primary) && input.duration_days > 7)
      throw new Error("Un défi accessoire est un exo d'appoint : 1 semaine maximum.");
    const res = canAddChallenge(sameLane, {
      accessory: isAccessoryMuscle(input.muscle_primary),
      durationDays: input.duration_days,
    });
    if (!res.ok) throw new ChallengeLimitError(cardio, res.reason);
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

  // Prolongation : met à jour la durée + le plan.
  async function updateDuration(
    id: string,
    duration_days: number,
    daily_targets: number[],
    config: ChallengeConfig,
  ) {
    const { error } = await supabase
      .from('challenges')
      .update({ duration_days, daily_targets, config, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    const c = list.value.find((x) => x.id === id);
    if (c) {
      c.duration_days = duration_days;
      c.daily_targets = daily_targets;
      c.config = config;
    }
  }

  // Reporte une sortie cardio sur les défis cardio actifs correspondants :
  // ajoute la distance (défi en km) ou la durée (défi en sec) au jour de la sortie.
  // Renvoie les noms des défis alimentés. Ne soustrait pas à la suppression d'une
  // sortie (correction manuelle possible dans le détail du défi).
  async function applyCardioLog(input: {
    date: string; // YYYY-MM-DD (date de la sortie)
    activity: CardioActivity;
    distanceKm?: number;
    durationMin?: number;
  }): Promise<string[]> {
    if (!loaded.value) {
      try {
        await fetchMine();
      } catch {
        return [];
      }
    }
    const ids = challengeIdsForActivity(input.activity);
    const fed: string[] = [];
    for (const c of list.value) {
      if (c.status !== 'active' || !ids.includes(c.exercise_id)) continue;
      // Défis cardio en temps = MINUTES (vélo/course/marche) → on ajoute les
      // minutes directement (plus de conversion en secondes).
      const amount =
        c.unit === 'distance'
          ? (input.distanceKm ?? 0)
          : c.unit === 'time'
            ? (input.durationMin ?? 0)
            : 0;
      if (amount <= 0) continue;
      const progress = addContribution(c, input.date, amount);
      if (!progress) continue; // date hors plage du défi
      const next: Challenge = { ...c, progress };
      const status = isChallengeComplete(next) ? 'done' : undefined;
      try {
        await updateProgress(c.id, progress, status);
        fed.push(c.exercise_name);
      } catch {
        /* silencieux : la sortie cardio est déjà enregistrée */
      }
    }
    if (fed.length) {
      try {
        await unlock(evaluateAchievements(list.value));
      } catch {
        /* silencieux */
      }
    }
    return fed;
  }

  // Miroir d'applyCardioLog : quand une sortie cardio est SUPPRIMÉE, on retire sa
  // contribution des défis cardio qu'elle avait alimentés (sinon un faux surplus
  // reste — ex. 53 km tapés par erreur, sortie supprimée mais avance figée). Un
  // défi 'done' par erreur repasse 'active' s'il n'est plus complété. Silencieux.
  async function removeCardioLog(input: {
    date: string;
    activity: CardioActivity;
    distanceKm?: number;
    durationMin?: number;
  }): Promise<void> {
    if (!loaded.value) {
      try {
        await fetchMine();
      } catch {
        return;
      }
    }
    const ids = challengeIdsForActivity(input.activity);
    for (const c of list.value) {
      if (c.status === 'abandoned' || !ids.includes(c.exercise_id)) continue;
      const amount =
        c.unit === 'distance'
          ? (input.distanceKm ?? 0)
          : c.unit === 'time'
            ? (input.durationMin ?? 0)
            : 0;
      if (amount <= 0) continue;
      const progress = removeContribution(c, input.date, amount);
      if (!progress) continue;
      const next: Challenge = { ...c, progress };
      // Recalcule le statut : dé-complète si le total n'est plus atteint (repasse actif).
      const complete = isChallengeComplete(next);
      const status: ChallengeStatus | undefined = complete
        ? 'done'
        : c.status === 'done'
          ? 'active'
          : undefined;
      try {
        await updateProgress(c.id, progress, complete ? 'done' : undefined);
        if (status === 'active') await setStatus(c.id, 'active');
      } catch {
        /* silencieux : la sortie est déjà supprimée */
      }
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
    updateDuration,
    applyCardioLog,
    removeCardioLog,
    setStatus,
    remove,
    fetchAchievements,
    unlock,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useChallengesStore, import.meta.hot));
}
