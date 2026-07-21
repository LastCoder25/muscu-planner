<template>
  <span
    class="ath-badge font-display"
    :style="{ '--tier': color, width: size + 'px', height: size + 'px' }"
    :title="`Niveau ${level} · ${tier}`"
  >
    <span class="ath-lvl" :style="{ fontSize: Math.round(size * 0.4) + 'px' }">{{ level }}</span>
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ level: number; color: string; tier: string; size?: number }>(), {
  size: 40,
});
</script>

<style scoped lang="scss">
.ath-badge {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  border: 2px solid var(--tier);
  background: color-mix(in srgb, var(--tier) 18%, transparent);
  color: var(--tier);
  font-weight: 700;
  line-height: 1;
}
.ath-lvl {
  font-variant-numeric: tabular-nums;
}
</style>
