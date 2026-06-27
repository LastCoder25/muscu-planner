<template>
  <q-page class="ex-page">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="back">‹</button>
      <div class="top-title font-display">{{ ex?.name || 'Exercice' }}</div>
    </header>

    <div v-if="loading" class="column flex-center" style="min-height: 50vh"><q-spinner color="primary" size="32px" /></div>

    <div v-else-if="ex" class="scroll">
      <!-- Média -->
      <div class="media">
        <img v-if="ex.payload?.media_url" :src="ex.payload.media_url" :alt="ex.name" />
        <q-icon v-else name="fitness_center" size="48px" color="grey-7" />
      </div>

      <div class="badges">
        <span class="chip lvl" :class="'l' + (ex.difficulty ?? 1)">{{ levelLabel(ex.difficulty) }}</span>
      </div>

      <!-- Muscles -->
      <div class="sec-h">Muscles</div>
      <div class="chips">
        <span v-if="ex.muscle_primary" class="chip accent">{{ ex.muscle_primary }}</span>
        <span v-for="m in ex.muscle_secondary ?? []" :key="m" class="chip">{{ m }}</span>
      </div>

      <!-- Matériel -->
      <div class="sec-h">Matériel</div>
      <div class="chips">
        <span v-if="ex.equipment" class="chip">{{ ex.equipment }}</span>
      </div>
      <div v-if="requiredLabels.length" class="required">
        Requis : {{ requiredLabels.join(', ') }}
      </div>
      <div v-else class="required dim">Aucun matériel requis (poids du corps).</div>

      <!-- Progression -->
      <template v-if="series.length">
        <div class="sec-h">Progression (1RM estimé)</div>
        <div v-if="chart" class="chart">
          <svg :viewBox="`0 0 ${chart.W} ${chart.H}`" preserveAspectRatio="none" class="chart-svg">
            <polyline :points="chart.pts" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" />
          </svg>
          <div class="chart-meta">max <b>{{ chart.max }}</b> kg · actuel <b>{{ chart.last }}</b> kg · {{ series.length }} séances</div>
        </div>
        <div v-else class="no-instr">Pas encore assez de données (1 séance).</div>
      </template>

      <!-- Instructions -->
      <div class="sec-h">Instructions</div>
      <p v-if="ex.payload?.instructions" class="instructions">{{ ex.payload.instructions }}</p>
      <template v-else-if="guide">
        <ol class="steps">
          <li v-for="(st, i) in guide.steps" :key="i">{{ st }}</li>
        </ol>
        <div v-if="guide.tip" class="tip"><q-icon name="lightbulb" size="16px" /> {{ guide.tip }}</div>
      </template>
      <div v-else class="no-instr">
        Pas encore d'instructions pour cet exercice.
        <button class="link" @click="goSettings">Envoyer un retour</button>
      </div>

      <!-- Alternatives -->
      <template v-if="alts.length">
        <div class="sec-h">Alternatives</div>
        <button v-for="a in alts" :key="a.id" class="alt" @click="goExercise(a.id)">
          <div>
            <div class="alt-name">{{ a.name }}</div>
            <div class="alt-meta">{{ a.muscle_primary }}<template v-if="a.equipment"> · {{ a.equipment }}</template></div>
          </div>
          <div class="alt-go">›</div>
        </button>
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useLibraryStore, type ExerciseFull, type ExerciseRow } from '@/stores/library';
import { useLogsStore } from '@/stores/logs';
import { bestE1RM } from '@/lib/estimates';
import { EQUIPMENT_ITEMS } from '@/data/profileOptions';
import { exerciseInstructions } from '@/data/exerciseInstructions';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const library = useLibraryStore();

const logs = useLogsStore();
const loading = ref(true);
const ex = ref<ExerciseFull | null>(null);
const alts = ref<ExerciseRow[]>([]);
const series = ref<number[]>([]); // 1RM estimé chronologique (historique de l'exo)
const guide = computed(() => (ex.value ? exerciseInstructions(ex.value.id) : undefined));

const chart = computed(() => {
  const s = series.value;
  if (s.length < 2) return null;
  const min = Math.min(...s);
  const max = Math.max(...s);
  const range = max - min || 1;
  const W = 300;
  const H = 90;
  const pad = 6;
  const pts = s
    .map((v, i) => {
      const x = (i / (s.length - 1)) * (W - 2 * pad) + pad;
      const y = H - pad - ((v - min) / range) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return { pts, min, max, last: s[s.length - 1], W, H };
});

const EQUIP_LABELS: Record<string, string> = Object.fromEntries(EQUIPMENT_ITEMS.map((e) => [e.value, e.label]));

const requiredLabels = computed(() =>
  (ex.value?.equipment_required ?? []).map((a) => EQUIP_LABELS[a] ?? a),
);

function levelLabel(d: number | null | undefined) {
  return d === 3 ? 'Avancé' : d === 2 ? 'Intermédiaire' : 'Débutant';
}

async function load(id: string) {
  loading.value = true;
  alts.value = [];
  series.value = [];
  try {
    ex.value = await library.fetchOne(id);
    if (!ex.value) {
      $q.notify({ type: 'negative', message: 'Exercice introuvable.' });
      await router.push('/');
      return;
    }
    const altIds = ex.value.payload?.alternatives ?? [];
    if (altIds.length) alts.value = await library.fetchByIds(altIds);

    // Historique de progression (1RM estimé) pour cet exo.
    const recent = await logs.fetchRecent(50);
    const pts: { date: string; val: number }[] = [];
    for (const row of recent) {
      const le = row.payload.exercises.find((x) => x.id === id || x.swapped_from === id);
      if (!le) continue;
      const v = bestE1RM(le.performed);
      if (v > 0) pts.push({ date: row.performed_at, val: v });
    }
    pts.sort((a, b) => a.date.localeCompare(b.date));
    series.value = pts.map((p) => p.val);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Chargement impossible.' });
  } finally {
    loading.value = false;
  }
}

function back() {
  router.back();
}
async function goExercise(id: string) {
  await router.push(`/exercise/${id}`);
}
async function goSettings() {
  await router.push('/settings');
}

onMounted(async () => {
  await load(String(route.params.id));
});
watch(() => route.params.id, async (id) => {
  if (id) await load(String(id));
});
</script>

<style scoped lang="scss">
.ex-page { background: var(--bg); min-height: 100vh; display: flex; flex-direction: column; }
.top { padding: 14px 16px 12px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--line-soft); }
.iconbtn { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: 18px; display: grid; place-items: center; cursor: pointer; flex: none; }
.top-title { font-weight: 600; font-size: 18px; text-transform: uppercase; color: var(--text); }

.scroll { flex: 1; overflow-y: auto; padding: 16px; }
.media { height: 160px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line-soft); display: grid; place-items: center; overflow: hidden; margin-bottom: 14px; img { width: 100%; height: 100%; object-fit: cover; } }
.badges { margin-bottom: 8px; }

.sec-h { font-family: var(--font-display); font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dim); margin: 20px 2px 10px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { font-size: 12px; font-weight: 600; letter-spacing: 0.3px; color: var(--dim); background: var(--surface); border: 1px solid var(--line-soft); padding: 6px 11px; border-radius: 8px; }
.chip.accent { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
.chip.lvl { text-transform: uppercase; font-size: 11px; }
.chip.lvl.l1 { color: var(--accent-ink); background: var(--d1); border-color: var(--d1); }
.chip.lvl.l2 { color: var(--accent-ink); background: var(--d3); border-color: var(--d3); }
.chip.lvl.l3 { color: #fff; background: var(--d4); border-color: var(--d4); }
.required { font-size: 13px; color: var(--text); margin-top: 10px; &.dim { color: var(--dim); } }

.instructions { font-size: 14px; color: var(--text); line-height: 1.5; white-space: pre-wrap; }
.steps { margin: 0; padding-left: 20px; color: var(--text); font-size: 14px; line-height: 1.5; li { margin-bottom: 7px; } }
.tip { display: flex; align-items: flex-start; gap: 7px; margin-top: 10px; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--line-soft); border-radius: 10px; color: var(--dim); font-size: 13px; }
.no-instr { font-size: 13px; color: var(--dim); }
.chart { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 14px; padding: 12px; }
.chart-svg { width: 100%; height: 90px; display: block; }
.chart-meta { font-size: 12px; color: var(--dim); margin-top: 8px; b { color: var(--text); font-family: var(--font-display); } }
.link { background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; margin-left: 4px; font-size: 13px; text-decoration: underline; }

.alt { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line-soft); margin-bottom: 8px; cursor: pointer; }
.alt-name { font-weight: 600; font-size: 14.5px; color: var(--text); }
.alt-meta { font-size: 11.5px; color: var(--dim); margin-top: 2px; }
.alt-go { margin-left: auto; color: var(--accent); font-size: 20px; }
</style>
