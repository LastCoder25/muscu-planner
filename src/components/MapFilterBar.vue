<!--
  🎚️🗺️ LES FILTRES DE LA CARTE D'EXPÉDITION — une puce par RANG présent, puis une puce par TYPE
  de lieu. L'état et sa mémorisation vivent dans `usePoiFilters` ; ce composant les MONTRE.
-->
<template>
  <div>
    <!-- 🎚️ Filtre de difficulté (par RANG, la langue de la carte). On garde les rangs
         MASQUÉS, pas les affichés : un rang nouveau apparaît visible par défaut. -->
    <div class="bar">
      <div
        v-if="rankOptions.length > 1"
        class="rank-filter"
        role="group"
        aria-label="Filtrer les lieux par rang"
      >
        <button
          v-for="o in rankOptions"
          :key="o.rankIndex"
          type="button"
          class="rf-chip"
          :class="{ on: !hiddenRanks.has(o.rankIndex) }"
          :style="{ '--rk': CHARACTER_RANKS[o.rankIndex]!.color }"
          :aria-pressed="!hiddenRanks.has(o.rankIndex)"
          :aria-label="rankChipLabel(o)"
          :title="rankChipLabel(o)"
          @click="emit('toggle-rank', o.rankIndex)"
        >
          <span class="rf-dot" />
        </button>
      </div>
    </div>

    <!-- 🗺️ Filtre par TYPE de lieu (v0.1174) : une puce par type présent, à TROIS états (un
         toucher passe au suivant) — affiché · SEUL · masqué. Plusieurs types « seuls » se
         cumulent, et il se COMBINE aux rangs : le compte ne parle que des lieux des rangs
         affichés. Règle dans `lib/poiTypeFilter.ts`. -->
    <div
      v-if="typeChips.length > 1"
      class="bar type-filter"
      role="group"
      aria-label="Filtrer les lieux par type"
    >
      <button
        v-for="o in typeChips"
        :key="o.type"
        type="button"
        class="rf-chip type-chip"
        :class="['rm-' + typeMode(typeFilter, o.type), { on: typeShown(typeFilter, o.type) }]"
        :style="o.type === 'rift' ? { '--rk': '#b57bff' } : undefined"
        :aria-pressed="typeShown(typeFilter, o.type)"
        :aria-label="typeChipLabel(o)"
        :title="typeChipLabel(o)"
        @click="emit('cycle-type', o.type)"
      >
        <span v-if="o.type === 'rift'" class="rift-emo"
          ><RiftPortal color="#b57bff" :seed="7" still
        /></span>
        <span v-else class="type-emo">{{ POI_EMO[o.type] }}</span>
        <span class="rift-count">{{
          typeMode(typeFilter, o.type) === 'only' ? 'seul' : o.inRanks
        }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import RiftPortal from '@/components/RiftPortal.vue';
import { CHARACTER_RANKS } from '@/lib/characterRank';
import { POI_EMO, POI_LABEL, type PoiType } from '@/lib/expedition';
import { typeMode, typeShown, type TypeFilter } from '@/lib/poiTypeFilter';

const props = defineProps<{
  rankOptions: { rankIndex: number; count: number }[];
  hiddenRanks: Set<number>;
  typeChips: { type: PoiType; inRanks: number }[];
  typeFilter: TypeFilter;
}>();
const emit = defineEmits<{ 'toggle-rank': [r: number]; 'cycle-type': [t: PoiType] }>();

// La puce n'affiche qu'une boule : son nom et son compte passent par l'étiquette.
const rankChipLabel = (o: { rankIndex: number; count: number }) =>
  `${CHARACTER_RANKS[o.rankIndex]?.name ?? ''} · ${o.count} lieu${o.count > 1 ? 'x' : ''}`;
const TYPE_MODE_LABEL = { all: 'affichés', only: 'seuls', none: 'masqués' } as const;
const typeChipLabel = (o: { type: PoiType; inRanks: number }) =>
  `${POI_LABEL[o.type]} : ${TYPE_MODE_LABEL[typeMode(props.typeFilter, o.type)]} · ${o.inRanks} dans les rangs affichés — toucher pour changer`;
</script>

<style scoped lang="scss">
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px 8px;
}
.rank-filter {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 5px;
  overflow-x: auto;
  scrollbar-width: none;
}
.rank-filter::-webkit-scrollbar {
  display: none;
}
/* Rangée CENTRÉE par des marges automatiques et non `justify-content: center` : si les
   puces débordent (écran étroit, beaucoup de rangs), un centrage flex couperait la première
   hors de portée du défilement ; les marges auto, elles, retombent à zéro. */
.rf-chip:first-child {
  margin-left: auto;
}
.rf-chip:last-child {
  margin-right: auto;
}
/* Une pastille ronde (36 px) avec la boule du rang au centre. Affiché = pastille cerclée de
   la couleur du rang, boule PLEINE ; masqué = pastille en pointillé, boule réduite à un
   anneau estompé : l'état se lit sans dépendre de la couleur. */
.rf-chip {
  flex: none;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  border: 1px dashed var(--line);
  background: var(--surface);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.rf-chip.on {
  border-style: solid;
  border-color: var(--rk);
  background: color-mix(in srgb, var(--rk) 14%, var(--surface));
}
.rf-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--rk);
  background: transparent;
  opacity: 0.45;
  transition:
    background 0.15s,
    opacity 0.15s;
}
.rf-chip.on .rf-dot {
  background: var(--rk);
  opacity: 1;
}
/* 🗺️ La rangée des types : défile si elle déborde (344 px), centrée sinon. */
.type-filter {
  overflow-x: auto;
  scrollbar-width: none;
}
.type-filter::-webkit-scrollbar {
  display: none;
}
.type-emo {
  font-size: 15px;
  line-height: 1;
  opacity: 0.45;
}
.type-chip {
  --rk: var(--accent);
  width: auto;
  min-width: 36px;
  padding: 0 8px;
  gap: 3px;
  border-radius: 18px;
}
.rift-emo {
  display: inline-block;
  width: 12px;
  height: 19px;
  opacity: 0.45;
}
.type-chip.on .rift-emo,
.type-chip.on .type-emo {
  opacity: 1;
}
.rift-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--dim);
}
.type-chip.on .rift-count {
  color: var(--text);
}
/* Type SEUL : pastille pleine, le mode le plus fort se voit d'un coup d'œil. */
.type-chip.rm-only {
  background: color-mix(in srgb, var(--rk) 34%, var(--surface));
  box-shadow: 0 0 6px color-mix(in srgb, var(--rk) 55%, transparent);
}
.rf-chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
