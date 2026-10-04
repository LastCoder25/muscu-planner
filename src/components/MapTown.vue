<!--
  🏰/🏘️ LE POINT DE DÉPART DE LA CARTE, en (100, 100) (`EXPE.town`). Sur la carte ordinaire et
  sur l'île 1 (la capitale), c'est TA BASE : la même enceinte que l'écran Base, en miniature.
  Sur les îles 2 à 5 on débarque (étape 6 bis) : le point de départ est un VILLAGE DE PÊCHEURS au
  fond de la baie, sans rempart (signalé par l'utilisateur, 2026-10-04 : « on a une base sur
  l'île 2 alors qu'on devait avoir un village portuaire »). ⚠️ Un seul dessin, lu par la carte
  active ET la carte d'une île rangée (`RemoteIslandMap`) : deux copies divergeraient.
-->
<template>
  <g class="mt">
    <template v-if="village">
      <circle :cx="T.x" :cy="T.y" r="11" class="mt-earth v" />
      <circle :cx="T.x" :cy="T.y" r="9" class="mt-glow" />
      <!-- Le chemin du village au quai (vers la mer). -->
      <path :d="vil.path" class="mt-path" />
      <circle :cx="T.x" :cy="T.y" r="2.4" class="mt-square" />
      <g v-for="(h, i) in vil.houses" :key="'h' + i" :transform="`translate(${h.x} ${h.y})`">
        <rect
          :x="-1.6 * h.s"
          :y="-0.4 * h.s"
          :width="3.2 * h.s"
          :height="1.9 * h.s"
          class="mt-house"
        />
        <path
          :d="`M${-2 * h.s} ${-0.3 * h.s}L0 ${-2.1 * h.s}L${2 * h.s} ${-0.3 * h.s}Z`"
          class="mt-roof"
          :class="{ hall: h.hall }"
        />
      </g>
      <circle :cx="T.x" :cy="T.y" r="0.8" class="mt-well" />
    </template>
    <template v-else>
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
import { islandPort, islandShape } from '@/lib/islandShape';

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

/** Les maisons, côté TERRE (le quai est côté mer, dans la baie) : positions en repère local
 *  (x vers la mer), tournées selon la baie de l'île. La maison commune est la plus grande. */
const LOCAL = [
  { u: -4.2, v: -4.6, s: 1 },
  { u: -4.6, v: 4.2, s: 1 },
  { u: -8.2, v: -1.2, s: 1.25, hall: true },
  { u: -1.2, v: -6.6, s: 0.9 },
  { u: -1.4, v: 6.4, s: 0.9 },
  { u: -7.6, v: 4.8, s: 0.85 },
  { u: -7.4, v: -5.8, s: 0.85 },
];
/** ⚠️ L'étiquette « ⚓ Port » du sol (`IslandTerrain`) est 7 unités au-dessus du port : une
 *  maison posée là la recouvrait (vu au banc). On écarte celles qui tombent dessus. */
/** Demi-largeur et demi-hauteur de l’étiquette, marge de la maison comprise. */
const LABEL_W = 8;
const LABEL_H = 4;
const vil = computed(() => {
  const id = props.island !== null && props.island >= 2 ? props.island : null;
  const bay = id !== null ? islandShape(id).bay : 0;
  const c = Math.cos(bay);
  const s = Math.sin(bay);
  const at = (u: number, v: number) => ({ x: T.x + u * c - v * s, y: T.y + u * s + v * c });
  const port = id !== null ? islandPort(id) : null;
  const lab = port ? { x: port.x, y: port.y - 7 } : null;
  const houses = LOCAL.map((h) => ({ ...at(h.u, h.v), s: h.s, hall: !!h.hall }))
    .filter((h) => !lab || Math.abs(h.x - lab.x) > LABEL_W || Math.abs(h.y - lab.y) > LABEL_H)
    .sort((a, b) => a.y - b.y);
  const a = at(1.6, -0.9);
  const b = at(6, -0.9);
  const d = at(6, 0.9);
  const e = at(1.6, 0.9);
  const f = (n: number) => n.toFixed(2);
  return {
    houses,
    path: `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}L${f(d.x)} ${f(d.y)}L${f(e.x)} ${f(e.y)}Z`,
  };
});
</script>

<style scoped lang="scss">
.mt-earth {
  fill: #5a4730;
  opacity: 0.9;
}
.mt-earth.v {
  opacity: 0.55;
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
.mt-road,
.mt-path {
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
.mt-square {
  fill: #6b573b;
  stroke: #3f3220;
  stroke-width: 0.3;
}
.mt-well {
  fill: #2f5f80;
  stroke: #1d2b36;
  stroke-width: 0.3;
}
.mt-house {
  fill: #d9c9a8;
  stroke: #3e2c1c;
  stroke-width: 0.3;
}
.mt-roof {
  fill: #a2492f;
  stroke: #3e2c1c;
  stroke-width: 0.3;
  stroke-linejoin: round;
}
.mt-roof.hall {
  fill: #7a5aa0;
}
</style>
