<template>
  <svg class="avatar" :class="'p-' + profile" viewBox="0 0 120 140" role="img" :aria-label="label">
    <!-- Aura de profil (respire) -->
    <circle class="aura" cx="60" cy="66" r="46" />
    <!-- Corps -->
    <g class="body">
      <!-- tête -->
      <circle class="skin" cx="60" cy="34" r="16" />
      <!-- casque / cheveux teintés profil -->
      <path class="hair" d="M44 32a16 16 0 0 1 32 0 20 20 0 0 0-32 0z" />
      <!-- torse (armure) -->
      <path class="torso" d="M40 56h40l-5 44H45z" />
      <!-- ceinture -->
      <rect class="belt" x="43" y="86" width="34" height="6" rx="2" />
      <!-- jambes -->
      <rect class="leg" x="47" y="100" width="10" height="26" rx="3" />
      <rect class="leg" x="63" y="100" width="10" height="26" rx="3" />
      <!-- bras -->
      <rect class="arm" x="30" y="58" width="9" height="30" rx="4" />
      <rect class="arm" x="81" y="58" width="9" height="30" rx="4" />
      <!-- arme (si équipée) -->
      <g v-if="has.weapon" class="weapon">
        <rect x="90" y="40" width="4" height="52" rx="2" />
        <rect x="86" y="52" width="12" height="4" rx="2" />
      </g>
      <!-- relique (orbe flottante, si équipée) -->
      <circle v-if="has.relic" class="relic" cx="26" cy="46" r="6" />
    </g>
    <!-- Pips d'équipement (4 slots) -->
    <g class="slots">
      <circle
        v-for="(s, i) in slotPips"
        :key="s.slot"
        class="pip"
        :class="s.on ? 'on r-' + s.rarity : 'off'"
        :cx="18 + i * 28"
        cy="134"
        r="4"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
// Avatar procédural (SVG) : teinté par profil (puissant/agile/polyvalent), pips
// d'équipement par slot (couleur = rareté), arme/relique montrées si équipées.
// Léger, theme-aware, aucune image. Prototype Phase 1.
import { computed } from 'vue';
import { SLOTS, SLOT_LABEL, type Equipped, type ItemSlot } from '@/lib/items';

const props = defineProps<{
  profile: 'puissant' | 'agile' | 'polyvalent';
  equipped: Equipped;
}>();

const has = computed(() => ({
  weapon: !!props.equipped.weapon,
  relic: !!props.equipped.relic,
}));
const slotPips = computed(() =>
  SLOTS.map((slot: ItemSlot) => {
    const it = props.equipped[slot];
    return { slot, on: !!it, rarity: it?.rarity ?? 'common' };
  }),
);
const label = computed(
  () =>
    `Aventurier ${props.profile}, ${slotPips.value.filter((s) => s.on).length}/4 équipements : ` +
    slotPips.value.map((s) => `${SLOT_LABEL[s.slot]}${s.on ? ' ✓' : ''}`).join(', '),
);
</script>

<style scoped lang="scss">
.avatar {
  width: 100%;
  height: 100%;
  display: block;
}
.aura {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  opacity: 0.25;
  transform-origin: 60px 66px;
  animation: breathe 3.2s ease-in-out infinite;
}
@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.18;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.32;
  }
}
@media (prefers-reduced-motion: reduce) {
  .aura {
    animation: none;
  }
}
.skin {
  fill: #d9b48f;
}
.hair {
  fill: var(--accent);
}
.torso {
  fill: var(--surface-2, #2a241c);
  stroke: var(--accent);
  stroke-width: 2;
}
.belt {
  fill: var(--accent);
  opacity: 0.8;
}
.leg,
.arm {
  fill: var(--line, #3a332a);
}
.weapon rect {
  fill: var(--accent);
}
.relic {
  fill: #b07cff;
  animation: bob 2.4s ease-in-out infinite;
}
@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}
/* Teinte de profil : puissant (rouge/force), agile (cyan), polyvalent (accent). */
.avatar.p-puissant .hair,
.avatar.p-puissant .belt {
  fill: #ff6a45;
}
.avatar.p-puissant .aura {
  stroke: #ff6a45;
}
.avatar.p-puissant .torso {
  stroke: #ff6a45;
}
.avatar.p-agile .hair,
.avatar.p-agile .belt {
  fill: #4ec6d6;
}
.avatar.p-agile .aura {
  stroke: #4ec6d6;
}
.avatar.p-agile .torso {
  stroke: #4ec6d6;
}
.pip.off {
  fill: var(--line, #3a332a);
}
.pip.on.r-common {
  fill: var(--dim);
}
.pip.on.r-rare {
  fill: #4ec6d6;
}
.pip.on.r-epic {
  fill: #b07cff;
}
.pip.on.r-legendary {
  fill: var(--accent);
}
.pip.on.r-divin {
  fill: #ff5cd8;
}
</style>
