<template>
  <svg
    v-if="key"
    class="court-diagram"
    :viewBox="`0 0 120 200`"
    role="img"
    :aria-label="`Schéma : ${label}`"
  >
    <defs>
      <marker
        id="cd-arrow"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
      </marker>
    </defs>

    <!-- Terrain -->
    <rect x="20" y="15" width="80" height="170" rx="2" class="cd-court" />
    <!-- Lignes de service -->
    <line x1="20" y1="60" x2="100" y2="60" class="cd-line" />
    <line x1="20" y1="140" x2="100" y2="140" class="cd-line" />
    <!-- Ligne médiane de service -->
    <line x1="60" y1="60" x2="60" y2="140" class="cd-line" />
    <!-- Filet -->
    <line x1="16" y1="100" x2="104" y2="100" class="cd-net" />

    <!-- Trajectoires -->
    <line
      v-for="(a, i) in arrows"
      :key="i"
      :x1="a.x1"
      :y1="a.y1"
      :x2="a.x2"
      :y2="a.y2"
      class="cd-path"
      :class="{ dashed: a.dashed }"
      marker-end="url(#cd-arrow)"
    />
    <!-- Position joueur -->
    <circle :cx="playerX" cy="182" r="4" class="cd-player" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DrillCategory, DrillShot } from '@/lib/types';

const props = defineProps<{
  pattern?: string | null;
  shot?: DrillShot | null;
  category?: DrillCategory | null;
}>();

interface Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed?: boolean;
}

// Trajectoires de base (joueur en bas à droite ; far = haut).
const BASE: Record<string, Arrow[]> = {
  diagonale: [{ x1: 90, y1: 170, x2: 32, y2: 40 }],
  longue_ligne: [{ x1: 88, y1: 170, x2: 88, y2: 40 }],
  decroise: [
    { x1: 32, y1: 40, x2: 58, y2: 150, dashed: true },
    { x1: 58, y1: 150, x2: 90, y2: 40 },
  ],
  montee_volee: [
    { x1: 88, y1: 172, x2: 70, y2: 112 },
    { x1: 70, y1: 108, x2: 44, y2: 46 },
  ],
  service: [{ x1: 78, y1: 178, x2: 42, y2: 72 }],
  volee: [
    { x1: 52, y1: 120, x2: 47, y2: 82 },
    { x1: 68, y1: 120, x2: 73, y2: 82 },
  ],
  rally: [{ x1: 78, y1: 170, x2: 40, y2: 45 }],
};

const LABELS: Record<string, string> = {
  diagonale: 'diagonale',
  longue_ligne: 'longue ligne',
  decroise: 'décroisé',
  montee_volee: 'montée-volée',
  service: 'service',
  volee: 'volée',
  rally: 'échange',
};

const key = computed<string | null>(() => {
  const p = props.pattern;
  if (p === 'diagonale' || p === 'croise') return 'diagonale';
  if (p === 'longue_ligne') return 'longue_ligne';
  if (p === 'decroise') return 'decroise';
  if (p === 'montee_volee') return 'montee_volee';
  if (props.category === 'service_retour' || props.shot === 'service') return 'service';
  if (props.category === 'volee' || props.shot === 'volee') return 'volee';
  if (props.category === 'fond_de_court') return 'rally';
  return null;
});

// Revers → miroir horizontal (le joueur frappe de l'autre côté).
const mirror = computed(() => props.shot === 'revers');
const arrows = computed<Arrow[]>(() => {
  const base = key.value ? (BASE[key.value] ?? []) : [];
  if (!mirror.value) return base;
  return base.map((a) => ({ ...a, x1: 120 - a.x1, x2: 120 - a.x2 }));
});
const playerX = computed(() => (mirror.value ? 40 : 80));
const label = computed(() => (key.value ? (LABELS[key.value] ?? '') : ''));
</script>

<style scoped lang="scss">
.court-diagram {
  width: 100%;
  height: auto;
  display: block;
}
.cd-court {
  fill: var(--surface-2);
  stroke: var(--line);
  stroke-width: 1.5;
}
.cd-line {
  stroke: var(--line);
  stroke-width: 1;
}
.cd-net {
  stroke: var(--dim);
  stroke-width: 2;
}
.cd-path {
  stroke: var(--accent);
  stroke-width: 2.5;
  fill: none;
  stroke-linecap: round;
}
.cd-path.dashed {
  stroke: var(--dim);
  stroke-dasharray: 5 4;
  stroke-width: 2;
}
.cd-player {
  fill: var(--accent);
}
</style>
