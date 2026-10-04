<!--
  🗺️ LA CARTE D'UNE ÎLE RANGÉE (demandé par l'utilisateur, 2026-10-04 : « je veux juste cliquer
  sur l'île 1 et voir la carte pour gérer les garnisons des miliciens »). Vue SANS traverser :
  l'île telle qu'on l'a quittée, ses lieux fixes tenus posés à leur place ; toucher un lieu
  montre sa milice, qu'on fait basculer avec sa réserve. ⚠️ Le composant ne décide rien : la
  règle est celle des lignes de la fiche de l'île (`moveRemoteMilitia`, via l'événement).
-->
<template>
  <div class="rim">
    <div class="rim-head">
      <span class="rim-title">🗺️ Île {{ island.id }} · {{ island.name }}</span>
      <span class="rim-res">🛡️ {{ reserve }} en réserve</span>
      <button type="button" class="rim-back" @click="emit('close')">↩ Revenir</button>
    </div>
    <div class="rim-map">
      <svg :viewBox="`${view.x} ${view.y} ${view.size} ${view.size}`" class="rim-svg">
        <IslandTerrain :t="terr" :view="view" />
        <!-- 🏰 La base (île 1) ou 🏘️ le village du port (îles 2 à 5) : le même dessin que la carte active. -->
        <MapTown :island="island.id" />
        <g
          v-for="p in points"
          :key="p.id"
          class="rim-pt"
          :class="{ sel: sel === p.id }"
          role="button"
          tabindex="0"
          :aria-label="`${p.label} · ${p.militia} milicien${p.militia > 1 ? 's' : ''}`"
          @click="sel = sel === p.id ? null : p.id"
          @keydown.enter.prevent="sel = sel === p.id ? null : p.id"
          @keydown.space.prevent="sel = sel === p.id ? null : p.id"
        >
          <circle :cx="p.x" :cy="p.y" r="11" class="rim-hit" />
          <rect :x="p.x - 7" :y="p.y - 7" width="14" height="14" rx="3" class="rim-fort" />
          <text :x="p.x" :y="p.y + 2.8" class="rim-emo">{{ p.emoji }}</text>
          <g :transform="`translate(${p.x + 7} ${p.y - 7})`">
            <circle r="4.2" class="rim-badge" />
            <text y="1.8" class="rim-n">{{ p.militia }}</text>
          </g>
        </g>
      </svg>
      <!-- 🏝️ L'archipel (pastille en haut à droite), fourni par la carte qui nous héberge. -->
      <slot />
    </div>
    <!-- 🛡️ Les lieux tenus, en tuiles : le lieu touché (sur la carte ou ici) se gère dessous. -->
    <div class="rim-list">
      <button
        v-for="p in points"
        :key="p.id"
        type="button"
        class="rim-tile"
        :class="{ sel: sel === p.id }"
        @click="sel = sel === p.id ? null : p.id"
      >
        <span class="rt-emo">{{ p.emoji }}</span>
        <span class="rt-name">{{ p.label }}</span>
        <span class="rt-n">🛡️ {{ p.militia }}</span>
      </button>
      <p v-if="!points.length" class="rim-empty">Aucun lieu tenu sur cette île.</p>
    </div>
    <div v-if="selPt" class="rim-manage">
      <div class="rm-name">{{ selPt.emoji }} {{ selPt.label }}</div>
      <div class="rm-row">
        <button
          type="button"
          class="rm-btn"
          :aria-label="`Ramener un milicien de ${selPt.label}`"
          :disabled="busy || selPt.militia < 1"
          @click="emit('militia', { pointId: selPt.id, delta: -1 })"
        >
          −
        </button>
        <span class="rm-count"
          >🛡️ {{ selPt.militia }} milicien{{ selPt.militia > 1 ? 's' : '' }}</span
        >
        <button
          type="button"
          class="rm-btn"
          :aria-label="`Poster un milicien sur ${selPt.label}`"
          :disabled="busy || selPt.room < 1 || reserve < 1"
          @click="emit('militia', { pointId: selPt.id, delta: 1 })"
        >
          +
        </button>
      </div>
      <p class="rm-note">
        {{
          selPt.room < 1
            ? 'Garnison pleine.'
            : reserve < 1
              ? 'Plus aucun milicien en réserve sur cette île.'
              : `${selPt.room} place${selPt.room > 1 ? 's' : ''} libre${selPt.room > 1 ? 's' : ''}.`
        }}
        Le changement est immédiat : l'île est rangée, personne n'y marche.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import IslandTerrain from '@/components/IslandTerrain.vue';
import MapTown from '@/components/MapTown.vue';
import type { Island } from '@/lib/archipelago';
import type { RemotePoint } from '@/lib/crossing';
import { mapViewOf, type ExpeditionMap } from '@/lib/expedition';
import { islandTerrain } from '@/lib/islandTerrain';

const props = defineProps<{
  island: Island;
  /** La carte rangée de l'île. */
  map: ExpeditionMap;
  /** Ses lieux tenus, avec leur milice (`remotePoints`). */
  remote: RemotePoint[];
  /** La réserve de milice de l'île. */
  reserve: number;
  busy?: boolean;
}>();
const emit = defineEmits<{
  close: [];
  militia: [{ pointId: string; delta: number }];
}>();

const view = computed(() => mapViewOf(props.map));
const terr = computed(() => islandTerrain(props.island.id));
/** Les lieux tenus, à leur place sur la carte rangée. */
const points = computed(() =>
  props.remote.flatMap((r) => {
    const p = props.map.pois.find((x) => x.id === r.id);
    return p ? [{ ...r, x: p.x, y: p.y }] : [];
  }),
);
const sel = ref<string | null>(null);
const selPt = computed(() => points.value.find((p) => p.id === sel.value) ?? null);
// Une autre île affichée : rien de sélectionné.
watch(
  () => props.island.id,
  () => (sel.value = null),
);
</script>

<style scoped lang="scss">
.rim {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rim-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.rim-title {
  font-family: Oswald, sans-serif;
  font-size: 16px;
  font-weight: 600;
}
.rim-res {
  font-size: 12.5px;
  color: var(--dim);
}
.rim-back {
  margin-left: auto;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1.5px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.rim-map {
  position: relative;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: #122f45;
}
.rim-svg {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}
.rim-pt {
  cursor: pointer;
}
.rim-hit {
  fill: transparent;
}
.rim-fort {
  fill: color-mix(in srgb, #b57bff 35%, #211c16);
  stroke: #b57bff;
  stroke-width: 0.9;
}
.rim-pt.sel .rim-fort {
  stroke: var(--accent);
  stroke-width: 1.5;
}
.rim-emo {
  font-size: 8.5px;
  text-anchor: middle;
  pointer-events: none;
}
.rim-badge {
  fill: #15120e;
  stroke: #b57bff;
  stroke-width: 0.4;
}
.rim-n {
  font-size: 5px;
  font-weight: 700;
  fill: #f3eee6;
  text-anchor: middle;
  pointer-events: none;
}
.rim-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rim-tile {
  flex: 1 1 220px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 6px 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  min-width: 0;
}
.rim-tile.sel {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.rt-emo {
  font-size: 18px;
}
.rt-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.rt-n {
  font-weight: 700;
  white-space: nowrap;
}
.rim-empty {
  margin: 0;
  font-size: 13px;
  color: var(--dim);
}
.rim-manage {
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: var(--surface);
}
.rm-name {
  font-weight: 700;
  margin-bottom: 8px;
}
.rm-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.rm-btn {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: 1.5px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text);
  font-size: 22px;
  font-weight: 700;
  cursor: pointer;
}
.rm-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.rm-count {
  font-family: Oswald, sans-serif;
  font-size: 18px;
}
.rm-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--dim);
  text-align: center;
}
</style>
