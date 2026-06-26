<template>
  <q-page class="login-page flex flex-center">
    <div class="login-card">
      <div class="brand font-display">MUSCU</div>
      <p class="text-dim q-mb-lg">{{ mode === 'signin' ? 'Connecte-toi pour reprendre.' : 'Crée ton compte pour commencer.' }}</p>

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
          v-model="password"
          type="password"
          label="Mot de passe"
          filled
          :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
          :rules="[(v) => (v && v.length >= 6) || '6 caractères minimum']"
          lazy-rules
        />

        <q-btn
          type="submit"
          :label="mode === 'signin' ? 'Se connecter' : 'Créer mon compte'"
          color="primary"
          text-color="dark"
          size="lg"
          no-caps
          :loading="loading"
          class="full-width q-mt-sm"
        />
      </q-form>

      <q-btn
        flat
        no-caps
        class="q-mt-md text-dim"
        :label="mode === 'signin' ? 'Pas encore de compte ? Inscris-toi' : 'Déjà un compte ? Connecte-toi'"
        @click="toggleMode"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();

const mode = ref<'signin' | 'signup'>('signin');
const email = ref('');
const password = ref('');
const loading = ref(false);

function toggleMode() {
  mode.value = mode.value === 'signin' ? 'signup' : 'signin';
}

async function submit() {
  loading.value = true;
  try {
    if (mode.value === 'signin') {
      await auth.signIn(email.value.trim(), password.value);
    } else {
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
