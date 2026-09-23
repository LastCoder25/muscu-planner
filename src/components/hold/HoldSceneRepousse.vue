<template>
  <!-- 🛡️ LE REMPART — tu tiens la position, ils pressent des deux côtés.
       Thématiquement c'est du gainage : on ne gagne pas, on TIENT. -->
  <div class="rp" :class="{ shake: shaking }">
    <div class="rp-ground" />

    <!-- ⚠️ LARGE ET CRÉNELÉ, pas une barre : au banc, une bande verticale étroite se
         lisait comme un trait, pas comme une muraille qu'on défend. -->
    <div class="rp-wall" :class="pulseClass">
      <div class="rp-crenel" />
      <span class="rp-shield">🛡️</span>
    </div>

    <div v-for="a in beats" :key="a.beat.id" class="rp-foe" :class="a.beat.from" :style="style(a)">
      {{ foe(a.beat.id) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ActiveBeat, HoldSceneProps } from '@/lib/holdGames';

const props = defineProps<HoldSceneProps>();

const FOES = ['👹', '🐺', '💀', '👺', '🧟', '🦂'];
function foe(id: number) {
  return FOES[id % FOES.length];
}

/**
 * Du bord vers le mur. Au-delà de 1 ils sont au contact : ils n'avancent plus.
 * ⚠️ La course s'arrête AVANT le rempart (qui occupe 35-65 %), largeur de l'emoji
 * comprise : au banc, un ennemi arrivait à l'intérieur de la muraille.
 */
function style(a: ActiveBeat) {
  const p = Math.min(1, a.progress);
  return { [a.beat.from]: `${4 + p * 22}%`, opacity: String(Math.min(1, a.progress * 3)) };
}

const pulseClass = computed(() => {
  if (!props.pulse) return '';
  return props.pulse.verdict === 'wrong' ? 'hurt' : 'held';
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
/* Une ligne de sol : sans elle, les ennemis flottent et on ne lit pas la convergence. */
.rp-ground {
  position: absolute;
  left: 0;
  right: 0;
  top: 62%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--line) 18%, var(--line) 82%, transparent);
}
.rp-wall {
  position: absolute;
  /* ⚠️ ANCRÉ EXPLICITEMENT : un `position:absolute` sans `left` dans un conteneur flex se
     pose à sa « position statique », donc au coin — au banc, le rempart partait à gauche
     alors que le conteneur était centré. */
  left: 50%;
  transform: translateX(-50%);
  top: 30%;
  width: 30%;
  height: 32%;
  border-radius: 4px 4px 2px 2px;
  background: var(--surface);
  border: 2px solid var(--line);
  border-bottom: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 6px;
  transition:
    border-color 120ms linear,
    box-shadow 120ms linear;
}
/* Les créneaux : c'est eux qui disent « muraille » d'un coup d'œil. */
.rp-crenel {
  position: absolute;
  top: -9px;
  left: -2px;
  right: -2px;
  height: 9px;
  background: repeating-linear-gradient(90deg, var(--line) 0 9px, transparent 9px 18px);
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
  font-size: 26px;
}
.rp-foe {
  position: absolute;
  top: 62%;
  font-size: 40px;
  line-height: 1;
  transform: translateY(-100%);
  will-change: left, right;
}
.rp-foe.right {
  transform: translateY(-100%) scaleX(-1);
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
