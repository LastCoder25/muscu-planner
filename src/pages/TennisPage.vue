<template>
  <q-page class="tennis-page">
    <h1 class="page-title font-display">Tennis</h1>
    <p class="page-sub text-dim">Enregistre tes séances, tes drills et ta prépa physique.</p>

    <div v-if="resume" class="resume">
      <div class="resume-main">
        <q-icon name="sports_tennis" size="20px" />
        <span>Séance en cours · {{ resume.done }}/{{ resume.total }} drills</span>
      </div>
      <div class="resume-actions">
        <button class="r-go" @click="resumeCourt">Reprendre</button>
        <button class="r-cancel" aria-label="Abandonner" @click="discardCourt">Abandonner</button>
      </div>
    </div>

    <div class="seg">
      <button class="seg-b" :class="{ on: tab === 'act' }" @click="tab = 'act'">
        <q-icon name="sports_tennis" size="18px" /> Activité
      </button>
      <button class="seg-b" :class="{ on: tab === 'hist' }" @click="tab = 'hist'">
        <q-icon name="history" size="18px" /> Historique
      </button>
    </div>

    <!-- Enregistrer une séance jouée (log à la durée) -->
    <section v-show="tab === 'act'" class="card">
      <div class="card-head">
        <q-icon name="edit_note" size="22px" />
        <div>
          <div class="card-title">Enregistrer une séance</div>
          <div class="card-desc">Une séance jouée, à la durée → XP tennis.</div>
        </div>
      </div>

      <div class="opt-row">
        <span class="opt-lbl">Date</span>
        <q-input v-model="logDate" type="date" filled dense style="max-width: 180px" />
      </div>

      <div class="opt-row">
        <span class="opt-lbl">Durée</span>
        <q-input
          v-model.number="logHours"
          type="number"
          filled
          dense
          suffix="h"
          style="max-width: 90px"
        />
        <q-input
          v-model.number="logMinutes"
          type="number"
          filled
          dense
          suffix="min"
          style="max-width: 100px"
        />
      </div>

      <div class="chips">
        <button class="chip" :class="{ on: logPartner }" @click="logPartner = true">
          Avec partenaire
        </button>
        <button class="chip" :class="{ on: !logPartner }" @click="logPartner = false">
          Seul(e)
        </button>
      </div>

      <div class="opt-lbl" style="margin-top: 12px">Ressenti</div>
      <div class="rate-btns">
        <button
          v-for="n in 4"
          :key="n"
          class="rate-b"
          :class="{ on: logRpe === n }"
          :style="{ '--c': `var(--d${n})` }"
          @click="logRpe = n as Difficulty"
        >
          {{ n }}
        </button>
      </div>

      <q-input
        v-model="logComment"
        type="textarea"
        autogrow
        filled
        label="Commentaire"
        class="q-mt-sm"
      />

      <q-btn
        class="gen-btn full-width q-mt-sm"
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="check"
        label="Enregistrer la séance"
        :loading="savingLog"
        @click="saveSession"
      />
    </section>

    <!-- Prépa physique -->
    <section v-show="tab === 'act'" class="card">
      <div class="card-head">
        <q-icon name="directions_run" size="22px" />
        <div>
          <div class="card-title">Prépa physique</div>
          <div class="card-desc">Pliométrie, agilité, gainage rotatif — le physique du tennis.</div>
        </div>
      </div>

      <div class="opt-row">
        <span class="opt-lbl">Durée</span>
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
      </div>

      <q-btn
        class="gen-btn full-width"
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="bolt"
        label="Générer une séance"
        :loading="generating"
        @click="generate"
      />

      <button class="ia-link" @click="prepaIa = !prepaIa">
        {{ prepaIa ? 'Masquer l’IA' : 'Générer par IA' }}
      </button>
      <div v-if="prepaIa" class="ai-block">
        <q-btn
          outline
          color="primary"
          no-caps
          icon="content_copy"
          label="Copier le prompt"
          @click="copyPrepaPrompt"
        />
        <q-input
          v-model="prepaRaw"
          type="textarea"
          filled
          autogrow
          label="Colle la réponse JSON de l'IA"
        />
        <q-btn
          color="primary"
          text-color="dark"
          no-caps
          icon="auto_awesome"
          label="Analyser"
          :loading="analyzing"
          @click="analyzePrepa"
        />
      </div>

      <div v-if="prepaSessions.length" class="saved">
        <div class="saved-lbl">Mes séances de prépa</div>
        <div v-for="s in prepaSessions" :key="s.id" class="saved-row" @click="openDetail(s.id)">
          <div class="saved-main">
            <div class="saved-name">{{ s.payload.name }}</div>
            <div class="saved-meta">
              {{ s.payload.exercises.length }} exos ·
              {{ s.payload.estimated_duration_min ?? '?' }} min
            </div>
          </div>
          <button class="saved-del" aria-label="Supprimer" @click.stop="remove(s.id)">
            <q-icon name="delete_outline" size="20px" />
          </button>
        </div>
      </div>
    </section>

    <!-- Drills court -->
    <section v-show="tab === 'act'" class="card">
      <div class="card-head">
        <q-icon name="sports_tennis" size="22px" />
        <div>
          <div class="card-title">Drills sur le court</div>
          <div class="card-desc">
            Diagonales coup droit/revers, montée-volée, jeu… avec ou sans partenaire.
          </div>
        </div>
      </div>

      <q-btn
        class="gen-btn full-width"
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="add"
        label="Créer une séance"
        @click="newCourt"
      />

      <div v-if="tennis.sessions.length" class="saved">
        <div class="saved-lbl">Mes séances de court</div>
        <div v-for="s in tennis.sessions" :key="s.id" class="saved-row" @click="openCourt(s.id)">
          <div class="saved-main">
            <div class="saved-name">{{ s.payload.name }}</div>
            <div class="saved-meta">
              {{ s.payload.drills.length }} drills ·
              {{ s.payload.estimated_duration_min ?? '?' }} min ·
              {{ s.payload.with_partner ? 'avec partenaire' : 'seul(e)' }}
            </div>
          </div>
          <button class="saved-del" aria-label="Supprimer" @click.stop="removeCourt(s.id)">
            <q-icon name="delete_outline" size="20px" />
          </button>
        </div>
      </div>
    </section>

    <!-- Historique tennis -->
    <div v-if="tab === 'hist' && !tennis.logs.length" class="empty">
      Aucune séance de tennis enregistrée pour l'instant.
    </div>
    <section v-if="tab === 'hist' && tennis.logs.length" class="card">
      <div class="card-head">
        <q-icon name="history" size="22px" />
        <div>
          <div class="card-title">Historique tennis</div>
          <div class="card-desc">Tes dernières séances jouées sur le court.</div>
        </div>
      </div>
      <div v-for="l in tennis.logs" :key="l.id" class="saved-row" @click="openLog(l.id)">
        <div class="saved-main">
          <div class="saved-name">{{ l.payload.name || 'Séance tennis' }}</div>
          <div class="saved-meta">
            {{ fmtDate(l.performed_at) }}
            <template v-if="l.payload.drills.length">
              · {{ l.payload.drills.filter((d) => d.done).length }}/{{ l.payload.drills.length }}
              drills
            </template>
            <template v-if="l.payload.duration_min">
              · {{ fmtDur(l.payload.duration_min) }}</template
            >
          </div>
        </div>
        <q-icon name="chevron_right" color="grey-6" size="20px" />
      </div>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useSessionsStore } from '@/stores/sessions';
import { useLibraryStore } from '@/stores/library';
import { useTennisStore } from '@/stores/tennis';
import { useLiveCourtStore } from '@/stores/liveCourt';
import { buildPrepaSession } from '@/lib/prepaBuilder';
import { buildPrepaPrompt } from '@/lib/tennisCoach';
import { parseImportedSession } from '@/lib/importSession';
import type { DrillLog, Difficulty } from '@/lib/types';
import { SCHEMA_VERSION } from '@/lib/types';

const DURATIONS = [20, 30, 45] as const;

const $q = useQuasar();
const tab = ref<'act' | 'hist'>('act');
const router = useRouter();
const auth = useAuthStore();
const profileStore = useProfileStore();
const sessionsStore = useSessionsStore();
const library = useLibraryStore();
const tennis = useTennisStore();
const live = useLiveCourtStore();

const duration = ref<number>(30);
const generating = ref(false);
const prepaIa = ref(false);
const prepaRaw = ref('');
const analyzing = ref(false);

// Log manuel d'une séance jouée (à la durée : heures + minutes)
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function performedAtIso(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map((n) => Number(n) || 0);
  const now = new Date();
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1, now.getHours(), now.getMinutes(), now.getSeconds());
  return dt.toISOString();
}

const logDate = ref(todayIso());
const logHours = ref<number>(1);
const logMinutes = ref<number>(0);
const logPartner = ref(true);
const logRpe = ref<Difficulty | null>(null);
const logComment = ref('');
const savingLog = ref(false);

async function saveSession() {
  const userId = auth.user?.id;
  if (!userId) return;
  const totalMin = (logHours.value || 0) * 60 + (logMinutes.value || 0);
  if (totalMin <= 0) {
    $q.notify({ type: 'warning', message: 'Renseigne une durée.' });
    return;
  }
  savingLog.value = true;
  try {
    const log: DrillLog = {
      schema_version: SCHEMA_VERSION,
      type: 'drill_log',
      id: crypto.randomUUID(),
      name: 'Séance de tennis',
      sport: 'tennis',
      with_partner: logPartner.value,
      duration_min: totalMin,
      ended_at: performedAtIso(logDate.value),
      ...(logRpe.value ? { global_difficulty: logRpe.value } : {}),
      ...(logComment.value.trim() ? { global_comment: logComment.value.trim() } : {}),
      drills: [],
    };
    await tennis.addLog(userId, log);
    $q.notify({ type: 'positive', message: 'Séance enregistrée — XP tennis gagné.' });
    logDate.value = todayIso();
    logHours.value = 1;
    logMinutes.value = 0;
    logRpe.value = null;
    logComment.value = '';
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    savingLog.value = false;
  }
}

const prepaSessions = computed(() =>
  sessionsStore.list.filter((s) => s.payload.discipline === 'prepa_physique'),
);
const resume = computed(() => live.savedMeta());

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}
function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m}`;
  if (h) return `${h} h`;
  return `${m} min`;
}

async function resumeCourt() {
  if (resume.value) await router.push(`/court/${resume.value.sessionId}`);
}
function discardCourt() {
  $q.dialog({
    title: 'Abandonner la séance',
    message: 'La séance de tennis en cours sera effacée. Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Abandonner', color: 'negative' },
  }).onOk(() => {
    live.discardSaved();
    $q.notify({ type: 'positive', message: 'Séance abandonnée.' });
  });
}
async function openLog(id: string) {
  await router.push(`/court/bilan/${id}?h=1`);
}

onMounted(() => {
  sessionsStore.fetchMine().catch(() => undefined);
  tennis.fetchMine().catch(() => undefined);
  tennis.fetchLogs().catch(() => undefined);
});

async function newCourt() {
  await router.push('/court/new');
}
async function openCourt(id: string) {
  await router.push(`/court/${id}/detail`);
}
function removeCourt(id: string) {
  $q.dialog({
    title: 'Supprimer la séance',
    message: 'Cette séance de tennis sera supprimée. Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    void tennis
      .remove(id)
      .then(() => $q.notify({ type: 'positive', message: 'Séance supprimée.' }));
  });
}

async function generate() {
  const profile = profileStore.profile;
  const userId = auth.user?.id;
  if (!profile || !userId) {
    $q.notify({ type: 'negative', message: 'Profil introuvable.' });
    return;
  }
  generating.value = true;
  try {
    const lib = await library.fetchPrepa('tennis');
    const session = buildPrepaSession(profile, lib, { duration_min: duration.value });
    if (!session) {
      $q.notify({
        type: 'warning',
        message: 'Aucun exercice de prépa disponible avec ton matériel.',
      });
      return;
    }
    const id = await sessionsStore.insert(userId, session);
    await router.push(`/session/${id}/detail`);
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Génération impossible.',
    });
  } finally {
    generating.value = false;
  }
}

async function copyPrepaPrompt() {
  const prompt = buildPrepaPrompt({ duration_min: duration.value });
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

async function analyzePrepa() {
  const userId = auth.user?.id;
  if (!userId) return;
  if (!prepaRaw.value.trim()) {
    $q.notify({ type: 'warning', message: 'Colle d’abord la réponse de l’IA.' });
    return;
  }
  analyzing.value = true;
  try {
    const lib = await library.fetchAll();
    const session = parseImportedSession(prepaRaw.value, lib);
    session.discipline = 'prepa_physique';
    if (!session.name || session.name === 'Séance importée') {
      session.name = 'Prépa physique tennis (IA)';
    }
    const id = await sessionsStore.insert(userId, session);
    await router.push(`/session/${id}/detail`);
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Lecture impossible.',
    });
  } finally {
    analyzing.value = false;
  }
}

async function openDetail(id: string) {
  await router.push(`/session/${id}/detail`);
}

function remove(id: string) {
  $q.dialog({
    title: 'Supprimer la séance',
    message: 'Cette séance de prépa sera supprimée. Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    void sessionsStore
      .remove(id)
      .then(() => $q.notify({ type: 'positive', message: 'Séance supprimée.' }));
  });
}
</script>

<style scoped lang="scss">
.tennis-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.page-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.page-sub {
  margin: 4px 0 20px;
}
.text-dim {
  color: var(--dim);
}
.seg {
  display: flex;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 16px;
}
.seg-b {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 8px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}
.seg-b.on {
  background: var(--accent);
  color: var(--accent-ink, #15120e);
}
.empty {
  color: var(--dim);
  padding: 24px 4px;
}
.resume {
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
.resume-main {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-weight: 600;
  font-size: 14px;
}
.resume-main .q-icon {
  color: var(--accent);
}
.resume-actions {
  display: flex;
  gap: 8px;
}
.r-go {
  padding: 7px 14px;
  border-radius: 10px;
  border: none;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.r-cancel {
  padding: 7px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--d4);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
}
.card-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}
.card-head .q-icon {
  color: var(--accent);
  margin-top: 2px;
}
.card-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 18px;
  color: var(--text);
}
.card-desc {
  color: var(--dim);
  font-size: 13px;
  margin-top: 2px;
}
.opt-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.opt-lbl {
  color: var(--dim);
  font-size: 13px;
}
.rate-btns {
  display: flex;
  gap: 10px;
}
.rate-b {
  flex: 1;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}
.rate-b.on {
  border-color: var(--c);
  background: var(--c);
  color: #15120e;
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
.gen-btn {
  border-radius: 12px;
}
.ia-link {
  display: block;
  margin: 10px auto 0;
  background: none;
  border: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.ai-block {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.saved {
  margin-top: 18px;
}
.saved-lbl {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 8px;
}
.saved-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  margin-bottom: 8px;
  cursor: pointer;
}
.saved-row:active {
  border-color: var(--accent);
}
.saved-main {
  flex: 1;
}
.saved-name {
  font-weight: 600;
  color: var(--text);
}
.saved-meta {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.saved-del {
  background: none;
  border: none;
  color: var(--d4);
  cursor: pointer;
  padding: 4px;
}
.card.soon {
  opacity: 0.72;
  position: relative;
}
.soon-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--accent-ink);
  background: var(--accent);
  border-radius: 999px;
  padding: 3px 10px;
}
</style>
