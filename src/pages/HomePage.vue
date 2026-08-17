<template>
  <component :is="embedded ? 'div' : 'q-page'" class="home-page" :class="{ embedded }">
    <header class="home-head">
      <div>
        <div class="text-dim text-caption">Salut</div>
        <h1 class="home-name font-display">
          {{ profileStore.profile?.identity.name || 'Athlète' }}
        </h1>
      </div>
      <div class="head-actions">
        <button class="hsq" aria-label="Agenda" @click="goAgenda">
          <span class="hsq-ic"><q-icon name="calendar_month" size="20px" /></span>
          <span class="hsq-l">Agenda</span>
        </button>
        <button class="hsq" aria-label="Mon aventurier" @click="goAventure">
          <span class="hsq-ic">⚔️</span>
          <span class="hsq-l">Aventure</span>
        </button>
        <button class="hsq" aria-label="Challenges" @click="goChallenges">
          <span class="hsq-ic">🏆</span>
          <span class="hsq-l">Défis</span>
          <span v-if="challengesDueToday > 0" class="ic-badge">{{ challengesDueToday }}</span>
        </button>
        <button class="glvl" aria-label="Niveau global" @click="goStats">
          <span class="glvl-n font-display">{{ progress.global.value.level }}</span>
          <span class="glvl-l">Global</span>
          <span class="glvl-bar"
            ><span :style="{ width: progress.global.value.progressPct + '%' }"
          /></span>
        </button>
      </div>
    </header>

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

      <q-btn
        class="add-session full-width"
        color="primary"
        text-color="dark"
        no-caps
        unelevated
        icon="add"
        label="Enregistrer une séance"
        @click="openPicker"
      />

      <div v-if="statTotal > 0" class="stat-balance">
        <div class="sb-head">Ton équilibre</div>
        <div class="sb-bar">
          <span class="sb-seg pow" :style="{ flexGrow: progress.powerXp.value }" />
          <span class="sb-seg end" :style="{ flexGrow: progress.enduranceXp.value }" />
          <span class="sb-seg agi" :style="{ flexGrow: progress.agilityXp.value }" />
        </div>
        <div class="sb-legend">
          <span class="sb-l pow">💪 Force {{ statPct(progress.powerXp.value) }}%</span>
          <span class="sb-l end">❤️ Endurance {{ statPct(progress.enduranceXp.value) }}%</span>
          <span class="sb-l agi">⚡ Agilité {{ statPct(progress.agilityXp.value) }}%</span>
        </div>
      </div>

      <!-- Piliers Force & Endurance : niveaux des BÉNÉFICES de tout ton sport, en
           CERCLES (anneau = progression, chiffre au centre = niveau). -->
      <div v-if="statTotal > 0" class="pillars">
        <button
          v-for="p in pillars"
          :key="p.key"
          class="pillar"
          :class="p.key"
          :aria-label="'Détail ' + p.name"
          @click="goStats"
        >
          <span class="pl-ring">
            <svg viewBox="0 0 36 36" role="img" :aria-label="`${p.name} niveau ${p.lvl.level}`">
              <circle class="plr-track" cx="18" cy="18" r="15.9155" />
              <circle
                class="plr-arc"
                cx="18"
                cy="18"
                r="15.9155"
                transform="rotate(-90 18 18)"
                :stroke-dasharray="`${p.lvl.progressPct} 100`"
              />
              <text class="plr-emo" x="18" y="14.5" text-anchor="middle">{{ p.emoji }}</text>
              <text class="plr-n font-display" x="18" y="25" text-anchor="middle">
                {{ p.lvl.level }}
              </text>
            </svg>
          </span>
          <span class="pl-name font-display">{{ p.name }}</span>
          <span class="pl-pts">{{ p.pts.toLocaleString('fr-FR') }} pts</span>
          <span v-if="p.d30 > 0" class="pl-trend">↑ +{{ p.d30.toLocaleString('fr-FR') }} · 30 j</span>
        </button>
      </div>

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
            <span v-if="t.sig" class="mt-sig">{{ sigLabel(t.sig) }}</span>
            <span class="mt-bar">
              <span class="mt-fill" :style="{ width: t.level.progressPct + '%' }" />
              <span class="mt-bar-txt">{{ t.level.progressPct }}%</span>
            </span>
          </button>
        </div>
      </div>
    </template>

    <!-- Sélecteur de saisie : choix du sport, puis le type de séance disponible -->
    <q-dialog v-model="pickerOpen" position="bottom">
      <q-card class="picker-card">
        <!-- Étape 1 : le sport -->
        <template v-if="pickerStep === 'sport'">
          <div class="picker-title font-display">Enregistrer une séance</div>
          <button class="picker-row" @click="pickerStep = 'muscuType'">
            <q-icon name="fitness_center" size="24px" />
            <div class="picker-main">
              <div class="picker-name">Muscu</div>
              <div class="picker-sub">Séance détaillée ou rapide</div>
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
        </template>

        <!-- Étape 2 : type de séance muscu -->
        <template v-else>
          <div class="picker-title font-display">
            <button class="picker-back" @click="pickerStep = 'sport'">‹</button> Séance muscu
          </div>
          <button class="picker-row" @click="pickMuscuDetail">
            <q-icon name="checklist" size="24px" />
            <div class="picker-main">
              <div class="picker-name">Détaillée</div>
              <div class="picker-sub">Reps, poids, séries (séance libre)</div>
            </div>
            <q-icon name="chevron_right" size="20px" />
          </button>
          <button class="picker-row" @click="pickMuscuQuick">
            <q-icon name="timer" size="24px" />
            <div class="picker-main">
              <div class="picker-name">Rapide</div>
              <div class="picker-sub">Juste la durée</div>
            </div>
            <q-icon name="chevron_right" size="20px" />
          </button>
        </template>
      </q-card>
    </q-dialog>

    <!-- Ajout rapide d'une séance « autre sport » (durée) → XP globale + énergie -->
    <q-dialog v-model="autreOpen">
      <q-card class="autre-card">
        <div class="autre-title font-display">Autre sport</div>
        <div class="autre-desc">Compte dans ton niveau global et ton énergie d'aventure.</div>
        <q-select
          v-model="autreSport"
          :options="filteredSports"
          label="Sport"
          filled
          dense
          use-input
          fill-input
          hide-selected
          input-debounce="0"
          class="q-mb-sm"
          @filter="filterSports"
        >
          <template #no-option>
            <q-item>
              <q-item-section class="text-grey">
                Rien trouvé — choisis « Autre » pour préciser
              </q-item-section>
            </q-item>
          </template>
        </q-select>
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
  </component>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useProfileStore } from '@/stores/profile';
import { useSessionsStore } from '@/stores/sessions';
import { useLogsStore } from '@/stores/logs';
import { useLiveStore } from '@/stores/live';
import { useLiveCourtStore } from '@/stores/liveCourt';
import { useAuthStore } from '@/stores/auth';
import { useProgress } from '@/composables/useProgress';
import { useXpFx } from '@/composables/useXpFx';
import { useChallengesStore } from '@/stores/challenges';
import { challengeStats, logicalToday } from '@/lib/challenges';
import { SCHEMA_VERSION, type SessionLog } from '@/lib/types';

// `embedded` : rendu dans un VOLET (cockpit Z Fold déplié) → racine <div> au lieu
// de <q-page> (pas de q-page imbriquée) + hauteur fluide (le volet gère le scroll).
defineProps<{ embedded?: boolean }>();

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
const xpFx = useXpFx();
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
  'Crossfit',
  'Hyrox',
  'Badminton',
  'Squash',
  'Tennis de table',
  'Volley',
  'Handball',
  'Judo',
  'Arts martiaux',
  'MMA',
  'Aviron',
  'Surf',
  'Paddle',
  'Snowboard',
  'Roller',
  'Corde à sauter',
  'Gymnastique',
  'Pilates',
  'Équitation',
  'Autre',
];
// Recherche dans le sélecteur de sport.
const filteredSports = ref<string[]>([...SPORT_OPTIONS]);
function filterSports(val: string, update: (fn: () => void) => void) {
  update(() => {
    const n = (val || '').toLowerCase();
    filteredSports.value = n
      ? SPORT_OPTIONS.filter((s) => s.toLowerCase().includes(n))
      : [...SPORT_OPTIONS];
  });
}
const pickerOpen = ref(false);
const pickerStep = ref<'sport' | 'muscuType'>('sport');
function openPicker() {
  pickerStep.value = 'sport';
  pickerOpen.value = true;
}
async function pickMuscuDetail() {
  pickerOpen.value = false;
  await router.push('/free'); // séance libre : reps / poids / séries
}
async function pickMuscuQuick() {
  pickerOpen.value = false;
  await router.push('/muscu'); // log rapide (durée)
}
async function pickCardio() {
  pickerOpen.value = false;
  // Ouvre directement le formulaire de saisie (et pas le hub) → l'utilisateur
  // voit tout de suite les activités (marche, course, vélo…).
  await router.push('/cardio?new=1');
}
function pickAutre() {
  pickerOpen.value = false;
  openAutre();
}
// Bilan des 3 stats du sportif (équilibre du build) → parts en %.
const statTotal = computed(
  () => progress.powerXp.value + progress.enduranceXp.value + progress.agilityXp.value,
);
// Piliers Force / Endurance (cercles) : niveau + points cumulés + tendance 30 j.
const pillars = computed(() => [
  {
    key: 'pow',
    name: 'Force',
    emoji: '💪',
    lvl: progress.force.value,
    pts: progress.powerXp.value,
    d30: progress.force30.value,
  },
  {
    key: 'end',
    name: 'Endurance',
    emoji: '❤️',
    lvl: progress.endurance.value,
    pts: progress.enduranceXp.value,
    d30: progress.endurance30.value,
  },
]);
function statPct(v: number): number {
  return statTotal.value > 0 ? Math.round((v / statTotal.value) * 100) : 0;
}
// Bénéfices BRUTS du sport (vecteur non normalisé) → « 💪60 ❤️30 ⚡10 » (parts non
// nulles). La somme = intensité (varie selon le sport), plus de normalisation à 100.
function sigLabel(sig: { power: number; endurance: number; agility: number }): string {
  const parts: string[] = [];
  if (sig.power > 0) parts.push(`💪${Math.round(sig.power)}`);
  if (sig.endurance > 0) parts.push(`❤️${Math.round(sig.endurance)}`);
  if (sig.agility > 0) parts.push(`⚡${Math.round(sig.agility)}`);
  return parts.join(' ');
}
// Tap sur une tuile de sport → sa SAISIE SPÉCIFIQUE (on a déjà choisi le sport en
// tapant la tuile → pas besoin de le re-choisir). L'historique se consulte via
// l'Agenda / les Stats.
const DISC_SPORT_LABEL: Record<string, string> = {
  crossfit: 'Crossfit',
  hyrox: 'Hyrox',
  mobilite: 'Mobilité',
};
async function goSport(key: string) {
  if (key.startsWith('cardio:')) {
    // Cardio : ouvre le formulaire de sortie avec l'activité pré-sélectionnée.
    await router.push(`/cardio?new=1&activity=${encodeURIComponent(key.slice('cardio:'.length))}`);
  } else if (key === 'tennis' || key === 'disc:prepa_physique') {
    await router.push('/tennis');
  } else if (key === 'disc:musculation') {
    await router.push('/muscu');
  } else if (key.startsWith('disc:')) {
    openAutre(DISC_SPORT_LABEL[key.slice('disc:'.length)]);
  } else if (key.startsWith('sport:')) {
    openAutre(key.slice('sport:'.length));
  }
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
  const beforeG = progress.global.value; // snapshot XP Global (animation)
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
    await nextTick();
    xpFx.show([
      {
        emoji: '🌍',
        label: 'Global',
        fromLevel: beforeG.level,
        fromPct: beforeG.progressPct,
        toLevel: progress.global.value.level,
        toPct: progress.global.value.progressPct,
      },
    ]);
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
/* Rendu dans un volet du cockpit : le volet gère le scroll → pas de min-height. */
.home-page.embedded {
  min-height: 0;
  padding-bottom: 40px;
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
  gap: 6px;
  flex-shrink: 0;
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
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: var(--accent-ink, #15120e);
  border-radius: 8px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 10px;
  line-height: 1;
}
/* Carrés du header : Aventure / Défis / Niveau (même taille) */
.hsq,
.glvl {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 58px;
  height: 52px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 13px;
  color: var(--text);
  cursor: pointer;
  overflow: hidden;
}
.glvl {
  background: var(--surface-2);
  border-color: var(--accent);
}
.hsq-ic {
  font-size: 20px;
  line-height: 1;
}
.hsq-l,
.glvl-l {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--dim);
}
.glvl-n {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
}
.glvl-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: var(--line);
}
.glvl-bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.home-head > div:first-child {
  min-width: 0;
}
.home-name {
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.stat-balance {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 18px;
}
.sb-head {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--dim);
  margin-bottom: 8px;
}
.sb-bar {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--surface-2, #2b241b);
}
.sb-seg {
  min-width: 2px;
}
.sb-seg.pow {
  background: #ff6a45;
}
.sb-seg.end {
  background: #7bc86c;
}
.sb-seg.agi {
  background: #ffd23f;
}
.sb-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 8px;
  font-size: 11.5px;
  font-weight: 600;
}
.sb-l.pow {
  color: #ff6a45;
}
.sb-l.end {
  color: #7bc86c;
}
.sb-l.agi {
  color: #ffd23f;
}
/* Piliers Force / Endurance : 2 CERCLES (anneau = progression, niveau au centre). */
.pillars {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 18px;
}
.pillar {
  --pc: var(--accent);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 12px 8px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--pc) 9%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--pc) 42%, var(--line));
  cursor: pointer;
}
.pillar:active {
  transform: scale(0.98);
}
.pillar.pow {
  --pc: #ff6a45;
}
.pillar.end {
  --pc: #7bc86c;
}
.pl-ring {
  width: 84px;
  height: 84px;
}
.pl-ring svg {
  width: 100%;
  height: 100%;
}
.plr-track {
  fill: none;
  stroke: color-mix(in srgb, var(--pc) 20%, var(--bg));
  stroke-width: 3;
}
.plr-arc {
  fill: none;
  stroke: var(--pc);
  stroke-width: 3;
  stroke-linecap: round;
}
.plr-emo {
  font-size: 8px;
}
.plr-n {
  font-size: 13px;
  font-weight: 800;
  fill: var(--text);
}
.pl-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--pc);
}
.pl-pts {
  font-size: 10.5px;
  color: var(--dim);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.pl-trend {
  font-size: 10.5px;
  color: var(--pc);
  font-weight: 700;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
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
.picker-back {
  background: none;
  border: none;
  color: var(--text);
  font-size: 22px;
  cursor: pointer;
  margin-right: 4px;
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
.mt-sig {
  font-size: 10px;
  color: var(--dim);
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.mt-bar {
  position: relative;
  width: 100%;
  height: 15px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
  margin-top: 4px;
}
.mt-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  background: var(--c);
}
/* Volume d'heures faites / requises pour le niveau suivant, DANS la barre.
   mix-blend-mode: difference → lisible aussi bien sur le remplissage que sur le fond. */
.mt-bar-txt {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: #fff;
  mix-blend-mode: difference;
}
</style>
