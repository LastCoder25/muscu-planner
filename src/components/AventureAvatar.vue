<template>
  <svg class="avatar" :class="'p-' + profile" viewBox="0 0 120 140" role="img" :aria-label="label">
    <!-- Aura de profil (respire) -->
    <circle class="aura" cx="60" cy="66" r="46" />
    <!-- Aura d'ENCHANT : de plus en plus visible selon l'enchant le plus haut de
         l'équipement (façon L2). Teinte par palier (or → orange → magenta), halo +
         anneaux pulsés, étincelles aux hauts enchants. -->
    <g
      v-if="maxEnchant > 0"
      class="ench-aura"
      :class="'e-' + enchTier"
      :style="{ '--ei': enchIntensity }"
    >
      <circle class="ench-glow" cx="60" cy="70" :r="38 + maxEnchant * 1.8" />
      <circle class="ench-ring" cx="60" cy="70" :r="42 + maxEnchant * 1.4" />
      <circle class="ench-ring r2" cx="60" cy="70" :r="48 + maxEnchant * 1.2" />
      <g v-if="maxEnchant >= 8" class="ench-sparks">
        <circle class="spark" cx="60" cy="22" r="2" />
        <circle class="spark" cx="96" cy="70" r="2" />
        <circle class="spark" cx="24" cy="70" r="2" />
        <circle class="spark" cx="60" cy="120" r="2" />
      </g>
    </g>
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
      <ellipse class="fam-shadow" cx="95" cy="131" rx="16" ry="4" />
      <circle class="fam-glow" cx="95" cy="109" r="21" :style="{ fill: companion.tint }" />
      <text class="fam-emoji" x="95" y="120" text-anchor="middle">{{ companion.emoji }}</text>
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
// Enchant le PLUS HAUT parmi l'équipement (les 4 slots gear) → pilote l'aura d'enchant.
const maxEnchant = computed(() => {
  let m = 0;
  for (const slot of SLOTS) m = Math.max(m, props.equipped[slot]?.enchant ?? 0);
  return m;
});
const enchIntensity = computed(() => Math.min(1, maxEnchant.value / 12));
// Palier de teinte : bas (or) / moyen (orange) / haut (magenta).
const enchTier = computed(() =>
  maxEnchant.value >= 9 ? 'high' : maxEnchant.value >= 4 ? 'mid' : 'low',
);
// Compagnon (familier équipé) : emoji + teinte de la race, s'il y en a un.
const companion = computed(() => {
  const fam = props.equipped[FAMILIAR_SLOT];
  const sp = fam?.species ? familiarSpecies(fam.species) : undefined;
  return sp ? { emoji: sp.emoji, tint: sp.tint } : null;
});
const slotPips = computed(() =>
  SLOTS.map((slot: ItemSlot) => {
    const it = props.equipped[slot];
    return { slot, on: !!it, rarity: it?.rarity ?? 'G' };
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
/* Aura d'ENCHANT : halo + anneaux teintés par palier, intensité ∝ `--ei` (0..1). */
.ench-aura {
  transform-origin: 60px 70px;
}
.ench-aura.e-low {
  --ec: #ffd23f;
}
.ench-aura.e-mid {
  --ec: #ff9a3f;
}
.ench-aura.e-high {
  --ec: #ff5cd8;
}
.ench-glow {
  fill: var(--ec);
  opacity: calc(0.1 + var(--ei) * 0.4);
  filter: blur(6px);
  animation: ench-pulse 2.6s ease-in-out infinite;
}
.ench-ring {
  fill: none;
  stroke: var(--ec);
  stroke-width: calc(0.8 + var(--ei) * 2.4);
  opacity: calc(0.2 + var(--ei) * 0.5);
  animation: ench-pulse 2.6s ease-in-out infinite;
}
.ench-ring.r2 {
  opacity: calc(0.1 + var(--ei) * 0.35);
  animation-delay: 0.7s;
}
.spark {
  fill: var(--ec);
  animation: spark-tw 1.8s ease-in-out infinite;
}
.ench-sparks .spark:nth-child(2) {
  animation-delay: 0.45s;
}
.ench-sparks .spark:nth-child(3) {
  animation-delay: 0.9s;
}
.ench-sparks .spark:nth-child(4) {
  animation-delay: 1.35s;
}
@keyframes ench-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
  }
}
@keyframes spark-tw {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .aura,
  .body,
  .glint,
  .relic,
  .ench-glow,
  .ench-ring,
  .spark {
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
  transform-origin: 95px 109px;
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
  font-size: 34px;
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
/* Rangs G→SSS : couleur via --rk (posée par la classe r-*). */
.pip.on.r-G {
  --rk: #9a8f7e;
}
.pip.on.r-F {
  --rk: #8f9c86;
}
.pip.on.r-E {
  --rk: #6bd18a;
}
.pip.on.r-D {
  --rk: #4ec6d6;
}
.pip.on.r-C {
  --rk: #5a9bff;
}
.pip.on.r-B {
  --rk: #b07cff;
}
.pip.on.r-A {
  --rk: var(--accent);
}
.pip.on.r-S {
  --rk: #ff9a3f;
}
.pip.on.r-SS {
  --rk: #ff5b5b;
}
.pip.on.r-SSS {
  --rk: #ff5cd8;
}
.pip.on[class*='r-'] {
  fill: var(--rk, var(--dim));
}
</style>
