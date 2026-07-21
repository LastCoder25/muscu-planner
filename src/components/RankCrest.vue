<template>
  <span
    class="crest"
    :class="{ ['tier-' + rank.toLowerCase()]: true }"
    :style="{ width: size + 'px', height: Math.round(size * 1.12) + 'px', '--c': color }"
    :title="`Rang ${rank}`"
  >
    <svg viewBox="0 0 100 112" class="crest-svg" aria-hidden="true">
      <defs>
        <radialGradient :id="gid" cx="50%" cy="36%" r="72%">
          <stop offset="0%" :stop-color="light" />
          <stop offset="58%" :stop-color="color" />
          <stop offset="100%" :stop-color="dark" />
        </radialGradient>
      </defs>
      <!-- corps hexagonal -->
      <polygon
        :points="HEX"
        :fill="`url(#${gid})`"
        :stroke="light"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      <!-- cadre intérieur gravé -->
      <polygon
        :points="HEX_IN"
        fill="none"
        :stroke="light"
        stroke-width="1.4"
        opacity="0.55"
        stroke-linejoin="round"
      />
      <!-- gemmes aux sommets -->
      <circle v-for="(p, i) in VERTS" :key="i" :cx="p[0]" :cy="p[1]" r="3" :fill="light" />
      <!-- lettre -->
      <text
        x="50"
        y="70"
        text-anchor="middle"
        class="crest-letter"
        :font-size="letterSize"
        fill="#fff"
        :stroke="dark"
        stroke-width="1.5"
        paint-order="stroke"
      >
        {{ rank }}
      </text>
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { rankColor } from '@/data/ranks';

const props = withDefaults(defineProps<{ rank: string; size?: number }>(), { size: 44 });

const HEX = '50,3 95,30 95,82 50,109 5,82 5,30';
const HEX_IN = '50,12 87,34 87,78 50,100 13,78 13,34';
const VERTS: [number, number][] = [
  [50, 3],
  [95, 30],
  [95, 82],
  [50, 109],
  [5, 82],
  [5, 30],
];

const color = computed(() => rankColor(props.rank));
const gid = computed(() => `crest-${props.rank.toLowerCase()}`);
const letterSize = computed(() =>
  props.rank.length >= 3 ? 30 : props.rank.length === 2 ? 42 : 54,
);

function shade(hex: string, pct: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const target = pct < 0 ? 0 : 255;
  const p = Math.abs(pct) / 100;
  const mix = (c: number) => Math.round((target - c) * p + c);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
const light = computed(() => shade(color.value, 40));
const dark = computed(() => shade(color.value, -55));
</script>

<style scoped lang="scss">
.crest {
  display: inline-block;
  flex: none;
  filter: drop-shadow(0 0 5px color-mix(in srgb, var(--c) 55%, transparent));
}
.crest-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.crest-letter {
  font-family: var(--font-display, 'Oswald', sans-serif);
  font-weight: 700;
}
/* halo renforcé + léger battement pour les rangs d'élite */
.crest.tier-s,
.crest.tier-ss,
.crest.tier-sss {
  filter: drop-shadow(0 0 9px color-mix(in srgb, var(--c) 75%, transparent));
}
.crest.tier-sss {
  animation: crest-pulse 2.4s ease-in-out infinite;
}
@keyframes crest-pulse {
  0%,
  100% {
    filter: drop-shadow(0 0 8px color-mix(in srgb, var(--c) 60%, transparent));
  }
  50% {
    filter: drop-shadow(0 0 16px color-mix(in srgb, var(--c) 95%, transparent));
  }
}
@media (prefers-reduced-motion: reduce) {
  .crest.tier-sss {
    animation: none;
  }
}
</style>
