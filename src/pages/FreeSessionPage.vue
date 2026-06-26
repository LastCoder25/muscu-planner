<template>
  <q-page class="free-page">
    <header class="top">
      <button class="iconbtn" aria-label="Quitter" @click="quit">‹</button>
      <div class="top-mid">
        <div class="top-title font-display">Séance libre</div>
        <div class="top-sub">{{ clock }}<template v-if="run"> · {{ run.exercises.length }} exos</template></div>
      </div>
    </header>

    <div class="scroll">
      <div v-if="run && run.exercises.length === 0" class="empty">
        Ajoute un exercice pour commencer.
      </div>

      <div v-for="(ex, ei) in run?.exercises ?? []" :key="ei" class="ex-card">
        <div class="ex-head">
          <div>
            <div class="ex-name">{{ ex.name }}</div>
            <div v-if="ex.muscle_primary" class="ex-mus">{{ ex.muscle_primary }}</div>
          </div>
          <button class="rm-ex" aria-label="Retirer l'exercice" @click="live.removeExercise(ei)">✕</button>
        </div>

        <div v-for="(s, si) in ex.sets" :key="si" class="set">
          <div class="set-idx font-display">{{ si + 1 }}</div>
          <div>
            <div class="cell-lbl">{{ ex.bodyweight ? 'Lest' : 'Charge' }}</div>
            <div class="val-line">
              <button class="stepper" @click="adj(s, 'load_kg', -2.5)">−</button>
              <div class="val font-display">{{ s.load_kg }}<small>kg</small></div>
              <button class="stepper" @click="adj(s, 'load_kg', 2.5)">+</button>
            </div>
          </div>
          <div>
            <div class="cell-lbl">Reps</div>
            <div class="val-line">
              <button class="stepper" @click="adj(s, 'reps', -1)">−</button>
              <div class="val font-display">{{ s.reps }}</div>
              <button class="stepper" @click="adj(s, 'reps', 1)">+</button>
            </div>
          </div>
          <button v-if="ex.sets.length > 1" class="rm-set" aria-label="Retirer la série" @click="removeSet(ex, si)">✕</button>
        </div>

        <!-- Note de la dernière série (on note série par série) -->
        <div class="diff-row">
          <button
            v-for="d in DIFFS" :key="d.n"
            class="diff-btn" :class="['d' + d.n, { sel: lastSet(ex).difficulty === d.n }]"
            @click="lastSet(ex).difficulty = d.n; live.persist()"
          ><b>{{ d.n }}</b><span>{{ d.label }}</span></button>
        </div>
        <div v-if="showRir" class="rir-row">
          <span class="rir-lbl">RIR (dernière série)</span>
          <q-input v-model.number="lastSet(ex).rir" type="number" dense filled dark class="rir-input" @update:model-value="live.persist()" />
        </div>

        <button class="addset" @click="addSet(ex)">+ Ajouter une série</button>
      </div>

      <button class="addex" @click="pickerOpen = true">+ Ajouter un exercice</button>
    </div>

    <div class="cta-wrap">
      <button class="cta" :disabled="!canFinish" @click="openFinish">Terminer</button>
    </div>

    <!-- Picker d'exercices -->
    <q-dialog v-model="pickerOpen" position="bottom">
      <div class="sheet">
        <div class="grab" />
        <h3 class="font-display">Ajouter un exercice</h3>
        <q-input v-model="search" filled dark dense placeholder="Rechercher…" class="q-mb-sm" clearable />
        <div v-if="loadingLib" class="row flex-center q-pa-md"><q-spinner color="primary" /></div>
        <button v-for="e in filteredLib" :key="e.id" class="alt" @click="pick(e)">
          <div>
            <div class="alt-name">{{ e.name }}</div>
            <div class="alt-meta">{{ e.muscle_primary }}<template v-if="e.equipment"> · {{ e.equipment }}</template></div>
          </div>
          <div class="alt-go">+</div>
        </button>
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useLiveStore, type LiveSet, type LiveExercise } from '@/stores/live';
import { useLogsStore } from '@/stores/logs';
import { useLibraryStore, type ExerciseRow } from '@/stores/library';

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
const showRir = computed(() => profileStore.levelConfig?.effort_signal === 'rir');

// ── Horloge ─────────────────────────────────────────────
const now = ref(Date.now());
let clockInt: ReturnType<typeof setInterval> | undefined;
const clock = computed(() => {
  if (!run.value) return '0:00';
  const sec = Math.max(0, Math.floor((now.value - new Date(run.value.started_at).getTime()) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
});

// ── Séries ──────────────────────────────────────────────
function lastSet(ex: LiveExercise): LiveSet {
  return ex.sets[ex.sets.length - 1]!;
}
function adj(s: LiveSet, key: 'load_kg' | 'reps', d: number) {
  s[key] = Math.max(0, Math.round((s[key] + d) * 10) / 10);
  live.persist();
}
function addSet(ex: LiveExercise) {
  const last = lastSet(ex);
  ex.sets.push({ load_kg: last.load_kg, reps: last.reps, done: true, difficulty: 0, rir: null, comment: '' });
  live.persist();
}
function removeSet(ex: LiveExercise, i: number) {
  if (ex.sets.length <= 1) return;
  ex.sets.splice(i, 1);
  live.persist();
}

const canFinish = computed(() => {
  const r = run.value;
  if (!r || r.exercises.length === 0) return false;
  return r.exercises.every((e) => e.sets.length > 0 && e.sets.every((s) => s.difficulty > 0 && s.reps > 0));
});

// ── Picker bibliothèque ─────────────────────────────────
const pickerOpen = ref(false);
const search = ref('');
const lib = ref<ExerciseRow[]>([]);
const loadingLib = ref(false);
const filteredLib = computed(() => {
  const n = search.value.trim().toLowerCase();
  const base = n ? lib.value.filter((e) => e.name.toLowerCase().includes(n) || (e.muscle_primary ?? '').toLowerCase().includes(n)) : lib.value;
  return base.slice(0, 60);
});
function pick(e: ExerciseRow) {
  live.addExercise({
    id: e.id,
    name: e.name,
    muscle_primary: e.muscle_primary ?? undefined,
    equipment: e.equipment ?? undefined,
  });
  pickerOpen.value = false;
  search.value = '';
}

// ── Fin ─────────────────────────────────────────────────
const finishOpen = ref(false);
const globalDiff = ref(0);
const globalComment = ref('');
const saving = ref(false);
function openFinish() {
  if (!canFinish.value) return;
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

async function quit() {
  // L'état libre reste sauvegardé : reprise possible.
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

onBeforeUnmount(() => clearInterval(clockInt));
</script>

<style scoped lang="scss">
.free-page { background: var(--bg); min-height: 100vh; display: flex; flex-direction: column; }
.top { padding: 14px 16px 12px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--line-soft); }
.iconbtn { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: 18px; display: grid; place-items: center; cursor: pointer; flex: none; }
.top-mid { flex: 1; min-width: 0; }
.top-title { font-weight: 600; font-size: 18px; text-transform: uppercase; }
.top-sub { font-size: 11.5px; color: var(--dim); margin-top: 2px; font-variant-numeric: tabular-nums; }

.scroll { flex: 1; overflow-y: auto; padding: 14px 16px 110px; }
.empty { color: var(--dim); padding: 30px 4px; text-align: center; }

.ex-card { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 14px; padding: 14px; margin-bottom: 12px; }
.ex-head { display: flex; align-items: flex-start; justify-content: space-between; }
.ex-name { font-weight: 600; font-size: 16px; color: var(--text); }
.ex-mus { font-size: 12px; color: var(--dim); margin-top: 2px; }
.rm-ex { width: 30px; height: 30px; border-radius: 9px; border: 1px solid var(--line); background: transparent; color: var(--dim-2); cursor: pointer; flex: none; }

.set { display: grid; grid-template-columns: 28px 1fr 1fr 28px; align-items: center; gap: 10px; padding: 10px 0; }
.set-idx { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; font-weight: 600; font-size: 14px; background: var(--surface-2); color: var(--dim); }
.cell-lbl { font-size: 9.5px; letter-spacing: 1px; text-transform: uppercase; color: var(--dim-2); margin-bottom: 1px; }
.val-line { display: flex; align-items: center; gap: 7px; }
.stepper { width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font-size: 16px; display: grid; place-items: center; cursor: pointer; flex: none; }
.val { font-weight: 600; font-size: 19px; font-variant-numeric: tabular-nums; min-width: 28px; text-align: center; color: var(--accent); small { font-size: 11px; color: var(--dim); font-weight: 400; } }
.rm-set { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--dim-2); cursor: pointer; }

.diff-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
.diff-btn { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 9px 4px 7px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--line); color: var(--dim); cursor: pointer; b { font-family: var(--font-display); font-size: 20px; line-height: 1; } span { font-size: 9.5px; } }
.diff-btn.d1.sel { background: var(--d1); border-color: var(--d1); color: var(--accent-ink); }
.diff-btn.d2.sel { background: var(--d2); border-color: var(--d2); color: var(--accent-ink); }
.diff-btn.d3.sel { background: var(--d3); border-color: var(--d3); color: var(--accent-ink); }
.diff-btn.d4.sel { background: var(--d4); border-color: var(--d4); color: #fff; }
.rir-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.rir-lbl { font-size: 12px; color: var(--dim); }
.rir-input { width: 90px; }

.addset { width: 100%; height: 40px; border-radius: 12px; border: 1px dashed var(--line); background: transparent; color: var(--dim); font-weight: 600; font-size: 13px; cursor: pointer; }
.addex { width: 100%; height: 52px; border-radius: 14px; border: 1.5px dashed var(--accent); background: transparent; color: var(--accent); font-family: var(--font-display); font-weight: 600; font-size: 15px; letter-spacing: 0.5px; cursor: pointer; }

.cta-wrap { position: fixed; left: 0; right: 0; bottom: 0; max-width: 600px; margin: 0 auto; padding: 16px 16px 26px; background: linear-gradient(180deg, #15120e00, var(--bg) 30%); }
.cta { width: 100%; height: 58px; border: none; border-radius: 18px; background: var(--accent); color: var(--accent-ink); font-family: var(--font-display); font-weight: 700; font-size: 18px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; box-shadow: 0 10px 30px -8px #ffd23f55; &:disabled { opacity: 0.5; box-shadow: none; } }

.sheet { width: 100%; background: var(--surface); border-radius: 26px 26px 0 0; border-top: 1px solid var(--line); padding: 10px 18px 26px; max-height: 80vh; overflow-y: auto; h3 { font-size: 20px; text-transform: uppercase; } }
.grab { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 6px auto 16px; }
.muted { color: var(--dim); font-size: 12.5px; margin: 4px 0 14px; }
.alt { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 13px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--line-soft); margin-bottom: 8px; cursor: pointer; }
.alt-name { font-weight: 600; font-size: 14.5px; color: var(--text); }
.alt-meta { font-size: 11.5px; color: var(--dim); margin-top: 2px; }
.alt-go { margin-left: auto; color: var(--accent); font-size: 22px; }
.cfield { width: 100%; min-height: 70px; background: var(--bg); border: 1px solid var(--line); border-radius: 14px; padding: 12px; color: var(--text); font-family: var(--font-ui); font-size: 14px; resize: none; outline: none; &:focus { border-color: var(--accent); } }
</style>
