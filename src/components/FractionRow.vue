<template>
  <!-- Saisie FRACTIONNÉE d'un challenge de reps (« une traction toutes les 10-30 minutes ») :
       un gros « +1 », deux raccourcis, le compteur du jour et l'annulation de la dernière
       prise. Ni minuteur ni notification : on tape quand on a fait sa rep. Les prises
       s'ajoutent au même total de reps que les vraies séries. -->
  <div class="cfr" :aria-label="`Saisie fractionnée : ${name}`">
    <div class="cfr-btns">
      <button type="button" class="cfr-main" @click="emit('add', 1)">
        <span class="cfr-plus font-display">+1</span>
        <span class="cfr-sub">rep</span>
      </button>
      <button type="button" class="cfr-alt" @click="emit('add', 2)">+2</button>
      <button type="button" class="cfr-alt" @click="emit('add', 3)">+3</button>
    </div>
    <div class="cfr-foot">
      <span class="cfr-pill" :class="{ on: reps > 0 }">
        <b class="font-display">{{ reps }}</b> rep{{ reps > 1 ? 's' : '' }} aujourd’hui
        <template v-if="takes">· {{ takes }} prise{{ takes > 1 ? 's' : '' }}</template>
      </span>
      <button
        type="button"
        class="cfr-undo"
        :disabled="!takes"
        aria-label="Retirer la dernière prise"
        @click="emit('undo')"
      >
        ↩ Annuler
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ name: string; reps: number; takes: number }>();
const emit = defineEmits<{ add: [n: number]; undo: [] }>();
</script>

<style scoped lang="scss">
.cfr {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cfr-btns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px 56px;
  gap: 8px;
}
.cfr button {
  cursor: pointer;
  border-radius: 12px;
  font-family: inherit;
}
.cfr-main {
  min-height: 56px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  border: 0;
  background: var(--accent);
  color: #15120e;
}
.cfr-plus {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}
.cfr-sub {
  font-size: 13px;
  font-weight: 600;
}
.cfr-alt {
  min-height: 56px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}
.cfr-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}
.cfr-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 12.5px;
  white-space: nowrap;
}
.cfr-pill.on {
  color: var(--text);
  border-color: var(--accent);
}
.cfr-undo {
  margin-left: auto;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--dim);
  font-size: 13px;
}
.cfr-undo:disabled {
  opacity: 0.4;
  cursor: default;
}
.cfr-undo:not(:disabled):hover,
.cfr-undo:not(:disabled):focus-visible {
  color: var(--text);
  border-color: var(--text);
}
</style>
