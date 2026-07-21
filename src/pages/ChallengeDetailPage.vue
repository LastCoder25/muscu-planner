<template>
  <q-page class="cd-page">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="back">‹</button>
      <div class="top-mid">
        <div class="top-title font-display">{{ ch?.exercise_name || 'Challenge' }}</div>
        <div class="top-sub" v-if="ch">
          {{ formatName }} · {{ ch.duration_days }} j ·
          <a class="demo-link" :href="demoUrl" target="_blank" rel="noopener">▶ démo</a>
        </div>
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
      <div ref="scrollBox" class="scroll">
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

        <!-- Suggestion de recalibrage (dépassement OU sous-performance répétés) -->
        <div v-if="showRecal && recalSuggest" class="recal" :class="recalSuggest.dir">
          <div class="recal-txt">
            <b v-if="recalSuggest.dir === 'up'">
              Tu dépasses ton objectif depuis {{ recalSuggest.streak }} jours 💪
            </b>
            <b v-else>Tu n’atteins pas ton objectif depuis {{ recalSuggest.streak }} jours</b>
            <span>
              {{ recalSuggest.dir === 'up' ? 'Monter' : 'Alléger' }} le max de
              {{ recalSuggest.refCur }} à <b>{{ recalSuggest.refNew }} {{ unitLabel }}</b> pour les
              jours restants ?
            </span>
          </div>
          <div class="recal-actions">
            <button class="recal-ok" @click="applyRecal(recalSuggest.refNew)">
              {{ recalSuggest.dir === 'up' ? 'Augmenter' : 'Alléger' }}
            </button>
            <button class="recal-no" @click="dismissRecal">Garder</button>
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
          <div v-if="balance !== 0" class="carry-badge" :class="balance > 0 ? 'ahead' : 'behind'">
            {{
              balance > 0 ? `${carryOn ? 'Réserve' : 'Avance'} +${balance}` : `Retard −${-balance}`
            }}
            {{ unitLabel }}
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
          <!-- Ressenti à la clôture (mode adaptatif) → ajuste la suite -->
          <div v-if="awaitingRpe" class="rpe">
            <div class="rpe-h">C'était comment aujourd'hui ?</div>
            <div class="rpe-row">
              <button class="rpe-btn easy" @click="rateAndAdapt(1)">🙂 Facile</button>
              <button class="rpe-btn ok" @click="rateAndAdapt(2)">💪 Bien dosé</button>
              <button class="rpe-btn hard" @click="rateAndAdapt(3)">🥵 Très dur</button>
            </div>
            <button class="rpe-skip" @click="rateAndAdapt(null)">Passer</button>
          </div>

          <!-- Temps : chrono. Se replie seulement une fois la journée VALIDÉE
               (todayClosed), pas à l'atteinte de l'objectif → excès possible. -->
          <template v-if="isTime">
            <div v-if="todayClosed" class="today-ok">
              <q-icon v-if="todayCompleted" name="check_circle" color="positive" />
              <q-icon v-else name="bedtime" color="primary" />
              Journée validée · {{ chronoDisplay }}
              <button class="corr-link" @click="reopenDay">Reprendre</button>
            </div>
            <div v-else class="exec">
              <div v-if="todayCompleted" class="done-badge">
                <q-icon name="check_circle" color="positive" size="18px" /> Objectif atteint ✅
              </div>
              <button class="chrono-cta" :class="{ running }" @click="toggleChrono">
                <q-icon :name="running ? 'pause' : 'play_arrow'" size="20px" />
                {{ running ? 'Pause' : doneToday > 0 ? 'Reprendre' : 'Démarrer' }}
                <span class="cc-time">{{ chronoDisplay }}</span>
              </button>
              <button class="close-day" @click="closeDay">Valider la journée</button>
            </div>
          </template>

          <!-- Reps : chrono + boutons + correction -->
          <template v-else>
            <div v-if="todayClosed && !correcting && !editMode" class="today-ok">
              <q-icon v-if="todayCompleted" name="check_circle" color="positive" />
              <q-icon v-else name="bedtime" color="primary" />
              Journée validée · {{ doneToday }} {{ unitLabel }}
              <button class="corr-link" @click="correcting = true">Corriger</button>
              <button class="corr-link" @click="reopenDay">Reprendre</button>
            </div>
            <div v-else class="exec">
              <div v-if="todayCompleted && !correcting && !editMode" class="done-badge">
                <q-icon name="check_circle" color="positive" size="18px" /> Objectif atteint ✅ —
                continue pour un excès
              </div>
              <button
                v-if="!editMode"
                class="chrono-cta"
                :class="{ running }"
                @click="toggleChrono"
              >
                <q-icon :name="running ? 'pause' : 'play_arrow'" size="20px" />
                {{ running ? 'Pause' : chronoSec > 0 ? 'Reprendre' : 'Démarrer le chrono' }}
                <span class="cc-time">{{ chronoDisplay }}</span>
              </button>

              <div class="quick-row">
                <button
                  v-for="q in quickAdds"
                  :key="q"
                  class="add"
                  :class="{ editing: editMode, minus: correcting && !editMode }"
                  @click="editMode ? removeQuick(q) : addReps(correcting ? -q : q)"
                >
                  <span v-if="editMode" class="rm">✕ {{ q }}</span>
                  <template v-else>{{ correcting ? '−' : '+' }}{{ q }}</template>
                </button>
                <button
                  v-if="editMode"
                  class="add ghost"
                  aria-label="Ajouter un bouton"
                  @click="addQuickButton"
                >
                  ＋
                </button>
              </div>

              <div class="opts-row">
                <button class="opt" :class="{ on: correcting }" @click="correcting = !correcting">
                  <q-icon name="backspace" size="15px" /> Correction (−)
                </button>
                <button class="opt" :class="{ on: editMode }" @click="editMode = !editMode">
                  <q-icon name="tune" size="15px" /> Gérer
                </button>
                <button v-if="editMode" class="opt" @click="resetQuick">Réinitialiser</button>
              </div>

              <button v-if="!editMode" class="close-day" @click="closeDay">
                Valider la journée
              </button>
            </div>
          </template>
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

        <button v-if="ch.status !== 'abandoned'" class="adjust" @click="extendDialog">
          <q-icon name="add" size="16px" /> Prolonger le défi
        </button>
        <button
          v-if="!statusDone && ch.format !== 'cumulative'"
          class="adjust"
          @click="editDifficulty"
        >
          <q-icon name="tune" size="16px" /> Ajuster la difficulté
        </button>
        <button v-if="!statusDone" class="abandon" @click="confirmAbandon">
          Abandonner le challenge
        </button>
      </div>
    </template>

    <ChallengeCelebration
      :show="celebrate"
      :challenge="ch"
      :achievement-codes="celebrateCodes"
      @close="celebrate = false"
      @see-success="goSuccess"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import {
  challengeStats,
  isChallengeComplete,
  evaluateAchievements,
  challengeBalance,
  effectiveTarget,
  logicalToday,
  challengeRefValue,
  recalibrationSuggestion,
  rescaleRemaining,
  adaptiveDayAdjustment,
  scaleRemaining,
  extendChallenge,
  type Challenge,
  type DayProgress,
} from '@/lib/challenges';
import { formatOption } from '@/data/challengeFormats';
import { useChallengesStore } from '@/stores/challenges';
import ChallengeCelebration from '@/components/ChallengeCelebration.vue';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const store = useChallengesStore();

const id = String(route.params.id);
const loading = ref(true);
const ch = ref<Challenge | null>(null);
const running = ref(false);
let tick: ReturnType<typeof setInterval> | undefined;
const scrollBox = ref<HTMLElement | null>(null);
const awaitingRpe = ref(false); // ressenti à demander après clôture (mode adaptatif)
const celebrate = ref(false); // animation de fin de challenge
const celebrateCodes = ref<string[]>([]);

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
const editMode = ref(false); // gérer (ajouter/retirer) les boutons
const correcting = ref(false); // mode correction : les ajouts deviennent des retraits

function persistQuick() {
  localStorage.setItem(QUICK_KEY, JSON.stringify(quickAdds.value));
}
// Ajoute un bouton « nombre favori » SANS écraser les autres (dédupliqué, trié).
function addQuickButton() {
  $q.dialog({
    title: 'Nouveau bouton',
    message: 'Nombre à ajouter d’un tap (ex. 25).',
    prompt: { model: '', type: 'number' },
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Ajouter', color: 'primary', textColor: 'dark' },
  }).onOk((val: string) => {
    const n = Math.round(Number(val));
    if (!n || n <= 0 || quickAdds.value.includes(n)) return;
    quickAdds.value = [...quickAdds.value, n].sort((a, b) => a - b).slice(0, 8);
    persistQuick();
    editMode.value = false; // on ressort de la gestion → le bouton est utilisable de suite
  });
}
function removeQuick(n: number) {
  quickAdds.value = quickAdds.value.filter((x) => x !== n);
  persistQuick();
}
function resetQuick() {
  quickAdds.value = [1, 5, 10];
  persistQuick();
}

const today = logicalToday(); // « jour d'entraînement » (bascule à 4 h)
const isTime = computed(() => ch.value?.unit === 'time');
const unitLabel = computed(() => (isTime.value ? 'sec' : 'reps'));
const formatName = computed(() =>
  ch.value ? (formatOption(ch.value.format)?.name ?? ch.value.format) : '',
);
const demoUrl = computed(
  () =>
    `https://www.youtube.com/results?search_query=${encodeURIComponent((ch.value?.exercise_name ?? '') + ' exécution technique musculation')}`,
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
const carryOn = computed(() => !!ch.value?.config.carry_over && ch.value.format !== 'cumulative');
const adaptiveOn = computed(() => !!ch.value?.config.adaptive);
// Avance/retard courant (tous défis, pas seulement report activé).
const balance = computed(() => (ch.value ? challengeBalance(ch.value, today) : 0));
const todayTarget = computed(() => {
  if (!ch.value) return 0;
  if (ch.value.format === 'cumulative') return ch.value.config.total ?? 0;
  return carryOn.value ? effectiveTarget(ch.value, dayIndex.value) : stats.value.todayTarget;
});
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
const todayClosed = computed(() => entryOf(dayIndex.value)?.closed ?? false);
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
// Synchronise l'état « validé » du jour (réversible : une correction peut le repasser à faux).
// On valide sur l'objectif de BASE > 0 (l'effectif peut tomber à 0 via la réserve).
function syncComplete(e: DayProgress) {
  if (ch.value!.format === 'cumulative') return;
  const base = ch.value!.daily_targets[e.day] ?? 0;
  if (base <= 0) return;
  const was = e.completed;
  e.completed = e.done >= e.target;
  if (e.completed && !was) $q.notify({ type: 'positive', message: 'Jour validé ✅' });
}
// Report activé : si la réserve couvre déjà le jour (objectif effectif 0), on le valide d'office.
function maybeCoverByReserve() {
  if (!carryOn.value || !inToday.value || todayTarget.value !== 0) return;
  const e = ensureToday();
  e.target = 0;
  if (!e.completed) {
    e.completed = true;
    void afterChange();
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
  }
  await persist(status);
  if (status) {
    // Succès débloqués → affichés en badges dans l'animation de fin.
    try {
      celebrateCodes.value = await store.unlock(evaluateAchievements(store.list));
    } catch {
      celebrateCodes.value = [];
    }
    celebrate.value = true;
  }
}
async function goSuccess() {
  celebrate.value = false;
  await router.push('/challenges?tab=ach');
}

function addReps(n: number) {
  if (!inToday.value) return;
  const e = ensureToday();
  e.done = Math.max(0, e.done + n);
  syncComplete(e);
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
        syncComplete(e);
      }
    }, 1000);
  } else {
    clearInterval(tick);
    void afterChange(); // sauvegarde à la pause
  }
}
// Valide la « journée » : stoppe le chrono, fige la session (même après minuit)
// et remonte sur l'avancement (stats + graphe + calendrier).
function closeDay() {
  if (!inToday.value) return;
  running.value = false;
  clearInterval(tick);
  const e = ensureToday();
  e.closed = true;
  // Adaptatif : on demande le ressenti (une fois) pour ajuster la suite.
  if (adaptiveOn.value && !e.rpe) awaitingRpe.value = true;
  void afterChange();
  void nextTick(() => scrollBox.value?.scrollTo({ top: 0, behavior: 'smooth' }));
}
function reopenDay() {
  const e = ensureToday();
  e.closed = false;
  awaitingRpe.value = false;
  void persist();
}

// Ressenti à la clôture → autorégule les jours restants (silencieux mais visible).
async function rateAndAdapt(rpe: 1 | 2 | 3 | null) {
  const c = ch.value;
  if (!c) return;
  const e = ensureToday();
  if (rpe) e.rpe = rpe;
  awaitingRpe.value = false;

  const base = c.daily_targets[dayIndex.value] ?? 0;
  const ratio = base > 0 ? (e.done || 0) / base : 1;
  const adj = adaptiveDayAdjustment(ratio, rpe ?? undefined);
  const fromDay = dayIndex.value + 1;

  if (fromDay < c.duration_days && adj !== 0) {
    const { daily_targets, config } = scaleRemaining(c, fromDay, 1 + adj);
    c.daily_targets = daily_targets;
    c.config = config;
    try {
      await store.updatePlan(id, daily_targets, config);
      $q.notify({
        type: 'info',
        message: adj > 0 ? 'Suite un peu relevée 💪' : 'Suite un peu allégée 👍',
        timeout: 1800,
      });
    } catch {
      /* silencieux */
    }
  }
  await persist(); // enregistre le rpe
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
    // replace (pas push) : le détail abandonné sort de l'historique → le
    // retour arrière ne retombe pas dessus.
    $q.loading.show({ message: 'Abandon…' });
    store
      .setStatus(id, 'abandoned')
      .then(() => router.replace('/challenges'))
      .catch((e) =>
        $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' }),
      )
      .finally(() => $q.loading.hide());
  });
}
function confirmDelete() {
  $q.dialog({
    title: 'Supprimer',
    message: 'Supprimer définitivement ce challenge ?',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    // replace (pas push) : le détail supprimé sort de l'historique → pas de
    // retour arrière vers un challenge inexistant (« Challenge introuvable »).
    $q.loading.show({ message: 'Suppression…' });
    store
      .remove(id)
      .then(() => router.replace('/challenges'))
      .catch((e) =>
        $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' }),
      )
      .finally(() => $q.loading.hide());
  });
}
// ── Recalibrage de difficulté ──────────────────────────
const RECAL_KEY = `muscu:challenge:recal-dismiss:${id}`;
const recalDismissedRef = ref(localStorage.getItem(RECAL_KEY) ?? '');
const recalSuggest = computed(() => (ch.value ? recalibrationSuggestion(ch.value, today) : null));
// Refusé mémorisé par sens+pic courant : si la situation change, on re-propose.
function recalKey(s: { dir: string; refCur: number }) {
  return `${s.dir}:${s.refCur}`;
}
const showRecal = computed(
  () => !!recalSuggest.value && recalDismissedRef.value !== recalKey(recalSuggest.value),
);
function dismissRecal() {
  if (!recalSuggest.value) return;
  recalDismissedRef.value = recalKey(recalSuggest.value);
  localStorage.setItem(RECAL_KEY, recalDismissedRef.value);
}
async function applyRecal(refNew: number) {
  const c = ch.value;
  if (!c) return;
  const fromDay = Math.max(0, dayIndex.value + 1); // demain → aujourd'hui inchangé
  const { daily_targets, config } = rescaleRemaining(c, fromDay, refNew);
  $q.loading.show({ message: 'Recalcul…' });
  try {
    await store.updatePlan(id, daily_targets, config);
    c.daily_targets = daily_targets;
    c.config = config;
    dismissRecal();
    $q.notify({ type: 'positive', message: 'Difficulté ajustée pour les jours restants 💪' });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    $q.loading.hide();
  }
}
function editDifficulty() {
  const c = ch.value;
  if (!c) return;
  const cur = challengeRefValue(c);
  const label = c.format === 'cumulative' ? 'Nouveau total' : 'Nouvel objectif max (pic)';
  $q.dialog({
    title: 'Ajuster la difficulté',
    message: `${label} — les jours restants sont recalculés à cette échelle.`,
    prompt: { model: String(recalSuggest.value?.refNew ?? cur), type: 'number' },
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Appliquer', color: 'primary', textColor: 'dark' },
  }).onOk((val: string) => {
    const n = Math.round(Number(val));
    if (n > 0) void applyRecal(n);
  });
}

// Prolonger le défi : ajoute des jours ; la prime se recalcule sur la durée totale.
async function applyExtend(add: number) {
  const c = ch.value;
  if (!c || add <= 0) return;
  const { duration_days, daily_targets, config } = extendChallenge(c, add);
  $q.loading.show({ message: 'Prolongation…' });
  try {
    await store.updateDuration(id, duration_days, daily_targets, config);
    c.duration_days = duration_days;
    c.daily_targets = daily_targets;
    c.config = config;
    if (c.status === 'done') {
      c.status = 'active'; // on rouvre : il reste des jours à faire
      await store.setStatus(id, 'active');
    }
    $q.notify({ type: 'positive', message: `Défi prolongé de ${add} j 💪` });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    $q.loading.hide();
  }
}
function extendDialog() {
  const c = ch.value;
  if (!c) return;
  $q.dialog({
    title: 'Prolonger le défi',
    message: `Ajouter combien de jours ? (actuellement ${c.duration_days} j). La prime de fin augmentera avec la durée totale.`,
    prompt: { model: '7', type: 'number' },
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Prolonger', color: 'primary', textColor: 'dark' },
  }).onOk((val: string) => {
    void applyExtend(Math.round(Number(val)));
  });
}

async function back() {
  // router.back() pour ne pas empiler un doublon /challenges dans l'historique
  // (sinon il faut appuyer « retour » plusieurs fois pour revenir à l'accueil).
  if (window.history.state?.back) router.back();
  else await router.push('/challenges');
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
      // Cas normal après suppression : on repart sur la liste sans erreur bruyante.
      await router.replace('/challenges');
      return;
    }
    maybeCoverByReserve();
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
.demo-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}
.today-h {
  font-size: 13px;
  color: var(--dim);
  b {
    color: var(--accent);
    font-family: var(--font-display);
  }
}
.carry-badge {
  display: inline-block;
  margin-top: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-display);
}
.carry-badge.ahead {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 18%, transparent);
}
.carry-badge.behind {
  color: var(--d4);
  background: color-mix(in srgb, var(--d4) 18%, transparent);
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
.chrono-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 52px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
  &.running {
    border-color: var(--accent);
    background: var(--surface-2);
    color: var(--accent);
  }
  .cc-time {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    color: var(--dim);
    font-size: 15px;
  }
  &.running .cc-time {
    color: var(--accent);
  }
}
.close-day {
  margin-top: 8px;
  height: 50px;
  border-radius: 14px;
  border: 1.5px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  cursor: pointer;
}
.close-day:active {
  background: var(--accent);
  color: var(--accent-ink);
}
.done-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--d1) 14%, transparent);
  color: var(--d1);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
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
  &.minus {
    border-color: var(--d4);
    color: var(--d4);
  }
  &.editing {
    border-color: var(--d4);
    color: var(--d4);
    border-style: dashed;
  }
  &.ghost {
    border-style: dashed;
    border-color: var(--dim);
    color: var(--dim);
    background: transparent;
    flex: none;
    width: 52px;
  }
}
.rm {
  font-size: 15px;
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
  &.minus {
    background: var(--d4);
  }
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
  &.on {
    border-color: var(--accent);
    color: var(--accent);
  }
}
.opts-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.opt {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  &.on {
    border-color: var(--d4);
    color: var(--d4);
    background: color-mix(in srgb, var(--d4) 14%, transparent);
  }
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
.corr-link {
  margin-left: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.rpe {
  margin: 6px 0 4px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--accent);
  background: var(--surface-2);
  text-align: center;
}
.rpe-h {
  font-size: 13px;
  color: var(--text);
  font-weight: 600;
  margin-bottom: 10px;
}
.rpe-row {
  display: flex;
  gap: 8px;
}
.rpe-btn {
  flex: 1;
  min-height: 46px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.rpe-btn.easy:active {
  border-color: var(--d1);
  color: var(--d1);
}
.rpe-btn.ok:active {
  border-color: var(--accent);
  color: var(--accent);
}
.rpe-btn.hard:active {
  border-color: var(--d4);
  color: var(--d4);
}
.rpe-skip {
  margin-top: 8px;
  background: none;
  border: none;
  color: var(--dim);
  font-size: 12px;
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

.adjust {
  width: 100%;
  margin-top: 20px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.adjust:active {
  border-color: var(--accent);
}
.abandon {
  width: 100%;
  margin-top: 10px;
  background: none;
  border: none;
  color: var(--d4);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px;
}
.recal {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  background: var(--surface-2);
  border: 1px solid var(--accent);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 14px;
}
.recal-txt {
  flex: 1;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
  color: var(--text);
  b {
    color: var(--accent);
  }
}
.recal-actions {
  display: flex;
  gap: 8px;
}
.recal-ok {
  padding: 8px 14px;
  border-radius: 10px;
  border: none;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.recal-no {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--dim);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
</style>
