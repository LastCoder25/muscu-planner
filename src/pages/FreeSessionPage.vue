<template>
  <q-page class="free-page">
    <header class="top">
      <button class="iconbtn" aria-label="Quitter" @click="quit">‹</button>
      <div class="top-mid">
        <div class="top-title font-display">Séance libre</div>
        <div class="top-sub">{{ clock }}<template v-if="run"> · {{ run.exercises.length }} exos · vol {{ totalVolume }} kg</template></div>
      </div>
      <q-btn flat round dense icon="stop" aria-label="Terminer" :disable="!canFinish" @click="openFinish" />
      <q-btn flat round dense icon="delete_outline" color="negative" aria-label="Annuler la séance" @click="cancelFree" />
    </header>

    <!-- État vide -->
    <div v-if="!run || run.exercises.length === 0" class="scroll empty-wrap">
      <div class="empty">
        <q-icon name="fitness_center" size="40px" class="text-dim" />
        <p>Choisis un exercice, fais-le, note ton ressenti, repos… puis l'exercice suivant.</p>
        <button class="cta" @click="pickerOpen = true">Choisir un exercice</button>
      </div>
    </div>

    <template v-else>
      <!-- Exos ajoutés (navigation) -->
      <div class="dots">
        <button
          v-for="(e, i) in run.exercises" :key="i"
          class="dot" :class="{ cur: i === run.exIndex, done: exDone(e) }"
          :aria-label="`Exercice ${i + 1}`"
          @click="goTo(i)"
        >{{ i + 1 }}</button>
      </div>

      <div ref="scrollEl" class="scroll">
        <div v-if="ex" class="exo">
          <div class="exo-top">
            <img v-if="exImg" :src="exImg" :alt="ex.name" class="exo-img" />
            <div class="exo-id">
              <div class="exo-name font-display">{{ ex.name }}</div>
              <div class="exo-meta">
                <span v-if="ex.muscle_primary" class="chip">{{ ex.muscle_primary }}</span>
                <span v-if="ex.equipment" class="chip">{{ ex.equipment }}</span>
              </div>
            </div>
          </div>

          <!-- Timer de repos -->
          <div v-if="resting" class="timer">
            <div class="timer-label">Repos</div>
            <div class="ring-wrap">
              <svg width="170" height="170" viewBox="0 0 184 184">
                <circle class="ring-bg" cx="92" cy="92" r="82" />
                <circle class="ring-fg" cx="92" cy="92" r="82" stroke-dasharray="515" :stroke-dashoffset="515 * (1 - restLeft / restTotal)" />
              </svg>
              <div class="ring-num"><div class="ring-time font-display">{{ restDisplay }}</div></div>
            </div>
            <div class="timer-btns">
              <button class="tbtn" @click="addTime(15)">+15 s</button>
              <button class="tbtn skip" @click="skipRest">Passer le repos</button>
            </div>
          </div>

          <!-- Séries -->
          <div class="sec-h"><span>Séries</span><div class="vol">Volume <b>{{ volume }}</b> kg</div></div>
          <div v-for="(s, i) in ex.sets" :key="i" class="set" :class="{ done: s.done, cur: i === curSetIndex }">
            <div class="set-idx font-display">{{ i + 1 }}</div>
            <div>
              <div class="cell-lbl">{{ ex.bodyweight ? 'Lest' : 'Charge' }}</div>
              <div class="val-line">
                <button v-if="i === curSetIndex" class="stepper" @click="adj(s, 'load_kg', -2.5)">−</button>
                <div class="val font-display">{{ s.load_kg }}<small>kg</small></div>
                <button v-if="i === curSetIndex" class="stepper" @click="adj(s, 'load_kg', 2.5)">+</button>
              </div>
            </div>
            <div>
              <div class="cell-lbl">{{ isTimeEx ? 'Sec' : 'Reps' }}</div>
              <div class="val-line">
                <button v-if="i === curSetIndex" class="stepper" @click="adj(s, 'reps', isTimeEx ? -5 : -1)">−</button>
                <div class="val font-display">{{ s.reps }}</div>
                <button v-if="i === curSetIndex" class="stepper" @click="adj(s, 'reps', isTimeEx ? 5 : 1)">+</button>
              </div>
            </div>
            <div>
              <div v-if="s.done && s.difficulty" class="dpill" :class="'d' + s.difficulty">{{ s.difficulty }}</div>
              <button v-else-if="i === curSetIndex && ex.sets.length > 1" class="rm" aria-label="Retirer la série" @click="live.removeSet(i)">✕</button>
            </div>
          </div>

          <!-- Ressenti de la série courante (après l'avoir faite) -->
          <div v-if="curSet" class="comment">
            <div class="comment-head"><span>Ressenti de la série</span><em>noter puis valider</em></div>
            <div class="diff-row">
              <button
                v-for="d in DIFFS" :key="d.n"
                class="diff-btn" :class="['d' + d.n, { sel: curSet.difficulty === d.n }]"
                @click="curSet.difficulty = d.n; live.persist()"
              ><b>{{ d.n }}</b><span>{{ d.label }}</span></button>
            </div>
            <div v-if="showRir" class="rir-row">
              <span class="rir-lbl">RIR (reps en réserve)</span>
              <q-input v-model.number="curSet.rir" type="number" dense filled class="rir-input" @update:model-value="live.persist()" />
            </div>
            <div class="cbox">
              <textarea v-model="curSet.comment" class="cfield" aria-label="Commentaire de la série" placeholder="Note libre (optionnel)…" @change="live.persist()" />
              <button class="mic" :class="{ rec: recording }" aria-label="Dictée" @click="toggleMic">🎤</button>
            </div>
          </div>

          <button v-if="!curSet && !resting" class="addset" @click="live.addSet()">+ Ajouter une série</button>
        </div>
      </div>

      <!-- CTA collant -->
      <div class="cta-wrap">
        <button v-if="resting" class="cta ghost" @click="skipRest">Passer le repos</button>
        <button v-else-if="curSet" class="cta" :disabled="!curSet.difficulty" @click="validateSet">Valider la série</button>
        <template v-else>
          <button class="cta" @click="pickerOpen = true">Exercice suivant</button>
        </template>
      </div>
    </template>

    <!-- Picker d'exercices -->
    <q-dialog v-model="pickerOpen" position="bottom">
      <div class="sheet">
        <div class="grab" />
        <div class="picker-head">
          <h3 class="font-display">Ajouter un exercice</h3>
          <div class="view-toggle">
            <button :class="{ on: pickerView === 'list' }" aria-label="Liste" @click="setView('list')"><q-icon name="view_list" size="18px" /></button>
            <button :class="{ on: pickerView === 'tiles' }" aria-label="Tuiles" @click="setView('tiles')"><q-icon name="grid_view" size="18px" /></button>
          </div>
        </div>
        <q-input v-model="search" filled dense placeholder="Rechercher…" class="q-mb-sm" clearable />
        <div v-if="loadingLib" class="row flex-center q-pa-md"><q-spinner color="primary" /></div>

        <div v-else-if="pickerView === 'tiles'" class="tiles">
          <button v-for="e in filteredLib" :key="e.id" class="tile" :style="{ borderTopColor: exColor(e) }" @click="pick(e)">
            <img v-if="exerciseImage(e.id)" :src="exerciseImage(e.id)" :alt="e.name" class="tile-img" loading="lazy" />
            <span v-else class="tile-badge" :style="{ background: exColor(e) + '22', color: exColor(e) }"><q-icon :name="exIcon(e)" size="26px" /></span>
            <div class="tile-name">{{ e.name }}</div>
            <div v-if="e.muscle_primary" class="tile-mus" :style="{ color: exColor(e) }">{{ e.muscle_primary }}</div>
            <q-icon name="info_outline" size="18px" class="tile-info" role="button" aria-label="Fiche" @click.stop="openExercise(e.id)" />
          </button>
        </div>

        <template v-else>
          <button v-for="e in filteredLib" :key="e.id" class="alt" @click="pick(e)">
            <span class="alt-badge" :style="{ background: exColor(e) + '22', color: exColor(e) }"><q-icon :name="exIcon(e)" size="20px" /></span>
            <div class="alt-main">
              <div class="alt-name">{{ e.name }}</div>
              <div class="alt-meta">{{ e.muscle_primary }}<template v-if="e.equipment"> · {{ e.equipment }}</template></div>
            </div>
            <q-icon name="info_outline" size="20px" color="grey-6" class="alt-info" role="button" aria-label="Fiche" @click.stop="openExercise(e.id)" />
            <div class="alt-go">+</div>
          </button>
        </template>
      </div>
    </q-dialog>

    <!-- Fin de séance -->
    <q-dialog v-model="finishOpen" position="bottom">
      <div class="sheet">
        <div class="grab" />
        <h3 class="font-display">Fin de séance</h3>
        <p class="muted">Comment était la séance ?</p>
        <div class="diff-row">
          <button v-for="d in DIFFS" :key="d.n" class="diff-btn" :class="['d' + d.n, { sel: globalDiff === d.n }]" @click="globalDiff = d.n"><b>{{ d.n }}</b><span>{{ d.label }}</span></button>
        </div>
        <textarea v-model="globalComment" class="cfield" aria-label="Commentaire global" placeholder="Commentaire global (optionnel)" />
        <button class="cta q-mt-md" :disabled="saving" @click="finish">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
      </div>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useLiveStore, type LiveSet, type LiveExercise } from '@/stores/live';
import { useLogsStore } from '@/stores/logs';
import { useLibraryStore, type ExerciseRow } from '@/stores/library';
import { exerciseImage } from '@/data/exerciseImages';

const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const profileStore = useProfileStore();
const live = useLiveStore();
const logs = useLogsStore();
const libraryStore = useLibraryStore();

const DIFFS = [
  { n: 1, label: 'Facile' }, { n: 2, label: 'Modéré' }, { n: 3, label: 'Dur' }, { n: 4, label: 'Max' },
];

const run = computed(() => live.run);
const ex = computed(() => live.current);
const exImg = computed(() => (ex.value ? exerciseImage(ex.value.id) : undefined));
const curSetIndex = computed(() => ex.value?.sets.findIndex((s) => !s.done) ?? -1);
const curSet = computed(() => (curSetIndex.value >= 0 ? ex.value!.sets[curSetIndex.value]! : null));
const volume = computed(() => (ex.value ? ex.value.sets.filter((s) => s.done).reduce((a, s) => a + s.load_kg * s.reps, 0) : 0));
const totalVolume = computed(() =>
  run.value ? run.value.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).reduce((b, s) => b + s.load_kg * s.reps, 0), 0) : 0,
);
const showRir = computed(() => profileStore.levelConfig?.effort_signal === 'rir');
const isTimeEx = computed(() => ex.value?.planned.unit === 'time');
const canFinish = computed(() => !!run.value && run.value.exercises.some((e) => e.sets.some((s) => s.done)));
function exDone(e: LiveExercise) {
  return e.sets.length > 0 && e.sets.every((s) => s.done);
}

const scrollEl = ref<HTMLElement | null>(null);
function scrollTop() {
  nextTick(() => scrollEl.value?.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => undefined);
}

// ── Horloge globale ─────────────────────────────────────
const now = ref(Date.now());
let clockInt: ReturnType<typeof setInterval> | undefined;
const clock = computed(() => {
  if (!run.value) return '0:00';
  const sec = Math.max(0, Math.floor((now.value - new Date(run.value.started_at).getTime()) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
});

// ── Timer de repos ──────────────────────────────────────
const resting = ref(false);
const restLeft = ref(0);
const restTotal = ref(0);
let restInt: ReturnType<typeof setInterval> | undefined;
const restDisplay = computed(() =>
  restLeft.value >= 60 ? `${Math.floor(restLeft.value / 60)}:${String(restLeft.value % 60).padStart(2, '0')}` : String(restLeft.value),
);
function startRest() {
  resting.value = true;
  restTotal.value = restLeft.value = ex.value?.rest_seconds ?? 90;
  clearInterval(restInt);
  restInt = setInterval(() => {
    restLeft.value--;
    if (restLeft.value <= 0) skipRest();
  }, 1000);
  scrollTop();
}
function addTime(n: number) {
  restLeft.value += n;
  restTotal.value = Math.max(restTotal.value, restLeft.value);
}
function skipRest() {
  clearInterval(restInt);
  resting.value = false;
}

// ── Séries ──────────────────────────────────────────────
function adj(s: LiveSet, key: 'load_kg' | 'reps', d: number) {
  s[key] = Math.max(0, Math.round((s[key] + d) * 10) / 10);
  live.persist();
}
function validateSet() {
  const s = curSet.value;
  if (!s || !s.difficulty) return;
  s.done = true;
  live.persist();
  startRest();
}
function goTo(i: number) {
  skipRest();
  live.goToExercise(i);
  scrollTop();
}

// ── Picker bibliothèque ─────────────────────────────────
const pickerOpen = ref(false);
const search = ref('');
const lib = ref<ExerciseRow[]>([]);
const loadingLib = ref(false);
const VIEW_KEY = 'muscu:free:pickerView';
const pickerView = ref<'list' | 'tiles'>(localStorage.getItem(VIEW_KEY) === 'tiles' ? 'tiles' : 'list');
function setView(v: 'list' | 'tiles') {
  pickerView.value = v;
  localStorage.setItem(VIEW_KEY, v);
}
const filteredLib = computed(() => {
  const n = search.value.trim().toLowerCase();
  const base = n ? lib.value.filter((e) => e.name.toLowerCase().includes(n) || (e.muscle_primary ?? '').toLowerCase().includes(n)) : lib.value;
  return base.slice(0, 60);
});
function exIcon(e: ExerciseRow): string {
  const q = (e.equipment ?? '').toLowerCase();
  if (/barre|barbell/.test(q)) return 'mdi-weight-lifter';
  if (/halter|dumbbell/.test(q)) return 'mdi-dumbbell';
  if (/kettlebell/.test(q)) return 'mdi-kettlebell';
  if (/machine/.test(q)) return 'mdi-cog';
  if (/poulie|cable|câble/.test(q)) return 'mdi-vector-line';
  if (/élast|elast|band/.test(q)) return 'mdi-arrow-expand-horizontal';
  if (/corps|poids du corps|bodyweight/.test(q)) return 'mdi-human-handsup';
  return 'mdi-dumbbell';
}
const MUSCLE_COLORS: Record<string, string> = {
  pectoraux: '#FF6A45', épaules: '#FFB23F', triceps: '#C6D24A', biceps: '#7BC86C',
  dos: '#46C7F0', quadriceps: '#B388FF', 'ischio-jambiers': '#8E5CF0', mollets: '#57D996', abdominaux: '#FF4D6D',
};
function exColor(e: ExerciseRow): string {
  return MUSCLE_COLORS[(e.muscle_primary ?? '').toLowerCase()] ?? '#9A8F7E';
}
function pick(e: ExerciseRow) {
  live.addExercise({
    id: e.id,
    name: e.name,
    muscle_primary: e.muscle_primary ?? undefined,
    equipment: e.equipment ?? undefined,
    unit: e.unit ?? undefined,
  });
  skipRest();
  live.goToExercise(run.value!.exercises.length - 1);
  pickerOpen.value = false;
  search.value = '';
  scrollTop();
}
async function openExercise(id: string) {
  pickerOpen.value = false;
  await router.push(`/exercise/${id}`);
}

// ── Dictée (Web Speech API) ─────────────────────────────
const recording = ref(false);
interface SpeechRec { lang: string; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; }
let rec: SpeechRec | null = null;
function toggleMic() {
  const w = globalThis as unknown as { webkitSpeechRecognition?: new () => SpeechRec; SpeechRecognition?: new () => SpeechRec };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) {
    $q.notify({ type: 'warning', message: 'Dictée non supportée par ce navigateur.' });
    return;
  }
  if (recording.value) { rec?.stop(); return; }
  rec = new Ctor();
  rec.lang = 'fr-FR';
  rec.interimResults = false;
  rec.onresult = (e) => {
    const txt = e.results[e.results.length - 1]?.[0]?.transcript ?? '';
    if (curSet.value) {
      curSet.value.comment = (curSet.value.comment ? curSet.value.comment + ' ' : '') + txt.trim();
      live.persist();
    }
  };
  rec.onend = () => { recording.value = false; };
  recording.value = true;
  rec.start();
}

// ── Fin / annulation ────────────────────────────────────
const finishOpen = ref(false);
const globalDiff = ref(0);
const globalComment = ref('');
const saving = ref(false);
function openFinish() {
  if (!canFinish.value) return;
  skipRest();
  finishOpen.value = true;
}
async function finish() {
  const userId = auth.user?.id;
  if (!userId) return;
  saving.value = true;
  try {
    const log = live.buildLog({ difficulty: globalDiff.value, comment: globalComment.value.trim() });
    await logs.insert(userId, log);
    live.clear();
    await router.push(`/bilan/${log.id}`);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    saving.value = false;
  }
}
function cancelFree() {
  $q.dialog({
    title: 'Annuler la séance',
    message: 'La séance libre en cours sera supprimée (rien ne sera enregistré). Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Annuler la séance', color: 'negative' },
  }).onOk(() => {
    live.clear();
    router.push('/').catch(() => undefined);
  });
}
async function quit() {
  await router.push('/');
}

onMounted(async () => {
  live.startFree(true);
  clockInt = setInterval(() => { now.value = Date.now(); }, 1000);
  loadingLib.value = true;
  try {
    lib.value = await libraryStore.fetchAll();
  } catch {
    $q.notify({ type: 'negative', message: 'Bibliothèque indisponible.' });
  } finally {
    loadingLib.value = false;
  }
});

onBeforeUnmount(() => { clearInterval(clockInt); clearInterval(restInt); });
</script>

<style scoped lang="scss">
.free-page { background: var(--bg); min-height: 100vh; display: flex; flex-direction: column; }
.top { padding: 14px 16px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--line-soft); }
.iconbtn { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: 18px; display: grid; place-items: center; cursor: pointer; flex: none; }
.top-mid { flex: 1; min-width: 0; }
.top-title { font-weight: 600; font-size: 18px; text-transform: uppercase; }
.top-sub { font-size: 11.5px; color: var(--dim); margin-top: 2px; font-variant-numeric: tabular-nums; }

.dots { display: flex; gap: 6px; flex-wrap: wrap; padding: 12px 16px 0; }
.dot { min-width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--dim); font-family: var(--font-display); font-size: 12px; cursor: pointer; padding: 0 6px; }
.dot.done { color: var(--d1); border-color: var(--d1); }
.dot.cur { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }

.scroll { flex: 1; overflow-y: auto; padding: 14px 16px 120px; }
.empty-wrap { display: flex; }
.empty { margin: auto; text-align: center; color: var(--dim); display: flex; flex-direction: column; align-items: center; gap: 14px; max-width: 320px; p { font-size: 14px; line-height: 1.5; } }

.exo-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.exo-img { width: 64px; height: 64px; object-fit: contain; background: #fff; border-radius: 12px; flex: none; }
.exo-id { min-width: 0; }
.exo-name { font-size: 20px; font-weight: 600; color: var(--text); }
.exo-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.chip { font-size: 11px; font-weight: 600; text-transform: capitalize; color: var(--dim); background: var(--surface); border: 1px solid var(--line-soft); padding: 4px 9px; border-radius: 8px; }

.timer { display: flex; flex-direction: column; align-items: center; gap: 10px; margin: 6px 0 18px; }
.timer-label { font-family: var(--font-display); letter-spacing: 2px; text-transform: uppercase; color: var(--accent); font-size: 13px; }
.ring-wrap { position: relative; width: 170px; height: 170px; }
.ring-bg { fill: none; stroke: var(--line); stroke-width: 12; }
.ring-fg { fill: none; stroke: var(--accent); stroke-width: 12; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 92px 92px; transition: stroke-dashoffset 1s linear; }
.ring-num { position: absolute; inset: 0; display: grid; place-items: center; }
.ring-time { font-size: 40px; font-weight: 700; color: var(--text); }
.timer-btns { display: flex; gap: 10px; }
.tbtn { padding: 9px 16px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font-size: 13px; cursor: pointer; &.skip { color: var(--accent); } }

.sec-h { display: flex; align-items: center; justify-content: space-between; margin: 6px 0 8px; font-family: var(--font-display); text-transform: uppercase; letter-spacing: 1px; font-size: 13px; color: var(--dim); }
.vol b { color: var(--accent); }

.set { display: grid; grid-template-columns: 28px 1fr 1fr 36px; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line-soft); }
.set.cur { background: var(--surface-2); border-radius: 12px; padding: 12px 8px; border-bottom: none; }
.set-idx { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; font-weight: 600; font-size: 14px; background: var(--surface-2); color: var(--dim); }
.set.cur .set-idx { background: var(--accent); color: var(--accent-ink); }
.cell-lbl { font-size: 9.5px; letter-spacing: 1px; text-transform: uppercase; color: var(--dim-2); margin-bottom: 1px; }
.val-line { display: flex; align-items: center; gap: 7px; }
.stepper { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: 16px; display: grid; place-items: center; cursor: pointer; flex: none; }
.val { font-weight: 600; font-size: 19px; font-variant-numeric: tabular-nums; min-width: 28px; text-align: center; color: var(--accent); small { font-size: 11px; color: var(--dim); font-weight: 400; } }
.rm { width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--dim-2); cursor: pointer; }
.dpill { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; font-family: var(--font-display); font-weight: 700; color: var(--accent-ink); }
.dpill.d1 { background: var(--d1); } .dpill.d2 { background: var(--d2); } .dpill.d3 { background: var(--d3); } .dpill.d4 { background: var(--d4); }

.comment { margin-top: 14px; background: var(--surface); border: 1px solid var(--line-soft); border-radius: 14px; padding: 12px; }
.comment-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; span { font-weight: 600; color: var(--text); font-size: 14px; } em { color: var(--dim); font-size: 11px; font-style: normal; } }
.diff-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.diff-btn { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 9px 4px 7px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--line); color: var(--dim); cursor: pointer; b { font-family: var(--font-display); font-size: 20px; line-height: 1; } span { font-size: 9.5px; } }
.diff-btn.d1.sel { background: var(--d1); border-color: var(--d1); color: var(--accent-ink); }
.diff-btn.d2.sel { background: var(--d2); border-color: var(--d2); color: var(--accent-ink); }
.diff-btn.d3.sel { background: var(--d3); border-color: var(--d3); color: var(--accent-ink); }
.diff-btn.d4.sel { background: var(--d4); border-color: var(--d4); color: #fff; }
.rir-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; }
.rir-lbl { font-size: 12px; color: var(--dim); }
.rir-input { width: 90px; }
.cbox { position: relative; margin-top: 10px; }
.cfield { width: 100%; min-height: 64px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 10px 44px 10px 12px; color: var(--text); font-family: var(--font-ui); font-size: 14px; resize: none; outline: none; &:focus { border-color: var(--accent); } }
.mic { position: absolute; top: 8px; right: 8px; width: 32px; height: 32px; border-radius: 9px; border: 1px solid var(--line); background: var(--surface-2); cursor: pointer; &.rec { background: var(--d4); border-color: var(--d4); } }

.addset { width: 100%; height: 44px; margin-top: 14px; border-radius: 12px; border: 1px dashed var(--line); background: transparent; color: var(--dim); font-weight: 600; font-size: 13px; cursor: pointer; }

.cta-wrap { position: fixed; left: 0; right: 0; bottom: 0; max-width: 600px; margin: 0 auto; padding: 14px 16px 24px; background: linear-gradient(180deg, transparent, var(--bg) 30%); display: flex; flex-direction: column; gap: 10px; }
.cta { width: 100%; height: 56px; border: none; border-radius: 16px; background: var(--accent); color: var(--accent-ink); font-family: var(--font-display); font-weight: 700; font-size: 17px; letter-spacing: 0.5px; text-transform: uppercase; cursor: pointer; &:disabled { opacity: 0.5; } &.ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); } }

.sheet { width: 100%; background: var(--surface); border-radius: 26px 26px 0 0; border-top: 1px solid var(--line); padding: 10px 18px 26px; max-height: 80vh; overflow-y: auto; h3 { font-size: 20px; text-transform: uppercase; } }
.grab { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 6px auto 14px; }
.muted { color: var(--dim); font-size: 12.5px; margin: 4px 0 14px; }
.picker-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.view-toggle { display: flex; gap: 4px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 3px; flex: none; }
.view-toggle button { width: 34px; height: 30px; border: none; border-radius: 8px; background: transparent; color: var(--dim); display: grid; place-items: center; cursor: pointer; &.on { background: var(--accent); color: var(--accent-ink); } }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 12px 8px 10px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--line-soft); border-top: 3px solid var(--line); cursor: pointer; }
.tile-badge { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; }
.tile-img { width: 100%; height: 76px; object-fit: contain; background: #fff; border-radius: 8px; }
.tile-name { font-size: 12px; font-weight: 600; color: var(--text); text-align: center; line-height: 1.15; }
.tile-mus { font-size: 10px; text-align: center; text-transform: capitalize; }
.tile-info { position: absolute; top: 5px; right: 5px; color: var(--dim-2); }
.alt { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 11px 13px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--line-soft); margin-bottom: 8px; cursor: pointer; }
.alt-badge { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; flex: none; }
.alt-main { flex: 1; min-width: 0; }
.alt-name { font-weight: 600; font-size: 14.5px; color: var(--text); }
.alt-meta { font-size: 11.5px; color: var(--dim); margin-top: 2px; }
.alt-info { cursor: pointer; }
.alt-go { color: var(--accent); font-size: 22px; }
</style>
