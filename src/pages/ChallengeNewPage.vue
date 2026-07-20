<template>
  <q-page class="cn-page">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="back">‹</button>
      <div class="top-title font-display">Nouveau challenge</div>
    </header>

    <div class="scroll">
      <!-- 1. Exercice -->
      <div class="sec-h">1 · Exercice</div>
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

      <template v-if="exercise">
        <!-- 2. Format -->
        <div class="sec-h">2 · Format</div>
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

        <!-- 3. Réglages -->
        <div class="sec-h">3 · Réglages</div>
        <div class="lbl">Durée</div>
        <div class="dur-grid q-mb-md">
          <button
            v-for="d in DURATIONS"
            :key="d"
            class="choice"
            :class="{ active: durationDays === d }"
            @click="setDuration(d)"
          >
            {{
              d === 100
                ? '100 j'
                : d === 30
                  ? '1 mois'
                  : d === 21
                    ? '3 sem'
                    : d === 14
                      ? '2 sem'
                      : '1 sem'
            }}
          </button>
        </div>

        <div class="lbl">Difficulté ({{ levelLabel }})</div>
        <div class="cfg-grid q-mb-md">
          <template v-for="field in fields" :key="field">
            <div class="cfg-cell">
              <div class="cfg-lbl">{{ fieldLabel(field) }}</div>
              <q-input
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

        <!-- Aperçu -->
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

    <div v-if="exercise" class="cta-wrap">
      <button class="cta" :disabled="creating" @click="createChallenge">
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
  type ChallengeFormat,
  type ChallengeConfig,
} from '@/lib/challenges';
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
const config = ref<ChallengeConfig>({ start: 50 });
const restDays = ref<number[]>([]);
const reminderOn = ref(false);
const reminderTime = ref('18:00');
const creating = ref(false);

const level = computed<Level>(() => profileStore.profile?.experience?.level ?? 'intermediaire');
const levelLabel = computed(() => level.value);
const favSet = computed(() => new Set(profileStore.profile?.favorite_exercises ?? []));
const unit = computed<'reps' | 'time'>(() => (exercise.value?.unit === 'time' ? 'time' : 'reps'));
const unitLabel = computed(() => (unit.value === 'time' ? 'sec' : 'reps'));
const fields = computed(() => formatOption(format.value)?.fields ?? ['start']);

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
  // Favoris puis suggestions (poids du corps / cardio) en tête.
  return [...base].sort((a, b) => exRank(b.id) - exRank(a.id)).slice(0, 60);
});

function fieldLabel(f: string) {
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
    }[f] ?? f
  );
}
function cfgDisplay(f: string): number {
  if (f === 'deload_pct') return Math.round((config.value.deload_pct ?? 0.5) * 100);
  return Number((config.value as unknown as Record<string, unknown>)[f] ?? 0);
}
// Recalcule départ + incrément du progressif à partir de MAX × coefficients.
function applyProgressive() {
  const c = config.value;
  const { start, increment } = progressiveApply(c.max ?? 0, c.start_coef ?? 2, c.inc_pct ?? 8);
  config.value = { ...c, start, increment };
}
function setField(f: string, v: unknown) {
  const n = Number(v) || 0;
  if (f === 'deload_pct')
    config.value = { ...config.value, deload_pct: Math.min(1, Math.max(0, n / 100)) };
  else config.value = { ...config.value, [f]: n };
  if (format.value === 'progressive' && (f === 'max' || f === 'start_coef' || f === 'inc_pct'))
    applyProgressive();
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
function setDuration(d: number) {
  durationDays.value = d;
  reset();
}
function toggleRest(w: number) {
  const i = restDays.value.indexOf(w);
  if (i >= 0) restDays.value.splice(i, 1);
  else restDays.value.push(w);
}

const startDate = new Date().toISOString().slice(0, 10);
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

async function back() {
  await router.push('/challenges');
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
.top-title {
  font-weight: 600;
  font-size: 18px;
  text-transform: uppercase;
  color: var(--text);
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 110px;
}
.sec-h {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin: 22px 2px 10px;
}
.lbl {
  font-size: 12px;
  color: var(--dim);
  margin-bottom: 8px;
}

.ex-list {
  max-height: 260px;
  overflow-y: auto;
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
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
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

.preview {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px;
  margin-top: 8px;
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
