<template>
  <!-- Historique des séries d'un exo du Défi 360. S'ouvre en touchant l'avancement
       « 2/12 séries », sur la fiche du 360 comme sur l'onglet 🎯 Défi 360 : un seul
       composant, sinon les deux listes finiraient par ne plus montrer la même chose. -->
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="hist-card">
      <div class="hist-title font-display">{{ leg?.exercise_name }}</div>
      <div class="hist-desc">
        {{ plainCount }} série{{ plainCount > 1 ? 's' : '' }}
        <template v-if="miniReps"> · {{ miniReps }} reps en mini-séries</template>
      </div>
      <div v-if="!lines.length" class="hist-empty">Aucune série enregistrée.</div>
      <div v-else class="hist-list">
        <div v-for="(l, i) in lines" :key="i" class="hist-row">
          <span class="hist-n">{{ lines.length - i }}</span>
          <!-- Mini-séries (« +1 ») d'un jour : UNE ligne, pas une par prise. -->
          <span v-if="l.kind === 'mini'" class="hist-main"
            >{{ miniLineLabel(l) }} <span class="hist-pill hist-mini">🔁 fractionné</span></span
          >
          <span v-else class="hist-main">
            {{ l.set.reps }} {{ unit }}
            <span v-if="l.set.weight" class="hist-pill hist-kg">{{ l.set.weight }} kg</span>
            <span v-if="l.set.assisted" class="hist-pill hist-asst">🟧 assisté</span>
            <span v-else-if="l.set.band" class="hist-pill hist-band"
              >🟦 élastique {{ elasticBandLabel(l.set.band).toLowerCase() }}</span
            >
            <!-- Série faite sur un autre exo, basculée ici par un changement d'exo. -->
            <span v-if="l.set.origin" class="hist-origin">↪ {{ setOriginLabel(leg!, l.set) }}</span>
          </span>
          <span class="hist-date">{{ fmtDay(l.kind === 'mini' ? l.date : l.set.date) }}</span>
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
import {
  groupSetLines,
  legMode,
  legSets,
  miniLineLabel,
  setOriginLabel,
  elasticBandLabel,
  type ComboLeg,
} from '@/lib/combo';

const props = defineProps<{ modelValue: boolean; leg: ComboLeg | null }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

// Les plus récentes en tête : c'est la dernière série qu'on vient vérifier.
// Mini-séries du fractionné regroupées par jour : une ligne « 7 reps · 6 prises ».
const lines = computed(() => (props.leg ? groupSetLines(legSets(props.leg)).reverse() : []));
const plainCount = computed(() => lines.value.filter((l) => l.kind === 'set').length);
const miniReps = computed(() =>
  lines.value.reduce((a, l) => a + (l.kind === 'mini' ? l.reps : 0), 0),
);
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
.hist-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 4px 8px;
  margin-left: 6px;
  border-radius: 999px;
  border: 1px solid var(--line);
  white-space: nowrap;
}
.hist-kg {
  color: var(--text);
}
.hist-band {
  color: var(--accent);
  border-color: var(--accent);
}
.hist-mini {
  color: var(--accent);
  border-color: var(--accent);
}
.hist-asst {
  color: var(--d3, #ffb23f);
  border-color: var(--d3, #ffb23f);
}
.hist-origin {
  display: block;
  font-size: 11px;
  color: var(--dim);
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
