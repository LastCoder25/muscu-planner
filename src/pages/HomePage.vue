<template>
  <q-page class="home-page">
    <header class="home-head">
      <div>
        <div class="text-dim text-caption">Salut</div>
        <h1 class="home-name font-display">
          {{ profileStore.profile?.identity.name || 'Athlète' }}
        </h1>
      </div>
      <div class="head-actions">
        <button class="head-ic" aria-label="Agenda" @click="goAgenda">
          <q-icon name="calendar_month" size="22px" />
        </button>
        <button class="head-ic" aria-label="Challenges" @click="goChallenges">
          <q-icon name="emoji_events" size="22px" />
        </button>
        <button class="glvl" aria-label="Niveau global" @click="goStats">
          <span class="glvl-n font-display">{{ progress.global.value.level }}</span>
          <span class="glvl-l">Global</span>
        </button>
      </div>
    </header>

    <button class="xp-strip" @click="goStats">
      <div class="xp-top">
        <span class="xp-lvl font-display">Niveau global {{ progress.global.value.level }}</span>
        <span class="xp-frac"
          >{{ progress.global.value.xpIntoLevel.toLocaleString('fr-FR') }} /
          {{ progress.global.value.xpForLevel.toLocaleString('fr-FR') }} XP</span
        >
      </div>
      <div class="xp-bar">
        <div class="xp-fill" :style="{ width: progress.global.value.progressPct + '%' }" />
      </div>
    </button>

    <div v-if="loading" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <template v-else>
      <div v-if="hasFree" class="free-ongoing">
        <div class="fo-main">
          <q-icon name="bolt" size="20px" />
          <span>Séance libre en cours</span>
        </div>
        <div class="fo-actions">
          <button class="fo-resume" @click="resumeFree">Reprendre</button>
          <button class="fo-cancel" aria-label="Abandonner" @click="discardFree">Abandonner</button>
        </div>
      </div>

      <div v-if="courtResume" class="free-ongoing">
        <div class="fo-main">
          <q-icon name="sports_tennis" size="20px" />
          <span>Séance tennis · {{ courtResume.done }}/{{ courtResume.total }} drills</span>
        </div>
        <div class="fo-actions">
          <button class="fo-resume" @click="resumeCourt">Reprendre</button>
          <button class="fo-cancel" aria-label="Abandonner" @click="discardCourt">
            Abandonner
          </button>
        </div>
      </div>

      <div v-if="lastLog" class="last-card" @click="goHistory">
        <div class="last-lbl">Dernière séance · {{ fmtDate(lastLog.performed_at) }}</div>
        <div class="last-row">
          <span class="last-name">{{ lastLog.payload.name || 'Séance' }}</span>
          <span class="last-stat"
            >{{ lastVolume }} kg<template v-if="lastLog.payload.global_difficulty">
              · {{ lastLog.payload.global_difficulty }}/4</template
            ></span
          >
        </div>
      </div>

      <div class="tile-group">
        <div class="group-lbl">
          Général <span class="group-lvl">Niv. {{ progress.general.value.level }}</span>
        </div>
        <div class="main-tiles">
          <button
            v-for="t in generalTiles"
            :key="t.key"
            class="mtile"
            :class="'t-' + t.key"
            @click="t.go"
          >
            <span class="mt-strip" />
            <span class="mt-ic-wrap"><q-icon :name="t.icon" size="26px" class="mt-ic" /></span>
            <span class="mt-name font-display">{{ t.label }}</span>
            <span class="mt-lvl">Niv. {{ t.info.level }}</span>
            <span class="mt-bar"
              ><span class="mt-fill" :style="{ width: t.info.progressPct + '%' }"
            /></span>
          </button>
        </div>
      </div>

      <div class="tile-group">
        <div class="group-lbl">
          Spécifique <span class="group-lvl">Niv. {{ progress.specifique.value.level }}</span>
        </div>
        <div class="main-tiles">
          <button class="mtile t-tennis" @click="goTennis">
            <span class="mt-strip" />
            <span class="mt-ic-wrap"
              ><q-icon name="sports_tennis" size="26px" class="mt-ic"
            /></span>
            <span class="mt-name font-display">Tennis</span>
            <span class="mt-lvl">Niv. {{ progress.tennis.value.level }}</span>
            <span class="mt-bar"
              ><span class="mt-fill" :style="{ width: progress.tennis.value.progressPct + '%' }"
            /></span>
          </button>
        </div>
      </div>

      <div class="tile-group">
        <div class="group-lbl">Aventure</div>
        <button class="adv-tile" @click="goAventure">
          <span class="adv-ic">⚔️</span>
          <span class="adv-main">
            <span class="adv-name font-display">Mon aventurier</span>
            <span class="adv-sub">RPG · niveau {{ progress.general.value.level }}</span>
          </span>
          <q-icon name="chevron_right" size="22px" />
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
import { useLiveStore } from '@/stores/live';
import { useLiveCourtStore } from '@/stores/liveCourt';
import { useProgress } from '@/composables/useProgress';

const $q = useQuasar();
const router = useRouter();
const profileStore = useProfileStore();
const sessionsStore = useSessionsStore();
const logs = useLogsStore();
const live = useLiveStore();
const liveCourt = useLiveCourtStore();
const courtResume = computed(() => liveCourt.savedMeta());
const progress = useProgress();
// Général : renforcement + cardio (cartes couleur/discipline). Tennis = spécifique, à part.
const generalTiles = computed(() => [
  { key: 'muscu', label: 'Muscu', icon: 'fitness_center', info: progress.muscu.value, go: goMuscu },
  {
    key: 'cardio',
    label: 'Cardio',
    icon: 'directions_run',
    info: progress.cardio.value,
    go: goCardio,
  },
]);
const loading = ref(true);

const lastLog = ref<LogRow | null>(null);
const hasFree = ref(false);

const lastVolume = computed(() =>
  lastLog.value
    ? lastLog.value.payload.exercises.reduce(
        (a, ex) => a + ex.performed.reduce((b, s) => b + s.load_kg * s.reps, 0),
        0,
      )
    : 0,
);
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

onMounted(async () => {
  hasFree.value = live.hasSaved('free');
  try {
    await sessionsStore.fetchMine();
    const recent = await logs.fetchRecent(1);
    lastLog.value = recent[0] ?? null;
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loading.value = false;
  }
});

async function goHistory() {
  await router.push('/history');
}

async function goMuscu() {
  await router.push('/muscu');
}
async function goAgenda() {
  await router.push('/agenda');
}
async function goAventure() {
  await router.push('/aventure');
}
async function resumeFree() {
  await router.push('/free');
}
function discardFree() {
  $q.dialog({
    title: 'Abandonner la séance libre',
    message: 'La séance libre en cours sera supprimée (rien ne sera enregistré). Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Abandonner', color: 'negative' },
  }).onOk(() => {
    live.discardSaved('free');
    hasFree.value = false;
    $q.notify({ type: 'positive', message: 'Séance libre supprimée.' });
  });
}
async function resumeCourt() {
  if (courtResume.value) await router.push(`/court/${courtResume.value.sessionId}`);
}
function discardCourt() {
  $q.dialog({
    title: 'Abandonner la séance tennis',
    message: 'La séance de tennis en cours sera effacée. Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Abandonner', color: 'negative' },
  }).onOk(() => {
    liveCourt.discardSaved();
    $q.notify({ type: 'positive', message: 'Séance tennis abandonnée.' });
  });
}
async function goChallenges() {
  await router.push('/challenges');
}
async function goTennis() {
  await router.push('/tennis');
}
async function goCardio() {
  await router.push('/cardio');
}
async function goStats() {
  await router.push('/stats');
}
</script>

<style scoped lang="scss">
.home-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.home-head {
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.home-badges {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.ath-home {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.ath-home-tier {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.xp-strip {
  --tier: var(--accent);
  width: 100%;
  display: block;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 16px;
  cursor: pointer;
}
.xp-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.xp-lvl {
  font-size: 14px;
  font-weight: 700;
  color: var(--tier);
}
.xp-lvl.next {
  color: var(--dim);
}
.xp-frac {
  font-size: 12px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.xp-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  overflow: hidden;
  margin-top: 7px;
}
.xp-fill {
  height: 100%;
  background: var(--tier);
  border-radius: 999px;
  transition: width 0.4s ease;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.head-ic {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  color: var(--text);
  cursor: pointer;
}
.glvl {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: var(--surface-2);
  border: 1px solid var(--accent);
  border-radius: 14px;
  padding: 8px 14px;
  cursor: pointer;
}
.glvl-n {
  font-size: 26px;
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
}
.glvl-l {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dim);
}
.home-name {
  font-size: 32px;
  font-weight: 700;
  color: var(--text);
  margin: 2px 0 0;
}
.text-dim {
  color: var(--dim);
}
.free-ongoing {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: var(--surface-2);
  border: 1px solid var(--accent);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 16px;
}
.fo-main {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-weight: 600;
  font-size: 14px;
}
.fo-actions {
  display: flex;
  gap: 8px;
}
.fo-resume {
  padding: 7px 14px;
  border-radius: 10px;
  border: none;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.fo-cancel {
  padding: 7px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--d4);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.last-card {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 20px;
  cursor: pointer;
}
.last-lbl {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--dim);
}
.last-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 6px;
}
.last-name {
  font-weight: 600;
  font-size: 16px;
  color: var(--text);
}
.last-stat {
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--accent);
}
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
.session-card:hover {
  border-color: var(--line);
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
.tile-group {
  margin-bottom: 18px;
}
.group-lbl {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--dim);
  margin: 0 2px 8px;
  font-weight: 600;
}
.group-lvl {
  color: var(--accent);
  font-weight: 700;
}
.adv-tile {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--accent);
  background: linear-gradient(180deg, var(--surface-2), var(--surface));
  color: var(--text);
  cursor: pointer;
  transition: transform 0.12s;
}
.adv-tile:active {
  transform: scale(0.98);
}
.adv-ic {
  font-size: 26px;
  line-height: 1;
}
.adv-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.adv-name {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.3px;
}
.adv-sub {
  font-size: 12px;
  color: var(--dim);
}
.adv-tile .q-icon {
  color: var(--accent);
}
.main-tiles {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.mtile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 10px 13px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  overflow: hidden;
  transition:
    transform 0.12s,
    border-color 0.12s;
}
.mtile:active {
  transform: scale(0.97);
  border-color: var(--c);
}
.t-muscu {
  --c: var(--accent);
}
.t-cardio {
  --c: var(--d3);
}
.t-tennis {
  --c: var(--d1);
}
.mt-strip {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--c);
}
.mt-ic-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  margin-top: 4px;
  background: color-mix(in srgb, var(--c) 16%, transparent);
}
.mt-ic {
  color: var(--c);
}
.mt-name {
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.3px;
}
.mt-lvl {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dim);
}
.mt-bar {
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
  margin-top: 3px;
}
.mt-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--c);
}
</style>
