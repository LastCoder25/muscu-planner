<template>
  <q-page class="court-detail">
    <header class="bar">
      <button class="back" aria-label="Retour" @click="goBack">
        <q-icon name="arrow_back_ios_new" size="20px" />
      </button>
      <span class="bar-title font-display">Séance tennis</span>
    </header>

    <div v-if="loading" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <div v-else-if="!session" class="empty">Séance introuvable.</div>

    <div v-else class="body">
      <h1 class="title font-display">{{ session.name }}</h1>
      <div class="meta">
        {{ session.drills.length }} drills · {{ session.estimated_duration_min }} min ·
        {{ session.with_partner ? 'avec partenaire' : 'seul(e)' }}
      </div>

      <div v-for="(d, i) in session.drills" :key="i" class="drill">
        <div class="d-num">{{ i + 1 }}</div>
        <div class="d-main">
          <div class="d-name">
            {{ d.name }}
            <span class="d-cat">{{ catLabel(d.category) }}</span>
          </div>
          <div class="d-target">
            {{ fmtTarget(d.format) }}
            <span v-if="d.shot" class="d-shot">· {{ shotLabel(d.shot) }}</span>
            <span v-if="d.pattern" class="d-shot">· {{ patternLabel(d.pattern) }}</span>
          </div>
          <div v-if="d.notes" class="d-notes">{{ d.notes }}</div>
        </div>
      </div>

      <q-btn
        class="start full-width"
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="play_arrow"
        label="Démarrer la séance"
        @click="start"
      />
      <button class="del" @click="remove">Supprimer la séance</button>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useTennisStore } from '@/stores/tennis';
import {
  DRILL_CATEGORY_LABELS,
  DRILL_SHOT_LABELS,
  DRILL_PATTERN_LABELS,
  formatDrillTarget,
} from '@/data/tennis';
import type { DrillCategory, DrillShot, DrillFormat } from '@/lib/types';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const tennis = useTennisStore();
const loading = ref(true);

const id = computed(() => String(route.params.id));
const session = computed(() => tennis.byId(id.value)?.payload ?? null);

const catLabel = (c: DrillCategory) => DRILL_CATEGORY_LABELS[c];
const shotLabel = (s: DrillShot) => DRILL_SHOT_LABELS[s];
const patternLabel = (p: string) => DRILL_PATTERN_LABELS[p] ?? p;
const fmtTarget = (f: DrillFormat) => formatDrillTarget(f.mode, f.value, f.sets);

onMounted(async () => {
  try {
    if (!tennis.byId(id.value)) await tennis.fetchMine();
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loading.value = false;
  }
});

function start() {
  // Runner d'exécution : Phase 3.
  $q.notify({ type: 'info', message: 'Le mode « jouer la séance » arrive très bientôt.' });
}

function remove() {
  $q.dialog({
    title: 'Supprimer la séance',
    message: 'Cette séance de tennis sera supprimée. Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    void tennis.remove(id.value).then(async () => {
      $q.notify({ type: 'positive', message: 'Séance supprimée.' });
      await router.push('/tennis');
    });
  });
}

function goBack() {
  router.back();
}
</script>

<style scoped lang="scss">
.court-detail {
  background: var(--bg);
  min-height: 100vh;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 2;
}
.back {
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
  padding: 4px;
}
.bar-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}
.body {
  padding: 16px;
}
.empty {
  color: var(--dim);
  padding: 40px 16px;
  text-align: center;
}
.title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.meta {
  color: var(--dim);
  font-size: 13px;
  margin: 4px 0 18px;
}
.drill {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  margin-bottom: 8px;
  background: var(--surface);
}
.d-num {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--accent);
  min-width: 20px;
}
.d-main {
  flex: 1;
}
.d-name {
  font-weight: 600;
  color: var(--text);
}
.d-cat {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--dim);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 1px 6px;
  margin-left: 6px;
}
.d-target {
  font-size: 13px;
  color: var(--accent);
  margin-top: 3px;
}
.d-shot {
  color: var(--dim);
}
.d-notes {
  font-size: 12px;
  color: var(--dim);
  margin-top: 4px;
  line-height: 1.35;
}
.start {
  border-radius: 12px;
  margin-top: 20px;
}
.del {
  display: block;
  margin: 14px auto 0;
  background: none;
  border: none;
  color: var(--d4);
  font-size: 13px;
  cursor: pointer;
}
</style>
