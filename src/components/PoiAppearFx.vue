<!--
  ✨ L'APPARITION D'UN OBJECTIF ENNEMI, DESSINÉE SUR LA CARTE (2026-10-07, demandé : « une
  animation selon l'objectif et selon les îles »). Dans le repère de la carte (unités du SVG) :
  posé au-dessus des lieux, à la place de l'objectif qui apparaît. Ce composant ne décide
  rien — `lib/appearFx` dit quoi et où ; il ne fait que peindre, une fois.

  Chaque variante raconte SON apparition :
  ⛺ camp (île 1) — fumée et braises, la toile se dresse
  🪺 nid (île 2) — trois œufs tremblent puis éclatent
  🪦 cimetière (île 3) — la terre se fend, un spectre s'élève
  🚩 camp de guerre (île 4) — la bannière tombe du ciel et se plante
  🔮 sanctuaire (île 5) — un cercle de runes tourne, un rai de lumière
  🌀 brèche — un tourbillon s'ouvre
  🏯 / 🏰 citadelle, forteresse — double onde de choc, pierres projetées
-->
<template>
  <g class="appear-fx" aria-hidden="true">
    <g
      v-for="a in items"
      :key="a.key"
      :class="['afx', `v-${a.variant}`]"
      :style="{ '--d': `${a.delay}ms` }"
      :transform="`translate(${a.x} ${a.y})`"
    >
      <!-- Onde au sol, commune à toutes : c'est elle qui dit « ici ». -->
      <circle class="ring" r="3" />
      <circle class="ring ring2" r="3" />

      <template v-if="a.variant === 'nest'">
        <ellipse v-for="(e, i) in EGGS" :key="i" class="egg" :cx="e[0]" :cy="e[1]" rx="1.7" ry="2.2" :style="{ '--i': i }" />
        <rect v-for="(s, i) in SHARDS" :key="'s' + i" class="shard" x="-0.5" y="-0.5" width="1" height="1" :style="{ '--tx': `${s[0]}px`, '--ty': `${s[1]}px` }" />
      </template>

      <template v-else-if="a.variant === 'grave'">
        <path class="crack" d="M-6,2 L-2,0 L0,3 L3,-1 L7,1" />
        <path class="crack c2" d="M-3,4 L0,1 L2,5" />
        <circle v-for="(s, i) in DIRT" :key="i" class="dirt" r="0.9" :style="{ '--tx': `${s[0]}px`, '--ty': `${s[1]}px` }" />
        <path class="ghost" d="M-2.6,0 Q-2.6,-6 0,-6 Q2.6,-6 2.6,0 L1.7,-1 L0.9,0 L0,-1 L-0.9,0 L-1.7,-1 Z" />
      </template>

      <template v-else-if="a.variant === 'breach'">
        <path class="swirl" d="M0,0 m-1,0 a1,1 0 1,1 2,0 a2,2 0 1,1 -4,0 a3,3 0 1,1 6,0 a4,4 0 1,1 -8,0 a5,5 0 1,1 10,0" />
        <circle class="core" r="2.4" />
      </template>

      <template v-else-if="a.variant === 'shrine'">
        <rect class="beam" x="-1.6" y="-40" width="3.2" height="40" />
        <g class="runes">
          <path v-for="i in 6" :key="i" class="rune" d="M0,-1.2 L0.8,0 L0,1.2 L-0.8,0 Z" :transform="`rotate(${i * 60}) translate(0 -8)`" />
        </g>
      </template>

      <template v-else-if="a.variant === 'camp'">
        <circle v-for="(s, i) in SMOKE" :key="i" class="smoke" :cx="s[0]" r="2.2" :style="{ '--i': i }" />
        <circle v-for="(s, i) in SPARKS" :key="'k' + i" class="spark" r="0.55" :style="{ '--tx': `${s[0]}px`, '--ty': `${s[1]}px` }" />
      </template>

      <template v-else-if="a.variant === 'warcamp'">
        <g class="banner">
          <line x1="0" y1="2" x2="0" y2="-10" class="pole" />
          <path d="M0,-10 L6,-8 L0,-6 Z" class="flag" />
        </g>
        <circle v-for="(s, i) in DIRT" :key="i" class="dust" r="1" :style="{ '--tx': `${s[0]}px`, '--ty': `${s[1] * 0.5}px` }" />
      </template>

      <template v-else-if="a.variant === 'citadel' || a.variant === 'fortress'">
        <circle class="ring ring3" r="3" />
        <circle class="flash" r="9" />
        <rect v-for="(s, i) in STONES" :key="i" class="stone" x="-0.8" y="-0.8" width="1.6" height="1.6" :style="{ '--tx': `${s[0]}px`, '--ty': `${s[1]}px` }" />
      </template>

      <template v-else>
        <circle v-for="(s, i) in SPARKS" :key="i" class="spark" r="0.6" :style="{ '--tx': `${s[0]}px`, '--ty': `${s[1]}px` }" />
      </template>
    </g>
  </g>
</template>

<script setup lang="ts">
import type { Appearance } from '@/lib/appearFx';

defineProps<{ items: readonly Appearance[] }>();

/** Positions fixes (dans le repère de la carte) : l'animation est la même à chaque fois. */
const EGGS = [
  [-2.4, 1.2],
  [2.4, 1.2],
  [0, -2],
] as const;
const SHARDS = [
  [-9, -6],
  [9, -7],
  [-7, 6],
  [8, 5],
  [0, -10],
  [-11, 0],
  [11, 1],
] as const;
const DIRT = [
  [-8, -8],
  [-4, -11],
  [3, -12],
  [8, -7],
  [-10, -3],
  [10, -2],
] as const;
const SMOKE = [[-2], [1.5], [-0.5]] as const;
const SPARKS = [
  [-6, -9],
  [5, -11],
  [-2, -13],
  [8, -6],
  [-9, -4],
] as const;
const STONES = [
  [-12, -8],
  [12, -9],
  [-10, 9],
  [11, 8],
  [0, -14],
  [-14, 1],
  [14, 0],
  [2, 13],
] as const;
</script>

<style scoped>
/* Tout part après `--d` (les apparitions se suivent) et ne joue qu'une fois. */
.afx * {
  pointer-events: none;
}
.afx {
  --c: #ff6a45;
  --soft: #ffd2c4;
}
.v-nest { --c: #c9a26b; --soft: #f4e3c3; }
.v-grave { --c: #8fd18b; --soft: #e6f4e3; }
.v-breach, .v-shrine { --c: #b57bff; --soft: #e9d8ff; }
.v-camp { --c: #ff9d4d; --soft: #ffe0c4; }
.v-warcamp { --c: #ff4d5e; --soft: #ffd0d4; }
.v-citadel, .v-fortress { --c: #ffd23f; --soft: #fff3c4; }

.ring {
  fill: none;
  stroke: var(--c);
  stroke-width: 0.8;
  animation: ring 1.1s ease-out calc(var(--d) + 0.75s) both;
}
.ring2 { animation-delay: calc(var(--d) + 1s); }
.ring3 { stroke-width: 1.4; animation-delay: calc(var(--d) + 0.55s); }
@keyframes ring {
  0% { transform: scale(0.4); opacity: 0.95; }
  100% { transform: scale(5.5); opacity: 0; }
}

/* 🪺 Les œufs tremblent, puis éclatent. */
.egg {
  fill: var(--soft);
  stroke: var(--c);
  stroke-width: 0.4;
  transform-box: fill-box;
  transform-origin: center bottom;
  animation: egg 1s ease-in-out calc(var(--d) + 0s) both;
}
@keyframes egg {
  0% { transform: scale(0); opacity: 0; }
  20% { transform: scale(1); opacity: 1; }
  35%, 55% { transform: rotate(-14deg); }
  45%, 65% { transform: rotate(14deg); }
  85% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(0.2); opacity: 0; }
}
.shard,
.dirt,
.spark,
.dust,
.stone {
  fill: var(--c);
  animation: burst 0.9s cubic-bezier(0.2, 0.7, 0.3, 1) calc(var(--d) + 0.8s) both;
}
@keyframes burst {
  0% { transform: translate(0, 0) scale(1); opacity: 0; }
  10% { opacity: 1; }
  100% { transform: translate(var(--tx), var(--ty)) scale(0.4); opacity: 0; }
}

/* 🪦 La terre se fend, la poussière jaillit, un spectre s'élève. */
.crack {
  fill: none;
  stroke: #2b2118;
  stroke-width: 0.9;
  stroke-dasharray: 20;
  animation: crack 0.7s ease-out calc(var(--d) + 0.1s) both;
}
.c2 { animation-delay: calc(var(--d) + 0.35s); }
@keyframes crack {
  0% { stroke-dashoffset: 20; opacity: 1; }
  80% { stroke-dashoffset: 0; opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}
.dirt { fill: #6b5137; animation-delay: calc(var(--d) + 0.55s); }
.ghost {
  fill: var(--soft);
  opacity: 0;
  animation: ghost 1.9s ease-out calc(var(--d) + 0.7s) both;
}
@keyframes ghost {
  0% { transform: translateY(2px) scale(0.6); opacity: 0; }
  25% { opacity: 0.85; }
  100% { transform: translateY(-16px) scale(1.1); opacity: 0; }
}

/* 🌀 Un tourbillon s'ouvre. */
.swirl {
  fill: none;
  stroke: var(--c);
  stroke-width: 0.8;
  animation: swirl 1.8s ease-in-out calc(var(--d) + 0s) both;
}
@keyframes swirl {
  0% { transform: rotate(0) scale(0); opacity: 0; }
  30% { opacity: 1; }
  100% { transform: rotate(720deg) scale(1.5); opacity: 0; }
}
.core {
  fill: var(--c);
  animation: core 1.6s ease-out calc(var(--d) + 0.2s) both;
}
@keyframes core {
  0% { transform: scale(0); opacity: 0.9; }
  60% { transform: scale(1.4); opacity: 0.6; }
  100% { transform: scale(2.2); opacity: 0; }
}

/* 🔮 Un rai de lumière, un cercle de runes qui tourne. */
.beam {
  fill: var(--soft);
  transform-box: fill-box;
  transform-origin: center bottom;
  animation: beam 1.6s ease-out calc(var(--d) + 0.2s) both;
}
@keyframes beam {
  0% { transform: scaleY(0); opacity: 0; }
  30% { transform: scaleY(1); opacity: 0.75; }
  100% { transform: scaleY(1); opacity: 0; }
}
.runes { animation: runes 2s linear calc(var(--d) + 0s) both; }
@keyframes runes {
  0% { transform: rotate(0) scale(0.3); opacity: 0; }
  20% { opacity: 1; }
  100% { transform: rotate(240deg) scale(1.2); opacity: 0; }
}
.rune { fill: var(--c); }

/* ⛺ La fumée monte, les braises s'envolent. */
.smoke {
  fill: #b9b0a3;
  opacity: 0;
  animation: smoke 1.8s ease-out calc(var(--d) + var(--i) * 0.25s) both;
}
@keyframes smoke {
  0% { transform: translateY(2px) scale(0.4); opacity: 0; }
  30% { opacity: 0.7; }
  100% { transform: translateY(-14px) scale(1.6); opacity: 0; }
}

/* 🚩 La bannière tombe du ciel et se plante. */
.banner { animation: banner 1.6s ease-in calc(var(--d) + 0s) both; }
@keyframes banner {
  0% { transform: translateY(-30px); opacity: 0; }
  20% { opacity: 1; }
  45% { transform: translateY(0); }
  75% { opacity: 1; }
  100% { transform: translateY(0); opacity: 0; }
}
.pole { stroke: #e9dfcf; stroke-width: 0.6; }
.flag { fill: var(--c); }
.dust { fill: #a8916e; }

/* 🏯🏰 Un éclair et des pierres projetées. */
.flash {
  fill: var(--soft);
  animation: flash 0.6s ease-out calc(var(--d) + 0.5s) both;
}
@keyframes flash {
  0% { opacity: 0; transform: scale(0.3); }
  30% { opacity: 0.8; }
  100% { opacity: 0; transform: scale(1.3); }
}
.stone { fill: #8a7a63; }

@media (prefers-reduced-motion: reduce) {
  .appear-fx { display: none; }
}
</style>
