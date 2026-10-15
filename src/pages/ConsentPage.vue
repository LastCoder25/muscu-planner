<template>
  <q-page class="consent-page flex flex-center">
    <div class="cs-card">
      <div class="brand font-display">MUSCU</div>
      <h1>Ta vie privée</h1>
      <p>
        L’app enregistre ton profil, tes séances et ta progression pour adapter tes entraînements.
        Le suivi corporel (poids, sommeil) est facultatif. Rien n’est revendu ni utilisé pour de la
        publicité.
      </p>
      <p>
        <router-link to="/privacy">Lire la politique de confidentialité</router-link>
      </p>
      <q-checkbox v-model="ok" label="J’ai lu et j’accepte la politique de confidentialité" />
      <q-btn
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        class="full-width q-mt-md"
        label="Continuer"
        :disable="!ok"
        :loading="saving"
        @click="accept"
      />
      <q-btn flat no-caps class="q-mt-sm text-dim" label="Se déconnecter" @click="logout" />
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
const ok = ref(false);
const saving = ref(false);

async function accept() {
  saving.value = true;
  try {
    await auth.acceptPrivacy();
    await router.replace('/');
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  } finally {
    saving.value = false;
  }
}

async function logout() {
  await auth.signOut();
  await router.replace('/login');
}
</script>

<style scoped lang="scss">
.consent-page {
  background: var(--bg);
  padding: 24px 16px;
}
.cs-card {
  width: 100%;
  max-width: 400px;
  color: var(--text);
  h1 {
    font-size: 22px;
    margin: 12px 0 8px;
  }
  p {
    font-size: 14px;
    line-height: 1.45;
  }
  a {
    color: var(--accent);
  }
}
.brand {
  font-size: 40px;
  font-weight: 700;
  letter-spacing: 4px;
  color: var(--accent);
  text-align: center;
}
.text-dim {
  color: var(--dim);
}
</style>
