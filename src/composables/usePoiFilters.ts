// 🎚️🗺️ LES FILTRES DE LA CARTE D'EXPÉDITION — par TYPE de lieu, mémorisés par
// appareil. Sorti de `ExpeditionMapPage` (découpage de la page, 2026-09-27) : l'état et sa
// persistance vivent ici, l'écran (`MapFilterBar`) ne fait que les montrer.
// La règle des types (affiché · seul · masqué) vit dans `lib/poiTypeFilter.ts`.
// ⚠️ Le filtre par RANG est retiré (v1.35.1, décision de l'utilisateur) : une île ne porte plus
// que deux rangs de lieux, il ne triait plus rien.
import { computed, ref, type Ref } from 'vue';
import {
  cycleType,
  effectiveTypeFilter,
  filterKeyOf,
  nextTroopMode,
  parseTroopMode,
  parseTypeFilter,
  typeOptions,
  typeShown,
  type FilterKey,
  type TypeFilter,
  type TypeMode,
} from '@/lib/poiTypeFilter';
import type { Poi } from '@/lib/expedition';

// ⚠️ Remplace le filtre des failles seul : son réglage stocké est repris (`parseTypeFilter`).
const TYPE_FILTER_KEY = 'muscu:emap:type-filter';
const LEGACY_RIFT_KEY = 'muscu:emap:rift-mode';
// 🚶 Le mode des déplacements de troupes (affichés · seuls · masqués). Absent = affichés.
const TROOPS_KEY = 'muscu:emap:hide-troops';

function loadTroopMode(): TypeMode {
  try {
    return parseTroopMode(localStorage.getItem(TROOPS_KEY));
  } catch {
    return 'all'; /* stockage indisponible : tout est affiché */
  }
}

function loadTypeFilter(): TypeFilter {
  try {
    const raw = localStorage.getItem(TYPE_FILTER_KEY);
    return parseTypeFilter(
      raw ? (JSON.parse(raw) as unknown) : null,
      localStorage.getItem(LEGACY_RIFT_KEY),
    );
  } catch {
    return { only: [], hidden: [] }; /* stockage indisponible : tout est affiché */
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* le filtre vaut pour la session */
  }
}

export function usePoiFilters(pois: Ref<Poi[]>) {
  const typeFilter = ref<TypeFilter>(loadTypeFilter());
  const typeChips = computed(() => typeOptions(pois.value));
  function cycleTypeChip(t: FilterKey) {
    typeFilter.value = cycleType(
      typeFilter.value,
      t,
      typeChips.value.map((o) => o.type),
    );
    save(TYPE_FILTER_KEY, typeFilter.value);
  }

  // Ce qui s’applique vraiment : les types « seuls » absents de la carte sont ignorés.
  const typeFilterShown = computed(() =>
    effectiveTypeFilter(
      typeFilter.value,
      typeChips.value.map((o) => o.type),
    ),
  );
  const shownPois = computed(() =>
    pois.value.filter((p) => typeShown(typeFilterShown.value, filterKeyOf(p))),
  );

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

  /** « Tout afficher » : types ET déplacements d’un geste. */
  function resetFilters() {
    if (troopMode.value !== 'all') setTroopMode('all');
    typeFilter.value = { only: [], hidden: [] };
    save(TYPE_FILTER_KEY, typeFilter.value);
  }

  return {
    typeFilter,
    typeFilterShown,
    typeChips,
    cycleTypeChip,
    resetFilters,
    shownPois,
    troopMode,
    troopsHidden,
    cycleTroops,
  };
}
