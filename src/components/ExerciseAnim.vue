<template>
  <div v-if="frames" class="ex-anim" :style="{ width: size + 'px', height: size + 'px' }">
    <img class="fr fr0" :src="frames[0]" :alt="`Démonstration : ${title}`" loading="lazy" />
    <img class="fr fr1" :class="{ play }" :src="frames[1]" :alt="''" loading="lazy" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { exerciseFrames } from '@/data/exerciseImages';

const props = withDefaults(
  defineProps<{
    exerciseId?: string;
    size?: number;
    play?: boolean;
    title?: string;
  }>(),
  { size: 120, play: true, title: 'exercice' },
);

// Deux poses (départ/fin) → bascule en boucle. Aucune si l'exo n'a pas d'images.
const frames = computed(() => (props.exerciseId ? exerciseFrames(props.exerciseId) : undefined));
</script>

<style scoped>
.ex-anim {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface);
}
.fr {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
/* La pose de fin se fond par-dessus la pose de départ, en ping-pong (dwell aux
   extrémités via alternate + paliers 0/40 % et 60/100 %). */
.fr1 {
  opacity: 0;
}
.fr1.play {
  animation: ex-flip 1.7s ease-in-out infinite alternate;
}
@keyframes ex-flip {
  0%,
  40% {
    opacity: 0;
  }
  60%,
  100% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fr1.play {
    animation: none;
    opacity: 0;
  }
}
</style>
