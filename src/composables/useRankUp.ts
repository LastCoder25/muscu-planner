// Détecte une montée de rang (F→SSS) pendant la session et déclenche l'animation.
// Base = 1re valeur calculée après le chargement du store (pas d'overlay au boot
// ni pour les gains hors-ligne) ; seule une hausse EN SESSION déclenche l'overlay.
import { ref, watch } from 'vue';
import { useChallengesStore } from '@/stores/challenges';
import { challengeXp } from '@/lib/challenges';
import { rankIndex } from '@/data/ranks';

export function useRankUp() {
  const store = useChallengesStore();
  const show = ref(false);
  const fromRank = ref('');
  const toRank = ref('');
  let baseline: string | null = null;

  watch(
    () => (store.loaded ? challengeXp(store.list).title : null),
    (now) => {
      if (!now) return;
      if (baseline === null) {
        baseline = now; // 1re valeur chargée = référence de session (silencieux)
        return;
      }
      if (rankIndex(now) > rankIndex(baseline)) {
        fromRank.value = baseline;
        toRank.value = now;
        show.value = true;
      }
      baseline = now;
    },
    { immediate: true },
  );

  return { show, fromRank, toRank, close: () => (show.value = false) };
}
