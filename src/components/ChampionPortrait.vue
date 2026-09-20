<template>
  <!-- 🖼️ LE PORTRAIT D'UN CHAMPION, ou son repli.
       ⚠️ Le repli est un `<slot>` et non une image par défaut : chaque écran a déjà SA
       façon de représenter un champion (l'emoji du roster, le ❔ du Codex non découvert).
       Le composant ne décide donc QUE « y a-t-il une illustration ? ». -->
  <img
    v-if="src"
    class="cp"
    :src="src"
    :alt="alt ?? ''"
    :width="size"
    :height="size"
    loading="lazy"
    decoding="async"
    @error="broken = true"
  />
  <slot v-else />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { championPortrait } from '@/data/championPortraits';

const props = defineProps<{
  championId?: string | null;
  /** Côté du carré, en px — les sites d'appel affichent sinon un emoji dimensionné. */
  size?: number;
  alt?: string;
}>();

// ⚠️ UN FICHIER QUI NE CHARGE PAS RETOMBE SUR LE REPLI, il ne laisse pas une image cassée.
// Le test garantit l'existence au build ; un déploiement partiel ou un cache froid, non.
const broken = ref(false);
// ⚠️ Et on REARME au changement de champion : la roulette d'invocation RECYCLE ses nœuds,
// donc sans ça un seul échec condamnerait la cellule à l'emoji pour tout le reste du run.
watch(
  () => props.championId,
  () => {
    broken.value = false;
  },
);

const src = computed(() => (broken.value ? null : championPortrait(props.championId)));
</script>

<style scoped>
.cp {
  display: block;
  object-fit: cover;
  /* ⚠️ Arrondi PROPRE, pas `inherit` : les sites d'appel sont des `<span>` sans rayon,
     donc l'héritage rendait une image aux angles vifs — collée, pas encadrée. */
  border-radius: 22%;
}
</style>
