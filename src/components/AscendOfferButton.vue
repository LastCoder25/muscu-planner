<template>
  <!-- ⬆️ Le bouton d'ascension de l'animation de progression (champion OU pièce). Il dit le
       rang visé et son prix AVANT qu'on touche, et, s'il est refusé, POURQUOI — un bouton
       grisé sans raison se lit comme une panne. ⚠️ `@click.stop` partout : l'overlay se
       ferme au toucher, un toucher sur le bouton ne doit pas le fermer. -->
  <div v-if="done || offer" class="aob" :class="{ gear }" @click.stop>
    <div v-if="done" class="aob-done">✅ Ascension faite — le rang suivant est ouvert</div>
    <template v-else-if="offer">
      <button type="button" class="aob-b" :disabled="!!offer.block || busy" @click="emit('go')">
        <span class="aob-l"
          >⬆️ Ascension → {{ rank.emoji }} <b>{{ rank.name }}</b></span
        >
        <span class="aob-c" :class="{ short: offer.have < offer.cost.seals }"
          >{{ gear ? '⚜️' : '🔱' }} {{ offer.have }}/{{ offer.cost.seals }}</span
        >
        <span class="aob-c" :class="{ short: offer.block === 'gold' }"
          >🪙 {{ offer.cost.gold.toLocaleString('fr-FR') }}</span
        >
      </button>
      <div v-if="offer.why" class="aob-why">
        {{ offer.why }}
        <button type="button" class="aob-more" @click="emit('more')">Voir au Panthéon ›</button>
      </div>
    </template>
    <div v-if="err" class="aob-why">{{ err }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AscentOffer } from '@/lib/ascension';
import { CHARACTER_RANKS } from '@/lib/characterRank';

const props = defineProps<{
  offer: AscentOffer | null;
  done: boolean;
  err: string | null;
  busy: boolean;
  gear?: boolean;
}>();
const emit = defineEmits<{ go: []; more: [] }>();
const rank = computed(() => CHARACTER_RANKS[props.offer?.next ?? 0]!);
</script>

<style scoped lang="scss">
.aob {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: default;
}
.aob-b {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  width: 100%;
  min-height: 44px;
  padding: 6px 10px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: #15120e;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  animation: aob-glow 1.6s ease-in-out infinite;
  &:disabled {
    background: var(--surface-2, #2b241b);
    color: var(--dim);
    animation: none;
    cursor: default;
  }
}
.gear .aob-b:not(:disabled) {
  background: #ff9d4d;
}
.aob-l {
  flex: 1 1 auto;
}
.aob-c {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  &.short {
    color: var(--d4);
  }
}
.aob-why {
  font-size: 11.5px;
  color: var(--dim);
}
.aob-more {
  border: 0;
  background: none;
  padding: 0 0 0 4px;
  color: var(--accent);
  font-weight: 700;
  font-size: 11.5px;
  cursor: pointer;
}
.aob-done {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--d1);
}
@keyframes aob-glow {
  50% {
    box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 60%, transparent);
  }
}
@media (prefers-reduced-motion: reduce) {
  .aob-b {
    animation: none;
  }
}
</style>
