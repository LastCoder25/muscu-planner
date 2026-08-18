<template>
  <q-layout view="lHh lpr lFf">
    <q-header class="app-header">
      <q-toolbar>
        <q-btn
          v-if="showBack"
          flat
          round
          dense
          icon="arrow_back_ios_new"
          aria-label="Retour"
          class="q-mr-xs"
          @click="goBack"
        />
        <q-toolbar-title class="brand font-display" @click="goHome">MUSCU</q-toolbar-title>
        <q-btn
          v-if="auth.isAdmin"
          flat
          round
          dense
          icon="inbox"
          aria-label="Backlog"
          @click="goBacklog"
        >
          <q-badge v-if="feedback.openCount > 0" color="primary" text-color="dark" floating>{{
            feedback.openCount
          }}</q-badge>
        </q-btn>
        <q-btn flat round dense icon="more_vert" aria-label="Menu">
          <q-menu anchor="bottom right" self="top right">
            <q-list class="app-menu" style="min-width: 180px">
              <q-item v-close-popup clickable @click="goAgenda">
                <q-item-section avatar><q-icon name="calendar_month" /></q-item-section>
                <q-item-section>Agenda</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goHistory">
                <q-item-section avatar><q-icon name="history" /></q-item-section>
                <q-item-section>Historique</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goBody">
                <q-item-section avatar><q-icon name="monitor_weight" /></q-item-section>
                <q-item-section>Suivi corporel</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goStats">
                <q-item-section avatar><q-icon name="bar_chart" /></q-item-section>
                <q-item-section>Statistiques</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goTrophies">
                <q-item-section avatar><q-icon name="emoji_events" /></q-item-section>
                <q-item-section>Trophées</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goChallenges">
                <q-item-section avatar><q-icon name="emoji_events" /></q-item-section>
                <q-item-section>Challenges</q-item-section>
              </q-item>
              <q-item v-if="!isCockpit" v-close-popup clickable @click="goAventure">
                <q-item-section avatar><q-icon name="shield" /></q-item-section>
                <q-item-section>Aventure</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goLeaderboard">
                <q-item-section avatar><q-icon name="leaderboard" /></q-item-section>
                <q-item-section>Classement</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goTennis">
                <q-item-section avatar><q-icon name="sports_tennis" /></q-item-section>
                <q-item-section>Tennis</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goCardio">
                <q-item-section avatar><q-icon name="directions_run" /></q-item-section>
                <q-item-section>Cardio</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goProfile">
                <q-item-section avatar><q-icon name="fitness_center" /></q-item-section>
                <q-item-section>Profil / Réglages</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goSettings">
                <q-item-section avatar><q-icon name="tune" /></q-item-section>
                <q-item-section>Paramètres</q-item-section>
              </q-item>
              <q-item v-if="showInstall" v-close-popup clickable @click="installApp">
                <q-item-section avatar><q-icon name="install_mobile" /></q-item-section>
                <q-item-section>Installer l'application</q-item-section>
              </q-item>
              <q-item v-if="auth.isAdmin" v-close-popup clickable @click="goFormulas">
                <q-item-section avatar><q-icon name="functions" /></q-item-section>
                <q-item-section>Calculs XP (admin)</q-item-section>
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
      <!-- Cockpit Z Fold déplié (≥ 600 px large ET haut) : SPORT à gauche (l'écran
           courant, embarqué), AVENTURE épinglée à droite (persistante, jouable
           pendant qu'on navigue dans le sport). Écran étroit → navigation normale.
           CONTRAT : toute page enfant de MainLayout DOIT accepter la prop `embedded`
           (racine <component :is="embedded ? 'div' : 'q-page'"> + .X-page.embedded
           { min-height: 0 }), sinon elle rend un q-page min-height:100vh dans un volet
           en calc(100vh-50px) → double scroll. -->
      <div v-if="isCockpit" class="home-cockpit">
        <section class="pane pane-sport" aria-label="Sport">
          <!-- Sur un deep-link/reload direct sur /aventure en cockpit, on NE monte PAS
               le composant à gauche (le watch rebascule sur / juste après) → évite un
               double montage transitoire d'AventurePage (gauche + volet droit). -->
          <router-view v-slot="{ Component }">
            <component :is="Component" v-if="!aventureOnLeft" embedded />
          </router-view>
        </section>
        <section class="pane pane-game" aria-label="Aventure">
          <AventurePage embedded />
        </section>
      </div>
      <router-view v-else />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
// Chargé à la demande : le volet jeu n'existe qu'en cockpit → un téléphone ne
// télécharge jamais ce (gros) chunk via le layout.
const AventurePage = defineAsyncComponent(() => import('@/pages/AventurePage.vue'));
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useFeedbackStore } from '@/stores/feedback';
import { useInstallPrompt } from '@/composables/useInstallPrompt';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const profileStore = useProfileStore();
const feedback = useFeedbackStore();
const { isIOS, isStandalone, hasNativePrompt, promptInstall } = useInstallPrompt();

// Proposer l'installation tant que l'app n'est pas déjà lancée en standalone.
const showInstall = computed(() => !isStandalone.value);

async function installApp() {
  if (hasNativePrompt.value) {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      $q.notify({ type: 'positive', message: 'Application installée.' });
    }
    return;
  }
  // Pas d'invite native (iOS Safari, ou critères non réunis) → instructions.
  const message = isIOS
    ? "Dans Safari : appuie sur le bouton Partager (carré avec une flèche), puis « Sur l'écran d'accueil »."
    : "Ouvre le menu de ton navigateur (⋮), puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».";
  $q.dialog({ title: "Installer l'application", message, ok: { label: 'Compris', flat: true } });
}

// ── Cockpit 2 volets (Z Fold déplié / grand écran quasi-carré) ──
// Actif quand largeur ET hauteur ≥ seuil (téléphone en paysage exclu, hauteur < 600).
// On lit `$q.screen` (réactif, resize déjà géré par Quasar) plutôt qu'un listener maison.
// Volet droit = AVENTURE épinglée persistante ; volet gauche = l'écran sport courant.
const WIDE_MIN = 600;
const isCockpit = computed(() => $q.screen.width >= WIDE_MIN && $q.screen.height >= WIDE_MIN);

onMounted(() => {
  if (auth.isAdmin) feedback.fetchOpenCount().catch(() => undefined);
});

// En cockpit, l'Aventure est déjà affichée à droite → si on route vers /aventure
// (menu, tuile, deep-link), on rebascule sur l'accueil pour ne pas la dupliquer à
// gauche. `immediate` couvre le deep-link direct sur /aventure en grand écran. Hors
// cockpit, /aventure s'ouvre normalement en plein écran.
const aventureOnLeft = computed(() => isCockpit.value && route.path === '/aventure');
watch(
  aventureOnLeft,
  (hit) => {
    if (hit) void router.replace('/');
  },
  { immediate: true },
);

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
async function goAgenda() {
  await router.push('/agenda');
}
async function goHistory() {
  await router.push('/history');
}
async function goBody() {
  await router.push('/body');
}
async function goStats() {
  await router.push('/stats');
}
async function goTrophies() {
  await router.push('/trophies');
}
async function goChallenges() {
  await router.push('/challenges');
}
async function goAventure() {
  await router.push('/aventure');
}
async function goLeaderboard() {
  await router.push('/leaderboard');
}
async function goTennis() {
  await router.push('/tennis');
}
async function goCardio() {
  await router.push('/cardio');
}
async function goBacklog() {
  await router.push('/backlog');
}
async function goFormulas() {
  await router.push('/formulas');
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
/* Cockpit 2 volets : SPORT | AVENTURE, chacun défilant indépendamment sous le header. */
.home-cockpit {
  display: flex;
  min-height: 0;
  padding: 0;
  background: var(--bg);
}
.home-cockpit .pane {
  flex: 1 1 0;
  min-width: 0;
  height: calc(100vh - 50px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.home-cockpit .pane-game {
  border-left: 1px solid var(--line);
}
</style>
