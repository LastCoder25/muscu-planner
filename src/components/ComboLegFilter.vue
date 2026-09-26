<template>
  <!-- 🔎 Filtres du Défi 360 par ÉTAPE EN COURS (demandé : filtrer plutôt que déplacer les
       exos). Chaque pastille a la couleur des cases qu'il reste à faire dans cette étape, et
       son compte. Une étape vide n'est pas proposée : une pastille « 0 » n'apprend rien. -->
  <div class="clf" role="group" aria-label="Filtrer les exercices">
    <button
      type="button"
      class="clf-chip"
      :class="{ on: modelValue === 'all' }"
      :aria-pressed="modelValue === 'all'"
      @click="emit('update:modelValue', 'all')"
    >
      Tous <b>{{ legs.length }}</b>
    </button>
    <button
      v-for="s in shown"
      :key="s.id"
      type="button"
      class="clf-chip"
      :class="['st-' + s.id, { on: modelValue === s.id }]"
      :aria-pressed="modelValue === s.id"
      @click="emit('update:modelValue', s.id)"
    >
      <span class="clf-dot" /><span class="clf-l">{{ s.label }}</span> <b>{{ s.n }}</b>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { LEG_STAGES, legStage, type ComboLeg, type LegStage } from '@/lib/combo';

export type LegFilter = 'all' | LegStage;

const props = defineProps<{ legs: readonly ComboLeg[]; modelValue: LegFilter }>();
const emit = defineEmits<{ 'update:modelValue': [v: LegFilter] }>();

const shown = computed(() =>
  LEG_STAGES.map((s) => ({
    ...s,
    n: props.legs.filter((l) => legStage(l) === s.id).length,
  })).filter((s) => s.n > 0),
);

// Le filtre choisi se vide (le dernier exo de l'étape vient d'en sortir) : on revient à
// « Tous », sinon la liste paraît vide alors que le défi ne l'est pas.
watch(
  shown,
  (list) => {
    if (props.modelValue !== 'all' && !list.some((s) => s.id === props.modelValue))
      emit('update:modelValue', 'all');
  },
  { immediate: true },
);
</script>

<style scoped lang="scss">
/* ⚠️ GRILLE DE 3 COLONNES et non flex-wrap : 5 pastilles tiennent ainsi en DEUX lignes à
   coup sûr (demandé), quelle que soit la longueur des comptes. Mesuré à 344 px : le flux
   libre en prenait trois. */
.clf {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  margin: 4px 0 10px;
}
.clf-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  min-height: 44px;
  padding: 0 4px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
  white-space: nowrap;
}
.clf-chip b {
  font-weight: 700;
  color: var(--dim);
}
.clf-chip.on {
  border-color: var(--c, var(--accent));
  background: color-mix(in srgb, var(--c, var(--accent)) 16%, var(--surface));
}
.clf-chip.on b {
  color: var(--text);
}
.clf-l {
  overflow: hidden;
  text-overflow: ellipsis;
}
.clf-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--c);
}
/* Mêmes teintes que les cases (cf. ComboTierLegend). */
.st-secondary {
  --c: var(--tier-sec);
}
.st-principal {
  --c: var(--accent);
}
.st-bonus {
  --c: var(--d1);
}
.st-done {
  --c: var(--dim);
}
</style>
