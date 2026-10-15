<template>
  <component :is="embedded ? 'div' : 'q-page'" class="settings-page" :class="{ embedded }">
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
          <q-icon
            v-if="current === t.id"
            name="check_circle"
            color="primary"
            size="18px"
            class="theme-check"
          />
        </button>
      </div>
    </section>

    <!-- Unités -->
    <section class="block">
      <div class="block-h">Unités</div>
      <div class="row-2">
        <button class="choice" :class="{ active: units === 'kg' }" @click="setUnits('kg')">
          kg
        </button>
        <button class="choice" :class="{ active: units === 'lb' }" @click="setUnits('lb')">
          lb
        </button>
      </div>
    </section>

    <!-- 🔒 Mes données (RGPD) -->
    <section class="block">
      <div class="block-h">Mes données</div>
      <div class="data-grid">
        <button class="data-tile" :disabled="exporting" @click="doExport">
          <q-icon name="download" size="22px" />
          <span class="dt-label">{{ exporting ? 'Préparation…' : 'Télécharger mes données' }}</span>
          <span class="dt-sub">Fichier JSON de tout ton compte</span>
        </button>
        <button class="data-tile" @click="router.push('/privacy')">
          <q-icon name="policy" size="22px" />
          <span class="dt-label">Confidentialité</span>
          <span class="dt-sub">Ce que l’app garde, et combien de temps</span>
        </button>
        <button class="data-tile danger" @click="deleteOpen = true">
          <q-icon name="delete_forever" size="22px" />
          <span class="dt-label">Supprimer mon compte</span>
          <span class="dt-sub">Définitif : tout est effacé</span>
        </button>
      </div>
    </section>

    <q-dialog v-model="deleteOpen">
      <q-card class="del-card">
        <q-card-section>
          <div class="text-h6">Supprimer ton compte ?</div>
          <p class="q-mt-sm">
            Ton profil, tes séances, tes défis, ton personnage et tes amitiés sont effacés
            définitivement. Un boss entre amis que tu as lancé passe à un autre membre du groupe.
          </p>
          <q-input
            v-model="delPassword"
            type="password"
            label="Ton mot de passe"
            filled
            autocomplete="current-password"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Annuler" v-close-popup />
          <q-btn
            unelevated
            no-caps
            color="negative"
            label="Supprimer définitivement"
            :disable="!delPassword"
            :loading="deleting"
            @click="doDelete"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- À propos -->
    <section class="block">
      <div class="block-h">À propos</div>
      <div class="about">MUSCU · v{{ version }}</div>
      <div class="about dim">build {{ build }} · {{ commit }}</div>
    </section>

    <q-btn
      flat
      no-caps
      color="negative"
      icon="logout"
      label="Déconnexion"
      class="full-width q-mt-md"
      @click="logout"
    />
  </component>
</template>

<script setup lang="ts">
defineProps<{ embedded?: boolean }>();
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useTheme } from '@/composables/useTheme';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { usePrivacyStore } from '@/stores/privacy';

const router = useRouter();
const $q = useQuasar();
const { current, themes, applyTheme } = useTheme();
const auth = useAuthStore();
const profileStore = useProfileStore();

const version = __APP_VERSION__;
const commit = __APP_COMMIT__;
const build = __APP_BUILD__;

const units = computed(() => profileStore.profile?.preferences?.units ?? 'kg');

async function setUnits(u: 'kg' | 'lb') {
  const p = profileStore.profile;
  const userId = auth.user?.id;
  if (!p || !userId || units.value === u) return;
  try {
    await profileStore.update(userId, {
      ...p,
      preferences: { ...(p.preferences ?? {}), units: u },
    });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  }
}

const privacy = usePrivacyStore();
const exporting = ref(false);
const deleteOpen = ref(false);
const delPassword = ref('');
const deleting = ref(false);

async function doExport() {
  exporting.value = true;
  try {
    await privacy.downloadExport();
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    exporting.value = false;
  }
}

async function doDelete() {
  deleting.value = true;
  try {
    await privacy.deleteAccount(delPassword.value);
    profileStore.reset();
    deleteOpen.value = false;
    await router.replace('/login');
    $q.notify({ type: 'positive', message: 'Ton compte et tes données ont été supprimés.' });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    deleting.value = false;
    delPassword.value = '';
  }
}

async function logout() {
  await auth.signOut();
  profileStore.reset();
  await router.push('/login');
}
</script>

<style scoped lang="scss">
.settings-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 40px;
}
.settings-page.embedded {
  min-height: 0;
}
.p-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  margin: 4px 0 20px;
}
.block {
  margin-bottom: 26px;
}
.block-h {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 12px;
}

.data-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}
.data-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-height: 88px;
  padding: 12px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font: inherit;
  &:disabled {
    opacity: 0.6;
  }
  &.danger {
    border-color: color-mix(in srgb, var(--d4) 55%, var(--line));
    color: var(--d4);
  }
}
.dt-label {
  font-weight: 700;
  font-size: 14px;
}
.dt-sub {
  font-size: 12px;
  color: var(--dim);
}
.del-card {
  max-width: 420px;
  width: 100%;
}
.theme-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.theme-card {
  position: relative;
  text-align: left;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  transition: border-color 0.12s;
  &.active {
    border-color: var(--accent);
  }
}
.swatches {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  span {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 1px solid #0003;
  }
}
.theme-name {
  color: var(--text);
  font-weight: 600;
  font-size: 14px;
}
.theme-mode {
  color: var(--dim);
  font-size: 10.5px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  margin-top: 1px;
}
.theme-check {
  position: absolute;
  top: 10px;
  right: 10px;
}

.row-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.choice {
  min-height: 48px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 15px;
  cursor: pointer;
  &.active {
    border-color: var(--accent);
    background: var(--surface-2);
  }
}

.about {
  color: var(--text);
  font-size: 14px;
  &.dim {
    color: var(--dim);
    font-size: 12px;
    margin-top: 2px;
  }
}
</style>
