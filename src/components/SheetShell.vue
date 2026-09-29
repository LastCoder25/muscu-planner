<!--
  🗂️ UNE FEUILLE, EN DIALOGUE OU POSÉE DANS LA PAGE (2026-09-29). Les listes des places fortes
  et des attaques s'ouvrent sous la carte, dépliées par leur tuile (`inline`), et restent
  ouvrables en dialogue ailleurs. ⚠️ Le `<q-dialog>` est écrit ICI dans le template, jamais
  passé en chaîne à `:is` : Quasar n'auto-importe que ce qu'il voit dans un template (cf. le
  piège du `<q-page>`, `boot/qpage.ts`).
-->
<template>
  <q-dialog
    v-if="!inline"
    :model-value="modelValue"
    position="bottom"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <slot />
  </q-dialog>
  <slot v-else />
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean; inline?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
</script>
