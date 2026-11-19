<template>
  <!-- 🎯 Le muscle que vise un exo au temps (gainage, planche, chaise…) : « Abdos »,
       « Quadriceps », « Fessiers »… Un nom comme « Gainage » ne dit pas ce qu'on travaille. -->
  <span v-if="label" class="hmc" :title="'Muscle visé : ' + label" data-test="hold-muscle">{{
    label
  }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { holdMuscleLabel } from '@/lib/muscles';

const props = defineProps<{
  /** Muscle principal de l'exo (nom brut de la base). */
  muscle?: string | null;
  /** Seulement pour un exo au TEMPS : sinon rien (les exos en reps ont leur propre affichage). */
  time?: boolean;
}>();
const label = computed(() => (props.time ? holdMuscleLabel(props.muscle) : ''));
</script>

<style scoped>
.hmc {
  display: inline-flex;
  align-items: center;
  flex: none;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--accent);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  vertical-align: middle;
  white-space: nowrap;
}
</style>
