<template>
  <q-page class="home-page">
    <header class="home-head">
      <div>
        <div class="text-dim text-caption">Salut</div>
        <h1 class="home-name font-display">
          {{ profileStore.profile?.identity.name || 'Athlète' }}
        </h1>
      </div>
      <div class="home-badges">
        <button class="ath-home" aria-label="Niveau d'athlète" @click="goStats">
          <AthleteBadge
            :level="athLevel.level"
            :color="athLevel.tierColor"
            :tier="athLevel.tier"
            :size="46"
          />
          <span class="ath-home-tier font-display" :style="{ color: athLevel.tierColor }">
            {{ athLevel.tier }}
          </span>
        </button>
        <button class="ath-home" aria-label="Rang des défis" @click="goChallenges">
          <RankCrest :rank="challengeLevel.title" :size="44" />
          <span class="ath-home-tier font-display" :style="{ color: challengeRankColor }"
            >Défis</span
          >
        </button>
      </div>
    </header>

    <button class="xp-strip" :style="{ '--tier': athLevel.tierColor }" @click="goStats">
      <div class="xp-top">
        <span class="xp-lvl font-display">Niv. {{ athLevel.level }}</span>
        <span class="xp-frac"
          >{{ athLevel.xpIntoLevel.toLocaleString('fr-FR') }} /
          {{ athLevel.xpForLevel.toLocaleString('fr-FR') }} XP</span
        >
        <span class="xp-lvl next font-display">Niv. {{ athLevel.level + 1 }}</span>
      </div>
      <div class="xp-bar">
        <div class="xp-fill" :style="{ width: athLevel.progressPct + '%' }" />
      </div>
    </button>

    <button class="xp-strip" :style="{ '--tier': challengeRankColor }" @click="goChallenges">
      <div class="xp-top">
        <span class="xp-lvl font-display">Rang {{ challengeLevel.title }}</span>
        <span class="xp-frac"
          >{{ (challengeLevel.xp - challengeLevel.levelBaseXp).toLocaleString('fr-FR') }} /
          {{
            challengeLevel.nextLevelXp !== null
              ? (challengeLevel.nextLevelXp - challengeLevel.levelBaseXp).toLocaleString('fr-FR') +
                ' XP défis'
              : 'max'
          }}</span
        >
        <span v-if="challengeLevel.nextTitle" class="xp-lvl next font-display"
          >Rang {{ challengeLevel.nextTitle }}</span
        >
        <span v-else class="xp-lvl next font-display">🏆</span>
      </div>
      <div class="xp-bar">
        <div class="xp-fill" :style="{ width: challengeLevel.progressPct + '%' }" />
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

      <div class="tiles">
        <button class="tile" @click="startFree">
          <q-icon name="bolt" size="26px" />
          <span>Séance libre</span>
        </button>
        <button class="tile" @click="startImport">
          <q-icon name="smart_toy" size="26px" />
          <span>Séance IA</span>
        </button>
        <button class="tile" @click="goProgram">
          <q-icon name="fitness_center" size="26px" />
          <span>Mon programme</span>
        </button>
        <button class="tile tile-accent" @click="goChallenges">
          <q-icon name="emoji_events" size="26px" />
          <span>Challenges</span>
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
import AthleteBadge from '@/components/AthleteBadge.vue';
import RankCrest from '@/components/RankCrest.vue';
import { useAthlete } from '@/composables/useAthlete';
import { useChallengesStore } from '@/stores/challenges';
import { challengeXp } from '@/lib/challenges';
import { rankColor } from '@/data/ranks';

const $q = useQuasar();
const router = useRouter();
const profileStore = useProfileStore();
const sessionsStore = useSessionsStore();
const logs = useLogsStore();
const live = useLiveStore();
const { level: athLevel } = useAthlete();
const challengesStore = useChallengesStore();
const challengeLevel = computed(() => challengeXp(challengesStore.list));
const challengeRankColor = computed(() => rankColor(challengeLevel.value.title));
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

async function startFree() {
  await router.push('/free');
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
async function startImport() {
  await router.push('/import');
}
async function goProgram() {
  await router.push('/program');
}
async function goChallenges() {
  await router.push('/challenges');
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
.tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 24px;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 88px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--accent);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.3px;
  cursor: pointer;
  transition:
    border-color 0.12s,
    transform 0.08s;
}
.tile .q-icon {
  color: var(--accent);
}
.tile:active {
  transform: scale(0.97);
  border-color: var(--accent);
}
.tile-accent {
  background: var(--surface-2);
  border-color: var(--accent);
}
</style>
