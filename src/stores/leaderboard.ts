// Store leaderboard — classement global « sur l'honneur » (stats reportées par
// chaque client). Lecture pour tous, écriture de sa propre ligne. Accès Supabase
// centralisé (cf. migr. 0039).
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';

export interface LeaderRow {
  user_id: string;
  pseudo: string;
  global_level: number;
  global_xp: number;
  muscu_level: number;
  cardio_level: number;
  challenges_level: number;
  updated_at: string;
}

const COLS =
  'user_id, pseudo, global_level, global_xp, muscu_level, cardio_level, challenges_level, updated_at';

export const useLeaderboardStore = defineStore('leaderboard', () => {
  const rows = ref<LeaderRow[]>([]);
  const loading = ref(false);

  /** Top joueurs par XP global (le meilleur en premier). */
  async function fetchTop(limit = 100) {
    loading.value = true;
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select(COLS)
        .order('global_xp', { ascending: false })
        .limit(limit);
      if (error) throw error;
      rows.value = data ?? [];
      return rows.value;
    } finally {
      loading.value = false;
    }
  }

  /** Publie/actualise SA propre ligne (upsert sur user_id). */
  async function upsertMine(
    userId: string,
    stats: {
      pseudo: string;
      global_level: number;
      global_xp: number;
      muscu_level: number;
      cardio_level: number;
      challenges_level: number;
    },
  ) {
    const { error } = await supabase
      .from('leaderboard')
      .upsert({ user_id: userId, ...stats, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  return { rows, loading, fetchTop, upsertMine };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLeaderboardStore, import.meta.hot));
}
