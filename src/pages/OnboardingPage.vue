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
        <q-input v-model="form.name" label="Prénom *" filled class="q-mb-md" />
        <div class="text-dim text-caption q-mb-sm">Optionnel</div>
        <div class="row q-col-gutter-sm">
          <q-input v-model.number="form.birth_year" type="number" label="Année de naissance" filled class="col-6" />
          <q-input v-model.number="form.height_cm" type="number" label="Taille (cm)" filled class="col-6" />
          <q-input v-model.number="form.weight_kg" type="number" label="Poids (kg)" filled class="col-6" />
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
          filled class="q-mt-md"
        />
      </section>

      <!-- 2. Objectif (guidé) -->
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
          <div class="choice-desc">{{ opt.desc }}</div>
          <div class="choice-hint">{{ opt.reps }}</div>
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

      <!-- 4. Matériel (checklist détaillée groupée) -->
      <section v-else-if="step === 4">
        <h2 class="onb-h">Ton matériel</h2>
        <p class="text-dim q-mb-md">Coche tout ce à quoi tu as accès. On ne propose que des exos réalisables. (Le poids du corps est toujours inclus.)</p>
        <div v-for="grp in EQUIPMENT_GROUPS" :key="grp.group">
          <div class="grp-label">{{ grp.group }}</div>
          <button
            v-for="opt in grp.items"
            :key="opt.value"
            class="choice choice-row"
            :class="{ active: form.available_equipment.includes(opt.value) }"
            @click="toggleArr(form.available_equipment, opt.value)"
          >
            <div class="row items-center justify-between">
              <div class="choice-title">{{ opt.label }}</div>
              <q-icon v-if="form.available_equipment.includes(opt.value)" name="check_circle" color="primary" size="22px" />
            </div>
            <div v-if="opt.desc" class="choice-desc">{{ opt.desc }}</div>
          </button>
        </div>
      </section>

      <!-- 5. Sports pratiqués -->
      <section v-else-if="step === 5">
        <h2 class="onb-h">Tes autres sports</h2>
        <p class="text-dim q-mb-md">On allège la muscu sur les muscles déjà sollicités et on renforce l'équilibre. Optionnel.</p>
        <div v-for="sp in SPORTS" :key="sp">
          <button
            class="choice choice-row"
            :class="{ active: hasSport(sp) }"
            @click="toggleSport(sp)"
          >
            <div class="row items-center justify-between">
              <div class="choice-title">{{ sp }}</div>
              <q-icon v-if="hasSport(sp)" name="check_circle" color="primary" size="22px" />
            </div>
          </button>
          <div v-if="hasSport(sp)" class="sport-cfg">
            <div class="text-dim text-caption q-mb-xs">Séances / semaine</div>
            <div class="choice-grid cols-5 q-mb-sm">
              <button
                v-for="n in [1, 2, 3, 4, 5]" :key="n"
                class="choice small metric"
                :class="{ active: sportFreq(sp) === n }"
                @click="setSportFreq(sp, n)"
              >{{ n }}</button>
            </div>
            <div class="text-dim text-caption q-mb-xs">Intensité</div>
            <div class="choice-grid cols-3">
              <button
                v-for="it in INTENSITIES" :key="it.value"
                class="choice small"
                :class="{ active: sportIntensity(sp) === it.value }"
                @click="setSportIntensity(sp, it.value)"
              >{{ it.label }}</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 6. Contraintes -->
      <section v-else-if="step === 6">
        <h2 class="onb-h">Contraintes</h2>
        <p class="text-dim q-mb-md">Blessures, zones sensibles, exos à éviter. Tout est optionnel.</p>
        <q-select
          v-model="form.injuries"
          label="Blessures / zones sensibles"
          filled use-input use-chips multiple new-value-mode="add-unique"
          hide-dropdown-icon input-debounce="0" class="q-mb-md"
          hint="Tape puis Entrée pour ajouter"
        />
        <q-select
          v-model="form.avoid_exercises"
          label="Exercices à éviter"
          filled use-input use-chips multiple new-value-mode="add-unique"
          hide-dropdown-icon input-debounce="0"
          hint="Tape puis Entrée pour ajouter"
        />
      </section>

      <!-- 7. Préférences -->
      <section v-else-if="step === 7">
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

      <!-- 8. Programme généré -->
      <section v-else-if="step === 8">
        <h2 class="onb-h">Ton programme</h2>
        <p class="text-dim q-mb-md">Généré selon ton objectif, ton matériel et tes sports. Tu pourras tout ajuster ensuite.</p>

        <div v-if="splitOptions.length > 1" class="text-dim text-caption q-mb-xs">Découpe ({{ form.sessions_per_week }} séances/sem)</div>
        <div v-if="splitOptions.length > 1" class="q-mb-md">
          <button
            v-for="o in splitOptions" :key="o.id"
            class="choice choice-row" :class="{ active: splitId === o.id }"
            @click="selectSplit(o.id)"
          >
            <div class="choice-title">{{ o.name }}</div>
            <div class="choice-desc">{{ o.subtitle }}</div>
          </button>
        </div>

        <div v-if="generating" class="row flex-center q-pa-lg"><q-spinner color="primary" size="28px" /></div>
        <template v-else>
          <div v-if="generated.length === 0" class="empty-prog">
            Aucun exercice ne correspond à ton matériel. Reviens à l'étape Matériel pour en ajouter.
          </div>
          <button
            v-for="(s, i) in generated"
            :key="i"
            class="choice choice-row"
            :class="{ active: selectedSessions.has(i) }"
            @click="toggleSession(i)"
          >
            <div class="row items-center justify-between">
              <div class="choice-title">{{ s.name }}</div>
              <q-icon v-if="selectedSessions.has(i)" name="check_circle" color="primary" size="22px" />
            </div>
            <div class="choice-desc">{{ s.exercises.length }} exercices · ~{{ s.estimated_duration_min }} min · {{ muscleSummary(s) }}</div>
          </button>
          <q-btn
            v-if="generated.length"
            flat no-caps color="primary" icon="refresh" label="Régénérer" class="q-mt-xs"
            @click="regenerate"
          />

          <!-- Import IA (mode free / avancé) -->
          <q-expansion-item
            v-if="programMode === 'free'"
            icon="content_paste"
            label="Importer une séance (JSON)"
            class="import-box q-mt-md"
          >
            <div class="q-pa-sm">
              <q-input
                v-model="importText"
                type="textarea"
                filled autogrow
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
        </template>
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
import { reactive, ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { Session, SportPractice } from '@/lib/types';
import { deriveLevelConfig } from '@/lib/levelConfig';
import { buildProgram, type ExerciseDef } from '@/lib/programBuilder';
import { splitsFor, defaultSplit, type SplitOption } from '@/data/splits';
import { validateImportedSession } from '@/lib/coach';
import { type ProfileForm, emptyProfileForm, formToProfile } from '@/lib/profileForm';
import {
  SEXES, LEVELS, OBJECTIVES, EQUIPMENT_GROUPS, DAYS,
  PRIORITY_MUSCLES as MUSCLES, SPORTS, INTENSITIES,
} from '@/data/profileOptions';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useSessionsStore } from '@/stores/sessions';
import { useLibraryStore } from '@/stores/library';

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();
const profileStore = useProfileStore();
const sessionsStore = useSessionsStore();
const libraryStore = useLibraryStore();

const TOTAL = 9;
const STEP_TITLES = ['Identité', 'Niveau', 'Objectif', 'Dispos', 'Matériel', 'Sports', 'Contraintes', 'Préférences', 'Programme'];

const step = ref(0);
const saving = ref(false);

const form = reactive<ProfileForm>(emptyProfileForm());

// programMode : pilote l'affichage de l'import IA (mode 'free' = avancé).
const programMode = computed(() => deriveLevelConfig(form.level).program_mode);

// ── Sports pratiqués ────────────────────────────────────
function hasSport(name: string) {
  return form.sports.some((s) => s.name === name);
}
function sportOf(name: string) {
  return form.sports.find((s) => s.name === name);
}
function toggleSport(name: string) {
  const i = form.sports.findIndex((s) => s.name === name);
  if (i >= 0) form.sports.splice(i, 1);
  else form.sports.push({ name, sessions_per_week: 2, intensity: 'moderee' });
}
function sportFreq(name: string) {
  return sportOf(name)?.sessions_per_week;
}
function setSportFreq(name: string, n: number) {
  const s = sportOf(name);
  if (s) s.sessions_per_week = n;
}
function sportIntensity(name: string) {
  return sportOf(name)?.intensity;
}
function setSportIntensity(name: string, v: NonNullable<SportPractice['intensity']>) {
  const s = sportOf(name);
  if (s) s.intensity = v;
}

// ── Génération du programme ─────────────────────────────
const library = ref<ExerciseDef[]>([]);
const generated = ref<Session[]>([]);
const selectedSessions = reactive(new Set<number>());
const generating = ref(false);
const importText = ref('');
const imported = ref<Session | null>(null);

// Découpe (split) selon le nombre de séances.
const splitOptions = computed(() => splitsFor(form.sessions_per_week));
const splitId = ref('');
function currentSplit(): SplitOption {
  return splitOptions.value.find((o) => o.id === splitId.value) ?? defaultSplit(form.sessions_per_week, form.level);
}
function selectSplit(id: string) {
  splitId.value = id;
  regenerate();
}

function regenerate() {
  generating.value = true;
  // Découpe par défaut si non choisie / incompatible avec le nombre de séances.
  if (!splitOptions.value.some((o) => o.id === splitId.value)) {
    splitId.value = defaultSplit(form.sessions_per_week, form.level).id;
  }
  generated.value = buildProgram(formToProfile(form), library.value, currentSplit());
  selectedSessions.clear();
  generated.value.forEach((_, i) => selectedSessions.add(i));
  generating.value = false;
}
function toggleSession(i: number) {
  if (selectedSessions.has(i)) selectedSessions.delete(i);
  else selectedSessions.add(i);
}
function muscleSummary(s: Session): string {
  const set = new Set<string>();
  for (const e of s.exercises) if (e.muscle_primary) set.add(e.muscle_primary);
  return [...set].slice(0, 4).join(', ');
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
  if (step.value === 4) return form.available_equipment.length > 0;
  return true;
});
const canFinish = computed(() => selectedSessions.size > 0 || imported.value !== null);

function next() {
  if (!canProceed.value || step.value >= TOTAL - 1) return;
  step.value++;
  if (step.value === 8) regenerate(); // entrée sur l'étape Programme
}
function prev() {
  if (step.value > 0) step.value--;
}
function toggleArr<T>(arr: T[], v: T) {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(v);
}

async function finish() {
  const userId = auth.user?.id;
  if (!userId) {
    $q.notify({ type: 'negative', message: 'Session expirée, reconnecte-toi.' });
    return;
  }
  saving.value = true;
  try {
    await profileStore.save(userId, formToProfile(form));

    const chosen = generated.value.filter((_, i) => selectedSessions.has(i));
    for (const s of chosen) {
      await sessionsStore.insert(userId, s);
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

onMounted(async () => {
  try {
    library.value = await libraryStore.fetchAll();
  } catch {
    $q.notify({ type: 'negative', message: 'Bibliothèque d’exercices indisponible.' });
  }
});
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
.choice-hint { color: var(--accent); font-family: var(--font-display); font-size: 12px; margin-top: 6px; letter-spacing: 0.3px; }
.grp-label { font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--dim-2); margin: 14px 2px 8px; }

.import-box {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.imported-ok { color: var(--done); font-size: 14px; }
.sport-cfg { padding: 4px 6px 14px; margin: -4px 0 10px; }
.empty-prog { color: var(--dim); padding: 20px 4px; font-size: 14px; }

.onb-nav {
  position: sticky;
  bottom: 0;
  background: linear-gradient(to top, var(--bg) 70%, transparent);
  padding: 12px 4px;
  align-items: center;
}
</style>
