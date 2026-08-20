<template>
  <!-- Étincelle « poussière » unifiée : une seule forme, teintée par variante
       (objet = doré, âme = bleu-argent, encre = violet-encre). Remplace l'emoji ✨
       pour avoir la MÊME poussière en plusieurs couleurs. -->
  <svg
    class="dust-ico"
    :style="{ width: size + 'px', height: size + 'px', color: tint }"
    viewBox="0 0 24 24"
    role="img"
    :aria-label="label"
  >
    <path
      d="M12 1.5c.5 4.3 2.2 6 6.5 6.5-4.3.5-6 2.2-6.5 6.5-.5-4.3-2.2-6-6.5-6.5 4.3-.5 6-2.2 6.5-6.5Z"
      fill="currentColor"
    />
    <path
      d="M18.5 15c.25 1.8 1 2.55 2.8 2.8-1.8.25-2.55 1-2.8 2.8-.25-1.8-1-2.55-2.8-2.8 1.8-.25 2.55-1 2.8-2.8Z"
      fill="currentColor"
      opacity="0.75"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ variant?: 'dust' | 'soul' | 'ink'; size?: number }>(), {
  variant: 'dust',
  size: 15,
});
const TINTS: Record<string, string> = {
  dust: '#FFD23F', // poussière d'objet — doré voltage
  soul: '#8FD3FF', // poussière d'âme — bleu-argent (familiers)
  ink: '#B388FF', // poussière d'encre — violet-encre (talents)
};
const LABELS: Record<string, string> = {
  dust: 'Poussière',
  soul: "Poussière d'âme",
  ink: "Poussière d'encre",
};
const tint = computed(() => TINTS[props.variant] ?? TINTS.dust);
const label = computed(() => LABELS[props.variant] ?? 'Poussière');
</script>

<style scoped>
.dust-ico {
  display: inline-block;
  vertical-align: -0.18em;
  flex: none;
}
</style>
