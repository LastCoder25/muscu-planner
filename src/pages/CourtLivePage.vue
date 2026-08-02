<template>
  <q-page class="court-live">
    <div v-if="!run" class="empty">
      Aucune séance en cours.
      <q-btn flat no-caps color="primary" label="Retour au tennis" @click="goTennis" />
    </div>

    <template v-else>
      <header class="bar">
        <button class="ic" aria-label="Abandonner" @click="abandon">
          <q-icon name="delete_outline" size="20px" />
        </button>
        <div class="dots">
          <button
            v-for="(d, i) in run.drills"
            :key="i"
            class="dot"
            :class="{ on: i === idx, done: d.done }"
            :aria-label="`Drill ${i + 1}`"
            @click="goTo(i)"
          />
        </div>
        <div class="count">{{ idx + 1 }}/{{ run.drills.length }}</div>
      </header>

      <div v-if="cur" class="body">
        <div class="cat">{{ catLabel(cur.category) }}</div>
        <h1 class="name font-display">{{ cur.name }}</h1>
        <div class="target">
          🎯 {{ fmtTarget(cur.format) }}
          <span v-if="cur.shot" class="sub">· {{ shotLabel(cur.shot) }}</span>
          <span v-if="cur.pattern" class="sub">· {{ patternLabel(cur.pattern) }}</span>
        </div>
        <p v-if="cur.description" class="desc">{{ cur.description }}</p>
        <p v-if="cur.notes" class="notes">💡 {{ cur.notes }}</p>

        <!-- Chrono pour les drills au temps -->
        <div v-if="cur.format.mode === 'time'" class="chrono-wrap">
          <div class="chrono font-display">{{ fmtSec(chrono) }}</div>
          <div class="chrono-target">objectif {{ fmtSec(cur.format.value) }}</div>
          <button class="chrono-btn" @click="toggleChrono">
            {{ running ? 'Pause' : chrono > 0 ? 'Reprendre' : 'Démarrer' }}
          </button>
        </div>

        <!-- Compteur de séries pour balles / reps -->
        <div v-else class="sets">
          <div class="sets-lbl">Séries faites</div>
          <div class="sets-row">
            <button class="stepper" aria-label="-" @click="bumpSets(-1)">−</button>
            <span class="sets-val font-display"
              >{{ cur.sets_done ?? 0 }} / {{ cur.format.sets }}</span
            >
            <button class="stepper" aria-label="+" @click="bumpSets(1)">+</button>
          </div>
        </div>

        <!-- Ressenti -->
        <div class="rate">
          <div class="rate-lbl">Ressenti</div>
          <div class="rate-btns">
            <button
              v-for="n in 4"
              :key="n"
              class="rate-b"
              :class="{ on: cur.difficulty === n }"
              :style="{ '--c': `var(--d${n})` }"
              @click="setDiff(n as Difficulty)"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <q-input
          v-model="comment"
          type="textarea"
          autogrow
          filled
          label="Commentaire (optionnel)"
          class="cmt"
          @blur="saveComment"
        />

        <q-btn
          class="cta full-width"
          color="primary"
          text-color="dark"
          no-caps
          size="lg"
          :icon="cur.done ? 'check_circle' : 'check'"
          :label="cur.done ? 'Drill validé — suivant' : 'Valider le drill'"
          @click="validateCur"
        />
      </div>

      <div class="foot">
        <button class="finish" @click="finish">Terminer la séance</button>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useLiveCourtStore } from '@/stores/liveCourt';
import { useTennisStore } from '@/stores/tennis';
import {
  DRILL_CATEGORY_LABELS,
  DRILL_SHOT_LABELS,
  DRILL_PATTERN_LABELS,
  formatDrillTarget,
} from '@/data/tennis';
import type { DrillCategory, DrillShot, DrillFormat, Difficulty } from '@/lib/types';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const live = useLiveCourtStore();
const tennis = useTennisStore();

const run = computed(() => live.run);
const idx = computed(() => live.run?.index ?? 0);
const cur = computed(() => live.run?.drills[idx.value] ?? null);

const chrono = ref(0);
const running = ref(false);
const comment = ref('');
let timer: ReturnType<typeof setInterval> | null = null;

const catLabel = (c: DrillCategory) => DRILL_CATEGORY_LABELS[c];
const shotLabel = (s: DrillShot) => DRILL_SHOT_LABELS[s];
const patternLabel = (p: string) => DRILL_PATTERN_LABELS[p] ?? p;
const fmtTarget = (f: DrillFormat) => formatDrillTarget(f.mode, f.value, f.sets);
function fmtSec(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Sécurité : si aucun run (accès direct), tente une reprise via l'id d'URL.
if (!live.run) {
  const id = String(route.params.id ?? '');
  const row = tennis.byId(id);
  if (row) live.start(row.payload, { resume: true });
}

// Sync chrono/commentaire quand on change de drill.
watch(
  cur,
  (d) => {
    stopTimer();
    chrono.value = d?.elapsed_sec ?? 0;
    comment.value = d?.comment ?? '';
  },
  { immediate: true },
);

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running.value = false;
}
function toggleChrono() {
  if (running.value) {
    stopTimer();
    live.update(idx.value, { elapsed_sec: chrono.value });
  } else {
    running.value = true;
    timer = setInterval(() => {
      chrono.value += 1;
    }, 1000);
  }
}
function bumpSets(d: number) {
  if (!cur.value) return;
  const v = Math.max(0, Math.min(cur.value.format.sets, (cur.value.sets_done ?? 0) + d));
  live.update(idx.value, { sets_done: v });
}
function setDiff(n: Difficulty) {
  live.update(idx.value, { difficulty: n });
}
function saveComment() {
  live.update(idx.value, { comment: comment.value.trim() });
}
function goTo(i: number) {
  if (running.value) live.update(idx.value, { elapsed_sec: chrono.value });
  stopTimer();
  live.setIndex(i);
}
function validateCur() {
  saveComment();
  live.validate(idx.value, {
    elapsed_sec: cur.value?.format.mode === 'time' ? chrono.value : cur.value?.elapsed_sec,
  });
  stopTimer();
}

async function finish() {
  const userId = auth.user?.id;
  const anyDone = run.value?.drills.some((d) => d.done);
  if (!anyDone) {
    $q.notify({ type: 'warning', message: 'Valide au moins un drill avant de terminer.' });
    return;
  }
  if (running.value) live.update(idx.value, { elapsed_sec: chrono.value });
  const log = live.buildLog();
  if (!log || !userId) return;
  try {
    await tennis.addLog(userId, log);
    live.clear();
    await router.push(`/court/bilan/${log.id}`);
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Enregistrement impossible.',
    });
  }
}

function abandon() {
  $q.dialog({
    title: 'Abandonner la séance',
    message: 'La séance en cours sera effacée (rien ne sera enregistré). Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Abandonner', color: 'negative' },
  }).onOk(() => {
    live.clear();
    void router.push('/tennis');
  });
}
async function goTennis() {
  await router.push('/tennis');
}

onBeforeUnmount(() => {
  if (running.value) live.update(idx.value, { elapsed_sec: chrono.value });
  stopTimer();
});
</script>

<style scoped lang="scss">
.court-live {
  background: var(--bg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.empty {
  color: var(--dim);
  text-align: center;
  padding: 60px 20px;
}
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
}
.ic {
  background: none;
  border: none;
  color: var(--d4);
  cursor: pointer;
  padding: 4px;
}
.dots {
  display: flex;
  gap: 6px;
  flex: 1;
  flex-wrap: wrap;
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--surface-2);
  cursor: pointer;
  padding: 0;
}
.dot.done {
  background: var(--d1);
  border-color: var(--d1);
}
.dot.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent);
}
.count {
  font-family: var(--font-display);
  color: var(--dim);
  font-size: 13px;
}
.body {
  flex: 1;
  padding: 20px 16px;
}
.cat {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dim);
}
.name {
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  margin: 2px 0 8px;
}
.target {
  color: var(--accent);
  font-size: 15px;
  font-weight: 600;
}
.sub {
  color: var(--dim);
  font-weight: 400;
}
.desc {
  color: var(--text);
  font-size: 14px;
  line-height: 1.45;
  margin: 12px 0 0;
}
.notes {
  color: var(--dim);
  font-size: 13px;
  line-height: 1.4;
  margin: 8px 0 0;
}
.chrono-wrap {
  text-align: center;
  margin: 24px 0;
}
.chrono {
  font-size: 56px;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
}
.chrono-target {
  color: var(--dim);
  font-size: 13px;
  margin: 4px 0 14px;
}
.chrono-btn {
  padding: 12px 28px;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: var(--surface-2);
  color: var(--accent);
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
}
.sets {
  margin: 24px 0;
  text-align: center;
}
.sets-lbl {
  font-size: 12px;
  color: var(--dim);
  margin-bottom: 8px;
}
.sets-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}
.sets-val {
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  min-width: 90px;
}
.stepper {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-size: 26px;
  cursor: pointer;
}
.rate {
  margin: 22px 0 8px;
}
.rate-lbl {
  font-size: 12px;
  color: var(--dim);
  margin-bottom: 8px;
}
.rate-btns {
  display: flex;
  gap: 10px;
}
.rate-b {
  flex: 1;
  height: 52px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
}
.rate-b.on {
  border-color: var(--c);
  background: var(--c);
  color: #15120e;
}
.cmt {
  margin: 14px 0 20px;
}
.cta {
  border-radius: 14px;
}
.foot {
  padding: 12px 16px 24px;
  border-top: 1px solid var(--line);
}
.finish {
  display: block;
  width: 100%;
  padding: 12px;
  background: none;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
}
</style>
