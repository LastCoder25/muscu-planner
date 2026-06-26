<template>
  <!-- Version affichée en bas à gauche, discrète, n'intercepte aucun tap. -->
  <div class="version-badge" :title="`build ${build} · ${commit}`">v{{ version }}</div>
</template>

<script setup lang="ts">
const version = __APP_VERSION__;
const commit = __APP_COMMIT__;
const build = __APP_BUILD__;
</script>

<style scoped lang="scss">
.version-badge {
  position: fixed;
  left: 8px;
  bottom: 6px;
  z-index: 9000;
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.5px;
  color: var(--dim-2);
  opacity: 0.7;
  pointer-events: none;
  user-select: none;
}
</style>
