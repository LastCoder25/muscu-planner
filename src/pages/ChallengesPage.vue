<template>
  <q-page class="ch-page">
    <div class="head">
      <div class="head-left">
        <h1 class="p-title font-display">Challenges</h1>
        <button
          v-if="mode === 'solo'"
          class="head-rank"
          aria-label="Voir mes succès"
          @click="tab = 'ach'"
        >
          <span class="head-lvl font-display">Niv. {{ xpInfo.level }}</span>
        </button>
      </div>
      <q-btn
        v-if="mode === 'solo'"
        no-caps
        unelevated
        color="primary"
        text-color="dark"
        icon="add"
        label="Nouveau"
        @click="goNew"
      />
    </div>

    <div class="seg2">
      <button class="seg2-b" :class="{ on: mode === 'solo' }" @click="mode = 'solo'">Solo</button>
      <button class="seg2-b" :class="{ on: mode === 'combo' }" @click="mode = 'combo'">
        🎯 Défi 360
      </button>
    </div>

    <div v-if="mode === 'solo'" class="tabs">
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

    <template v-else-if="mode === 'solo'">
      <!-- EN COURS : en-tête capacité (jetons) + tuiles groupées par voie -->
      <template v-if="tab === 'active'">
        <div class="cap-card">
          <div class="cap-row">
            <span class="cap-lane">💪 Muscu</span>
            <span class="pips">
              <span v-for="n in BUDGET" :key="n" class="pip" :class="{ on: n <= muscuUsed }" />
            </span>
            <span class="cap-num font-display">{{ muscuUsed }}/{{ BUDGET }}</span>
            <span class="cap-acc" :class="{ used: muscuAccUsed }">+1 access.</span>
          </div>
          <div class="cap-row">
            <span class="cap-lane">🏃 Cardio</span>
            <span class="pips">
              <span v-for="n in BUDGET" :key="n" class="pip" :class="{ on: n <= cardioUsed }" />
            </span>
            <span class="cap-num font-display">{{ cardioUsed }}/{{ BUDGET }}</span>
          </div>
          <div class="cap-hint">
            Un défi occupe 1 à 3 places selon sa durée. Côté muscu, les petits exos (mollets, abdos,
            bras) sont « accessoires » et gratuits.
          </div>
        </div>

        <div v-if="shown.length === 0" class="empty">Aucun challenge en cours. Lance-en un !</div>

        <template v-for="grp in activeGroups" :key="grp.key">
          <div v-if="grp.list.length" class="lane-group">
            <div class="lane-title">{{ grp.label }}</div>
            <div class="ch-tiles">
              <button v-for="c in grp.list" :key="c.id" class="ch-tile" @click="goDetail(c.id)">
                <div class="ct-top">
                  <span class="ct-name">{{ c.exercise_name }}</span>
                  <span class="ct-cost">{{ cardCostLabel(c) }}</span>
                </div>
                <span class="cc-today" :class="st(c).isDoneToday ? 'done' : 'todo'">{{
                  st(c).isDoneToday ? '✓ À jour' : '● À faire'
                }}</span>
                <div class="bar">
                  <div class="fill" :style="{ width: st(c).completionPct + '%' }" />
                </div>
                <div class="ct-sub">
                  {{ st(c).completionPct }}% · j{{
                    Math.min(Math.max(1, st(c).dayIndex + 1), c.duration_days)
                  }}/{{ c.duration_days }}
                </div>
                <div v-if="bal(c) !== 0" class="cc-bal" :class="bal(c) > 0 ? 'ahead' : 'behind'">
                  <template v-if="bal(c) > 0">▲ +{{ bal(c) }} {{ unitOf(c) }}</template>
                  <template v-else>▼ −{{ -bal(c) }} {{ unitOf(c) }}</template>
                </div>
              </button>
            </div>
          </div>
        </template>
      </template>

      <!-- TERMINÉS / ABANDONNÉS : liste classique -->
      <template v-else-if="LIST_TABS.includes(tab)">
        <div v-if="shown.length === 0" class="empty">
          {{
            tab === 'done'
              ? 'Aucun challenge terminé pour l’instant.'
              : 'Aucun challenge abandonné.'
          }}
        </div>
        <button v-for="c in shown" :key="c.id" class="ch-card" @click="goDetail(c.id)">
          <div class="cc-top">
            <div class="cc-name">{{ c.exercise_name }}</div>
            <span class="cc-badge" :class="c.status">{{ statusLabel(c) }}</span>
          </div>
          <div class="cc-meta">{{ fmtName(c.format) }} · {{ c.duration_days }} j</div>
          <div class="bar"><div class="fill" :style="{ width: st(c).completionPct + '%' }" /></div>
          <div class="cc-sub">
            {{ st(c).completionPct }}% · {{ st(c).totalDone }} {{ unitOf(c) }}
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
            ><span class="er-l">{{
              e.unit === 'time'
                ? isCardioChallengeRow({ unit: e.unit, exercise_id: e.id })
                  ? 'min'
                  : 'sec'
                : e.unit === 'distance'
                  ? 'km'
                  : 'reps'
            }}</span>
          </div>
        </div>
      </template>

      <!-- Mur de succès -->
      <template v-else>
        <!-- Niveau des challenges / XP -->
        <div class="level-card">
          <div class="lvl-top">
            <div class="rank-info">
              <div class="rank-label font-display">Niveau {{ xpInfo.level }}</div>
              <div class="lvl-xp">{{ xpInfo.xp.toLocaleString('fr-FR') }} XP</div>
            </div>
          </div>
          <div class="lvl-bar">
            <div class="lvl-fill" :style="{ width: xpInfo.progressPct + '%' }" />
          </div>
          <div class="lvl-next">
            Encore {{ (xpInfo.xpForLevel - xpInfo.xpIntoLevel).toLocaleString('fr-FR') }} XP →
            niveau <b>{{ xpInfo.level + 1 }}</b>
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

    <!-- DÉFI 360 -->
    <template v-else>
      <div v-if="!activeCombo" class="combo-empty">
        <p>
          Un défi <b>full-body sur 7 jours</b> : un exo par groupe, tes séries réparties dans la
          semaine.
        </p>
        <q-btn
          color="primary"
          text-color="dark"
          no-caps
          size="lg"
          icon="add"
          label="Lancer un Défi 360"
          @click="router.push('/combo/new')"
        />
      </div>
      <template v-else>
        <div class="combo360-head">
          <div class="c3-top">
            <span class="c3-pct font-display">{{ comboPct }}%</span>
            <span class="c3-week">📅 {{ comboWeek }}</span>
          </div>
          <div class="bar"><div class="fill" :style="{ width: comboPct + '%' }" /></div>
        </div>
        <q-btn
          class="full-width q-mb-sm"
          outline
          color="primary"
          no-caps
          icon="fitness_center"
          label="Générer une séance"
          :to="`/combo/${activeCombo.id}/session`"
        />
        <div v-for="leg in activeCombo.legs" :key="leg.exercise_id" class="combo-leg">
          <div class="cl-top">
            <button class="cl-name" @click="openHistory(leg)">
              {{ leg.exercise_name }}
              <span v-if="leg.weight_kg" class="cl-kg">{{ leg.weight_kg }} kg</span>
              <q-icon name="history" size="14px" class="cl-hist-ic" />
            </button>
            <span class="cl-sub" :class="{ ok: legSetsDone(leg) >= leg.target }">
              {{ legSetsDone(leg) }}/{{ leg.target }} séries
            </span>
          </div>
          <div class="seg-bar">
            <span
              v-for="n in leg.target"
              :key="n"
              class="seg"
              :class="{ on: n <= legSetsDone(leg) }"
            />
          </div>
          <div class="cl-add-lbl">Ajouter des séries :</div>
          <div class="cl-actions">
            <button
              v-for="n in [1, 2, 3, 4]"
              :key="n"
              class="cl-add"
              :title="`Ajouter ${n} série${n > 1 ? 's' : ''}`"
              @click="openSet(leg, n)"
            >
              +{{ n }}
            </button>
            <button
              class="cl-corr"
              :disabled="!legSetsDone(leg)"
              title="Retirer la dernière série"
              @click="undoSet(leg)"
            >
              ↩
            </button>
          </div>
        </div>
      </template>
    </template>

    <!-- Saisie d'une série : reps + poids, préremplis avec la dernière série -->
    <q-dialog v-model="setOpen">
      <q-card class="set-card">
        <div class="set-title font-display">{{ setLeg?.exercise_name }}</div>
        <div class="set-desc">
          {{ setCount > 1 ? `${setCount} séries` : '1 série' }} · reps &amp; poids
        </div>
        <div class="set-row">
          <span class="set-lbl">Reps</span>
          <q-input v-model.number="setReps" type="number" filled dense style="max-width: 110px" />
        </div>
        <div class="set-row">
          <span class="set-lbl">Poids</span>
          <q-input
            v-model.number="setWeight"
            type="number"
            filled
            dense
            suffix="kg"
            style="max-width: 130px"
          />
          <span class="set-hint">vide = poids du corps</span>
        </div>
        <div v-if="setLeg?.assistable" class="set-row">
          <span class="set-lbl">Assisté</span>
          <q-toggle v-model="setAssisted" />
          <span class="set-hint">élastique / machine → ×0,6</span>
        </div>
        <div class="set-actions">
          <q-btn flat no-caps label="Annuler" @click="setOpen = false" />
          <q-btn
            unelevated
            color="primary"
            text-color="dark"
            no-caps
            label="Valider"
            @click="saveSet"
          />
        </div>
      </q-card>
    </q-dialog>

    <!-- Historique des séries d'un exo -->
    <q-dialog v-model="histOpen">
      <q-card class="set-card">
        <div class="set-title font-display">{{ histLeg?.exercise_name }}</div>
        <div class="set-desc">{{ histSets.length }} série{{ histSets.length > 1 ? 's' : '' }}</div>
        <div v-if="!histSets.length" class="hist-empty">Aucune série enregistrée.</div>
        <div v-else class="hist-list">
          <div v-for="(s, i) in histSets" :key="i" class="hist-row">
            <span class="hist-n">{{ histSets.length - i }}</span>
            <span class="hist-main">
              {{ s.reps }} reps<template v-if="s.weight"> · {{ s.weight }} kg</template>
              <span v-if="s.assisted" class="hist-asst">assisté</span>
            </span>
            <span class="hist-date">{{ fmtDay(s.date) }}</span>
          </div>
        </div>
        <div class="set-actions">
          <q-btn flat no-caps label="Fermer" @click="histOpen = false" />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import {
  challengeStats,
  challengeXpPoints,
  challengeLiveBalance,
  evaluateAchievements,
  type Challenge,
} from '@/lib/challenges';
import { computeLevel } from '@/lib/levels';
import { formatOption } from '@/data/challengeFormats';
import { ACHIEVEMENTS, RARITY_LABEL } from '@/data/achievements';
import { useChallengesStore, isCardioChallengeRow } from '@/stores/challenges';
import { useComboStore } from '@/stores/combo';
import {
  comboProgressPct,
  legSetsDone,
  legLastReps,
  legLastWeight,
  legLastAssisted,
  legSets,
  type ComboLeg,
} from '@/lib/combo';
import { logicalToday } from '@/lib/challenges';
import {
  tokenCost,
  isAccessoryMuscle,
  usedTokens,
  accessoryCount,
  CHALLENGE_TOKEN_BUDGET,
  type LaneChallenge,
} from '@/lib/challengeLimits';
import { REP_XP, assistMult } from '@/lib/athlete';
import { useProgress } from '@/composables/useProgress';
import { useCharacterStore } from '@/stores/character';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const store = useChallengesStore();
const comboStore = useComboStore();
const progress = useProgress();
const character = useCharacterStore();
const loading = ref(true);

// Énergie d'aventure dispo (peut être négative = déficit). ENERGY_PER_XP = 1.
const availableEnergy = computed(
  () =>
    progress.energyEarned.value +
    (character.row?.login_energy ?? 0) -
    (character.row?.energy_spent ?? 0),
);

const mode = ref<'solo' | 'combo'>('solo');
const activeCombo = computed(() => comboStore.list.find((c) => c.status === 'active') ?? null);
const comboPct = computed(() => (activeCombo.value ? comboProgressPct(activeCombo.value) : 0));
// Semaine du Défi 360 (début → fin) pour l'afficher clairement.
function fmtDM(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}
function addDaysLocal(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, (d ?? 1) + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
const comboWeek = computed(() => {
  const c = activeCombo.value;
  if (!c) return '';
  return `${fmtDM(c.start_date)} → ${fmtDM(addDaysLocal(c.start_date, c.duration_days - 1))}`;
});

// Saisie d'une série (reps + poids), préremplie avec la dernière série de l'exo.
const setOpen = ref(false);
const setLeg = ref<ComboLeg | null>(null);
const setCount = ref(1); // nb de séries identiques à ajouter (+1..+4)
const setReps = ref<number>(10);
const setWeight = ref<number | null>(null);
const setAssisted = ref(false);
function openSet(leg: ComboLeg, count: number) {
  setLeg.value = leg;
  setCount.value = count;
  setReps.value = legLastReps(leg);
  setWeight.value = legLastWeight(leg);
  setAssisted.value = legLastAssisted(leg);
  setOpen.value = true;
}
function saveSet() {
  const leg = setLeg.value;
  const reps = Math.max(1, Math.round(setReps.value || 0));
  if (!activeCombo.value || !leg) return;
  const w = setWeight.value != null && setWeight.value > 0 ? setWeight.value : null;
  const asst = !!leg.assistable && setAssisted.value;
  for (let i = 0; i < setCount.value; i++) {
    comboStore.addSet(activeCombo.value.id, leg.exercise_id, logicalToday(), reps, w, asst);
  }
  setOpen.value = false;
}
function undoSet(leg: ComboLeg) {
  if (!activeCombo.value) return;
  const sets = legSets(leg);
  const last = sets[sets.length - 1];
  // Énergie que cette série a rapportée (≈ son XP, ENERGY_PER_XP=1).
  const setEnergy = last
    ? Math.round((last.reps || 0) * REP_XP * (leg.rep_weight ?? 1) * assistMult(last.assisted))
    : 0;
  const wouldDeficit = availableEnergy.value - setEnergy < 0;
  const doRemove = () => comboStore.removeLastSet(activeCombo.value!.id, leg.exercise_id);
  if (wouldDeficit) {
    $q.dialog({
      title: 'Retirer cette série ?',
      message:
        "Tu as déjà dépensé l'énergie gagnée avec cette série. La retirer te mettra en déficit d'énergie : il faudra refaire du sport avant de rejouer à l'aventure.",
      cancel: { label: 'Annuler', flat: true },
      ok: { label: 'Retirer quand même', color: 'negative' },
    }).onOk(doRemove);
  } else {
    doRemove();
  }
}

// Historique des séries d'un exo.
const histOpen = ref(false);
const histLeg = ref<ComboLeg | null>(null);
const histSets = computed(() => (histLeg.value ? [...legSets(histLeg.value)].reverse() : []));
function openHistory(leg: ComboLeg) {
  histLeg.value = leg;
  histOpen.value = true;
}
function fmtDay(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

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
const xpInfo = computed(() => computeLevel(challengeXpPoints(store.list)));

// Capacité (jetons) par voie, pour que l'utilisateur s'organise.
function laneChallenges(cardio: boolean): LaneChallenge[] {
  return store.list
    .filter((c) => c.status === 'active' && isCardioChallengeRow(c) === cardio)
    .map((c) => ({
      accessory: isAccessoryMuscle(c.muscle_primary),
      durationDays: c.duration_days,
    }));
}
const muscuUsed = computed(() => usedTokens(laneChallenges(false)));
const cardioUsed = computed(() => usedTokens(laneChallenges(true)));
const muscuAccUsed = computed(() => accessoryCount(laneChallenges(false)) >= 1);
const BUDGET = CHALLENGE_TOKEN_BUDGET;
// Défis actifs groupés par voie (affichage en tuiles).
const activeMuscuCh = computed(() =>
  store.list.filter((c) => c.status === 'active' && !isCardioChallengeRow(c)),
);
const activeCardioCh = computed(() =>
  store.list.filter((c) => c.status === 'active' && isCardioChallengeRow(c)),
);
const activeGroups = computed(() => [
  { key: 'muscu', label: '💪 Musculation', list: activeMuscuCh.value },
  { key: 'cardio', label: '🏃 Cardio', list: activeCardioCh.value },
]);
// Coût d'un défi (badge sur la carte).
function cardCostLabel(c: Challenge): string {
  if (isAccessoryMuscle(c.muscle_primary)) return 'accessoire';
  const n = tokenCost(c.duration_days);
  return `${n} jeton${n > 1 ? 's' : ''}`;
}

function st(c: Challenge) {
  return challengeStats(c);
}
function bal(c: Challenge) {
  return challengeLiveBalance(c);
}
function unitOf(c: Challenge) {
  // cardio en temps = minutes ; gainage en temps = secondes.
  if (c.unit === 'time') return isCardioChallengeRow(c) ? 'min' : 'sec';
  return c.unit === 'distance' ? 'km' : 'reps';
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
    await comboStore.fetchMine().catch(() => undefined);
    await character.fetchMine().catch(() => undefined); // pour l'énergie (garde-fou déficit)
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
.head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.head-rank {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  flex: none;
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
  padding: 8px 15px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s,
    transform 0.1s;
  &:hover {
    border-color: var(--dim);
    color: var(--text);
  }
  &.on {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  &.on:active {
    transform: scale(0.97);
  }
}
.empty {
  color: var(--dim);
  padding: 24px 0;
}

/* Bandeau de capacité (jetons) */
.cap-card {
  margin-bottom: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
}
.cap-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.cap-lane {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  min-width: 74px;
}
.pips {
  display: flex;
  gap: 4px;
}
.pip {
  width: 14px;
  height: 8px;
  border-radius: 3px;
  background: var(--line);
}
.pip.on {
  background: var(--accent);
}
.cap-acc {
  font-size: 11px;
  color: var(--dim);
}
.cap-acc.used {
  color: var(--accent);
}
.cap-hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--dim);
  margin-top: 4px;
}
.cc-cost {
  color: var(--accent);
}
.cap-num {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  min-width: 30px;
}
/* Bannière Défi 360 */
.combo-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--accent);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
}
.combo-banner.ghost {
  border-style: dashed;
  border-color: var(--line);
  background: var(--surface);
}
.cb-emo {
  font-size: 24px;
}
.cb-main {
  flex: 1;
  min-width: 0;
}
.cb-title {
  font-weight: 700;
  font-size: 15px;
}
.cb-sub {
  font-size: 12px;
  color: var(--dim);
}

/* Segmenté Solo / Défi 360 */
.seg2 {
  display: flex;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 14px;
}
.seg2-b {
  flex: 1;
  padding: 9px 8px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13.5px;
  cursor: pointer;
}
.seg2-b.on {
  background: var(--accent);
  color: var(--accent-ink, #15120e);
}

/* Défi 360 (onglet) */
.combo-empty {
  text-align: center;
  color: var(--dim);
  padding: 20px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
}
.combo360-head {
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.c3-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.c3-pct {
  font-size: 26px;
  font-weight: 800;
  color: var(--accent);
}
.c3-week {
  font-size: 13px;
  font-weight: 600;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.link-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12.5px;
  cursor: pointer;
}
.combo-leg {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 11px 12px;
  margin-bottom: 8px;
}
/* Barre segmentée : une case par série cible */
.seg-bar {
  display: flex;
  gap: 3px;
  margin: 9px 0;
}
.seg {
  flex: 1;
  min-width: 3px;
  height: 8px;
  border-radius: 3px;
  background: var(--surface-2);
}
.seg.on {
  background: var(--accent);
}
.cl-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.cl-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  padding: 0;
  font-weight: 600;
  font-size: 14.5px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.cl-hist-ic {
  color: var(--dim);
}
.hist-empty {
  color: var(--dim);
  font-size: 13px;
  padding: 8px 0;
}
.hist-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}
.hist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--surface-2);
}
.hist-n {
  min-width: 20px;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--accent);
}
.hist-main {
  flex: 1;
  font-size: 13px;
  color: var(--text);
}
.hist-asst {
  font-size: 10px;
  color: var(--d3, #ffb23f);
  margin-left: 6px;
}
.hist-date {
  font-size: 11px;
  color: var(--dim);
}
.cl-sub {
  font-size: 12.5px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.cl-sub.ok {
  color: var(--d1);
}
.cl-add-lbl {
  margin-top: 8px;
  font-size: 11px;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.cl-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}
.cl-add {
  flex: 1;
  padding: 9px 0;
  border-radius: 9px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.cl-add.neg {
  border-color: var(--d4);
  color: var(--d4);
}
.cl-corr {
  flex: none;
  width: 44px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--dim);
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
}
.cl-corr:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.cl-kg {
  font-size: 11px;
  color: var(--dim);
  margin-left: 4px;
}
.set-card {
  background: var(--surface);
  color: var(--text);
  padding: 18px 16px;
  border-radius: 16px;
  width: 320px;
  max-width: 92vw;
}
.set-title {
  font-size: 18px;
  font-weight: 700;
}
.set-desc {
  font-size: 12.5px;
  color: var(--dim);
  margin: 4px 0 14px;
}
.set-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.set-lbl {
  font-size: 13px;
  color: var(--dim);
  min-width: 46px;
}
.set-hint {
  font-size: 11px;
  color: var(--dim);
}
.set-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

/* Tuiles de défis (En cours), groupées par voie */
.lane-group {
  margin-bottom: 16px;
}
.lane-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13px;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.ch-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.ch-tile {
  display: flex;
  flex-direction: column;
  gap: 5px;
  text-align: left;
  padding: 11px 12px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  cursor: pointer;
}
.ch-tile:active {
  transform: scale(0.99);
}
.ct-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}
.ct-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
  line-height: 1.2;
}
.ct-cost {
  flex: none;
  font-size: 10px;
  font-weight: 700;
  color: var(--accent);
  white-space: nowrap;
}
.ct-sub {
  font-size: 11px;
  color: var(--dim);
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--dim);
}
.cc-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.cc-badge.active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}
.cc-badge.done {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 16%, transparent);
}
.cc-badge.abandoned {
  color: var(--d4);
  background: color-mix(in srgb, var(--d4) 16%, transparent);
}
.cc-today {
  flex: none;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 6px;
  white-space: nowrap;
}
.cc-today.done {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 18%, transparent);
}
.cc-today.todo {
  color: var(--d3);
  background: color-mix(in srgb, var(--d3) 18%, transparent);
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
.cc-bal.even {
  color: var(--dim);
  background: color-mix(in srgb, var(--dim) 14%, transparent);
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

/* Rang global / XP (F → SSS) */
.level-card {
  --rank: var(--dim);
  background: var(--surface-2);
  border: 1px solid var(--rank);
  border-radius: 16px;
  padding: 14px 16px;
  margin-bottom: 14px;
}
.level-card.rank-f {
  --rank: #8a8a8a;
}
.level-card.rank-e {
  --rank: #7bc86c;
}
.level-card.rank-d {
  --rank: #4db6ac;
}
.level-card.rank-c {
  --rank: #5aa9e6;
}
.level-card.rank-b {
  --rank: #b57bff;
}
.level-card.rank-a {
  --rank: #ffb23f;
}
.level-card.rank-s {
  --rank: #ff6a45;
}
.level-card.rank-ss {
  --rank: #ffd23f;
}
.level-card.rank-sss {
  --rank: #ffd23f;
  box-shadow: 0 0 24px rgba(255, 210, 63, 0.3);
}
.lvl-top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.rank-badge {
  width: 52px;
  height: 52px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 14px;
  border: 2px solid var(--rank);
  background: color-mix(in srgb, var(--rank) 18%, transparent);
  color: var(--rank);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.rank-info {
  flex: 1;
  min-width: 0;
}
.rank-label {
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
  margin-top: 2px;
}
.lvl-bar {
  height: 8px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  overflow: hidden;
  margin: 12px 0 6px;
}
.lvl-fill {
  height: 100%;
  background: var(--rank);
  border-radius: 999px;
  transition: width 0.4s ease;
}
.lvl-next {
  font-size: 11.5px;
  color: var(--dim);
  b {
    color: var(--rank);
  }
}
</style>
