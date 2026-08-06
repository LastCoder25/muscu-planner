// useProgress — les 5 niveaux de l'utilisateur, réactifs.
// Muscu / Tennis (drills + prépa) / Cardio (course/vélo/marche) / Challenges / Global.
// Niveaux numériques purs (computeLevel), sans rang ni palier.
import { computed, onMounted } from 'vue';
import { useLogsStore } from '@/stores/logs';
import { useTennisStore } from '@/stores/tennis';
import { useChallengesStore } from '@/stores/challenges';
import { useSessionsStore } from '@/stores/sessions';
import { useCardioStore } from '@/stores/cardio';
import { useComboStore } from '@/stores/combo';
import { sessionXp, drillSessionXp, cardioSessionXp } from '@/lib/athlete';
import { challengeXpPoints } from '@/lib/challenges';
import { comboXpPoints } from '@/lib/combo';
import { computeLevel } from '@/lib/levels';
import { isCardioTrackChallenge } from '@/data/cardio';

// Part de l'XP de fond convertie en énergie d'aventure (réglable).
// 1 = « ton énergie = ton XP de fond » (généreux : le sport finance une vraie session de jeu).
const ENERGY_PER_XP = 1;

export function useProgress() {
  const logs = useLogsStore();
  const tennis = useTennisStore();
  const challenges = useChallengesStore();
  const sessions = useSessionsStore();
  const cardio = useCardioStore();
  const combo = useComboStore();

  onMounted(() => {
    logs.fetchAll().catch(() => undefined);
    tennis.fetchLogs().catch(() => undefined);
    challenges.fetchMine().catch(() => undefined);
    sessions.fetchMine().catch(() => undefined);
    cardio.fetchLogs().catch(() => undefined);
    combo.fetchMine().catch(() => undefined);
  });

  // Séances « spécifiques » (hors muscu de fond) → comptent dans le Tennis/Spécifique :
  // prépa physique, crossfit, hyrox. Tag porté par la séance OU directement par le log
  // (log rapide crossfit/hyrox sans séance).
  const specifiqueSessionIds = computed(
    () =>
      new Set(
        sessions.list
          .filter((s) => (s.payload.discipline ?? 'musculation') !== 'musculation')
          .map((s) => s.id),
      ),
  );
  const isSpecifiqueLog = (r: (typeof logs.all)[number]) => {
    const d = r.payload.discipline;
    if (d && d !== 'musculation') return true;
    return !!r.payload.session_id && specifiqueSessionIds.value.has(r.payload.session_id);
  };

  const muscuXp = computed(() =>
    logs.all.filter((r) => !isSpecifiqueLog(r)).reduce((a, r) => a + sessionXp(r.payload), 0),
  );
  const specifiqueSessionXp = computed(() =>
    logs.all.filter((r) => isSpecifiqueLog(r)).reduce((a, r) => a + sessionXp(r.payload), 0),
  );
  const tennisXp = computed(
    () =>
      specifiqueSessionXp.value + tennis.logs.reduce((a, r) => a + drillSessionXp(r.payload), 0),
  );

  // Un challenge alimente la DISCIPLINE de son exercice : marche/course/vélo →
  // cardio ; tout le reste (pompes, gainage…) → muscu.
  const isCardioChallenge = (c: (typeof challenges.list)[number]) => isCardioTrackChallenge(c);
  const muscuChallengeXp = computed(() =>
    challengeXpPoints(challenges.list.filter((c) => !isCardioChallenge(c))),
  );
  const cardioChallengeXp = computed(() =>
    challengeXpPoints(challenges.list.filter((c) => isCardioChallenge(c))),
  );

  // Défi 360 (défi combiné) → piste Muscu (XP façon séance : reps + tonnage + prime).
  const comboXp = computed(() => comboXpPoints(combo.list));
  const muscuTotal = computed(() => muscuXp.value + muscuChallengeXp.value + comboXp.value);
  // Les sorties « miroir » d'un défi (challenge_id) apparaissent dans l'historique
  // mais ne comptent PAS d'XP : l'effort est déjà compté via cardioChallengeXp
  // (sinon double compte). Les sorties manuelles, elles, comptent normalement.
  const cardioXp = computed(
    () =>
      cardio.logs
        .filter((r) => !r.payload.challenge_id)
        .reduce((a, r) => a + cardioSessionXp(r.payload), 0) + cardioChallengeXp.value,
  );
  // Piste Challenges = niveau « méta » (tous les défis) — affiché à part, PAS
  // ajouté au Global (l'effort est déjà compté dans muscu / cardio).
  const challengesXp = computed(() => challengeXpPoints(challenges.list));
  // Global = sport de FOND (muscu + cardio) — c'est le niveau du personnage.
  // Le tennis (spécifique) reste à part, jamais compté dans le global.
  const generalXp = computed(() => muscuTotal.value + cardioXp.value);
  const globalXp = generalXp;

  return {
    global: computed(() => computeLevel(globalXp.value)),
    general: computed(() => computeLevel(generalXp.value)),
    specifique: computed(() => computeLevel(tennisXp.value)),
    muscu: computed(() => computeLevel(muscuTotal.value)),
    tennis: computed(() => computeLevel(tennisXp.value)),
    cardio: computed(() => computeLevel(cardioXp.value)),
    challenges: computed(() => computeLevel(challengesXp.value)),
    // Données brutes pour le RPG (fond uniquement).
    muscuXp: computed(() => muscuTotal.value),
    cardioXp: computed(() => cardioXp.value),
    // Énergie RPG = fraction de l'XP de fond gagnée (l'XP encode déjà l'effort :
    // reps des challenges, durée/distance/charge des séances). Tennis exclu.
    energyEarned: computed(() => Math.round(generalXp.value * ENERGY_PER_XP)),
  };
}
