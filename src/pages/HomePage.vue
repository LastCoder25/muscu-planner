<template>
  <q-page class="home-page">
    <header class="home-head">
      <div class="text-dim text-caption">Salut</div>
      <h1 class="home-name font-display">{{ profileStore.profile?.identity.name || 'Athlète' }}</h1>
    </header>

    <div v-if="loading" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <template v-else>
      <div v-if="lastLog" class="last-card" @click="goHistory">
        <div class="last-lbl">Dernière séance · {{ fmtDate(lastLog.performed_at) }}</div>
        <div class="last-row">
          <span class="last-name">{{ lastLog.payload.name || 'Séance' }}</span>
          <span class="last-stat">{{ lastVolume }} kg<template v-if="lastLog.payload.global_difficulty"> · {{ lastLog.payload.global_difficulty }}/4</template></span>
        </div>
      </div>

      <div class="row items-center justify-between q-mb-sm">
        <h2 class="section-h">Tes séances</h2>
        <span class="text-dim text-caption">{{ sessionsStore.list.length }}</span>
      </div>

      <div v-if="sessionsStore.list.length === 0" class="empty">
        Aucune séance pour l’instant.
      </div>

      <div
        v-for="s in sessionsStore.list"
        :key="s.id"
        class="session-card"
        @click="openDetail(s.id)"
      >
        <div class="row items-center justify-between">
          <div>
            <div class="session-name">{{ s.name }}</div>
            <div class="session-meta">
              {{ s.payload.exercises.length }} exercices
              <template v-if="s.payload.estimated_duration_min"> · ~{{ s.payload.estimated_duration_min }} min</template>
            </div>
          </div>
          <div class="row items-center no-wrap" style="gap: 4px">
            <q-icon name="chevron_right" color="grey-6" size="20px" />
            <q-btn
              round color="primary" text-color="dark" icon="play_arrow"
              aria-label="Démarrer"
              @click.stop="startSession(s.id)"
            />
          </div>
        </div>
      </div>

      <div class="row q-col-gutter-sm q-mt-xs">
        <button class="free-btn col" @click="startFree">
          <q-icon name="bolt" size="20px" /> Séance libre
        </button>
        <button class="free-btn col" @click="startImport">
          <q-icon name="smart_toy" size="20px" /> Importer (IA)
        </button>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useProfileStore } from '@/stores/profile';
import { useSessionsStore } from '@/stores/sessions';
import { useLogsStore, type LogRow } from '@/stores/logs';

const $q = useQuasar();
const router = useRouter();
const profileStore = useProfileStore();
const sessionsStore = useSessionsStore();
const logs = useLogsStore();
const loading = ref(true);
const lastLog = ref<LogRow | null>(null);

const lastVolume = computed(() =>
  lastLog.value
    ? lastLog.value.payload.exercises.reduce((a, ex) => a + ex.performed.reduce((b, s) => b + s.load_kg * s.reps, 0), 0)
    : 0,
);
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

onMounted(async () => {
  try {
    await sessionsStore.fetchMine();
    const recent = await logs.fetchRecent(1);
    lastLog.value = recent[0] ?? null;
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Chargement impossible.' });
  } finally {
    loading.value = false;
  }
});

async function goHistory() {
  await router.push('/history');
}

async function openDetail(id: string) {
  await router.push(`/session/${id}/detail`);
}
async function startFree() {
  await router.push('/free');
}
async function startImport() {
  await router.push('/import');
}
async function startSession(id: string) {
  await router.push(`/session/${id}/ready`);
}
</script>

<style scoped lang="scss">
.home-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.home-head { margin-bottom: 24px; }
.home-name {
  font-size: 32px;
  font-weight: 700;
  color: var(--text);
  margin: 2px 0 0;
}
.text-dim { color: var(--dim); }
.last-card { background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; margin-bottom: 20px; cursor: pointer; }
.last-lbl { font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--dim); }
.last-row { display: flex; align-items: baseline; justify-content: space-between; margin-top: 6px; }
.last-name { font-weight: 600; font-size: 16px; color: var(--text); }
.last-stat { font-family: var(--font-display); font-size: 14px; color: var(--accent); }
.section-h {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}
.empty {
  color: var(--dim);
  padding: 24px 0;
}
.session-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: border-color 0.12s;
}
.session-card:hover { border-color: var(--line); }
.session-card:active { border-color: var(--accent); }
.session-name {
  font-weight: 600;
  font-size: 17px;
  color: var(--text);
}
.session-meta {
  color: var(--dim);
  font-size: 13px;
  margin-top: 4px;
}
.free-btn {
  width: 100%;
  margin-top: 12px;
  height: 52px;
  border-radius: 14px;
  border: 1.5px dashed var(--line);
  background: transparent;
  color: var(--dim);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.free-btn:active { color: var(--text); border-color: var(--accent); }
</style>
