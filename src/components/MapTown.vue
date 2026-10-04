<!--
  🏰/🏘️ LE POINT DE DÉPART DE LA CARTE, en (100, 100) (`EXPE.town`). Sur la carte ordinaire et
  sur l'île 1 (la capitale), c'est TA BASE : la même enceinte que l'écran Base, en miniature.
  Sur les îles 2 à 5 on débarque (étape 6 bis) : le point de départ est le VILLAGE DU PORT, au
  fond de la baie, montré comme un gros lieu fixe et sans rempart (signalé par l'utilisateur, 2026-10-04 : « on a une base sur
  l'île 2 alors qu'on devait avoir un village portuaire »). ⚠️ Un seul dessin, lu par la carte
  active ET la carte d'une île rangée (`RemoteIslandMap`) : deux copies divergeraient.
-->
<template>
  <g class="mt">
    <!-- 🏘️ Le village du port : pas de dessin (demandé, 2026-10-04 : « juste un gros lieu
         fixe »), le marqueur d'un lieu fixe tenu, en plus gros. -->
    <g v-if="village" :transform="`translate(${T.x} ${T.y}) scale(${PLACE_SCALE})`">
      <!-- 👑 Le cadre de TA base, que nul autre lieu ne porte. -->
      <g class="qg-frame mine">
        <rect x="-7.6" y="-7.6" width="15.2" height="15.2" rx="2.1" class="qg-out" />
        <rect
          x="-6.199999999999999"
          y="-6.199999999999999"
          width="12.399999999999999"
          height="12.399999999999999"
          rx="1.5"
          class="qg-in"
        />
        <rect
          v-for="(c, i) in QG_CORNERS"
          :key="'qc' + i"
          :x="c[0] * 7.6 - 1"
          :y="c[1] * 7.6 - 1"
          width="2"
          height="2"
          class="qg-stud"
        />
      </g>
      <rect x="-5.2" y="-5.2" width="10.4" height="10.4" rx="2" class="town-wall mt-place" />
      <text x="0" y="1.6" class="mt-emo">🏘️</text>
      <line x1="5.2" y1="-5.2" x2="5.2" y2="-10.4" class="mt-mast" />
      <path d="M5.2,-10.4 l4.2,1.3 l-4.2,1.3 z" class="mt-flag" />
    </g>
    <template v-else>
      <!-- 👑 Le cadre de TA base, que nul autre lieu ne porte. -->
      <g :transform="`translate(${T.x} ${T.y})`">
        <g class="qg-frame mine">
          <rect x="-15.5" y="-15.5" width="31" height="31" rx="4.3" class="qg-out" />
          <rect x="-14.1" y="-14.1" width="28.2" height="28.2" rx="3.1" class="qg-in" />
          <rect
            v-for="(c, i) in QG_CORNERS"
            :key="'qc' + i"
            :x="c[0] * 15.5 - 1"
            :y="c[1] * 15.5 - 1"
            width="2"
            height="2"
            class="qg-stud"
          />
        </g>
      </g>
      <circle :cx="T.x" :cy="T.y" r="12.5" class="mt-earth" />
      <circle :cx="T.x" :cy="T.y" r="10.5" class="mt-glow" />
      <path :d="ROAD" class="mt-road" />
      <polygon :points="WALL" class="town-wall mt-wall" />
      <polygon :points="YARD" class="mt-yard" />
      <circle
        v-for="(p, i) in PTS"
        :key="'tt' + i"
        :cx="p.x"
        :cy="p.y"
        r="1.15"
        class="mt-turret"
      />
      <!-- Corps de garde au nord, porte au sud : posés SUR le pan de mur. -->
      <rect :x="T.x - 1.7" :y="T.y - AP - 2.6" width="3.4" height="4.2" rx="0.5" class="mt-keep" />
      <rect :x="T.x - 1.3" :y="T.y + AP - 1.2" width="2.6" height="2.6" rx="0.8" class="mt-gate" />
    </template>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { EXPE } from '@/lib/expedition';

const props = defineProps<{
  /** L'île affichée (`null` = carte ordinaire, hors archipel). */
  island: number | null;
}>();

const T = EXPE.town;
/** L'enceinte : octogone décalé d'un demi-pas (pans au nord et au sud). */
const R = 7.2;
const PTS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 - Math.PI / 2 + Math.PI / 8;
  return { x: T.x + Math.cos(a) * R, y: T.y + Math.sin(a) * R };
});
const WALL = PTS.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
const YARD = PTS.map(
  (p) => `${(T.x + (p.x - T.x) * 0.72).toFixed(2)},${(T.y + (p.y - T.y) * 0.72).toFixed(2)}`,
).join(' ');
/** Distance du centre au milieu d'un pan : porte, corps de garde et chemin. */
const AP = R * Math.cos(Math.PI / 8);
const ROAD = `M${T.x - 1.2} ${T.y + AP} L${T.x - 2.2} ${T.y + 14} L${T.x + 2.2} ${T.y + 14} L${T.x + 1.2} ${T.y + AP} Z`;

/** Le village de pêcheurs : sur les îles 2 à 5 seulement (l'île 1 est la capitale). */
const village = computed(() => props.island !== null && props.island >= 2);

/** Plus gros qu'un lieu fixe ordinaire (×1,3), comme une citadelle (`MapPoiLayer`). */
const PLACE_SCALE = 1.55;
/** Les coins du cadre de QG (unité : demi-côté). */
const QG_CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
</script>

<style scoped lang="scss">
.mt-earth {
  fill: #5a4730;
  opacity: 0.9;
}
.mt-glow {
  fill: color-mix(in srgb, var(--accent) 22%, transparent);
  animation: mt-pulse 2.4s ease-in-out infinite;
}
@keyframes mt-pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 0.75;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mt-glow {
    animation: none;
  }
}
.mt-road {
  fill: #5c4a32;
  stroke: #3f3220;
  stroke-width: 0.3;
}
.mt-wall {
  fill: #9a8768;
  stroke: #3a2f1f;
  stroke-width: 0.7;
  stroke-linejoin: round;
}
.mt-yard {
  fill: #4a3c28;
  stroke: #3a2f1f;
  stroke-width: 0.3;
}
.mt-turret,
.mt-keep {
  fill: #c2ae88;
  stroke: #3a2f1f;
  stroke-width: 0.35;
}
.mt-gate {
  fill: #241c12;
  stroke: #3a2f1f;
  stroke-width: 0.3;
}
.qg-out {
  fill: none;
  stroke-width: 0.9;
}
.qg-in {
  fill: none;
  stroke-width: 0.45;
  stroke-dasharray: 1.4 0.8;
}
.qg-frame.mine .qg-out,
.qg-frame.mine .qg-in {
  stroke: var(--accent, #ffd23f);
}
.qg-stud {
  stroke: #15120e;
  stroke-width: 0.3;
}
.qg-frame.mine .qg-stud {
  fill: var(--accent, #ffd23f);
}
.mt-place {
  fill: color-mix(in srgb, #b57bff 24%, var(--surface, #211c16));
  stroke: #b57bff;
  stroke-width: 1.2;
}
.mt-emo {
  font-size: 4.4px;
  text-anchor: middle;
  pointer-events: none;
}
.mt-mast {
  stroke: var(--text, #f3eee6);
  stroke-width: 0.5;
}
.mt-flag {
  fill: #b57bff;
}
</style>
