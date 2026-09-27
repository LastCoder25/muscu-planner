<template>
  <!-- 🪨 UNE RUNE : une pierre polie, gravée d'un glyphe propre à sa couleur. La couleur se lit
       sans la voir (le glyphe change aussi) et les couleurs rares brillent davantage. Sans
       `tier`, la pierre porte les quatre teintes : c'est l'icône du stock, toutes couleurs. -->
  <svg
    class="rune-icon"
    :class="tier ? 't-' + tier : 'all'"
    viewBox="0 0 32 32"
    :width="size"
    :height="size"
    role="img"
    :aria-label="label"
  >
    <defs>
      <radialGradient :id="`${uid}-stone`" cx="38%" cy="30%" r="75%">
        <stop offset="0%" :stop-color="look.light" />
        <stop offset="55%" :stop-color="look.base" />
        <stop offset="100%" :stop-color="look.dark" />
      </radialGradient>
      <radialGradient :id="`${uid}-halo`" cx="50%" cy="52%" r="50%">
        <stop offset="55%" :stop-color="look.base" :stop-opacity="look.glow" />
        <stop offset="100%" :stop-color="look.base" stop-opacity="0" />
      </radialGradient>
      <linearGradient v-if="!tier" :id="`${uid}-all`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" :stop-color="TIER_LOOK.green.base" />
        <stop offset="35%" :stop-color="TIER_LOOK.blue.base" />
        <stop offset="68%" :stop-color="TIER_LOOK.violet.base" />
        <stop offset="100%" :stop-color="TIER_LOOK.gold.base" />
      </linearGradient>
    </defs>
    <!-- Halo : rien pour la verte, de plus en plus fort jusqu'à la dorée. -->
    <circle v-if="look.glow > 0" cx="16" cy="16" r="17" :fill="`url(#${uid}-halo)`" />
    <!-- La pierre, un galet un peu penché. -->
    <path
      d="M16 2.8c6.6 0 11.4 4.9 11.4 11.6 0 7.3-5 14.8-11.6 14.8S4.6 21.8 4.6 14.6C4.6 7.8 9.4 2.8 16 2.8z"
      :fill="tier ? `url(#${uid}-stone)` : `url(#${uid}-all)`"
      stroke="rgba(0,0,0,0.45)"
      stroke-width="1"
    />
    <!-- Reflet. -->
    <path
      d="M10.5 7.6c1.6-1.6 3.6-2.4 5.8-2.4"
      fill="none"
      stroke="rgba(255,255,255,0.55)"
      stroke-width="1.4"
      stroke-linecap="round"
    />
    <!-- Le glyphe gravé : un trait sombre, puis un trait clair décalé (la gravure). -->
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path :d="glyph" stroke="rgba(0,0,0,0.55)" stroke-width="2.6" transform="translate(0 0.7)" />
      <path :d="glyph" :stroke="look.ink" stroke-width="1.8" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { RUNE_INFO, type RuneTier } from '@/lib/skillRunes';

const props = withDefaults(
  defineProps<{
    /** La couleur de la rune ; absente, la pierre porte les quatre (le stock entier). */
    tier?: RuneTier | null;
    /** Taille CSS : par défaut, celle du texte autour (l'icône remplace un emoji). */
    size?: string;
  }>(),
  { tier: null, size: '1.15em' },
);

const uid = `rune-${useId()}`;

/** Les teintes d'une couleur, et la force de son halo. ⚠️ Le « doré » est ORANGÉ, comme son
 *  emoji 🟠 partout ailleurs : sur le jaune voltage de l'interface, un vrai doré disparaissait. */
const TIER_LOOK: Record<
  RuneTier,
  { light: string; base: string; dark: string; ink: string; glow: number }
> = {
  green: { light: '#b8f0a8', base: '#5fb34d', dark: '#2c5e22', ink: '#eaffdf', glow: 0 },
  blue: { light: '#b5dcff', base: '#3d8fe0', dark: '#1a3f6e', ink: '#e8f4ff', glow: 0.35 },
  violet: { light: '#e2c4ff', base: '#9a55e0', dark: '#46206e', ink: '#f7ecff', glow: 0.55 },
  gold: { light: '#ffe0a3', base: '#f39a2b', dark: '#7a3f06', ink: '#fff6e0', glow: 0.8 },
};
const ALL_LOOK = { light: '#e9e2d6', base: '#8f8676', dark: '#3a342b', ink: '#fffaf0', glow: 0 };

/** Un glyphe par couleur, inspirés des runes nordiques (Fehu, Algiz, Othala, Ingwaz). */
const GLYPH: Record<RuneTier | 'all', string> = {
  green: 'M13 9v15M13 13l6-3.5M13 17.5l6-3.5',
  blue: 'M16 10v14M16 17l-5-6M16 17l5-6',
  violet: 'M16 9l-5 6 5 5 5-5zM12.5 18.5L10 23.5M19.5 18.5L22 23.5',
  gold: 'M16 9l-5 7.5 5 7.5 5-7.5zM11 16.5h10',
  all: 'M16 9.5v14M11.5 13l9 6M20.5 13l-9 6',
};

const look = computed(() => (props.tier ? TIER_LOOK[props.tier] : ALL_LOOK));
const glyph = computed(() => GLYPH[props.tier ?? 'all']);
const label = computed(() => (props.tier ? RUNE_INFO[props.tier].label : 'Runes de compétence'));
</script>

<style scoped>
.rune-icon {
  display: inline-block;
  vertical-align: -0.2em;
  flex: none;
  overflow: visible;
}
</style>
