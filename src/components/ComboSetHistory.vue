<template>
  <!-- Historique des séries d'un exo du Défi 360. S'ouvre en touchant l'avancement
       « 2/12 séries », sur la fiche du 360 comme sur l'onglet 🎯 Défi 360 : un seul
       composant, sinon les deux listes finiraient par ne plus montrer la même chose. -->
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="hist-card">
      <div class="hist-title font-display">{{ leg?.exercise_name }}</div>
      <div class="hist-desc">{{ sets.length }} série{{ sets.length > 1 ? 's' : '' }}</div>
      <div v-if="!sets.length" class="hist-empty">Aucune série enregistrée.</div>
      <div v-else class="hist-list">
        <div v-for="(s, i) in sets" :key="i" class="hist-row">
          <span class="hist-n">{{ sets.length - i }}</span>
          <span class="hist-main">
            {{ s.reps }} {{ unit }}<template v-if="s.weight"> · {{ s.weight }} kg</template>
            <span v-if="s.assisted" class="hist-asst">assisté</span>
          </span>
          <span class="hist-date">{{ fmtDay(s.date) }}</span>
        </div>
      </div>
      <div class="hist-actions">
        <q-btn flat no-caps label="Fermer" @click="emit('update:modelValue', false)" />
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { legMode, legSets, type ComboLeg } from '@/lib/combo';

const props = defineProps<{ modelValue: boolean; leg: ComboLeg | null }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

// Les plus récentes en tête : c'est la dernière série qu'on vient vérifier.
const sets = computed(() => (props.leg ? [...legSets(props.leg)].reverse() : []));
// Un exo au TEMPS (gainage) compte des secondes, pas des reps.
const unit = computed(() => (props.leg && legMode(props.leg) === 'time' ? 's' : 'reps'));

function fmtDay(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}
</script>

<style scoped lang="scss">
.hist-card {
  background: var(--surface);
  color: var(--text);
  padding: 18px 16px;
  border-radius: 16px;
  width: 320px;
  max-width: 92vw;
}
.hist-title {
  font-size: 18px;
  font-weight: 700;
}
.hist-desc {
  font-size: 12.5px;
  color: var(--dim);
  margin: 4px 0 14px;
}
.hist-empty {
  color: var(--dim);
  font-size: 13px;
  padding: 8px 0;
}
.hist-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}
.hist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--surface-2);
}
.hist-n {
  min-width: 20px;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--accent);
}
.hist-main {
  flex: 1;
  font-size: 13px;
  color: var(--text);
}
.hist-asst {
  font-size: 10px;
  color: var(--d3, #ffb23f);
  margin-left: 6px;
}
.hist-date {
  font-size: 11px;
  color: var(--dim);
}
.hist-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
</style>
