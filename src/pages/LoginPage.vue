<template>
  <q-page class="login-page flex flex-center">
    <div class="login-card">
      <div class="brand font-display">MUSCU</div>
      <p class="text-dim q-mb-lg">{{ subtitle }}</p>

      <q-form @submit.prevent="submit" class="column q-gutter-md">
        <q-input
          v-model="email"
          type="email"
          label="Email"
          filled
          autocomplete="email"
          :rules="[(v) => !!v || 'Email requis']"
          lazy-rules
        />
        <q-input
          v-if="mode !== 'forgot'"
          v-model="password"
          type="password"
          label="Mot de passe"
          filled
          :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
          :rules="[(v) => (v && v.length >= 6) || '6 caractères minimum']"
          lazy-rules
        />
        <q-input
          v-if="mode === 'signup'"
          v-model="confirm"
          type="password"
          label="Confirme le mot de passe"
          filled
          autocomplete="new-password"
          :rules="[(v) => v === password || 'Les mots de passe ne correspondent pas']"
          lazy-rules
        />

        <q-btn
          type="submit"
          :label="submitLabel"
          color="primary"
          text-color="dark"
          size="lg"
          no-caps
          :loading="loading"
          class="full-width q-mt-sm"
        />
      </q-form>

      <q-btn
        v-if="mode === 'signin'"
        flat
        no-caps
        dense
        class="q-mt-sm text-dim"
        label="Mot de passe oublié ?"
        @click="mode = 'forgot'"
      />

      <q-btn
        flat
        no-caps
        class="q-mt-xs text-dim"
        :label="secondaryLabel"
        @click="mode === 'forgot' ? (mode = 'signin') : toggleMode()"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();

const mode = ref<'signin' | 'signup' | 'forgot'>('signin');
const email = ref('');
const password = ref('');
const confirm = ref('');
const loading = ref(false);

const subtitle = computed(() => {
  if (mode.value === 'signup') return 'Crée ton compte pour commencer.';
  if (mode.value === 'forgot') return 'Reçois un lien pour réinitialiser ton mot de passe.';
  return 'Connecte-toi pour reprendre.';
});
const submitLabel = computed(() => {
  if (mode.value === 'signup') return 'Créer mon compte';
  if (mode.value === 'forgot') return 'Envoyer le lien';
  return 'Se connecter';
});
const secondaryLabel = computed(() => {
  if (mode.value === 'signup') return 'Déjà un compte ? Connecte-toi';
  if (mode.value === 'forgot') return 'Retour à la connexion';
  return 'Pas encore de compte ? Inscris-toi';
});

function toggleMode() {
  mode.value = mode.value === 'signin' ? 'signup' : 'signin';
}

async function submit() {
  loading.value = true;
  try {
    if (mode.value === 'forgot') {
      await auth.resetPassword(email.value.trim());
      $q.notify({
        type: 'positive',
        message: 'Si un compte existe, un email de réinitialisation vient de partir.',
      });
      mode.value = 'signin';
      return;
    }
    if (mode.value === 'signin') {
      await auth.signIn(email.value.trim(), password.value);
    } else {
      if (password.value !== confirm.value) {
        $q.notify({ type: 'negative', message: 'Les mots de passe ne correspondent pas.' });
        return;
      }
      await auth.signUp(email.value.trim(), password.value);
    }
    await router.push('/');
  } catch (e) {
    $q.notify({ type: 'negative', message: humanError(e) });
  } finally {
    loading.value = false;
  }
}

function humanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.';
  if (/already registered/i.test(msg)) return 'Cet email a déjà un compte.';
  return msg || 'Une erreur est survenue.';
}
</script>

<style scoped lang="scss">
.login-page {
  background: var(--bg);
  padding: 24px;
}
.login-card {
  width: 100%;
  max-width: 380px;
  text-align: center;
}
.brand {
  font-size: 48px;
  font-weight: 700;
  letter-spacing: 4px;
  color: var(--accent);
  line-height: 1;
}
.text-dim {
  color: var(--dim);
}
</style>
