<template>
  <span
    class="rank-badge font-display"
    :style="{
      '--rank': color,
      width: size + 'px',
      height: size + 'px',
      fontSize: Math.round(size * 0.42) + 'px',
    }"
    :title="`Rang ${rank}`"
  >
    {{ rank }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { rankColor } from '@/data/ranks';

const props = withDefaults(defineProps<{ rank: string; size?: number }>(), { size: 32 });
const color = computed(() => rankColor(props.rank));
</script>

<style scoped lang="scss">
.rank-badge {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 10px;
  border: 2px solid var(--rank);
  background: color-mix(in srgb, var(--rank) 18%, transparent);
  color: var(--rank);
  font-weight: 700;
  letter-spacing: 0.5px;
  line-height: 1;
}
</style>
