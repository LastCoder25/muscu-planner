<template>
  <!-- Écran DÉPLIÉ (Z Fold, ≥ 820 px) : deux volets côte à côte, chacun défilant
       indépendamment — SPORT à gauche, AVENTURE à droite. Écran étroit (plié /
       téléphone) : uniquement le tableau de bord sport (l'Aventure a sa tuile). -->
  <q-page v-if="cockpit" class="home-cockpit">
    <section class="pane pane-sport" aria-label="Sport">
      <HomePage embedded />
    </section>
    <section class="pane pane-game" aria-label="Aventure">
      <AventurePage embedded />
    </section>
  </q-page>
  <HomePage v-else />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import HomePage from '@/pages/HomePage.vue';
import AventurePage from '@/pages/AventurePage.vue';

// Le cockpit 2 volets s'active sur un GRAND écran quasi-carré : Z Fold déplié dans
// LES DEUX orientations (portrait ~714 ET paysage ~830), tablette, desktop.
// Détection par la PLUS PETITE dimension (largeur ET hauteur ≥ seuil) : un écran
// carré/large déclenche ; un TÉLÉPHONE non — même en paysage son côté court
// (≤ ~450) reste sous le seuil. (Avant : largeur seule ≥ 820 → ne marchait qu'en
// paysage sur le Fold.)
const WIDE_MIN = 600;
const cockpit = ref(false);
function check() {
  cockpit.value = window.innerWidth >= WIDE_MIN && window.innerHeight >= WIDE_MIN;
}
onMounted(() => {
  check();
  window.addEventListener('resize', check);
});
onBeforeUnmount(() => window.removeEventListener('resize', check));
</script>

<style scoped lang="scss">
.home-cockpit {
  display: flex;
  min-height: 0;
  padding: 0;
  background: var(--bg);
}
.pane {
  flex: 1 1 0;
  min-width: 0;
  /* Chaque volet remplit la hauteur sous le header et défile indépendamment. */
  height: calc(100vh - 50px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.pane-game {
  border-left: 1px solid var(--line);
}
</style>
