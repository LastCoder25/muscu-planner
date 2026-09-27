// 🗓️ Les quêtes de la semaine, vues depuis l'accueil. La règle vit en lib (`weeklyQuests`) :
// ce composable ne fait que RÉUNIR les sources (celles que `useProgress` charge déjà, aucune
// requête de plus) et appeler la récupération du store.
import { computed, ref } from 'vue';
import { useLogsStore } from '@/stores/logs';
import { useCardioStore } from '@/stores/cardio';
import { useTennisStore } from '@/stores/tennis';
import { useChallengesStore } from '@/stores/challenges';
import { useComboStore } from '@/stores/combo';
import { useFriendBossStore } from '@/stores/friendBoss';
import { useCharacterStore } from '@/stores/character';
import { useAuthStore } from '@/stores/auth';
import { weeklyQuests } from '@/lib/weeklyQuests';
import { logicalToday } from '@/lib/challenges';

export function useWeeklyQuests() {
  const logs = useLogsStore();
  const cardio = useCardioStore();
  const tennis = useTennisStore();
  const challenges = useChallengesStore();
  const combo = useComboStore();
  const friendBoss = useFriendBossStore();
  const char = useCharacterStore();
  const auth = useAuthStore();
  const claiming = ref(false);

  const board = computed(() =>
    weeklyQuests(
      {
        sessions: logs.all,
        cardio: cardio.logs,
        tennis: tennis.logs,
        challenges: challenges.list,
        combos: combo.list,
        bossHits: friendBoss.myHits,
      },
      logicalToday(),
      auth.user?.id ?? '',
      char.row?.quest_week ?? null,
    ),
  );

  /** ⚠️ Sans personnage chargé, on ne sait pas si la semaine est déjà récupérée : le bouton
   *  attend (il ne promet pas des tickets qu'il ne pourrait pas verser). */
  const canClaim = computed(() => !!char.row && board.value.claimable > 0 && !claiming.value);

  async function claim() {
    const uid = auth.user?.id;
    if (!uid || !canClaim.value) return 0;
    claiming.value = true;
    try {
      return await char.claimWeeklyQuests(uid, board.value.monday, board.value.claimable);
    } finally {
      claiming.value = false;
    }
  }

  return { board, canClaim, claiming, claim };
}
