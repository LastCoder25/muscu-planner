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
          <span v-if="challengesDueToday > 0" class="ic-badge">{{ challengesDueToday }}</span>
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
      <!-- Accès Aventure en HAUT (visible sans scroller) -->
      <button class="adv-tile" @click="goAventure">
        <span class="adv-ic">⚔️</span>
        <span class="adv-main">
          <span class="adv-name font-display">Mon aventurier</span>
          <span class="adv-sub">RPG · niveau {{ progress.general.value.level }}</span>
        </span>
        <q-icon name="chevron_right" size="22px" />
      </button>

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

      <q-btn
        class="add-session full-width"
        color="primary"
        text-color="dark"
        no-caps
        unelevated
        icon="add"
        label="Enregistrer une séance"
        @click="pickerOpen = true"
      />

      <button class="challenge-row" @click="goChallenges">
        <span class="cr-ic">🏆</span>
        <div class="cr-main">
          <div class="cr-title font-display">Challenges</div>
          <div class="cr-sub">Niv. {{ progress.challenges.value.level }} · défis & Défi 360</div>
        </div>
        <span v-if="challengesDueToday > 0" class="cr-badge">{{ challengesDueToday }} à faire</span>
        <q-icon v-else name="chevron_right" size="22px" />
      </button>

      <div class="tile-group">
        <div class="group-lbl">Mes sports</div>
        <div v-if="!progress.sportTiles.value.length" class="empty-sports">
          Aucune séance encore. Appuie sur « Enregistrer une séance » pour commencer 💪
        </div>
        <div class="main-tiles">
          <button
            v-for="t in progress.sportTiles.value"
            :key="t.key"
            class="mtile"
            @click="goSport(t.key)"
          >
            <span class="mt-strip" />
            <span class="mt-ic-wrap"><q-icon :name="t.icon" size="26px" class="mt-ic" /></span>
            <span class="mt-name font-display">{{ t.label }}</span>
            <span class="mt-lvl">Niv. {{ t.level.level }}</span>
            <span class="mt-bar"
              ><span class="mt-fill" :style="{ width: t.level.progressPct + '%' }"
            /></span>
          </button>
        </div>
      </div>
    </template>

    <!-- Sélecteur de saisie : route vers le bon logger selon le type de sport -->
    <q-dialog v-model="pickerOpen" position="bottom">
      <q-card class="picker-card">
        <div class="picker-title font-display">Enregistrer une séance</div>
        <button class="picker-row" @click="pickMuscu">
          <q-icon name="fitness_center" size="24px" />
          <div class="picker-main">
            <div class="picker-name">Muscu</div>
            <div class="picker-sub">Séance détaillée (reps/poids) ou rapide</div>
          </div>
          <q-icon name="chevron_right" size="20px" />
        </button>
        <button class="picker-row" @click="pickCardio">
          <q-icon name="directions_run" size="24px" />
          <div class="picker-main">
            <div class="picker-name">Cardio</div>
            <div class="picker-sub">Course, vélo, marche… (durée / distance)</div>
          </div>
          <q-icon name="chevron_right" size="20px" />
        </button>
        <button class="picker-row" @click="pickAutre">
          <q-icon name="sports" size="24px" />
          <div class="picker-main">
            <div class="picker-name">Autre sport</div>
            <div class="picker-sub">Tennis, foot, escalade… (durée)</div>
          </div>
          <q-icon name="chevron_right" size="20px" />
        </button>
      </q-card>
    </q-dialog>

    <!-- Ajout rapide d'une séance « autre sport » (durée) → XP globale + énergie -->
    <q-dialog v-model="autreOpen">
      <q-card class="autre-card">
        <div class="autre-title font-display">Autre sport</div>
        <div class="autre-desc">Compte dans ton niveau global et ton énergie d'aventure.</div>
        <q-select
          v-model="autreSport"
          :options="SPORT_OPTIONS"
          label="Sport"
          filled
          dense
          emit-value
          map-options
          class="q-mb-sm"
        />
        <q-input
          v-if="autreSport === 'Autre'"
          v-model="autreCustom"
          label="Précise le sport"
          filled
          dense
          class="q-mb-sm"
        />
        <q-input v-model="autreDate" type="date" label="Date" filled dense class="q-mb-sm" />
        <div class="autre-dur">
          <q-input v-model.number="autreHours" type="number" filled dense suffix="h" />
          <q-input v-model.number="autreMinutes" type="number" filled dense suffix="min" />
        </div>
        <div class="autre-actions">
          <q-btn flat no-caps label="Annuler" @click="autreOpen = false" />
          <q-btn
            unelevated
            color="primary"
            text-color="dark"
            no-caps
            label="Enregistrer"
            :loading="autreSaving"
            @click="saveAutre"
          />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useProfileStore } from '@/stores/profile';
import { useSessionsStore } from '@/stores/sessions';
import { useLogsStore } from '@/stores/logs';
import { useLiveStore } from '@/stores/live';
import { useLiveCourtStore } from '@/stores/liveCourt';
import { useAuthStore } from '@/stores/auth';
import { useProgress } from '@/composables/useProgress';
import { useChallengesStore } from '@/stores/challenges';
import { challengeStats, logicalToday } from '@/lib/challenges';
import { SCHEMA_VERSION, type SessionLog } from '@/lib/types';

const $q = useQuasar();
const router = useRouter();
const profileStore = useProfileStore();
const sessionsStore = useSessionsStore();
const logs = useLogsStore();
const auth = useAuthStore();
const live = useLiveStore();
const liveCourt = useLiveCourtStore();
const courtResume = computed(() => liveCourt.savedMeta());
const progress = useProgress();
const challenges = useChallengesStore();
// Défis actifs dont l'objectif du jour reste à faire (badge sur l'icône Challenges).
const challengesDueToday = computed(() => {
  const today = logicalToday();
  return challenges.list.filter((ch) => {
    if (ch.status !== 'active') return false;
    const s = challengeStats(ch, today);
    return s.dayIndex >= 0 && s.dayIndex < ch.duration_days && s.todayTarget > 0 && !s.isDoneToday;
  }).length;
});
const loading = ref(true);

const hasFree = ref(false);

onMounted(async () => {
  hasFree.value = live.hasSaved('free');
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
async function goStats() {
  await router.push('/stats');
}

// ── Autre sport (durée) → XP globale + énergie ──
function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const SPORT_OPTIONS = [
  'Tennis',
  'Padel',
  'Football',
  'Basket',
  'Natation',
  'Course',
  'Vélo',
  'Escalade',
  'Boxe',
  'Rugby',
  'Yoga',
  'Randonnée',
  'Ski',
  'Golf',
  'Danse',
  'Autre',
];
const pickerOpen = ref(false);
async function pickMuscu() {
  pickerOpen.value = false;
  await router.push('/muscu');
}
async function pickCardio() {
  pickerOpen.value = false;
  await router.push('/cardio');
}
function pickAutre() {
  pickerOpen.value = false;
  openAutre();
}
// Tap sur une tuile de sport → son HISTORIQUE (la saisie se fait via « + Séance »).
async function goSport(key: string) {
  if (key.startsWith('cardio:')) await router.push('/cardio?tab=hist');
  else await router.push('/muscu?tab=hist'); // muscu / autre sport / spécifique → historique séances
}
const autreOpen = ref(false);
const autreSport = ref<string>('Tennis');
const autreCustom = ref('');
const autreDate = ref(todayIsoLocal());
const autreHours = ref<number>(1);
const autreMinutes = ref<number>(0);
const autreSaving = ref(false);
function openAutre(preset?: string) {
  if (preset && SPORT_OPTIONS.includes(preset)) {
    autreSport.value = preset;
    autreCustom.value = '';
  } else if (preset) {
    autreSport.value = 'Autre';
    autreCustom.value = preset;
  } else {
    autreSport.value = 'Tennis';
    autreCustom.value = '';
  }
  autreDate.value = todayIsoLocal();
  autreHours.value = 1;
  autreMinutes.value = 0;
  autreOpen.value = true;
}
async function saveAutre() {
  const uid = auth.user?.id;
  if (!uid) return;
  const totalMin = (autreHours.value || 0) * 60 + (autreMinutes.value || 0);
  if (totalMin <= 0) {
    $q.notify({ type: 'warning', message: 'Renseigne une durée.' });
    return;
  }
  autreSaving.value = true;
  try {
    const [y, m, dd] = autreDate.value.split('-').map((n) => Number(n) || 0);
    const now = new Date();
    const iso = new Date(
      y!,
      (m ?? 1) - 1,
      dd ?? 1,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
    ).toISOString();
    const sport =
      autreSport.value === 'Autre' ? autreCustom.value.trim() || 'Autre sport' : autreSport.value;
    const log: SessionLog = {
      schema_version: SCHEMA_VERSION,
      type: 'session_log',
      id: crypto.randomUUID(),
      name: sport,
      started_at: iso,
      ended_at: iso,
      duration_min: totalMin,
      exercises: [],
      discipline: 'autre_sport',
    };
    await logs.insert(uid, log);
    $q.notify({ type: 'positive', message: 'Séance enregistrée — XP global + énergie 💪' });
    autreOpen.value = false;
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    autreSaving.value = false;
  }
}
</script>

<style scoped lang="scss">
.home-page {
  background: var(--bg);
  min-height: 100vh;
  /* Marge basse généreuse (+ safe-area) pour que la dernière tuile ne soit pas
     masquée par le FAB de feedback ni la barre système du navigateur mobile. */
  padding: 20px 16px calc(96px + env(safe-area-inset-bottom, 0px));
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
  position: relative;
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
.ic-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: var(--accent-ink, #15120e);
  border-radius: 9px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 11px;
  line-height: 1;
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
/* Grande ligne Challenges (au-dessus des sports) */
.challenge-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  margin-bottom: 10px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--accent);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.challenge-row:active {
  transform: scale(0.99);
}
.cr-ic {
  font-size: 30px;
}
.cr-main {
  flex: 1;
  min-width: 0;
}
.cr-title {
  font-weight: 800;
  font-size: 18px;
}
.cr-sub {
  font-size: 12px;
  color: var(--dim);
}
.cr-badge {
  flex: none;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink, #15120e);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12px;
}
.adv-tile {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  margin-bottom: 14px;
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
  --c: var(--accent); /* couleur par défaut (tuiles dynamiques par sport) */
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
.t-autre {
  --c: var(--d2, #c6d24a);
}
.add-session {
  margin-bottom: 14px;
  border-radius: 12px;
  font-weight: 700;
}
.empty-sports {
  color: var(--dim);
  font-size: 13px;
  padding: 10px 2px 4px;
}
.picker-card {
  background: var(--surface);
  color: var(--text);
  width: 100%;
  max-width: 520px;
  border-radius: 16px 16px 0 0;
  padding: 16px 14px calc(20px + env(safe-area-inset-bottom, 0px));
}
.picker-title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 10px;
}
.picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 12px 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  margin-bottom: 8px;
}
.picker-row:active {
  border-color: var(--accent);
}
.picker-main {
  flex: 1;
  min-width: 0;
}
.picker-name {
  font-weight: 600;
  font-size: 15px;
}
.picker-sub {
  font-size: 12px;
  color: var(--dim);
}
.autre-card {
  background: var(--surface);
  color: var(--text);
  padding: 18px 16px;
  border-radius: 16px;
  width: 320px;
  max-width: 92vw;
}
.autre-title {
  font-size: 18px;
  font-weight: 700;
}
.autre-desc {
  font-size: 12.5px;
  color: var(--dim);
  margin: 4px 0 12px;
}
.autre-dur {
  display: flex;
  gap: 8px;
}
.autre-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
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
