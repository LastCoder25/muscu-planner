<template>
  <transition name="ld-fade">
    <div v-if="show" class="game-loader">
      <div class="ld-icon">{{ icon }}</div>
      <div class="ld-label font-display">{{ label }}</div>
      <div class="ld-bar"><span class="ld-fill" /></div>
    </div>
  </transition>
</template>

<script setup lang="ts">
// Écran de chargement THÉMATIQUE bref, montré à l'ouverture d'une activité
// (Labyrinthe, carte d'expédition…) pour rendre l'entrée immersive. Le parent
// pilote `show` (généralement true au mount puis false après ~700 ms / data prête).
withDefaults(defineProps<{ show: boolean; icon?: string; label?: string }>(), {
  icon: '⚔️',
  label: 'Chargement…',
});
</script>

<style scoped lang="scss">
.game-loader {
  position: fixed;
  inset: 0;
  z-index: 8500;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: var(--bg);
}
.ld-icon {
  font-size: 64px;
  line-height: 1;
  animation: ld-bob 1.1s ease-in-out infinite;
  filter: drop-shadow(0 0 14px var(--accent));
}
@keyframes ld-bob {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-8px) scale(1.06);
  }
}
.ld-label {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 1px;
}
.ld-bar {
  width: 160px;
  height: 5px;
  border-radius: 999px;
  background: var(--surface-2, #2b241b);
  overflow: hidden;
}
.ld-fill {
  display: block;
  height: 100%;
  width: 40%;
  border-radius: 999px;
  background: var(--accent);
  animation: ld-slide 0.9s ease-in-out infinite;
}
@keyframes ld-slide {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(320%);
  }
}
.ld-fade-leave-active {
  transition: opacity 0.4s;
}
.ld-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ld-icon,
  .ld-fill {
    animation: none;
  }
}
</style>
