<template>
  <q-page class="court-bilan">
    <header class="bar">
      <button class="back" aria-label="Retour" @click="goTennis">
        <q-icon name="arrow_back_ios_new" size="20px" />
      </button>
      <span class="bar-title font-display">Bilan tennis</span>
    </header>

    <div v-if="loading" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <div v-else-if="!log" class="empty">Bilan introuvable.</div>

    <div v-else class="body">
      <h1 class="title font-display">{{ log.name || 'Séance tennis' }}</h1>
      <div class="meta">
        {{ fmtDate(log.performed_at) }} · {{ log.duration_min }} min ·
        {{ log.with_partner ? 'avec partenaire' : 'seul(e)' }}
      </div>

      <div class="kpis">
        <div class="kpi">
          <div class="kpi-v font-display">{{ doneCount }}/{{ log.drills.length }}</div>
          <div class="kpi-l">drills faits</div>
        </div>
        <div class="kpi">
          <div class="kpi-v font-display">{{ log.duration_min }}</div>
          <div class="kpi-l">minutes</div>
        </div>
        <div class="kpi" v-if="log.global_difficulty">
          <div class="kpi-v font-display">{{ log.global_difficulty }}/4</div>
          <div class="kpi-l">ressenti moy.</div>
        </div>
      </div>

      <div v-for="(d, i) in log.drills" :key="i" class="drill" :class="{ skip: !d.done }">
        <q-icon
          :name="d.done ? 'check_circle' : 'radio_button_unchecked'"
          :color="d.done ? 'positive' : 'grey-6'"
          size="20px"
        />
        <div class="d-main">
          <div class="d-name">{{ d.name }}</div>
          <div class="d-info">
            <span v-if="d.elapsed_sec">{{ fmtSec(d.elapsed_sec) }}</span>
            <span v-if="d.sets_done != null">{{ d.sets_done }} série(s)</span>
            <span v-if="d.difficulty" class="d-diff" :style="{ '--c': `var(--d${d.difficulty})` }"
              >ressenti {{ d.difficulty }}/4</span
            >
          </div>
          <div v-if="d.comment" class="d-cmt">« {{ d.comment }} »</div>
        </div>
      </div>

      <q-btn
        class="again full-width"
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="add"
        label="Nouvelle séance tennis"
        @click="newCourt"
      />
      <button v-if="!readonly" class="del" @click="remove">Supprimer ce bilan</button>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useTennisStore } from '@/stores/tennis';
import type { DrillLog } from '@/lib/types';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const tennis = useTennisStore();

const loading = ref(true);
const log = ref<(DrillLog & { performed_at?: string }) | null>(null);
const readonly = computed(() => route.query.h === '1');

const doneCount = computed(() => log.value?.drills.filter((d) => d.done).length ?? 0);

function fmtSec(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
function fmtDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

onMounted(async () => {
  try {
    const id = String(route.params.id);
    const l = await tennis.fetchLogById(id);
    if (l) log.value = { ...l, performed_at: l.ended_at };
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loading.value = false;
  }
});

async function newCourt() {
  await router.push('/court/new');
}
async function goTennis() {
  await router.push('/tennis');
}
function remove() {
  const id = String(route.params.id);
  $q.dialog({
    title: 'Supprimer le bilan',
    message: 'Ce bilan sera supprimé définitivement. Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    void tennis.removeLog(id).then(async () => {
      $q.notify({ type: 'positive', message: 'Bilan supprimé.' });
      await router.push('/tennis');
    });
  });
}
</script>

<style scoped lang="scss">
.court-bilan {
  background: var(--bg);
  min-height: 100vh;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--line);
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
  text-align: center;
  padding: 40px 16px;
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
  margin: 4px 0 16px;
}
.kpis {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}
.kpi {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  text-align: center;
}
.kpi-v {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
}
.kpi-l {
  font-size: 11px;
  color: var(--dim);
  margin-top: 2px;
}
.drill {
  display: flex;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  margin-bottom: 8px;
  background: var(--surface);
}
.drill.skip {
  opacity: 0.55;
}
.d-main {
  flex: 1;
}
.d-name {
  font-weight: 600;
  color: var(--text);
}
.d-info {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--dim);
  margin-top: 3px;
}
.d-diff {
  color: var(--c);
  font-weight: 600;
}
.d-cmt {
  font-size: 12px;
  color: var(--dim);
  font-style: italic;
  margin-top: 4px;
}
.again {
  border-radius: 12px;
  margin-top: 18px;
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
