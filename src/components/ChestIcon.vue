<template>
  <!-- Coffre au trésor teinté (couleur = grade bronze/argent/or/platine). Racine <svg>
       → utilisable en HTML (overlay) ET dans une <svg> (carte, via x/y/width/height). -->
  <svg viewBox="0 0 24 24">
    <rect x="3" y="10" width="18" height="10" rx="2.2" :fill="color" />
    <path d="M3 10.5 Q3 5 12 5 Q21 5 21 10.5 Z" :fill="color" />
    <rect x="3" y="10" width="18" height="1.8" fill="rgba(0,0,0,0.30)" />
    <rect x="10.4" y="9" width="3.2" height="5" rx="1.1" fill="rgba(0,0,0,0.45)" />
    <circle cx="12" cy="11" r="1" fill="rgba(255,255,255,0.65)" />
  </svg>
</template>

<script setup lang="ts">
defineProps<{ color: string }>();
</script>
