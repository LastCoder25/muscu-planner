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
      :style="{ top: `${3 + Math.min(1, a.progress) * 75}%` }"
    />

    <div class="cd-anvil" :class="pulseClass">
      <!-- ⚠️ `:key` sur l'INSTANT de la frappe : c'est le remplacement du nœud qui rejoue
           l'animation. Avec une simple classe, le marteau frappait UNE fois au premier
           tap et ne bougeait plus de toute la partie — la classe n'était jamais retirée. -->
      <span :key="pulse?.at ?? 0" class="cd-hammer hit">🔨</span>
      <div class="cd-line" />
    </div>
    <div
      v-for="n in sparks"
      :key="`${pulse?.at ?? 0}-${n}`"
      class="cd-spark"
      :style="sparkStyle(n)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { HoldSceneProps } from '@/lib/holdGames';

const props = defineProps<HoldSceneProps>();

const pulseClass = computed(() => {
  if (!props.pulse) return '';
  const v = props.pulse.verdict;
  return v === 'perfect' ? 'perfect' : v === 'wrong' ? 'hurt' : 'good';
});

/**
 * Les étincelles sont du décor. ⚠️ Le gate JS est NÉCESSAIRE ici, il ne double pas la
 * media query : sous `animation: none`, les cinq traits resteraient figés à l'écran à
 * pleine opacité au lieu de disparaître.
 */
const sparks = computed(() => (props.reduced || props.pulse?.verdict === 'wrong' ? 0 : 5));

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
/* ⚠️ Un FOND, pas des pointillés : au banc, deux bordures en tirets se confondaient avec
   le reste et les couloirs ne se lisaient pas. */
.cd-lane {
  background: color-mix(in srgb, var(--surface) 55%, transparent);
  border-radius: 14px;
}
.cd-mark {
  position: absolute;
  width: 34%;
  height: 18px;
  /* Centré sur sa position : sinon le marqueur imminent déborde SOUS la ligne de frappe. */
  transform: translateY(-50%);
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
/* ⚠️ La ligne D'ABORD, le marteau DESSOUS : au banc il flottait au-dessus de sa propre
   ligne de frappe, donc on ne savait plus où viser. */
.cd-anvil {
  position: absolute;
  left: 0;
  right: 0;
  top: 78%;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
}
.cd-line {
  width: 100%;
  height: 4px;
  border-radius: 2px;
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
  font-size: 38px;
  line-height: 1;
  margin-bottom: 2px;
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
