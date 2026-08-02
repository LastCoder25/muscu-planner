<template>
  <q-page class="plan-page">
    <header class="bar">
      <button class="back" aria-label="Retour" @click="goBack">
        <q-icon name="arrow_back_ios_new" size="20px" />
      </button>
      <span class="bar-title font-display">Plan course</span>
    </header>

    <div v-if="loading" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <!-- Création -->
    <div v-else-if="!plan" class="body">
      <div v-if="!vma" class="warn">
        Renseigne d'abord ta <b>VMA</b> sur la page Cardio pour générer un plan aux bonnes allures.
        <q-btn flat no-caps color="primary" label="Aller au Cardio" @click="goCardio" />
      </div>
      <template v-else>
        <div class="section-lbl">Objectif</div>
        <div class="chips">
          <button
            v-for="r in RACES"
            :key="r.id"
            class="chip"
            :class="{ on: raceType === r.id }"
            @click="raceType = r.id"
          >
            {{ r.label }}
          </button>
        </div>

        <div v-if="raceType === 'trail'" class="fields">
          <q-input
            v-model.number="distanceKm"
            type="number"
            filled
            label="Distance (km)"
            step="0.5"
          />
          <q-input v-model.number="elevationM" type="number" filled label="Dénivelé D+ (m)" />
        </div>

        <template v-if="raceType === 'trail'">
          <div class="section-lbl">Côtes disponibles (séances de côtes)</div>
          <div v-for="(h, i) in hills" :key="i" class="hill-row">
            <q-input v-model.number="h.length_m" type="number" filled dense label="Longueur (m)" />
            <q-input v-model.number="h.grade_pct" type="number" filled dense label="Pente (%)" />
            <button class="hill-del" aria-label="Supprimer" @click="hills.splice(i, 1)">✕</button>
          </div>
          <button class="hill-add" @click="addHill">+ Ajouter une côte</button>
          <p class="hill-note">Sans côte, les séances de côtes se font en durée (40 s).</p>
        </template>

        <div class="section-lbl">Date de la course</div>
        <q-input v-model="raceDate" type="date" filled />

        <div class="section-lbl">Séances par semaine</div>
        <div class="chips">
          <button
            v-for="d in [2, 3, 4, 5]"
            :key="d"
            class="chip"
            :class="{ on: spw === d }"
            @click="spw = d"
          >
            {{ d }}
          </button>
        </div>

        <q-btn
          class="gen full-width"
          color="primary"
          text-color="dark"
          no-caps
          size="lg"
          icon="auto_awesome"
          label="Générer le plan"
          :loading="creating"
          :disable="!raceDate"
          @click="generate"
        />
      </template>
    </div>

    <!-- Plan existant -->
    <div v-else class="body">
      <h1 class="title font-display">{{ plan.name }}</h1>
      <div class="meta">
        Course le {{ fmtDate(plan.goal.race_date) }} · {{ spwLabel }} · VMA {{ plan.vma }} km/h
      </div>
      <div class="prog">
        <div class="prog-bar"><div class="prog-fill" :style="{ width: donePct + '%' }" /></div>
        <span class="prog-lbl">{{ doneCount }}/{{ totalCount }} séances</span>
      </div>

      <div v-for="wk in plan.weeks" :key="wk.index" class="week">
        <div class="week-h">
          <span class="week-n">Semaine {{ wk.index + 1 }}</span>
          <span class="week-lbl">{{ wk.label }}</span>
        </div>
        <div
          v-for="s in wk.sessions"
          :key="s.id"
          class="sess"
          :class="{ done: s.done, race: s.is_race, today: s.date === todayIso }"
        >
          <button
            class="sess-check"
            :aria-label="s.done ? 'Fait' : 'Marquer fait'"
            @click="toggle(wk, s)"
          >
            <q-icon :name="s.done ? 'check_circle' : 'radio_button_unchecked'" size="22px" />
          </button>
          <div class="sess-main">
            <div class="sess-name">{{ s.name }}</div>
            <div class="sess-meta">
              {{ fmtDate(s.date) }}
              <template v-if="s.duration_min"> · {{ s.duration_min }} min</template>
            </div>
            <div v-if="s.phases.length" class="sess-phases">
              <span v-for="(ph, k) in s.phases" :key="k" class="ph">
                {{ PHASE_LABELS[ph.kind] }} {{ phaseSummary(ph)
                }}<template v-if="ph.pace"> @ {{ ph.pace }}</template>
              </span>
            </div>
          </div>
        </div>
      </div>

      <button class="del" @click="removePlan">Supprimer le plan</button>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useCardioStore } from '@/stores/cardio';
import { buildRunPlan } from '@/lib/cardio';
import { PHASE_LABELS, sumPhases, phaseSummary } from '@/data/cardio';
import type {
  CardioPlan,
  CardioPlanSession,
  CardioPlanWeek,
  CardioLog,
  RaceType,
} from '@/lib/types';
import { SCHEMA_VERSION } from '@/lib/types';

const RACES: { id: RaceType; label: string }[] = [
  { id: '5k', label: '5 km' },
  { id: '10k', label: '10 km' },
  { id: 'semi', label: 'Semi' },
  { id: 'marathon', label: 'Marathon' },
  { id: 'trail', label: 'Trail' },
];

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();
const profileStore = useProfileStore();
const cardio = useCardioStore();

const loading = ref(true);
const creating = ref(false);
const raceType = ref<RaceType>('10k');
const distanceKm = ref<number | null>(null);
const elevationM = ref<number | null>(null);
const raceDate = ref('');
const spw = ref(3);
const hills = ref<{ length_m: number; grade_pct?: number }[]>([
  ...(profileStore.profile?.preferences?.hills ?? []),
]);

function addHill() {
  hills.value.push({ length_m: 200, grade_pct: 8 });
}
const validHills = computed(() =>
  hills.value
    .filter((h) => h.length_m && h.length_m > 0)
    .map((h) => ({ length_m: h.length_m, ...(h.grade_pct ? { grade_pct: h.grade_pct } : {}) })),
);
// Mémorise les côtes au profil pour pré-remplir les prochains plans.
async function persistHills() {
  const p = profileStore.profile;
  const userId = auth.user?.id;
  if (!p || !userId) return;
  try {
    await profileStore.update(userId, {
      ...p,
      preferences: { ...p.preferences, hills: validHills.value },
    });
  } catch {
    /* non bloquant */
  }
}

const vma = computed(() => profileStore.profile?.preferences?.vma ?? null);
const plan = computed<CardioPlan | null>(() => cardio.plans[0]?.payload ?? null);

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const todayIso = isoToday();

const allSessions = computed(() => plan.value?.weeks.flatMap((w) => w.sessions) ?? []);
const totalCount = computed(() => allSessions.value.length);
const doneCount = computed(() => allSessions.value.filter((s) => s.done).length);
const donePct = computed(() =>
  totalCount.value ? Math.round((doneCount.value / totalCount.value) * 100) : 0,
);
const spwLabel = computed(() => `${plan.value?.sessions_per_week ?? spw.value} séances/sem`);

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

onMounted(async () => {
  try {
    await cardio.fetchPlans();
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loading.value = false;
  }
});

async function generate() {
  const userId = auth.user?.id;
  if (!userId || !vma.value || !raceDate.value) return;
  creating.value = true;
  try {
    const built = buildRunPlan({
      raceType: raceType.value,
      startDate: todayIso,
      raceDate: raceDate.value,
      sessionsPerWeek: spw.value,
      vma: vma.value,
      ...(profileStore.profile?.experience.level
        ? { level: profileStore.profile.experience.level }
        : {}),
      ...(raceType.value === 'trail' && distanceKm.value ? { distanceKm: distanceKm.value } : {}),
      ...(raceType.value === 'trail' && elevationM.value ? { elevationM: elevationM.value } : {}),
      ...(raceType.value === 'trail' && validHills.value.length ? { hills: validHills.value } : {}),
      newId: () => crypto.randomUUID(),
    });
    await cardio.createPlan(userId, built);
    await persistHills();
    $q.notify({ type: 'positive', message: 'Plan créé 💪' });
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Génération impossible.',
    });
  } finally {
    creating.value = false;
  }
}

async function toggle(_wk: CardioPlanWeek, s: CardioPlanSession) {
  const userId = auth.user?.id;
  const p = plan.value;
  if (!userId || !p) return;
  if (s.done) {
    // Dé-cocher : on retire le lien (le bilan reste dans l'historique).
    s.done = false;
    delete s.cardio_log_id;
    await cardio.updatePlan(p);
    return;
  }
  try {
    const totals = sumPhases(s.phases);
    const log: CardioLog = {
      schema_version: SCHEMA_VERSION,
      type: 'cardio_log',
      id: crypto.randomUUID(),
      cardio_session_id: s.id,
      activity: 'course',
      mode: s.phases.length ? 'structuree' : 'basique',
      performed_at: new Date().toISOString(),
      ...(totals.distance_km ? { distance_km: totals.distance_km } : {}),
      ...(totals.duration_min || s.duration_min
        ? { duration_min: totals.duration_min || s.duration_min }
        : {}),
      ...(s.phases.length ? { phases: s.phases } : {}),
    };
    await cardio.addLog(userId, log);
    s.done = true;
    s.cardio_log_id = log.id;
    await cardio.updatePlan(p);
    $q.notify({ type: 'positive', message: 'Séance validée — XP cardio gagné.' });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  }
}

function removePlan() {
  const p = plan.value;
  if (!p) return;
  $q.dialog({
    title: 'Supprimer le plan',
    message:
      'Le plan sera supprimé (les séances déjà validées restent dans ton historique). Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    void cardio
      .removePlan(p.id)
      .then(() => $q.notify({ type: 'positive', message: 'Plan supprimé.' }));
  });
}

function goBack() {
  router.back();
}
async function goCardio() {
  await router.push('/cardio');
}
</script>

<style scoped lang="scss">
.plan-page {
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
.warn {
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 12px;
  padding: 14px;
  color: var(--text);
  font-size: 14px;
}
.section-lbl {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin: 16px 0 8px;
}
.chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.chip.on {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
}
.fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.hill-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.hill-row .q-input {
  flex: 1;
}
.hill-del {
  background: none;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--d4);
  width: 32px;
  height: 32px;
  cursor: pointer;
}
.hill-add {
  background: none;
  border: 1px dashed var(--line);
  border-radius: 10px;
  color: var(--accent);
  font-weight: 600;
  font-size: 13px;
  padding: 8px 12px;
  cursor: pointer;
}
.hill-note {
  font-size: 11px;
  color: var(--dim);
  margin: 8px 0 0;
}
.gen {
  border-radius: 12px;
  margin-top: 22px;
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
  margin: 4px 0 14px;
}
.prog {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}
.prog-bar {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  overflow: hidden;
}
.prog-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.3s;
}
.prog-lbl {
  font-size: 12px;
  color: var(--dim);
  white-space: nowrap;
}
.week {
  margin-bottom: 16px;
}
.week-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}
.week-n {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text);
}
.week-lbl {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--accent);
}
.sess {
  display: flex;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  margin-bottom: 8px;
  background: var(--surface);
}
.sess.done {
  opacity: 0.6;
}
.sess.race {
  border-color: var(--accent);
}
.sess.today {
  border-left: 3px solid var(--accent);
}
.sess-check {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  align-self: flex-start;
}
.sess-main {
  flex: 1;
}
.sess-name {
  font-weight: 600;
  color: var(--text);
}
.sess-meta {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.sess-phases {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.ph {
  font-size: 11px;
  color: var(--dim);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 1px 6px;
}
.del {
  display: block;
  margin: 20px auto 0;
  background: none;
  border: none;
  color: var(--d4);
  font-size: 13px;
  cursor: pointer;
}
</style>
