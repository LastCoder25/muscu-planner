<template>
  <!-- 🌀 Une faille : un portail ovale vertical, cerné de flammes, dans la couleur de son
       RANG. Le même dessin sert à la porte du gardien, à l'entrée d'une incursion et à la
       carte d'expédition — une faille doit se reconnaître d'un écran à l'autre. -->
  <svg
    class="portal"
    :class="{ closed: !open, sealed, still }"
    :viewBox="`0 0 ${V.w} ${V.h}`"
    preserveAspectRatio="xMidYMax meet"
    :x="box?.x"
    :y="box?.y"
    :width="box ? box.w : '100%'"
    :height="box ? box.h : '100%'"
    :style="{ '--pc': color }"
    aria-hidden="true"
  >
    <defs>
      <radialGradient :id="uid + 'v'" cx="50%" cy="50%" r="50%">
        <stop offset="0" style="stop-color: #06030b" />
        <stop offset="0.5" class="st-deep" />
        <stop offset="0.86" class="st-pc" />
        <stop offset="1" class="st-hot" />
      </radialGradient>
      <radialGradient :id="uid + 'g'" cx="50%" cy="50%" r="50%">
        <stop offset="0" class="st-pc" style="stop-opacity: 0.7" />
        <stop offset="1" class="st-pc" style="stop-opacity: 0" />
      </radialGradient>
    </defs>

    <!-- Le halo : la faille éclaire ce qui l'entoure. -->
    <ellipse
      class="halo"
      :cx="V.cx"
      :cy="V.cy - 6"
      :rx="V.rx * 1.75"
      :ry="V.ry * 1.45"
      :fill="`url(#${uid}g)`"
    />

    <!-- Le feu : trois couches, du rouge sombre au blanc. Deux jeux de langues qui se
         relaient en fondu — c'est ce qui fait danser les flammes sans rien recalculer. -->
    <g class="fire">
      <path
        v-for="(d, i) in flamesA"
        :key="'a' + i"
        :d="d"
        class="flame"
        :class="['l' + i, 'set-a']"
      />
      <path
        v-for="(d, i) in flamesB"
        :key="'b' + i"
        :d="d"
        class="flame"
        :class="['l' + i, 'set-b']"
      />
    </g>

    <!-- Le cœur : le vide, qui tourbillonne. -->
    <ellipse class="rim" :cx="V.cx" :cy="V.cy" :rx="V.rx" :ry="V.ry" />
    <ellipse
      class="void"
      :cx="V.cx"
      :cy="V.cy"
      :rx="V.rx - 1.5"
      :ry="V.ry - 1.5"
      :fill="`url(#${uid}v)`"
    />
    <g :transform="`translate(${V.cx} ${V.cy}) scale(1 ${V.ry / V.rx})`">
      <circle class="swirl s1" r="20" />
      <circle class="swirl s2" r="13" />
    </g>
    <ellipse class="core" :cx="V.cx" :cy="V.cy" :rx="3" :ry="V.ry * 0.55" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { PORTAL_VIEW, portalFlames } from '@/lib/riftPortal';

const props = withDefaults(
  defineProps<{
    /** La couleur du rang de la faille (`characterRank(niveau).color`). */
    color: string;
    /** Fermée : le feu couve, le vide est voilé (la porte du gardien avant qu'on l'ouvre). */
    open?: boolean;
    /** Refermée : le portail s'effondre sur lui-même et disparaît. */
    sealed?: boolean;
    /** Graine des flammes — deux failles côte à côte ne brûlent pas pareil. */
    seed?: number;
    /** Sans animation (petit format, ou un état figé). */
    still?: boolean;
    /**
     * Place dans un SVG PARENT (la carte), dans ses unités. ⚠️ Sans elle le portail
     * remplit son conteneur HTML ; dans un SVG, une largeur CSS de 100 % le ferait couvrir
     * toute la carte — d'où des attributs, jamais du CSS, pour le dimensionner.
     */
    box?: { x: number; y: number; w: number; h: number };
  }>(),
  { open: true, sealed: false, seed: 1, still: false },
);

const V = PORTAL_VIEW;
// ⚠️ Des ids de gradient UNIQUES : la carte en dessine jusqu'à six à la fois, et un id
// partagé ferait peindre toutes les failles de la couleur de la première.
const uid = `rp${++counter}-`;
const flamesA = computed(() => portalFlames(props.seed));
const flamesB = computed(() => portalFlames(props.seed + 101));
</script>

<script lang="ts">
let counter = 0;
</script>

<style scoped lang="scss">
.portal {
  display: block;
  overflow: visible;
  transform-origin: 50% 56%;
  transition:
    transform 1.3s cubic-bezier(0.6, 0, 0.8, 0.4),
    opacity 1.3s ease;
}
.st-pc {
  stop-color: var(--pc);
}
.st-deep {
  stop-color: color-mix(in srgb, var(--pc) 22%, #06030b);
}
.st-hot {
  stop-color: color-mix(in srgb, var(--pc) 45%, #fff);
}

.halo {
  opacity: 0.55;
  transition: opacity 0.8s ease;
}
.fire {
  transform-origin: 50px 90px;
  transition:
    transform 0.8s ease,
    opacity 0.8s ease;
}
.flame {
  transform-origin: 50px 140px;
}
.l0 {
  fill: color-mix(in srgb, var(--pc) 70%, #1a0000);
  --o: 0.55;
  opacity: var(--o);
}
.l1 {
  fill: var(--pc);
  --o: 0.8;
  opacity: var(--o);
}
.l2 {
  fill: color-mix(in srgb, var(--pc) 45%, #fff);
  --o: 0.9;
  opacity: var(--o);
}
.set-a {
  animation:
    flick 1.2s ease-in-out infinite alternate,
    swapA 1.6s ease-in-out infinite;
}
.set-b {
  animation:
    flick 0.9s ease-in-out infinite alternate-reverse,
    swapB 1.6s ease-in-out infinite;
}
.l1.set-a,
.l1.set-b {
  animation-duration: 0.8s, 1.3s;
}
.l2.set-a,
.l2.set-b {
  animation-duration: 0.55s, 1s;
}
@keyframes flick {
  to {
    transform: scale(0.96, 1.07) skewX(-2deg);
  }
}
/* Les deux jeux de langues se relaient : jamais les deux éteints en même temps. */
@keyframes swapA {
  0%,
  100% {
    opacity: var(--o, 0.8);
  }
  50% {
    opacity: 0.1;
  }
}
@keyframes swapB {
  0%,
  100% {
    opacity: 0.1;
  }
  50% {
    opacity: var(--o, 0.8);
  }
}

.rim {
  fill: none;
  stroke: color-mix(in srgb, var(--pc) 35%, #fff);
  stroke-width: 2.4;
  opacity: 0.9;
}
.swirl {
  fill: none;
  stroke: color-mix(in srgb, var(--pc) 75%, #fff);
  stroke-width: 1.6;
  stroke-linecap: round;
  transform-box: fill-box;
  transform-origin: center;
  opacity: 0.55;
  transition: opacity 0.8s ease;
}
.s1 {
  stroke-dasharray: 22 14 6 18;
  animation: spin 4s linear infinite;
}
.s2 {
  stroke-dasharray: 14 10 4 12;
  animation: spin 2.6s linear infinite reverse;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.core {
  fill: color-mix(in srgb, var(--pc) 60%, #fff);
  filter: blur(3px);
  opacity: 0.35;
  animation: pulse 2.2s ease-in-out infinite;
  transition: opacity 0.8s ease;
}
@keyframes pulse {
  50% {
    opacity: 0.7;
  }
}

/* Fermée : le feu couve, le vide se voile. */
.closed .fire {
  transform: scale(0.94, 0.9);
  opacity: 0.45;
}
.closed .halo {
  opacity: 0.2;
}
.closed .swirl {
  opacity: 0.15;
}
.closed .core {
  opacity: 0.08;
  animation: none;
}

/* Refermée : tout s'aspire vers le centre, puis plus rien. */
.sealed {
  transform: scale(0.04, 0.3);
  opacity: 0;
}

.still .flame,
.still .swirl,
.still .core {
  animation: none;
}
.still .set-b {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .flame,
  .swirl,
  .core {
    animation: none;
  }
  .set-b {
    opacity: 0;
  }
  .portal {
    transition: opacity 0.3s ease;
  }
  .sealed {
    transform: none;
  }
}
</style>
