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

    <!-- À propos -->
    <section class="block">
      <div class="block-h">À propos</div>
      <div class="about">MUSCU · v{{ version }}</div>
      <div class="about dim">build {{ build }} · {{ commit }}</div>
    </section>

    <q-btn flat no-caps color="negative" icon="logout" label="Déconnexion" class="full-width q-mt-md" @click="logout" />
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useTheme } from '@/composables/useTheme';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';

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
    await profileStore.update(userId, { ...p, preferences: { ...(p.preferences ?? {}), units: u } });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  }
}

async function logout() {
  await auth.signOut();
  profileStore.reset();
  await router.push('/login');
}
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
.choice {
  min-height: 48px; background: var(--surface); border: 1.5px solid var(--line); border-radius: 12px;
  color: var(--text); font-family: var(--font-ui); font-size: 15px; cursor: pointer;
  &.active { border-color: var(--accent); background: var(--surface-2); }
}

.about { color: var(--text); font-size: 14px; &.dim { color: var(--dim); font-size: 12px; margin-top: 2px; } }
</style>
