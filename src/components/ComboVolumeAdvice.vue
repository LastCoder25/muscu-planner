<template>
  <!-- 🧭 Conseil de volume à la création d'un Défi 360 (v1.359.0) : une pastille de ton (jamais
       rouge : c'est un repère, pas une interdiction) et une phrase. Recalculé en direct quand le
       volume ou la durée change. Ne bloque rien. -->
  <div v-if="advice" class="vol-advice" :class="advice.tone" role="status" data-test="volume-advice">
    <span class="va-pill">{{ advice.title }}</span>
    <p class="va-text">{{ advice.text }}</p>
    <p v-if="hotNames.length" class="va-hot" data-test="volume-advice-hot">
      Les plus chargés : {{ hotNames.join(', ') }}.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { comboSlot } from '@/data/combo';
import { comboVolumeAdvice, type VolumeGroupInput } from '@/lib/comboVolumeAdvice';
import type { Level } from '@/lib/types';

const props = defineProps<{
  level: Level;
  duration: number;
  groups: readonly VolumeGroupInput[];
}>();

const advice = computed(() =>
  comboVolumeAdvice({ level: props.level, duration: props.duration, groups: props.groups }),
);
const hotNames = computed(() =>
  (advice.value?.hot ?? []).map((k) => comboSlot(k)?.label ?? k),
);
</script>

<style scoped lang="scss">
.vol-advice {
  --va: var(--dim);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--va) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--va) 45%, var(--line-soft));
}
.vol-advice.light {
  --va: #5fb3e6;
}
.vol-advice.ok {
  --va: var(--d1);
}
.vol-advice.high {
  --va: var(--d3);
}
.vol-advice.veryHigh {
  --va: #ff9a3c;
}
.va-pill {
  align-self: flex-start;
  font-size: 12px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 999px;
  color: var(--accent-ink);
  background: var(--va);
}
.va-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text);
}
.va-hot {
  margin: 0;
  font-size: 12px;
  color: var(--dim);
}
</style>
