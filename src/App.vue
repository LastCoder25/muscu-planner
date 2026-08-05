<template>
  <router-view />
  <FeedbackFab />
  <VersionBadge />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import VersionBadge from '@/components/VersionBadge.vue';
import FeedbackFab from '@/components/FeedbackFab.vue';
import { useBodyReminder } from '@/composables/useBodyReminder';
import { useChallengeReminder } from '@/composables/useChallengeReminder';

useBodyReminder();
useChallengeReminder();

// Retire l'écran de lancement (index.html) une fois l'app montée (fondu).
onMounted(() => {
  const splash = document.getElementById('app-splash');
  if (!splash) return;
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 600);
});
</script>
