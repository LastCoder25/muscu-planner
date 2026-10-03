<!--
  🎚️🗺️ LES FILTRES DE LA CARTE D'EXPÉDITION — une tuile REPLIABLE (v0.1240 ; demandé :
  « pouvoir replier les filtres et optimiser leur affichage dans la tuile »). L'état et sa
  mémorisation vivent dans `usePoiFilters` ; ce composant les MONTRE.

  Repliée : une ligne de 40 px — un RÉSUMÉ de ce qui est filtré (`filterSummary`), bordée
  d'accent quand un filtre retire des lieux : la carte ne doit jamais avoir l'air vide sans
  raison. Dépliée : chaque type de lieu est une tuile qui ÉCRIT son état.
  ⚠️ Plus de filtre par RANG (v1.35.0) : une île ne porte que deux rangs de lieux.
  ⚠️ Repliée à CHAQUE ouverture, jamais mémorisée : la carte et les voyages passent avant, et un
  pli mémorisé se lit comme « ça se rouvre tout seul » (leçon de la carte des mondes, v0.994).
-->
<template>
  <div v-if="hasAny" class="filters" :class="{ open, active: summary.active }">
    <button
      type="button"
      class="flt-head"
      :aria-expanded="open"
      aria-controls="map-filters"
      @click="open = !open"
    >
      <span class="flt-ico" aria-hidden="true">🎚️</span>
      <span class="flt-title">Filtres</span>
      <span class="flt-sum">{{ summary.text }}</span>
      <span class="flt-chev" :class="{ up: open }" aria-hidden="true">▾</span>
    </button>

    <div v-if="open" id="map-filters" class="flt-body">
      <!-- 🗺️ Par TYPE de lieu : une tuile par type présent, à TROIS états (un toucher passe au
           suivant) — affiché · SEUL · masqué. Plusieurs types « seuls » se cumulent.
           Règle dans `lib/poiTypeFilter.ts`. -->
      <section v-if="typeChips.length > 1" class="flt-sec">
        <div class="flt-lab">
          Types de lieu
          <span class="flt-hint">toucher : affiché → seul → masqué</span>
        </div>
        <div class="type-filter" role="group" aria-label="Filtrer les lieux par type">
          <button
            v-for="o in typeChips"
            :key="o.type"
            type="button"
            class="type-chip"
            :class="['rm-' + typeMode(typeFilter, o.type), { on: typeShown(typeFilter, o.type) }]"
            :style="o.type === 'rift' ? { '--rk': '#b57bff' } : undefined"
            :aria-pressed="typeShown(typeFilter, o.type)"
            :aria-label="typeChipLabel(o)"
            @click="emit('cycle-type', o.type)"
          >
            <span v-if="o.type === 'rift'" class="rift-emo"
              ><RiftPortal color="#b57bff" :seed="7" still
            /></span>
            <span v-else class="type-emo">{{ FILTER_EMO[o.type] }}</span>
            <span class="tc-name">{{ FILTER_LABEL[o.type] }}</span>
            <span class="tc-state">{{ stateText(o) }}</span>
          </button>
        </div>
      </section>

      <!-- 🚶 LES DÉPLACEMENTS DE TES TROUPES (demandé) : affichés ou masqués, un toucher. Les
           voyages restent listés sous la carte ; seuls leurs tracés et marqueurs disparaissent. -->
      <section v-if="troops > 0" class="flt-sec">
        <div class="flt-lab">Sur la carte</div>
        <div class="type-filter">
          <button
            type="button"
            class="type-chip"
            :class="['rm-' + troopMode, { on: troopMode !== 'none' }]"
            :aria-pressed="troopMode !== 'none'"
            :aria-label="`Déplacements de troupes : ${TYPE_MODE_LABEL[troopMode]} · ${troops} en cours — toucher pour changer`"
            @click="emit('cycle-troops')"
          >
            <span class="type-emo">🚶</span>
            <span class="tc-name">Déplacements de troupes</span>
            <span class="tc-state">{{
              troopMode === 'only' ? 'seul' : troopMode === 'none' ? '✕' : troops
            }}</span>
          </button>
        </div>
      </section>

      <button v-if="summary.active" type="button" class="flt-reset" @click="emit('reset')">
        Tout afficher
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import RiftPortal from '@/components/RiftPortal.vue';
import {
  FILTER_EMO,
  FILTER_LABEL,
  filterSummary,
  typeMode,
  typeShown,
  type FilterKey,
  type TypeFilter,
  type TypeMode,
} from '@/lib/poiTypeFilter';

const props = defineProps<{
  typeChips: { type: FilterKey; total: number }[];
  typeFilter: TypeFilter;
  /** 🚶 Combien de voyages sont en cours, et s'ils sont masqués sur la carte. */
  troops?: number;
  troopMode?: TypeMode;
  /** Dépliée d’emblée — la porte de montage s’en sert pour rendre aussi le corps. */
  defaultOpen?: boolean;
}>();
const emit = defineEmits<{
  'cycle-type': [t: FilterKey];
  'cycle-troops': [];
  reset: [];
}>();

const open = ref(props.defaultOpen ?? false);
const troops = computed(() => props.troops ?? 0);
const troopMode = computed<TypeMode>(() => props.troopMode ?? 'all');
const hasAny = computed(
  () => props.typeChips.length > 1 || troops.value > 0,
);
const summary = computed(() =>
  filterSummary(
    props.typeFilter,
    props.typeChips.map((o) => o.type),
    // Masqués alors qu'il n'y a rien en route : ça ne retire rien, on ne l'annonce pas.
    troops.value > 0 ? troopMode.value : 'all',
  ),
);

/** Ce qu'une tuile de type dit d'elle-même : son compte quand elle est affichée, son état
 *  sinon — « seul » et « masqué » doivent se LIRE, pas se deviner à une teinte. */
function stateText(o: { type: FilterKey; total: number }) {
  const m = typeMode(props.typeFilter, o.type);
  if (m === 'only') return 'seul';
  // Masqué : un ✕ — le nom est déjà barré et la tuile en pointillé. Écrit en entier, « masqué »
  // mangeait le nom à 344 px (« Sanctuai… »).
  if (m === 'none') return '✕';
  return String(o.total);
}
const TYPE_MODE_LABEL = { all: 'affichés', only: 'seuls', none: 'masqués' } as const;
const typeChipLabel = (o: { type: FilterKey; total: number }) =>
  `${FILTER_LABEL[o.type]} : ${TYPE_MODE_LABEL[typeMode(props.typeFilter, o.type)]} · ${o.total} sur la carte — toucher pour changer`;
</script>

<style scoped lang="scss">
/* Repliée : 40 px, la hauteur de l'ancienne barre — la hauteur de la carte ne bouge pas. */
.filters {
  margin: 0 12px 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  overflow: hidden;
}
.filters.active {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
}
.flt-head {
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: none;
  border: none;
  color: var(--text);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.flt-head:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.flt-ico {
  font-size: 14px;
}
.flt-title {
  font-weight: 700;
  font-size: 13px;
}
.flt-sum {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--dim);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.filters.active .flt-sum {
  color: var(--accent);
  font-weight: 600;
}
.flt-chev {
  color: var(--dim);
  font-size: 12px;
  transition: transform 0.15s;
}
.flt-chev.up {
  transform: rotate(180deg);
}
.flt-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--line);
}
.flt-sec {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.flt-lab {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dim);
}
.flt-hint {
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  opacity: 0.8;
}
/* Types : des tuiles en grille — deux colonnes sur téléphone, plus au-delà. */
.type-filter {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 6px;
}
.type-chip {
  --rk: var(--accent);
  min-height: 44px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 10px;
  border: 1px dashed var(--line);
  background: var(--surface);
  color: var(--dim);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.type-chip.on {
  border-style: solid;
  border-color: color-mix(in srgb, var(--rk) 45%, var(--line));
  color: var(--text);
}
/* Type SEUL : tuile pleine, le mode le plus fort se voit d'un coup d'œil. */
.type-chip.rm-only {
  border-color: var(--rk);
  background: color-mix(in srgb, var(--rk) 26%, var(--surface));
  box-shadow: 0 0 6px color-mix(in srgb, var(--rk) 45%, transparent);
}
.type-emo {
  flex: none;
  font-size: 15px;
  line-height: 1;
}
.rift-emo {
  flex: none;
  display: inline-block;
  width: 12px;
  height: 19px;
}
.type-chip.rm-none .type-emo,
.type-chip.rm-none .rift-emo {
  opacity: 0.4;
  filter: grayscale(1);
}
.tc-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.type-chip.rm-none .tc-name {
  text-decoration: line-through;
}
.tc-state {
  flex: none;
  font-size: 11px;
  font-weight: 700;
}
.type-chip.rm-only .tc-state {
  color: var(--rk);
  text-transform: uppercase;
}
.type-chip:focus-visible,
.flt-reset:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.flt-reset {
  align-self: flex-end;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line));
  background: none;
  color: var(--accent);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
</style>
