<template>
  <!-- ✏️ Corriger UNE série de tenue du Défi 360 (planche, chaise…) : ses secondes et son lest, ou
       la retirer. Les tenues n'ont pas de cases à toucher comme les séries : on y entre par la
       puce de la série (fiche du 360) ou par sa ligne d'historique. -->
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card v-if="leg && set" class="hse-card">
      <header class="hse-head">
        <div class="hse-title font-display">{{ leg.exercise_name }}</div>
        <div class="hse-desc">Série {{ (index ?? 0) + 1 }} · corriger</div>
      </header>

      <section class="hse-block" aria-label="Durée">
        <div class="hse-cap">Durée</div>
        <div class="hse-step">
          <button
            type="button"
            class="hse-pm"
            aria-label="5 secondes de moins"
            :disabled="sec <= HOLD_SEC_STEP"
            data-test="hold-edit-sec-minus"
            @click="bumpSec(-1)"
          >
            −
          </button>
          <div class="hse-val">
            <input
              v-model.number="sec"
              class="hse-num font-display"
              type="number"
              inputmode="numeric"
              min="1"
              aria-label="Durée en secondes"
              data-test="hold-edit-sec"
              @focus="selectAll"
            />
            <span class="hse-unit">s</span>
          </div>
          <button
            type="button"
            class="hse-pm"
            aria-label="5 secondes de plus"
            data-test="hold-edit-sec-plus"
            @click="bumpSec(1)"
          >
            +
          </button>
        </div>
      </section>

      <section v-if="lestable" class="hse-block" aria-label="Lest">
        <div class="hse-cap">🧱 Lest</div>
        <div class="hse-step">
          <button
            type="button"
            class="hse-pm"
            aria-label="Moins de lest"
            :disabled="lest <= 0"
            data-test="hold-edit-lest-minus"
            @click="bumpLest(-1)"
          >
            −
          </button>
          <div class="hse-val">
            <b class="hse-num font-display" data-test="hold-edit-lest">{{
              lest > 0 ? fmt(lest) : '—'
            }}</b>
            <span class="hse-unit">kg</span>
          </div>
          <button
            type="button"
            class="hse-pm"
            aria-label="Plus de lest"
            :disabled="lest >= HOLD_LEST_MAX"
            data-test="hold-edit-lest-plus"
            @click="bumpLest(1)"
          >
            +
          </button>
        </div>
        <div class="hse-sub">Vide = poids du corps · pas de 2,5 kg</div>
      </section>

      <div class="hse-actions">
        <button type="button" class="hse-remove" data-test="hold-edit-remove" @click="remove">
          🗑 Retirer
        </button>
        <button type="button" class="hse-save" data-test="hold-edit-save" @click="save">
          Enregistrer
        </button>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  HOLD_LEST_MAX,
  HOLD_LEST_STEP,
  HOLD_SEC_STEP,
  legHoldLoadable,
  legSets,
  type ComboLeg,
} from '@/lib/combo';
import { useComboStore } from '@/stores/combo';

const props = defineProps<{
  modelValue: boolean;
  comboId: string;
  leg: ComboLeg | null;
  /** Rang de la série dans `legSets(leg)`. */
  index: number | null;
}>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const $q = useQuasar();
const combo = useComboStore();
const set = computed(() =>
  props.leg && props.index != null ? legSets(props.leg)[props.index] : undefined,
);
const lestable = computed(() => !!props.leg && legHoldLoadable(props.leg));
const sec = ref(30);
const lest = ref(0);
const fmt = (w: number) => String(Math.round(w * 10) / 10).replace('.', ',');

// Reseed à chaque ouverture : les valeurs de la série touchée.
watch(
  () => [props.modelValue, props.index] as const,
  ([open]) => {
    if (!open || !set.value) return;
    sec.value = Math.max(1, Math.round(set.value.reps || 0));
    lest.value = set.value.lest ?? 0;
  },
  { immediate: true },
);

function selectAll(e: Event) {
  (e.target as HTMLInputElement).select();
}
function bumpSec(d: 1 | -1) {
  sec.value = Math.max(1, Math.round((sec.value || 0) + d * HOLD_SEC_STEP));
}
function bumpLest(d: 1 | -1) {
  lest.value = Math.min(HOLD_LEST_MAX, Math.max(0, Math.round((lest.value + d * HOLD_LEST_STEP) * 10) / 10));
}
function save() {
  if (!props.leg || props.index == null) return;
  combo.updateHoldSet(props.comboId, props.leg.exercise_id, props.index, sec.value, lest.value);
  emit('update:modelValue', false);
}
function remove() {
  const leg = props.leg;
  const index = props.index;
  if (!leg || index == null) return;
  $q.dialog({
    title: `Retirer la série ${index + 1} ?`,
    message: `« ${leg.exercise_name} » — ${set.value?.reps ?? ''} s`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Retirer', color: 'negative' },
  }).onOk(() => {
    combo.removeSet(props.comboId, leg.exercise_id, index);
    emit('update:modelValue', false);
  });
}
</script>

<style scoped>
.hse-card {
  width: min(360px, 94vw);
  padding: 14px 14px 16px;
  background: var(--surface);
  color: var(--text);
}
.hse-head {
  margin-bottom: 6px;
}
.hse-title {
  font-size: 20px;
  font-weight: 700;
}
.hse-desc {
  font-size: 12.5px;
  color: var(--dim);
}
.hse-block {
  margin-top: 12px;
  padding: 8px 10px 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-2);
}
.hse-cap {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--dim);
}
.hse-step {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
}
.hse-pm {
  width: 48px;
  height: 48px;
  flex: none;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}
.hse-pm:disabled {
  opacity: 0.4;
  cursor: default;
}
.hse-val {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.hse-num {
  width: 5ch;
  min-width: 0;
  text-align: center;
  font-size: 30px;
  font-weight: 700;
  color: var(--accent);
  background: transparent;
  border: 0;
  border-bottom: 1px dashed var(--line);
  padding: 0;
}
.hse-unit {
  font-size: 12px;
  color: var(--dim);
}
.hse-sub {
  margin-top: 4px;
  font-size: 11px;
  color: var(--dim);
}
.hse-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.hse-remove,
.hse-save {
  min-height: 48px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.hse-remove {
  flex: 0 0 auto;
  padding: 0 14px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
}
.hse-save {
  flex: 1;
  border: 0;
  background: var(--accent);
  color: #15120e;
}
</style>
