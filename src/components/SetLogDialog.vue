<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="setlog-card">
      <div class="sl-title font-display">{{ title }}</div>
      <div class="sl-desc">{{ desc || 'reps & poids' }}</div>
      <div class="sl-row">
        <span class="sl-lbl">Reps</span>
        <q-input v-model.number="reps" type="number" filled dense style="max-width: 110px" />
      </div>
      <div class="sl-row">
        <span class="sl-lbl">Poids</span>
        <q-input
          v-model.number="weight"
          type="number"
          filled
          dense
          suffix="kg"
          style="max-width: 130px"
        />
        <span class="sl-hint">vide = PdC</span>
      </div>
      <div v-if="assistable" class="sl-row">
        <span class="sl-lbl">Assisté</span>
        <q-toggle v-model="assisted" />
        <span class="sl-hint">élastique → ×0,6</span>
      </div>
      <div class="sl-actions">
        <q-btn flat no-caps label="Annuler" @click="emit('update:modelValue', false)" />
        <q-btn
          unelevated
          color="primary"
          text-color="dark"
          no-caps
          label="Valider"
          @click="save"
        />
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
// Dialogue de saisie d'une SÉRIE (reps + poids + assisté), partagé par le Défi 360
// (ComboDetailPage) et les défis simples en mode Séries (ChallengeDetailPage).
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  title: string;
  desc?: string;
  assistable?: boolean;
  initialReps?: number;
  initialWeight?: number | null;
  initialAssisted?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [boolean];
  save: [{ reps: number; weight: number | null; assisted: boolean }];
}>();

const reps = ref(props.initialReps ?? 10);
const weight = ref<number | null>(props.initialWeight ?? null);
const assisted = ref(!!props.initialAssisted);

// Reseed les champs à chaque ouverture (préremplissage fourni par le parent).
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    reps.value = props.initialReps ?? 10;
    weight.value = props.initialWeight ?? null;
    assisted.value = !!props.initialAssisted;
  },
);

function save() {
  const r = Math.max(1, Math.round(reps.value || 0));
  const w = weight.value != null && weight.value > 0 ? weight.value : null;
  emit('save', { reps: r, weight: w, assisted: !!(props.assistable && assisted.value) });
  emit('update:modelValue', false);
}
</script>

<style scoped lang="scss">
.setlog-card {
  background: var(--surface);
  color: var(--text);
  padding: 18px 16px;
  border-radius: 16px;
  width: 320px;
  max-width: 92vw;
}
.sl-title {
  font-size: 18px;
  font-weight: 700;
}
.sl-desc {
  font-size: 12.5px;
  color: var(--dim);
  margin: 4px 0 14px;
}
.sl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.sl-lbl {
  font-size: 13px;
  color: var(--dim);
  min-width: 46px;
}
.sl-hint {
  font-size: 11px;
  color: var(--dim);
}
.sl-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
