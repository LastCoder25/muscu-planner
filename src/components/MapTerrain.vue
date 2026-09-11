<template>
  <!-- ⚠️ Composant à part pour UNE raison : la carte se re-rend chaque seconde (héros et
       convois bougent sur `now`), et ce sol compte ~150 nœuds qui ne dépendent que du
       seed. Ici, Vue ne les re-diffe que si `terrain` change — jamais au tick. -->
  <g class="map-terrain" aria-hidden="true">
    <defs>
      <radialGradient id="mt-sea" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stop-color="#2d5c76" />
        <stop offset="100%" stop-color="#152e3d" />
      </radialGradient>
      <!-- Même prairie que la Base : verte au centre, plus sombre vers les bords. -->
      <radialGradient id="mt-meadow" cx="50%" cy="48%" r="62%">
        <stop offset="0%" stop-color="#5c7034" />
        <stop offset="60%" stop-color="#48592a" />
        <stop offset="100%" stop-color="#36451f" />
      </radialGradient>
    </defs>
    <rect :x="-10" :y="-10" :width="size + 20" :height="size + 20" fill="url(#mt-sea)" />
    <!-- Côte en trois couches : hauts-fonds (bande claire côté mer), sable, puis la terre. -->
    <path :d="terrain.coast" class="mt-shallows" />
    <path :d="terrain.coast" class="mt-sand" />
    <path :d="terrain.coast" class="mt-land" />
    <ellipse v-for="(p, i) in terrain.patches" :key="'p' + i" v-bind="p" class="mt-patch" />
    <path v-for="(rv, i) in terrain.rivers" :key="'rv' + i" :d="rv" class="mt-river" />
    <path v-for="(rv, i) in terrain.rivers" :key="'rw' + i" :d="rv" class="mt-river-inner" />
    <path v-for="(g, i) in terrain.tufts" :key="'g' + i" :d="g" class="mt-tuft" />
    <path
      v-for="(f, i) in terrain.features"
      :key="'ft' + i"
      :d="f.d"
      class="mt-feat"
      :class="'f-' + f.kind"
    />
  </g>
</template>

<script setup lang="ts">
import type { Terrain } from '@/lib/expedition';

defineProps<{ terrain: Terrain; size: number }>();
</script>

<style>
/* Non scopé (les règles vivent dans le SVG parent) ; préfixe mt- pour ne rien heurter. */
.mt-shallows {
  fill: none;
  stroke: #3f7d98;
  stroke-width: 5;
  stroke-linejoin: round;
  opacity: 0.55;
}
.mt-sand {
  fill: none;
  stroke: #c8b378;
  stroke-width: 2.2;
  stroke-linejoin: round;
}
.mt-land {
  fill: url(#mt-meadow);
  stroke: #3a4a22;
  stroke-width: 0.4;
}
/* Les taches disent « la prairie n'est pas uniforme », elles ne doivent pas se lire
   comme des flaques : assez sombres pour exister, assez transparentes pour se fondre. */
.mt-patch {
  fill: #3b4c23;
  opacity: 0.32;
}
.mt-tuft {
  fill: none;
  stroke: #7f9c46;
  stroke-width: 0.5;
  stroke-linecap: round;
}
.mt-river {
  fill: none;
  stroke: #2f5b78;
  stroke-width: 1.1;
  stroke-linecap: round;
}
.mt-river-inner {
  fill: none;
  stroke: #74a9cb;
  stroke-width: 0.45;
  stroke-linecap: round;
}
.mt-feat {
  pointer-events: none;
}
/* Montagnes : roche pleine, arête sombre (le trait du versant fait l'ombre). */
.f-mountain {
  fill: #6f6659;
  stroke: #33302a;
  stroke-width: 0.42;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.f-tree {
  fill: #2e4a24;
  stroke: #1d3016;
  stroke-width: 0.3;
  stroke-linejoin: round;
}
.f-dune {
  fill: #b9a468;
  stroke: #d2bf86;
  stroke-width: 0.45;
  stroke-linecap: round;
  opacity: 0.8;
}
</style>
