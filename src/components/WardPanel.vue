<template>
  <!-- 🪵 LES PALISSADES d'un lieu fixe tenu : celles qui tiennent, puis celles qu'on peut poser
       (tuiles), avec la tenue avant → après. ⚠️ Composant d'AFFICHAGE : la règle de pose
       (`wardBlocker`) et la tenue viennent de la page, qui les tient de la lib. -->
  <section class="ward" aria-label="Palissades du lieu">
    <div class="ward-head">
      <span class="ward-title">🪵 Défenses du lieu</span>
      <span v-if="totalPct" class="ward-total">troupe ennemie −{{ totalPct }} %</span>
      <span class="ward-cap">{{ capPct }} % au plus</span>
    </div>
    <div v-if="active.length" class="ward-active">
      <span v-for="(w, i) in active" :key="i" class="ward-chip" :title="w.name">
        {{ w.emoji }} −{{ w.cutPct }} % · encore {{ w.left }}
      </span>
    </div>
    <div v-if="options.length" class="ward-grid">
      <button
        v-for="o in options"
        :key="o.id"
        type="button"
        class="ward-tile"
        :class="{ off: !!o.why }"
        :disabled="!!o.why || busy"
        :title="o.why ?? o.what"
        @click="emit('place', o.id)"
      >
        <span class="wt-emo">{{ o.emoji }}</span>
        <span class="wt-body">
          <span class="wt-name"
            >{{ o.name }} <b>×{{ o.stock }}</b></span
          >
          <span class="wt-what">−{{ o.cutPct }} % · 24 h</span>
          <span v-if="o.why" class="wt-why">{{ o.why }}</span>
          <span v-else-if="o.after !== null && holdPct !== null" class="wt-after">
            repousse {{ holdPct }} % → <b>{{ o.after }} %</b>
          </span>
        </span>
      </button>
    </div>
    <p v-else class="ward-empty">
      Aucune palissade en stock : on en trouve en butin, comme les autres consommables.
    </p>
  </section>
</template>

<script setup lang="ts">
interface WardActive {
  emoji: string;
  name: string;
  cutPct: number;
  left: string;
}
export interface WardOption {
  id: string;
  emoji: string;
  name: string;
  what: string;
  cutPct: number;
  stock: number;
  /** La raison d'un refus (`WARD_BLOCK_LABEL`), `null` si on peut la poser. */
  why: string | null;
  /** La tenue si on la pose (en %), `null` si non calculée. */
  after: number | null;
}
defineProps<{
  active: WardActive[];
  options: WardOption[];
  totalPct: number;
  capPct: number;
  /** La tenue actuelle (en %), `null` si inconnue. */
  holdPct: number | null;
  busy: boolean;
}>();
const emit = defineEmits<{ place: [id: string] }>();
</script>

<style scoped>
.ward {
  margin: 8px 0;
  padding: 10px;
  border: 1px solid color-mix(in srgb, #e3b25b 45%, var(--line));
  border-radius: 12px;
  background: color-mix(in srgb, #e3b25b 7%, var(--surface));
}
.ward-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin-bottom: 6px;
}
.ward-title {
  font-weight: 700;
}
.ward-total {
  color: #e3b25b;
  font-weight: 700;
  font-size: 13px;
}
.ward-cap {
  margin-left: auto;
  color: var(--dim);
  font-size: 12px;
}
.ward-active {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.ward-chip {
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, #e3b25b 60%, transparent);
  background: color-mix(in srgb, #e3b25b 16%, transparent);
  font-size: 12.5px;
  font-weight: 600;
}
.ward-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.ward-tile {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.ward-tile:not(:disabled):hover,
.ward-tile:not(:disabled):focus-visible {
  border-color: #e3b25b;
}
.ward-tile.off {
  opacity: 0.55;
  cursor: not-allowed;
}
.wt-emo {
  font-size: 24px;
  line-height: 1;
}
.wt-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.wt-name {
  font-weight: 600;
  font-size: 13px;
}
.wt-what,
.wt-why {
  color: var(--dim);
  font-size: 12px;
}
.wt-after {
  font-size: 12px;
  color: var(--d1, #7bc86c);
}
.ward-empty {
  margin: 0;
  color: var(--dim);
  font-size: 12.5px;
}
</style>
