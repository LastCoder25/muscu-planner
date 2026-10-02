<!--
  🏝️ LA VUE D'ENSEMBLE DE L'ARCHIPEL (étape 1 de la roadmap `2026-10-01-carte-archipel-roadmap`).
  Réservée à l'admin pendant le développement : une tuile REPLIABLE (même langage que les
  filtres de la carte) qui dit sur quelle île on joue, et dépliée les cinq îles en tuiles —
  l'active, puis celles à venir, avec leur tranche de rangs et leur menace. Elle porte aussi
  l'interrupteur du mode. ⚠️ Repliée à chaque ouverture : la carte passe avant.
-->
<template>
  <div class="arch" :class="{ open, on: !!island }">
    <button
      type="button"
      class="arch-head"
      :aria-expanded="open"
      aria-controls="archipel-islands"
      @click="open = !open"
    >
      <span class="arch-ico" aria-hidden="true">🏝️</span>
      <span class="arch-title">Archipel</span>
      <span class="arch-sum">
        <template v-if="island"
          >{{ island.emoji }} Île {{ island.id }} · {{ island.name }}</template
        >
        <template v-else>mode désactivé · admin</template>
      </span>
      <span class="arch-chev" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>

    <div v-if="open" id="archipel-islands" class="arch-body">
      <div class="arch-grid">
        <div
          v-for="i in tiles"
          :key="i.id"
          class="arch-tile"
          :class="{ active: i.active, locked: !i.active }"
          :style="{ '--a': i.color }"
        >
          <div class="at-top">
            <span class="at-emo" aria-hidden="true">{{ i.emoji }}</span>
            <span class="at-num">Île {{ i.id }}</span>
            <span v-if="i.active" class="at-chip">Active</span>
            <span v-else class="at-chip dim">🔒 à venir</span>
          </div>
          <div class="at-name">{{ i.name }}</div>
          <div class="at-ranks">
            <span class="at-rank" :style="{ '--rk': i.lo.color }">{{ i.lo.name }}</span>
            <span class="at-rank" :style="{ '--rk': i.hi.color }">{{ i.hi.name }}</span>
            <span class="at-lvl">niv. {{ i.minLevel }}-{{ i.maxLevel }}</span>
          </div>
          <div class="at-threat">⚔️ {{ i.threat }}</div>
          <div class="at-fort">🏰 {{ i.fortress }}</div>
        </div>
      </div>
      <p v-if="island" class="arch-note">
        Lieux plafonnés au rang {{ islandCapRank }}, trajets selon la seule distance, carte à la
        taille de l'île : l'Avant-poste ne règle plus que la vitesse.
      </p>
      <button type="button" class="arch-toggle" :disabled="busy" @click="$emit('toggle', !island)">
        {{ island ? 'Quitter le mode archipel' : '🏝️ Activer le mode archipel (admin)' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ISLANDS, type Island } from '@/lib/archipelago';
import { characterRank } from '@/lib/characterRank';

const props = defineProps<{ island: Island | null; busy?: boolean }>();
defineEmits<{ toggle: [on: boolean] }>();

const open = ref(false);

const tiles = computed(() =>
  ISLANDS.map((i) => {
    const lo = characterRank(i.minLevel);
    const hi = characterRank(i.maxLevel);
    return { ...i, lo, hi, color: hi.color, active: props.island?.id === i.id };
  }),
);
const islandCapRank = computed(() =>
  props.island ? characterRank(props.island.maxLevel).name : '',
);
</script>

<style scoped lang="scss">
.arch {
  margin: 0 12px 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  overflow: hidden;
}
.arch.on {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}
.arch-head {
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
.arch-head:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.arch-ico {
  font-size: 14px;
}
.arch-title {
  font-weight: 700;
  font-size: 13px;
}
.arch-sum {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--dim);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.arch-chev {
  color: var(--dim);
  font-size: 12px;
}
.arch-body {
  padding: 4px 12px 12px;
}
.arch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
@media (min-width: 520px) {
  .arch-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.arch-tile {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px;
  background: var(--surface-2, var(--bg));
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.arch-tile.active {
  border-color: var(--a);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--a) 40%, transparent);
}
.arch-tile.locked {
  opacity: 0.6;
}
.at-top {
  display: flex;
  align-items: center;
  gap: 5px;
}
.at-emo {
  font-size: 16px;
}
.at-num {
  font-family: 'Oswald', sans-serif;
  font-size: 13px;
  font-weight: 600;
}
.at-chip {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent);
  color: #15120e;
  white-space: nowrap;
}
.at-chip.dim {
  background: transparent;
  color: var(--dim);
  box-shadow: inset 0 0 0 1px var(--line);
}
.at-name {
  font-size: 12px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.at-ranks {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.at-rank {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  color: var(--rk);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rk) 60%, transparent);
}
.at-lvl {
  font-size: 10px;
  color: var(--dim);
}
.at-threat,
.at-fort {
  font-size: 11px;
  color: var(--dim);
  overflow-wrap: anywhere;
}
.arch-note {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--dim);
}
.arch-toggle {
  margin-top: 10px;
  width: 100%;
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.arch-toggle:disabled {
  opacity: 0.5;
}
</style>
