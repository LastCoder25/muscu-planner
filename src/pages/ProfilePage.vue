<template>
  <q-page class="profile-page">
    <h1 class="p-title font-display">Réglages</h1>

    <section class="block">
      <div class="block-h">Identité</div>
      <q-input v-model="form.name" label="Prénom" filled dark />
    </section>

    <section class="block">
      <div class="block-h">Niveau</div>
      <button
        v-for="opt in LEVELS" :key="opt.value"
        class="choice choice-row" :class="{ active: form.level === opt.value }"
        @click="form.level = opt.value"
      >
        <div class="choice-title">{{ opt.label }}</div>
        <div class="choice-desc">{{ opt.desc }}</div>
      </button>
    </section>

    <section class="block">
      <div class="block-h">Objectif</div>
      <button
        v-for="opt in OBJECTIVES" :key="opt.value"
        class="choice choice-row" :class="{ active: form.objective === opt.value }"
        @click="form.objective = opt.value"
      >
        <div class="choice-title">{{ opt.label }}</div>
        <div class="choice-desc">{{ opt.desc }}</div>
        <div class="choice-hint">{{ opt.reps }}</div>
      </button>
    </section>

    <section class="block">
      <div class="block-h">Disponibilités</div>
      <div class="lbl">Séances / semaine</div>
      <div class="choice-grid cols-5 q-mb-md">
        <button
          v-for="n in [2, 3, 4, 5, 6]" :key="n"
          class="choice metric" :class="{ active: form.sessions_per_week === n }"
          @click="form.sessions_per_week = n"
        >{{ n }}</button>
      </div>
      <div class="lbl">Durée (min)</div>
      <div class="choice-grid cols-4">
        <button
          v-for="d in [30, 45, 60, 90]" :key="d"
          class="choice metric" :class="{ active: form.session_duration_min === d }"
          @click="form.session_duration_min = d"
        >{{ d }}</button>
      </div>
    </section>

    <section class="block">
      <div class="block-h">Matériel</div>
      <div v-for="grp in EQUIPMENT_GROUPS" :key="grp.group">
        <div class="grp-label">{{ grp.group }}</div>
        <button
          v-for="opt in grp.items" :key="opt.value"
          class="choice choice-row" :class="{ active: form.available_equipment.includes(opt.value) }"
          @click="toggleArr(form.available_equipment, opt.value)"
        >
          <div class="row items-center justify-between">
            <div class="choice-title">{{ opt.label }}</div>
            <q-icon v-if="form.available_equipment.includes(opt.value)" name="check_circle" color="primary" size="20px" />
          </div>
          <div v-if="opt.desc" class="choice-desc">{{ opt.desc }}</div>
        </button>
      </div>
    </section>

    <section class="block">
      <div class="block-h">Sports pratiqués</div>
      <div v-for="sp in SPORTS" :key="sp">
        <button class="choice choice-row" :class="{ active: hasSport(sp) }" @click="toggleSport(sp)">
          <div class="row items-center justify-between">
            <div class="choice-title">{{ sp }}</div>
            <q-icon v-if="hasSport(sp)" name="check_circle" color="primary" size="20px" />
          </div>
        </button>
        <div v-if="hasSport(sp)" class="sport-cfg">
          <div class="lbl">Séances / sem</div>
          <div class="choice-grid cols-5 q-mb-sm">
            <button
              v-for="n in [1, 2, 3, 4, 5]" :key="n"
              class="choice small metric" :class="{ active: sportFreq(sp) === n }"
              @click="setSportFreq(sp, n)"
            >{{ n }}</button>
          </div>
          <div class="lbl">Intensité</div>
          <div class="choice-grid cols-3">
            <button
              v-for="it in INTENSITIES" :key="it.value"
              class="choice small" :class="{ active: sportIntensity(sp) === it.value }"
              @click="setSportIntensity(sp, it.value)"
            >{{ it.label }}</button>
          </div>
        </div>
      </div>
    </section>

    <section class="block">
      <div class="block-h">Préférences</div>
      <div class="lbl">Muscles à prioriser</div>
      <div class="choice-grid cols-3 q-mb-md">
        <button
          v-for="m in MUSCLES" :key="m"
          class="choice small" :class="{ active: form.priority_muscles.includes(m) }"
          @click="toggleArr(form.priority_muscles, m)"
        >{{ m }}</button>
      </div>
      <div class="lbl">Unités</div>
      <div class="choice-grid cols-2">
        <button class="choice" :class="{ active: form.units === 'kg' }" @click="form.units = 'kg'">kg</button>
        <button class="choice" :class="{ active: form.units === 'lb' }" @click="form.units = 'lb'">lb</button>
      </div>
    </section>

    <section class="block">
      <div class="block-h">Exercices favoris</div>
      <div class="lbl">Priorisés dans la génération quand ils collent à ton matériel et ton niveau.</div>
      <q-select
        v-model="form.favorite_exercises"
        :options="exerciseOptions"
        filled dark multiple use-chips use-input emit-value map-options
        input-debounce="0" label="Rechercher un exercice…"
        @filter="filterExercises"
      />
    </section>

    <div class="actions">
      <q-btn
        no-caps color="primary" text-color="dark" label="Enregistrer" size="lg"
        :loading="saving" class="full-width" @click="save"
      />
      <q-btn
        no-caps outline color="primary" icon="auto_awesome" label="Régénérer mon programme"
        :loading="regenerating" class="full-width q-mt-sm" @click="confirmRegenerate"
      />
      <div class="hint">La régénération remplace tes séances actuelles par un nouveau programme calculé depuis ces réglages.</div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { SportPractice } from '@/lib/types';
import { buildProgram, type ExerciseDef } from '@/lib/programBuilder';
import { type ProfileForm, emptyProfileForm, profileToForm, formToProfile } from '@/lib/profileForm';
import {
  LEVELS, OBJECTIVES, EQUIPMENT_GROUPS,
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

const form = reactive<ProfileForm>(emptyProfileForm());
const library = ref<ExerciseDef[]>([]);
const saving = ref(false);
const regenerating = ref(false);

// Options du sélecteur d'exos favoris (recherchable).
interface ExOption { label: string; value: string }
const allExerciseOptions = computed<ExOption[]>(() =>
  [...library.value]
    .map((e) => ({ label: e.name, value: e.id }))
    .sort((a, b) => a.label.localeCompare(b.label)),
);
const exerciseOptions = ref<ExOption[]>([]);
function filterExercises(val: string, update: (cb: () => void) => void) {
  update(() => {
    const n = val.toLowerCase();
    exerciseOptions.value = n
      ? allExerciseOptions.value.filter((o) => o.label.toLowerCase().includes(n))
      : allExerciseOptions.value;
  });
}

function toggleArr<T>(arr: T[], v: T) {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(v);
}

// ── Sports ──────────────────────────────────────────────
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

// ── Actions ─────────────────────────────────────────────
async function save() {
  const userId = auth.user?.id;
  if (!userId) return;
  saving.value = true;
  try {
    await profileStore.update(userId, formToProfile(form));
    $q.notify({ type: 'positive', message: 'Réglages enregistrés.' });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec de l’enregistrement.' });
  } finally {
    saving.value = false;
  }
}

function confirmRegenerate() {
  $q.dialog({
    title: 'Régénérer le programme',
    message: 'Tes séances actuelles seront remplacées par un nouveau programme. Continuer ?',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Régénérer', color: 'primary', textColor: 'dark' },
    dark: true,
  }).onOk(() => {
    regenerate().catch(() => undefined);
  });
}

async function regenerate() {
  const userId = auth.user?.id;
  if (!userId) return;
  regenerating.value = true;
  try {
    const profile = formToProfile(form);
    await profileStore.update(userId, profile);
    const sessions = buildProgram(profile, library.value);
    if (sessions.length === 0) {
      $q.notify({ type: 'warning', message: 'Aucun exercice ne correspond à ton matériel.' });
      return;
    }
    await sessionsStore.replaceAll(userId, sessions);
    $q.notify({ type: 'positive', message: `Programme régénéré (${sessions.length} séances).` });
    await router.push('/');
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec de la régénération.' });
  } finally {
    regenerating.value = false;
  }
}

onMounted(async () => {
  const userId = auth.user?.id;
  if (!userId) return;
  try {
    const current = profileStore.profile ?? (await profileStore.fetch(userId));
    if (current) Object.assign(form, profileToForm(current));
    library.value = await libraryStore.fetchAll();
    exerciseOptions.value = allExerciseOptions.value;
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Chargement impossible.' });
  }
});
</script>

<style scoped lang="scss">
.profile-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 40px;
}
.p-title { font-size: 28px; font-weight: 700; color: var(--text); margin: 4px 0 20px; }
.block { margin-bottom: 26px; }
.block-h { font-family: var(--font-display); font-size: 16px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); margin-bottom: 12px; }
.lbl { font-size: 12px; color: var(--dim); margin-bottom: 8px; }
.grp-label { font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--dim-2); margin: 14px 2px 8px; }

.choice-grid { display: grid; gap: 10px; }
.cols-2 { grid-template-columns: repeat(2, 1fr); }
.cols-3 { grid-template-columns: repeat(3, 1fr); }
.cols-4 { grid-template-columns: repeat(4, 1fr); }
.cols-5 { grid-template-columns: repeat(5, 1fr); }

.choice {
  width: 100%; min-height: 52px; background: var(--surface); border: 1.5px solid var(--line);
  border-radius: 12px; color: var(--text); font-family: var(--font-ui); font-size: 16px;
  padding: 14px 16px; text-align: left; cursor: pointer; transition: border-color 0.12s, background 0.12s;
  &.active { border-color: var(--accent); background: var(--surface-2); }
  &.small { min-height: 44px; padding: 10px; text-align: center; font-size: 14px; }
  &.metric { text-align: center; font-family: var(--font-display); font-size: 20px; font-weight: 600; }
}
.choice-row { display: block; margin-bottom: 10px; }
.choice-title { font-weight: 600; font-size: 17px; }
.choice-desc { color: var(--dim); font-size: 13px; margin-top: 4px; }
.choice-hint { color: var(--accent); font-family: var(--font-display); font-size: 12px; margin-top: 6px; letter-spacing: 0.3px; }
.sport-cfg { padding: 4px 6px 14px; margin: -4px 0 10px; }

.actions { margin-top: 12px; }
.hint { color: var(--dim); font-size: 12px; margin-top: 10px; text-align: center; }
</style>

