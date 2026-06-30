<template>
  <q-page class="stats-page">
    <h1 class="p-title font-display">Statistiques</h1>

    <div v-if="loading" class="column items-center q-mt-xl"><q-spinner color="primary" size="32px" /></div>

    <template v-else>
      <div v-if="logs.length === 0" class="empty">Aucune séance enregistrée pour l’instant.</div>

      <template v-else>
        <div class="kpis">
          <div class="kpi"><span class="kpi-v font-display">{{ logs.length }}</span><span class="kpi-l">séances</span></div>
          <div class="kpi"><span class="kpi-v font-display">{{ totalSets }}</span><span class="kpi-l">séries</span></div>
          <div class="kpi"><span class="kpi-v font-display">{{ exos.length }}</span><span class="kpi-l">exos</span></div>
        </div>

        <!-- Séries par groupe musculaire -->
        <div class="sec-h">Séries par groupe musculaire</div>
        <div class="grp-card">
          <div v-for="g in muscleSets" :key="g.muscle" class="grp-row">
            <span class="grp-name"><span class="grp-dot" :style="{ background: muscleColor(g.muscle) }" />{{ g.muscle }}</span>
            <div class="grp-bar"><div class="grp-fill" :style="{ width: barPct(g.sets) + '%', background: muscleColor(g.muscle) }" /></div>
            <span class="grp-val"><b>{{ g.sets }}</b></span>
          </div>
        </div>

        <!-- Exercices les plus fréquents -->
        <div class="sec-h">Exercices (les plus fréquents)</div>
        <button v-for="e in exos" :key="e.id" class="ex-row" @click="openExercise(e.id)">
          <span class="ex-dot" :style="{ background: muscleColor(e.muscle) }" />
          <div class="ex-main">
            <div class="ex-name">{{ e.name }}</div>
            <div class="ex-sub">{{ e.muscle }} · {{ e.sessions }} séance{{ e.sessions > 1 ? 's' : '' }} · {{ e.sets }} séries</div>
          </div>
          <div class="ex-loads">
            <template v-if="e.max != null">
              <div class="ex-load"><b>{{ e.max }}</b><small>max</small></div>
              <div class="ex-load"><b>{{ e.median }}</b><small>méd.</small></div>
              <div class="ex-load"><b>{{ e.avg }}</b><small>moy.</small></div>
            </template>
            <div v-else class="ex-pdc">PdC</div>
          </div>
          <q-icon name="chevron_right" color="grey-6" size="20px" />
        </button>
        <p class="hint">Touche un exercice pour voir la courbe d’évolution (1RM estimé).</p>
      </template>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useLogsStore, type LogRow } from '@/stores/logs';
import { muscleColor } from '@/lib/volume';

const router = useRouter();
const $q = useQuasar();
const logsStore = useLogsStore();
const loading = ref(true);
const logs = ref<LogRow[]>([]);

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2) * 10) / 10;
}

interface ExoStat { id: string; name: string; muscle: string; sessions: number; sets: number; avg: number | null; median: number | null; max: number | null }

// Agrégat par exercice (toutes séances).
const exos = computed<ExoStat[]>(() => {
  const map = new Map<string, { id: string; name: string; muscle: string; sessions: Set<string>; sets: number; loads: number[] }>();
  for (const row of logs.value) {
    for (const ex of row.payload.exercises) {
      const cur = map.get(ex.id) ?? { id: ex.id, name: ex.name, muscle: ex.muscle_primary ?? '—', sessions: new Set(), sets: 0, loads: [] };
      cur.sessions.add(row.id);
      for (const s of ex.performed) {
        cur.sets++;
        if (s.load_kg > 0) cur.loads.push(s.load_kg);
      }
      map.set(ex.id, cur);
    }
  }
  return [...map.values()]
    .map((e) => ({
      id: e.id,
      name: e.name,
      muscle: e.muscle,
      sessions: e.sessions.size,
      sets: e.sets,
      avg: e.loads.length ? Math.round((e.loads.reduce((a, b) => a + b, 0) / e.loads.length) * 10) / 10 : null,
      median: e.loads.length ? median(e.loads) : null,
      max: e.loads.length ? Math.max(...e.loads) : null,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.sets - a.sets);
});

const muscleSets = computed(() => {
  const map = new Map<string, number>();
  for (const row of logs.value) {
    for (const ex of row.payload.exercises) {
      const m = ex.muscle_primary ?? '—';
      map.set(m, (map.get(m) ?? 0) + ex.performed.length);
    }
  }
  return [...map.entries()].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets);
});

const totalSets = computed(() => muscleSets.value.reduce((a, g) => a + g.sets, 0));
const maxMuscle = computed(() => Math.max(1, ...muscleSets.value.map((g) => g.sets)));
function barPct(n: number) {
  return Math.round((n / maxMuscle.value) * 100);
}

async function openExercise(id: string) {
  await router.push(`/exercise/${id}`);
}

onMounted(async () => {
  try {
    logs.value = await logsStore.fetchRecent(300);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Chargement impossible.' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.stats-page { background: var(--bg); min-height: 100vh; padding: 20px 16px 32px; }
.p-title { font-size: 28px; font-weight: 700; color: var(--text); margin: 4px 0 18px; }
.empty { color: var(--dim); padding: 24px 0; }

.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.kpi { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 14px; padding: 14px; text-align: center; }
.kpi-v { display: block; font-size: 24px; font-weight: 600; color: var(--accent); }
.kpi-l { font-size: 11px; color: var(--dim); }

.sec-h { font-family: var(--font-display); font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dim); margin: 24px 2px 10px; }
.grp-card { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 14px; padding: 6px 14px; }
.grp-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line-soft); &:last-child { border-bottom: none; } }
.grp-name { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text); text-transform: capitalize; width: 110px; flex: none; }
.grp-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.grp-bar { flex: 1; height: 8px; background: var(--surface-2); border-radius: 5px; overflow: hidden; }
.grp-fill { height: 100%; border-radius: 5px; }
.grp-val { font-family: var(--font-display); font-size: 14px; color: var(--text); width: 32px; text-align: right; flex: none; b { color: var(--accent); } }

.ex-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: var(--surface); border: 1px solid var(--line-soft); border-radius: 14px; padding: 12px 14px; margin-bottom: 8px; cursor: pointer; }
.ex-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.ex-main { flex: 1; min-width: 0; }
.ex-name { font-weight: 600; font-size: 15px; color: var(--text); }
.ex-sub { font-size: 12px; color: var(--dim); margin-top: 2px; text-transform: capitalize; }
.ex-loads { display: flex; gap: 10px; flex: none; }
.ex-load { text-align: center; b { display: block; font-family: var(--font-display); font-size: 15px; color: var(--text); } small { font-size: 9px; color: var(--dim); text-transform: uppercase; } }
.ex-pdc { font-size: 12px; color: var(--dim); }
.hint { color: var(--dim); font-size: 12px; margin-top: 10px; text-align: center; }
</style>
