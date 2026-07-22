<template>
  <q-page class="reset-page flex flex-center">
    <div class="reset-card">
      <div class="brand font-display">MUSCU</div>

      <template v-if="ready">
        <p class="text-dim q-mb-lg">Choisis ton nouveau mot de passe.</p>

        <q-form @submit.prevent="submit" class="column q-gutter-md">
          <q-input
            v-model="password"
            type="password"
            label="Nouveau mot de passe"
            filled
            autocomplete="new-password"
            :rules="[(v) => (v && v.length >= 6) || '6 caractères minimum']"
            lazy-rules
          />
          <q-input
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
            label="Mettre à jour"
            color="primary"
            text-color="dark"
            size="lg"
            no-caps
            :loading="loading"
            class="full-width q-mt-sm"
          />
        </q-form>
      </template>

      <template v-else>
        <p class="text-dim q-mb-lg">
          Ce lien de réinitialisation est invalide ou a expiré. Refais une demande depuis l'écran de
          connexion.
        </p>
        <q-btn
          label="Retour à la connexion"
          color="primary"
          text-color="dark"
          size="lg"
          no-caps
          class="full-width"
          @click="goLogin"
        />
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/lib/supabase';

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();

const ready = ref(false);
const password = ref('');
const confirm = ref('');
const loading = ref(false);

// L'écran n'a de sens qu'avec une session de recovery active (lien email).
onMounted(async () => {
  const { data } = await supabase.auth.getSession();
  ready.value = !!data.session;
});

async function submit() {
  if (password.value !== confirm.value) return;
  loading.value = true;
  try {
    await auth.updatePassword(password.value);
    $q.notify({ type: 'positive', message: 'Mot de passe mis à jour.' });
    await router.push('/');
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Une erreur est survenue.',
    });
  } finally {
    loading.value = false;
  }
}

async function goLogin() {
  await router.push('/login');
}
</script>

<style scoped lang="scss">
.reset-page {
  background: var(--bg);
  padding: 24px;
}
.reset-card {
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
  margin-bottom: 12px;
}
.text-dim {
  color: var(--dim);
}
</style>
