<template>
  <!-- 🛡️ LE REMPART — tu tiens la position, ils pressent des deux côtés.
       Thématiquement c'est du gainage : on ne gagne pas, on TIENT. -->
  <div class="rp" :class="{ shake: shaking }">
    <div class="rp-wall" :class="pulseClass">
      <span class="rp-shield">🛡️</span>
    </div>
    <div v-for="a in beats" :key="a.beat.id" class="rp-foe" :class="a.beat.from" :style="style(a)">
      {{ foe(a.beat.id) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ActiveBeat, HoldSide, HoldVerdict } from '@/lib/holdGames';

const props = defineProps<{
  beats: ActiveBeat[];
  pulse: { side: HoldSide; verdict: HoldVerdict; at: number } | null;
  reduced: boolean;
}>();

const FOES = ['👹', '🐺', '💀', '👺', '🧟', '🦂'];
function foe(id: number) {
  return FOES[id % FOES.length];
}

/** Du bord vers le mur. Au-delà de 1 ils sont au contact : ils n'avancent plus. */
function style(a: ActiveBeat) {
  const p = Math.min(1, a.progress);
  return { [a.beat.from]: `${p * 42}%`, opacity: String(Math.min(1, a.progress * 3)) };
}

const pulseClass = computed(() => {
  if (!props.pulse) return '';
  const v = props.pulse.verdict;
  return v === 'wrong' ? 'hurt' : 'held';
});

const shaking = computed(() => !props.reduced && props.pulse?.verdict === 'wrong');
</script>

<style scoped>
.rp {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rp-wall {
  width: 12%;
  height: 58%;
  border-radius: 10px;
  background: var(--surface);
  border: 2px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 120ms linear,
    box-shadow 120ms linear;
}
.rp-wall.held {
  border-color: var(--d1);
  box-shadow: 0 0 22px color-mix(in srgb, var(--d1) 45%, transparent);
}
.rp-wall.hurt {
  border-color: var(--d4);
  box-shadow: 0 0 22px color-mix(in srgb, var(--d4) 50%, transparent);
}
.rp-shield {
  font-size: 30px;
}
.rp-foe {
  position: absolute;
  top: 50%;
  font-size: 34px;
  transform: translateY(-50%);
  will-change: left, right;
}
.rp-foe.right {
  transform: translateY(-50%) scaleX(-1);
}
@keyframes rp-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-6px);
  }
  75% {
    transform: translateX(6px);
  }
}
.rp.shake {
  animation: rp-shake 160ms linear;
}
@media (prefers-reduced-motion: reduce) {
  .rp.shake {
    animation: none;
  }
  .rp-wall {
    transition: none;
  }
}
</style>
