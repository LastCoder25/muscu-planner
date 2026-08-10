<template>
  <q-page class="combo-new">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="router.back()">‹</button>
      <div class="top-title font-display">Nouveau Défi 360</div>
      <div class="top-spacer" />
    </header>

    <p class="intro">
      Un défi <b>full-body sur 7 jours</b> : on dimensionne selon tes <b>séances visées</b> et ton
      <b>format</b>, puis tu fais tes <b>séries</b> quand tu veux dans la semaine.
    </p>

    <div v-if="loading" class="row flex-center q-pa-lg"><q-spinner color="primary" /></div>

    <template v-else>
      <!-- Curseurs de volume : séances/sem + format -->
      <div class="vol-card">
        <div class="vol-row">
          <span class="vol-lbl">Séances / semaine visées</span>
          <div class="stepper">
            <button type="button" @click="bumpSessions(-1)">−</button>
            <span class="stp-v font-display">{{ sessions }}</span>
            <button type="button" @click="bumpSessions(1)">+</button>
          </div>
        </div>
        <div class="vol-fmt">
          <span class="vol-lbl">Format</span>
          <div class="fmt-chips">
            <button
              v-for="f in formats"
              :key="f.id"
              type="button"
              class="fmt-chip"
              :class="{ on: formatId === f.id }"
              @click="pickFormat(f.id)"
            >
              {{ f.name }}
            </button>
          </div>
          <div class="fmt-sub">{{ currentSplit?.subtitle }}</div>
        </div>
        <div class="vol-summary">
          🎯 <b>{{ totalExos }}</b> exos · <b>{{ totalSets }}</b> séries / semaine
          <span class="vol-hint">(éditable exo par exo ci-dessous)</span>
        </div>
      </div>

      <div
        v-for="slot in COMBO_SLOTS"
        :key="slot.key"
        class="slot-card"
        :class="{ off: !enabled[slot.key] }"
      >
        <div class="slot-head">
          <span class="slot-emo">{{ slot.emoji }}</span>
          <div class="slot-main">
            <div class="slot-label font-display">
              {{ slot.label }}
              <span v-if="!slot.essential" class="slot-opt">option</span>
            </div>
            <div class="slot-hint">{{ slot.hint }}</div>
          </div>
          <q-toggle
            v-model="enabled[slot.key]"
            color="primary"
            :disable="!candidates(slot).length"
          />
        </div>

        <template v-if="enabled[slot.key]">
          <div v-if="!candidates(slot).length" class="no-ex">Aucun exo dispo (matériel).</div>
          <template v-else>
            <div class="ex-choices">
              <button
                v-for="e in selectedExos(slot.key)"
                :key="e.id"
                type="button"
                class="ex-chip on"
                @click="toggleExo(slot.key, e.id)"
              >
                {{ e.name }} <span class="ex-x">✕</span>
              </button>
              <button type="button" class="ex-add" @click="openPicker(slot.key)">
                + Choisir des exercices
              </button>
            </div>
            <div class="leg-cfg">
              <div class="cfg-row">
                <span class="cfg-lbl"
                  >Séries / semaine
                  <span class="cfg-note">{{ pickCount(slot.key) }} exo{{
                    pickCount(slot.key) > 1 ? 's' : ''
                  }}</span></span
                >
                <div class="stepper">
                  <button type="button" @click="bumpTarget(slot.key, -1)">−</button>
                  <span class="stp-v font-display">{{ picks[slot.key]?.target ?? 0 }}</span>
                  <button type="button" @click="bumpTarget(slot.key, 1)">+</button>
                </div>
              </div>
              <div v-if="pickCount(slot.key) > 1" class="cfg-split">
                ≈ {{ perExo(slot.key) }} séries / exo
              </div>
              <div class="cfg-row">
                <span class="cfg-lbl">Charge départ (kg, option)</span>
                <q-input
                  v-model.number="picks[slot.key]!.weight_kg"
                  type="number"
                  dense
                  filled
                  placeholder="—"
                  style="max-width: 90px"
                />
              </div>
            </div>
          </template>
        </template>
      </div>
    </template>

    <!-- Picker d'exercices (par pattern) : recherche + liste complète + multi-sélection -->
    <q-dialog
      :model-value="!!pickerSlot"
      position="bottom"
      @update:model-value="pickerSlot = null"
    >
      <q-card v-if="pickerSlotObj" class="picker-card">
        <div class="picker-title font-display">
          {{ pickerSlotObj.emoji }} {{ pickerSlotObj.label }}
        </div>
        <q-input
          v-model="pickerSearch"
          filled
          dense
          placeholder="Rechercher un exercice…"
          clearable
          class="q-mb-sm"
        />
        <div v-if="!pickerCandidates.length" class="picker-empty">Aucun exercice ne correspond.</div>
        <div v-else class="picker-list">
          <button
            v-for="e in pickerCandidates"
            :key="e.id"
            type="button"
            class="picker-row"
            :class="{ on: picks[pickerSlot!]?.exercise_ids.includes(e.id) }"
            @click="toggleExo(pickerSlot!, e.id)"
          >
            <q-icon v-if="favSet.has(e.id)" name="star" size="15px" color="primary" />
            <div class="pr-main">
              <div class="pr-name">{{ e.name }}</div>
              <div class="pr-meta">{{ e.muscle_primary }}</div>
            </div>
            <q-icon
              v-if="picks[pickerSlot!]?.exercise_ids.includes(e.id)"
              name="check_circle"
              color="primary"
              size="20px"
            />
          </button>
        </div>
        <div class="picker-foot">
          <span class="picker-count">{{ pickCount(pickerSlot!) }} sélectionné(s)</span>
          <q-btn flat no-caps label="Valider" color="primary" @click="pickerSlot = null" />
        </div>
      </q-card>
    </q-dialog>

    <div class="foot-bar">
      <div class="foot-info">{{ totalExos }} exo{{ totalExos > 1 ? 's' : '' }} · full-body</div>
      <q-btn
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="check"
        label="Créer le Défi 360"
        :loading="creating"
        :disable="totalExos === 0"
        @click="createCombo"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useLibraryStore, type ExerciseRow } from '@/stores/library';
import { useComboStore } from '@/stores/combo';
import { useChallengesStore, isCardioChallengeRow } from '@/stores/challenges';
import { COMBO_SLOTS, type ComboSlot } from '@/data/combo';
import { splitsFor, defaultSplit } from '@/data/splits';
import { suggestComboPlan, type ComboLeg } from '@/lib/combo';
import { repWeightFromExercise, isBodyweightExercise, logicalToday } from '@/lib/challenges';
import type { Level } from '@/lib/types';

const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const profileStore = useProfileStore();
const library = useLibraryStore();
const combo = useComboStore();
const challenges = useChallengesStore();

const lib = ref<ExerciseRow[]>([]);
const loading = ref(true);
const creating = ref(false);
const level = computed<Level>(() => profileStore.profile?.experience?.level ?? 'intermediaire');
const favSet = computed(() => new Set(profileStore.profile?.favorite_exercises ?? []));

// Curseurs de volume.
const sessions = ref(3);
const formatId = ref('');
const formats = computed(() => splitsFor(sessions.value));
const currentSplit = computed(
  () => formats.value.find((f) => f.id === formatId.value) ?? formats.value[0],
);

const enabled = reactive<Record<string, boolean>>({});
const picks = reactive<
  Record<string, { exercise_ids: string[]; target: number; weight_kg: number | null }>
>({});

// Picker d'exercices en modale (par pattern) : slot ouvert + recherche.
const pickerSlot = ref<string | null>(null);
const pickerSearch = ref('');
const pickerSlotObj = computed(() => COMBO_SLOTS.find((s) => s.key === pickerSlot.value) ?? null);
const pickerCandidates = computed<ExerciseRow[]>(() => {
  const slot = pickerSlotObj.value;
  if (!slot) return [];
  const n = pickerSearch.value.trim().toLowerCase();
  const all = candidates(slot);
  return n
    ? all.filter(
        (e) =>
          e.name.toLowerCase().includes(n) || (e.muscle_primary ?? '').toLowerCase().includes(n),
      )
    : all;
});
function openPicker(slotKey: string) {
  pickerSearch.value = '';
  pickerSlot.value = slotKey;
}

// Exos candidats d'un emplacement : reps, muscle_primary du slot, matériel possédé.
// Liste COMPLÈTE (favoris en tête) — le picker en modale la présente avec recherche.
function candidates(slot: ComboSlot): ExerciseRow[] {
  return lib.value
    .filter((e) => e.unit !== 'time' && slot.muscles.includes(e.muscle_primary ?? ''))
    .sort((a, b) => (favSet.value.has(b.id) ? 1 : 0) - (favSet.value.has(a.id) ? 1 : 0));
}
// Exos actuellement sélectionnés pour un emplacement (affichés en chips).
function selectedExos(slotKey: string): ExerciseRow[] {
  const ids = picks[slotKey]?.exercise_ids ?? [];
  return ids.map((id) => lib.value.find((e) => e.id === id)).filter((e): e is ExerciseRow => !!e);
}
function pickCount(slotKey: string): number {
  return picks[slotKey]?.exercise_ids.length ?? 0;
}
function perExo(slotKey: string): number {
  const p = picks[slotKey];
  const n = p?.exercise_ids.length ?? 0;
  return n > 0 ? Math.max(1, Math.round((p!.target ?? 0) / n)) : 0;
}
// Sélection multiple d'exos par pattern (min 1 quand l'emplacement est actif).
function toggleExo(slotKey: string, exId: string) {
  const p = picks[slotKey];
  if (!p) return;
  const i = p.exercise_ids.indexOf(exId);
  if (i >= 0) {
    if (p.exercise_ids.length > 1) p.exercise_ids.splice(i, 1);
  } else {
    p.exercise_ids.push(exId);
  }
}
function bumpTarget(slotKey: string, d: number) {
  const p = picks[slotKey];
  if (p) p.target = Math.max(3, p.target + d);
}
function bumpSessions(d: number) {
  sessions.value = Math.min(6, Math.max(2, sessions.value + d));
}
function pickFormat(id: string) {
  formatId.value = id;
  applyPlan();
}

const totalExos = computed(() =>
  COMBO_SLOTS.reduce((a, s) => a + (enabled[s.key] ? pickCount(s.key) : 0), 0),
);
const totalSets = computed(() =>
  COMBO_SLOTS.reduce((a, s) => a + (enabled[s.key] ? (picks[s.key]?.target ?? 0) : 0), 0),
);

// (Re)génère le volume par emplacement selon niveau + séances + format choisi.
// `COMBO_SLOTS` est structurellement compatible avec `ComboSlotSpec`.
function applyPlan() {
  const split = currentSplit.value;
  if (!split) return;
  const plan = suggestComboPlan(level.value, sessions.value, split.days, COMBO_SLOTS);
  for (const slot of COMBO_SLOTS) {
    const p = plan.find((x) => x.slot === slot.key);
    const cands = candidates(slot);
    enabled[slot.key] = !!p?.active && cands.length > 0;
    const nExos = Math.min(p?.nExos ?? 1, cands.length || 1);
    picks[slot.key] = {
      exercise_ids: cands.slice(0, Math.max(1, nExos)).map((e) => e.id),
      target: p?.weeklySets ?? 0,
      weight_kg: null,
    };
  }
}

// Changer le nb de séances peut changer les formats dispo → on recale sur le
// défaut puis on régénère (pickFormat gère le cas du changement de format seul).
watch(sessions, () => {
  formatId.value = defaultSplit(sessions.value, level.value).id;
  applyPlan();
});

async function createCombo() {
  const uid = auth.user?.id;
  if (!uid) return;
  // Exclusivité : pas de Défi 360 si un défi MUSCU est déjà actif.
  // TODO(cleanup avant release) : retirer le bypass `!auth.isAdmin` — débridage
  // TEMPORAIRE pour tester le Défi 360 en parallèle des défis muscu (compte admin).
  const activeMuscu = challenges.list.some(
    (c) => c.status === 'active' && !isCardioChallengeRow(c),
  );
  if (activeMuscu && !auth.isAdmin) {
    $q.notify({
      type: 'warning',
      message: 'Termine tes défis muscu en cours : le Défi 360 les remplace (1 seul programme).',
    });
    return;
  }
  const legs: ComboLeg[] = [];
  for (const slot of COMBO_SLOTS) {
    if (!enabled[slot.key]) continue;
    const p = picks[slot.key];
    if (!p?.exercise_ids.length) continue;
    // Volume du pattern réparti sur ses exos (min 1 série/exo).
    const perExoTarget = perExo(slot.key);
    for (const exId of p.exercise_ids) {
      const e = lib.value.find((x) => x.id === exId);
      if (!e) continue;
      legs.push({
        slot: slot.key,
        exercise_id: e.id,
        exercise_name: e.name,
        muscle_primary: e.muscle_primary,
        rep_weight: repWeightFromExercise(e.muscle_secondary, e.equipment_required),
        target: perExoTarget,
        weight_kg: p.weight_kg || null,
        assistable: isBodyweightExercise(e.equipment_required),
        sets: [],
      });
    }
  }
  if (!legs.length) return;
  creating.value = true;
  try {
    const c = await combo.create({
      name: 'Défi 360',
      start_date: logicalToday(),
      duration_days: 7,
      legs,
    });
    $q.notify({ type: 'positive', message: 'Défi 360 lancé 💪' });
    await router.replace(`/combo/${c.id}`);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    creating.value = false;
  }
}

onMounted(async () => {
  const uid = auth.user?.id;
  try {
    if (uid && !profileStore.profile) await profileStore.fetch(uid);
    if (challenges.list.length === 0) await challenges.fetchMine();
    if (combo.list.length === 0) await combo.fetchMine();
    lib.value = await library.fetchAll();
    // Défaut : 3 séances, format par défaut du niveau → plan appliqué.
    sessions.value = 3;
    formatId.value = defaultSplit(3, level.value).id;
    applyPlan();
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.combo-new {
  background: var(--bg);
  min-height: 100vh;
  padding: 0 16px 120px;
}
.top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
}
.iconbtn {
  background: none;
  border: none;
  color: var(--text);
  font-size: 28px;
  cursor: pointer;
  width: 32px;
}
.top-title {
  flex: 1;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
}
.top-spacer {
  width: 32px;
}
.intro {
  font-size: 13px;
  color: var(--dim);
  line-height: 1.5;
  margin: 0 0 14px;
}
.vol-card {
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 14px;
}
.vol-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.vol-lbl {
  font-size: 13px;
  color: var(--text);
  font-weight: 600;
}
.vol-fmt {
  margin-top: 14px;
}
.fmt-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.fmt-chip {
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--dim);
  font-size: 12.5px;
  cursor: pointer;
}
.fmt-chip.on {
  border-color: var(--accent);
  color: var(--accent);
}
.fmt-sub {
  font-size: 11.5px;
  color: var(--dim);
  margin-top: 6px;
}
.vol-summary {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line-soft);
  font-size: 13px;
  color: var(--text);
}
.vol-summary b {
  color: var(--accent);
}
.vol-hint {
  color: var(--dim);
  font-size: 11px;
}
.slot-card {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.slot-card.off {
  opacity: 0.55;
}
.slot-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.slot-emo {
  font-size: 24px;
}
.slot-main {
  flex: 1;
  min-width: 0;
}
.slot-label {
  font-weight: 700;
  font-size: 15px;
  color: var(--text);
}
.slot-opt {
  font-size: 10px;
  color: var(--dim);
  text-transform: uppercase;
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 1px 5px;
  margin-left: 4px;
}
.slot-hint {
  font-size: 11.5px;
  color: var(--dim);
}
.no-ex {
  font-size: 12px;
  color: var(--dim);
  margin-top: 8px;
}
.ex-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.ex-chip {
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--dim);
  font-size: 12.5px;
  cursor: pointer;
}
.ex-chip.on {
  border-color: var(--accent);
  color: var(--accent);
}
.ex-x {
  opacity: 0.7;
  font-size: 11px;
}
.ex-add {
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px dashed var(--line);
  background: transparent;
  color: var(--text);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
/* Picker d'exercices (modale bas d'écran) */
.picker-card {
  width: 100%;
  max-width: 520px;
  background: var(--surface);
  color: var(--text);
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  padding: 16px;
}
.picker-title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 12px;
}
.picker-empty {
  font-size: 13px;
  color: var(--dim);
  padding: 16px 4px;
}
.picker-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 52vh;
  overflow-y: auto;
}
.picker-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--line-soft);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.picker-row.on {
  border-color: var(--accent);
}
.pr-main {
  flex: 1;
  min-width: 0;
}
.pr-name {
  font-size: 14px;
  font-weight: 600;
}
.pr-meta {
  font-size: 11.5px;
  color: var(--dim);
}
.picker-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line-soft);
}
.picker-count {
  font-size: 12.5px;
  color: var(--dim);
}
.leg-cfg {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cfg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.cfg-lbl {
  font-size: 12.5px;
  color: var(--dim);
}
.cfg-note {
  color: var(--accent);
  font-weight: 700;
  margin-left: 4px;
}
.cfg-split {
  font-size: 11px;
  color: var(--dim);
  text-align: right;
}
.stepper {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stepper button {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.stp-v {
  min-width: 40px;
  text-align: center;
  font-size: 17px;
  font-weight: 700;
}
.foot-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: var(--bg);
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  gap: 12px;
}
.foot-info {
  flex: 1;
  font-size: 12.5px;
  color: var(--dim);
}
</style>
