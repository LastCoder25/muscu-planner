<template>
  <q-page class="combo-session">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="phase === 'run' ? cancel() : router.back()">
        ‹
      </button>
      <div class="top-title font-display">Séance · Défi 360</div>
      <div class="top-spacer" />
    </header>

    <div v-if="!c" class="row flex-center q-pa-lg"><q-spinner color="primary" /></div>

    <!-- Configuration de la séance -->
    <template v-else-if="phase === 'config'">
      <p class="intro">
        Choisis <b>combien de séries</b> tu veux faire, réparties sur les exos qu'il te reste.
        Chaque série ≈ 40 s d'exécution + le repos choisi.
      </p>
      <div class="cfg">
        <div class="cfg-lbl">Nombre de séries</div>
        <div class="chips">
          <button
            v-for="n in SET_COUNTS"
            :key="n"
            class="chip"
            :class="{ on: targetSets === n }"
            @click="targetSets = n"
          >
            {{ n }}
          </button>
        </div>
      </div>
      <div class="cfg">
        <div class="cfg-lbl">Repos entre séries</div>
        <div class="chips">
          <button
            v-for="r in RESTS"
            :key="r"
            class="chip"
            :class="{ on: restSec === r }"
            @click="restSec = r"
          >
            {{ r }} s
          </button>
        </div>
      </div>
      <div class="cfg">
        <div class="cfg-lbl">Exercices</div>
        <div class="chips">
          <button class="chip" :class="{ on: pickMode === 'auto' }" @click="pickMode = 'auto'">
            ✨ Automatique
          </button>
          <button class="chip" :class="{ on: pickMode === 'manual' }" @click="pickMode = 'manual'">
            ✍️ Choisir
          </button>
        </div>
      </div>
      <!-- Sélection manuelle des exos (parmi ceux qu'il reste à faire) -->
      <div v-if="pickMode === 'manual'" class="picklist">
        <div v-if="!availableLegs.length" class="empty">Tout est déjà fait cette semaine 🎉</div>
        <button
          v-for="leg in availableLegs"
          :key="leg.exercise_id"
          class="pick"
          :class="{ on: chosenIds.includes(leg.exercise_id) }"
          @click="toggleLeg(leg.exercise_id)"
        >
          <span class="pick-check">{{ chosenIds.includes(leg.exercise_id) ? '☑' : '☐' }}</span>
          <span class="pick-name">{{ leg.exercise_name }}</span>
          <span class="pick-rem">{{ legRemaining(leg) }} {{ legUnitLabel(leg) }} restantes</span>
        </button>
      </div>
      <div class="preview">
        <b>{{ previewSets }}</b> séries · ~{{ previewMinutes }} min · {{ previewExos }} exo{{
          previewExos > 1 ? 's' : ''
        }}
      </div>
      <div v-if="previewExos === 0" class="empty">
        Tout est déjà fait cette semaine 🎉 Rien à générer.
      </div>
      <q-btn
        v-else
        class="full-width q-mt-md"
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="play_arrow"
        label="Commencer la séance"
        @click="start"
      />
    </template>

    <!-- Runner -->
    <template v-else>
      <div class="run-head">
        <span class="rh-time font-display">{{ elapsedLabel }}</span>
        <span class="rh-sets">{{ validatedCount }}/{{ totalSets }} séries</span>
      </div>
      <div v-if="restLeft > 0" class="rest-banner">Repos · {{ restLeft }} s</div>

      <div v-for="(exo, i) in session" :key="exo.exercise_id" class="s-exo">
        <div class="se-head">
          <span class="se-name">{{ exo.exercise_name }}</span>
          <span v-if="exo.weight_kg" class="se-kg">{{ exo.weight_kg }} kg</span>
        </div>
        <div class="se-sets">
          <button
            v-for="(reps, j) in exo.sets"
            :key="j"
            class="s-set"
            :class="{ done: isDone(i, j) }"
            @click="validate(i, j, reps)"
          >
            <span v-if="isDone(i, j)">✓ {{ doneReps(i, j) }}</span>
            <template v-else>{{ reps }}</template>
          </button>
          <!-- Ajuster le nb de séries de cet exo (en faire plus / moins). -->
          <button class="s-adj" title="Une série de plus" @click="addSetSlot(i)">＋</button>
          <button
            class="s-adj"
            :disabled="!canRemoveSlot(i)"
            title="Retirer la dernière série (non faite)"
            @click="removeSetSlot(i)"
          >
            −
          </button>
        </div>
      </div>

      <q-btn
        class="full-width q-mt-md"
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="check"
        label="Terminer la séance"
        @click="finish"
      />
      <button class="cancel-btn" @click="cancel">Annuler la séance</button>
    </template>

    <SetLogDialog
      v-model="logOpen"
      :title="logExoName"
      :assistable="logAssistable"
      :initial-reps="logReps"
      :initial-weight="logWeight"
      :initial-assisted="logAssisted"
      @save="onLogSave"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useComboStore } from '@/stores/combo';
import {
  buildComboSession,
  comboSessionDurationMin,
  legRemaining,
  legUnitLabel,
  type ComboSessionExo,
} from '@/lib/combo';
import { logicalToday } from '@/lib/challenges';
import SetLogDialog from '@/components/SetLogDialog.vue';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const combo = useComboStore();

const id = String(route.params.id);
const c = computed(() => combo.list.find((x) => x.id === id) ?? null);

const SET_COUNTS = [6, 9, 12, 15, 20];
const RESTS = [30, 60, 90];
const targetSets = ref(12);
const restSec = ref(60);
const phase = ref<'config' | 'run'>('config');

// Choix des exos : auto (tous) ou manuel (sélection).
const pickMode = ref<'auto' | 'manual'>('auto');
const chosenIds = ref<string[]>([]);
// Exos encore à faire cette semaine (candidats à la séance).
const availableLegs = computed(() => (c.value?.legs ?? []).filter((l) => legRemaining(l) > 0));
function toggleLeg(id: string) {
  chosenIds.value = chosenIds.value.includes(id)
    ? chosenIds.value.filter((x) => x !== id)
    : [...chosenIds.value, id];
}
// ids à inclure : sélection manuelle non vide, sinon tous (auto).
const includeIds = computed(() =>
  pickMode.value === 'manual' && chosenIds.value.length ? chosenIds.value : undefined,
);

// Aperçu (avant de commencer) — recalculé selon nb de séries/repos/sélection.
const previewSession = computed(() =>
  c.value
    ? buildComboSession(c.value, {
        sets: targetSets.value,
        restSec: restSec.value,
        ...(includeIds.value ? { includeIds: includeIds.value } : {}),
      })
    : [],
);
// Séries réellement plaçables (borné par les séries restantes) + durée estimée.
const previewSets = computed(() => previewSession.value.reduce((a, e) => a + e.sets.length, 0));
const previewMinutes = computed(() => comboSessionDurationMin(previewSets.value, restSec.value));
const previewExos = computed(() => previewSession.value.length);

// Séance générée au démarrage. Les séries validées sont accumulées LOCALEMENT
// (pas d'enregistrement en direct) → on ne commite qu'à la fin (ou au choix à
// l'annulation). Le nb de séries par exo est ajustable pendant la séance.
const session = ref<ComboSessionExo[]>([]);
// Séries validées, clé `i-j` → { reps, weight, assisted } saisis par l'utilisateur.
const logged = ref<Record<string, { reps: number; weight: number | null; assisted: boolean }>>({});
const totalSets = computed(() => session.value.reduce((a, e) => a + e.sets.length, 0));
const validatedCount = computed(() => Object.keys(logged.value).length);
function isDone(i: number, j: number) {
  return `${i}-${j}` in logged.value;
}
function doneReps(i: number, j: number) {
  return logged.value[`${i}-${j}`]?.reps ?? 0;
}
function canRemoveSlot(i: number) {
  const exo = session.value[i];
  if (!exo || exo.sets.length === 0) return false;
  return !isDone(i, exo.sets.length - 1); // on ne retire pas une série déjà faite
}
function addSetSlot(i: number) {
  const exo = session.value[i];
  if (!exo) return;
  exo.sets.push(exo.sets[exo.sets.length - 1] ?? 10); // même reps que la dernière
}
function removeSetSlot(i: number) {
  if (!canRemoveSlot(i)) return;
  session.value[i]!.sets.pop();
}

// Chrono séance + repos.
const elapsed = ref(0);
const restLeft = ref(0);
let tick: ReturnType<typeof setInterval> | undefined;
const elapsedLabel = computed(
  () => `${Math.floor(elapsed.value / 60)}:${String(elapsed.value % 60).padStart(2, '0')}`,
);

function start() {
  // Copie profonde des sets (tableaux mutables → ajout/retrait de séries).
  session.value = previewSession.value.map((e) => ({ ...e, sets: [...e.sets] }));
  logged.value = {};
  phase.value = 'run';
  tick = setInterval(() => {
    elapsed.value++;
    if (restLeft.value > 0) restLeft.value--;
  }, 1000);
}

// Ouverture du dialogue de saisie (reps + poids + assisté) pour une série.
const logOpen = ref(false);
const logSlot = ref<{ i: number; j: number } | null>(null);
const logExoName = ref('');
const logReps = ref(10);
const logWeight = ref<number | null>(null);
const logAssisted = ref(false);
const logAssistable = ref(false);

function validate(i: number, j: number, reps: number) {
  const exo = session.value[i];
  if (!exo) return;
  const leg = c.value?.legs.find((l) => l.exercise_id === exo.exercise_id);
  const prev = logged.value[`${i}-${j}`];
  logSlot.value = { i, j };
  logExoName.value = exo.exercise_name;
  logReps.value = prev?.reps ?? reps;
  logWeight.value = prev?.weight ?? exo.weight_kg ?? null;
  logAssisted.value = prev?.assisted ?? false;
  logAssistable.value = !!leg?.assistable;
  logOpen.value = true;
}
function onLogSave(v: { reps: number; weight: number | null; assisted: boolean }) {
  const slot = logSlot.value;
  if (!slot) return;
  const key = `${slot.i}-${slot.j}`;
  const wasDone = key in logged.value;
  logged.value = { ...logged.value, [key]: v };
  if (!wasDone) restLeft.value = restSec.value; // repos après une NOUVELLE série
  if (validatedCount.value >= totalSets.value) {
    $q.notify({ type: 'positive', message: 'Toutes les séries faites 💪' });
  }
}

// Enregistre au défi toutes les séries validées localement (à la fin / au choix).
function commitLogged() {
  const today = logicalToday();
  const entries = Object.entries(logged.value) as [
    string,
    { reps: number; weight: number | null; assisted: boolean },
  ][];
  for (const [key, v] of entries) {
    const i = Number(key.split('-')[0]);
    const exo = session.value[i];
    if (exo) combo.addSet(id, exo.exercise_id, today, v.reps, v.weight, v.assisted);
  }
}
function finish() {
  const n = validatedCount.value;
  if (n > 0) commitLogged();
  $q.notify({ type: 'positive', message: `Séance terminée · ${n} série${n > 1 ? 's' : ''}` });
  void router.replace(`/combo/${id}`);
}
function cancel() {
  const n = validatedCount.value;
  if (n === 0) {
    void router.replace(`/combo/${id}`);
    return;
  }
  $q.dialog({
    title: 'Annuler la séance ?',
    message: `Tu as fait ${n} série${n > 1 ? 's' : ''}. Les conserver dans ton Défi 360 ?`,
    ok: { label: 'Conserver', color: 'primary' },
    cancel: { label: 'Jeter', flat: true, color: 'negative' },
  })
    .onOk(() => {
      commitLogged();
      $q.notify({ type: 'positive', message: `${n} série${n > 1 ? 's' : ''} conservée${n > 1 ? 's' : ''}` });
      void router.replace(`/combo/${id}`);
    })
    .onCancel(() => {
      void router.replace(`/combo/${id}`);
    });
}

onMounted(async () => {
  if (!combo.loaded) await combo.fetchMine().catch(() => undefined);
});
onUnmounted(() => clearInterval(tick));
</script>

<style scoped lang="scss">
.combo-session {
  background: var(--bg);
  min-height: 100vh;
  padding: 0 16px 40px;
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
  font-size: 26px;
  cursor: pointer;
  width: 32px;
}
.top-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 700;
}
.top-spacer {
  width: 32px;
}
.intro {
  font-size: 13px;
  color: var(--dim);
  line-height: 1.5;
}
.cfg {
  margin-bottom: 14px;
}
.cfg-lbl {
  font-size: 12.5px;
  color: var(--dim);
  margin-bottom: 6px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.chip.on {
  border-color: var(--accent);
  color: var(--accent);
}
.picklist {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.pick {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.pick.on {
  border-color: var(--accent);
}
.pick-check {
  font-size: 16px;
  color: var(--accent);
}
.pick-name {
  flex: 1;
  font-weight: 600;
  font-size: 14px;
}
.pick-rem {
  font-size: 11px;
  color: var(--dim);
}
.preview {
  font-size: 13px;
  color: var(--text);
  margin-top: 6px;
}
.empty {
  color: var(--dim);
  padding: 16px 0;
  text-align: center;
}
.run-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}
.rh-time {
  font-size: 26px;
  font-weight: 800;
  color: var(--accent);
}
.rh-sets {
  font-size: 13px;
  color: var(--dim);
}
.rest-banner {
  background: var(--surface-2);
  border: 1px solid var(--accent);
  border-radius: 10px;
  padding: 8px 12px;
  text-align: center;
  color: var(--accent);
  font-weight: 600;
  margin-bottom: 10px;
}
.s-exo {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 8px;
}
.se-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}
.se-name {
  font-weight: 600;
  font-size: 14.5px;
  color: var(--text);
}
.se-kg {
  font-size: 11px;
  color: var(--dim);
}
.se-sets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.s-set {
  min-width: 52px;
  height: 46px;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
}
.s-set.done {
  background: var(--d1);
  border-color: var(--d1);
  color: var(--accent-ink, #15120e);
  font-size: 13px;
}
.s-adj {
  min-width: 40px;
  height: 46px;
  border-radius: 10px;
  border: 1px dashed var(--line);
  background: transparent;
  color: var(--dim);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}
.s-adj:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.cancel-btn {
  display: block;
  margin: 12px auto 0;
  background: none;
  border: none;
  color: var(--dim);
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
}
</style>
