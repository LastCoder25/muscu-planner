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
      </g>
    </svg>

    <div v-if="selected" class="mbody-pick" :style="{ color: color(selected) }">
      {{ label(selected) }} — <b>{{ series[selected] ?? 0 }}</b> série{{
        (series[selected] ?? 0) > 1 ? 's' : ''
      }}
    </div>
    <div v-else class="mbody-pick dim">Touche un groupe musculaire</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { muscleColor } from '@/lib/volume';

const props = defineProps<{ series: Record<string, number> }>();
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
const LABELS: Record<string, string> = {
  pectoraux: 'Pectoraux',
  épaules: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  dos: 'Dos',
  abdominaux: 'Abdominaux',
  quadriceps: 'Quadriceps',
  'ischio-jambiers': 'Ischio / fessiers',
  mollets: 'Mollets',
};
const label = (m: string) => LABELS[m] ?? m;
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
.mbody-pick {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-height: 18px;
}
.mbody-pick.dim {
  color: var(--dim);
  font-weight: 500;
}
</style>
