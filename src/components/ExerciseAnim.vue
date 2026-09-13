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
/* Bascule NETTE entre la pose de départ et la pose de fin (1,2 s chacune).
   ⚠️ Pas de fondu : à mi-transition les deux corps se superposent et l'on voit la
   première pose « en transparence » à travers la seconde — c'est ce qui brouillait
   l'animation. steps(1, end) tient chaque palier jusqu'au suivant. */
.fr1 {
  opacity: 0;
}
.fr1.play {
  animation: ex-flip 2.4s steps(1, end) infinite;
}
@keyframes ex-flip {
  0% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
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
