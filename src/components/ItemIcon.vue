<template>
  <!-- Tuile d'objet façon ARPG : glyphe (MDI pour le gear, emoji d'espèce pour un familier)
       dans un cadre « gemme » teinté par le RANG, avec ★ de qualité et 🧩 set. -->
  <div class="item-icon" :class="{ fam: isFamiliar }" :style="frameStyle">
    <span v-if="isFamiliar" class="ii-emoji" aria-hidden="true">{{ item.emoji }}</span>
    <q-icon v-else :name="icon" class="ii-glyph" :size="glyphSize + 'px'" />

    <span v-if="setId" class="ii-badge set" title="Pièce de set">🧩</span>

    <span v-if="showStars && item.roll != null" class="ii-jet" :title="`Jet ${jet}%`"
      >{{ jet }}%</span
    >
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RANK_COLOR, rollJet, FAMILIAR_SLOT, type Item } from '@/lib/items';
import { itemIconName } from '@/data/itemIcons';

// `id` non requis : on affiche aussi des objets « sans id » (butin d'un message d'expédition).
const props = withDefaults(
  defineProps<{ item: Omit<Item, 'id'>; size?: number; showStars?: boolean }>(),
  { size: 44, showStars: true },
);

const rankColor = computed(() => RANK_COLOR[props.item.rarity] ?? '#9a8f7e');
const isFamiliar = computed(() => props.item.slot === FAMILIAR_SLOT);
const icon = computed(() => itemIconName(props.item.slot, props.item.effect?.type));
const jet = computed(() => rollJet(props.item.roll)); // jet 0..100 % (position dans l'intervalle du rang)
const setId = computed(() => props.item.setId);
const glyphSize = computed(() => Math.round(props.size * 0.56));
const frameStyle = computed(() => ({
  '--rk': rankColor.value,
  width: props.size + 'px',
  height: props.size + 'px',
}));
</script>

<style scoped>
.item-icon {
  position: relative;
  flex: 0 0 auto;
  border-radius: 22%;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Tuile « gemme » : fond radial teinté rang + liseré rang + petit halo. */
  background: radial-gradient(
    circle at 50% 38%,
    color-mix(in srgb, var(--rk) 28%, var(--surface)),
    color-mix(in srgb, var(--rk) 9%, var(--surface)) 78%
  );
  border: 1.5px solid color-mix(in srgb, var(--rk) 72%, transparent);
  box-shadow:
    0 0 8px color-mix(in srgb, var(--rk) 26%, transparent),
    inset 0 1px 0 color-mix(in srgb, #fff 12%, transparent);
}
/* Glyphe MDI : teinte rang CLAIRE → contraste sur la tuile sombre. */
.ii-glyph {
  color: color-mix(in srgb, var(--rk) 74%, #fff);
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45));
}
.ii-emoji {
  font-size: 62%;
  line-height: 1;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45));
}
/* Badge d'angle : set (haut-gauche). */
.ii-badge {
  position: absolute;
  top: -5px;
  font-size: 10px;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.ii-badge.set {
  left: -5px;
}
/* Jet (0..100 %) collé au bas de la tuile. */
.ii-jet {
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 8px;
  font-weight: 800;
  line-height: 1;
  color: color-mix(in srgb, var(--rk) 80%, #fff);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  border-radius: 999px;
  padding: 1px 3px;
}
</style>
