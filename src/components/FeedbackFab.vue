<template>
  <!-- Bouton de retour global : présent sur tout l'app (sauf login/onboarding),
       pré-rempli avec la page courante. -->
  <q-btn
    v-if="show"
    round
    color="primary"
    text-color="dark"
    icon="rate_review"
    size="md"
    class="fb-fab"
    aria-label="Faire un retour"
    @click="open"
  />

  <q-dialog v-model="dialog" position="bottom">
    <div class="fb-sheet">
      <div class="grab" />
      <h3 class="font-display">Faire un retour</h3>
      <div class="fb-page">sur <b>{{ pageLabel }}</b></div>
      <div class="kinds">
        <button v-for="k in KINDS" :key="k.value" class="kind" :class="{ on: kind === k.value }" @click="kind = k.value">{{ k.label }}</button>
      </div>
      <textarea v-model="message" class="fb-field" aria-label="Message" placeholder="Décris le bug ou l'idée…" />
      <q-btn no-caps color="primary" text-color="dark" label="Envoyer" class="full-width q-mt-md" :loading="sending" :disable="!message.trim()" @click="send" />
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useFeedbackStore, type FeedbackKind } from '@/stores/feedback';

const route = useRoute();
const $q = useQuasar();
const auth = useAuthStore();
const feedback = useFeedbackStore();

// Masqué tant que non connecté (RLS) et sur les écrans d'entrée.
const HIDDEN = ['/login', '/onboarding'];
const show = computed(() => !!auth.user && !HIDDEN.some((p) => route.path.startsWith(p)));
const pageLabel = computed(() => route.path);

const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'idea', label: 'Idée' },
  { value: 'other', label: 'Autre' },
];
const dialog = ref(false);
const kind = ref<FeedbackKind>('bug');
const message = ref('');
const sending = ref(false);

function open() {
  kind.value = 'bug';
  message.value = '';
  dialog.value = true;
}
async function send() {
  sending.value = true;
  try {
    await feedback.submit({
      kind: kind.value,
      message: message.value.trim(),
      page: route.fullPath,
      app_version: __APP_VERSION__,
    });
    dialog.value = false;
    $q.notify({ type: 'positive', message: 'Merci pour ton retour 🙏' });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec de l’envoi.' });
  } finally {
    sending.value = false;
  }
}
</script>

<style scoped lang="scss">
.fb-fab {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 3000;
  box-shadow: 0 8px 24px -6px #0007;
}
.fb-sheet { width: 100%; background: var(--surface); border-radius: 26px 26px 0 0; border-top: 1px solid var(--line); padding: 10px 18px 26px; h3 { font-size: 20px; text-transform: uppercase; } }
.fb-page { color: var(--dim); font-size: 12.5px; margin: -2px 0 14px; b { color: var(--text); } }
.grab { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 6px auto 14px; }
.kinds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.kind { min-height: 44px; background: var(--surface); border: 1.5px solid var(--line); border-radius: 12px; color: var(--text); font-family: var(--font-ui); font-size: 14px; cursor: pointer; &.on { border-color: var(--accent); background: var(--surface-2); } }
.fb-field { width: 100%; min-height: 90px; background: var(--bg); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; color: var(--text); font-family: var(--font-ui); font-size: 14px; resize: none; outline: none; &:focus { border-color: var(--accent); } }
</style>
