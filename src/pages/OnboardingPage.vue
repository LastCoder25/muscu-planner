<template>
  <q-page class="onb-page column">
    <!-- Progression -->
    <div class="onb-top">
      <q-linear-progress :value="(step + 1) / TOTAL" color="primary" track-color="line" size="6px" rounded />
      <div class="row items-center justify-between q-mt-sm">
        <span class="text-dim text-caption">Étape {{ step + 1 }} / {{ TOTAL }}</span>
        <span class="text-dim text-caption">{{ STEP_TITLES[step] }}</span>
      </div>
    </div>

    <div class="onb-body col">
      <!-- 0. Identité -->
      <section v-if="step === 0">
        <h2 class="onb-h">Qui es-tu ?</h2>
        <q-input v-model="form.name" label="Prénom *" filled dark class="q-mb-md" />
        <div class="text-dim text-caption q-mb-sm">Optionnel</div>
        <div class="row q-col-gutter-sm">
          <q-input v-model.number="form.birth_year" type="number" label="Année de naissance" filled dark class="col-6" />
          <q-input v-model.number="form.height_cm" type="number" label="Taille (cm)" filled dark class="col-6" />
          <q-input v-model.number="form.weight_kg" type="number" label="Poids (kg)" filled dark class="col-6" />
        </div>
        <div class="q-mt-md">
          <div class="text-dim text-caption q-mb-sm">Sexe</div>
          <div class="choice-grid cols-3">
            <button
              v-for="opt in SEXES"
              :key="opt.value"
              class="choice"
              :class="{ active: form.sex === opt.value }"
              @click="form.sex = form.sex === opt.value ? undefined : opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>
      </section>

      <!-- 1. Niveau -->
      <section v-else-if="step === 1">
        <h2 class="onb-h">Ton niveau</h2>
        <button
          v-for="opt in LEVELS"
          :key="opt.value"
          class="choice choice-row"
          :class="{ active: form.level === opt.value }"
          @click="form.level = opt.value"
        >
          <div class="choice-title">{{ opt.label }}</div>
          <div class="choice-desc">{{ opt.desc }}</div>
        </button>
        <q-input
          v-model.number="form.training_months"
          type="number"
          label="Ancienneté en musculation (mois) — optionnel"
          filled dark class="q-mt-md"
        />
      </section>

      <!-- 2. Objectif -->
      <section v-else-if="step === 2">
        <h2 class="onb-h">Ton objectif</h2>
        <button
          v-for="opt in OBJECTIVES"
          :key="opt.value"
          class="choice choice-row"
          :class="{ active: form.objective === opt.value }"
          @click="form.objective = opt.value"
        >
          <div class="choice-title">{{ opt.label }}</div>
        </button>
      </section>

      <!-- 3. Disponibilités -->
      <section v-else-if="step === 3">
        <h2 class="onb-h">Tes disponibilités</h2>
        <div class="text-dim text-caption q-mb-sm">Séances par semaine</div>
        <div class="choice-grid cols-5 q-mb-lg">
          <button
            v-for="n in [2, 3, 4, 5, 6]"
            :key="n"
            class="choice metric"
            :class="{ active: form.sessions_per_week === n }"
            @click="form.sessions_per_week = n"
          >{{ n }}</button>
        </div>
        <div class="text-dim text-caption q-mb-sm">Durée par séance (min)</div>
        <div class="choice-grid cols-4 q-mb-lg">
          <button
            v-for="d in [30, 45, 60, 90]"
            :key="d"
            class="choice metric"
            :class="{ active: form.session_duration_min === d }"
            @click="form.session_duration_min = d"
          >{{ d }}</button>
        </div>
        <div class="text-dim text-caption q-mb-sm">Jours préférés — optionnel</div>
        <div class="choice-grid cols-7">
          <button
            v-for="day in DAYS"
            :key="day"
            class="choice small"
            :class="{ active: form.preferred_days.includes(day) }"
            @click="toggleArr(form.preferred_days, day)"
          >{{ day }}</button>
        </div>
      </section>

      <!-- 4. Matériel -->
      <section v-else-if="step === 4">
        <h2 class="onb-h">Ton matériel</h2>
        <button
          v-for="opt in EQUIPMENTS"
          :key="opt.value"
          class="choice choice-row"
          :class="{ active: form.equipment === opt.value }"
          @click="form.equipment = opt.value"
        >
          <div class="choice-title">{{ opt.label }}</div>
          <div class="choice-desc">{{ opt.desc }}</div>
        </button>
      </section>

      <!-- 5. Contraintes -->
      <section v-else-if="step === 5">
        <h2 class="onb-h">Contraintes</h2>
        <p class="text-dim q-mb-md">Blessures, zones sensibles, exos à éviter. Tout est optionnel.</p>
        <q-select
          v-model="form.injuries"
          label="Blessures / zones sensibles"
          filled dark use-input use-chips multiple new-value-mode="add-unique"
          hide-dropdown-icon input-debounce="0" class="q-mb-md"
          hint="Tape puis Entrée pour ajouter"
        />
        <q-select
          v-model="form.avoid_exercises"
          label="Exercices à éviter"
          filled dark use-input use-chips multiple new-value-mode="add-unique"
          hide-dropdown-icon input-debounce="0"
          hint="Tape puis Entrée pour ajouter"
        />
      </section>

      <!-- 6. Préférences -->
      <section v-else-if="step === 6">
        <h2 class="onb-h">Préférences</h2>
        <div class="text-dim text-caption q-mb-sm">Muscles à prioriser — optionnel</div>
        <div class="choice-grid cols-3 q-mb-lg">
          <button
            v-for="m in MUSCLES"
            :key="m"
            class="choice small"
            :class="{ active: form.priority_muscles.includes(m) }"
            @click="toggleArr(form.priority_muscles, m)"
          >{{ m }}</button>
        </div>
        <div class="text-dim text-caption q-mb-sm">Unités</div>
        <div class="choice-grid cols-2">
          <button class="choice" :class="{ active: form.units === 'kg' }" @click="form.units = 'kg'">kg</button>
          <button class="choice" :class="{ active: form.units === 'lb' }" @click="form.units = 'lb'">lb</button>
        </div>
      </section>

      <!-- 7. Programme (bifurcation) -->
      <section v-else-if="step === 7">
        <h2 class="onb-h">{{ programTitle }}</h2>
        <p class="text-dim q-mb-md">{{ programSubtitle }}</p>

        <button
          v-for="t in pool"
          :key="t.template_id"
          class="choice choice-row"
          :class="{ active: selected.has(t.template_id) }"
          @click="toggleTemplate(t.template_id)"
        >
          <div class="row items-center justify-between">
            <div class="choice-title">{{ t.name }}</div>
            <q-icon v-if="selected.has(t.template_id)" name="check_circle" color="primary" size="22px" />
          </div>
          <div class="choice-desc">
            {{ t.exercises.length }} exercices · ~{{ t.estimated_duration_min }} min
          </div>
        </button>

        <!-- Import IA (mode free / avancé) -->
        <q-expansion-item
          v-if="programMode === 'free'"
          icon="content_paste"
          label="Importer une séance (JSON)"
          dark class="import-box q-mt-md"
        >
          <div class="q-pa-sm">
            <q-input
              v-model="importText"
              type="textarea"
              filled dark autogrow
              label="Colle ici le JSON d'une séance"
              :rows="5"
            />
            <q-btn
              flat no-caps color="primary" label="Valider le JSON" class="q-mt-sm"
              :disable="!importText.trim()"
              @click="tryImport"
            />
            <div v-if="imported" class="imported-ok q-mt-sm">
              <q-icon name="check_circle" color="positive" /> « {{ imported.name }} » prête ({{ imported.exercises.length }} exos)
            </div>
          </div>
        </q-expansion-item>
      </section>
    </div>

    <!-- Navigation collante -->
    <div class="onb-nav row q-gutter-sm">
      <q-btn v-if="step > 0" flat no-caps label="Retour" class="col-auto text-dim" @click="prev" />
      <q-space />
      <q-btn
        v-if="step < TOTAL - 1"
        no-caps color="primary" text-color="dark" label="Continuer" size="lg"
        :disable="!canProceed"
        @click="next"
      />
      <q-btn
        v-else
        no-caps color="primary" text-color="dark" label="Démarrer" size="lg"
        :loading="saving"
        :disable="!canFinish"
        @click="finish"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { Level, Objective, Equipment, Profile, Session } from '@/lib/types';
import { SCHEMA_VERSION } from '@/lib/types';
import { deriveLevelConfig } from '@/lib/levelConfig';
import { TEMPLATES, suggestTemplates } from '@/data/templates';
import { validateImportedSession } from '@/lib/coach';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useSessionsStore } from '@/stores/sessions';

type Template = (typeof TEMPLATES)[number];

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();
const profileStore = useProfileStore();
const sessionsStore = useSessionsStore();

const TOTAL = 8;
const STEP_TITLES = ['Identité', 'Niveau', 'Objectif', 'Dispos', 'Matériel', 'Contraintes', 'Préférences', 'Programme'];

const SEXES = [
  { value: 'homme' as const, label: 'Homme' },
  { value: 'femme' as const, label: 'Femme' },
  { value: 'autre' as const, label: 'Autre' },
];
const LEVELS = [
  { value: 'debutant' as Level, label: 'Débutant', desc: 'Progression linéaire guidée, programme généré, note d’effort simple.' },
  { value: 'intermediaire' as Level, label: 'Intermédiaire', desc: 'Double progression assistée, RIR optionnel, template éditable.' },
  { value: 'avance' as Level, label: 'Avancé', desc: 'Double progression + RIR, import/construction libre, UI dense.' },
];
const OBJECTIVES = [
  { value: 'force' as Objective, label: 'Force' },
  { value: 'hypertrophie' as Objective, label: 'Hypertrophie (prise de muscle)' },
  { value: 'endurance' as Objective, label: 'Endurance' },
  { value: 'remise_en_forme' as Objective, label: 'Remise en forme' },
  { value: 'perte_de_gras' as Objective, label: 'Perte de gras' },
];
const EQUIPMENTS = [
  { value: 'salle_complete' as Equipment, label: 'Salle complète', desc: 'Machines, barres, haltères, poulies.' },
  { value: 'home_gym' as Equipment, label: 'Home gym', desc: 'Rack, barre, quelques machines.' },
  { value: 'halteres' as Equipment, label: 'Haltères', desc: 'Une paire d’haltères / élastiques.' },
  { value: 'poids_du_corps' as Equipment, label: 'Poids du corps', desc: 'Aucun matériel.' },
];
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MUSCLES = ['Pectoraux', 'Dos', 'Épaules', 'Bras', 'Jambes', 'Fessiers', 'Abdos'];

const step = ref(0);
const saving = ref(false);

interface FormState {
  name: string;
  sex: 'homme' | 'femme' | 'autre' | undefined;
  birth_year: number | undefined;
  height_cm: number | undefined;
  weight_kg: number | undefined;
  level: Level;
  training_months: number | undefined;
  objective: Objective;
  sessions_per_week: number;
  session_duration_min: number;
  preferred_days: string[];
  equipment: Equipment;
  injuries: string[];
  avoid_exercises: string[];
  priority_muscles: string[];
  units: 'kg' | 'lb';
}

const form = reactive<FormState>({
  name: '',
  sex: undefined,
  birth_year: undefined,
  height_cm: undefined,
  weight_kg: undefined,
  level: 'debutant',
  training_months: undefined,
  objective: 'remise_en_forme',
  sessions_per_week: 3,
  session_duration_min: 60,
  preferred_days: [],
  equipment: 'salle_complete',
  injuries: [],
  avoid_exercises: [],
  priority_muscles: [],
  units: 'kg',
});

// ── Bifurcation programme ───────────────────────────────
const programMode = computed(() => deriveLevelConfig(form.level).program_mode);
const pool = computed<Template[]>(() => {
  const suggested = suggestTemplates(form.level, form.sessions_per_week);
  if (suggested.length) return suggested;
  // Niveaux non-débutant : on propose tout de même des bases éditables.
  return TEMPLATES.filter((t) => t.min_sessions_per_week <= form.sessions_per_week);
});
const programTitle = computed(() =>
  programMode.value === 'guided'
    ? 'On te prépare ton premier programme'
    : programMode.value === 'assisted'
      ? 'Choisis une base de programme'
      : 'Importe ou choisis une base',
);
const programSubtitle = computed(() =>
  programMode.value === 'free'
    ? 'Colle un JSON de séance (export coach IA) ou pars d’un template, tu pourras tout éditer ensuite.'
    : 'Sélectionne la ou les séances à ajouter à ta semaine.',
);

const selected = reactive(new Set<string>());
const importText = ref('');
const imported = ref<Session | null>(null);

function toggleTemplate(id: string) {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
}
function tryImport() {
  try {
    imported.value = validateImportedSession(importText.value);
    $q.notify({ type: 'positive', message: 'Séance importée et validée.' });
  } catch (e) {
    imported.value = null;
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'JSON invalide.' });
  }
}

// ── Validation par étape ────────────────────────────────
const canProceed = computed(() => {
  if (step.value === 0) return form.name.trim().length > 0;
  if (step.value === 3) return form.sessions_per_week >= 2 && form.sessions_per_week <= 6;
  return true;
});
const canFinish = computed(() => selected.size > 0 || imported.value !== null);

function next() {
  if (canProceed.value && step.value < TOTAL - 1) step.value++;
}
function prev() {
  if (step.value > 0) step.value--;
}
function toggleArr(arr: string[], v: string) {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(v);
}

// ── Construction du Profile (contrat v1.0) ──────────────
function buildProfile(): Profile {
  const identity: Profile['identity'] = { name: form.name.trim() };
  if (form.sex) identity.sex = form.sex;
  if (form.birth_year) identity.birth_year = form.birth_year;
  if (form.height_cm) identity.height_cm = form.height_cm;
  if (form.weight_kg) identity.weight_kg = form.weight_kg;

  const experience: Profile['experience'] = { level: form.level };
  if (form.training_months != null) experience.training_months = form.training_months;

  const availability: Profile['availability'] = { sessions_per_week: form.sessions_per_week };
  if (form.session_duration_min) availability.session_duration_min = form.session_duration_min;
  if (form.preferred_days.length) availability.preferred_days = [...form.preferred_days];

  const preferences: NonNullable<Profile['preferences']> = { units: form.units };
  if (form.priority_muscles.length) preferences.priority_muscles = [...form.priority_muscles];

  const profile: Profile = {
    schema_version: SCHEMA_VERSION,
    type: 'profile',
    identity,
    experience,
    objective: form.objective,
    availability,
    equipment: form.equipment,
    preferences,
  };

  const constraints: NonNullable<Profile['constraints']> = {};
  if (form.injuries.length) constraints.injuries = [...form.injuries];
  if (form.avoid_exercises.length) constraints.avoid_exercises = [...form.avoid_exercises];
  if (Object.keys(constraints).length) profile.constraints = constraints;

  return profile;
}

function templateToSession(t: Template): Session {
  return {
    schema_version: t.schema_version,
    type: 'session',
    id: crypto.randomUUID(),
    name: t.name,
    split: t.split,
    objective: t.objective,
    level: t.level,
    estimated_duration_min: t.estimated_duration_min,
    source: 'template',
    exercises: t.exercises,
  };
}

async function finish() {
  const userId = auth.user?.id;
  if (!userId) {
    $q.notify({ type: 'negative', message: 'Session expirée, reconnecte-toi.' });
    return;
  }
  saving.value = true;
  try {
    await profileStore.save(userId, buildProfile());

    const chosen = pool.value.filter((t) => selected.has(t.template_id));
    for (const t of chosen) {
      await sessionsStore.insert(userId, templateToSession(t));
    }
    if (imported.value) {
      await sessionsStore.insert(userId, imported.value);
    }

    await router.push('/');
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec de l’enregistrement.' });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
.onb-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 16px;
}
.onb-top {
  padding: 8px 4px 4px;
}
.onb-body {
  padding: 12px 4px 90px;
  overflow-y: auto;
}
.onb-h {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
  margin: 8px 0 18px;
  color: var(--text);
}
.text-dim {
  color: var(--dim);
}

.choice-grid {
  display: grid;
  gap: 10px;
}
.cols-2 { grid-template-columns: repeat(2, 1fr); }
.cols-3 { grid-template-columns: repeat(3, 1fr); }
.cols-4 { grid-template-columns: repeat(4, 1fr); }
.cols-5 { grid-template-columns: repeat(5, 1fr); }
.cols-7 { grid-template-columns: repeat(7, 1fr); }

.choice {
  width: 100%;
  min-height: 52px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 16px;
  padding: 14px 16px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
  &.active {
    border-color: var(--accent);
    background: var(--surface-2);
  }
  &.small { min-height: 44px; padding: 10px; text-align: center; font-size: 14px; }
  &.metric { text-align: center; font-family: var(--font-display); font-size: 20px; font-weight: 600; }
}
.choice-row { display: block; margin-bottom: 10px; }
.choice-title { font-weight: 600; font-size: 17px; }
.choice-desc { color: var(--dim); font-size: 13px; margin-top: 4px; }

.import-box {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.imported-ok { color: var(--done); font-size: 14px; }

.onb-nav {
  position: sticky;
  bottom: 0;
  background: linear-gradient(to top, var(--bg) 70%, transparent);
  padding: 12px 4px;
  align-items: center;
}
</style>
