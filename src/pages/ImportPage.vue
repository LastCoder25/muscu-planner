<template>
  <q-page class="import-page">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="goHome">‹</button>
      <div class="top-title font-display">Importer une séance</div>
    </header>

    <div class="scroll">
      <!-- Étape 1 : prompt -->
      <div class="sec-h">1 · Demande à ChatGPT</div>
      <p class="muted">Copie ce prompt, colle-le dans ChatGPT (ou une autre IA), puis reviens avec sa réponse.</p>
      <div class="prompt-box">{{ prompt }}</div>
      <q-btn no-caps outline color="primary" icon="content_copy" label="Copier le prompt" class="full-width q-mt-sm" @click="copyPrompt" />

      <!-- Étape 2 : coller -->
      <div class="sec-h">2 · Colle la réponse</div>
      <p class="muted">JSON <b>ou</b> texte de séance (ex. « Squat / 40 kg ×8 — 1 min »). L'app reconnaît les deux.</p>
      <textarea v-model="raw" class="paste" aria-label="Réponse IA" placeholder="Colle ici la séance (JSON ou texte)…" />
      <q-btn no-caps color="primary" text-color="dark" label="Convertir" class="full-width q-mt-sm" :disable="!raw.trim()" @click="convert" />

      <!-- Aperçu -->
      <template v-if="preview">
        <div class="sec-h">Aperçu</div>
        <div class="prev-card">
          <div class="prev-name">{{ preview.name }}</div>
          <div class="prev-sub">{{ preview.exercises.length }} exercices</div>
          <div v-for="(ex, i) in preview.exercises" :key="i" class="prev-ex">
            <span class="pe-name">{{ ex.name }}</span>
            <span class="pe-tgt">{{ exSummary(ex) }}</span>
          </div>
        </div>
        <q-btn no-caps color="primary" text-color="dark" label="Ajouter à mes séances" size="lg" class="full-width q-mt-md" :loading="saving" @click="add" />
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar, copyToClipboard } from 'quasar';
import type { Session, ExerciseTarget, PlannedExercise } from '@/lib/types';
import { parseImportedSession, type LibEntry } from '@/lib/importSession';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useSessionsStore } from '@/stores/sessions';
import { useLibraryStore } from '@/stores/library';

const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const profileStore = useProfileStore();
const sessionsStore = useSessionsStore();
const libraryStore = useLibraryStore();

const raw = ref('');
const preview = ref<Session | null>(null);
const saving = ref(false);
const library = ref<LibEntry[]>([]);

const prompt = computed(() => {
  const p = profileStore.profile;
  const ctx = p
    ? `Contexte : objectif ${p.objective}, niveau ${p.experience.level}, matériel ${p.equipment}.`
    : '';
  return `Crée-moi une séance de musculation. ${ctx}
Réponds UNIQUEMENT avec un objet JSON valide (aucun texte autour), exactement à ce format :
{"schema_version":"1.0","type":"session","name":"Nom de la séance","objective":"hypertrophie","exercises":[{"id":"ex_developpe_couche","name":"Développé couché","muscle_primary":"pectoraux","equipment":"barre","progression":"double","rest_seconds":90,"target":{"sets":4,"reps_min":8,"reps_max":12,"load_kg":40}}]}`;
});

function repsLabel(t: ExerciseTarget): string {
  const range = `${t.sets} × ${t.reps_min}–${t.reps_max}`;
  return t.unit === 'time' ? `${range} s` : range;
}
function loadLabel(t: ExerciseTarget): string {
  if (t.load === 'bodyweight') return t.added_kg ? `+${t.added_kg} kg` : 'poids du corps';
  return t.load_kg ? `${t.load_kg} kg` : 'charge à définir';
}
// Résumé d'un exo : reflète la prescription détaillée si présente (pyramide importée).
function exSummary(ex: PlannedExercise): string {
  const p = ex.prescription;
  if (p?.length) {
    const loads = p.map((s) => s.load_kg ?? 0).filter((x) => x > 0);
    const loadPart = loads.length ? `${Math.min(...loads)}–${Math.max(...loads)} kg` : 'PdC';
    return `${p.length} séries · ${loadPart}`;
  }
  return `${repsLabel(ex.target)} · ${loadLabel(ex.target)}`;
}

async function copyPrompt() {
  try {
    await copyToClipboard(prompt.value);
    $q.notify({ type: 'positive', message: 'Prompt copié — colle-le dans ChatGPT.' });
  } catch {
    $q.notify({ type: 'negative', message: 'Copie impossible.' });
  }
}

function convert() {
  try {
    preview.value = parseImportedSession(raw.value, library.value);
    $q.notify({ type: 'positive', message: 'Séance reconnue ✅' });
  } catch (e) {
    preview.value = null;
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Conversion impossible.' });
  }
}

async function add() {
  const userId = auth.user?.id;
  if (!userId || !preview.value) return;
  saving.value = true;
  try {
    const id = await sessionsStore.insert(userId, preview.value);
    $q.notify({ type: 'positive', message: 'Séance importée 🎉' });
    await router.push(`/session/${id}/detail`);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec de l’ajout.' });
  } finally {
    saving.value = false;
  }
}

async function goHome() {
  await router.push('/');
}

onMounted(async () => {
  try {
    library.value = await libraryStore.fetchAll();
  } catch {
    // enrichissement optionnel : on continue sans la biblio
  }
});
</script>

<style scoped lang="scss">
.import-page { background: var(--bg); min-height: 100vh; display: flex; flex-direction: column; }
.top { padding: 14px 16px 12px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--line-soft); }
.iconbtn { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: 18px; display: grid; place-items: center; cursor: pointer; flex: none; }
.top-title { font-weight: 600; font-size: 18px; text-transform: uppercase; color: var(--text); }

.scroll { flex: 1; overflow-y: auto; padding: 16px 16px 40px; }
.sec-h { font-family: var(--font-display); font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dim); margin: 22px 2px 8px; }
.muted { color: var(--dim); font-size: 13px; margin-bottom: 10px; }
.prompt-box { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 12px; padding: 12px; font-size: 11.5px; color: var(--dim); white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow: auto; }
.paste { width: 100%; min-height: 140px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 12px; color: var(--text); font-family: monospace; font-size: 12px; resize: vertical; outline: none; &:focus { border-color: var(--accent); } }

.prev-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
.prev-name { font-weight: 600; font-size: 17px; color: var(--text); }
.prev-sub { font-size: 12px; color: var(--dim); margin: 2px 0 10px; }
.prev-ex { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--line-soft); gap: 10px; }
.pe-name { font-size: 14px; color: var(--text); }
.pe-tgt { font-family: var(--font-display); font-size: 12.5px; color: var(--dim); text-align: right; flex: none; }
</style>
