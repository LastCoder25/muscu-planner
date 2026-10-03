// 🎚️🗺️ LES FILTRES DE LA CARTE D'EXPÉDITION — mémorisés par appareil. Sorti de
// `ExpeditionMapPage` (découpage de la page, 2026-09-27) : l'état et sa persistance vivent ici,
// l'écran (`MapFilterBar`) ne fait que les montrer.
// ⚠️ Le filtre par RANG est retiré (v1.35.1) et celui par TYPE de lieu aussi (v1.40.0, demandé) :
// il ne reste que les déplacements de troupes.
import { computed, ref } from 'vue';
import { nextTroopMode, parseTroopMode, type TypeMode } from '@/lib/poiTypeFilter';

// 🚶 Le mode des déplacements de troupes (affichés · seuls · masqués). Absent = affichés.
const TROOPS_KEY = 'muscu:emap:hide-troops';

function loadTroopMode(): TypeMode {
  try {
    return parseTroopMode(localStorage.getItem(TROOPS_KEY));
  } catch {
    return 'all'; /* stockage indisponible : tout est affiché */
  }
}

export function usePoiFilters() {
  /** 🚶 Les tracés et marqueurs des voyages en cours (héros, équipes, renforts, retours,
   *  attaques, colonnes d'interception). La liste des voyages sous la carte reste. */
  const troopMode = ref<TypeMode>(loadTroopMode());
  const troopsHidden = computed(() => troopMode.value === 'none');
  function setTroopMode(m: TypeMode) {
    troopMode.value = m;
    try {
      localStorage.setItem(TROOPS_KEY, m);
    } catch {
      /* le filtre vaut pour la session */
    }
  }
  const cycleTroops = () => setTroopMode(nextTroopMode(troopMode.value));
  /** « Tout afficher ». */
  const resetFilters = () => setTroopMode('all');

  return { resetFilters, troopMode, troopsHidden, cycleTroops };
}
