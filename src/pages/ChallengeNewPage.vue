<template>
  <q-page class="cn-page">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="prev">‹</button>
      <div class="top-mid">
        <div class="top-title font-display">Nouveau challenge</div>
        <div class="top-step">
          Étape {{ step }}/{{ STEP_TITLES.length }} · {{ STEP_TITLES[step - 1] }}
        </div>
      </div>
      <div class="top-spacer" />
    </header>

    <div class="progress">
      <div class="progress-fill" :style="{ width: (step / STEP_TITLES.length) * 100 + '%' }" />
    </div>

    <div class="scroll">
      <!-- ÉTAPE 1 · Exercice -->
      <template v-if="step === 1">
        <div class="step-h">Choisis un exercice</div>
        <q-input
          v-model="search"
          filled
          dense
          placeholder="Rechercher un exercice…"
          class="q-mb-sm"
          clearable
        />
        <div v-if="loadingLib" class="row flex-center q-pa-md"><q-spinner color="primary" /></div>
        <div v-else class="ex-list">
          <button
            v-for="e in filteredLib"
            :key="e.id"
            class="ex-row"
            :class="{ sel: exercise?.id === e.id }"
            @click="pickExercise(e)"
          >
            <q-icon v-if="favSet.has(e.id)" name="star" size="16px" color="primary" class="fav" />
            <q-icon
              v-else-if="sugIndex.has(e.id)"
              name="local_fire_department"
              size="15px"
              color="primary"
              class="fav"
            />
            <div class="ex-main">
              <div class="ex-name">{{ e.name }}</div>
              <div class="ex-meta">
                {{ e.muscle_primary }} · {{ e.unit === 'time' ? 'temps' : 'reps' }}
              </div>
            </div>
            <q-icon v-if="exercise?.id === e.id" name="check_circle" color="primary" size="20px" />
          </button>
        </div>

        <!-- Exécution + descriptif de l'exo sélectionné -->
        <div v-if="exercise" class="ex-detail">
          <div class="exd-head">
            <img v-if="exoImg" :src="exoImg" :alt="exercise.name" class="exd-img" />
            <div>
              <div class="exd-name font-display">{{ exercise.name }}</div>
              <div class="exd-meta">
                {{ exercise.muscle_primary }} ·
                {{ unit === 'time' ? 'gainage (temps)' : 'répétitions' }}
              </div>
            </div>
          </div>
          <template v-if="guide">
            <div class="exd-sec">Exécution</div>
            <ol class="exd-steps">
              <li v-for="(s, i) in guide.steps" :key="i">{{ s }}</li>
            </ol>
            <div v-if="guide.tip" class="exd-tip">💡 {{ guide.tip }}</div>
          </template>
          <div v-else class="exd-none">Pas de descriptif pour cet exercice.</div>
        </div>
      </template>

      <!-- ÉTAPE 2 · Format -->
      <template v-else-if="step === 2">
        <div class="step-h">Quel format ?</div>
        <div class="fmt-grid">
          <button
            v-for="f in CHALLENGE_FORMATS"
            :key="f.id"
            class="fmt"
            :class="{ sel: format === f.id }"
            @click="selectFormat(f.id)"
          >
            <q-icon :name="f.icon" size="22px" />
            <div class="fmt-name">{{ f.name }}</div>
            <div class="fmt-desc">{{ f.desc }}</div>
          </button>
        </div>
      </template>

      <!-- ÉTAPE 3 · Durée -->
      <template v-else-if="step === 3">
        <div class="step-h">Sur combien de temps ?</div>
        <div class="dur-grid">
          <button
            v-for="d in DURATIONS"
            :key="d"
            class="choice"
            :class="{ active: !customOn && durationDays === d }"
            @click="setPresetDuration(d)"
          >
            {{ durationLabel(d) }}
          </button>
          <button class="choice" :class="{ active: customOn }" @click="enableCustom">Perso</button>
        </div>
        <div v-if="customOn" class="custom-dur">
          <q-input
            v-model.number="customDays"
            type="number"
            inputmode="numeric"
            filled
            dense
            style="max-width: 120px"
            @update:model-value="applyCustom"
          />
          <span class="lbl" style="margin: 0">jours (1–365)</span>
        </div>
      </template>

      <!-- ÉTAPE 4 · Réglages -->
      <template v-else-if="step === 4">
        <div class="step-h">Difficulté & options</div>
        <div class="lbl">Difficulté ({{ levelLabel }})</div>
        <div class="cfg-grid q-mb-md">
          <template v-for="field in fields" :key="field">
            <div class="cfg-cell">
              <div class="cfg-lbl">{{ fieldLabel(field) }}</div>
              <div v-if="stepBounds[field]" class="stepper">
                <button
                  class="st-btn"
                  aria-label="Diminuer"
                  @click="stepField(field, -stepBounds[field].step)"
                >
                  −
                </button>
                <span class="st-val">{{ cfgDisplay(field) }} %</span>
                <button
                  class="st-btn"
                  aria-label="Augmenter"
                  @click="stepField(field, stepBounds[field].step)"
                >
                  +
                </button>
              </div>
              <q-input
                v-else
                :model-value="cfgDisplay(field)"
                type="number"
                filled
                dense
                @update:model-value="setField(field, $event)"
              />
            </div>
          </template>
        </div>

        <div class="lbl">Jours de repos (optionnel)</div>
        <div class="days q-mb-md">
          <button
            v-for="w in WEEKDAYS"
            :key="w.value"
            class="choice small"
            :class="{ active: restDays.includes(w.value) }"
            @click="toggleRest(w.value)"
          >
            {{ w.label }}
          </button>
        </div>

        <div class="row items-center q-mb-md" style="gap: 10px">
          <q-toggle v-model="reminderOn" />
          <span class="lbl" style="margin: 0">Rappel quotidien</span>
          <q-input
            v-if="reminderOn"
            v-model="reminderTime"
            type="time"
            filled
            dense
            style="max-width: 130px"
          />
        </div>

        <div v-if="format !== 'cumulative'" class="carry q-mb-md">
          <div class="row items-center" style="gap: 10px">
            <q-toggle v-model="carryOver" />
            <span class="lbl" style="margin: 0">Report réserve / dette</span>
          </div>
          <div class="carry-note">
            Si tu fais plus ou moins que l’objectif un jour, l’écart est reporté : ton avance allège
            les jours suivants, ton retard s’y ajoute.
          </div>
        </div>
      </template>

      <!-- ÉTAPE 5 · Récap -->
      <template v-else>
        <div class="step-h">Récapitulatif</div>
        <div class="recap">
          <div class="recap-row">
            <span>Exercice</span><b>{{ exercise?.name }}</b>
          </div>
          <div class="recap-row">
            <span>Format</span><b>{{ formatOption(format)?.name }}</b>
          </div>
          <div class="recap-row">
            <span>Durée</span><b>{{ durationDays }} jours</b>
          </div>
          <div class="recap-row" v-if="restDays.length">
            <span>Repos</span><b>{{ restDays.length }} j/sem</b>
          </div>
          <div class="recap-row" v-if="reminderOn">
            <span>Rappel</span><b>{{ reminderTime }}</b>
          </div>
          <div class="recap-row" v-if="carryOver && format !== 'cumulative'">
            <span>Report</span><b>activé</b>
          </div>
        </div>

        <div class="preview">
          <div class="prev-h">Aperçu ({{ unitLabel }})</div>
          <div class="prev-bars">
            <div
              v-for="(t, i) in previewTargets"
              :key="i"
              class="prev-bar"
              :style="{ height: barH(t) + '%' }"
              :title="`J${i + 1} : ${t}`"
            />
          </div>
          <div class="prev-sub">
            <template v-if="format === 'cumulative'"
              >Total : <b>{{ config.total }}</b> {{ unitLabel }} en {{ durationDays }} j</template
            >
            <template v-else
              >{{ activeDaysCount }} jours actifs · total ~<b>{{ totalPlanned }}</b>
              {{ unitLabel }}</template
            >
          </div>
        </div>
      </template>
    </div>

    <div class="cta-wrap">
      <button v-if="step < STEP_TITLES.length" class="cta" :disabled="!canNext" @click="next">
        Suivant
      </button>
      <button v-else class="cta" :disabled="creating" @click="createChallenge">
        {{ creating ? 'Création…' : 'Lancer le challenge' }}
      </button>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import {
  CHALLENGE_FORMATS,
  DURATIONS,
  CHALLENGE_SUGGESTIONS,
  formatOption,
} from '@/data/challengeFormats';
import {
  computeDailyTargets,
  suggestConfig,
  progressiveApply,
  logicalToday,
  type ChallengeFormat,
  type ChallengeConfig,
} from '@/lib/challenges';
import { exerciseInstructions } from '@/data/exerciseInstructions';
import { exerciseImage } from '@/data/exerciseImages';
import { useLibraryStore, type ExerciseRow } from '@/stores/library';
import { useProfileStore } from '@/stores/profile';
import { useChallengesStore } from '@/stores/challenges';
import { useAuthStore } from '@/stores/auth';
import type { Level } from '@/lib/types';

const router = useRouter();
const $q = useQuasar();
const libraryStore = useLibraryStore();
const profileStore = useProfileStore();
const challenges = useChallengesStore();
const auth = useAuthStore();

const STEP_TITLES = ['Exercice', 'Format', 'Durée', 'Réglages', 'Récap'];
const step = ref(1);

const WEEKDAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Jeu' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sam' },
  { value: 0, label: 'Dim' },
];

const lib = ref<ExerciseRow[]>([]);
const loadingLib = ref(true);
const search = ref('');
const exercise = ref<ExerciseRow | null>(null);
const format = ref<ChallengeFormat>('fixed');
const durationDays = ref(30);
const customOn = ref(false);
const customDays = ref(45);
const config = ref<ChallengeConfig>({ start: 50 });
const restDays = ref<number[]>([]);
const reminderOn = ref(false);
const reminderTime = ref('18:00');
const carryOver = ref(false);
const creating = ref(false);

const level = computed<Level>(() => profileStore.profile?.experience?.level ?? 'intermediaire');
const levelLabel = computed(() => level.value);
const favSet = computed(() => new Set(profileStore.profile?.favorite_exercises ?? []));
const unit = computed<'reps' | 'time'>(() => (exercise.value?.unit === 'time' ? 'time' : 'reps'));
const unitLabel = computed(() => (unit.value === 'time' ? 'sec' : 'reps'));
const fields = computed(() => formatOption(format.value)?.fields ?? ['start']);

const guide = computed(() =>
  exercise.value ? exerciseInstructions(exercise.value.id) : undefined,
);
const exoImg = computed(() => (exercise.value ? exerciseImage(exercise.value.id) : undefined));

const canNext = computed(() => (step.value === 1 ? !!exercise.value : true));

const sugIndex = new Map(CHALLENGE_SUGGESTIONS.map((id, i) => [id, i]));
function exRank(id: string): number {
  return (favSet.value.has(id) ? 100 : 0) + (sugIndex.has(id) ? 50 - (sugIndex.get(id) ?? 0) : 0);
}
const filteredLib = computed(() => {
  const n = search.value.trim().toLowerCase();
  const base = n
    ? lib.value.filter(
        (e) =>
          e.name.toLowerCase().includes(n) || (e.muscle_primary ?? '').toLowerCase().includes(n),
      )
    : lib.value;
  return [...base].sort((a, b) => exRank(b.id) - exRank(a.id)).slice(0, 60);
});

function next() {
  if (canNext.value && step.value < STEP_TITLES.length) step.value++;
}
async function prev() {
  if (step.value > 1) step.value--;
  else await router.push('/challenges');
}

function durationLabel(d: number) {
  return d === 100
    ? '100 j'
    : d === 30
      ? '1 mois'
      : d === 21
        ? '3 sem'
        : d === 14
          ? '2 sem'
          : '1 sem';
}

function fieldLabel(f: string) {
  if (format.value === 'ramp') {
    if (f === 'start') return 'Min (jour 1)';
    if (f === 'peak') return 'Max (dernier jour)';
  }
  if (format.value === 'progressive' && f === 'start') return 'Départ (reps)';
  return (
    {
      start: 'Départ',
      increment: '+/jour',
      peak: 'Pic',
      cycle_days: 'Cycle (j)',
      deload_pct: 'Décharge %',
      total: 'Total',
      max: 'Ta perf max',
      start_coef: 'Départ (×MAX)',
      inc_pct: '+ %/jour',
      variation: 'Variation %',
    }[f] ?? f
  );
}
const stepBounds: Record<string, { min: number; max: number; step: number }> = {
  inc_pct: { min: 3, max: 15, step: 1 },
  variation: { min: 0, max: 40, step: 5 },
};
function stepField(f: string, delta: number) {
  const b = stepBounds[f];
  if (!b) return;
  const nextVal = Math.min(b.max, Math.max(b.min, cfgDisplay(f) + delta));
  setField(f, nextVal);
}
function cfgDisplay(f: string): number {
  if (f === 'deload_pct') return Math.round((config.value.deload_pct ?? 0.5) * 100);
  return Number((config.value as unknown as Record<string, unknown>)[f] ?? 0);
}
// Le départ est saisi en reps absolues ; seul l'incrément dérive du % de MAX.
function applyProgressiveIncrement() {
  const c = config.value;
  const { increment } = progressiveApply(c.max ?? 0, c.start_coef ?? 1, c.inc_pct ?? 3);
  config.value = { ...c, increment };
}
function setField(f: string, v: unknown) {
  const n = Number(v) || 0;
  if (f === 'deload_pct')
    config.value = { ...config.value, deload_pct: Math.min(1, Math.max(0, n / 100)) };
  else config.value = { ...config.value, [f]: n };
  if (format.value === 'progressive' && (f === 'max' || f === 'inc_pct'))
    applyProgressiveIncrement();
}
function reset() {
  if (!exercise.value) return;
  config.value = suggestConfig(
    unit.value,
    level.value,
    format.value,
    durationDays.value,
    exercise.value.id,
  );
  restDays.value = config.value.rest_weekdays ?? [];
}
function pickExercise(e: ExerciseRow) {
  exercise.value = e;
  reset();
}
function selectFormat(f: ChallengeFormat) {
  format.value = f;
  reset();
}
function setPresetDuration(d: number) {
  customOn.value = false;
  durationDays.value = d;
  reset();
}
function enableCustom() {
  customOn.value = true;
  applyCustom();
}
function applyCustom() {
  const d = Math.min(365, Math.max(1, Math.round(customDays.value || 0)));
  customDays.value = d;
  durationDays.value = d;
  reset();
}
function toggleRest(w: number) {
  const i = restDays.value.indexOf(w);
  if (i >= 0) restDays.value.splice(i, 1);
  else restDays.value.push(w);
}

const startDate = logicalToday();
const previewTargets = computed(() =>
  computeDailyTargets(
    format.value,
    { ...config.value, rest_weekdays: restDays.value },
    durationDays.value,
    startDate,
  ),
);
const maxTarget = computed(() => Math.max(1, ...previewTargets.value));
function barH(t: number) {
  return Math.round((t / maxTarget.value) * 100);
}
const activeDaysCount = computed(() => previewTargets.value.filter((t) => t > 0).length);
const totalPlanned = computed(() => previewTargets.value.reduce((a, t) => a + t, 0));

async function createChallenge() {
  const userId = auth.user?.id;
  if (!userId || !exercise.value) return;
  creating.value = true;
  try {
    const cfg: ChallengeConfig = { ...config.value, rest_weekdays: restDays.value };
    if (reminderOn.value) cfg.reminder_time = reminderTime.value;
    if (carryOver.value && format.value !== 'cumulative') cfg.carry_over = true;
    const daily = computeDailyTargets(format.value, cfg, durationDays.value, startDate);
    const ch = await challenges.create({
      exercise_id: exercise.value.id,
      exercise_name: exercise.value.name,
      unit: unit.value,
      format: format.value,
      duration_days: durationDays.value,
      start_date: startDate,
      config: cfg,
      daily_targets: daily,
    });
    $q.notify({ type: 'positive', message: 'Challenge lancé 💪' });
    await router.replace(`/challenges/${ch.id}`);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    creating.value = false;
  }
}

onMounted(async () => {
  const userId = auth.user?.id;
  try {
    if (userId && !profileStore.profile) await profileStore.fetch(userId);
    lib.value = await libraryStore.fetchAll();
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loadingLib.value = false;
  }
});
</script>

<style scoped lang="scss">
.cn-page {
  background: var(--bg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.top {
  padding: 14px 16px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--line-soft);
}
.iconbtn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 18px;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex: none;
}
.top-mid {
  flex: 1;
  min-width: 0;
}
.top-title {
  font-weight: 600;
  font-size: 18px;
  text-transform: uppercase;
  color: var(--text);
}
.top-step {
  font-size: 12px;
  color: var(--dim);
  margin-top: 1px;
}
.top-spacer {
  width: 40px;
  flex: none;
}
.progress {
  height: 3px;
  background: var(--line-soft);
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.25s ease;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 110px;
}
.step-h {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  margin: 4px 2px 16px;
}
.lbl {
  font-size: 12px;
  color: var(--dim);
  margin-bottom: 8px;
}

.ex-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ex-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  cursor: pointer;
  &.sel {
    border-color: var(--accent);
    background: var(--surface-2);
  }
}
.ex-main {
  flex: 1;
  min-width: 0;
}
.ex-name {
  font-weight: 600;
  font-size: 14.5px;
  color: var(--text);
}
.ex-meta {
  font-size: 11.5px;
  color: var(--dim);
  text-transform: capitalize;
}
.fav {
  flex: none;
}

.ex-detail {
  margin-top: 14px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--accent);
  background: var(--surface-2);
}
.exd-head {
  display: flex;
  gap: 12px;
  align-items: center;
}
.exd-img {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 10px;
  flex: none;
  background: var(--surface);
}
.exd-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}
.exd-meta {
  font-size: 12px;
  color: var(--dim);
  text-transform: capitalize;
  margin-top: 2px;
}
.exd-sec {
  margin-top: 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--dim);
}
.exd-steps {
  margin: 8px 0 0;
  padding-left: 18px;
  li {
    font-size: 13.5px;
    color: var(--text);
    line-height: 1.4;
    margin-bottom: 6px;
  }
}
.exd-tip {
  margin-top: 8px;
  font-size: 13px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-radius: 10px;
  padding: 8px 10px;
}
.exd-none {
  margin-top: 10px;
  font-size: 13px;
  color: var(--dim);
}

.fmt-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.fmt {
  text-align: left;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  color: var(--text);
  &.sel {
    border-color: var(--accent);
    background: var(--surface-2);
  }
}
.fmt-name {
  font-weight: 600;
  font-size: 14px;
  margin-top: 6px;
}
.fmt-desc {
  font-size: 11px;
  color: var(--dim);
  margin-top: 2px;
  line-height: 1.25;
}

.dur-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.custom-dur {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.cfg-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.cfg-lbl {
  font-size: 11px;
  color: var(--dim);
  margin-bottom: 3px;
}
.stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0 4px;
}
.st-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 9px;
  background: var(--surface);
  color: var(--accent);
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.st-btn:active {
  background: var(--accent);
  color: var(--accent-ink);
}
.st-val {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  color: var(--text);
}
.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.choice {
  min-height: 44px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
  &.active {
    border-color: var(--accent);
    background: var(--surface-2);
  }
  &.small {
    min-height: 40px;
    font-size: 12px;
    padding: 0 2px;
  }
}

.carry {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  padding: 10px 12px;
}
.carry-note {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.35;
  margin-top: 6px;
}

.recap {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 6px 14px;
  margin-bottom: 14px;
}
.recap-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--line-soft);
  font-size: 14px;
  &:last-child {
    border-bottom: none;
  }
  span {
    color: var(--dim);
  }
  b {
    color: var(--text);
  }
}
.preview {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px;
}
.prev-h {
  font-size: 11px;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}
.prev-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 70px;
}
.prev-bar {
  flex: 1;
  min-width: 2px;
  background: var(--accent);
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  opacity: 0.85;
}
.prev-sub {
  font-size: 12px;
  color: var(--dim);
  margin-top: 8px;
  b {
    color: var(--text);
  }
}

.cta-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  max-width: 600px;
  margin: 0 auto;
  padding: 14px 16px 24px;
  background: linear-gradient(180deg, transparent, var(--bg) 30%);
}
.cta {
  width: 100%;
  height: 56px;
  border: none;
  border-radius: 16px;
  background: var(--accent);
  color: var(--accent-ink);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
  }
}
</style>
