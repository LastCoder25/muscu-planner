<template>
  <q-page class="settings-page">
    <h1 class="p-title font-display">Paramètres</h1>

    <!-- Apparence -->
    <section class="block">
      <div class="block-h">Apparence</div>
      <div class="theme-grid">
        <button
          v-for="t in themes"
          :key="t.id"
          class="theme-card"
          :class="{ active: current === t.id }"
          @click="applyTheme(t.id)"
        >
          <div class="swatches">
            <span :style="{ background: t.vars['--bg'] }" />
            <span :style="{ background: t.vars['--surface'] }" />
            <span :style="{ background: t.vars['--accent'] }" />
          </div>
          <div class="theme-name">{{ t.name }}</div>
          <div class="theme-mode">{{ t.dark ? 'Sombre' : 'Clair' }}</div>
          <q-icon v-if="current === t.id" name="check_circle" color="primary" size="18px" class="theme-check" />
        </button>
      </div>
    </section>

    <!-- Unités -->
    <section class="block">
      <div class="block-h">Unités</div>
      <div class="row-2">
        <button class="choice" :class="{ active: units === 'kg' }" @click="setUnits('kg')">kg</button>
        <button class="choice" :class="{ active: units === 'lb' }" @click="setUnits('lb')">lb</button>
      </div>
    </section>

    <!-- Retour / backlog -->
    <section class="block">
      <div class="block-h">Retour</div>
      <q-btn no-caps outline color="primary" icon="feedback" label="Envoyer un retour" class="full-width" @click="openFeedback" />
      <q-btn no-caps flat color="primary" icon="inbox" label="Gérer le backlog" class="full-width q-mt-xs" @click="goBacklog" />

      <div v-if="feedback.mine.length" class="tickets">
        <div v-for="t in feedback.mine" :key="t.id" class="ticket">
          <div class="row items-center justify-between">
            <span class="ticket-kind">{{ kindLabel(t.kind) }}</span>
            <span class="ticket-status" :class="t.status">{{ statusLabel(t.status) }}</span>
          </div>
          <div class="ticket-msg">{{ t.message }}</div>
        </div>
      </div>
    </section>

    <!-- À propos -->
    <section class="block">
      <div class="block-h">À propos</div>
      <div class="about">MUSCU · v{{ version }}</div>
      <div class="about dim">build {{ build }} · {{ commit }}</div>
    </section>

    <q-btn flat no-caps color="negative" icon="logout" label="Déconnexion" class="full-width q-mt-md" @click="logout" />

    <!-- Dialog envoi de retour -->
    <q-dialog v-model="fbOpen" position="bottom">
      <div class="fb-sheet">
        <div class="grab" />
        <h3 class="font-display">Envoyer un retour</h3>
        <div class="row-3 q-mb-md">
          <button v-for="k in KINDS" :key="k.value" class="choice small" :class="{ active: fbKind === k.value }" @click="fbKind = k.value">{{ k.label }}</button>
        </div>
        <textarea v-model="fbMessage" class="fb-field" aria-label="Message" placeholder="Décris le bug ou l'idée…" />
        <q-btn no-caps color="primary" text-color="dark" label="Envoyer" class="full-width q-mt-md" :loading="sending" :disable="!fbMessage.trim()" @click="sendFeedback" />
      </div>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useTheme } from '@/composables/useTheme';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useFeedbackStore, type FeedbackKind } from '@/stores/feedback';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const { current, themes, applyTheme } = useTheme();
const auth = useAuthStore();
const profileStore = useProfileStore();
const feedback = useFeedbackStore();

const version = __APP_VERSION__;
const commit = __APP_COMMIT__;
const build = __APP_BUILD__;

const units = computed(() => profileStore.profile?.preferences?.units ?? 'kg');

async function setUnits(u: 'kg' | 'lb') {
  const p = profileStore.profile;
  const userId = auth.user?.id;
  if (!p || !userId || units.value === u) return;
  try {
    await profileStore.update(userId, { ...p, preferences: { ...(p.preferences ?? {}), units: u } });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  }
}

// ── Retour / backlog ────────────────────────────────────
const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'idea', label: 'Idée' },
  { value: 'other', label: 'Autre' },
];
const fbOpen = ref(false);
const fbKind = ref<FeedbackKind>('bug');
const fbMessage = ref('');
const sending = ref(false);

function openFeedback() {
  fbKind.value = 'bug';
  fbMessage.value = '';
  fbOpen.value = true;
}
async function sendFeedback() {
  sending.value = true;
  try {
    await feedback.submit({
      kind: fbKind.value,
      message: fbMessage.value.trim(),
      page: route.fullPath,
      app_version: version,
    });
    await feedback.fetchMine();
    fbOpen.value = false;
    $q.notify({ type: 'positive', message: 'Merci pour ton retour 🙏' });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec de l’envoi.' });
  } finally {
    sending.value = false;
  }
}

function kindLabel(k: string) {
  return KINDS.find((x) => x.value === k)?.label ?? k;
}
function statusLabel(s: string) {
  return s === 'open' ? 'ouvert' : s === 'in_progress' ? 'en cours' : 'traité';
}

async function goBacklog() {
  await router.push('/backlog');
}
async function logout() {
  await auth.signOut();
  profileStore.reset();
  await router.push('/login');
}

onMounted(async () => {
  try {
    await feedback.fetchMine();
  } catch {
    // silencieux : la liste reste vide
  }
});
</script>

<style scoped lang="scss">
.settings-page { background: var(--bg); min-height: 100vh; padding: 20px 16px 40px; }
.p-title { font-size: 28px; font-weight: 700; color: var(--text); margin: 4px 0 20px; }
.block { margin-bottom: 26px; }
.block-h { font-family: var(--font-display); font-size: 16px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); margin-bottom: 12px; }

.theme-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.theme-card {
  position: relative; text-align: left; background: var(--surface); border: 1.5px solid var(--line);
  border-radius: 14px; padding: 12px; cursor: pointer; transition: border-color 0.12s;
  &.active { border-color: var(--accent); }
}
.swatches { display: flex; gap: 4px; margin-bottom: 8px; span { width: 22px; height: 22px; border-radius: 6px; border: 1px solid #0003; } }
.theme-name { color: var(--text); font-weight: 600; font-size: 14px; }
.theme-mode { color: var(--dim); font-size: 10.5px; letter-spacing: 0.4px; text-transform: uppercase; margin-top: 1px; }
.theme-check { position: absolute; top: 10px; right: 10px; }

.row-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.row-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.choice {
  min-height: 48px; background: var(--surface); border: 1.5px solid var(--line); border-radius: 12px;
  color: var(--text); font-family: var(--font-ui); font-size: 15px; cursor: pointer;
  &.active { border-color: var(--accent); background: var(--surface-2); }
  &.small { min-height: 44px; font-size: 14px; }
}

.tickets { margin-top: 12px; }
.ticket { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 12px; padding: 12px; margin-bottom: 8px; }
.ticket-kind { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: var(--dim); }
.ticket-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: var(--surface-2); color: var(--dim); }
.ticket-status.open { color: var(--accent-ink); background: var(--accent); }
.ticket-status.done { color: var(--accent-ink); background: var(--d1); }
.ticket-msg { color: var(--text); font-size: 14px; margin-top: 6px; }

.about { color: var(--text); font-size: 14px; &.dim { color: var(--dim); font-size: 12px; margin-top: 2px; } }

.fb-sheet { width: 100%; background: var(--surface); border-radius: 26px 26px 0 0; border-top: 1px solid var(--line); padding: 10px 18px 26px; h3 { font-size: 20px; text-transform: uppercase; } }
.grab { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 6px auto 16px; }
.fb-field { width: 100%; min-height: 90px; background: var(--bg); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; color: var(--text); font-family: var(--font-ui); font-size: 14px; resize: none; outline: none; &:focus { border-color: var(--accent); } }
</style>
