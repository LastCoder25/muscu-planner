<template>
  <!-- 🛡️ LE PORTRAIT DU MILICIEN, ou son emoji si l'image ne charge pas (patron de
       `ChampionPortrait` : un fichier absent ne laisse jamais une image cassée). -->
  <img
    v-if="!broken"
    class="mil-portrait"
    :src="MILITIA_ART"
    :alt="MILITIA_NAME"
    decoding="async"
    @error="broken = true"
  />
  <span v-else>{{ MILITIA_EMO }}</span>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { MILITIA_ART } from '@/data/militiaArt';
import { MILITIA_EMO, MILITIA_NAME } from '@/lib/militia';

const broken = ref(false);
</script>

<style scoped>
.mil-portrait {
  display: block;
  object-fit: cover;
  /* ⚠️ Taille RELATIVE : il remplace un emoji dont la taille est déjà écrite sur chaque site
     (`font-size`) — même règle que les portraits de champions. */
  width: 1.15em;
  height: 1.15em;
  border-radius: 50%;
}
</style>
