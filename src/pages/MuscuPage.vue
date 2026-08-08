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

    <section v-if="tab === 'act'" class="quick">
      <div class="quick-head">
        <q-icon name="timer" size="20px" />
        <div>
          <div class="quick-title font-display">Séance rapide</div>
          <div class="quick-desc">
            Juste la durée → XP. Muscu compte en Muscu ; crossfit/hyrox en Spécifique.
          </div>
        </div>
      </div>
      <div class="quick-row">
        <span class="quick-lbl">Type</span>
        <div class="disc-chips">
          <button
            v-for="d in DISCIPLINES"
            :key="d.value"
            class="disc-chip"
            :class="{ on: qDiscipline === d.value }"
            @click="qDiscipline = d.value"
          >
            {{ d.label }}
          </button>
        </div>
      </div>
      <div class="quick-row">
        <span class="quick-lbl">Date</span>
        <q-input v-model="qDate" type="date" filled dense style="max-width: 180px" />
      </div>
      <div class="quick-row">
        <span class="quick-lbl">Durée</span>
        <q-input
          v-model.number="qHours"
          type="number"
          filled
          dense
          suffix="h"
          style="max-width: 90px"
        />
        <q-input
          v-model.number="qMinutes"
          type="number"
          filled
          dense
          suffix="min"
          style="max-width: 100px"
        />
      </div>
      <q-btn
        class="full-width q-mt-sm"
        color="primary"
        text-color="dark"
        no-caps
        icon="check"
        label="Enregistrer la séance"
        :loading="saving"
        @click="saveQuick"
      />
    </section>

    <template v-else>
      <div v-if="loading" class="column items-center q-mt-lg">
        <q-spinner color="primary" size="28px" />
      </div>
      <div v-else-if="!rows.length && !challengeDays.length" class="empty">
        Aucune séance enregistrée pour l'instant.
      </div>

      <div v-if="rows.length" class="hist-sub">Séances</div>
      <div v-for="r in rows" :key="r.id" class="log-card" @click="open(r.id)">
        <div class="log-main">
          <div class="log-name">{{ r.payload.name || 'Séance' }}</div>
          <div class="log-meta">
            {{ fmtDate(r.performed_at) }} ·
            {{ volume(r) > 0 ? volume(r) + ' kg' : (r.payload.duration_min || 0) + ' min'
            }}<template v-if="r.payload.global_difficulty">
              · note {{ r.payload.global_difficulty }}/4</template
            >
            · <span class="log-xp">⚡ +{{ sessXp(r) }} XP</span>
          </div>
        </div>
        <button class="log-del" aria-label="Supprimer" @click.stop="confirmDelete(r)">
          <q-icon name="delete_outline" size="18px" />
        </button>
        <q-icon name="chevron_right" color="grey-6" size="20px" />
      </div>

      <!-- Reps de défis muscu, jour par jour, avec l'XP gagnée -->
      <template v-if="challengeDays.length">
        <div class="hist-sub">Défis (reps par jour)</div>
        <div v-for="d in challengeDays" :key="d.key" class="log-card static">
          <div class="log-main">
            <div class="log-name">{{ d.name }}</div>
            <div class="log-meta">
              {{ fmtDate(d.date) }} · {{ d.done }} {{ d.unit
              }}<template v-if="d.xp > 0">
                · <span class="log-xp">⚡ +{{ d.xp }} XP</span></template
              >
            </div>
          </div>
        </div>
      </template>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useLogsStore, type LogRow } from '@/stores/logs';
import { useAuthStore } from '@/stores/auth';
import { useChallengesStore, isCardioChallengeRow } from '@/stores/challenges';
import { challengeDayXp } from '@/lib/challenges';
import { sessionXp } from '@/lib/athlete';
import { SCHEMA_VERSION, type SessionLog } from '@/lib/types';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const logs = useLogsStore();
const auth = useAuthStore();
const challenges = useChallengesStore();

const tab = ref<'act' | 'hist'>('act');
const loading = ref(false);
const rows = ref<LogRow[]>([]);
let fetched = false;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function performedAtIso(dateIso: string): string {
  const [y, m, dd] = dateIso.split('-').map((n) => Number(n) || 0);
  const now = new Date();
  const dt = new Date(
    y!,
    (m ?? 1) - 1,
    dd ?? 1,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  );
  return dt.toISOString();
}

type QuickDiscipline = 'musculation' | 'crossfit' | 'hyrox' | 'mobilite';
// Crossfit / Hyrox sont désormais des « Autre sport » (accueil → global + stats via
// signature). Ici on garde juste Muscu et Mobilité.
const DISCIPLINES: { value: QuickDiscipline; label: string }[] = [
  { value: 'musculation', label: 'Muscu' },
  { value: 'mobilite', label: 'Mobilité' },
];
const qDate = ref(todayIso());
const qHours = ref<number>(1);
const qMinutes = ref<number>(0);
const qDiscipline = ref<QuickDiscipline>('musculation');
const saving = ref(false);

async function saveQuick() {
  const uid = auth.user?.id;
  if (!uid) return;
  const totalMin = (qHours.value || 0) * 60 + (qMinutes.value || 0);
  if (totalMin <= 0) {
    $q.notify({ type: 'warning', message: 'Renseigne une durée.' });
    return;
  }
  saving.value = true;
  try {
    const iso = performedAtIso(qDate.value);
    const disc = qDiscipline.value;
    const label = DISCIPLINES.find((d) => d.value === disc)?.label ?? 'Muscu';
    const log: SessionLog = {
      schema_version: SCHEMA_VERSION,
      type: 'session_log',
      id: crypto.randomUUID(),
      name: `Séance ${label.toLowerCase()}`,
      started_at: iso,
      ended_at: iso,
      duration_min: totalMin,
      exercises: [],
      // musculation = piste Muscu ; crossfit/hyrox = piste Spécifique (cf. useProgress).
      ...(disc !== 'musculation' ? { discipline: disc } : {}),
    };
    await logs.insert(uid, log);
    $q.notify({
      type: 'positive',
      message: `Séance enregistrée — XP ${disc === 'musculation' ? 'muscu' : 'spécifique'} gagné.`,
    });
    qDate.value = todayIso();
    qHours.value = 1;
    qMinutes.value = 0;
    qDiscipline.value = 'musculation';
    fetched = false; // l'historique se rechargera à la prochaine ouverture
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    saving.value = false;
  }
}

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
const sessXp = (r: LogRow) => sessionXp(r.payload);
// Reps de défis muscu, jour par jour, avec l'XP d'effort gagnée ce jour-là.
const challengeDays = computed(() => {
  const out: { key: string; date: string; name: string; done: number; unit: string; xp: number }[] =
    [];
  for (const c of challenges.list) {
    if (isCardioChallengeRow(c)) continue; // muscu uniquement (le cardio a son propre historique)
    const uLabel = c.unit === 'time' ? 'sec' : c.unit === 'distance' ? 'km' : 'reps';
    for (const p of c.progress) {
      if (!(p.done > 0)) continue;
      out.push({
        key: `${c.id}:${p.day}`,
        date: p.date,
        name: c.exercise_name,
        done: p.done,
        unit: uLabel,
        xp: challengeDayXp(c, p.done),
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
});
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
    if (!challenges.list.length) await challenges.fetchMine().catch(() => undefined);
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
  if (route.query.tab === 'hist') tab.value = 'hist';
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
.quick {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  margin-top: 12px;
}
.quick-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.quick-head .q-icon {
  color: var(--accent);
}
.quick-title {
  font-weight: 600;
  color: var(--text);
}
.quick-desc {
  font-size: 12px;
  color: var(--dim);
}
.quick-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.quick-lbl {
  font-size: 13px;
  color: var(--dim);
  min-width: 48px;
}
.disc-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.disc-chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.disc-chip.on {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
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
.log-card.static {
  cursor: default;
}
.log-card.static:active {
  border-color: var(--line);
}
.hist-sub {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--dim);
  margin: 6px 2px 8px;
}
.log-xp {
  color: var(--accent);
  font-weight: 700;
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
