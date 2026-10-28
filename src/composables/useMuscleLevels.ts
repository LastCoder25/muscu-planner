// useMuscleLevels — niveaux par groupe musculaire (AFFICHAGE SEUL), recalculés depuis
// l'historique complet des bilans. Même entrée que le graphe d'équilibre (`useBalanceInput`) :
// mêmes bilans, même bibliothèque ; la règle vit dans `lib/muscleLevels`.
import { computed } from 'vue';
import { useBalanceInput } from '@/composables/useBalanceInput';
import { muscleLevels } from '@/lib/muscleLevels';

export function useMuscleLevels() {
  const { input } = useBalanceInput();
  const levels = computed(() => muscleLevels(input.value));
  return { levels };
}
