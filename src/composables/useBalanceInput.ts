// useBalanceInput — l'entrée des calculs de volume par muscle (`lib/bodyBalance`), construite
// à UN seul endroit : le graphe d'équilibre et le radar de la semaine vivent sur la même
// page, et deux copies de « quelles sources, quel jour, quels secondaires » finiraient par
// faire dire deux choses différentes à deux graphes voisins.
import { computed } from 'vue';
import { useLogsStore } from '@/stores/logs';
import { useLibraryStore } from '@/stores/library';
import { useComboStore } from '@/stores/combo';
import { useChallengesStore } from '@/stores/challenges';
import { useProfileStore } from '@/stores/profile';
import { logicalToday } from '@/lib/challenges';
import type { BalanceInput } from '@/lib/bodyBalance';

export function useBalanceInput() {
  const logsStore = useLogsStore();
  const library = useLibraryStore();
  const combo = useComboStore();
  const challenges = useChallengesStore();
  const profileStore = useProfileStore();

  const input = computed<Omit<BalanceInput, 'targets'>>(() => {
    const map = library.secondaries;
    return {
      sessions: logsStore.all.map((r) => ({ performedAt: r.performed_at, log: r.payload })),
      combos: combo.list,
      challenges: challenges.list,
      objective: profileStore.profile?.objective,
      secondaries: (id) => map.get(id),
      today: logicalToday(),
    };
  });

  /** Tous les bilans + la table des muscles secondaires (caches partagés des stores). */
  function ensureLoaded(): Promise<unknown> {
    return Promise.all([library.fetchSecondaries(), logsStore.fetchAll()]);
  }

  return { input, ensureLoaded };
}
