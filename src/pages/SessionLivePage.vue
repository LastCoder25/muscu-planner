<template>
  <q-page class="live-page">
    <template v-if="ex">
      <!-- En-tête -->
      <header class="top">
        <button class="iconbtn" aria-label="Quitter" @click="quit">‹</button>
        <div class="top-mid">
          <div class="top-title font-display">{{ run!.name }}</div>
          <div class="top-sub">
            Exo <b>{{ run!.exIndex + 1 }}</b>/{{ run!.exercises.length }} · {{ clock }} ·
            {{ run!.exercises.length - run!.exIndex - 1 }} exos restants
          </div>
        </div>
        <button class="iconbtn" aria-label="Terminer" @click="openFinish">⏹</button>
      </header>

      <!-- Progression par exo -->
      <div class="dots">
        <div
          v-for="(e, i) in run!.exercises"
          :key="i"
          class="dot"
          :class="{ done: i < run!.exIndex, cur: i === run!.exIndex }"
        />
      </div>

      <div class="scroll" ref="scrollEl">
        <!-- Exercice courant -->
        <div class="exo">
          <div class="exo-top">
            <div class="exo-name font-display">{{ ex.name }}</div>
            <div class="exo-actions">
              <button class="swap" @click="swapOpen = true">⇄ Changer</button>
              <button class="swap" @click="skipExercise">⤼ Passer</button>
            </div>
          </div>
          <div class="exo-meta">
            <span v-if="ex.equipment" class="chip">{{ ex.equipment }}</span>
            <span v-if="ex.muscle_primary" class="chip">{{ ex.muscle_primary }}</span>
            <span v-if="ex.unilateral" class="chip uni">par côté</span>
            <span class="chip tgt">Cible {{ ex.planned.sets }} × {{ ex.planned.reps_min }}–{{ ex.planned.reps_max }}{{ ex.planned.unit === 'time' ? ' s' : '' }}</span>
          </div>
        </div>

        <!-- Timer de repos -->
        <div v-if="resting" class="timer">
          <div class="timer-label">Repos</div>
          <div class="ring-wrap">
            <svg width="184" height="184" viewBox="0 0 184 184">
              <circle class="ring-bg" cx="92" cy="92" r="82" />
              <circle
                class="ring-fg" cx="92" cy="92" r="82"
                stroke-dasharray="515" :stroke-dashoffset="515 * (1 - restLeft / restTotal)"
              />
            </svg>
            <div class="ring-num">
              <div class="ring-time font-display">{{ restDisplay }}</div>
              <div class="ring-next">Puis <b>série {{ curSetIndex + 1 }}</b></div>
            </div>
          </div>
          <div class="timer-btns">
            <button class="tbtn" @click="addTime(15)">+15 s</button>
            <button class="tbtn skip" @click="skipRest">Passer le repos</button>
          </div>
        </div>

        <!-- Séries -->
        <div class="sec-h">
          <span>Séries</span>
          <div class="vol">Volume <b>{{ volume }}</b> kg</div>
        </div>

        <div
          v-for="(s, i) in ex.sets"
          :key="i"
          class="set"
          :class="{ done: s.done, cur: i === curSetIndex && !s.done, up: i > curSetIndex && !s.done }"
        >
          <div class="set-idx font-display">{{ i + 1 }}</div>
          <div>
            <div class="cell-lbl">{{ ex.bodyweight ? 'Lest' : 'Charge' }}</div>
            <div class="val-line">
              <button v-if="i === curSetIndex || i === editIdx" class="stepper" @click="adj(s, 'load_kg', -2.5)">−</button>
              <input v-if="i === curSetIndex || i === editIdx" v-model.number="s.load_kg" type="number" inputmode="decimal" min="0" step="0.5" class="valin font-display" aria-label="Charge en kg" @change="i === curSetIndex ? onCurLoadInput() : live.persist()" />
              <div v-else class="val font-display">{{ s.load_kg }}<small>kg</small></div>
              <button v-if="i === curSetIndex || i === editIdx" class="stepper" @click="adj(s, 'load_kg', 2.5)">+</button>
            </div>
          </div>
          <div>
            <div class="cell-lbl">{{ isTimeEx ? 'Sec' : 'Reps' }}</div>
            <div class="val-line">
              <button v-if="i === curSetIndex || i === editIdx" class="stepper" @click="adj(s, 'reps', isTimeEx ? -5 : -1)">−</button>
              <input v-if="i === curSetIndex || i === editIdx" v-model.number="s.reps" type="number" inputmode="numeric" min="0" class="valin font-display" :aria-label="isTimeEx ? 'Secondes' : 'Répétitions'" @change="live.persist()" />
              <div v-else class="val font-display">{{ s.reps }}</div>
              <button v-if="i === curSetIndex || i === editIdx" class="stepper" @click="adj(s, 'reps', isTimeEx ? 5 : 1)">+</button>
            </div>
          </div>
          <div>
            <button v-if="i === editIdx" class="okedit" aria-label="Terminer la modification" @click="editIdx = -1">✓</button>
            <button v-else-if="s.done" class="dpill editable" :class="'d' + (s.difficulty || 2)" aria-label="Modifier la série" @click="editIdx = i">{{ s.difficulty || '✎' }}</button>
            <button v-else-if="i === curSetIndex && ex.sets.length > 1" class="rm" @click="live.removeSet(i)">✕</button>
          </div>
          <div v-if="i === editIdx" class="edit-diff">
            <span class="edit-lbl">Difficulté</span>
            <button v-for="d in DIFFS" :key="d.n" class="ediff" :class="['d' + d.n, { sel: s.difficulty === d.n }]" @click="s.difficulty = d.n; live.persist()">{{ d.n }}</button>
            <button v-if="ex.sets.length > 1" class="ediff rm" aria-label="Supprimer la série" @click="removeAt(i)">✕</button>
          </div>
          <div v-if="s.done && s.comment && i !== editIdx" class="comment-mini">{{ s.comment }}</div>
          <div v-if="s.done && isDense && i !== editIdx" class="set-tonnage font-display">{{ s.load_kg * s.reps }} kg</div>
        </div>

        <button class="addset" @click="live.addSet()">+ Ajouter une série</button>

        <!-- Ressenti de la série courante -->
        <div v-if="curSet" class="comment">
          <div class="comment-head"><span>Ressenti de la série</span><em>noter puis valider</em></div>
          <div class="diff-row">
            <button
              v-for="d in DIFFS" :key="d.n"
              class="diff-btn" :class="['d' + d.n, { sel: curSet.difficulty === d.n }]"
              @click="curSet.difficulty = d.n; live.persist()"
            >
              <b>{{ d.n }}</b><span>{{ d.label }}</span>
            </button>
          </div>
          <div v-if="showRir" class="rir-row">
            <span class="rir-lbl">RIR (reps en réserve)</span>
            <q-input
              v-model.number="curSet.rir" type="number" dense filled
              class="rir-input" @update:model-value="live.persist()"
            />
          </div>
          <div class="cbox">
            <textarea
              v-model="curSet.comment" class="cfield" aria-label="Commentaire de la série"
              placeholder="Note libre : « épaule droite tire un peu »… (optionnel)"
              @change="live.persist()"
            />
            <button class="mic" :class="{ rec: recording }" @click="toggleMic">🎤</button>
          </div>
        </div>
      </div>

      <!-- CTA collant -->
      <div class="cta-wrap">
        <button v-if="!resting && curSet" class="cta-mini" @click="openFinish">Terminer ▸</button>
        <button v-if="resting" class="cta ghost" @click="skipRest">Passer le repos</button>
        <button v-else-if="curSet" class="cta" :disabled="!curSet.difficulty" @click="validateSet">
          Valider la série
        </button>
        <button v-else-if="run!.exIndex < run!.exercises.length - 1" class="cta" @click="nextExercise">
          Exercice suivant
        </button>
        <button v-else class="cta" @click="openFinish">Terminer la séance</button>
      </div>
    </template>

    <div v-else class="column flex-center" style="min-height: 60vh">
      <q-spinner color="primary" size="32px" />
    </div>

    <!-- Sheet changer d'exo -->
    <SwapSheet v-model="swapOpen" :exercise="ex" @swap="onSwap" />

    <!-- Dialog fin de séance -->
    <q-dialog v-model="finishOpen" position="bottom">
      <div class="finish-sheet">
        <div class="grab" />
        <h3 class="font-display">Fin de séance</h3>
        <p>Comment était la séance dans l'ensemble ?</p>
        <div class="diff-row">
          <button
            v-for="d in DIFFS" :key="d.n"
            class="diff-btn" :class="['d' + d.n, { sel: globalDiff === d.n }]"
            @click="globalDiff = d.n"
          >
            <b>{{ d.n }}</b><span>{{ d.label }}</span>
          </button>
        </div>
        <textarea v-model="globalComment" class="cfield full" aria-label="Commentaire global" placeholder="Commentaire global (optionnel)" />
        <button class="cta q-mt-md" :disabled="saving" @click="finish">
          {{ saving ? 'Enregistrement…' : 'Enregistrer le bilan' }}
        </button>
        <button class="abandon" :disabled="saving" @click="stopSession">Arrêter sans enregistrer</button>
      </div>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useSessionsStore } from '@/stores/sessions';
import { useLiveStore, type LiveSet } from '@/stores/live';
import { useLogsStore } from '@/stores/logs';
import SwapSheet from '@/components/SwapSheet.vue';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const profileStore = useProfileStore();
const sessionsStore = useSessionsStore();
const live = useLiveStore();
const logs = useLogsStore();

const DIFFS = [
  { n: 1, label: 'Facile' },
  { n: 2, label: 'Modéré' },
  { n: 3, label: 'Dur' },
  { n: 4, label: 'Max' },
];

const run = computed(() => live.run);
const ex = computed(() => live.current);
const curSetIndex = computed(() => ex.value?.sets.findIndex((s) => !s.done) ?? -1);
const curSet = computed(() => (curSetIndex.value >= 0 ? ex.value!.sets[curSetIndex.value]! : null));
const volume = computed(() =>
  ex.value ? ex.value.sets.filter((s) => s.done).reduce((a, s) => a + s.load_kg * s.reps, 0) : 0,
);
const showRir = computed(() => profileStore.levelConfig?.effort_signal === 'rir');
const isDense = computed(() => profileStore.levelConfig?.ui_density === 'dense');
const isTimeEx = computed(() => ex.value?.planned.unit === 'time');

const swapOpen = ref(false);
const scrollEl = ref<HTMLElement | null>(null);
// Index de la série en cours de modification (corriger poids/reps/difficulté d'une série déjà faite).
const editIdx = ref(-1);
function removeAt(i: number) {
  live.removeSet(i);
  editIdx.value = -1;
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
function startRest(seconds?: number) {
  resting.value = true;
  restTotal.value = restLeft.value = seconds ?? ex.value?.rest_seconds ?? 90;
  clearInterval(restInt);
  restInt = setInterval(() => {
    restLeft.value--;
    if (restLeft.value <= 0) skipRest();
  }, 1000);
  nextTick(() => scrollEl.value?.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => undefined);
}
function addTime(n: number) {
  restLeft.value += n;
  restTotal.value = Math.max(restTotal.value, restLeft.value);
}
function skipRest() {
  clearInterval(restInt);
  resting.value = false;
}

// ── Actions séries ──────────────────────────────────────
function adj(s: LiveSet, key: 'load_kg' | 'reps', d: number) {
  s[key] = Math.max(0, Math.round((s[key] + d) * 10) / 10);
  if (key === 'load_kg' && s === curSet.value) propagateLoad();
  live.persist();
}
// Reporte la charge de la série courante sur les séries suivantes non faites
// (les charges d'un exo se ressemblent ; pratique après un changement d'exo).
function propagateLoad() {
  const e = ex.value;
  const i = curSetIndex.value;
  if (!e || i < 0) return;
  const load = e.sets[i]!.load_kg;
  for (let j = i + 1; j < e.sets.length; j++) {
    if (!e.sets[j]!.done) e.sets[j]!.load_kg = load;
  }
}
function onCurLoadInput() {
  propagateLoad();
  live.persist();
}
function skipExercise() {
  skipRest();
  editIdx.value = -1;
  if (run.value && run.value.exIndex < run.value.exercises.length - 1) nextExercise();
  else openFinish();
}
function validateSet() {
  const s = curSet.value;
  if (!s || !s.difficulty) return;
  const restSec = s.rest_seconds ?? ex.value?.rest_seconds; // repos propre à la série
  s.done = true;
  editIdx.value = -1;
  live.persist();
  if (curSetIndex.value >= 0) startRest(restSec); // il reste des séries
}
function nextExercise() {
  skipRest();
  editIdx.value = -1;
  live.goToExercise(run.value!.exIndex + 1);
  nextTick(() => scrollEl.value?.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => undefined);
}
function onSwap(target: { id: string; name: string; muscle_primary?: string; equipment?: string }) {
  live.swapCurrent(target);
  $q.notify({ message: 'Exo remplacé · charge conservée' });
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
  if (recording.value) {
    rec?.stop();
    return;
  }
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

// ── Fin de séance ───────────────────────────────────────
const finishOpen = ref(false);
const globalDiff = ref(0);
const globalComment = ref('');
const saving = ref(false);
function openFinish() {
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
    $q.notify({ type: 'positive', message: 'Séance enregistrée 💪' });
    await router.push(`/bilan/${log.id}`);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec de l’enregistrement.' });
  } finally {
    saving.value = false;
  }
}

async function quit() {
  // L'état reste sauvegardé en local : reprise possible plus tard.
  await router.push('/');
}

// Arrêter la séance sans rien enregistrer (abandon).
function stopSession() {
  $q.dialog({
    title: 'Arrêter la séance',
    message: 'La séance en cours sera abandonnée et rien ne sera enregistré. Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Arrêter', color: 'negative' },
  }).onOk(() => {
    live.clear();
    finishOpen.value = false;
    router.push('/').catch(() => undefined);
  });
}

// ── Init ────────────────────────────────────────────────
onMounted(async () => {
  const id = String(route.params.id);
  if (sessionsStore.list.length === 0) {
    try { await sessionsStore.fetchMine(); } catch { /* géré plus bas */ }
  }
  const row = sessionsStore.list.find((s) => s.id === id);
  if (!row) {
    $q.notify({ type: 'negative', message: 'Séance introuvable.' });
    await router.push('/');
    return;
  }
  live.start(row.payload, { resume: true });
  clockInt = setInterval(() => { now.value = Date.now(); }, 1000);
});

onBeforeUnmount(() => {
  clearInterval(clockInt);
  clearInterval(restInt);
  rec?.stop();
});
</script>

<style scoped lang="scss">
.live-page {
  background: radial-gradient(1200px 600px at 50% -10%, #221c14 0%, transparent 60%), var(--bg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.top { padding: 14px 18px 12px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--line-soft); }
.iconbtn {
  width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line);
  background: var(--surface); color: var(--text); font-size: 18px; display: grid; place-items: center; cursor: pointer; flex: none;
}
.top-mid { flex: 1; min-width: 0; }
.top-title { font-weight: 600; font-size: 18px; letter-spacing: 0.3px; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.top-sub { font-size: 11.5px; color: var(--dim); margin-top: 2px; font-variant-numeric: tabular-nums; b { color: var(--accent); font-weight: 600; } }
.dots { display: flex; gap: 6px; padding: 14px 18px 4px; }
.dot { flex: 1; height: 5px; border-radius: 3px; background: var(--surface-2); }
.dot.done { background: var(--d1); }
.dot.cur { background: var(--accent); box-shadow: 0 0 0 3px #ffd23f22; }
.scroll { flex: 1; overflow-y: auto; padding: 6px 18px 160px; }

.exo { padding: 14px 2px 4px; }
.exo-top { display: flex; align-items: flex-start; gap: 10px; }
.exo-name { font-weight: 700; font-size: 30px; line-height: 0.98; text-transform: uppercase; flex: 1; }
.exo-actions { display: flex; flex-direction: column; gap: 6px; flex: none; }
.swap { flex: none; height: 34px; padding: 0 13px; border-radius: 11px; background: var(--surface); border: 1px solid var(--line); color: var(--text); font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.exo-meta { display: flex; gap: 8px; margin-top: 11px; flex-wrap: wrap; }
.chip { font-size: 11px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; color: var(--dim); background: var(--surface); border: 1px solid var(--line-soft); padding: 5px 10px; border-radius: 8px; }
.chip.tgt { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
.chip.uni { color: var(--accent); border-color: var(--accent); }

.timer { margin: 16px 0 4px; border: 1px solid var(--line); border-radius: 22px; background: linear-gradient(180deg, var(--surface-2), var(--surface)); padding: 22px; }
.timer-label { font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: var(--accent); text-align: center; }
.ring-wrap { position: relative; width: 184px; height: 184px; margin: 10px auto 6px; }
.ring-wrap svg { transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: var(--surface-3); stroke-width: 9; }
.ring-fg { fill: none; stroke: var(--accent); stroke-width: 9; stroke-linecap: round; transition: stroke-dashoffset 1s linear; }
.ring-num { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ring-time { font-weight: 600; font-size: 52px; line-height: 1; font-variant-numeric: tabular-nums; }
.ring-next { font-size: 11px; color: var(--dim); margin-top: 4px; b { color: var(--text); } }
.timer-btns { display: flex; gap: 10px; margin-top: 14px; }
.tbtn { flex: 1; height: 46px; border-radius: 13px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-weight: 600; font-size: 14px; cursor: pointer; }
.tbtn.skip { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }

.sec-h { display: flex; align-items: center; justify-content: space-between; margin: 22px 2px 10px; span { font-size: 12px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color: var(--dim); } }
.vol { font-family: var(--font-display); font-size: 13px; color: var(--dim); b { color: var(--accent); } }

.set { display: grid; grid-template-columns: 34px 1fr 1fr 28px; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line-soft); margin-bottom: 9px; }
.set.done { opacity: 0.66; }
.set.cur { border-color: var(--accent); background: var(--surface-2); box-shadow: 0 0 0 1px var(--accent); }
.set.up { opacity: 0.5; }
.set-idx { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-weight: 600; font-size: 17px; background: var(--surface-2); color: var(--dim); }
.set.cur .set-idx { background: var(--accent); color: var(--accent-ink); }
.set.done .set-idx { background: var(--surface-2); color: var(--d1); }
.cell-lbl { font-size: 9.5px; letter-spacing: 1px; text-transform: uppercase; color: var(--dim-2); margin-bottom: 1px; }
.val-line { display: flex; align-items: center; gap: 7px; }
.stepper { width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font-size: 16px; display: grid; place-items: center; cursor: pointer; flex: none; }
.val { font-weight: 600; font-size: 21px; font-variant-numeric: tabular-nums; min-width: 30px; text-align: center; small { font-size: 12px; color: var(--dim); font-weight: 400; } }
.valin { width: 64px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; color: var(--accent); font-weight: 600; font-size: 19px; text-align: center; padding: 5px 2px; outline: none; -moz-appearance: textfield; appearance: textfield; &:focus { border-color: var(--accent); } &::-webkit-outer-spin-button, &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; } }
.set.cur .val { color: var(--accent); }
.dpill { justify-self: end; width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; font-family: var(--font-display); font-weight: 600; font-size: 16px; color: var(--accent-ink); }
.dpill.d1 { background: var(--d1); } .dpill.d2 { background: var(--d2); } .dpill.d3 { background: var(--d3); } .dpill.d4 { background: var(--d4); color: #fff; }
.rm { justify-self: end; width: 28px; height: 28px; border-radius: 9px; border: 1px solid var(--line); background: transparent; color: var(--dim-2); cursor: pointer; }
.dpill.editable { cursor: pointer; border: none; }
.okedit { justify-self: end; width: 28px; height: 28px; border-radius: 9px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); font-weight: 700; cursor: pointer; }
.edit-diff { grid-column: 1/5; display: flex; align-items: center; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
.edit-lbl { font-size: 11px; color: var(--dim); margin-right: 2px; }
.ediff { width: 34px; height: 30px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--dim); font-family: var(--font-display); font-weight: 600; cursor: pointer; }
.ediff.d1.sel { background: var(--d1); border-color: var(--d1); color: var(--accent-ink); }
.ediff.d2.sel { background: var(--d2); border-color: var(--d2); color: var(--accent-ink); }
.ediff.d3.sel { background: var(--d3); border-color: var(--d3); color: var(--accent-ink); }
.ediff.d4.sel { background: var(--d4); border-color: var(--d4); color: #fff; }
.ediff.rm { color: var(--d4); border-color: var(--line); margin-left: auto; }
.comment-mini { grid-column: 2/5; font-size: 11.5px; color: var(--dim); font-style: italic; }
.set-tonnage { grid-column: 2/5; font-size: 11px; color: var(--dim-2); letter-spacing: 0.3px; }
.addset { width: 100%; height: 44px; border-radius: 13px; border: 1px dashed var(--line); background: transparent; color: var(--dim); font-weight: 600; font-size: 13px; cursor: pointer; margin-top: 2px; }

.comment { margin-top: 22px; }
.comment-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 11px; span { font-size: 12px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color: var(--dim); } em { font-style: normal; font-size: 11px; color: var(--dim-2); } }
.diff-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
.diff-btn { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 11px 4px 9px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); color: var(--dim); cursor: pointer; b { font-family: var(--font-display); font-size: 24px; font-weight: 600; line-height: 1; } span { font-size: 10px; } }
.diff-btn.d1.sel { background: var(--d1); border-color: var(--d1); color: var(--accent-ink); }
.diff-btn.d2.sel { background: var(--d2); border-color: var(--d2); color: var(--accent-ink); }
.diff-btn.d3.sel { background: var(--d3); border-color: var(--d3); color: var(--accent-ink); }
.diff-btn.d4.sel { background: var(--d4); border-color: var(--d4); color: #fff; }
.rir-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 12px; }
.rir-lbl { font-size: 12px; color: var(--dim); }
.rir-input { width: 90px; }
.cbox { display: flex; gap: 10px; align-items: stretch; }
.cfield { flex: 1; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 13px 14px; color: var(--text); font-family: var(--font-ui); font-size: 14px; line-height: 1.4; min-height: 52px; resize: none; outline: none; &:focus { border-color: var(--accent); } &.full { width: 100%; } }
.mic { width: 52px; flex: none; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--accent); font-size: 22px; cursor: pointer; display: grid; place-items: center; }
.mic.rec { background: var(--accent); color: var(--accent-ink); }

.cta-wrap { position: fixed; left: 0; right: 0; bottom: 0; max-width: 600px; margin: 0 auto; padding: 16px 18px 26px; background: linear-gradient(180deg, #15120e00, var(--bg) 30%); }
.cta { width: 100%; height: 60px; border: none; border-radius: 18px; background: var(--accent); color: var(--accent-ink); font-family: var(--font-display); font-weight: 700; font-size: 19px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; box-shadow: 0 10px 30px -8px #ffd23f55; &:disabled { opacity: 0.5; box-shadow: none; } }
.cta.ghost { background: var(--surface); color: var(--text); border: 1px solid var(--line); box-shadow: none; }
.cta-mini { position: absolute; right: 18px; top: -42px; height: 38px; padding: 0 16px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); color: var(--dim); font-size: 12px; font-weight: 600; cursor: pointer; }

.finish-sheet { width: 100%; background: var(--surface); border-radius: 26px 26px 0 0; border-top: 1px solid var(--line); padding: 10px 18px 26px; h3 { font-size: 20px; text-transform: uppercase; } p { font-size: 12.5px; color: var(--dim); margin: 4px 0 14px; } }
.grab { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 6px auto 16px; }
.abandon { width: 100%; margin-top: 10px; background: none; border: none; color: var(--d4); font-size: 13px; font-weight: 600; cursor: pointer; padding: 8px; &:disabled { opacity: 0.5; } }
</style>
