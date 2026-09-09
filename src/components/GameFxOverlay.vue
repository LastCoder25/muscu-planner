<template>
  <transition name="fx-fade">
    <div v-if="cur" :key="cur.id" class="fx-overlay" :class="'tier-' + tier" @click="dismiss">
      <div class="fx-flash" v-if="tier >= 3" />
      <div class="fx-card" :style="{ '--fx-color': color }">
        <!-- Anneau + particules qui jaillissent (nombre/intensité selon rareté) -->
        <div class="fx-ring" />
        <span
          v-for="p in particles"
          :key="p"
          class="fx-particle"
          :style="{ '--a': (p / particles) * 360 + 'deg', '--d': (p % 3) * 0.05 + 's' }"
        />
        <!-- COFFRE : dessiné, pas un emoji — un emoji ne s'ouvre pas. Le couvercle
             pivote sur sa charnière, un faisceau sort de la caisse. -->
        <svg v-if="cur.kind === 'chest'" class="fx-chest" viewBox="0 0 100 84" aria-hidden="true">
          <path class="fx-beam" d="M30 46 L18 0 L82 0 L70 46 Z" />
          <rect class="fx-box" x="14" y="42" width="72" height="38" rx="4" />
          <rect class="fx-band" x="44" y="42" width="12" height="38" />
          <g class="fx-lid">
            <path class="fx-box" d="M14 46 A36 24 0 0 1 86 46 Z" />
            <rect class="fx-band" x="44" y="28" width="12" height="18" />
          </g>
          <rect class="fx-lock" x="46" y="54" width="8" height="9" rx="2" />
        </svg>
        <div v-else class="fx-emoji">{{ cur.emoji }}</div>
        <div class="fx-title font-display">{{ cur.title }}</div>
        <div v-if="cur.subtitle" class="fx-sub">{{ cur.subtitle }}</div>
      </div>
      <div class="fx-tap">Toucher pour continuer</div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, watch, onBeforeUnmount } from 'vue';
import { useGameFx } from '@/composables/useGameFx';

const { queue, dismiss } = useGameFx();
const cur = computed(() => queue.value[0] ?? null);

const RARITY_COLOR: Record<string, string> = {
  common: '#9a8f7e',
  rare: '#4ec6d6',
  epic: '#b07cff',
  legendary: '#ffd23f',
  divin: '#ff5cd8',
};
const RARITY_TIER: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, divin: 4 };
const tier = computed(() => (cur.value?.rarity ? (RARITY_TIER[cur.value.rarity] ?? 2) : 2));
const color = computed(() =>
  cur.value?.rarity ? (RARITY_COLOR[cur.value.rarity] ?? '#ffd23f') : '#ffd23f',
);

const reduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Particules : plus la rareté est haute, plus il y en a (divin = explosion). 0 si
// mouvement réduit.
const particles = computed(() => (reduced ? 0 : 6 + tier.value * 6));

// Auto-dismiss : plus long pour les raretés hautes (on savoure le divin).
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  cur,
  (fx) => {
    if (timer) clearTimeout(timer);
    if (!fx) return;
    const ms = reduced ? 1100 : 1600 + tier.value * 350;
    timer = setTimeout(dismiss, ms);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<style scoped lang="scss">
.fx-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(3px);
  cursor: pointer;
}
.fx-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, var(--fx-color, #fff), transparent 60%);
  opacity: 0;
  animation: fx-flash 0.5s ease-out;
}
@keyframes fx-flash {
  0% {
    opacity: 0.5;
  }
  100% {
    opacity: 0;
  }
}
.fx-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 40px;
}
.fx-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 120px;
  height: 120px;
  margin: -60px 0 0 -60px;
  border-radius: 50%;
  border: 3px solid var(--fx-color, #ffd23f);
  opacity: 0;
  animation: fx-ring 0.9s ease-out;
}
@keyframes fx-ring {
  0% {
    transform: scale(0.3);
    opacity: 0.9;
  }
  100% {
    transform: scale(2.4);
    opacity: 0;
  }
}
.fx-particle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 7px;
  height: 7px;
  margin: -3.5px;
  border-radius: 50%;
  background: var(--fx-color, #ffd23f);
  transform: rotate(var(--a)) translateY(0);
  animation: fx-particle 0.85s ease-out var(--d, 0s) both;
}
@keyframes fx-particle {
  0% {
    opacity: 1;
    transform: rotate(var(--a)) translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: rotate(var(--a)) translateY(-140px) scale(0.4);
  }
}
/* ── Coffre qui s’ouvre ─────────────────────────────────────────────────
   Le couvercle pivote sur sa CHARNIÈRE (transform-origin en bas), pas sur son
   centre : c’est ce détail qui fait la différence entre un couvercle et une
   forme qui tourne. Le faisceau ne sort qu’APRÈS l’ouverture. */
.fx-chest {
  width: 132px;
  height: 111px;
  display: block;
  margin: 0 auto 6px;
  overflow: visible;
}
.fx-box {
  fill: #8a7856;
  stroke: #4a3d2b;
  stroke-width: 2;
}
.fx-band {
  fill: #5a4c36;
}
.fx-lock {
  fill: var(--fx-color, #ffd23f);
}
.fx-lid {
  transform-origin: 14px 46px;
  animation: chest-open 0.75s cubic-bezier(0.3, 1.6, 0.5, 1) 0.35s both;
}
.fx-beam {
  fill: var(--fx-color, #ffd23f);
  opacity: 0;
  transform-origin: 50px 46px;
  animation: chest-beam 1.1s ease-out 0.75s both;
}
@keyframes chest-open {
  0% {
    transform: rotate(0deg);
  }
  35% {
    transform: rotate(6deg);
  }
  100% {
    transform: rotate(-104deg);
  }
}
@keyframes chest-beam {
  0% {
    opacity: 0;
    transform: scaleY(0.2);
  }
  40% {
    opacity: 0.3;
    transform: scaleY(1);
  }
  100% {
    opacity: 0.12;
    transform: scaleY(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  /* État FINAL direct : le coffre est ouvert, sans le mouvement. */
  .fx-lid {
    animation: none;
    transform: rotate(-104deg);
  }
  .fx-beam {
    animation: none;
    opacity: 0.12;
  }
}
.fx-emoji {
  font-size: 84px;
  line-height: 1;
  filter: drop-shadow(0 0 18px var(--fx-color, #ffd23f));
  animation: fx-pop 0.6s cubic-bezier(0.2, 1.5, 0.4, 1) both;
}
@keyframes fx-pop {
  0% {
    transform: scale(0.2) rotate(-12deg);
    opacity: 0;
  }
  100% {
    transform: scale(1) rotate(0);
    opacity: 1;
  }
}
.fx-title {
  font-size: 26px;
  font-weight: 800;
  color: var(--fx-color, #ffd23f);
  text-align: center;
  animation: fx-rise 0.5s ease-out 0.15s both;
}
.fx-sub {
  font-size: 14px;
  color: var(--text);
  text-align: center;
  animation: fx-rise 0.5s ease-out 0.25s both;
}
@keyframes fx-rise {
  0% {
    transform: translateY(10px);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}
.fx-tap {
  position: absolute;
  bottom: 40px;
  font-size: 12px;
  color: var(--dim);
  animation: fx-blink 1.4s ease-in-out infinite 0.6s;
}
@keyframes fx-blink {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.8;
  }
}
.fx-fade-enter-active {
  transition: opacity 0.2s;
}
.fx-fade-leave-active {
  transition: opacity 0.3s;
}
.fx-fade-enter-from,
.fx-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .fx-ring,
  .fx-emoji,
  .fx-title,
  .fx-sub,
  .fx-flash,
  .fx-tap {
    animation: none;
  }
}
</style>
