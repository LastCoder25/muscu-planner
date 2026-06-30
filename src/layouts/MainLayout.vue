<template>
  <q-layout view="lHh lpr lFf">
    <q-header class="app-header">
      <q-toolbar>
        <q-btn v-if="showBack" flat round dense icon="arrow_back_ios_new" aria-label="Retour" class="q-mr-xs" @click="goBack" />
        <q-toolbar-title class="brand font-display" @click="goHome">MUSCU</q-toolbar-title>
        <q-btn flat round dense icon="inbox" aria-label="Backlog" @click="goBacklog">
          <q-badge v-if="feedback.openCount > 0" color="primary" text-color="dark" floating>{{ feedback.openCount }}</q-badge>
        </q-btn>
        <q-btn flat round dense icon="more_vert" aria-label="Menu">
          <q-menu anchor="bottom right" self="top right">
            <q-list class="app-menu" style="min-width: 180px">
              <q-item v-close-popup clickable @click="goHistory">
                <q-item-section avatar><q-icon name="history" /></q-item-section>
                <q-item-section>Historique</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goBody">
                <q-item-section avatar><q-icon name="monitor_weight" /></q-item-section>
                <q-item-section>Suivi corporel</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goProfile">
                <q-item-section avatar><q-icon name="fitness_center" /></q-item-section>
                <q-item-section>Profil / Réglages</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goSettings">
                <q-item-section avatar><q-icon name="tune" /></q-item-section>
                <q-item-section>Paramètres</q-item-section>
              </q-item>
              <q-separator />
              <q-item v-close-popup clickable @click="logout">
                <q-item-section avatar><q-icon name="logout" /></q-item-section>
                <q-item-section>Déconnexion</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useFeedbackStore } from '@/stores/feedback';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const profileStore = useProfileStore();
const feedback = useFeedbackStore();

onMounted(() => {
  feedback.fetchOpenCount().catch(() => undefined);
});

// Bouton retour visible partout sauf sur l'accueil.
const showBack = computed(() => route.path !== '/');
function goBack() {
  router.back();
}

async function goHome() {
  await router.push('/');
}
async function goProfile() {
  await router.push('/profile');
}
async function goSettings() {
  await router.push('/settings');
}
async function goHistory() {
  await router.push('/history');
}
async function goBody() {
  await router.push('/body');
}
async function goBacklog() {
  await router.push('/backlog');
}
async function logout() {
  await auth.signOut();
  profileStore.reset();
  await router.push('/login');
}
</script>

<style scoped lang="scss">
.app-header {
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}
.brand {
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--accent);
  font-size: 22px;
  cursor: pointer;
}
</style>
