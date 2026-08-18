<template>
  <transition name="xf-fade">
    <div v-if="ev" class="xp-fx" @click="dismiss">
      <div class="xf-title font-display">Progression 💪</div>
      <div class="xf-rings">
        <div v-for="(r, i) in ev.rings" :key="i" class="xf-ring" :style="{ '--d': i * 0.3 + 's' }">
          <svg viewBox="0 0 40 40" class="xf-svg">
            <circle class="xf-track" cx="20" cy="20" r="15.9155" />
            <circle
              class="xf-arc"
              cx="20"
              cy="20"
              r="15.9155"
              transform="rotate(-90 20 20)"
              :style="{ strokeDasharray: filled[i] + ' 100', transitionDelay: i * 0.3 + 's' }"
            />
            <text class="xf-emo" x="20" y="18" text-anchor="middle">{{ r.emoji }}</text>
            <text class="xf-lvl font-display" x="20" y="27" text-anchor="middle">
              {{ shown[i] }}
            </text>
          </svg>
          <div class="xf-label">{{ r.label }}</div>
          <div v-if="r.toLevel > r.fromLevel" class="xf-up">⬆ Niveau {{ r.toLevel }} !</div>
        </div>
      </div>
      <div class="xf-tap">Toucher pour continuer</div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useXpFx } from '@/composables/useXpFx';

const { current, dismiss } = useXpFx();
const ev = computed(() => current.value);

const filled = ref<number[]>([]); // avancement affiché de chaque anneau (0..100)
const shown = ref<number[]>([]); // niveau affiché de chaque anneau
let timers: ReturnType<typeof setTimeout>[] = [];
const clearTimers = () => {
  timers.forEach(clearTimeout);
  timers = [];
};

watch(
  ev,
  (e) => {
    clearTimers();
    if (!e) return;
    // Départ : chaque anneau à son avancement AVANT + niveau AVANT.
    filled.value = e.rings.map((r) => r.fromPct);
    shown.value = e.rings.map((r) => r.fromLevel);
    // Puis, en séquence (délai par anneau via transitionDelay CSS), on remplit vers
    // l'APRÈS et on bascule le numéro de niveau une fois la barre partie.
    timers.push(
      setTimeout(() => {
        filled.value = e.rings.map((r) => r.toPct);
      }, 60),
    );
    e.rings.forEach((r, i) => {
      if (r.toLevel > r.fromLevel)
        timers.push(setTimeout(() => (shown.value[i] = r.toLevel), 500 + i * 300));
    });
    // Auto-fermeture après le dernier remplissage (+ pause pour savourer).
    timers.push(setTimeout(dismiss, 1400 + e.rings.length * 300));
  },
  { immediate: true },
);
onBeforeUnmount(clearTimers);
</script>

<style scoped lang="scss">
.xp-fx {
  position: fixed;
  inset: 0;
  z-index: 8800;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(3px);
  cursor: pointer;
}
.xf-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--accent);
  letter-spacing: 1px;
}
.xf-rings {
  display: flex;
  gap: 34px;
}
.xf-ring {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  animation: xf-rise 0.4s ease-out var(--d, 0s) both;
}
.xf-svg {
  width: 110px;
  height: 110px;
}
.xf-track {
  fill: none;
  stroke: var(--surface-2, #2b241b);
  stroke-width: 3;
}
.xf-arc {
  fill: none;
  stroke: var(--accent);
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dasharray 1s ease-out;
}
.xf-emo {
  font-size: 9px;
}
.xf-lvl {
  font-size: 11px;
  font-weight: 700;
  fill: var(--accent);
}
.xf-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.xf-up {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  animation: xf-pop 0.5s cubic-bezier(0.2, 1.5, 0.4, 1) both 0.6s;
}
.xf-tap {
  position: absolute;
  bottom: 40px;
  font-size: 12px;
  color: var(--dim);
}
@keyframes xf-rise {
  0% {
    transform: translateY(14px);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}
@keyframes xf-pop {
  0% {
    transform: scale(0.4);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
.xf-fade-enter-active {
  transition: opacity 0.25s;
}
.xf-fade-leave-active {
  transition: opacity 0.35s;
}
.xf-fade-enter-from,
.xf-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .xf-arc {
    transition: none;
  }
  .xf-ring,
  .xf-up {
    animation: none;
  }
}
</style>
