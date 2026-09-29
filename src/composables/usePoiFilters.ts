// 🎚️🗺️ LES FILTRES DE LA CARTE D'EXPÉDITION — par RANG et par TYPE de lieu, mémorisés par
// appareil. Sorti de `ExpeditionMapPage` (découpage de la page, 2026-09-27) : l'état et sa
// persistance vivent ici, l'écran (`MapFilterBar`) ne fait que les montrer.
//
// ⚠️ On mémorise les rangs MASQUÉS, pas les affichés : un rang nouveau apparaît visible par
// défaut. La règle des types (affiché · seul · masqué) vit dans `lib/poiTypeFilter.ts`.
import { computed, ref, type Ref } from 'vue';
import { poiRankCounts } from '@/lib/poiRank';
import { isHeldControl } from '@/lib/controlPoints';
import {
  cycleType,
  effectiveTypeFilter,
  parseTypeFilter,
  typeOptions,
  typeShown,
  type TypeFilter,
} from '@/lib/poiTypeFilter';
import type { Poi, PoiType } from '@/lib/expedition';

const RANK_FILTER_KEY = 'muscu:emap:hidden-ranks';
// ⚠️ Remplace le filtre des failles seul : son réglage stocké est repris (`parseTypeFilter`).
const TYPE_FILTER_KEY = 'muscu:emap:type-filter';
const LEGACY_RIFT_KEY = 'muscu:emap:rift-mode';

function loadHiddenRanks(): Set<number> {
  try {
    const raw = JSON.parse(localStorage.getItem(RANK_FILTER_KEY) ?? '[]') as unknown;
    if (Array.isArray(raw)) return new Set(raw.filter((r): r is number => Number.isInteger(r)));
  } catch {
    /* stockage indisponible : tout est affiché */
  }
  return new Set();
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

/** `rankIndexOf` : le rang d'un lieu — celui que la page a déjà mis en cache. */
export function usePoiFilters(pois: Ref<Poi[]>, rankIndexOf: (p: Poi) => number) {
  const hiddenRanks = ref<Set<number>>(loadHiddenRanks());
  // 🏰 Un lieu fixe TENU n'a plus de rang (couleur neutre, rang masqué) : il ne compte dans
  // aucune pastille de rang, et aucun filtre de rang ne le cache (le filtre de type, oui).
  const rankOptions = computed(() => poiRankCounts(pois.value.filter((p) => !isHeldControl(p))));
  function toggleRank(r: number) {
    const next = new Set(hiddenRanks.value);
    if (next.has(r)) next.delete(r);
    else {
      // Jamais de carte vide : on ne masque pas le dernier rang encore affiché.
      const visible = rankOptions.value.filter((o) => !next.has(o.rankIndex)).length;
      if (visible <= 1) return;
      next.add(r);
    }
    hiddenRanks.value = next;
    save(RANK_FILTER_KEY, [...next]);
  }

  const typeFilter = ref<TypeFilter>(loadTypeFilter());
  const rankShown = (p: Poi) => isHeldControl(p) || !hiddenRanks.value.has(rankIndexOf(p));
  // Le compte d'une puce de type ne parle que des lieux des rangs affichés.
  const typeChips = computed(() => typeOptions(pois.value, (p) => rankShown(p as Poi)));
  function cycleTypeChip(t: PoiType) {
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
    pois.value.filter((p) => rankShown(p) && typeShown(typeFilterShown.value, p.type)),
  );

  /** « Tout afficher » : rangs ET types d’un geste. */
  function resetFilters() {
    hiddenRanks.value = new Set();
    typeFilter.value = { only: [], hidden: [] };
    save(RANK_FILTER_KEY, []);
    save(TYPE_FILTER_KEY, typeFilter.value);
  }

  return {
    hiddenRanks,
    rankOptions,
    toggleRank,
    typeFilter,
    typeFilterShown,
    typeChips,
    cycleTypeChip,
    resetFilters,
    shownPois,
  };
}
