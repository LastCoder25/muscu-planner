<template>
  <span class="cu" :class="{ bump: !!pop }">
    {{ format(shown) }}<span v-if="pop" :key="pop.id" class="cu-pop">+{{ format(pop.d) }}</span>
  </span>
</template>

<script setup lang="ts">
// 🔢 UN NOMBRE QUI COMPTE JUSQU'À SA NOUVELLE VALEUR (v0.1136 ; demandé : « que ça fasse de
// l'effet de up »). Quand la valeur MONTE, il défile depuis l'ancienne et un « +N » flotte au
// dessus ; quand elle baisse, elle se pose directement (une perte ne se met pas en scène).
// ⚠️ Au premier rendu : la valeur se pose telle quelle — sinon chaque ouverture d'écran ferait
// défiler tous les chiffres depuis zéro, et plus rien ne signalerait un vrai gain.
// ⚠️ `prefers-reduced-motion` : aucune animation, la valeur se pose.
import { onUnmounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    value: number;
    format?: (n: number) => string;
    /** Durée du défilement, en ms. */
    ms?: number;
  }>(),
  { format: (n: number) => String(Math.round(n)), ms: 700 },
);

const shown = ref(props.value);
const pop = ref<{ id: number; d: number } | null>(null);
let raf = 0;
let popTimer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

const reduced = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

watch(
  () => props.value,
  (to, from) => {
    cancelAnimationFrame(raf);
    if (to <= from || reduced() || typeof requestAnimationFrame === 'undefined') {
      shown.value = to;
      return;
    }
    const start = shown.value;
    const t0 = performance.now();
    pop.value = { id: ++seq, d: to - from };
    clearTimeout(popTimer);
    popTimer = setTimeout(() => (pop.value = null), props.ms + 900);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / props.ms);
      // Décélère en fin de course : l'œil lit la valeur d'arrivée.
      shown.value = start + (to - start) * (1 - Math.pow(1 - k, 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  },
);

onUnmounted(() => {
  cancelAnimationFrame(raf);
  clearTimeout(popTimer);
});
</script>

<style scoped>
.cu {
  position: relative;
  display: inline-block;
  font-variant-numeric: tabular-nums;
}
.cu.bump {
  animation: cu-bump 0.7s ease-out;
}
.cu-pop {
  position: absolute;
  left: 50%;
  bottom: 100%;
  transform: translateX(-50%);
  color: var(--d1, #7bc86c);
  font-size: 0.75em;
  font-weight: 800;
  white-space: nowrap;
  pointer-events: none;
  animation: cu-pop 1.6s ease-out forwards;
}
@keyframes cu-bump {
  30% {
    transform: scale(1.18);
    color: var(--d1, #7bc86c);
  }
}
@keyframes cu-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, 6px);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -18px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cu.bump,
  .cu-pop {
    animation: none;
  }
}
</style>
