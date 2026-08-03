// useProgress — les 5 niveaux de l'utilisateur, réactifs.
// Muscu / Tennis (drills + prépa) / Cardio (course/vélo/marche) / Challenges / Global.
// Niveaux numériques purs (computeLevel), sans rang ni palier.
import { computed, onMounted } from 'vue';
import { useLogsStore } from '@/stores/logs';
import { useTennisStore } from '@/stores/tennis';
import { useChallengesStore } from '@/stores/challenges';
import { useSessionsStore } from '@/stores/sessions';
import { useCardioStore } from '@/stores/cardio';
import { sessionXp, drillSessionXp, cardioSessionXp } from '@/lib/athlete';
import { challengeXpPoints } from '@/lib/challenges';
import { computeLevel } from '@/lib/levels';

export function useProgress() {
  const logs = useLogsStore();
  const tennis = useTennisStore();
  const challenges = useChallengesStore();
  const sessions = useSessionsStore();
  const cardio = useCardioStore();

  onMounted(() => {
    logs.fetchAll().catch(() => undefined);
    tennis.fetchLogs().catch(() => undefined);
    challenges.fetchMine().catch(() => undefined);
    sessions.fetchMine().catch(() => undefined);
    cardio.fetchLogs().catch(() => undefined);
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

  // Un challenge alimente la DISCIPLINE de son exercice : marche/course/vélo →
  // cardio ; tout le reste (pompes, gainage…) → muscu.
  const CARDIO_CH_IDS = new Set(['ex_ch_marche', 'ex_ch_course', 'ex_ch_velo']);
  const isCardioChallenge = (c: (typeof challenges.list)[number]) =>
    c.unit === 'distance' || CARDIO_CH_IDS.has(c.exercise_id);
  const muscuChallengeXp = computed(() =>
    challengeXpPoints(challenges.list.filter((c) => !isCardioChallenge(c))),
  );
  const cardioChallengeXp = computed(() =>
    challengeXpPoints(challenges.list.filter((c) => isCardioChallenge(c))),
  );

  const muscuTotal = computed(() => muscuXp.value + muscuChallengeXp.value);
  const cardioXp = computed(
    () => cardio.logs.reduce((a, r) => a + cardioSessionXp(r.payload), 0) + cardioChallengeXp.value,
  );
  // Piste Challenges = niveau « méta » (tous les défis) — affiché à part, PAS
  // ajouté au Global (l'effort est déjà compté dans muscu / cardio).
  const challengesXp = computed(() => challengeXpPoints(challenges.list));
  const globalXp = computed(() => muscuTotal.value + tennisXp.value + cardioXp.value);

  return {
    global: computed(() => computeLevel(globalXp.value)),
    muscu: computed(() => computeLevel(muscuTotal.value)),
    tennis: computed(() => computeLevel(tennisXp.value)),
    cardio: computed(() => computeLevel(cardioXp.value)),
    challenges: computed(() => computeLevel(challengesXp.value)),
  };
}
