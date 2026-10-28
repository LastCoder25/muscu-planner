<template>
  <div class="mbody">
    <div class="mbody-toggle">
      <button :class="{ on: view === 'front' }" @click="view = 'front'">Face</button>
      <button :class="{ on: view === 'back' }" @click="view = 'back'">Dos</button>
    </div>
    <svg
      viewBox="0 0 120 250"
      class="mbody-svg"
      role="img"
      aria-label="Volume par groupe musculaire"
    >
      <!-- Silhouette (grise, non interactive) -->
      <g class="silhouette">
        <ellipse cx="60" cy="20" rx="12" ry="14" />
        <rect x="54" y="31" width="12" height="9" rx="4" />
        <!-- tronc -->
        <path d="M40 42 Q60 38 80 42 L76 104 Q60 110 44 104 Z" />
        <!-- bras -->
        <path d="M40 44 Q24 50 20 78 L16 116 L26 118 L30 80 Q34 56 44 52 Z" />
        <path d="M80 44 Q96 50 100 78 L104 116 L94 118 L90 80 Q86 56 76 52 Z" />
        <!-- jambes -->
        <path d="M45 104 Q44 150 47 200 L44 236 L56 236 L59 200 Q60 150 59 108 Z" />
        <path d="M75 104 Q76 150 73 200 L76 236 L64 236 L61 200 Q60 150 61 108 Z" />
      </g>

      <!-- Groupes musculaires (heatmap : opacité ∝ volume) -->
      <g v-if="view === 'front'">
        <ellipse v-bind="reg('épaules')" cx="40" cy="46" rx="11" ry="7" />
        <ellipse v-bind="reg('épaules')" cx="80" cy="46" rx="11" ry="7" />
        <ellipse v-bind="reg('pectoraux')" cx="49" cy="57" rx="11" ry="9" />
        <ellipse v-bind="reg('pectoraux')" cx="71" cy="57" rx="11" ry="9" />
        <ellipse v-bind="reg('biceps')" cx="26" cy="72" rx="6" ry="13" />
        <ellipse v-bind="reg('biceps')" cx="94" cy="72" rx="6" ry="13" />
        <rect v-bind="reg('abdominaux')" x="50" y="68" width="20" height="34" rx="5" />
        <rect v-bind="reg('quadriceps')" x="45" y="114" width="13" height="44" rx="6" />
        <rect v-bind="reg('quadriceps')" x="62" y="114" width="13" height="44" rx="6" />
        <ellipse v-bind="reg('mollets')" cx="50" cy="185" rx="7" ry="19" />
        <ellipse v-bind="reg('mollets')" cx="70" cy="185" rx="7" ry="19" />
        <!-- Nombre de séries par groupe (une seule valeur par muscle) -->
        <text
          v-for="n in FRONT_NUMS"
          v-show="(series[n.m] ?? 0) > 0"
          :key="n.m"
          class="mnum"
          :x="n.x"
          :y="n.y"
          text-anchor="middle"
          dominant-baseline="middle"
        >
          {{ fmtSets(series[n.m] ?? 0) }}
        </text>
      </g>
      <g v-else>
        <ellipse v-bind="reg('épaules')" cx="40" cy="46" rx="11" ry="7" />
        <ellipse v-bind="reg('épaules')" cx="80" cy="46" rx="11" ry="7" />
        <rect v-bind="reg('dos')" x="45" y="50" width="30" height="42" rx="7" />
        <ellipse v-bind="reg('triceps')" cx="26" cy="72" rx="6" ry="13" />
        <ellipse v-bind="reg('triceps')" cx="94" cy="72" rx="6" ry="13" />
        <ellipse v-bind="reg('ischio-jambiers')" cx="50" cy="112" rx="10" ry="9" />
        <ellipse v-bind="reg('ischio-jambiers')" cx="70" cy="112" rx="10" ry="9" />
        <rect v-bind="reg('ischio-jambiers')" x="45" y="122" width="13" height="38" rx="6" />
        <rect v-bind="reg('ischio-jambiers')" x="62" y="122" width="13" height="38" rx="6" />
        <ellipse v-bind="reg('mollets')" cx="50" cy="185" rx="7" ry="19" />
        <ellipse v-bind="reg('mollets')" cx="70" cy="185" rx="7" ry="19" />
        <text
          v-for="n in BACK_NUMS"
          v-show="(series[n.m] ?? 0) > 0"
          :key="n.m"
          class="mnum"
          :x="n.x"
          :y="n.y"
          text-anchor="middle"
          dominant-baseline="middle"
        >
          {{ fmtSets(series[n.m] ?? 0) }}
        </text>
      </g>
    </svg>

    <div v-if="selected" class="mbody-pick" :style="{ color: color(selected) }">
      {{ label(selected) }} — <b>{{ fmtSets(series[selected] ?? 0) }}</b> série{{
        (series[selected] ?? 0) > 1 ? 's' : ''
      }}<template v-if="levels?.[selected]">
        · <span class="mbody-lv">niv. {{ levels[selected]!.level }}</span></template
      >
    </div>
    <div v-else class="mbody-pick dim">Touche un groupe musculaire</div>

    <!-- Niveau de CHAQUE groupe (affichage seul) : tuiles, y compris ceux que la silhouette
         ne dessine pas (avant-bras, fessiers). Toucher une tuile sélectionne le groupe. -->
    <div v-if="levels" class="mbody-tiles">
      <button
        v-for="m in LEVEL_MUSCLES"
        :key="m"
        type="button"
        class="mtile"
        :class="{ sel: selected === m }"
        :aria-pressed="selected === m"
        @click="selected = selected === m ? null : m"
      >
        <span class="mtile-dot" :style="{ background: color(m) }" />
        <span class="mtile-txt">{{ label(m) }}</span>
        <span class="mtile-lv font-display">{{ levels[m]?.level ?? 1 }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { fmtSets, muscleColor } from '@/lib/volume';
import { muscleLabel } from '@/lib/muscles';
import { LEVEL_MUSCLES, type MuscleLevel } from '@/lib/muscleLevels';

const props = defineProps<{
  series: Record<string, number>;
  /** Niveau par muscle (affichage seul) ; absent = pas de tuiles. */
  levels?: Record<string, MuscleLevel>;
}>();
const view = ref<'front' | 'back'>('front');
const selected = ref<string | null>(null);

const max = () => Math.max(1, ...Object.values(props.series));
const color = (m: string) => muscleColor(m);
function frac(m: string): number {
  return (props.series[m.toLowerCase()] ?? 0) / max();
}
// Attributs communs d'une zone musculaire : couleur + opacité ∝ volume + interaction.
function reg(m: string) {
  return {
    fill: muscleColor(m),
    'fill-opacity': (0.14 + 0.86 * frac(m)).toFixed(2),
    class: ['muscle', { sel: selected.value === m }],
    onClick: () => (selected.value = selected.value === m ? null : m),
  };
}
// Ancres du NOMBRE de séries par muscle (une valeur/groupe ; paires symétriques →
// nombre centré, bras/épaules → sur la forme visible). Coords dans le viewBox 120×250.
const FRONT_NUMS = [
  { m: 'épaules', x: 40, y: 48 },
  { m: 'pectoraux', x: 60, y: 59 },
  { m: 'biceps', x: 26, y: 74 },
  { m: 'abdominaux', x: 60, y: 88 },
  { m: 'quadriceps', x: 60, y: 138 },
  { m: 'mollets', x: 60, y: 188 },
];
const BACK_NUMS = [
  { m: 'épaules', x: 40, y: 48 },
  { m: 'dos', x: 60, y: 73 },
  { m: 'triceps', x: 26, y: 74 },
  { m: 'ischio-jambiers', x: 60, y: 140 },
  { m: 'mollets', x: 60, y: 188 },
];
const label = (m: string) => muscleLabel(m);
</script>

<style scoped>
.mbody {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.mbody-toggle {
  display: inline-flex;
  gap: 4px;
  background: var(--surface-2, #2b241b);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px;
}
.mbody-toggle button {
  border: none;
  background: none;
  color: var(--dim);
  font-weight: 700;
  font-size: 12px;
  padding: 4px 14px;
  border-radius: 999px;
  cursor: pointer;
}
.mbody-toggle button.on {
  background: var(--accent);
  color: #15120e;
}
.mbody-svg {
  width: 100%;
  max-width: 240px;
  height: auto;
  display: block;
}
.silhouette :is(ellipse, rect, path) {
  fill: var(--surface-2, #2b241b);
  stroke: var(--line);
  stroke-width: 0.8;
}
.muscle {
  cursor: pointer;
  stroke: rgba(0, 0, 0, 0.25);
  stroke-width: 0.5;
  transition: fill-opacity 0.2s;
}
.muscle.sel {
  stroke: var(--text);
  stroke-width: 1.6;
}
/* Nombre de séries sur le groupe : lisible quelle que soit la teinte (contour sombre
   + remplissage clair) ; ne capte pas les clics (le muscle dessous reste sélectionnable). */
.mnum {
  font-family: var(--font-display, inherit);
  font-size: 8px;
  font-weight: 800;
  fill: #f3eee6;
  stroke: #15120e;
  stroke-width: 1.6;
  paint-order: stroke;
  stroke-linejoin: round;
  pointer-events: none;
}
.mbody-pick {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-height: 18px;
}
.mbody-lv {
  color: var(--accent);
}
.mbody-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px;
  width: 100%;
  margin-top: 6px;
}
.mtile {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  min-width: 0;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2, #2b241b);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.mtile.sel {
  border-color: var(--accent);
}
.mtile-dot {
  flex: 0 0 7px;
  height: 7px;
  border-radius: 50%;
}
.mtile-txt {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.15;
  overflow-wrap: break-word;
}
/* Pastille ronde du niveau. */
.mtile-lv {
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface-3, #3a332a);
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.mbody-pick.dim {
  color: var(--dim);
  font-weight: 500;
}
</style>
