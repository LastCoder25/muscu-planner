<template>
  <q-page class="combo-new">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="onBack">‹</button>
      <div class="top-title font-display">Nouveau Défi 360</div>
      <div class="top-spacer" />
    </header>

    <div v-if="loading" class="row flex-center q-pa-lg"><q-spinner color="primary" /></div>

    <template v-else>
      <!-- ÉTAPE 1 — RÉGLAGES : séances/sem + format (dimensionne le volume) -->
      <template v-if="step === 'setup'">
        <p class="intro">
          Un défi <b>full-body sur 7 jours</b> : on dimensionne selon tes <b>séances visées</b> et
          ton <b>format</b>, puis tu <b>choisis tes exercices</b> un par un.
        </p>
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
            🎯 tu choisiras <b>~{{ suggestedTotalExos }}</b> exercices (sur
            <b>{{ activeCount }}</b> emplacements) · <b>{{ totalSets }}</b> séries / semaine
          </div>
        </div>
        <div class="foot-bar">
          <div class="foot-info">{{ activeCount }} emplacement{{ activeCount > 1 ? 's' : '' }}</div>
          <q-btn
            color="primary"
            text-color="dark"
            no-caps
            size="lg"
            icon-right="arrow_forward"
            label="Choisir mes exercices"
            :disable="activeCount === 0"
            @click="startDraft"
          />
        </div>
      </template>

      <!-- ÉTAPE 2 — DRAFT : un emplacement à la fois, tuiles animées -->
      <template v-else-if="step === 'draft' && curSlot">
        <div class="draft-progress">
          <span>Emplacement {{ draftIndex + 1 }} / {{ draftKeys.length }}</span>
          <div class="dp-bar">
            <div class="dp-fill" :style="{ width: ((draftIndex + 1) / draftKeys.length) * 100 + '%' }" />
          </div>
        </div>

        <div class="draft-head">
          <span class="slot-emo">{{ curSlot.emoji }}</span>
          <div class="slot-main">
            <div class="slot-label font-display">
              {{ curSlot.label }}
              <span v-if="!curSlot.essential" class="slot-opt">option</span>
            </div>
            <div class="slot-hint">{{ curSlot.hint }}</div>
          </div>
        </div>
        <div class="draft-instr">
          <span>
            Choisis
            {{ suggestN(curKey) > 1 ? 'jusqu’à ' + suggestN(curKey) + ' exercices' : 'ton exercice' }}
          </span>
          <span class="di-note" :class="{ full: atCap(curKey) }">
            {{ pickCount(curKey) }}/{{ suggestN(curKey) }}
          </span>
        </div>

        <div class="tile-grid">
          <button
            v-for="e in candidates(curSlot)"
            :key="e.id"
            type="button"
            class="dtile"
            :class="{
              on: isSelected(curKey, e.id),
              muted: atCap(curKey) && !isSelected(curKey, e.id) && suggestN(curKey) > 1,
            }"
            @click="toggleExo(curKey, e.id)"
          >
            <div class="dtile-media">
              <ExerciseAnim
                v-if="hasAnim(e.id)"
                :exercise-id="e.id"
                :size="tileMedia"
                :title="e.name"
              />
              <img v-else-if="exImg(e.id)" :src="exImg(e.id)" :alt="e.name" loading="lazy" />
              <span v-else class="dtile-badge"><q-icon name="fitness_center" size="24px" /></span>
              <q-icon v-if="favSet.has(e.id)" name="star" size="15px" class="dtile-fav" />
              <div v-if="isSelected(curKey, e.id)" class="dtile-check">
                <q-icon name="check_circle" size="22px" />
              </div>
            </div>
            <div class="dtile-name">{{ e.name }}</div>
            <div class="dtile-mus">{{ e.muscle_primary }}</div>
          </button>
        </div>

        <div class="foot-bar draft-foot">
          <button type="button" class="draft-nav" @click="prevSlot">
            ‹ {{ draftIndex === 0 ? 'Réglages' : 'Précédent' }}
          </button>
          <button v-if="!curSlot.essential" type="button" class="draft-skip" @click="skipSlot">
            Passer
          </button>
          <q-btn
            color="primary"
            text-color="dark"
            no-caps
            :icon-right="isLastDraft ? 'checklist' : 'arrow_forward'"
            :label="isLastDraft ? 'Récap' : 'Suivant'"
            :disable="pickCount(curKey) === 0"
            @click="nextSlot"
          />
        </div>
      </template>

      <!-- ÉTAPE 3 — RÉCAP : volume/charge éditables + créer -->
      <template v-else>
        <p class="intro">Ajuste le <b>volume</b> et la <b>charge</b>, puis lance ton défi.</p>
        <div v-if="!recapKeys.length" class="no-ex">
          Aucun exercice choisi. <button class="link-btn" @click="step = 'draft'">Revenir au choix</button>
        </div>
        <div v-for="key in recapKeys" :key="key" class="slot-card">
          <div class="slot-head">
            <span class="slot-emo">{{ slotOf(key)?.emoji }}</span>
            <div class="slot-main">
              <div class="slot-label font-display">{{ slotOf(key)?.label }}</div>
              <div class="slot-hint">{{ pickCount(key) }} exo{{ pickCount(key) > 1 ? 's' : '' }}</div>
            </div>
            <button type="button" class="ex-add" @click="editSlot(key)">Modifier</button>
          </div>
          <div class="ex-choices">
            <span v-for="e in selectedExos(key)" :key="e.id" class="ex-chip on">{{ e.name }}</span>
          </div>
          <div class="leg-cfg">
            <div class="cfg-row">
              <span class="cfg-lbl">Séries / semaine</span>
              <div class="stepper">
                <button type="button" @click="bumpTarget(key, -1)">−</button>
                <span class="stp-v font-display">{{ picks[key]?.target ?? 0 }}</span>
                <button type="button" @click="bumpTarget(key, 1)">+</button>
              </div>
            </div>
            <div v-if="pickCount(key) > 1" class="cfg-split">≈ {{ perExo(key) }} séries / exo</div>
            <div class="cfg-row">
              <span class="cfg-lbl">Charge départ (kg, option)</span>
              <q-input
                v-model.number="picks[key]!.weight_kg"
                type="number"
                dense
                filled
                placeholder="—"
                style="max-width: 90px"
              />
            </div>
          </div>
        </div>
        <div class="foot-bar">
          <button type="button" class="draft-nav" @click="step = 'draft'">‹ Exercices</button>
          <q-btn
            color="primary"
            text-color="dark"
            no-caps
            size="lg"
            icon="check"
            label="Créer le Défi 360"
            :loading="creating"
            :disable="!recapKeys.length"
            @click="createCombo"
          />
        </div>
      </template>
    </template>
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
import { exerciseImage, exerciseFrames } from '@/data/exerciseImages';
import ExerciseAnim from '@/components/ExerciseAnim.vue';
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

const tileMedia = 104;

// Wizard : réglages → draft (choix des exos, un emplacement à la fois) → récap.
const step = ref<'setup' | 'draft' | 'recap'>('setup');

// Curseurs de volume.
const sessions = ref(3);
const formatId = ref('');
const formats = computed(() => splitsFor(sessions.value));
const currentSplit = computed(
  () => formats.value.find((f) => f.id === formatId.value) ?? formats.value[0],
);

const enabled = reactive<Record<string, boolean>>({}); // emplacement inclus dans le défi
const picks = reactive<
  Record<string, { exercise_ids: string[]; target: number; weight_kg: number | null }>
>({});
const planN = reactive<Record<string, number>>({}); // nb d'exos suggéré par le plan

// ── Draft (choix séquentiel) ──
const draftKeys = ref<string[]>([]);
const draftIndex = ref(0);
const curKey = computed(() => draftKeys.value[draftIndex.value] ?? '');
const curSlot = computed(() => COMBO_SLOTS.find((s) => s.key === curKey.value) ?? null);
const isLastDraft = computed(() => draftIndex.value === draftKeys.value.length - 1);
function slotOf(key: string) {
  return COMBO_SLOTS.find((s) => s.key === key) ?? null;
}
function suggestN(key: string): number {
  return Math.max(1, planN[key] ?? 1);
}

function startDraft() {
  draftKeys.value = COMBO_SLOTS.filter((s) => enabled[s.key]).map((s) => s.key);
  draftIndex.value = 0;
  step.value = 'draft';
}
function nextSlot() {
  if (isLastDraft.value) step.value = 'recap';
  else draftIndex.value++;
}
function prevSlot() {
  if (draftIndex.value === 0) step.value = 'setup';
  else draftIndex.value--;
}
function skipSlot() {
  enabled[curKey.value] = false;
  if (picks[curKey.value]) picks[curKey.value]!.exercise_ids = [];
  nextSlot();
}
function editSlot(key: string) {
  const i = draftKeys.value.indexOf(key);
  draftIndex.value = i >= 0 ? i : 0;
  step.value = 'draft';
}
function onBack() {
  if (step.value === 'recap') step.value = 'draft';
  else if (step.value === 'draft') step.value = 'setup';
  else router.back();
}

const hasAnim = (id: string) => !!exerciseFrames(id);
const exImg = (id: string) => exerciseImage(id);

// Exos candidats d'un emplacement : reps, muscle_primary du slot, matériel possédé
// (favoris en tête).
function candidates(slot: ComboSlot): ExerciseRow[] {
  return lib.value
    .filter((e) => e.unit !== 'time' && slot.muscles.includes(e.muscle_primary ?? ''))
    .sort((a, b) => (favSet.value.has(b.id) ? 1 : 0) - (favSet.value.has(a.id) ? 1 : 0));
}
function selectedExos(key: string): ExerciseRow[] {
  const ids = picks[key]?.exercise_ids ?? [];
  return ids.map((id) => lib.value.find((e) => e.id === id)).filter((e): e is ExerciseRow => !!e);
}
function isSelected(key: string, exId: string): boolean {
  return picks[key]?.exercise_ids.includes(exId) ?? false;
}
function pickCount(key: string): number {
  return picks[key]?.exercise_ids.length ?? 0;
}
function perExo(key: string): number {
  const p = picks[key];
  const n = p?.exercise_ids.length ?? 0;
  return n > 0 ? Math.max(1, Math.round((p!.target ?? 0) / n)) : 0;
}
// Sélection par emplacement, plafonnée au nombre suggéré (`suggestN`) :
//  - déjà choisi → on retire ;
//  - au plafond avec N=1 → l'exo choisi REMPLACE le précédent (façon radio) ;
//  - au plafond avec N>1 → on bloque (il faut déselectionner pour changer).
function toggleExo(key: string, exId: string) {
  const p = picks[key];
  if (!p) return;
  const i = p.exercise_ids.indexOf(exId);
  if (i >= 0) {
    p.exercise_ids.splice(i, 1);
  } else {
    const cap = suggestN(key);
    if (p.exercise_ids.length >= cap) {
      if (cap === 1) p.exercise_ids.splice(0, p.exercise_ids.length);
      else return; // plein : on garde la sélection actuelle
    }
    p.exercise_ids.push(exId);
  }
  enabled[key] = p.exercise_ids.length > 0;
}
function atCap(key: string): boolean {
  return pickCount(key) >= suggestN(key);
}
function bumpTarget(key: string, d: number) {
  const p = picks[key];
  if (p) p.target = Math.max(3, p.target + d);
}
function bumpSessions(d: number) {
  sessions.value = Math.min(6, Math.max(2, sessions.value + d));
}
function pickFormat(id: string) {
  formatId.value = id;
  applyPlan();
}

const activeCount = computed(() => COMBO_SLOTS.filter((s) => enabled[s.key]).length);
// Nb d'exos qu'on choisira (somme des suggestions des emplacements actifs).
const suggestedTotalExos = computed(() =>
  COMBO_SLOTS.reduce((a, s) => a + (enabled[s.key] ? suggestN(s.key) : 0), 0),
);
const totalSets = computed(() =>
  COMBO_SLOTS.reduce((a, s) => a + (enabled[s.key] ? (picks[s.key]?.target ?? 0) : 0), 0),
);
// Récap : emplacements inclus avec au moins un exo.
const recapKeys = computed(() =>
  COMBO_SLOTS.filter((s) => enabled[s.key] && pickCount(s.key) > 0).map((s) => s.key),
);

// (Re)génère le volume par emplacement selon niveau + séances + format choisi.
function applyPlan() {
  const split = currentSplit.value;
  if (!split) return;
  const plan = suggestComboPlan(level.value, sessions.value, split.days, COMBO_SLOTS);
  for (const slot of COMBO_SLOTS) {
    const p = plan.find((x) => x.slot === slot.key);
    const cands = candidates(slot);
    const active = !!p?.active && cands.length > 0;
    const nExos = Math.min(p?.nExos ?? 1, cands.length || 1);
    planN[slot.key] = Math.max(1, nExos);
    enabled[slot.key] = active;
    // Pré-sélection des favoris/premiers exos pour les emplacements actifs ;
    // vide pour les autres (le draft laisse choisir).
    picks[slot.key] = {
      exercise_ids: active ? cands.slice(0, Math.max(1, nExos)).map((e) => e.id) : [],
      target: p?.weeklySets ?? 0,
      weight_kg: null,
    };
  }
}

// Changer le nb de séances peut changer les formats dispo → recale sur le défaut.
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

/* ── Draft ── */
.draft-progress {
  font-size: 12px;
  color: var(--dim);
  margin-bottom: 12px;
}
.dp-bar {
  height: 5px;
  border-radius: 3px;
  background: var(--line-soft);
  margin-top: 6px;
  overflow: hidden;
}
.dp-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.25s ease;
}
.draft-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.draft-head .slot-emo {
  font-size: 26px;
}
.draft-instr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12px;
}
.di-note {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--dim);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px 10px;
}
.di-note.full {
  color: var(--bg);
  background: var(--accent);
  border-color: var(--accent);
}
.dtile.muted {
  opacity: 0.45;
}
.tile-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.dtile {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: var(--surface);
  border: 2px solid var(--line-soft);
  border-radius: 14px;
  padding: 8px;
  cursor: pointer;
  text-align: left;
}
.dtile.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.dtile-media {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.dtile-media img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.dtile-badge {
  color: var(--dim);
}
.dtile-fav {
  position: absolute;
  top: 6px;
  left: 6px;
  color: var(--accent);
}
.dtile-check {
  position: absolute;
  top: 4px;
  right: 4px;
  color: var(--accent);
  background: var(--surface);
  border-radius: 50%;
  line-height: 0;
}
.dtile-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  margin-top: 6px;
  line-height: 1.25;
}
.dtile-mus {
  font-size: 11px;
  color: var(--dim);
}
.draft-nav,
.draft-skip {
  background: none;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
  cursor: pointer;
}
.draft-skip {
  color: var(--dim);
}
.draft-foot {
  gap: 8px;
}

/* ── Récap ── */
.slot-card {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;
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
  font-size: 13px;
  color: var(--dim);
  margin: 8px 0;
}
.link-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
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
}
.ex-chip.on {
  border-color: var(--accent);
  color: var(--accent);
}
.ex-add {
  padding: 6px 11px;
  border-radius: 999px;
  border: 1px dashed var(--line);
  background: transparent;
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
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
  justify-content: space-between;
  gap: 12px;
}
.foot-info {
  flex: 1;
  font-size: 12.5px;
  color: var(--dim);
}
</style>
