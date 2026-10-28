<template>
  <!-- 📋 « PENDANT TON ABSENCE » : une seule tuile, des pastilles. Elle ne calcule rien
       (`absenceSummary` additionne les rapports de la boîte 📬) et se range d'un geste. -->
  <section class="abs" aria-label="Pendant ton absence">
    <p class="abs-since">Depuis ta dernière visite, il y a {{ duration }}.</p>
    <div class="abs-chips" role="list">
      <span v-for="c in chips" :key="c.key" class="abs-chip" role="listitem">
        <span class="abs-emo" aria-hidden="true">{{ c.emoji }}</span>
        <b>{{ fmt(c.n) }}</b> {{ c.label }}
      </span>
      <span v-if="!chips.length" class="abs-chip dim">Rien à encaisser</span>
    </div>
    <p class="abs-lab">À relancer</p>
    <div class="abs-chips" role="list">
      <span v-for="c in relaunch" :key="c.key" class="abs-chip todo" role="listitem">
        <span class="abs-emo" aria-hidden="true">{{ c.emoji }}</span> {{ c.label }}
      </span>
      <span v-if="!relaunch.length" class="abs-chip dim">Tout le monde est en route</span>
    </div>
    <div class="abs-actions">
      <button type="button" class="abs-btn" @click="$emit('plan')">🪄 Planifier</button>
      <slot name="actions" />
      <button type="button" class="abs-btn ghost" @click="$emit('close')">Ranger</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  absenceChips,
  absenceDuration,
  relaunchChips,
  type AbsenceSummary,
  type RelaunchInput,
} from '@/lib/absenceSummary';

const props = defineProps<{
  summary: AbsenceSummary;
  /** Depuis combien de temps (ms) le joueur n'avait pas ouvert la carte. */
  away: number;
  relaunch: RelaunchInput;
}>();
defineEmits<{ (e: 'plan'): void; (e: 'close'): void }>();

const chips = computed(() => absenceChips(props.summary));
const relaunch = computed(() => relaunchChips(props.relaunch));
const duration = computed(() => absenceDuration(props.away));
const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
</script>

<style scoped lang="scss">
.abs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 4px 10px;
}
.abs-since {
  margin: 0;
  font-size: 12px;
  color: var(--dim);
}
.abs-lab {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.abs-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.abs-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 13px;
  line-height: 1.2;
  &.todo {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  }
  &.dim {
    color: var(--dim);
  }
  b {
    font-family: Oswald, Inter, sans-serif;
    font-weight: 600;
  }
}
.abs-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
.abs-btn {
  flex: 1 1 130px;
  min-height: 46px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1.5px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
  color: var(--text);
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
  &.ghost {
    border-color: var(--line);
    background: var(--surface);
    font-weight: 600;
    flex-basis: 90px;
  }
}
</style>
