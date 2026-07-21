<template>
  <q-page class="ch-page">
    <div class="head">
      <h1 class="p-title font-display">Challenges</h1>
      <q-btn
        no-caps
        unelevated
        color="primary"
        text-color="dark"
        icon="add"
        label="Nouveau"
        @click="goNew"
      />
    </div>

    <div class="tabs">
      <button
        v-for="t in TABS"
        :key="t.value"
        class="tab"
        :class="{ on: tab === t.value }"
        @click="tab = t.value"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="loading" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <template v-else>
      <!-- En cours / Terminés / Abandonnés -->
      <template v-if="LIST_TABS.includes(tab)">
        <div v-if="shown.length === 0" class="empty">
          {{
            tab === 'active'
              ? 'Aucun challenge en cours. Lance-en un !'
              : tab === 'done'
                ? 'Aucun challenge terminé pour l’instant.'
                : 'Aucun challenge abandonné.'
          }}
        </div>
        <button v-for="c in shown" :key="c.id" class="ch-card" @click="goDetail(c.id)">
          <div class="cc-top">
            <div class="cc-name">{{ c.exercise_name }}</div>
            <span class="cc-badge" :class="c.status">{{ statusLabel(c) }}</span>
          </div>
          <div class="cc-meta">
            {{ fmtName(c.format) }} · {{ c.duration_days }} j · jour
            {{ Math.min(Math.max(1, st(c).dayIndex + 1), c.duration_days) }}/{{ c.duration_days }}
          </div>
          <div class="bar"><div class="fill" :style="{ width: st(c).completionPct + '%' }" /></div>
          <div class="cc-sub">
            {{ st(c).completionPct }}% · série {{ st(c).streak }} · {{ st(c).totalDone }}
            {{ c.unit === 'time' ? 'sec' : 'reps' }}
          </div>
          <div
            v-if="c.status === 'active' && bal(c) !== 0"
            class="cc-bal"
            :class="bal(c) > 0 ? 'ahead' : 'behind'"
          >
            {{ bal(c) > 0 ? `▲ +${bal(c)}` : `▼ −${-bal(c)}` }}
            {{ c.unit === 'time' ? 'sec' : 'reps' }}
            {{ bal(c) > 0 ? "d'avance" : 'de retard' }}
          </div>
        </button>
      </template>

      <!-- Exercices challengés -->
      <template v-else-if="tab === 'exos'">
        <div v-if="exoAgg.length === 0" class="empty">Pas encore d’exercice challengé.</div>
        <div v-for="e in exoAgg" :key="e.id" class="exo-card">
          <div class="exo-main">
            <div class="exo-name">{{ e.name }}</div>
            <div class="exo-meta">{{ e.count }} challenge{{ e.count > 1 ? 's' : '' }}</div>
          </div>
          <div class="exo-reps">
            <span class="er-v font-display">{{ e.total }}</span
            ><span class="er-l">{{ e.unit === 'time' ? 'sec' : 'reps' }}</span>
          </div>
        </div>
      </template>

      <!-- Mur de succès -->
      <template v-else>
        <!-- Niveau global / XP -->
        <div class="level-card">
          <div class="lvl-top">
            <div class="lvl-badge font-display">Niv. {{ xpInfo.level }}</div>
            <div class="lvl-title font-display">{{ xpInfo.title }}</div>
            <div class="lvl-xp">{{ xpInfo.xp.toLocaleString('fr-FR') }} XP</div>
          </div>
          <div class="lvl-bar">
            <div class="lvl-fill" :style="{ width: xpInfo.progressPct + '%' }" />
          </div>
          <div class="lvl-next">
            <template v-if="xpInfo.nextLevelXp !== null">
              Encore {{ (xpInfo.nextLevelXp - xpInfo.xp).toLocaleString('fr-FR') }} XP → niveau
              {{ xpInfo.level + 1 }}
            </template>
            <template v-else>Niveau max atteint 🏆</template>
          </div>
        </div>

        <div class="ach-count">
          {{ unlockedCount }} / {{ ACHIEVEMENTS.length }} succès débloqués
        </div>
        <div class="ach-grid">
          <div
            v-for="a in ACHIEVEMENTS"
            :key="a.code"
            class="ach"
            :class="['r-' + a.rarity, { on: unlocked.has(a.code) }]"
          >
            <span class="ach-rarity">{{ RARITY_LABEL[a.rarity] }}</span>
            <q-icon :name="a.icon" size="26px" />
            <div class="ach-t">{{ a.title }}</div>
            <div class="ach-d">{{ a.desc }}</div>
            <q-icon v-if="!unlocked.has(a.code)" name="lock" size="14px" class="ach-lock" />
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
import {
  challengeStats,
  challengeXp,
  challengeBalance,
  evaluateAchievements,
  type Challenge,
} from '@/lib/challenges';
import { formatOption } from '@/data/challengeFormats';
import { ACHIEVEMENTS, RARITY_LABEL } from '@/data/achievements';
import { useChallengesStore } from '@/stores/challenges';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const store = useChallengesStore();
const loading = ref(true);

const TABS = [
  { value: 'active', label: 'En cours' },
  { value: 'done', label: 'Terminés' },
  { value: 'abandoned', label: 'Abandonnés' },
  { value: 'exos', label: 'Exercices' },
  { value: 'ach', label: 'Succès' },
];
const tab = ref(TABS.some((t) => t.value === route.query.tab) ? String(route.query.tab) : 'active');

const LIST_TABS = ['active', 'done', 'abandoned'];
const shown = computed(() => store.list.filter((c) => c.status === tab.value));
const unlocked = computed(() => new Set(store.unlocked));
const unlockedCount = computed(() => ACHIEVEMENTS.filter((a) => unlocked.value.has(a.code)).length);
const xpInfo = computed(() => challengeXp(store.list));

function st(c: Challenge) {
  return challengeStats(c);
}
function bal(c: Challenge) {
  return challengeBalance(c);
}
function fmtName(f: string) {
  return formatOption(f)?.name ?? f;
}
function statusLabel(c: Challenge) {
  return c.status === 'active' ? 'en cours' : c.status === 'done' ? 'terminé' : 'abandonné';
}

// Agrégat par exercice : nb de challenges + itérations cumulées.
const exoAgg = computed(() => {
  const map = new Map<
    string,
    { id: string; name: string; unit: string; count: number; total: number }
  >();
  for (const c of store.list) {
    const cur = map.get(c.exercise_id) ?? {
      id: c.exercise_id,
      name: c.exercise_name,
      unit: c.unit,
      count: 0,
      total: 0,
    };
    cur.count += 1;
    cur.total += c.progress.reduce((a, p) => a + (p.done || 0), 0);
    map.set(c.exercise_id, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
});

async function goNew() {
  await router.push('/challenges/new');
}
async function goDetail(id: string) {
  await router.push(`/challenges/${id}`);
}

onMounted(async () => {
  try {
    await store.fetchMine();
    await store.fetchAchievements();
    // Rattrapage : débloque les succès mérités mais pas encore enregistrés.
    await store.unlock(evaluateAchievements(store.list));
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.ch-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 4px 0 14px;
}
.p-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.tab {
  padding: 7px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 13px;
  cursor: pointer;
  &.on {
    border-color: var(--accent);
    color: var(--text);
    background: var(--surface-2);
  }
}
.empty {
  color: var(--dim);
  padding: 24px 0;
}

.ch-card {
  display: block;
  width: 100%;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 10px;
  cursor: pointer;
}
.cc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.cc-name {
  font-weight: 600;
  font-size: 16px;
  color: var(--text);
}
.cc-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--dim);
}
.cc-badge.active {
  background: var(--accent);
  color: var(--accent-ink);
}
.cc-badge.done {
  background: var(--d1);
  color: var(--accent-ink);
}
.cc-meta {
  font-size: 12px;
  color: var(--dim);
  text-transform: capitalize;
  margin-top: 4px;
}
.bar {
  height: 8px;
  background: var(--surface-2);
  border-radius: 5px;
  overflow: hidden;
  margin: 9px 0 6px;
}
.fill {
  height: 100%;
  background: var(--accent);
  border-radius: 5px;
}
.cc-sub {
  font-size: 11.5px;
  color: var(--dim);
}
.cc-bal {
  margin-top: 6px;
  display: inline-block;
  font-size: 11.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
.cc-bal.ahead {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 16%, transparent);
}
.cc-bal.behind {
  color: var(--d4);
  background: color-mix(in srgb, var(--d4) 16%, transparent);
}

.exo-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 8px;
}
.exo-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
}
.exo-meta {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.exo-reps {
  text-align: right;
}
.er-v {
  display: block;
  font-size: 22px;
  font-weight: 600;
  color: var(--accent);
}
.er-l {
  font-size: 10px;
  color: var(--dim);
  text-transform: uppercase;
}

.ach-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.ach {
  --rar: var(--dim);
  position: relative;
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 22px 10px 16px;
  color: var(--dim-2);
  opacity: 0.6;
}
.ach.r-common {
  --rar: var(--dim);
}
.ach.r-rare {
  --rar: #5aa9e6;
}
.ach.r-epic {
  --rar: #b57bff;
}
.ach.r-legendary {
  --rar: var(--accent);
}
.ach.on {
  opacity: 1;
  color: var(--text);
  border-color: var(--rar);
}
.ach.on.r-legendary {
  box-shadow: 0 0 18px rgba(255, 210, 63, 0.22);
}
.ach.on .q-icon {
  color: var(--rar);
}
.ach-rarity {
  position: absolute;
  top: 7px;
  left: 8px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--rar);
  opacity: 0.9;
}
.ach:not(.on) .ach-rarity {
  opacity: 0.5;
}
.ach-t {
  font-weight: 700;
  font-size: 13px;
  margin-top: 6px;
}
.ach-d {
  font-size: 11px;
  color: var(--dim);
  margin-top: 3px;
  line-height: 1.25;
}
.ach-lock {
  position: absolute;
  top: 8px;
  right: 8px;
  color: var(--dim-2);
}
.ach-count {
  font-size: 12px;
  color: var(--dim);
  margin: 4px 2px 10px;
}

/* Niveau global / XP */
.level-card {
  background: var(--surface-2);
  border: 1px solid var(--accent);
  border-radius: 16px;
  padding: 14px 16px;
  margin-bottom: 14px;
}
.lvl-top {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.lvl-badge {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent);
}
.lvl-title {
  flex: 1;
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.lvl-xp {
  font-size: 13px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.lvl-bar {
  height: 8px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  overflow: hidden;
  margin: 10px 0 6px;
}
.lvl-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.4s ease;
}
.lvl-next {
  font-size: 11.5px;
  color: var(--dim);
}
</style>
