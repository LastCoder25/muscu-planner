<template>
  <router-view />
  <VersionBadge />
  <GameFxOverlay />
  <XpGainOverlay />
  <AdvXpGainOverlay v-if="advXp.current.value" />
  <GoldGainOverlay />
  <!-- ⚠️ Une erreur qui casse l'écran se DIT (au lieu d'un écran noir) et s'envoie. -->
  <CrashPanel />
  <!-- ⚠️ Ce projet déploie plusieurs fois par jour : un onglet resté ouvert fait
       tourner l'ANCIEN code indéfiniment, et un correctif livré est alors signalé
       comme « toujours cassé ». On PROPOSE le rechargement — jamais d’autorité,
       l’utilisateur peut être en pleine séance. -->
  <button v-if="updateReady" class="app-update" @click="reload">
    🔄 Nouvelle version disponible — recharger
  </button>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted } from 'vue';
import VersionBadge from '@/components/VersionBadge.vue';
import GameFxOverlay from '@/components/GameFxOverlay.vue';
import XpGainOverlay from '@/components/XpGainOverlay.vue';
import { useAdvXpFx } from '@/composables/useAdvXpFx';
// 🐢 Chargé seulement quand une mission rapporte de l'XP : il lit le store du personnage, que
// l'accueil ne doit pas précharger (`useLazyCharacter`).
const AdvXpGainOverlay = defineAsyncComponent(() => import('@/components/AdvXpGainOverlay.vue'));
const advXp = useAdvXpFx();
import GoldGainOverlay from '@/components/GoldGainOverlay.vue';
import CrashPanel from '@/components/CrashPanel.vue';
import { useBodyReminder } from '@/composables/useBodyReminder';
import { useChallengeReminder } from '@/composables/useChallengeReminder';
import { useComboChest } from '@/composables/useComboChest';
import { useAppUpdate } from '@/composables/useAppUpdate';

useBodyReminder();
useChallengeReminder();
// Coffre de fin de Défi 360 : un seul observateur, monté en permanence.
useComboChest();
const { updateReady, watch: watchUpdate, reload } = useAppUpdate();
watchUpdate();

// Retire l'écran de lancement (index.html) une fois l'app montée (fondu).
onMounted(() => {
  const splash = document.getElementById('app-splash');
  if (!splash) return;
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 600);
});
</script>

<style scoped>
/* En BAS, au-dessus de la barre système, et jamais par-dessus un CTA collant :
   c'est une proposition, pas une alerte. */
.app-update {
  position: fixed;
  left: 50%;
  bottom: calc(12px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 8700;
  max-width: calc(100vw - 24px);
  padding: 9px 16px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 6px 20px rgb(0 0 0 / 45%);
  cursor: pointer;
}
</style>
