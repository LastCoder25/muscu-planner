<template>
  <q-page class="cd-page">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="back">‹</button>
      <div class="top-mid">
        <div class="top-title font-display">{{ ch?.exercise_name || 'Challenge' }}</div>
        <div class="top-sub" v-if="ch">{{ formatName }} · {{ ch.duration_days }} j</div>
      </div>
      <q-btn
        flat
        round
        dense
        icon="delete_outline"
        color="negative"
        aria-label="Supprimer"
        @click="confirmDelete"
      />
    </header>

    <div v-if="loading" class="column flex-center" style="min-height: 50vh">
      <q-spinner color="primary" size="32px" />
    </div>

    <template v-else-if="ch">
      <div class="scroll">
        <!-- Stats -->
        <div class="stats">
          <div class="stat">
            <span class="sv font-display">{{ stats.completionPct }}%</span
            ><span class="sl">complété</span>
          </div>
          <div class="stat">
            <span class="sv font-display">{{ stats.streak }}</span
            ><span class="sl">série</span>
          </div>
          <div class="stat">
            <span class="sv font-display">{{ stats.totalDone }}</span
            ><span class="sl">{{ unitLabel }} au total</span>
          </div>
        </div>

        <!-- Exécution du jour -->
        <div v-if="statusDone" class="done-banner">
          <q-icon name="emoji_events" size="20px" /> Challenge terminé — bravo !
        </div>
        <div v-else-if="!inToday" class="rest-banner">
          <q-icon name="bedtime" size="18px" />
          {{
            dayIndex < 0
              ? 'Le challenge commence bientôt.'
              : dayIndex >= ch.duration_days
                ? 'Challenge fini.'
                : 'Jour de repos aujourd’hui 💤'
          }}
        </div>
        <div v-else class="today">
          <div class="today-h">
            Objectif du jour · <b>{{ todayTarget }} {{ unitLabel }}</b>
          </div>
          <div class="ring-wrap">
            <svg viewBox="0 0 120 120" class="ring">
              <circle class="rbg" cx="60" cy="60" r="52" />
              <circle
                class="rfg"
                cx="60"
                cy="60"
                r="52"
                stroke-dasharray="327"
                :stroke-dashoffset="327 * (1 - pct)"
              />
            </svg>
            <div class="ring-num">
              <div class="rn-v font-display">{{ doneToday }}</div>
              <div class="rn-t">/ {{ todayTarget }}</div>
            </div>
          </div>
          <div class="chrono">⏱ {{ chronoDisplay }}</div>

          <div v-if="!todayCompleted" class="exec">
            <template v-if="isTime">
              <button class="cta" @click="toggleChrono">
                {{ running ? 'Pause' : doneToday > 0 ? 'Reprendre' : 'Démarrer' }}
              </button>
            </template>
            <template v-else>
              <div class="quick-row">
                <button v-for="q in quickAdds" :key="q" class="add" @click="addReps(q)">
                  +{{ q }}
                </button>
                <button
                  class="chrono-btn"
                  :class="{ on: running }"
                  aria-label="Chrono"
                  @click="toggleChrono"
                >
                  ⏱
                </button>
              </div>
              <div class="custom-row">
                <q-input
                  v-model.number="addInput"
                  type="number"
                  inputmode="numeric"
                  filled
                  dense
                  placeholder="Nb"
                  class="add-in"
                />
                <button class="add-c" :disabled="!addInput" @click="addCustom">Ajouter</button>
                <button class="edit-q" aria-label="Personnaliser les boutons" @click="editQuick">
                  ⚙
                </button>
              </div>
            </template>
          </div>
          <div v-else class="today-ok">
            <q-icon name="check_circle" color="positive" /> Objectif du jour atteint ✅
          </div>
        </div>

        <!-- Graphique cible vs réalisé -->
        <div v-if="ch.format !== 'cumulative'" class="sec-h">
          Cible <span class="lg-t">▬</span> · réalisé <span class="lg-d">▬</span>
        </div>
        <div v-if="ch.format !== 'cumulative'" class="graph">
          <div
            v-for="(t, d) in ch.daily_targets"
            :key="d"
            class="gcol"
            :title="`J${d + 1} : ${doneOf(d)} / ${t}`"
          >
            <div class="gbar gt" :style="{ height: pctOf(t) + '%' }" />
            <div class="gbar gd" :style="{ height: pctOf(doneOf(d)) + '%' }" />
          </div>
        </div>

        <!-- Calendrier -->
        <div class="sec-h">Calendrier</div>
        <div class="cal">
          <div v-for="(t, d) in ch.daily_targets" :key="d" class="cell" :class="dayState(d)">
            <span class="c-d">J{{ d + 1 }}</span>
            <span class="c-t">{{ ch.format === 'cumulative' ? doneOf(d) || '·' : t || '💤' }}</span>
          </div>
        </div>

        <button v-if="!statusDone" class="abandon" @click="confirmAbandon">
          Abandonner le challenge
        </button>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import {
  challengeStats,
  isChallengeComplete,
  evaluateAchievements,
  type Challenge,
  type DayProgress,
} from '@/lib/challenges';
import { formatOption } from '@/data/challengeFormats';
import { achievementDef } from '@/data/achievements';
import { useChallengesStore } from '@/stores/challenges';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const store = useChallengesStore();

const id = String(route.params.id);
const loading = ref(true);
const ch = ref<Challenge | null>(null);
const running = ref(false);
let tick: ReturnType<typeof setInterval> | undefined;

// Boutons d'ajout personnalisables (« nombres favoris ») + saisie directe.
const QUICK_KEY = 'muscu:challenge:quickadds';
function loadQuick(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUICK_KEY) ?? 'null');
    if (Array.isArray(raw) && raw.length) return raw.map(Number).filter((n) => n > 0);
  } catch {
    /* défaut */
  }
  return [1, 5, 10];
}
const quickAdds = ref<number[]>(loadQuick());
const addInput = ref<number | null>(null);
function addCustom() {
  if (addInput.value && addInput.value > 0) addReps(addInput.value);
  addInput.value = null;
}
function editQuick() {
  $q.dialog({
    title: 'Boutons d’ajout',
    message: 'Nombres séparés par des virgules (ex. 5, 10, 25).',
    prompt: { model: quickAdds.value.join(', '), type: 'text' },
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Enregistrer', color: 'primary', textColor: 'dark' },
  }).onOk((val: string) => {
    const nums = String(val)
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => n > 0)
      .slice(0, 6);
    if (nums.length) {
      quickAdds.value = nums;
      localStorage.setItem(QUICK_KEY, JSON.stringify(nums));
    }
  });
}

const today = new Date().toISOString().slice(0, 10);
const isTime = computed(() => ch.value?.unit === 'time');
const unitLabel = computed(() => (isTime.value ? 'sec' : 'reps'));
const formatName = computed(() =>
  ch.value ? (formatOption(ch.value.format)?.name ?? ch.value.format) : '',
);
const stats = computed(() =>
  ch.value
    ? challengeStats(ch.value, today)
    : {
        dayIndex: -1,
        todayTarget: 0,
        todayDone: 0,
        isDoneToday: false,
        streak: 0,
        completionPct: 0,
        totalDone: 0,
        activeDays: 0,
        completedDays: 0,
        daysLeft: 0,
      },
);
const dayIndex = computed(() => stats.value.dayIndex);
const statusDone = computed(() => ch.value?.status === 'done');
const inToday = computed(() => {
  if (!ch.value || statusDone.value) return false;
  const d = dayIndex.value;
  if (d < 0 || d >= ch.value.duration_days) return false;
  return ch.value.format === 'cumulative' || (ch.value.daily_targets[d] ?? 0) > 0;
});
const todayTarget = computed(() =>
  ch.value?.format === 'cumulative' ? (ch.value.config.total ?? 0) : stats.value.todayTarget,
);
function entryOf(d: number): DayProgress | undefined {
  return ch.value?.progress.find((p) => p.day === d);
}
const doneToday = computed(() =>
  ch.value?.format === 'cumulative' ? stats.value.totalDone : (entryOf(dayIndex.value)?.done ?? 0),
);
const todayCompleted = computed(() =>
  ch.value?.format === 'cumulative'
    ? doneToday.value >= todayTarget.value
    : (entryOf(dayIndex.value)?.completed ?? false),
);
const pct = computed(() =>
  todayTarget.value ? Math.min(1, doneToday.value / todayTarget.value) : 0,
);
const chronoSec = computed(() => entryOf(dayIndex.value)?.elapsed_sec ?? 0);
const chronoDisplay = computed(
  () => `${Math.floor(chronoSec.value / 60)}:${String(chronoSec.value % 60).padStart(2, '0')}`,
);

function ensureToday(): DayProgress {
  const c = ch.value!;
  let e = c.progress.find((p) => p.day === dayIndex.value);
  if (!e) {
    e = {
      day: dayIndex.value,
      date: today,
      target: todayTarget.value,
      done: 0,
      elapsed_sec: 0,
      completed: false,
    };
    c.progress.push(e);
  }
  return e;
}
function doneOf(d: number) {
  return entryOf(d)?.done ?? 0;
}
const maxScale = computed(() => {
  const c = ch.value;
  if (!c) return 1;
  return Math.max(1, ...c.daily_targets, ...c.progress.map((p: DayProgress) => p.done || 0));
});
function pctOf(v: number) {
  return Math.round((v / maxScale.value) * 100);
}

async function persist(status?: 'done') {
  if (!ch.value) return;
  try {
    await store.updateProgress(ch.value.id, ch.value.progress, status);
  } catch {
    /* silencieux */
  }
}
function checkComplete(e: DayProgress) {
  if (!e.completed && ch.value!.format !== 'cumulative' && e.target > 0 && e.done >= e.target) {
    e.completed = true;
    $q.notify({ type: 'positive', message: 'Jour validé ✅' });
  }
}
async function afterChange() {
  const c = ch.value!;
  let status: 'done' | undefined;
  if (c.status !== 'done' && isChallengeComplete(c, today)) {
    c.status = 'done';
    status = 'done';
    running.value = false;
    clearInterval(tick);
    $q.notify({ type: 'positive', message: 'Challenge terminé 🎉' });
  }
  await persist(status);
  if (status) await unlockAchievements();
}
async function unlockAchievements() {
  try {
    const fresh = await store.unlock(evaluateAchievements(store.list));
    for (const code of fresh)
      $q.notify({
        type: 'positive',
        message: `Succès débloqué : ${achievementDef(code)?.title ?? code} 🏆`,
        timeout: 2500,
      });
  } catch {
    /* silencieux */
  }
}

function addReps(n: number) {
  if (!inToday.value) return;
  const e = ensureToday();
  e.done = Math.max(0, e.done + n);
  checkComplete(e);
  void afterChange();
}
function toggleChrono() {
  if (!inToday.value) return;
  running.value = !running.value;
  if (running.value) {
    clearInterval(tick);
    tick = setInterval(() => {
      const e = ensureToday();
      e.elapsed_sec++;
      if (isTime.value) {
        e.done = e.elapsed_sec;
        checkComplete(e);
      }
    }, 1000);
  } else {
    clearInterval(tick);
    void afterChange(); // sauvegarde à la pause
  }
}

function dayState(d: number): string {
  const c = ch.value!;
  if (c.format === 'cumulative')
    return doneOf(d) > 0
      ? 'done'
      : d === dayIndex.value
        ? 'today'
        : d < dayIndex.value
          ? 'idle'
          : 'up';
  const t = c.daily_targets[d] ?? 0;
  if (t === 0) return 'rest';
  if (entryOf(d)?.completed) return 'done';
  if (d === dayIndex.value) return 'today';
  if (d < dayIndex.value) return 'miss';
  return 'up';
}

function confirmAbandon() {
  $q.dialog({
    title: 'Abandonner',
    message: 'Marquer ce challenge comme abandonné ?',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Abandonner', color: 'negative' },
  }).onOk(() => {
    store
      .setStatus(id, 'abandoned')
      .then(() => router.push('/challenges'))
      .catch(() => undefined);
  });
}
function confirmDelete() {
  $q.dialog({
    title: 'Supprimer',
    message: 'Supprimer définitivement ce challenge ?',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    store
      .remove(id)
      .then(() => router.push('/challenges'))
      .catch(() => undefined);
  });
}
async function back() {
  await router.push('/challenges');
}

onMounted(async () => {
  try {
    if (store.list.length === 0) await store.fetchMine();
    ch.value = store.list.find((c) => c.id === id) ?? null;
    if (!ch.value) {
      await store.fetchMine();
      ch.value = store.list.find((c) => c.id === id) ?? null;
    }
    if (!ch.value) {
      $q.notify({ type: 'negative', message: 'Challenge introuvable.' });
      await router.push('/challenges');
      return;
    }
    await store.fetchAchievements();
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loading.value = false;
  }
});
onBeforeUnmount(() => {
  clearInterval(tick);
  if (running.value) void persist();
});
</script>

<style scoped lang="scss">
.cd-page {
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.top-sub {
  font-size: 11.5px;
  color: var(--dim);
  text-transform: capitalize;
  margin-top: 2px;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 40px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.stat {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px;
  text-align: center;
}
.sv {
  display: block;
  font-size: 22px;
  font-weight: 600;
  color: var(--accent);
}
.sl {
  font-size: 10.5px;
  color: var(--dim);
}

.done-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  background: #7bc86c1a;
  border: 1px solid var(--d1);
  color: var(--text);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 14px;
}
.rest-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  color: var(--dim);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 14px;
}

.today {
  margin-top: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 18px;
  text-align: center;
}
.today-h {
  font-size: 13px;
  color: var(--dim);
  b {
    color: var(--accent);
    font-family: var(--font-display);
  }
}
.ring-wrap {
  position: relative;
  width: 150px;
  height: 150px;
  margin: 12px auto 4px;
}
.ring {
  transform: rotate(-90deg);
}
.rbg {
  fill: none;
  stroke: var(--surface-3);
  stroke-width: 8;
}
.rfg {
  fill: none;
  stroke: var(--accent);
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.4s;
}
.ring-num {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.rn-v {
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
}
.rn-t {
  font-size: 13px;
  color: var(--dim);
}
.chrono {
  font-size: 12px;
  color: var(--dim-2);
  margin-bottom: 12px;
  font-variant-numeric: tabular-nums;
}
.exec {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.quick-row {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.add {
  flex: 1;
  height: 52px;
  border-radius: 14px;
  border: 1px solid var(--accent);
  background: var(--surface-2);
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
  cursor: pointer;
}
.chrono-btn {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 20px;
  cursor: pointer;
  flex: none;
  &.on {
    background: var(--accent);
    border-color: var(--accent);
  }
}
.custom-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.add-in {
  flex: 1;
}
.add-c {
  height: 40px;
  padding: 0 16px;
  border-radius: 11px;
  border: none;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
  }
}
.edit-q {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 16px;
  cursor: pointer;
  flex: none;
}
.cta {
  width: 100%;
  height: 54px;
  border: none;
  border-radius: 15px;
  background: var(--accent);
  color: var(--accent-ink);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
  text-transform: uppercase;
  cursor: pointer;
}
.today-ok {
  color: var(--d1);
  font-size: 14px;
}

.sec-h {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin: 24px 2px 10px;
}
.lg-t {
  color: var(--line);
}
.lg-d {
  color: var(--accent);
}
.graph {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 90px;
  overflow-x: auto;
  padding: 4px 2px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
}
.gcol {
  position: relative;
  flex: 1;
  min-width: 8px;
  height: 100%;
}
.gbar {
  position: absolute;
  bottom: 0;
  border-radius: 2px 2px 0 0;
}
.gt {
  left: 0;
  right: 0;
  background: var(--surface-3);
}
.gd {
  left: 22%;
  right: 22%;
  background: var(--accent);
}
.cal {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 6px;
}
.cell {
  border-radius: 10px;
  border: 1px solid var(--line-soft);
  background: var(--surface);
  padding: 7px 2px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.c-d {
  font-size: 9px;
  color: var(--dim-2);
  text-transform: uppercase;
}
.c-t {
  font-family: var(--font-display);
  font-size: 13px;
  color: var(--text);
}
.cell.done {
  background: #7bc86c22;
  border-color: var(--d1);
  .c-t {
    color: var(--d1);
  }
}
.cell.today {
  background: var(--accent);
  border-color: var(--accent);
  .c-d,
  .c-t {
    color: var(--accent-ink);
  }
}
.cell.miss {
  background: #e5544b14;
  border-color: #e5544b55;
  .c-t {
    color: #e5544b;
  }
}
.cell.rest {
  opacity: 0.55;
}
.cell.up,
.cell.idle {
  opacity: 0.8;
}

.abandon {
  width: 100%;
  margin-top: 22px;
  background: none;
  border: none;
  color: var(--d4);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px;
}
</style>
