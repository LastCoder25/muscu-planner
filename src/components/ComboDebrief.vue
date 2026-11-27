<template>
  <!-- 📊 Bilan de répartition d'un Défi 360 clôturé (v1.368.0) : la grille « groupe × jour » (qui
       a été travaillé quand), le rappel jour par jour (quelles séries de quel exo), puis des
       conseils de répartition. Un miroir avant tout : rien n'est écrit dans le défi. -->
  <section
    v-if="debrief"
    class="debrief"
    data-test="combo-debrief"
    aria-label="Bilan de répartition"
  >
    <h2 class="db-title font-display">📊 Ta répartition</h2>

    <div class="db-chips">
      <span class="chip" data-test="db-active"
        >{{ debrief.activeDays }}/{{ debrief.duration }} jours actifs</span
      >
      <span v-if="debrief.restDays" class="chip">{{ debrief.restDays }} de repos</span>
      <span class="chip">{{ debrief.total }} séries</span>
      <span v-if="debrief.total >= 10" class="chip" :class="{ hot: debrief.peakShare >= 0.4 }">
        pic : {{ Math.round(debrief.peakShare * 100) }} % le jour {{ debrief.peakDay + 1 }}
      </span>
      <span v-if="debrief.lateSets" class="chip late" data-test="db-late">
        {{ debrief.lateSets }} série{{ debrief.lateSets > 1 ? 's' : '' }} après la fin
      </span>
    </div>

    <!-- Grille groupe × jour : une pastille par jour, vide = repos pour ce groupe. -->
    <div class="grid" data-test="db-grid" role="table" aria-label="Séries par groupe et par jour">
      <div class="g-row g-head" role="row">
        <span class="g-label" />
        <span v-for="d in debrief.days" :key="d.date" class="g-day" role="columnheader">
          <b>{{ weekday(d.date) }}</b>
          <i>{{ dayNum(d.date) }}</i>
        </span>
      </div>
      <div v-for="r in rows" :key="r.slot" class="g-row" role="row" :data-slot="r.slot">
        <span class="g-label" role="rowheader" :title="slotName(r.slot)">{{
          slotEmoji(r.slot)
        }}</span>
        <span
          v-for="(n, i) in r.perDay"
          :key="i"
          class="cell"
          :class="{ on: n > 0 }"
          role="cell"
          :aria-label="n ? `${slotName(r.slot)}, jour ${i + 1} : ${n} séries` : undefined"
          >{{ n || '' }}</span
        >
      </div>
      <div class="g-row g-total" role="row">
        <span class="g-label">Σ</span>
        <span
          v-for="(d, i) in debrief.days"
          :key="d.date"
          class="cell tot"
          :class="{
            peak: debrief.total >= 10 && i === debrief.peakDay && debrief.peakShare >= 0.4,
          }"
          role="cell"
          >{{ d.total || '' }}</span
        >
      </div>
    </div>
    <div class="g-legend">
      <span v-for="r in rows" :key="r.slot" class="chip"
        >{{ slotEmoji(r.slot) }} {{ slotName(r.slot)
        }}<template v-if="r.target"> · {{ r.total }}/{{ r.target }}</template></span
      >
    </div>

    <!-- Rappel jour par jour : quelles séries de quel exo. -->
    <button class="db-toggle" type="button" :aria-expanded="showDays" @click="showDays = !showDays">
      {{ showDays ? '▾' : '▸' }} Jour par jour
    </button>
    <ol v-if="showDays" class="days" data-test="db-days">
      <li v-for="d in debrief.days" :key="d.date" class="day" :class="{ rest: !d.total }">
        <div class="d-head">
          <span class="d-name">Jour {{ d.n }} · {{ weekday(d.date) }} {{ dayNum(d.date) }}</span>
          <span class="chip" :class="{ dim: !d.total }">{{
            d.total ? `${d.total} série${d.total > 1 ? 's' : ''}` : 'repos'
          }}</span>
        </div>
        <div v-for="g in d.groups" :key="g.slot" class="d-group">
          <span class="d-gname">{{ slotEmoji(g.slot) }} {{ slotName(g.slot) }}</span>
          <span class="d-legs">
            <span v-for="l in g.legs" :key="l.exercise_id" class="chip leg"
              >{{ l.name }} ×{{ l.sets }}</span
            >
          </span>
        </div>
      </li>
    </ol>

    <!-- Conseils : constats positifs en vert, repères en jaune — jamais rouge. -->
    <div v-if="debrief.tips.length" class="tips" data-test="db-tips">
      <p v-for="t in debrief.tips" :key="t.id" class="tip" :class="t.tone" :data-tip="t.id">
        <b v-if="t.slots.length">{{ t.slots.map((s) => slotName(s)).join(', ') }} — </b>{{ t.text }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { comboSlot, comboSlotRank } from '@/data/combo';
import { comboDebrief } from '@/lib/comboDebrief';
import type { ComboChallenge } from '@/lib/combo';

const props = defineProps<{ combo: ComboChallenge }>();

const debrief = computed(() => comboDebrief(props.combo));
const showDays = ref(true);
// Ordre des groupes = celui du reste de l'app (stable, indépendant de l'avancement).
const rows = computed(() =>
  [...(debrief.value?.rows ?? [])].sort((a, b) => comboSlotRank(a.slot) - comboSlotRank(b.slot)),
);

function slotName(key: string): string {
  return comboSlot(key)?.label ?? key;
}
function slotEmoji(key: string): string {
  return comboSlot(key)?.emoji ?? '💪';
}
function at(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}
function weekday(iso: string): string {
  return at(iso).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
}
function dayNum(iso: string): string {
  return String(at(iso).getDate());
}
</script>

<style scoped lang="scss">
.debrief {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 0 16px;
  padding: 14px 12px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  min-width: 0;
}
.db-title {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.02em;
}
.db-chips,
.g-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dim) 16%, var(--surface));
  color: var(--text);
  line-height: 1.5;
}
.chip.hot {
  background: color-mix(in srgb, var(--d3) 28%, var(--surface));
}
.chip.late {
  background: color-mix(in srgb, var(--d4) 24%, var(--surface));
}
.chip.dim {
  color: var(--dim);
}
.chip.leg {
  font-weight: 600;
}
.grid {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.g-row {
  display: flex;
  gap: 3px;
  align-items: stretch;
}
.g-label {
  flex: 0 0 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--dim);
}
.g-day {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 10px;
  line-height: 1.2;
  color: var(--dim);
  text-transform: lowercase;
  b {
    font-weight: 700;
  }
  i {
    font-style: normal;
  }
}
.cell {
  flex: 1 1 0;
  min-width: 0;
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-family: var(--font-display, inherit);
  font-size: 14px;
  font-weight: 700;
  background: color-mix(in srgb, var(--dim) 8%, var(--surface));
  color: var(--dim);
}
.cell.on {
  background: var(--accent);
  color: var(--accent-ink);
}
.g-total .cell {
  background: transparent;
  color: var(--dim);
  min-height: 22px;
  font-size: 12px;
}
.g-total .cell.peak {
  color: var(--text);
  box-shadow: inset 0 -2px 0 var(--d3);
}
.db-toggle {
  align-self: flex-start;
  min-height: 44px;
  padding: 0 4px;
  background: none;
  border: 0;
  color: var(--text);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.days {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.day {
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--dim) 8%, var(--surface));
}
.day.rest {
  opacity: 0.7;
}
.d-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.d-name {
  font-weight: 700;
  font-size: 13px;
}
.d-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
}
.d-gname {
  font-size: 12px;
  color: var(--dim);
}
.d-legs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tips {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tip {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.45;
  border: 1px solid color-mix(in srgb, var(--d3) 45%, var(--line-soft));
  background: color-mix(in srgb, var(--d3) 10%, var(--surface));
}
.tip.good {
  border-color: color-mix(in srgb, var(--d1) 45%, var(--line-soft));
  background: color-mix(in srgb, var(--d1) 10%, var(--surface));
}
</style>
