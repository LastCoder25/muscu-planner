<!--
  ⛵🏰 ENVOYER DES MILICIENS D'UN LIEU FIXE VERS UN LIEU FIXE D'UNE AUTRE ÎLE (2026-10-12,
  demandé par l'utilisateur). Replié par défaut ; déplié, un nombre et une tuile par lieu des
  autres îles, grisée AVEC la raison. ⚠️ Le composant ne décide rien : les places viennent de
  `seaDestinations`, le refus du store (`shipPointBlocker`) reste la règle.
-->
<template>
  <div v-if="max > 0 && destinations.length" class="mss">
    <button
      type="button"
      class="mss-toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      ⛵ Envoyer sur une autre île
      <span class="mss-chev">{{ open ? '▾' : '▸' }}</span>
    </button>
    <template v-if="open">
      <div class="mss-row">
        <button
          type="button"
          class="mss-btn"
          aria-label="Un milicien de moins"
          :disabled="busy || n <= 1"
          @click="count = n - 1"
        >
          −
        </button>
        <span class="mss-count">🛡️ {{ n }} milicien{{ n > 1 ? 's' : '' }}</span>
        <button
          type="button"
          class="mss-btn"
          aria-label="Un milicien de plus"
          :disabled="busy || n >= max"
          @click="count = n + 1"
        >
          +
        </button>
      </div>
      <div class="mss-grid">
        <button
          v-for="d in destinations"
          :key="`${d.island}:${d.pointId}`"
          type="button"
          class="mss-tile"
          :disabled="busy || d.room < n"
          :title="d.room < n ? whyFull(d.room) : ''"
          @click="emit('send', { island: d.island, pointId: d.pointId, n, label: d.label })"
        >
          <span class="mss-emo">{{ d.emoji }}</span>
          <span class="mss-main">
            <span class="mss-name">{{ d.label }}</span>
            <span class="mss-sub"
              >{{ d.islandEmoji }} Île {{ d.island }} ·
              {{ d.room < n ? whyFull(d.room) : `${d.room} place${d.room > 1 ? 's' : ''}` }}</span
            >
          </span>
        </button>
      </div>
      <p class="mss-note">
        2 h de mer. Ils quittent ce lieu tout de suite ; leur place les attend là-bas.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SeaDestination } from '@/lib/militiaSea';

const props = defineProps<{
  /** Les lieux des autres îles (`seaDestinations`). */
  destinations: SeaDestination[];
  /** Les miliciens du lieu de départ. */
  max: number;
  busy?: boolean;
}>();
const emit = defineEmits<{
  send: [{ island: number; pointId: string; n: number; label: string }];
}>();

const open = ref(false);
const count = ref(1);
const n = computed(() => Math.max(1, Math.min(count.value, props.max)));
const whyFull = (room: number) =>
  room <= 0 ? 'plein' : `${room} place${room > 1 ? 's' : ''} seulement`;
</script>

<style scoped lang="scss">
.mss {
  margin-top: 10px;
}
.mss-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.mss-chev {
  color: var(--dim);
}
.mss-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}
.mss-btn {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
}
.mss-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.mss-count {
  font-weight: 700;
  min-width: 120px;
  text-align: center;
}
.mss-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
}
.mss-tile {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 6px 8px;
  border-radius: 12px;
  border: 1.5px solid color-mix(in srgb, var(--accent) 45%, var(--line));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.mss-tile:disabled {
  opacity: 0.45;
  cursor: default;
}
.mss-emo {
  font-size: 20px;
}
.mss-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.mss-name {
  font-weight: 700;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.mss-sub {
  font-size: 11.5px;
  color: var(--dim);
}
.mss-note {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--dim);
}
</style>
