<template>
  <!-- 🎨 Avancement du Défi 360 en TROIS BARRES SÉPARÉES : séries de base (argent, jusqu'à
       80 %), objectif (jaune, 80 → 100 %), bonus (vert, 100 → 120 %). Chaque barre se remplit
       de ce que les exos ont fait dans SA zone, sommé sur tous les exos ; le rose est le
       RETARD réel, réparti dans le vide de l'argent puis du jaune (`comboBarSegments`).
       🔎 Et ELLES FILTRENT (demandé, à la place d'une rangée de filtres) : toucher une barre
       ne garde que les exos qui travaillent dans sa zone, la retoucher réaffiche tout. Le
       libellé sous chaque barre sert à la fois de légende et de compte. -->
  <div class="cpb" :class="{ thin, filtering: modelValue !== 'all' }">
    <button
      v-for="z in zones"
      :key="z.id"
      type="button"
      class="cpb-hit"
      :class="['cpb-' + z.id, { on: modelValue === z.id }]"
      :style="{ flexGrow: z.len }"
      :aria-pressed="modelValue === z.id"
      :disabled="!counts[z.id]"
      :title="`Afficher les exercices en ${LABEL[z.id].toLowerCase()}`"
      @click="toggle(z.id)"
    >
      <span class="cpb-seg">
        <span class="cpb-fill" :style="{ width: z.fill + '%' }" />
        <span
          v-if="z.late > 0"
          class="cpb-late"
          :style="{ left: z.fill + '%', width: z.late + '%' }"
        />
        <i
          v-if="z.mark !== null"
          class="cpb-mark"
          :style="{ left: z.mark + '%' }"
          :title="`Pour être dans les temps : ${pace.onTimePct}%`"
        />
      </span>
      <span class="cpb-lab">{{ LABEL[z.id] }} <b>{{ counts[z.id] }}</b></span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import {
  comboBarSegments,
  legBarZone,
  type ComboBarZone,
  type ComboChallenge,
  type ComboLegFilter,
  type ComboPace,
} from '@/lib/combo';

const props = withDefaults(
  defineProps<{
    combo: ComboChallenge;
    pace: ComboPace;
    thin?: boolean;
    modelValue?: ComboLegFilter;
  }>(),
  { modelValue: 'all' },
);
const emit = defineEmits<{ 'update:modelValue': [v: ComboLegFilter] }>();

const LABEL: Record<ComboBarZone, string> = { sec: 'Secondaire', obj: 'Objectif', bonus: 'Bonus' };

// Remplissage, retard et trait : la règle vit dans la lib (`comboBarSegments`), testée.
const zones = computed(() => comboBarSegments(props.combo, props.pace));
const counts = computed(() => {
  const n: Record<ComboBarZone, number> = { sec: 0, obj: 0, bonus: 0 };
  for (const l of props.combo.legs) n[legBarZone(l)]++;
  return n;
});

function toggle(id: ComboBarZone): void {
  emit('update:modelValue', props.modelValue === id ? 'all' : id);
}

// La zone choisie se vide (son dernier exo vient d'en sortir) : on réaffiche tout, sinon la
// liste paraît vide alors que le défi ne l'est pas.
watch(
  counts,
  (n) => {
    if (props.modelValue !== 'all' && !n[props.modelValue]) emit('update:modelValue', 'all');
  },
  { immediate: true },
);
</script>

<style scoped lang="scss">
.cpb {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.cpb.thin {
  margin: 4px 0 2px;
}
/* Toute la colonne (barre + libellé) est la cible : 44 px au doigt, la barre reste fine.
   ⚠️ `min-width: max-content` : une barre ne descend JAMAIS sous la largeur de son libellé.
   Proportionnées 80 · 20 · 20, les barres jaune et verte ne faisaient que ~45 px dans la
   carte à 344 px, et « Objectif » était tronqué. C'est l'argent, le plus long, qui cède. */
.cpb-hit {
  flex-basis: 0;
  min-width: max-content;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--dim);
  font: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
}
.cpb-hit:disabled {
  cursor: default;
}
/* Un filtre actif : les autres barres s'effacent, la choisie ressort. */
.cpb.filtering .cpb-hit:not(.on) {
  opacity: 0.35;
}
.cpb-seg {
  position: relative;
  display: block;
  height: 10px;
  border-radius: 6px;
  overflow: hidden;
}
.cpb.thin .cpb-seg {
  height: 8px;
  border-radius: 5px;
}
.cpb-hit.on .cpb-seg {
  box-shadow: 0 0 0 2px var(--c);
}
.cpb-lab {
  font-size: 10.5px;
  white-space: nowrap;
  text-align: left;
}
.cpb-lab b {
  color: var(--text);
  font-weight: 700;
}
.cpb-hit.on .cpb-lab {
  color: var(--c);
}
/* Chaque barre porte sa couleur en pâle (vide) et en plein (fait). */
.cpb-sec {
  --c: var(--tier-sec);
}
.cpb-obj {
  --c: var(--accent);
}
.cpb-bonus {
  --c: var(--d1);
}
.cpb-sec .cpb-seg {
  background: color-mix(in srgb, var(--tier-sec) 10%, var(--surface-2));
}
.cpb-obj .cpb-seg {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
}
.cpb-bonus .cpb-seg {
  background: color-mix(in srgb, var(--d1) 14%, var(--surface-2));
}
.cpb-fill,
.cpb-late {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
}
.cpb-fill {
  background: var(--c);
}
.cpb-late {
  background: #ff6a9c;
}
/* Repère « dans les temps ». */
.cpb-mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--text);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  z-index: 2;
}
</style>
