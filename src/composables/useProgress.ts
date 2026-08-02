// useProgress — les 5 niveaux de l'utilisateur, réactifs.
// Muscu / Tennis (spécifique) / Cardio (course-trail, à venir) / Challenges / Global.
// Niveaux numériques purs (computeLevel), sans rang ni palier.
import { computed, onMounted } from 'vue';
import { useLogsStore } from '@/stores/logs';
import { useTennisStore } from '@/stores/tennis';
import { useChallengesStore } from '@/stores/challenges';
import { useSessionsStore } from '@/stores/sessions';
import { sessionXp, drillSessionXp } from '@/lib/athlete';
import { challengeXpPoints } from '@/lib/challenges';
import { computeLevel } from '@/lib/levels';

export function useProgress() {
  const logs = useLogsStore();
  const tennis = useTennisStore();
  const challenges = useChallengesStore();
  const sessions = useSessionsStore();

  onMounted(() => {
    logs.fetchAll().catch(() => undefined);
    tennis.fetchLogs().catch(() => undefined);
    challenges.fetchMine().catch(() => undefined);
    sessions.fetchMine().catch(() => undefined);
  });

  // Ids des séances de prépa physique → leurs bilans comptent dans le Tennis.
  const prepaIds = computed(
    () =>
      new Set(
        sessions.list.filter((s) => s.payload.discipline === 'prepa_physique').map((s) => s.id),
      ),
  );

  const isPrepaLog = (sessionId?: string) => !!sessionId && prepaIds.value.has(sessionId);

  const muscuXp = computed(() =>
    logs.all
      .filter((r) => !isPrepaLog(r.payload.session_id))
      .reduce((a, r) => a + sessionXp(r.payload), 0),
  );
  const prepaXp = computed(() =>
    logs.all
      .filter((r) => isPrepaLog(r.payload.session_id))
      .reduce((a, r) => a + sessionXp(r.payload), 0),
  );
  const tennisXp = computed(
    () => prepaXp.value + tennis.logs.reduce((a, r) => a + drillSessionXp(r.payload), 0),
  );
  const cardioXp = computed(() => 0); // course à pied / trail — à venir
  const challengesXp = computed(() => challengeXpPoints(challenges.list));
  const globalXp = computed(
    () => muscuXp.value + tennisXp.value + cardioXp.value + challengesXp.value,
  );

  return {
    global: computed(() => computeLevel(globalXp.value)),
    muscu: computed(() => computeLevel(muscuXp.value)),
    tennis: computed(() => computeLevel(tennisXp.value)),
    cardio: computed(() => computeLevel(cardioXp.value)),
    challenges: computed(() => computeLevel(challengesXp.value)),
  };
}
