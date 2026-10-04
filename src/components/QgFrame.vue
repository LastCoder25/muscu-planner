<!--
  👑 LE CADRE D'UN QG (ta base, la forteresse adverse) : aucun autre lieu ne le porte. Subtil
  (demandé, 2026-10-04 : « l'encadrement est horrible, fais un truc plus subtil et design ») :
  un halo doux de la couleur du camp (rayon ×1,15 du demi-côté : à ×1,35 il faisait deux fois
  la taille du lieu, signalé 2026-10-04) et quatre équerres fines aux coins. Centré
  en (0, 0) : le parent le place. Or pour toi, rouge pour l'ennemi.
-->
<template>
  <g class="qg" :class="tone" aria-hidden="true">
    <!-- ⚠️ Même id pour deux cadres du même camp : sans danger, le dégradé est identique. -->
    <defs>
      <radialGradient :id="`qg-halo-${tone}`">
        <stop offset="0.45" :stop-color="color" stop-opacity="0.32" />
        <stop offset="1" :stop-color="color" stop-opacity="0" />
      </radialGradient>
    </defs>
    <circle :r="half * 1.15" :fill="`url(#qg-halo-${tone})`" />
    <path :d="brackets" class="qg-br" />
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** Demi-côté du cadre, en unités de carte. */
  half: number;
  tone: 'mine' | 'foe';
}>();

/** Une couleur réelle (un `stop-color` n'accepte pas toujours une variable CSS). */
const color = computed(() => (props.tone === 'mine' ? '#ffd23f' : '#ff6a45'));
/** Les quatre équerres : chaque coin, deux branches d'un quart du côté. */
const brackets = computed(() => {
  const h = props.half;
  const a = h * 0.34;
  const f = (n: number) => +n.toFixed(2);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
    .map(([sx, sy]) => `M${f(sx! * h)} ${f(sy! * (h - a))}V${f(sy! * h)}H${f(sx! * (h - a))}`)
    .join('');
});
</script>

<style scoped lang="scss">
.qg-br {
  fill: none;
  stroke-width: 0.45;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.qg.mine .qg-br {
  stroke: var(--accent, #ffd23f);
  opacity: 0.9;
}
.qg.foe .qg-br {
  stroke: var(--d4, #ff6a45);
  opacity: 0.9;
}
</style>
