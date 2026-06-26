<template>
  <q-page class="backlog-page">
    <h1 class="p-title font-display">Backlog</h1>

    <div class="filters">
      <button v-for="f in FILTERS" :key="f.value" class="filt" :class="{ on: filter === f.value }" @click="filter = f.value">
        {{ f.label }}<span v-if="counts[f.value]" class="cnt">{{ counts[f.value] }}</span>
      </button>
    </div>

    <div v-if="loading" class="column items-center q-mt-xl"><q-spinner color="primary" size="32px" /></div>

    <template v-else>
      <div v-if="filtered.length === 0" class="empty">Aucun ticket{{ filter === 'all' ? '' : ' dans cette catégorie' }}.</div>

      <div v-for="t in filtered" :key="t.id" class="tk">
        <div class="tk-head">
          <span class="tk-kind" :class="t.kind">{{ kindLabel(t.kind) }}</span>
          <span class="tk-status" :class="t.status">{{ statusLabel(t.status) }}</span>
        </div>
        <div class="tk-msg">{{ t.message }}</div>
        <div class="tk-meta">{{ fmtDate(t.created_at) }}<template v-if="t.app_version"> · v{{ t.app_version }}</template><template v-if="t.page"> · {{ t.page }}</template></div>
        <div class="tk-actions">
          <button v-if="t.status !== 'in_progress'" class="act" @click="set(t, 'in_progress')">En cours</button>
          <button v-if="t.status !== 'done'" class="act done" @click="set(t, 'done')">Traité</button>
          <button v-if="t.status !== 'open'" class="act" @click="set(t, 'open')">Rouvrir</button>
        </div>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useFeedbackStore, type FeedbackRow, type FeedbackStatus } from '@/stores/feedback';

const $q = useQuasar();
const feedback = useFeedbackStore();
const loading = ref(true);

type Filter = FeedbackStatus | 'all';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Ouverts' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'done', label: 'Traités' },
  { value: 'all', label: 'Tous' },
];
const filter = ref<Filter>('open');

const counts = computed(() => ({
  open: feedback.all.filter((t) => t.status === 'open').length,
  in_progress: feedback.all.filter((t) => t.status === 'in_progress').length,
  done: feedback.all.filter((t) => t.status === 'done').length,
  all: feedback.all.length,
}));
const filtered = computed(() =>
  filter.value === 'all' ? feedback.all : feedback.all.filter((t) => t.status === filter.value),
);

function kindLabel(k: string) {
  return k === 'bug' ? 'Bug' : k === 'idea' ? 'Idée' : 'Autre';
}
function statusLabel(s: string) {
  return s === 'open' ? 'ouvert' : s === 'in_progress' ? 'en cours' : 'traité';
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

async function set(t: FeedbackRow, status: FeedbackStatus) {
  try {
    await feedback.setStatus(t.id, status);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  }
}

onMounted(async () => {
  try {
    await feedback.fetchAll();
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Chargement impossible.' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.backlog-page { background: var(--bg); min-height: 100vh; padding: 20px 16px 32px; }
.p-title { font-size: 28px; font-weight: 700; color: var(--text); margin: 4px 0 16px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.filt { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); color: var(--dim); font-size: 13px; cursor: pointer; &.on { border-color: var(--accent); color: var(--text); background: var(--surface-2); } }
.cnt { font-family: var(--font-display); font-size: 11px; background: var(--accent); color: var(--accent-ink); border-radius: 6px; padding: 0 5px; }
.empty { color: var(--dim); padding: 24px 0; }

.tk { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 14px; padding: 14px; margin-bottom: 10px; }
.tk-head { display: flex; align-items: center; justify-content: space-between; }
.tk-kind { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: var(--dim); }
.tk-kind.bug { color: var(--d4); }
.tk-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: var(--surface-2); color: var(--dim); }
.tk-status.open { color: var(--accent-ink); background: var(--accent); }
.tk-status.in_progress { color: var(--accent-ink); background: var(--d3); }
.tk-status.done { color: var(--accent-ink); background: var(--d1); }
.tk-msg { color: var(--text); font-size: 14px; margin-top: 8px; white-space: pre-wrap; }
.tk-meta { color: var(--dim-2); font-size: 11.5px; margin-top: 6px; }
.tk-actions { display: flex; gap: 8px; margin-top: 12px; }
.act { padding: 6px 12px; border-radius: 9px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font-size: 12.5px; font-weight: 600; cursor: pointer; }
.act.done { border-color: var(--d1); color: var(--d1); }
</style>
