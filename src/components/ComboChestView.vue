<template>
  <!-- Contenu du coffre de fin d'un Défi 360, relu depuis le défi lui-même (migr. 0064) :
       la boîte 📬 ne garde que 30 messages (plus les butins à prendre), le défi garde son coffre pour toujours. -->
  <div class="ccv" :class="{ compact }">
    <span class="ccv-t"
      >🎁 <template v-if="!compact">Coffre de fin · niveau {{ chest.level }}</template></span
    >
    <!-- ❓ Toucher une ressource dit ce que c'est (`HaulPills`, la bulle des rapports). -->
    <HaulPills :pills="pills" variant="chip" floating />
    <div v-if="!compact && toOpen" class="ccv-note">À ouvrir dans ta boîte 📬 de l’Aventure</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { haulPills } from '@/lib/expedition';
import HaulPills from '@/components/HaulPills.vue';
import { comboChestMessageId, type ComboChestRecord } from '@/lib/comboChest';
import { useCharacterStore } from '@/stores/character';

const props = defineProps<{ comboId: string; chest: ComboChestRecord; compact?: boolean }>();
const char = useCharacterStore();

// La même liste de devises que la boîte à messages : un coffre se lit pareil partout.
const pills = computed(() => haulPills({ ...props.chest, key: props.chest.keys }));
// Seulement si le personnage est chargé : sinon on ne sait pas, et on ne dit rien.
const toOpen = computed(
  () =>
    char.row?.messages.some((m) => m.id === comboChestMessageId(props.comboId) && !m.claimed) ??
    false,
);
</script>

<style scoped lang="scss">
.ccv {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
}
.ccv.compact {
  margin-top: 6px;
}
.ccv-t {
  font-weight: 700;
  color: var(--text);
}
.ccv-note {
  flex-basis: 100%;
  font-size: 11px;
  color: var(--accent);
}
</style>
