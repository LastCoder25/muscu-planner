<template>
  <q-page class="program-page">
    <header class="row items-center justify-between q-mb-md">
      <h1 class="prog-title font-display">Mon programme</h1>
      <span class="text-dim text-caption"
        >{{ sessionsStore.list.length }} séance{{ sessionsStore.list.length > 1 ? 's' : '' }}</span
      >
    </header>

    <div v-if="loading" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <template v-else>
      <div v-if="sessionsStore.list.length === 0" class="empty">
        Aucune séance générée pour l’instant.
        <button class="regen" @click="goProfile">Générer mon programme</button>
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
              {{ s.payload.exercises.length }} exercices · ~{{ estimateDurationMin(s.payload) }} min
            </div>
          </div>
          <div class="row items-center no-wrap" style="gap: 4px">
            <q-icon name="chevron_right" color="grey-6" size="20px" />
            <q-btn
              round
              color="primary"
              text-color="dark"
              icon="play_arrow"
              aria-label="Démarrer"
              @click.stop="startSession(s.id)"
            />
          </div>
        </div>
      </div>

      <button v-if="sessionsStore.list.length" class="regen ghost" @click="goProfile">
        Régénérer mon programme
      </button>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionsStore } from '@/stores/sessions';
import { estimateDurationMin } from '@/lib/estimates';

const $q = useQuasar();
const router = useRouter();
const sessionsStore = useSessionsStore();
const loading = ref(true);

onMounted(async () => {
  try {
    await sessionsStore.fetchMine();
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loading.value = false;
  }
});

async function openDetail(id: string) {
  await router.push(`/session/${id}/detail`);
}
async function startSession(id: string) {
  await router.push(`/session/${id}/ready`);
}
async function goProfile() {
  await router.push('/profile');
}
</script>

<style scoped lang="scss">
.program-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.prog-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.text-dim {
  color: var(--dim);
}
.empty {
  color: var(--dim);
  padding: 24px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: flex-start;
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
.session-card:active {
  border-color: var(--accent);
}
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
.regen {
  margin-top: 8px;
  height: 48px;
  padding: 0 18px;
  border-radius: 14px;
  border: none;
  background: var(--accent);
  color: var(--accent-ink);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.5px;
  cursor: pointer;
  &.ghost {
    width: 100%;
    background: transparent;
    border: 1.5px dashed var(--line);
    color: var(--dim);
  }
}
</style>
