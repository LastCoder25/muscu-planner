// Détecte une montée de niveau d'athlète pendant la session (après une séance
// enregistrée) et déclenche l'animation. Base = 1re valeur après chargement des
// bilans (pas d'overlay au boot ni pour des gains hors-ligne).
import { ref, watch, onMounted } from 'vue';
import { useLogsStore } from '@/stores/logs';
import { athleteXpPoints, athleteLevel } from '@/lib/athlete';

export function useAthleteLevelUp() {
  const logs = useLogsStore();
  const show = ref(false);
  const fromLevel = ref(0);
  const toLevel = ref(0);
  const tier = ref('');
  const tierColor = ref('');
  let baseline: number | null = null;

  onMounted(() => {
    logs.fetchAll().catch(() => undefined);
  });

  watch(
    () => (logs.allLoaded ? athleteLevel(athleteXpPoints(logs.all.map((r) => r.payload))) : null),
    (lvl) => {
      if (!lvl) return;
      if (baseline === null) {
        baseline = lvl.level; // référence de session (silencieux)
        return;
      }
      if (lvl.level > baseline) {
        fromLevel.value = baseline;
        toLevel.value = lvl.level;
        tier.value = lvl.tier;
        tierColor.value = lvl.tierColor;
        show.value = true;
      }
      baseline = lvl.level;
    },
    { immediate: true },
  );

  return { show, fromLevel, toLevel, tier, tierColor, close: () => (show.value = false) };
}
