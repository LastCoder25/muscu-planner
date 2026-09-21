<template>
  <!-- 🗡️ L'ILLUSTRATION D'UNE PIÈCE DE CHAMPION (roster, v0.993), ou son repli.
       Même patron que `ChampionPortrait` : le repli est un `<slot>` (l'emoji du site), et
       le composant ne tranche QUE « y a-t-il une illustration utilisable ? ». -->
  <img
    v-if="src"
    class="aga"
    :src="src"
    alt=""
    :loading="loading ?? 'eager'"
    decoding="async"
    @error="brokenId = model ?? null"
  />
  <slot v-else />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { advGearArt } from '@/data/advGearModels';

const props = defineProps<{
  /** Id du modèle (`advGearModelOf`). Absent ou inconnu → le repli. */
  model?: string | null;
  loading?: 'eager' | 'lazy';
}>();

/** ⚠️ On retient l'id qui a ÉCHOUÉ (pas un booléen) : une liste recycle ses nœuds, un
 *  échec ne doit pas condamner la case pour toutes les pièces suivantes. */
const brokenId = ref<string | null>(null);
const src = computed(() => (brokenId.value === props.model ? null : advGearArt(props.model)));
</script>

<style scoped>
.aga {
  display: block;
  object-fit: cover;
  /* ⚠️ Taille RELATIVE : l'image remplace un emoji dont la taille est déjà écrite en CSS
     sur chaque site (`font-size`) — même règle que le portrait de champion. */
  width: 1.15em;
  height: 1.15em;
  border-radius: 22%;
}
</style>
