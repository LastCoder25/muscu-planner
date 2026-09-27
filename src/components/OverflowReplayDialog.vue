<template>
  <!-- PLEIN ÉCRAN, comme les autres rejeux : c'est un plateau, pas une vignette. -->
  <q-dialog :model-value="!!msg" maximized persistent @update:model-value="close">
    <div class="ovf-full">
      <OverflowStage
        v-if="msg?.overflow"
        :key="seq"
        :overflow="msg.overflow"
        :when="when"
        @done="onDone"
      />
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
// 🕳️💥 Le rejeu d'un débordement de faille — monté par l'Aventure et la carte, qui ne
// connaissent que le message à montrer.
import { computed, ref, watch } from 'vue';
import type { ExpeditionMessage } from '@/lib/expedition';
import { replayWhenLabel } from '@/lib/riftStage';
import OverflowStage from '@/components/OverflowStage.vue';

const msg = defineModel<ExpeditionMessage | null>({ required: true });
const emit = defineEmits<{ report: [] }>();

/** Clé neuve à chaque ouverture : sinon Vue réutiliserait le plateau déjà à son état final. */
const seq = ref(0);
watch(msg, (m) => {
  if (m) seq.value++;
});
/** ⏱️ L'heure du débordement, si on le découvre en retard. Figée à l'ouverture. */
const when = computed(() => (msg.value ? replayWhenLabel(msg.value.resolvedAt, Date.now()) : null));

function close(): void {
  msg.value = null;
}
function onDone(): void {
  emit('report');
  close();
}
</script>

<style scoped lang="scss">
.ovf-full {
  width: 100vw;
  height: 100dvh;
  background: #07040f;
}
</style>
