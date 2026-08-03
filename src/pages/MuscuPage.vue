<template>
  <q-page class="muscu-page">
    <h1 class="page-title font-display">Muscu</h1>
    <p class="page-sub text-dim">Séance libre, import IA ou ton programme.</p>

    <div class="tiles">
      <button class="tile" @click="go('/free')">
        <q-icon name="bolt" size="30px" />
        <span>Séance libre</span>
        <small>Au fil de l'eau</small>
      </button>
      <button class="tile" @click="go('/import')">
        <q-icon name="smart_toy" size="30px" />
        <span>Séance IA</span>
        <small>Importer un JSON</small>
      </button>
      <button class="tile" @click="go('/program')">
        <q-icon name="fitness_center" size="30px" />
        <span>Mon programme</span>
        <small>Séances générées</small>
      </button>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
async function go(path: string) {
  await router.push(path);
}
</script>

<style scoped lang="scss">
.muscu-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.page-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.page-sub {
  margin: 4px 0 20px;
}
.text-dim {
  color: var(--dim);
}
.tiles {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 96px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--accent);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: transform 0.08s;
}
.tile .q-icon {
  color: var(--accent);
}
.tile small {
  font-family: var(--font-body, inherit);
  font-weight: 400;
  font-size: 12px;
  color: var(--dim);
}
.tile:active {
  transform: scale(0.98);
}
</style>
