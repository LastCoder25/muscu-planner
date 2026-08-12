<template>
  <svg class="avatar" :class="'p-' + profile" viewBox="0 0 120 140" role="img" :aria-label="label">
    <!-- Aura de profil (respire) -->
    <circle class="aura" cx="60" cy="66" r="46" />
    <!-- Corps (idle : respire légèrement) -->
    <g class="body">
      <!-- jambes -->
      <rect class="leg" x="47" y="100" width="10" height="26" rx="3" />
      <rect class="leg" x="63" y="100" width="10" height="26" rx="3" />
      <!-- bras -->
      <rect class="arm" x="30" y="58" width="9" height="30" rx="4" />
      <rect class="arm" x="81" y="58" width="9" height="30" rx="4" />
      <!-- épaulières (visibles si armure équipée) -->
      <template v-if="has.armor">
        <circle class="pauldron" cx="36" cy="58" r="7" />
        <circle class="pauldron" cx="84" cy="58" r="7" />
      </template>
      <!-- torse (armure) -->
      <path class="torso" :class="{ armored: has.armor }" d="M40 56h40l-5 44H45z" />
      <!-- ceinture -->
      <rect class="belt" x="43" y="86" width="34" height="6" rx="2" />
      <!-- tête -->
      <circle class="skin" cx="60" cy="34" r="16" />
      <!-- casque / cheveux teintés profil -->
      <path class="hair" d="M44 32a16 16 0 0 1 32 0 20 20 0 0 0-32 0z" />
      <!-- arme (si équipée) + éclat -->
      <g v-if="has.weapon" class="weapon">
        <rect x="90" y="40" width="4" height="52" rx="2" />
        <rect x="86" y="52" width="12" height="4" rx="2" />
        <rect class="glint" x="90" y="40" width="4" height="10" rx="2" />
      </g>
      <!-- relique (orbe flottante, si équipée) -->
      <circle v-if="has.relic" class="relic" cx="26" cy="46" r="6" />
    </g>
    <!-- Familier (compagnon) : halo teinté + emoji de la race, flotte près du héros -->
    <g v-if="companion" class="familiar">
      <ellipse class="fam-shadow" cx="97" cy="127" rx="13" ry="3.4" />
      <circle class="fam-glow" cx="97" cy="108" r="17" :style="{ fill: companion.tint }" />
      <text class="fam-emoji" x="97" y="117" text-anchor="middle">{{ companion.emoji }}</text>
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
import { SLOTS, SLOT_LABEL, FAMILIAR_SLOT, type Equipped, type ItemSlot } from '@/lib/items';
import { familiarSpecies } from '@/data/familiars';

const props = defineProps<{
  profile: 'puissant' | 'agile' | 'polyvalent';
  equipped: Equipped;
}>();

const has = computed(() => ({
  weapon: !!props.equipped.weapon,
  armor: !!props.equipped.armor,
  relic: !!props.equipped.relic,
}));
// Compagnon (familier équipé) : emoji + teinte de la race, s'il y en a un.
const companion = computed(() => {
  const fam = props.equipped[FAMILIAR_SLOT];
  const sp = fam?.species ? familiarSpecies(fam.species) : undefined;
  return sp ? { emoji: sp.emoji, tint: sp.tint } : null;
});
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
  .aura,
  .body,
  .glint,
  .relic {
    animation: none;
  }
}
/* Idle : le corps respire/oscille doucement. */
.body {
  transform-origin: 60px 90px;
  animation: idle 3.2s ease-in-out infinite;
}
@keyframes idle {
  0%,
  100% {
    transform: translateY(0) scaleY(1);
  }
  50% {
    transform: translateY(-1.5px) scaleY(1.012);
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
/* Armure équipée : torse renforcé + épaulières. */
.torso.armored {
  fill: color-mix(in srgb, var(--accent) 18%, var(--surface-2, #2a241c));
  stroke-width: 3;
}
.pauldron {
  fill: var(--accent);
  opacity: 0.85;
}
.glint {
  fill: #fff;
  opacity: 0.7;
  animation: glint 2.6s ease-in-out infinite;
}
@keyframes glint {
  0%,
  70%,
  100% {
    opacity: 0;
    transform: translateY(0);
  }
  80% {
    opacity: 0.8;
    transform: translateY(38px);
  }
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
/* Familier (compagnon) : halo tamisé + emoji, flotte doucement. */
.familiar {
  transform-origin: 97px 108px;
  animation: fam-bob 2.8s ease-in-out infinite;
}
.fam-glow {
  opacity: 0.28;
  filter: blur(1px);
}
.fam-shadow {
  fill: #000;
  opacity: 0.18;
}
.fam-emoji {
  font-size: 26px;
}
@keyframes fam-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .familiar {
    animation: none;
  }
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
