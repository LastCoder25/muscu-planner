<template>
  <q-layout view="lHh lpr lFf">
    <q-header class="app-header">
      <q-toolbar>
        <q-toolbar-title class="brand font-display" @click="goHome">MUSCU</q-toolbar-title>
        <q-btn flat round dense icon="more_vert" aria-label="Menu">
          <q-menu anchor="bottom right" self="top right">
            <q-list class="app-menu" style="min-width: 180px">
              <q-item v-close-popup clickable @click="goProfile">
                <q-item-section avatar><q-icon name="fitness_center" /></q-item-section>
                <q-item-section>Profil / Réglages</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goSettings">
                <q-item-section avatar><q-icon name="tune" /></q-item-section>
                <q-item-section>Paramètres</q-item-section>
              </q-item>
              <q-separator dark />
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
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';

const router = useRouter();
const auth = useAuthStore();
const profileStore = useProfileStore();

async function goHome() {
  await router.push('/');
}
async function goProfile() {
  await router.push('/profile');
}
async function goSettings() {
  await router.push('/settings');
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
