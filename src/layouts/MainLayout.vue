<template>
  <q-layout view="lHh lpr lFf">
    <q-header class="app-header">
      <q-toolbar>
        <q-toolbar-title class="brand font-display" @click="goHome">MUSCU</q-toolbar-title>
        <q-btn flat round dense icon="tune" aria-label="Réglages" @click="goProfile" />
        <q-btn flat round dense icon="logout" aria-label="Déconnexion" @click="logout" />
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
