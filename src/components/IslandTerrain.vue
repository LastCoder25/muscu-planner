<template>
  <!-- 🏝️ LE SOL D'UNE ÎLE DE L'ARCHIPEL (`islandTerrain.ts`) : la mer tout autour, la côte
       propre à l'île, son décor (biome de sa menace), la route vers le port et la forteresse
       portuaire. ⚠️ Composant à part pour la même raison que `MapTerrain` : la carte se
       re-rend chaque seconde, ce sol ne change jamais pour une île donnée. -->
  <g class="it" aria-hidden="true" :style="vars">
    <defs>
      <radialGradient
        :id="`it-sea-${t.island}`"
        gradientUnits="userSpaceOnUse"
        :cx="view.x + view.size / 2"
        :cy="view.y + view.size / 2"
        :r="view.size * 0.62"
      >
        <stop offset="0.35" :stop-color="t.style.sea0" />
        <stop offset="1" :stop-color="t.style.sea1" />
      </radialGradient>
      <radialGradient
        :id="`it-land-${t.island}`"
        gradientUnits="userSpaceOnUse"
        :cx="view.x + view.size / 2"
        :cy="view.y + view.size / 2"
        r="95"
      >
        <stop offset="0" :stop-color="t.style.land0" />
        <stop offset="1" :stop-color="t.style.land1" />
      </radialGradient>
      <clipPath :id="`it-clip-${t.island}`">
        <path :d="t.coast" />
      </clipPath>
    </defs>

    <!-- La mer, et ses vaguelettes. -->
    <rect
      :x="view.x - 10"
      :y="view.y - 10"
      :width="view.size + 20"
      :height="view.size + 20"
      :fill="`url(#it-sea-${t.island})`"
    />
    <path v-for="(w, i) in t.waves" :key="'w' + i" :d="w" class="it-wave" />

    <!-- La côte en trois bandes sur le MÊME contour : hauts-fonds, sable, terre. -->
    <path :d="t.coast" class="it-shoal" />
    <path :d="t.coast" class="it-sand" />
    <path :d="t.coast" :fill="`url(#it-land-${t.island})`" class="it-land" />

    <g :clip-path="`url(#it-clip-${t.island})`">
      <ellipse v-for="(p, i) in t.patches" :key="'p' + i" v-bind="p" class="it-patch" />
      <ellipse v-for="(p, i) in t.pools" :key="'m' + i" v-bind="p" class="it-pool" />
      <path v-for="(g, i) in t.tufts" :key="'g' + i" :d="g" class="it-tuft" />
      <path v-for="(rv, i) in t.rivers" :key="'rv' + i" :d="rv" class="it-river" />
      <path v-for="(rv, i) in t.rivers" :key="'rw' + i" :d="rv" class="it-river-in" />
    </g>

    <!-- La route : de la base au port (île 1), du village vers l'intérieur (îles 2 à 5). -->
    <path :d="t.road" class="it-road" />
    <path :d="t.road" class="it-road-in" />

    <path
      v-for="(f, i) in t.decor"
      :key="'d' + i"
      :d="f.d"
      class="it-decor"
      :class="'k-' + f.kind"
    />

    <!-- ⚓ LE PORT D'ARRIVÉE : quai, ponton qui avance en mer, un navire amarré. -->
    <g
      class="it-port"
      :transform="`translate(${t.port.x} ${t.port.y}) rotate(${deg(t.port.angle)})`"
    >
      <rect x="-3" y="-5" width="5" height="10" rx="0.6" class="it-quay" />
      <rect x="2" y="-1" width="11" height="2" class="it-pier" />
      <g transform="translate(9 -5.2)">
        <path d="M -4 0 L 4 0 L 2.6 2 L -2.6 2 Z" class="it-hull" />
        <path d="M 0 0 L 0 -5.6 M 0 -5.4 L 3.2 -1 L 0 -1" class="it-sail" />
      </g>
      <text x="0" y="0" class="it-lab" :transform="`rotate(${-deg(t.port.angle)}) translate(0 -7)`">
        ⚓ Port
      </text>
    </g>

    <!-- 🏰 LA FORTERESSE PORTUAIRE : enceinte carrée, quatre tours, donjon, bannière. -->
    <g
      class="it-fort"
      :transform="`translate(${t.fortress.x} ${t.fortress.y}) rotate(${deg(t.fortress.angle)})`"
    >
      <rect x="6" y="-1" width="9" height="2" class="it-pier" />
      <rect x="-6" y="-6" width="12" height="12" class="it-wall" />
      <circle
        v-for="(c, i) in TOWERS"
        :key="'t' + i"
        :cx="c[0]"
        :cy="c[1]"
        r="2.2"
        class="it-tower"
      />
      <rect x="-2.6" y="-2.6" width="5.2" height="5.2" class="it-keep" />
      <g :transform="`rotate(${-deg(t.fortress.angle)})`">
        <path d="M 0 -2.6 L 0 -9.5 M 0 -9.5 L 4 -8.3 L 0 -7" class="it-flag" />
        <text x="0" y="12" class="it-lab">🏰 {{ fortressName }}</text>
      </g>
    </g>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IslandTerrainData } from '@/lib/islandTerrain';

const props = defineProps<{
  t: IslandTerrainData;
  view: { x: number; y: number; size: number };
  fortressName: string;
}>();

const deg = (a: number) => +((a * 180) / Math.PI).toFixed(1);
const TOWERS: [number, number][] = [
  [-6, -6],
  [6, -6],
  [-6, 6],
  [6, 6],
];
const vars = computed(() => ({
  '--it-shoal': props.t.style.shoal,
  '--it-sand': props.t.style.sand,
  '--it-patch': props.t.style.patch,
  '--it-tuft': props.t.style.tuft,
  '--it-road': props.t.style.road,
}));
</script>

<style>
/* Non scopé (les règles vivent dans le SVG parent) ; préfixe it- pour ne rien heurter. */
.it-wave {
  fill: none;
  stroke: #ffffff;
  stroke-opacity: 0.16;
  stroke-width: 0.5;
  stroke-linecap: round;
}
.it-shoal {
  fill: var(--it-shoal);
  stroke: var(--it-shoal);
  stroke-width: 11;
  stroke-linejoin: round;
  opacity: 0.55;
}
.it-sand {
  fill: var(--it-sand);
  stroke: var(--it-sand);
  stroke-width: 4;
  stroke-linejoin: round;
}
.it-land {
  stroke: #00000033;
  stroke-width: 0.4;
}
.it-patch {
  fill: var(--it-patch);
  opacity: 0.4;
}
.it-pool {
  fill: #2a3f40;
  stroke: #5b7470;
  stroke-width: 0.4;
  opacity: 0.85;
}
.it-tuft {
  fill: none;
  stroke: var(--it-tuft);
  stroke-width: 0.5;
  stroke-linecap: round;
}
.it-river {
  fill: none;
  stroke: #2f5b78;
  stroke-width: 1.3;
  stroke-linecap: round;
}
.it-river-in {
  fill: none;
  stroke: #74a9cb;
  stroke-width: 0.5;
  stroke-linecap: round;
}
.it-road {
  fill: none;
  stroke: #00000040;
  stroke-width: 2.6;
  stroke-linecap: round;
}
.it-road-in {
  fill: none;
  stroke: var(--it-road);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-dasharray: 2.2 0.8;
}
.it-decor {
  pointer-events: none;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.k-mountain {
  fill: #6f6659;
  stroke: #33302a;
  stroke-width: 0.42;
}
.k-hill {
  fill: #00000026;
  stroke: #0000004d;
  stroke-width: 0.4;
}
.k-tree {
  fill: #2e4a24;
  stroke: #1d3016;
  stroke-width: 0.3;
}
.k-pine {
  fill: #1f3a1e;
  stroke: #10200f;
  stroke-width: 0.3;
}
.k-deadtree {
  fill: none;
  stroke: #2b2622;
  stroke-width: 0.55;
}
.k-rock {
  fill: #7b776f;
  stroke: #3a3732;
  stroke-width: 0.35;
}
.k-tent {
  fill: #b48a52;
  stroke: #5a4024;
  stroke-width: 0.35;
}
.k-stake {
  fill: none;
  stroke: #6b4a2a;
  stroke-width: 0.7;
}
.k-tomb {
  fill: #9a9a92;
  stroke: #3e3e3a;
  stroke-width: 0.3;
}
.k-banner {
  fill: #b5372f;
  stroke: #3b2a1a;
  stroke-width: 0.4;
}
.k-crystal {
  fill: #9a5fd6;
  stroke: #e0c4ff;
  stroke-width: 0.3;
}
.k-crack {
  fill: none;
  stroke: #ff7a2f;
  stroke-width: 0.6;
  opacity: 0.85;
}
.k-bones {
  fill: none;
  stroke: #e7e0cf;
  stroke-width: 0.5;
}
.k-house {
  fill: #8a6a48;
  stroke: #3e2c1c;
  stroke-width: 0.35;
}
.k-field {
  fill: #00000014;
  stroke: #0000003d;
  stroke-width: 0.3;
}
.k-ruin {
  fill: #8d877b;
  stroke: #3a3732;
  stroke-width: 0.35;
}
.k-dune {
  fill: #c9ad6c;
  stroke: #e0c88f;
  stroke-width: 0.45;
  opacity: 0.85;
}
.it-quay {
  fill: #8a7356;
  stroke: #3d3022;
  stroke-width: 0.4;
}
.it-pier {
  fill: #a88a62;
  stroke: #4a3826;
  stroke-width: 0.35;
}
.it-hull {
  fill: #6b4a2c;
  stroke: #2e1f12;
  stroke-width: 0.35;
}
.it-sail {
  fill: #efe6d2;
  stroke: #4a3826;
  stroke-width: 0.35;
}
.it-wall {
  fill: #6d6457;
  stroke: #2a251f;
  stroke-width: 0.5;
}
.it-tower {
  fill: #7d7366;
  stroke: #2a251f;
  stroke-width: 0.45;
}
.it-keep {
  fill: #5a5246;
  stroke: #2a251f;
  stroke-width: 0.4;
}
.it-flag {
  fill: #b5372f;
  stroke: #2a251f;
  stroke-width: 0.4;
}
.it-lab {
  font-size: 3.2px;
  font-weight: 700;
  fill: #f3eee6;
  stroke: #15120e;
  stroke-width: 0.7;
  paint-order: stroke;
  text-anchor: middle;
  pointer-events: none;
}
</style>
