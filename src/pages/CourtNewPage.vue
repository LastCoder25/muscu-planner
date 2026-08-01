<template>
  <q-page class="court-new">
    <header class="bar">
      <button class="back" aria-label="Retour" @click="goBack">
        <q-icon name="arrow_back_ios_new" size="20px" />
      </button>
      <span class="bar-title font-display">Nouvelle séance tennis</span>
    </header>

    <div class="body">
      <!-- Méthode -->
      <div class="chips method">
        <button class="chip" :class="{ on: mode === 'engine' }" @click="mode = 'engine'">
          Générateur
        </button>
        <button class="chip" :class="{ on: mode === 'ai' }" @click="mode = 'ai'">Par IA</button>
      </div>

      <!-- Thème -->
      <div class="section-lbl">Thème</div>
      <div class="themes">
        <button
          v-for="t in TENNIS_THEMES"
          :key="t.id"
          class="theme"
          :class="{ on: theme === t.id }"
          @click="theme = t.id"
        >
          <q-icon :name="t.icon" size="22px" />
          <span class="theme-name">{{ t.label }}</span>
          <span class="theme-desc">{{ t.desc }}</span>
        </button>
      </div>

      <!-- Partenaire -->
      <div class="section-lbl">Partenaire</div>
      <div class="chips">
        <button class="chip" :class="{ on: withPartner }" @click="withPartner = true">
          Avec partenaire
        </button>
        <button class="chip" :class="{ on: !withPartner }" @click="withPartner = false">
          Seul(e)
        </button>
      </div>

      <!-- Durée -->
      <div class="section-lbl">Durée</div>
      <div class="chips">
        <button
          v-for="d in DURATIONS"
          :key="d"
          class="chip"
          :class="{ on: duration === d }"
          @click="duration = d"
        >
          {{ d }} min
        </button>
      </div>

      <!-- Niveau -->
      <div class="section-lbl">Niveau</div>
      <div class="chips">
        <button
          v-for="l in LEVELS"
          :key="l.value"
          class="chip"
          :class="{ on: level === l.value }"
          @click="level = l.value"
        >
          {{ l.label }}
        </button>
      </div>

      <q-btn
        v-if="mode === 'engine'"
        class="gen full-width"
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="bolt"
        :label="preview ? 'Régénérer' : 'Générer la séance'"
        :loading="loading"
        @click="generate"
      />

      <!-- Mode IA : copier le prompt puis coller la réponse -->
      <div v-else class="ai-block">
        <q-btn
          class="full-width"
          outline
          color="primary"
          no-caps
          size="lg"
          icon="content_copy"
          label="Copier le prompt pour l'IA"
          @click="copyPrompt"
        />
        <q-input
          v-model="rawInput"
          type="textarea"
          filled
          autogrow
          label="Colle ici la réponse JSON de l'IA"
          class="ai-paste"
        />
        <q-btn
          class="full-width"
          color="primary"
          text-color="dark"
          no-caps
          size="lg"
          icon="auto_awesome"
          label="Analyser la réponse"
          @click="analyze"
        />
      </div>

      <!-- Aperçu -->
      <div v-if="preview" class="preview">
        <div class="pv-head">
          <div class="pv-title">{{ preview.name }}</div>
          <div class="pv-meta">
            {{ preview.drills.length }} drills · {{ preview.estimated_duration_min }} min ·
            {{ preview.with_partner ? 'avec partenaire' : 'seul(e)' }}
          </div>
        </div>
        <div v-for="(d, i) in preview.drills" :key="i" class="pv-drill">
          <div class="pv-num">{{ i + 1 }}</div>
          <div class="pv-main">
            <div class="pv-name">
              {{ d.name }}
              <span class="pv-cat">{{ catLabel(d.category) }}</span>
            </div>
            <div class="pv-target">
              {{ fmtTarget(d.format) }}
              <span v-if="d.shot" class="pv-shot">· {{ shotLabel(d.shot) }}</span>
            </div>
            <div v-if="d.notes" class="pv-notes">{{ d.notes }}</div>
          </div>
        </div>

        <q-btn
          class="save full-width"
          color="primary"
          text-color="dark"
          no-caps
          size="lg"
          icon="check"
          label="Enregistrer la séance"
          :loading="saving"
          @click="save"
        />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useTennisStore } from '@/stores/tennis';
import { buildCourtSession } from '@/lib/drills';
import { buildCourtPrompt, parseDrillSession } from '@/lib/tennisCoach';
import type { DrillSession, DrillShot, DrillCategory, DrillFormat, Level } from '@/lib/types';
import {
  TENNIS_THEMES,
  DRILL_CATEGORY_LABELS,
  DRILL_SHOT_LABELS,
  formatDrillTarget,
} from '@/data/tennis';

const DURATIONS = [30, 45, 60, 90] as const;
const LEVELS: { value: Level; label: string }[] = [
  { value: 'debutant', label: 'Débutant' },
  { value: 'intermediaire', label: 'Intermédiaire' },
  { value: 'avance', label: 'Avancé' },
];

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();
const profileStore = useProfileStore();
const tennis = useTennisStore();

const theme = ref('complet');
const withPartner = ref(true);
const duration = ref<number>(60);
const level = ref<Level>(profileStore.profile?.experience.level ?? 'intermediaire');
const mode = ref<'engine' | 'ai'>('engine');
const rawInput = ref('');
const loading = ref(false);
const saving = ref(false);
const preview = ref<DrillSession | null>(null);

const catLabel = (c: DrillCategory) => DRILL_CATEGORY_LABELS[c];
const shotLabel = (s: DrillShot) => DRILL_SHOT_LABELS[s];
const fmtTarget = (f: DrillFormat) => formatDrillTarget(f.mode, f.value, f.sets);

onMounted(async () => {
  try {
    await tennis.fetchCatalog();
  } catch {
    $q.notify({ type: 'negative', message: 'Chargement du catalogue impossible.' });
  }
});

const themeLabel = computed(
  () => TENNIS_THEMES.find((t) => t.id === theme.value)?.label ?? 'Séance',
);

async function generate() {
  loading.value = true;
  try {
    const catalog = await tennis.fetchCatalog();
    const session = buildCourtSession(catalog, {
      theme: theme.value,
      duration_min: duration.value,
      withPartner: withPartner.value,
      level: level.value,
      name: `Tennis — ${themeLabel.value}`,
    });
    if (!session) {
      $q.notify({ type: 'warning', message: 'Impossible de générer avec ces réglages.' });
      return;
    }
    preview.value = session;
  } finally {
    loading.value = false;
  }
}

async function copyPrompt() {
  const catalog = await tennis.fetchCatalog();
  const prompt = buildCourtPrompt(
    {
      theme: theme.value,
      duration_min: duration.value,
      withPartner: withPartner.value,
      level: level.value,
    },
    catalog,
  );
  try {
    await navigator.clipboard.writeText(prompt);
    $q.notify({ type: 'positive', message: 'Prompt copié — colle-le dans ton IA.' });
  } catch {
    $q.notify({
      type: 'warning',
      message: 'Copie impossible : sélectionne le texte manuellement.',
    });
  }
}

async function analyze() {
  if (!rawInput.value.trim()) {
    $q.notify({ type: 'warning', message: 'Colle d’abord la réponse de l’IA.' });
    return;
  }
  try {
    const catalog = await tennis.fetchCatalog();
    preview.value = parseDrillSession(rawInput.value, catalog);
    $q.notify({ type: 'positive', message: 'Séance analysée.' });
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Lecture impossible.',
    });
  }
}

async function save() {
  const userId = auth.user?.id;
  if (!userId || !preview.value) return;
  saving.value = true;
  try {
    const id = await tennis.create(userId, preview.value);
    await router.push(`/court/${id}/detail`);
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Enregistrement impossible.',
    });
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.back();
}
</script>

<style scoped lang="scss">
.court-new {
  background: var(--bg);
  min-height: 100vh;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 2;
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
.section-lbl {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin: 18px 0 8px;
}
.themes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.theme {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.theme.on {
  border-color: var(--accent);
}
.theme .q-icon {
  color: var(--accent);
}
.theme-name {
  font-weight: 600;
  font-size: 14px;
}
.theme-desc {
  font-size: 11px;
  color: var(--dim);
  line-height: 1.3;
}
.chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  padding: 9px 14px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
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
.gen {
  border-radius: 12px;
  margin-top: 24px;
}
.method {
  margin-bottom: 6px;
}
.ai-block {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.preview {
  margin-top: 24px;
}
.pv-head {
  margin-bottom: 12px;
}
.pv-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 18px;
  color: var(--text);
}
.pv-meta {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.pv-drill {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  margin-bottom: 8px;
  background: var(--surface);
}
.pv-num {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--accent);
  min-width: 20px;
}
.pv-main {
  flex: 1;
}
.pv-name {
  font-weight: 600;
  color: var(--text);
}
.pv-cat {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--dim);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 1px 6px;
  margin-left: 6px;
}
.pv-target {
  font-size: 13px;
  color: var(--accent);
  margin-top: 3px;
}
.pv-shot {
  color: var(--dim);
}
.pv-notes {
  font-size: 12px;
  color: var(--dim);
  margin-top: 4px;
  line-height: 1.35;
}
.save {
  border-radius: 12px;
  margin-top: 16px;
}
</style>
