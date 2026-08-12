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

// Seuil « déplié » : ~820 px capte l'écran principal du Z Fold (~830 px, quasi
// carré) et au-delà (tablette/desktop). En dessous : colonne unique (téléphone,
// Z Fold plié ~344 px).
const WIDE_MIN = 820;
const cockpit = ref(false);
function check() {
  cockpit.value = window.innerWidth >= WIDE_MIN;
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
