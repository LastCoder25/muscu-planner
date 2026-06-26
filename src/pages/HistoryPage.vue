<template>
  <q-page class="hist-page">
    <h1 class="p-title font-display">Historique</h1>

    <div v-if="loading" class="column items-center q-mt-xl"><q-spinner color="primary" size="32px" /></div>

    <template v-else>
      <div v-if="rows.length === 0" class="empty">Aucune séance enregistrée pour l'instant.</div>

      <div v-for="r in rows" :key="r.id" class="log-card" @click="open(r.id)">
        <div class="row items-center justify-between">
          <div>
            <div class="log-name">{{ r.payload.name || 'Séance' }}</div>
            <div class="log-meta">{{ fmtDate(r.performed_at) }} · {{ volume(r) }} kg<template v-if="r.payload.global_difficulty"> · note {{ r.payload.global_difficulty }}/4</template></div>
          </div>
          <q-icon name="chevron_right" color="grey-6" size="20px" />
        </div>
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

const loading = ref(true);
const rows = ref<LogRow[]>([]);

function volume(r: LogRow): number {
  return r.payload.exercises.reduce((a, ex) => a + ex.performed.reduce((b, s) => b + s.load_kg * s.reps, 0), 0);
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
async function open(id: string) {
  await router.push(`/bilan/${id}?h=1`);
}

onMounted(async () => {
  try {
    rows.value = await logs.fetchRecent(50);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Chargement impossible.' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.hist-page { background: var(--bg); min-height: 100vh; padding: 20px 16px 32px; }
.p-title { font-size: 28px; font-weight: 700; color: var(--text); margin: 4px 0 20px; }
.empty { color: var(--dim); padding: 24px 0; }
.log-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin-bottom: 10px; cursor: pointer; }
.log-card:active { border-color: var(--accent); }
.log-name { font-weight: 600; font-size: 16px; color: var(--text); }
.log-meta { color: var(--dim); font-size: 13px; margin-top: 4px; }
</style>
