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
      >
        <div class="row items-center justify-between">
          <div>
            <div class="session-name">{{ s.name }}</div>
            <div class="session-meta">
              {{ s.payload.exercises.length }} exercices
              <template v-if="s.payload.estimated_duration_min"> · ~{{ s.payload.estimated_duration_min }} min</template>
            </div>
          </div>
          <q-btn
            round color="primary" text-color="dark" icon="play_arrow"
            @click="startSession(s.id)"
          />
        </div>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useProfileStore } from '@/stores/profile';
import { useSessionsStore } from '@/stores/sessions';

const $q = useQuasar();
const profileStore = useProfileStore();
const sessionsStore = useSessionsStore();
const loading = ref(true);

onMounted(async () => {
  try {
    await sessionsStore.fetchMine();
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Chargement impossible.' });
  } finally {
    loading.value = false;
  }
});

function startSession(id: string) {
  // Branché en Phase 2 (séance live).
  $q.notify({ message: 'La séance live arrive en Phase 2.', caption: id });
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
</style>
