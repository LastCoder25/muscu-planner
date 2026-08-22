<template>
  <svg class="avatar" :class="'p-' + profile" viewBox="0 0 120 148" role="img" :aria-label="label">
    <defs>
      <linearGradient id="av-skin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ecc79e" />
        <stop offset="1" stop-color="#c69468" />
      </linearGradient>
      <linearGradient id="av-cloth" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4b4038" />
        <stop offset="1" stop-color="#2c251e" />
      </linearGradient>
      <linearGradient id="av-leather" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6a5844" />
        <stop offset="1" stop-color="#3a2f24" />
      </linearGradient>
      <linearGradient id="av-metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#eef2f6" />
        <stop offset="0.5" stop-color="#b9c1cb" />
        <stop offset="1" stop-color="#7e8894" />
      </linearGradient>
    </defs>

    <!-- Aura de profil (respire) -->
    <circle class="aura" cx="60" cy="70" r="48" />
    <!-- Aura de PUISSANCE : de plus en plus visible selon le RANG le plus haut de
         l'équipement, teintée par palier, halo + anneaux + étincelles. -->
    <g
      v-if="maxRankIdx >= 0"
      class="ench-aura"
      :class="'e-' + enchTier"
      :style="{ '--ei': enchIntensity }"
    >
      <circle class="ench-glow" cx="60" cy="72" :r="40 + maxRankIdx * 2.4" />
      <circle class="ench-ring" cx="60" cy="72" :r="44 + maxRankIdx * 1.9" />
      <circle class="ench-ring r2" cx="60" cy="72" :r="50 + maxRankIdx * 1.6" />
      <g v-if="maxRankIdx >= 7" class="ench-sparks">
        <circle class="spark" cx="60" cy="20" r="2" />
        <circle class="spark" cx="100" cy="72" r="2" />
        <circle class="spark" cx="20" cy="72" r="2" />
        <circle class="spark" cx="60" cy="124" r="2" />
      </g>
    </g>

    <!-- CAPE (accessoire) : derrière le corps, teintée par la rareté, ondule. -->
    <g v-if="gear.accessory" class="cape" :style="{ '--rk': rankColor(gear.accessory.rarity) }">
      <path class="cape-cloth" d="M45 50 Q26 88 32 120 Q44 114 52 116 Q49 84 55 52 Z" />
      <path class="cape-cloth right" d="M75 50 Q94 88 88 120 Q76 114 68 116 Q71 84 65 52 Z" />
    </g>

    <!-- CORPS (idle : respire) -->
    <g class="body">
      <!-- jambes + bottes -->
      <path class="leg" d="M49 88 L48 116 Q48 122 53 122 L57 122 Q58 116 57 100 L56 88 Z" />
      <path class="leg" d="M71 88 L72 116 Q72 122 67 122 L63 122 Q62 116 63 100 L64 88 Z" />
      <path class="boot" d="M46 118 Q46 126 52 126 L60 126 L60 118 Q54 120 46 118 Z" />
      <path class="boot" d="M74 118 Q74 126 68 126 L60 126 L60 118 Q66 120 74 118 Z" />

      <!-- bras arrière (gauche) + main -->
      <path class="arm" d="M44 52 Q34 62 33 82 Q33 88 38 88 Q41 72 47 60 Z" />
      <circle class="hand" cx="35" cy="86" r="5" />

      <!-- torse (tunique de base) -->
      <path class="tunic" d="M42 50 Q40 72 46 92 L74 92 Q80 72 78 50 Q60 44 42 50 Z" />

      <!-- ARMURE (plastron + col), teintée par la rareté -->
      <g v-if="gear.armor" class="armor" :style="{ '--rk': rankColor(gear.armor.rarity) }">
        <path class="plate" d="M44 52 Q42 72 47 90 L73 90 Q78 72 76 52 Q60 47 44 52 Z" />
        <path class="plate-shine" d="M52 54 Q50 72 54 88 L58 88 Q56 70 58 55 Z" />
        <path class="collar" d="M50 49 Q60 55 70 49 L67 44 Q60 47 53 44 Z" />
      </g>

      <!-- ceinture -->
      <rect class="belt" x="45" y="86" width="30" height="6" rx="2" />
      <rect class="buckle" x="57" y="85" width="6" height="8" rx="1.5" />

      <!-- bras avant (droit) + main -->
      <path class="arm" d="M76 52 Q86 62 87 82 Q87 88 82 88 Q79 72 73 60 Z" />
      <circle class="hand" cx="85" cy="86" r="5" />

      <!-- ÉPAULIÈRES (armure) -->
      <g v-if="gear.armor" class="pauldrons" :style="{ '--rk': rankColor(gear.armor.rarity) }">
        <path class="pauldron" d="M39 51 Q33 49 31 56 Q30 61 36 62 Q42 60 44 54 Z" />
        <path class="pauldron" d="M81 51 Q87 49 89 56 Q90 61 84 62 Q78 60 76 54 Z" />
      </g>

      <!-- tête -->
      <path class="neck" d="M55 40 L65 40 L64 48 L56 48 Z" />
      <circle class="head" cx="60" cy="30" r="14" />
      <!-- cheveux / capuche teintés profil -->
      <path class="hair" d="M46 30 Q46 14 60 14 Q74 14 74 30 Q68 22 60 22 Q52 22 46 30 Z" />
      <!-- yeux (petits) -->
      <circle class="eye" cx="55" cy="31" r="1.3" />
      <circle class="eye" cx="65" cy="31" r="1.3" />

      <!-- ARME (si équipée) : épée dans la main droite, teintée par la rareté -->
      <g v-if="gear.weapon" class="weapon" :style="{ '--rk': rankColor(gear.weapon.rarity) }">
        <rect class="hilt" x="83" y="86" width="4" height="9" rx="1.5" />
        <rect class="guard" x="79" y="84" width="12" height="3" rx="1.5" />
        <path class="blade" d="M83.5 84 L83.5 44 Q85 40 86.5 44 L86.5 84 Z" />
        <path class="blade-edge" d="M85 82 L85 46 Q85.4 45 85.8 46 L85.8 82 Z" />
        <rect class="glint" x="84" y="46" width="2" height="12" rx="1" />
      </g>

      <!-- RELIQUE (orbe flottante, si équipée), teintée par la rareté -->
      <g v-if="gear.relic" class="relic" :style="{ '--rk': rankColor(gear.relic.rarity) }">
        <circle class="orb-glow" cx="28" cy="52" r="9" />
        <circle class="orb" cx="28" cy="52" r="6" />
        <circle class="orb-hi" cx="26" cy="50" r="2" />
      </g>
    </g>

    <!-- Familier (compagnon) : CLIQUABLE → ouvre l'inventaire des familiers (même à vide).
         Halo teinté + emoji de la race, flotte près du héros. -->
    <g
      class="familiar hotspot"
      role="button"
      tabindex="0"
      :aria-label="companion ? 'Familier — gérer' : 'Équiper un familier'"
      @click="emit('familiar-click')"
      @keydown.enter="emit('familiar-click')"
    >
      <ellipse class="fam-shadow" cx="97" cy="136" rx="15" ry="4" />
      <circle
        class="fam-glow"
        cx="97"
        cy="114"
        r="20"
        :style="{ fill: companion ? companion.tint : 'var(--dim, #9a8f7e)' }"
      />
      <text v-if="companion" class="fam-emoji" x="97" y="125" text-anchor="middle">
        {{ companion.emoji }}
      </text>
      <text v-else class="fam-emoji empty" x="97" y="124" text-anchor="middle">🐾</text>
      <circle class="hotspot-ring" cx="97" cy="114" r="18" />
    </g>

    <!-- Talent (bas-gauche) : CLIQUABLE → ouvre l'inventaire des talents. Icône du 1er
         talent équipé (ou ✨ si aucun). Miroir du familier. -->
    <g
      class="familiar talent-badge hotspot"
      role="button"
      tabindex="0"
      aria-label="Talents — gérer"
      @click="emit('talent-click')"
      @keydown.enter="emit('talent-click')"
    >
      <ellipse class="fam-shadow" cx="23" cy="136" rx="14" ry="4" />
      <circle class="fam-glow tal" cx="23" cy="114" r="18" />
      <text class="fam-emoji" :class="{ empty: !talentIcon }" x="23" y="124" text-anchor="middle">
        {{ talentIcon || '✨' }}
      </text>
      <circle class="hotspot-ring" cx="23" cy="114" r="16" />
    </g>

    <!-- Pips d'équipement (4 slots) -->
    <g class="slots">
      <circle
        v-for="(s, i) in slotPips"
        :key="s.slot"
        class="pip"
        :class="s.on ? 'on r-' + s.rarity : 'off'"
        :cx="18 + i * 28"
        cy="142"
        r="4"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
// Avatar procédural VECTORIEL (SVG) « paperdoll » : corps ombré + pièces d'équipement
// PAR SLOT (armure = plastron/épaulières/col, arme = épée, accessoire = cape, relique =
// orbe), teintées par la RARETÉ. Familier + aura d'enchant. Léger, theme-aware, aucun
// asset externe. Change visiblement selon l'équipement.
import { computed } from 'vue';
import {
  SLOTS,
  SLOT_LABEL,
  FAMILIAR_SLOT,
  RANK_COLOR,
  RANK_ORDER,
  type Equipped,
  type ItemSlot,
  type Rarity,
} from '@/lib/items';
import { familiarSpecies } from '@/data/familiars';

const props = defineProps<{
  profile: 'puissant' | 'agile' | 'polyvalent';
  equipped: Equipped;
  talentIcon?: string; // icône du 1er talent équipé (badge cliquable bas-gauche)
}>();
const emit = defineEmits<{ 'familiar-click': []; 'talent-click': [] }>();

const rankColor = (r: Rarity) => RANK_COLOR[r] ?? '#9a8f7e';
// Pièces d'équipement par slot (pour l'affichage des couches + teinte de rareté).
const gear = computed(() => ({
  armor: props.equipped.armor,
  weapon: props.equipped.weapon,
  accessory: props.equipped.accessory,
  relic: props.equipped.relic,
}));
// RANG le plus haut parmi l'équipement (les 4 slots gear) → pilote l'aura de puissance.
// (Remplace l'ancien pilotage par l'enchant, retiré : l'aura suit maintenant le grade.)
const maxRankIdx = computed(() => {
  let m = -1;
  for (const slot of SLOTS) {
    const r = props.equipped[slot]?.rarity;
    if (r) m = Math.max(m, RANK_ORDER.indexOf(r));
  }
  return m; // -1 si nu, sinon 0 (G) … 9 (SSS)
});
const enchIntensity = computed(() => Math.min(1, Math.max(0, maxRankIdx.value) / 9));
const enchTier = computed(() => {
  if (maxRankIdx.value >= 7) return 'high'; // S / SS / SSS
  return maxRankIdx.value >= 4 ? 'mid' : 'low'; // C / B / A
});
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
  opacity: 0.22;
  transform-origin: 60px 70px;
  animation: breathe 3.2s ease-in-out infinite;
}
@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.16;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.3;
  }
}
/* Idle : le corps respire/oscille doucement. */
.body {
  transform-origin: 60px 96px;
  animation: idle 3.4s ease-in-out infinite;
}
@keyframes idle {
  0%,
  100% {
    transform: translateY(0) scaleY(1);
  }
  50% {
    transform: translateY(-1.5px) scaleY(1.01);
  }
}

/* ── Corps ── */
.head {
  fill: url(#av-skin);
  stroke: #b07f56;
  stroke-width: 0.6;
}
.neck {
  fill: url(#av-skin);
}
.hair {
  fill: var(--accent);
}
.eye {
  fill: #2c2118;
}
.tunic {
  fill: url(#av-cloth);
  stroke: #241d16;
  stroke-width: 0.8;
}
.arm,
.leg {
  fill: url(#av-leather);
  stroke: #2c2318;
  stroke-width: 0.6;
}
.hand {
  fill: url(#av-skin);
}
.boot {
  fill: #2f2620;
  stroke: #1c160f;
  stroke-width: 0.6;
}
.belt {
  fill: #3a2c1d;
}
.buckle {
  fill: var(--accent);
}

/* ── Gear teinté par la rareté (var --rk) ── */
.armor .plate {
  fill: color-mix(in srgb, var(--rk) 60%, #2c251e);
  stroke: var(--rk);
  stroke-width: 1.2;
}
.armor .plate-shine {
  fill: #fff;
  opacity: 0.14;
}
.armor .collar {
  fill: color-mix(in srgb, var(--rk) 70%, #2c251e);
  stroke: var(--rk);
  stroke-width: 0.6;
}
.pauldrons .pauldron {
  fill: color-mix(in srgb, var(--rk) 72%, #201a14);
  stroke: var(--rk);
  stroke-width: 0.8;
}
.weapon .blade {
  fill: url(#av-metal);
  stroke: var(--rk);
  stroke-width: 0.7;
}
.weapon .blade-edge {
  fill: #fff;
  opacity: 0.5;
}
.weapon .hilt {
  fill: #3a2c1d;
}
.weapon .guard {
  fill: var(--rk);
}
.weapon .glint {
  fill: #fff;
  opacity: 0.7;
  animation: glint 2.8s ease-in-out infinite;
}
@keyframes glint {
  0%,
  70%,
  100% {
    opacity: 0;
    transform: translateY(0);
  }
  82% {
    opacity: 0.85;
    transform: translateY(30px);
  }
}
/* Cape (accessoire) : ondule doucement. */
.cape {
  transform-origin: 60px 52px;
  animation: cape-sway 4s ease-in-out infinite;
}
.cape-cloth {
  fill: color-mix(in srgb, var(--rk) 55%, #241d16);
  stroke: var(--rk);
  stroke-width: 0.8;
  opacity: 0.95;
}
@keyframes cape-sway {
  0%,
  100% {
    transform: skewX(0deg);
  }
  50% {
    transform: skewX(-2.5deg);
  }
}
/* Relique : orbe flottante lumineuse. */
.relic {
  animation: bob 2.6s ease-in-out infinite;
  transform-origin: 28px 52px;
}
.relic .orb {
  fill: var(--rk);
}
.relic .orb-glow {
  fill: var(--rk);
  opacity: 0.3;
  filter: blur(2px);
}
.relic .orb-hi {
  fill: #fff;
  opacity: 0.7;
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

/* Teinte de profil : puissant (rouge/force), agile (cyan). */
.avatar.p-puissant .hair,
.avatar.p-puissant .buckle {
  fill: #ff6a45;
}
.avatar.p-puissant .aura {
  stroke: #ff6a45;
}
.avatar.p-agile .hair,
.avatar.p-agile .buckle {
  fill: #4ec6d6;
}
.avatar.p-agile .aura {
  stroke: #4ec6d6;
}

/* ── Aura d'ENCHANT ── */
.ench-aura {
  transform-origin: 60px 72px;
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

/* Familier (compagnon) : halo tamisé + emoji, flotte doucement. */
.familiar {
  transform-origin: 97px 114px;
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
  font-size: 32px;
}
.talent-badge .fam-emoji {
  font-size: 26px;
}
.fam-emoji.empty {
  opacity: 0.55;
}
.fam-glow.tal {
  fill: var(--accent);
}
/* Zones cliquables (familier / talent) : curseur + petit anneau pointillé « gérable ». */
.hotspot {
  cursor: pointer;
}
.hotspot:focus {
  outline: none;
}
.hotspot-ring {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1;
  stroke-dasharray: 2 3;
  opacity: 0.45;
}
.hotspot:hover .hotspot-ring,
.hotspot:focus .hotspot-ring {
  opacity: 0.95;
  stroke-width: 1.6;
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
  .aura,
  .body,
  .glint,
  .relic,
  .cape,
  .familiar,
  .ench-glow,
  .ench-ring,
  .spark {
    animation: none;
  }
}

/* Pips (rangs G→SSS via --rk). */
.pip.off {
  fill: var(--line, #3a332a);
}
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
