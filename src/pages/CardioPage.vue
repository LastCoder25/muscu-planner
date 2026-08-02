<template>
  <q-page class="cardio-page">
    <h1 class="page-title font-display">Cardio</h1>
    <p class="page-sub text-dim">Course à pied &amp; trail.</p>

    <!-- Enregistrer une sortie -->
    <section class="card">
      <div class="card-head">
        <q-icon name="directions_run" size="22px" />
        <div class="card-title">Enregistrer une sortie</div>
      </div>

      <div class="section-lbl">Type</div>
      <div class="chips">
        <button
          v-for="t in RUN_TYPES"
          :key="t"
          class="chip"
          :class="{ on: runType === t }"
          @click="runType = t"
        >
          {{ RUN_TYPE_LABELS[t] }}
        </button>
      </div>

      <div class="fields">
        <q-input v-model.number="distance" type="number" filled label="Distance (km)" step="0.1" />
        <q-input v-model.number="duration" type="number" filled label="Durée (min)" />
        <q-input
          v-if="runType === 'trail'"
          v-model.number="elevation"
          type="number"
          filled
          label="Dénivelé D+ (m)"
        />
      </div>

      <div v-if="pace" class="pace">Allure ≈ {{ pace }}</div>

      <q-input
        v-if="runType === 'fractionne'"
        v-model="intervals"
        filled
        label="Structure (ex. 10×400 m / 1 min)"
        class="q-mt-sm"
      />

      <div class="section-lbl">Ressenti</div>
      <div class="rate-btns">
        <button
          v-for="n in 4"
          :key="n"
          class="rate-b"
          :class="{ on: rpe === n }"
          :style="{ '--c': `var(--d${n})` }"
          @click="rpe = n as Difficulty"
        >
          {{ n }}
        </button>
      </div>

      <q-input
        v-model="comment"
        type="textarea"
        autogrow
        filled
        label="Commentaire"
        class="q-mt-sm"
      />

      <q-btn
        class="save full-width"
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="check"
        label="Enregistrer la sortie"
        :loading="saving"
        @click="save"
      />
    </section>

    <!-- Historique -->
    <section v-if="cardio.logs.length" class="card">
      <div class="card-head">
        <q-icon name="history" size="22px" />
        <div class="card-title">Mes sorties</div>
      </div>
      <div v-for="l in cardio.logs" :key="l.id" class="log-row">
        <q-icon :name="icon(l.payload.run_type)" size="20px" class="log-ic" />
        <div class="log-main">
          <div class="log-name">{{ RUN_TYPE_LABELS[l.payload.run_type] }}</div>
          <div class="log-meta">
            {{ fmtDate(l.performed_at) }}
            <template v-if="l.payload.distance_km"> · {{ l.payload.distance_km }} km</template>
            <template v-if="l.payload.duration_min"> · {{ l.payload.duration_min }} min</template>
            <template v-if="l.payload.elevation_m"> · {{ l.payload.elevation_m }} m D+</template>
            <template v-if="paceOf(l.payload)"> · {{ paceOf(l.payload) }}</template>
          </div>
        </div>
        <button class="log-del" aria-label="Supprimer" @click="remove(l.id)">
          <q-icon name="delete_outline" size="18px" />
        </button>
      </div>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCardioStore } from '@/stores/cardio';
import { RUN_TYPES, RUN_TYPE_LABELS, RUN_TYPE_ICONS, paceLabel } from '@/data/cardio';
import type { RunType, Difficulty, CardioLog } from '@/lib/types';
import { SCHEMA_VERSION } from '@/lib/types';

const $q = useQuasar();
const auth = useAuthStore();
const cardio = useCardioStore();

const runType = ref<RunType>('footing');
const distance = ref<number | null>(null);
const duration = ref<number | null>(null);
const elevation = ref<number | null>(null);
const rpe = ref<Difficulty | null>(null);
const intervals = ref('');
const comment = ref('');
const saving = ref(false);

const pace = computed(() => paceLabel(distance.value ?? undefined, duration.value ?? undefined));
const icon = (t: RunType) => RUN_TYPE_ICONS[t];
const paceOf = (l: CardioLog) => paceLabel(l.distance_km, l.duration_min);

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

onMounted(() => {
  cardio.fetchLogs().catch(() => undefined);
});

async function save() {
  const userId = auth.user?.id;
  if (!userId) return;
  if (!distance.value && !duration.value) {
    $q.notify({ type: 'warning', message: 'Renseigne au moins une distance ou une durée.' });
    return;
  }
  saving.value = true;
  try {
    const log: CardioLog = {
      schema_version: SCHEMA_VERSION,
      type: 'cardio_log',
      id: crypto.randomUUID(),
      run_type: runType.value,
      performed_at: new Date().toISOString(),
      ...(distance.value ? { distance_km: distance.value } : {}),
      ...(duration.value ? { duration_min: duration.value } : {}),
      ...(elevation.value && runType.value === 'trail' ? { elevation_m: elevation.value } : {}),
      ...(rpe.value ? { rpe: rpe.value } : {}),
      ...(intervals.value.trim() && runType.value === 'fractionne'
        ? { intervals: intervals.value.trim() }
        : {}),
      ...(comment.value.trim() ? { comment: comment.value.trim() } : {}),
    };
    await cardio.addLog(userId, log);
    $q.notify({ type: 'positive', message: 'Sortie enregistrée.' });
    distance.value = null;
    duration.value = null;
    elevation.value = null;
    rpe.value = null;
    intervals.value = '';
    comment.value = '';
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Enregistrement impossible.',
    });
  } finally {
    saving.value = false;
  }
}

function remove(id: string) {
  $q.dialog({
    title: 'Supprimer la sortie',
    message: 'Cette sortie sera supprimée. Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    void cardio
      .remove(id)
      .then(() => $q.notify({ type: 'positive', message: 'Sortie supprimée.' }));
  });
}
</script>

<style scoped lang="scss">
.cardio-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.page-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.page-sub {
  margin: 4px 0 20px;
}
.text-dim {
  color: var(--dim);
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.card-head .q-icon {
  color: var(--accent);
}
.card-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 18px;
  color: var(--text);
}
.section-lbl {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin: 14px 0 8px;
}
.chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.chip.on {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
}
.fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.pace {
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  margin-top: 8px;
}
.rate-btns {
  display: flex;
  gap: 10px;
}
.rate-b {
  flex: 1;
  height: 46px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}
.rate-b.on {
  border-color: var(--c);
  background: var(--c);
  color: #15120e;
}
.save {
  border-radius: 12px;
  margin-top: 16px;
}
.log-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
.log-ic {
  color: var(--accent);
}
.log-main {
  flex: 1;
}
.log-name {
  font-weight: 600;
  color: var(--text);
}
.log-meta {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.log-del {
  background: none;
  border: none;
  color: var(--d4);
  cursor: pointer;
  padding: 4px;
}
</style>
