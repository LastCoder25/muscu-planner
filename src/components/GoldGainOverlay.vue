<template>
  <div class="gold-fx" aria-hidden="true">
    <div v-for="b in bursts" :key="b.id" class="gf-burst">
      <!-- pièces qui jaillissent -->
      <span v-for="i in COINS" :key="i" class="gf-coin" :style="coinStyle(b.id, i)">🪙</span>
      <!-- total gagné -->
      <div class="gf-amount font-display">+{{ b.amount }} 🪙</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue';
import { useGoldFx } from '@/composables/useGoldFx';

const { bursts, remove } = useGoldFx();

const COINS = 8; // nb de pièces projetées par éclat
const DURATION = 1300; // ms — doit couvrir l'animation la plus longue

const timers = new Map<number, ReturnType<typeof setTimeout>>();

// Chaque nouvel éclat s'auto-retire après son animation.
watch(
  () => bursts.value.map((b) => b.id),
  (ids) => {
    for (const id of ids) {
      if (timers.has(id)) continue;
      timers.set(
        id,
        setTimeout(() => {
          remove(id);
          timers.delete(id);
        }, DURATION),
      );
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
});

// Trajectoire pseudo-aléatoire mais DÉTERMINISTE (id+index) → pas de Math.random
// à chaque frame, chaque pièce part dans une direction propre.
function coinStyle(id: number, i: number): Record<string, string> {
  const seed = (id * 131 + i * 977) % 1000;
  const angle = (i / COINS) * Math.PI * 2 + (seed / 1000) * 0.8;
  const dist = 46 + (seed % 40); // px
  const dx = Math.cos(angle) * dist;
  const dy = -Math.abs(Math.sin(angle)) * dist - 30; // toujours vers le haut
  return {
    '--dx': `${dx.toFixed(0)}px`,
    '--dy': `${dy.toFixed(0)}px`,
    '--rot': `${(seed % 2 ? 1 : -1) * (120 + (seed % 180))}deg`,
    '--delay': `${(i % 4) * 30}ms`,
  };
}
</script>

<style scoped>
.gold-fx {
  position: fixed;
  inset: 0;
  z-index: 9600; /* au-dessus des modales de rapport/sac */
  pointer-events: none;
  overflow: hidden;
}
.gf-burst {
  position: absolute;
  left: 50%;
  top: 46%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
}
.gf-amount {
  font-size: 34px;
  font-weight: 700;
  color: #ffd23f;
  text-shadow:
    0 2px 10px rgba(0, 0, 0, 0.6),
    0 0 18px rgba(255, 210, 63, 0.55);
  animation: gf-pop 1.3s ease-out forwards;
  white-space: nowrap;
}
.gf-coin {
  position: absolute;
  left: 50%;
  top: 50%;
  font-size: 22px;
  will-change: transform, opacity;
  animation: gf-fly 1.1s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
  animation-delay: var(--delay);
}
@keyframes gf-pop {
  0% {
    transform: scale(0.5) translateY(8px);
    opacity: 0;
  }
  22% {
    transform: scale(1.18) translateY(0);
    opacity: 1;
  }
  40% {
    transform: scale(1) translateY(0);
  }
  78% {
    transform: scale(1) translateY(-6px);
    opacity: 1;
  }
  100% {
    transform: scale(0.96) translateY(-26px);
    opacity: 0;
  }
}
@keyframes gf-fly {
  0% {
    transform: translate(-50%, -50%) scale(0.6);
    opacity: 0;
  }
  18% {
    opacity: 1;
  }
  100% {
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1) rotate(var(--rot));
    opacity: 0;
  }
}
/* Accessibilité : pas de vol de pièces, juste le total qui apparaît/disparaît. */
@media (prefers-reduced-motion: reduce) {
  .gf-coin {
    display: none;
  }
  .gf-amount {
    animation: gf-fade 1.3s ease forwards;
  }
  @keyframes gf-fade {
    0% {
      opacity: 0;
    }
    15%,
    75% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
}
</style>
