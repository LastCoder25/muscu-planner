<template>
  <q-page class="muscu-page">
    <h1 class="page-title font-display">Muscu</h1>
    <p class="page-sub text-dim">Séance libre, import IA ou ton programme.</p>

    <div class="seg">
      <button class="seg-b" :class="{ on: tab === 'act' }" @click="tab = 'act'">
        <q-icon name="fitness_center" size="18px" /> Séances
      </button>
      <button class="seg-b" :class="{ on: tab === 'hist' }" @click="showHistory">
        <q-icon name="history" size="18px" /> Historique
      </button>
    </div>

    <div v-if="tab === 'act'" class="tiles">
      <button class="tile" @click="go('/free')">
        <q-icon name="bolt" size="30px" />
        <span>Séance libre</span>
        <small>Au fil de l'eau</small>
      </button>
      <button class="tile" @click="go('/import')">
        <q-icon name="smart_toy" size="30px" />
        <span>Séance IA</span>
        <small>Importer un JSON</small>
      </button>
      <button class="tile" @click="go('/program')">
        <q-icon name="fitness_center" size="30px" />
        <span>Mon programme</span>
        <small>Séances générées</small>
      </button>
    </div>

    <template v-else>
      <div v-if="loading" class="column items-center q-mt-lg">
        <q-spinner color="primary" size="28px" />
      </div>
      <div v-else-if="!rows.length" class="empty">Aucune séance enregistrée pour l'instant.</div>
      <div v-for="r in rows" :key="r.id" class="log-card" @click="open(r.id)">
        <div class="log-main">
          <div class="log-name">{{ r.payload.name || 'Séance' }}</div>
          <div class="log-meta">
            {{ fmtDate(r.performed_at) }} · {{ volume(r) }} kg<template
              v-if="r.payload.global_difficulty"
            >
              · note {{ r.payload.global_difficulty }}/4</template
            >
          </div>
        </div>
        <button class="log-del" aria-label="Supprimer" @click.stop="confirmDelete(r)">
          <q-icon name="delete_outline" size="18px" />
        </button>
        <q-icon name="chevron_right" color="grey-6" size="20px" />
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useLogsStore, type LogRow } from '@/stores/logs';

const router = useRouter();
const $q = useQuasar();
const logs = useLogsStore();

const tab = ref<'act' | 'hist'>('act');
const loading = ref(false);
const rows = ref<LogRow[]>([]);
let fetched = false;

async function go(path: string) {
  await router.push(path);
}
function showHistory() {
  tab.value = 'hist';
  void loadHistory();
}

function volume(r: LogRow): number {
  return r.payload.exercises.reduce(
    (a, ex) => a + ex.performed.reduce((b, s) => b + s.load_kg * s.reps, 0),
    0,
  );
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
async function open(id: string) {
  await router.push(`/bilan/${id}?h=1`);
}

function confirmDelete(r: LogRow) {
  $q.dialog({
    title: 'Supprimer la séance',
    message: `« ${r.payload.name || 'Séance'} » du ${fmtDate(r.performed_at)} sera supprimée définitivement.`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    $q.loading.show({ message: 'Suppression…' });
    logs
      .remove(r.id)
      .then(() => {
        rows.value = rows.value.filter((x) => x.id !== r.id);
        $q.notify({ type: 'positive', message: 'Séance supprimée.' });
      })
      .catch((e: unknown) =>
        $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' }),
      )
      .finally(() => $q.loading.hide());
  });
}

async function loadHistory() {
  if (fetched) return;
  fetched = true;
  loading.value = true;
  try {
    rows.value = await logs.fetchRecent(50);
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (tab.value === 'hist') void loadHistory();
});
</script>

<style scoped lang="scss">
.muscu-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.page-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.page-sub {
  margin: 4px 0 20px;
}
.text-dim {
  color: var(--dim);
}
.seg {
  display: flex;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 16px;
}
.seg-b {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 8px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}
.seg-b.on {
  background: var(--accent);
  color: var(--accent-ink, #15120e);
}
.tiles {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 96px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--accent);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: transform 0.08s;
}
.tile .q-icon {
  color: var(--accent);
}
.tile small {
  font-family: var(--font-body, inherit);
  font-weight: 400;
  font-size: 12px;
  color: var(--dim);
}
.tile:active {
  transform: scale(0.98);
}
.empty {
  color: var(--dim);
  padding: 24px 4px;
}
.log-card {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 10px;
  cursor: pointer;
}
.log-card:active {
  border-color: var(--accent);
}
.log-main {
  flex: 1;
  min-width: 0;
}
.log-name {
  font-weight: 600;
  font-size: 16px;
  color: var(--text);
}
.log-meta {
  color: var(--dim);
  font-size: 13px;
  margin-top: 4px;
}
.log-del {
  background: none;
  border: none;
  color: var(--d4);
  cursor: pointer;
  padding: 2px;
}
</style>
