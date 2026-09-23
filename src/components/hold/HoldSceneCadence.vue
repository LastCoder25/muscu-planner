<template>
  <!-- 🔨 LA FORGE — tu frappes l'enclume en cadence.
       ⚠️ Le mouvement est LINÉAIRE et la ligne de frappe fixe : c'est ce qui permet
       d'anticiper, donc ce qui fait qu'il s'agit d'un jeu de rythme et pas d'un jeu de
       réflexe. Un easing « qui fait joli » ruinerait le seul intérêt du jeu. -->
  <div class="cd">
    <div class="cd-lanes">
      <div class="cd-lane" />
      <div class="cd-lane" />
    </div>

    <div
      v-for="a in beats"
      :key="a.beat.id"
      class="cd-mark"
      :class="[a.beat.from, { near: a.progress > 0.88 }]"
      :style="{ top: `${Math.min(1, a.progress) * 78}%` }"
    />

    <div class="cd-anvil" :class="pulseClass">
      <span class="cd-hammer" :class="{ hit: recent }">🔨</span>
      <div class="cd-line" />
    </div>
    <div v-for="n in sparks" :key="n" class="cd-spark" :style="sparkStyle(n)" />
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

const recent = computed(() => !!props.pulse);

const pulseClass = computed(() => {
  if (!props.pulse) return '';
  const v = props.pulse.verdict;
  return v === 'perfect' ? 'perfect' : v === 'wrong' ? 'hurt' : 'good';
});

/** Les étincelles ne sont que du décor : aucune sur mouvement réduit. */
const sparks = computed(() =>
  props.reduced || props.pulse?.verdict === 'wrong' ? [] : [1, 2, 3, 4, 5],
);

function sparkStyle(n: number) {
  const angle = -120 + n * 15;
  return {
    '--a': `${angle}deg`,
    left: props.pulse?.side === 'left' ? '34%' : '66%',
  } as Record<string, string>;
}
</script>

<style scoped>
.cd {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.cd-lanes {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 0 14px;
}
.cd-lane {
  border-left: 1px dashed var(--line);
  border-right: 1px dashed var(--line);
  border-radius: 12px;
}
.cd-mark {
  position: absolute;
  width: 34%;
  height: 16px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 55%, var(--surface));
  border: 1px solid var(--accent);
  will-change: top;
}
.cd-mark.left {
  left: 8%;
}
.cd-mark.right {
  right: 8%;
}
/* Le marqueur s'allume juste avant la ligne : c'est le signal d'anticipation. */
.cd-mark.near {
  background: var(--accent);
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 60%, transparent);
}
.cd-anvil {
  position: absolute;
  left: 0;
  right: 0;
  top: 78%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.cd-line {
  width: 100%;
  height: 3px;
  background: var(--line);
  transition: background 100ms linear;
}
.cd-anvil.perfect .cd-line {
  background: var(--d1);
}
.cd-anvil.good .cd-line {
  background: var(--accent);
}
.cd-anvil.hurt .cd-line {
  background: var(--d4);
}
.cd-hammer {
  font-size: 30px;
  transform-origin: 80% 80%;
}
.cd-hammer.hit {
  animation: cd-strike 140ms ease-out;
}
@keyframes cd-strike {
  0% {
    transform: rotate(-26deg);
  }
  60% {
    transform: rotate(6deg);
  }
  100% {
    transform: rotate(0deg);
  }
}
.cd-spark {
  position: absolute;
  top: 78%;
  width: 3px;
  height: 12px;
  background: var(--accent);
  border-radius: 2px;
  animation: cd-spark 320ms ease-out forwards;
  transform: rotate(var(--a));
}
@keyframes cd-spark {
  0% {
    opacity: 1;
    translate: 0 0;
  }
  100% {
    opacity: 0;
    translate: 0 -34px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cd-hammer.hit,
  .cd-spark {
    animation: none;
  }
  .cd-line {
    transition: none;
  }
}
</style>
