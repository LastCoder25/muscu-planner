<template>
  <q-page class="bilan-page">
    <header class="top">
      <button class="iconbtn" aria-label="Accueil" @click="goHome">‹</button>
      <div class="top-mid">
        <div class="top-title font-display">Bilan</div>
        <div class="top-sub" v-if="log">{{ log.name }}<template v-if="log.duration_min"> · {{ log.duration_min }} min</template></div>
      </div>
    </header>

    <div v-if="loading" class="column flex-center" style="min-height: 50vh"><q-spinner color="primary" size="32px" /></div>

    <template v-else-if="log">
      <div class="scroll">
        <!-- Récap -->
        <div class="recap">
          <div class="recap-item"><span class="rv font-display">{{ totalVolume }}</span><span class="rl">kg volume</span></div>
          <div class="recap-item"><span class="rv font-display">{{ log.duration_min ?? '–' }}</span><span class="rl">minutes</span></div>
          <div class="recap-item"><span class="rv font-display">{{ log.global_difficulty ?? '–' }}</span><span class="rl">note /4</span></div>
        </div>
        <div v-if="log.global_comment" class="global-comment">« {{ log.global_comment }} »</div>

        <!-- Prévu vs réalisé -->
        <div class="sec-h">Prévu vs réalisé</div>
        <div v-for="(ex, i) in log.exercises" :key="i" class="ex-card">
          <div class="ex-name">
            {{ ex.name }}
            <span v-if="ex.swapped_from" class="swap-badge">remplacé</span>
          </div>
          <div class="ex-planned">Prévu : {{ plannedLabel(ex.planned) }}</div>
          <div class="sets">
            <span v-for="(s, j) in ex.performed" :key="j" class="setpill">
              <template v-if="ex.planned.unit === 'time'">{{ s.reps }} s</template>
              <template v-else>{{ s.load_kg }}×{{ s.reps }}</template>
              <span class="dot" :class="'d' + s.difficulty" />
            </span>
          </div>
          <div v-if="ex.performed.length" class="ex-e1rm">Max estimé : <b>{{ bestE1RM(ex.performed) }} kg</b></div>
          <div v-if="ex.exercise_comment" class="ex-comment">« {{ ex.exercise_comment }} »</div>
        </div>

        <!-- Progression proposée (moteur) -->
        <template v-if="source && deltas.length && !readOnly">
          <div class="sec-h">Progression proposée</div>
          <div class="prog-card">
            <div v-for="d in deltas" :key="d.id" class="prog-row">
              <span>{{ d.name }}</span>
              <span class="prog-delta" :class="d.cls">{{ d.label }}</span>
            </div>
          </div>
        </template>

        <!-- Chemin IA (repliable) -->
        <q-expansion-item
          v-model="iaOpen"
          icon="smart_toy" label="Coach IA (export / import)"
          dark class="ia-box"
        >
          <div class="q-pa-sm">
            <q-btn flat no-caps color="primary" icon="content_copy" label="Copier la requête pour ChatGPT" class="full-width" @click="copyCoach" />
            <pre class="coach-json">{{ coachJson }}</pre>
            <div class="ia-label">Coller ici la séance JSON renvoyée par l'IA :</div>
            <textarea v-model="importText" class="ia-field" aria-label="JSON séance" placeholder="{ ... }" />
            <q-btn flat no-caps color="primary" label="Valider le JSON" class="q-mt-xs" :disable="!importText.trim()" @click="tryImport" />
            <div v-if="imported" class="imported-ok">
              <q-icon name="check_circle" color="positive" /> « {{ imported.name }} » ({{ imported.exercises.length }} exos)
              <q-btn dense no-caps color="primary" text-color="dark" label="Ajouter cette séance" class="q-mt-sm full-width" :loading="importing" @click="confirmImport" />
            </div>
          </div>
        </q-expansion-item>
      </div>

      <div class="cta-wrap">
        <button v-if="source && nextPlan && !readOnly" class="cta" :disabled="applying" @click="applyProgression">
          {{ applying ? 'Application…' : 'Appliquer la progression' }}
        </button>
        <button v-else class="cta ghost" @click="goHome">Retour</button>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar, copyToClipboard } from 'quasar';
import type { Session, SessionLog, ExerciseTarget } from '@/lib/types';
import { nextSessionDeterministic } from '@/lib/progression';
import { buildCoachRequest, validateImportedSession } from '@/lib/coach';
import { bestE1RM } from '@/lib/estimates';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useSessionsStore } from '@/stores/sessions';
import { useLogsStore } from '@/stores/logs';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const profileStore = useProfileStore();
const sessionsStore = useSessionsStore();
const logs = useLogsStore();

const readOnly = computed(() => !!route.query.h);
const loading = ref(true);
const log = ref<SessionLog | null>(null);
const source = ref<Session | null>(null);
const nextPlan = ref<Session | null>(null);
const history = ref<SessionLog[]>([]);
const applying = ref(false);

const iaOpen = ref(false);
const importText = ref('');
const imported = ref<Session | null>(null);
const importing = ref(false);

const totalVolume = computed(() =>
  log.value
    ? log.value.exercises.reduce((a, ex) => a + ex.performed.reduce((b, s) => b + s.load_kg * s.reps, 0), 0)
    : 0,
);

function loadOf(t: Partial<ExerciseTarget> | undefined): number {
  return t?.load_kg ?? t?.added_kg ?? 0;
}
function plannedLabel(t: Partial<ExerciseTarget>): string {
  const range = `${t.sets ?? '?'} × ${t.reps_min ?? '?'}–${t.reps_max ?? '?'}`;
  if (t.unit === 'time') return `${range} s`;
  if (t.load === 'bodyweight') return `${range} · ${t.added_kg ? '+' + t.added_kg + ' kg' : 'poids du corps'}`;
  return t.load_kg ? `${range} · ${t.load_kg} kg` : range;
}

// Deltas de charge proposés par le moteur (source vs nextPlan, même ordre/id).
const deltas = computed(() => {
  if (!source.value || !nextPlan.value) return [];
  const out: { id: string; name: string; label: string; cls: string }[] = [];
  source.value.exercises.forEach((src, i) => {
    const nxt = nextPlan.value!.exercises[i];
    if (!nxt) return;
    const before = loadOf(src.target);
    const after = loadOf(nxt.target);
    const diff = Math.round((after - before) * 100) / 100;
    if (diff > 0) out.push({ id: src.id, name: src.name, label: `+${diff} kg`, cls: 'up' });
    else if (diff < 0) out.push({ id: src.id, name: src.name, label: `${diff} kg`, cls: 'down' });
    else out.push({ id: src.id, name: src.name, label: 'maintenu', cls: 'same' });
  });
  return out;
});

const coachJson = computed(() => {
  const profile = profileStore.profile;
  if (!profile) return '';
  const req = buildCoachRequest(profile, history.value, source.value ?? undefined);
  return JSON.stringify(req, null, 2);
});

async function copyCoach() {
  try {
    await copyToClipboard(coachJson.value);
    $q.notify({ type: 'positive', message: 'Requête copiée — colle-la dans ChatGPT.' });
  } catch {
    $q.notify({ type: 'negative', message: 'Copie impossible.' });
  }
}

function tryImport() {
  try {
    imported.value = validateImportedSession(importText.value);
    $q.notify({ type: 'positive', message: 'Séance valide.' });
  } catch (e) {
    imported.value = null;
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'JSON invalide.' });
  }
}

async function confirmImport() {
  const userId = auth.user?.id;
  if (!userId || !imported.value) return;
  importing.value = true;
  try {
    await sessionsStore.insert(userId, imported.value);
    $q.notify({ type: 'positive', message: 'Séance ajoutée.' });
    await router.push('/');
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    importing.value = false;
  }
}

async function applyProgression() {
  if (!source.value || !nextPlan.value) return;
  applying.value = true;
  try {
    const updated: Session = { ...source.value, exercises: nextPlan.value.exercises, source: 'engine' };
    await sessionsStore.updatePlan(updated);
    $q.notify({ type: 'positive', message: 'Progression appliquée 💪 tes charges sont à jour.' });
    await router.push('/');
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    applying.value = false;
  }
}

async function goHome() {
  await router.push('/');
}

onMounted(async () => {
  const id = String(route.params.id);
  try {
    log.value = await logs.fetchById(id);
    if (!log.value) {
      $q.notify({ type: 'negative', message: 'Bilan introuvable.' });
      await router.push('/');
      return;
    }
    const cfg = profileStore.levelConfig;
    iaOpen.value = cfg?.program_mode === 'free';
    history.value = await logs.fetchHistory(cfg?.coach_history_depth ?? 1);

    const sid = log.value.session_id;
    if (sid) {
      if (sessionsStore.list.length === 0) await sessionsStore.fetchMine();
      source.value = sessionsStore.list.find((s) => s.id === sid)?.payload ?? null;
      if (source.value && cfg) {
        nextPlan.value = nextSessionDeterministic(source.value, log.value, cfg, history.value);
      }
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Chargement impossible.' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.bilan-page { background: var(--bg); min-height: 100vh; display: flex; flex-direction: column; }
.top { padding: 14px 16px 12px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--line-soft); }
.iconbtn { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: 18px; display: grid; place-items: center; cursor: pointer; flex: none; }
.top-mid { flex: 1; min-width: 0; }
.top-title { font-weight: 600; font-size: 18px; text-transform: uppercase; }
.top-sub { font-size: 11.5px; color: var(--dim); margin-top: 2px; }

.scroll { flex: 1; overflow-y: auto; padding: 14px 16px 120px; }
.recap { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.recap-item { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 14px; padding: 14px; text-align: center; }
.rv { display: block; font-size: 26px; font-weight: 600; color: var(--accent); }
.rl { font-size: 11px; color: var(--dim); }
.global-comment { color: var(--dim); font-style: italic; margin-top: 12px; font-size: 14px; }

.sec-h { font-family: var(--font-display); font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dim); margin: 24px 2px 10px; }
.ex-card { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 14px; padding: 14px; margin-bottom: 10px; }
.ex-name { font-weight: 600; font-size: 16px; color: var(--text); }
.swap-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--accent-ink); background: var(--accent); padding: 2px 7px; border-radius: 6px; margin-left: 8px; }
.ex-planned { font-size: 12.5px; color: var(--dim); margin-top: 4px; }
.sets { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
.setpill { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-display); font-size: 14px; color: var(--text); background: var(--surface-2); border: 1px solid var(--line-soft); padding: 5px 9px; border-radius: 8px; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.dot.d1 { background: var(--d1); } .dot.d2 { background: var(--d2); } .dot.d3 { background: var(--d3); } .dot.d4 { background: var(--d4); }
.ex-e1rm { font-size: 12px; color: var(--dim); margin-top: 8px; b { color: var(--text); } }
.ex-comment { font-size: 12.5px; color: var(--dim); font-style: italic; margin-top: 6px; }

.prog-card { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 14px; padding: 6px 14px; }
.prog-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid var(--line-soft); font-size: 14px; color: var(--text); &:last-child { border-bottom: none; } }
.prog-delta { font-family: var(--font-display); font-size: 14px; }
.prog-delta.up { color: var(--d1); } .prog-delta.down { color: var(--d4); } .prog-delta.same { color: var(--dim-2); }

.ia-box { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; margin-top: 16px; }
.coach-json { background: var(--bg); border: 1px solid var(--line-soft); border-radius: 10px; padding: 10px; font-size: 10.5px; color: var(--dim); max-height: 160px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
.ia-label { font-size: 12px; color: var(--dim); margin: 10px 0 6px; }
.ia-field { width: 100%; min-height: 80px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 10px; color: var(--text); font-family: monospace; font-size: 12px; resize: none; outline: none; &:focus { border-color: var(--accent); } }
.imported-ok { color: var(--done); font-size: 13px; margin-top: 8px; }

.cta-wrap { position: fixed; left: 0; right: 0; bottom: 0; max-width: 600px; margin: 0 auto; padding: 16px 16px 26px; background: linear-gradient(180deg, #15120e00, var(--bg) 30%); }
.cta { width: 100%; height: 58px; border: none; border-radius: 18px; background: var(--accent); color: var(--accent-ink); font-family: var(--font-display); font-weight: 700; font-size: 18px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; box-shadow: 0 10px 30px -8px #ffd23f55; &:disabled { opacity: 0.5; } }
.cta.ghost { background: var(--surface); color: var(--text); border: 1px solid var(--line); box-shadow: none; }
</style>
