<template>
  <q-page class="detail-page">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="goHome">‹</button>
      <div class="top-mid">
        <div class="top-title font-display">{{ session?.name || 'Séance' }}</div>
        <div class="top-sub" v-if="session">{{ session.exercises.length }} exercices · ~{{ estimateDurationMin(session) }} min</div>
      </div>
      <q-btn flat round dense icon="content_copy" aria-label="Dupliquer" @click="duplicate" />
      <q-btn flat round dense icon="delete_outline" color="negative" aria-label="Supprimer" @click="confirmDelete" />
    </header>

    <div v-if="loading" class="column flex-center" style="min-height: 50vh"><q-spinner color="primary" size="32px" /></div>

    <template v-else-if="session">
      <div class="meta">
        <span v-if="session.objective" class="chip">{{ objectiveLabel(session.objective) }}</span>
        <span v-if="session.level" class="chip">{{ session.level }}</span>
        <span v-if="session.split" class="chip">{{ session.split.replace('_', ' ') }}</span>
      </div>

      <div class="scroll">
        <div class="vol-groups">
          <span v-for="g in muscleVolume" :key="g.muscle" class="vol-chip" :style="{ borderColor: muscleColor(g.muscle) }">
            <span class="vol-dot" :style="{ background: muscleColor(g.muscle) }" />{{ g.muscle }} · <b>{{ g.sets }}</b>
          </span>
        </div>

        <div v-for="(ex, i) in session.exercises" :key="i" class="ex-card" @click="openExercise(ex.id)">
          <div class="ex-top">
            <div class="ex-idx font-display">{{ i + 1 }}</div>
            <div class="ex-main">
              <div class="ex-name">{{ ex.name }}</div>
              <div class="ex-muscles">
                {{ ex.muscle_primary }}<template v-if="ex.muscle_secondary?.length"> · <span class="dim">{{ ex.muscle_secondary.join(', ') }}</span></template>
              </div>
            </div>
          </div>
          <div class="ex-sub">
            {{ restLabel(ex) }}<template v-if="ex.unilateral"> · par côté</template><template v-if="ex.equipment"> · {{ ex.equipment }}</template>
          </div>
          <div class="series-grid">
            <div v-for="(c, k) in seriesOf(ex)" :key="k" class="s-tile">
              <span class="s-n">S{{ k + 1 }}</span>
              <span class="s-top font-display">{{ c.top }}</span>
              <span class="s-bot">{{ c.bottom }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="cta-wrap">
        <button class="cta" @click="start">Démarrer la séance</button>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { Session, Objective, PrescribedSet, PlannedExercise } from '@/lib/types';
import { estimateDurationMin } from '@/lib/estimates';
import { plannedSetsByMuscle, muscleColor } from '@/lib/volume';
import { useSessionsStore } from '@/stores/sessions';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const sessionsStore = useSessionsStore();
const auth = useAuthStore();

const id = String(route.params.id);
const loading = ref(true);
const session = computed<Session | null>(() => sessionsStore.list.find((s) => s.id === id)?.payload ?? null);
const muscleVolume = computed(() => (session.value ? plannedSetsByMuscle(session.value) : []));

const OBJECTIVE_LABELS: Record<Objective, string> = {
  force: 'Force',
  hypertrophie: 'Hypertrophie',
  endurance: 'Endurance',
  remise_en_forme: 'Remise en forme',
  perte_de_gras: 'Perte de gras',
};
function objectiveLabel(o: Objective) {
  return OBJECTIVE_LABELS[o] ?? o;
}

// Séries à afficher en tuiles : { top: charge, bottom: reps }.
function seriesOf(ex: PlannedExercise): { top: string; bottom: string }[] {
  if (ex.prescription?.length) {
    return ex.prescription.map((p) => ({ top: p.load_kg ? `${p.load_kg}` : 'PdC', bottom: `× ${p.reps}` }));
  }
  const t = ex.target;
  const n = Math.max(0, t.sets || 0);
  const bottom = t.unit === 'time' ? `${t.reps_min}–${t.reps_max}s` : `× ${t.reps_min}–${t.reps_max}`;
  const top = t.load === 'bodyweight' ? (t.added_kg ? `+${t.added_kg}` : 'PdC') : (t.load_kg ? `${t.load_kg}` : '—');
  return Array.from({ length: n }, () => ({ top, bottom }));
}
function fmtRest(s: number): string {
  return s >= 60 ? `${Math.round(s / 30) / 2} min` : `${s} s`;
}
// Repos par série si la prescription en a (pyramide importée), sinon repos de l'exo.
function restLabel(ex: { rest_seconds: number; prescription?: PrescribedSet[] }): string {
  const rests = (ex.prescription ?? []).map((p) => p.rest_seconds).filter((r): r is number => r != null);
  if (rests.length) {
    const lo = Math.min(...rests);
    const hi = Math.max(...rests);
    return lo === hi ? `repos ${fmtRest(lo)}` : `repos ${fmtRest(lo)}–${fmtRest(hi)}`;
  }
  return `repos ${fmtRest(ex.rest_seconds)}`;
}

async function goHome() {
  await router.push('/');
}

async function duplicate() {
  const userId = auth.user?.id;
  const s = session.value;
  if (!userId || !s) return;
  try {
    const copy: Session = { ...s, id: crypto.randomUUID(), name: `${s.name} (copie)`, source: 'user' };
    await sessionsStore.insert(userId, copy);
    $q.notify({ type: 'positive', message: 'Séance dupliquée.' });
    await router.push('/');
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  }
}

function confirmDelete() {
  $q.dialog({
    title: 'Supprimer la séance',
    message: 'Cette séance sera supprimée définitivement. Continuer ?',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    sessionsStore.remove(id)
      .then(() => {
        $q.notify({ type: 'positive', message: 'Séance supprimée.' });
        return router.push('/');
      })
      .catch((e: unknown) => $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' }));
  });
}
async function start() {
  await router.push(`/session/${id}/ready`);
}
async function openExercise(exId: string) {
  await router.push(`/exercise/${exId}`);
}

onMounted(async () => {
  try {
    if (sessionsStore.list.length === 0) await sessionsStore.fetchMine();
    // Liste potentiellement périmée (ex. séance importée à l'instant) → on resynchronise.
    if (!session.value) await sessionsStore.fetchMine();
    if (!session.value) {
      $q.notify({ type: 'negative', message: 'Séance introuvable.' });
      await router.push('/');
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Chargement impossible.' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.detail-page {
  background: var(--bg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.top { padding: 14px 16px 12px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--line-soft); }
.iconbtn { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: 18px; display: grid; place-items: center; cursor: pointer; flex: none; }
.top-mid { flex: 1; min-width: 0; }
.top-title { font-weight: 600; font-size: 18px; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.top-sub { font-size: 11.5px; color: var(--dim); margin-top: 2px; }

.meta { display: flex; gap: 8px; flex-wrap: wrap; padding: 14px 16px 4px; }
.chip { font-size: 11px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; color: var(--dim); background: var(--surface); border: 1px solid var(--line-soft); padding: 5px 10px; border-radius: 8px; }

.scroll { flex: 1; overflow-y: auto; padding: 10px 16px 120px; }
.vol-groups { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.vol-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--dim); background: var(--surface); border: 1px solid var(--line-soft); border-left-width: 3px; padding: 4px 9px; border-radius: 8px; text-transform: capitalize; b { color: var(--text); } }
.vol-dot { width: 8px; height: 8px; border-radius: 50%; }
.ex-card { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 14px; padding: 14px; margin-bottom: 10px; cursor: pointer; }
.ex-card:active { border-color: var(--accent); }
.ex-top { display: flex; align-items: flex-start; gap: 12px; }
.ex-idx { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; font-weight: 600; font-size: 15px; background: var(--surface-2); color: var(--accent); flex: none; }
.ex-main { flex: 1; min-width: 0; }
.ex-name { font-weight: 600; font-size: 16px; color: var(--text); }
.ex-muscles { font-size: 12.5px; color: var(--dim); margin-top: 3px; .dim { color: var(--dim-2); } }
.ex-sub { font-size: 11.5px; color: var(--dim); margin-top: 8px; text-transform: capitalize; }
.series-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(62px, 1fr)); gap: 7px; margin-top: 10px; }
.s-tile { background: var(--surface-2); border: 1px solid var(--line-soft); border-radius: 10px; padding: 7px 4px 6px; text-align: center; display: flex; flex-direction: column; gap: 1px; }
.s-n { font-size: 9px; color: var(--dim-2); letter-spacing: 0.5px; text-transform: uppercase; }
.s-top { font-size: 17px; font-weight: 600; color: var(--accent); line-height: 1; }
.s-bot { font-size: 11px; color: var(--dim); }

.cta-wrap { position: fixed; left: 0; right: 0; bottom: 0; max-width: 600px; margin: 0 auto; padding: 16px 16px 26px; background: linear-gradient(180deg, #15120e00, var(--bg) 30%); }
.cta { width: 100%; height: 58px; border: none; border-radius: 18px; background: var(--accent); color: var(--accent-ink); font-family: var(--font-display); font-weight: 700; font-size: 18px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; box-shadow: 0 10px 30px -8px #ffd23f55; }
</style>
