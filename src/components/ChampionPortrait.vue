<template>
  <!-- 🖼️ LE PORTRAIT D'UN CHAMPION, ou son repli.
       ⚠️ Le repli est un `<slot>` et non une image par défaut : chaque écran a déjà SA
       façon de dire un champion (l'emoji du roster, le ❔ du Codex non découvert). Le
       composant ne tranche donc QUE « y a-t-il une illustration utilisable ? ». -->
  <img
    v-if="src"
    class="cp"
    :src="src"
    :alt="alt"
    :loading="loading"
    decoding="async"
    @error="brokenId = championId ?? null"
  />
  <slot v-else />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { championPortrait } from '@/data/championPortraits';
import { CHAMPION_BY_ID } from '@/data/champions';

const props = defineProps<{
  championId?: string | null;
  /**
   * ⚠️ `eager` par DÉFAUT, à rebours de l'habitude : les deux usages réels affichent tout
   * d'un coup — le Codex montre **32 tuiles visibles**, et la roulette défile si vite
   * qu'une image chargée en retard laisserait une case **blanche** (une `<img>` déclarée
   * ne retombe pas sur le `<slot>`). Le `lazy` reste disponible pour une longue liste.
   */
  loading?: 'eager' | 'lazy';
}>();

/**
 * ⚠️ ON RETIENT L'ID QUI A ÉCHOUÉ, pas un booléen « cassé ».
 * Un booléen demanderait de le RÉARMER à chaque changement de champion — la roulette
 * d'invocation **recycle ses nœuds**, donc un seul échec condamnerait la cellule à
 * l'emoji pour tout le reste du run. Avec l'id, le réarmement est implicite : il n'y a
 * ni `watch` à ordonnancer, ni état à remettre à zéro (jusqu'à 70 cellules par roulette).
 */
const brokenId = ref<string | null>(null);

// Un fichier qui ne charge pas retombe sur le repli, il ne laisse pas d'image cassée :
// le test garantit l'existence au BUILD, pas un déploiement partiel ni un cache froid.
const src = computed(() =>
  brokenId.value === props.championId ? null : championPortrait(props.championId),
);
// Le nom vient du champion lui-même : un `alt` à passer sur chaque site finirait oublié.
const alt = computed(() =>
  props.championId ? (CHAMPION_BY_ID.get(props.championId)?.name ?? '') : '',
);
const loading = computed(() => props.loading ?? 'eager');
</script>

<style scoped>
.cp {
  display: block;
  object-fit: cover;
  /* ⚠️ TAILLE RELATIVE AU CONTEXTE, jamais une prop en px : le portrait remplace un emoji
     dont la taille est déjà écrite en CSS (`font-size`) sur chaque site. Un second nombre
     à passer en props, c'est deux valeurs à garder d'accord — elles divergeraient au
     premier ajustement de cellule, et l'emoji n'aurait plus la même échelle que l'image
     qui le remplace. */
  width: 1.15em;
  height: 1.15em;
  /* Arrondi PROPRE, pas `inherit` : les sites d'appel sont des `<span>` sans rayon. */
  border-radius: 22%;
}
</style>
