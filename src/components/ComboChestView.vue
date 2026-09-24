<template>
  <!-- Contenu du coffre de fin d'un Défi 360, relu depuis le défi lui-même (migr. 0064) :
       la boîte 📬 ne garde que 3 messages (plus les butins à prendre), le défi garde son coffre pour toujours. -->
  <div class="ccv" :class="{ compact }">
    <span class="ccv-t"
      >🎁 <template v-if="!compact">Coffre de fin · niveau {{ chest.level }}</template></span
    >
    <span v-for="p in pills" :key="p.emoji" class="ccv-pill">{{ p.emoji }} {{ fmt(p.n) }}</span>
    <div v-if="!compact && toOpen" class="ccv-note">À ouvrir dans ta boîte 📬 de l’Aventure</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { haulPills } from '@/lib/expedition';
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
const fmt = (n: number) => n.toLocaleString('fr-FR');
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
.ccv-pill {
  font-weight: 700;
  border-radius: 999px;
  padding: 2px 8px;
  line-height: 1.5;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text);
  white-space: nowrap;
}
.ccv-note {
  flex-basis: 100%;
  font-size: 11px;
  color: var(--accent);
}
</style>
