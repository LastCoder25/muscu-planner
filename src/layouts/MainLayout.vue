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
        <!-- Notifications d'amis : n'apparaît que s'il y a à traiter ou à annoncer.
             Avant, l'info était enfouie dans le menu ⋮, donc invisible. -->
        <q-btn
          v-if="friends.notifCount > 0"
          flat
          round
          dense
          icon="notifications"
          aria-label="Notifications"
        >
          <q-badge color="primary" text-color="dark" floating>{{ friends.notifCount }}</q-badge>
          <q-menu anchor="bottom right" self="top right" @show="onNotifOpen">
            <q-list class="app-menu" style="min-width: 270px">
              <q-item v-for="v in friends.incoming" :key="'in-' + v.userId">
                <q-item-section>
                  <q-item-label
                    ><b>{{ v.pseudo }}</b> veut être ton ami</q-item-label
                  >
                  <q-item-label caption>Vous verriez vos avancements respectifs</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="nf-acts">
                    <q-btn
                      dense
                      flat
                      color="primary"
                      label="Accepter"
                      @click="answer(v.userId, true)"
                    />
                    <q-btn
                      dense
                      flat
                      color="grey"
                      label="Refuser"
                      @click="answer(v.userId, false)"
                    />
                  </div>
                </q-item-section>
              </q-item>
              <q-item
                v-for="v in friends.newlyAccepted"
                :key="'ok-' + v.userId"
                v-close-popup
                clickable
                @click="goFriends"
              >
                <q-item-section avatar
                  ><q-icon name="how_to_reg" color="positive"
                /></q-item-section>
                <q-item-section>
                  <q-item-label
                    ><b>{{ v.pseudo }}</b> a accepté ta demande</q-item-label
                  >
                  <q-item-label caption>Vous pouvez suivre vos avancements</q-item-label>
                </q-item-section>
              </q-item>
              <q-separator />
              <q-item v-close-popup clickable @click="goFriends">
                <q-item-section avatar><q-icon name="group" /></q-item-section>
                <q-item-section>Voir mes amis</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
        <q-btn flat round dense icon="group" aria-label="Amis" @click="goFriends" />
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
              <q-item v-close-popup clickable @click="goTrophies">
                <q-item-section avatar><q-icon name="emoji_events" /></q-item-section>
                <q-item-section>Trophées</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="goLeaderboard">
                <q-item-section avatar><q-icon name="leaderboard" /></q-item-section>
                <q-item-section>Classement</q-item-section>
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
              <!-- Banc d'essai : l'app installée n'a pas de barre d'URL, une page
                   « accessible en tapant /labo » y serait donc inatteignable. Gardée par
                   isAdmin → elle reste invisible pour tout le monde d'autre. -->
              <q-item v-if="auth.isAdmin" v-close-popup clickable @click="goLab">
                <q-item-section avatar><q-icon name="science" /></q-item-section>
                <q-item-section>Labo (admin)</q-item-section>
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
          <!-- Volet jeu : Aventure par défaut, ou un écran jeu profond (carte
               d'expédition, Labyrinthe) ouvert DANS le volet via useGamePanel. -->
          <component :is="gamePaneComponent" embedded />
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
// Chargés à la demande : le volet jeu n'existe qu'en cockpit → un téléphone ne
// télécharge jamais ces (gros) chunks via le layout.
const AventurePage = defineAsyncComponent(() => import('@/pages/AventurePage.vue'));
const ExpeditionMapPage = defineAsyncComponent(() => import('@/pages/ExpeditionMapPage.vue'));
const ExpeditionPage = defineAsyncComponent(() => import('@/pages/ExpeditionPage.vue'));
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useFeedbackStore } from '@/stores/feedback';
import { useFriendsStore } from '@/stores/friends';
import { useInstallPrompt } from '@/composables/useInstallPrompt';
import { useGamePanel } from '@/composables/useGamePanel';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const friends = useFriendsStore();
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

// Composant du volet jeu (droite) : Aventure, ou un écran jeu profond (carte
// d'expédition, Labyrinthe) ouvert DANS le volet via useGamePanel (Étape 2 cockpit).
const { view: gameView } = useGamePanel();
const GAME_PANES = {
  aventure: AventurePage,
  'expedition-map': ExpeditionMapPage,
  expedition: ExpeditionPage,
};
const gamePaneComponent = computed(() => GAME_PANES[gameView.value]);

onMounted(() => {
  if (auth.isAdmin) feedback.fetchOpenCount().catch(() => undefined);
  const uid = auth.user?.id;
  if (uid) friends.fetchMine(uid).catch(() => undefined);
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
  // Accès direct / rechargement / lancement PWA → pas d'entrée précédente dans
  // l'historique : `router.back()` ne ferait rien (ticket b459601a). On replie
  // alors vers l'accueil. Vue Router stocke la précédente dans history.state.back.
  const hasPrev = window.history.state?.back != null;
  if (hasPrev) router.back();
  else void router.push('/');
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
async function goTrophies() {
  await router.push('/trophies');
}
async function goFriends() {
  await router.push('/friends');
}
// À l'ouverture : on RAFRAÎCHIT d'abord (les demandes arrivées depuis le montage
// n'étaient pas visibles), puis on acquitte les acceptations. Les demandes reçues,
// elles, restent tant qu'on n'y a pas répondu.
function onNotifOpen() {
  const uid = auth.user?.id;
  if (!uid) return;
  friends
    .fetchMine(uid)
    .catch(() => undefined)
    .finally(() => friends.markAcceptedSeen());
}
async function answer(otherId: string, accept: boolean) {
  const uid = auth.user?.id;
  if (!uid) return;
  try {
    await friends.respond(uid, otherId, accept);
    $q.notify({ type: 'positive', message: accept ? 'Ami ajouté !' : 'Demande refusée.' });
  } catch {
    $q.notify({ type: 'negative', message: 'Échec.' });
  }
}
async function goLeaderboard() {
  await router.push('/leaderboard');
}
async function goBacklog() {
  await router.push('/backlog');
}
async function goFormulas() {
  await router.push('/formulas');
}
async function goLab() {
  await router.push('/labo');
}
async function logout() {
  await auth.signOut();
  profileStore.reset();
  await router.push('/login');
}
</script>

<style scoped lang="scss">
/* Actions Accepter/Refuser dans la notification d'ami. */
.nf-acts {
  display: flex;
  gap: 2px;
}

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
