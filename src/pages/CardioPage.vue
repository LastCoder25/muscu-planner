<template>
  <q-page class="cardio-page">
    <h1 class="page-title font-display">Cardio</h1>
    <p class="page-sub text-dim">Marche, rando, course, trail, vélo…</p>

    <section class="card">
      <div class="card-head">
        <q-icon name="directions_run" size="22px" />
        <div class="card-title">Enregistrer une séance</div>
      </div>

      <!-- Activité -->
      <div class="section-lbl">Activité</div>
      <div class="chips">
        <button
          v-for="a in CARDIO_ACTIVITIES"
          :key="a.id"
          class="chip act"
          :class="{ on: activity === a.id }"
          @click="activity = a.id"
        >
          <q-icon :name="a.icon" size="16px" />{{ a.label }}
        </button>
      </div>

      <!-- Mode -->
      <div class="section-lbl">Type de séance</div>
      <div class="chips">
        <button class="chip" :class="{ on: mode === 'basique' }" @click="mode = 'basique'">
          Basique
        </button>
        <button class="chip" :class="{ on: mode === 'structuree' }" @click="mode = 'structuree'">
          Structurée (phases)
        </button>
      </div>

      <!-- Basique -->
      <template v-if="mode === 'basique'">
        <div class="fields">
          <q-input
            v-model.number="distance"
            type="number"
            filled
            label="Distance (km)"
            step="0.1"
          />
          <q-input v-model.number="duration" type="number" filled label="Durée (min)" />
        </div>
        <div v-if="pace" class="pace">Allure ≈ {{ pace }}</div>
      </template>

      <!-- Structurée : phases composables -->
      <template v-else>
        <div class="section-lbl">Phases</div>
        <div v-if="!phases.length" class="empty-phases">
          Ajoute des phases ci-dessous, dans l'ordre voulu.
        </div>

        <div v-for="(p, i) in phases" :key="i" class="phase" :class="'k-' + p.kind">
          <div class="phase-top">
            <span class="phase-name">{{ PHASE_LABELS[p.kind] }}</span>
            <div class="phase-actions">
              <button aria-label="Monter" :disabled="i === 0" @click="move(i, -1)">↑</button>
              <button
                aria-label="Descendre"
                :disabled="i === phases.length - 1"
                @click="move(i, 1)"
              >
                ↓
              </button>
              <button aria-label="Supprimer" class="del" @click="phases.splice(i, 1)">✕</button>
            </div>
          </div>

          <!-- Fractionné -->
          <div v-if="p.kind === 'intervalle'" class="phase-fields">
            <q-input v-model.number="p.reps" type="number" filled dense label="Répétitions" />
            <div class="pair">
              <q-input v-model.number="p.workVal" type="number" filled dense label="Effort" />
              <button class="unit" @click="p.workUnit = p.workUnit === 's' ? 'm' : 's'">
                {{ p.workUnit === 's' ? 'sec' : 'm' }}
              </button>
            </div>
            <div class="pair">
              <q-input
                v-model.number="p.restVal"
                type="number"
                filled
                dense
                label="Repos (0 = aucun)"
              />
              <button class="unit" @click="p.restUnit = p.restUnit === 's' ? 'm' : 's'">
                {{ p.restUnit === 's' ? 'sec' : 'm' }}
              </button>
            </div>
          </div>
          <!-- Phase simple -->
          <div v-else class="phase-fields">
            <q-input
              v-model.number="p.durationMin"
              type="number"
              filled
              dense
              label="Durée (min)"
            />
            <q-input
              v-model.number="p.distanceKm"
              type="number"
              filled
              dense
              label="Distance (km)"
              step="0.1"
            />
          </div>

          <div class="intens">
            <button
              v-for="it in INTENSITIES"
              :key="it"
              class="int-b"
              :class="{ on: p.intensity === it }"
              @click="p.intensity = it"
            >
              {{ INTENSITY_LABELS[it] }}
            </button>
          </div>
        </div>

        <div class="add-lbl">Ajouter une phase</div>
        <div class="chips">
          <button v-for="k in PHASE_KINDS" :key="k.id" class="chip add" @click="addPhase(k.id)">
            <q-icon :name="k.icon" size="15px" />{{ k.label }}
          </button>
        </div>

        <div v-if="phases.length" class="totals">
          Total ≈ {{ totals.duration_min }} min
          <template v-if="totals.distance_km > 0"> · {{ totals.distance_km }} km</template>
        </div>
      </template>

      <!-- D+ (extérieur) -->
      <q-input
        v-if="hasElevation"
        v-model.number="elevation"
        type="number"
        filled
        label="Dénivelé D+ (m)"
        class="q-mt-md"
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
        label="Enregistrer"
        :loading="saving"
        @click="save"
      />
    </section>

    <!-- Historique -->
    <section v-if="cardio.logs.length" class="card">
      <div class="card-head">
        <q-icon name="history" size="22px" />
        <div class="card-title">Mes séances</div>
      </div>
      <div v-for="l in cardio.logs" :key="l.id" class="log-row">
        <q-icon :name="ACTIVITY_ICONS[l.payload.activity]" size="20px" class="log-ic" />
        <div class="log-main">
          <div class="log-name">
            {{ ACTIVITY_LABELS[l.payload.activity] }}
            <span v-if="l.payload.mode === 'structuree'" class="tag">structurée</span>
          </div>
          <div class="log-meta">
            {{ fmtDate(l.performed_at) }}
            <template v-if="l.payload.distance_km"> · {{ l.payload.distance_km }} km</template>
            <template v-if="l.payload.duration_min"> · {{ l.payload.duration_min }} min</template>
            <template v-if="l.payload.elevation_m"> · {{ l.payload.elevation_m }} m D+</template>
            <template v-if="paceOf(l.payload)"> · {{ paceOf(l.payload) }}</template>
          </div>
          <div v-if="l.payload.phases?.length" class="log-phases">
            <span v-for="(ph, k) in l.payload.phases" :key="k" class="ph-chip">
              {{ PHASE_LABELS[ph.kind] }} {{ phaseSummary(ph) }}
            </span>
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
import {
  CARDIO_ACTIVITIES,
  ACTIVITY_LABELS,
  ACTIVITY_ICONS,
  activityHasElevation,
  PHASE_KINDS,
  PHASE_LABELS,
  INTENSITIES,
  INTENSITY_LABELS,
  paceLabel,
  sumPhases,
  phaseSummary,
} from '@/data/cardio';
import type {
  CardioActivity,
  CardioIntensity,
  CardioPhase,
  CardioPhaseKind,
  Difficulty,
  CardioLog,
} from '@/lib/types';
import { SCHEMA_VERSION } from '@/lib/types';

interface EditPhase {
  kind: CardioPhaseKind;
  intensity: CardioIntensity;
  durationMin: number | null;
  distanceKm: number | null;
  reps: number | null;
  workVal: number | null;
  workUnit: 's' | 'm';
  restVal: number | null;
  restUnit: 's' | 'm';
}

const $q = useQuasar();
const auth = useAuthStore();
const cardio = useCardioStore();

const activity = ref<CardioActivity>('course');
const mode = ref<'basique' | 'structuree'>('basique');
const distance = ref<number | null>(null);
const duration = ref<number | null>(null);
const elevation = ref<number | null>(null);
const rpe = ref<Difficulty | null>(null);
const comment = ref('');
const phases = ref<EditPhase[]>([]);
const saving = ref(false);

const hasElevation = computed(() => activityHasElevation(activity.value));
const pace = computed(() => paceLabel(distance.value ?? undefined, duration.value ?? undefined));
const paceOf = (l: CardioLog) => paceLabel(l.distance_km, l.duration_min);

const DEFAULT_INTENSITY: Record<CardioPhaseKind, CardioIntensity> = {
  echauffement: 'facile',
  endurance: 'modere',
  tempo: 'soutenu',
  effort: 'soutenu',
  intervalle: 'soutenu',
  recup: 'facile',
  retour_calme: 'facile',
};

function addPhase(kind: CardioPhaseKind) {
  phases.value.push({
    kind,
    intensity: DEFAULT_INTENSITY[kind],
    durationMin: kind === 'intervalle' ? null : 10,
    distanceKm: null,
    reps: kind === 'intervalle' ? 6 : null,
    workVal: kind === 'intervalle' ? 400 : null,
    workUnit: 'm',
    restVal: kind === 'intervalle' ? 60 : null,
    restUnit: 's',
  });
}
function move(i: number, dir: number) {
  const j = i + dir;
  if (j < 0 || j >= phases.value.length) return;
  const arr = phases.value;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
}

function toPhase(ep: EditPhase): CardioPhase {
  if (ep.kind === 'intervalle') {
    const p: CardioPhase = { kind: 'intervalle', intensity: ep.intensity, reps: ep.reps ?? 1 };
    if (ep.workUnit === 's' && ep.workVal) p.work_sec = ep.workVal;
    if (ep.workUnit === 'm' && ep.workVal) p.work_m = ep.workVal;
    if (ep.restVal) {
      if (ep.restUnit === 's') p.rest_sec = ep.restVal;
      else p.rest_m = ep.restVal;
    }
    return p;
  }
  const p: CardioPhase = { kind: ep.kind, intensity: ep.intensity };
  if (ep.durationMin) p.duration_sec = Math.round(ep.durationMin * 60);
  if (ep.distanceKm) p.distance_m = Math.round(ep.distanceKm * 1000);
  return p;
}

const totals = computed(() => sumPhases(phases.value.map(toPhase)));

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

onMounted(() => {
  cardio.fetchLogs().catch(() => undefined);
});

async function save() {
  const userId = auth.user?.id;
  if (!userId) return;

  let built: CardioPhase[] = [];
  let dist = distance.value ?? undefined;
  let dur = duration.value ?? undefined;

  if (mode.value === 'structuree') {
    if (!phases.value.length) {
      $q.notify({ type: 'warning', message: 'Ajoute au moins une phase.' });
      return;
    }
    built = phases.value.map(toPhase);
    const t = sumPhases(built);
    dur = t.duration_min || undefined;
    dist = t.distance_km || undefined;
  } else if (!dist && !dur) {
    $q.notify({ type: 'warning', message: 'Renseigne une distance ou une durée.' });
    return;
  }

  saving.value = true;
  try {
    const log: CardioLog = {
      schema_version: SCHEMA_VERSION,
      type: 'cardio_log',
      id: crypto.randomUUID(),
      activity: activity.value,
      mode: mode.value,
      performed_at: new Date().toISOString(),
      ...(dist ? { distance_km: dist } : {}),
      ...(dur ? { duration_min: dur } : {}),
      ...(elevation.value && hasElevation.value ? { elevation_m: elevation.value } : {}),
      ...(rpe.value ? { rpe: rpe.value } : {}),
      ...(built.length ? { phases: built } : {}),
      ...(comment.value.trim() ? { comment: comment.value.trim() } : {}),
    };
    await cardio.addLog(userId, log);
    $q.notify({ type: 'positive', message: 'Séance enregistrée.' });
    distance.value = null;
    duration.value = null;
    elevation.value = null;
    rpe.value = null;
    comment.value = '';
    phases.value = [];
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
    title: 'Supprimer la séance',
    message: 'Cette séance sera supprimée. Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    void cardio
      .remove(id)
      .then(() => $q.notify({ type: 'positive', message: 'Séance supprimée.' }));
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
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
.chip.add {
  border-style: dashed;
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
.empty-phases {
  color: var(--dim);
  font-size: 13px;
  padding: 8px 0;
}
.phase {
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
  background: var(--surface-2);
}
.phase-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.phase-name {
  font-weight: 600;
  color: var(--text);
}
.phase-actions {
  display: flex;
  gap: 4px;
}
.phase-actions button {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.phase-actions button:disabled {
  opacity: 0.35;
}
.phase-actions .del {
  color: var(--d4);
}
.phase-fields {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.phase-fields > * {
  flex: 1;
  min-width: 90px;
}
.pair {
  display: flex;
  gap: 6px;
  align-items: stretch;
}
.pair .q-input {
  flex: 1;
}
.unit {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--accent);
  font-weight: 700;
  font-size: 12px;
  min-width: 42px;
  cursor: pointer;
}
.intens {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.int-b {
  flex: 1;
  padding: 5px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.int-b.on {
  border-color: var(--accent);
  color: var(--accent);
}
.add-lbl {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin: 12px 0 8px;
}
.totals {
  margin-top: 12px;
  color: var(--accent);
  font-weight: 600;
  font-size: 14px;
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
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
.log-ic {
  color: var(--accent);
  margin-top: 2px;
}
.log-main {
  flex: 1;
}
.log-name {
  font-weight: 600;
  color: var(--text);
}
.tag {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--dim);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 1px 6px;
  margin-left: 6px;
}
.log-meta {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.log-phases {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.ph-chip {
  font-size: 11px;
  color: var(--dim);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 1px 6px;
}
.log-del {
  background: none;
  border: none;
  color: var(--d4);
  cursor: pointer;
  padding: 4px;
}
</style>
