<template>
  <!-- 🔎 LÉGENDE ET FILTRES EN UN (demandé : filtrer plutôt que déplacer les exos, puis mettre
       les filtres SUR la légende qui existait déjà). Chaque pastille dit la couleur d'une zone
       de cases et jusqu'où elle va (légende), et filtre les exos dont c'est l'étape en cours
       (compte en gras). Toutes les étapes restent affichées, même vides : c'est aussi une
       légende — une étape vide est simplement inactive. -->
  <fieldset class="clf" aria-label="Légende des paliers et filtres des exercices">
    <button
      type="button"
      class="clf-chip wide"
      :class="{ on: modelValue === 'all' }"
      :aria-pressed="modelValue === 'all'"
      @click="emit('update:modelValue', 'all')"
    >
      <span class="clf-top">Tous</span>
      <span class="clf-sub"><b>{{ legs.length }}</b> exercices</span>
    </button>
    <button
      v-for="s in stages"
      :key="s.id"
      type="button"
      class="clf-chip"
      :class="['st-' + s.id, { on: modelValue === s.id, wide: s.id === 'done' }]"
      :aria-pressed="modelValue === s.id"
      :disabled="!s.n"
      @click="emit('update:modelValue', s.id)"
    >
      <span class="clf-top"><span class="clf-sw" /><span class="clf-l">{{ s.label }}</span></span>
      <span class="clf-sub"><b>{{ s.n }}</b> · {{ SUB[s.id] }}</span>
    </button>
  </fieldset>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { LEG_STAGES, legStage, type ComboLeg, type LegStage } from '@/lib/combo';

export type LegFilter = 'all' | LegStage;

const props = defineProps<{ legs: readonly ComboLeg[]; modelValue: LegFilter }>();
const emit = defineEmits<{ 'update:modelValue': [v: LegFilter] }>();

/** Ce que disait l'ancienne légende : jusqu'où va chaque zone de cases. */
const SUB: Record<LegStage, string> = {
  secondary: '≤ 80 %',
  principal: '≤ 100 %',
  bonus: '≤ 120 %',
  done: '120 % atteint',
};

const stages = computed(() =>
  LEG_STAGES.map((s) => ({ ...s, n: props.legs.filter((l) => legStage(l) === s.id).length })),
);

// Le filtre choisi se vide (le dernier exo de l'étape vient d'en sortir) : on revient à
// « Tous », sinon la liste paraît vide alors que le défi ne l'est pas.
watch(
  stages,
  (list) => {
    if (props.modelValue !== 'all' && !list.some((s) => s.id === props.modelValue && s.n > 0))
      emit('update:modelValue', 'all');
  },
  { immediate: true },
);
</script>

<style scoped lang="scss">
/* ⚠️ GRILLE DE 6 et non flex-wrap : les trois zones de la légende (Secondaire · Objectif ·
   Bonus) sur UNE ligne (demandé), « Tous » et « Terminés » sur la seconde — deux lignes à
   coup sûr, quelle que soit la longueur des comptes. Une zone prend 2 colonnes, une pastille
   de la 2e ligne 3. « Tous » passe en tête de 2e ligne par `order`, sans changer le DOM. */
.clf {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 5px;
  margin: 4px 0 10px;
  padding: 0;
  border: 0;
  min-width: 0;
}
.clf > .clf-chip {
  grid-column: span 2;
}
.clf > .clf-chip.wide {
  grid-column: span 3;
}
.clf > .clf-chip.wide:first-child {
  order: 1;
}
.clf > .st-done {
  order: 2;
}
.clf-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 0;
  min-height: 44px;
  padding: 2px 4px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.clf-chip:disabled {
  cursor: default;
  opacity: 0.55;
}
.clf-top {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  font-size: 11.5px;
  white-space: nowrap;
}
.clf-sub b {
  font-weight: 700;
  color: var(--dim);
}
.clf-sub {
  font-size: 10px;
  color: var(--dim);
  white-space: nowrap;
}
.clf-chip.on {
  border-color: var(--c, var(--accent));
  background: color-mix(in srgb, var(--c, var(--accent)) 16%, var(--surface));
}
.clf-chip.on .clf-sub b {
  color: var(--text);
}
.clf-l {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Le rectangle de l'ancienne légende : même forme et mêmes teintes que les cases faites. */
.clf-sw {
  flex: none;
  width: 12px;
  height: 8px;
  border-radius: 2px;
  background: var(--c);
}
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
