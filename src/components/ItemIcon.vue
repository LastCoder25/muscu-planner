<template>
  <!-- Tuile d'objet façon ARPG : glyphe (MDI pour le gear, emoji d'espèce pour un familier)
       dans un cadre « gemme » teinté par le RANG, avec ★ de qualité, +N enchant et 🧩 set. -->
  <div class="item-icon" :class="{ fam: isFamiliar }" :style="frameStyle">
    <span v-if="isFamiliar" class="ii-emoji" aria-hidden="true">{{ item.emoji }}</span>
    <q-icon v-else :name="icon" class="ii-glyph" :size="glyphSize + 'px'" />

    <span v-if="setId" class="ii-badge set" title="Pièce de set">🧩</span>
    <span v-if="enchant > 0" class="ii-badge ench font-display">+{{ enchant }}</span>

    <span v-if="showStars && stars" class="ii-stars" :title="`Qualité ${stars}/5`">
      <i v-for="n in 5" :key="n" class="ii-star" :class="{ on: n <= stars }">★</i>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RANK_COLOR, rollStars, FAMILIAR_SLOT, type Item } from '@/lib/items';
import { itemIconName } from '@/data/itemIcons';

// `id` non requis : on affiche aussi des objets « sans id » (butin d'un message d'expédition).
const props = withDefaults(
  defineProps<{ item: Omit<Item, 'id'>; size?: number; showStars?: boolean }>(),
  { size: 44, showStars: true },
);

const rankColor = computed(() => RANK_COLOR[props.item.rarity] ?? '#9a8f7e');
const isFamiliar = computed(() => props.item.slot === FAMILIAR_SLOT);
const icon = computed(() => itemIconName(props.item.slot, props.item.effect?.type));
const stars = computed(() => rollStars(props.item.roll));
const setId = computed(() => props.item.setId);
const enchant = computed(() => props.item.enchant ?? 0);
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
/* Badges d'angle : set (haut-gauche), enchant (haut-droite). */
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
.ii-badge.ench {
  right: -5px;
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  font-weight: 800;
}
/* Étoiles de qualité, collées au bas de la tuile. */
.ii-stars {
  position: absolute;
  bottom: -3px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 0.5px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  border-radius: 999px;
  padding: 0 2px;
}
.ii-star {
  font-size: 7px;
  line-height: 1;
  font-style: normal;
  color: var(--line);
}
.ii-star.on {
  color: color-mix(in srgb, var(--rk) 80%, #fff);
}
</style>
