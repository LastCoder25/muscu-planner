<template>
  <transition name="al-fade">
    <div v-if="show" class="al-overlay" @click.self="$emit('close')">
      <div class="al-flash" :style="{ background: tierColor }" />
      <div class="al-card" :style="{ '--tier': tierColor }">
        <div class="al-rings" aria-hidden="true">
          <span class="al-ring" />
          <span class="al-ring" />
          <span class="al-ring" />
        </div>

        <div class="al-kicker font-display">Niveau supérieur</div>

        <div class="al-levels">
          <AthleteBadge
            :level="fromLevel"
            :color="tierColor"
            :tier="tier"
            :size="48"
            class="al-from"
          />
          <q-icon name="arrow_forward" size="24px" class="al-arrow" />
          <AthleteBadge :level="toLevel" :color="tierColor" :tier="tier" :size="76" class="al-to" />
        </div>

        <div class="al-title font-display">Niveau {{ toLevel }} · {{ tier }}</div>
        <button class="al-btn" @click="$emit('close')">Continuer</button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import AthleteBadge from '@/components/AthleteBadge.vue';

defineProps<{
  show: boolean;
  fromLevel: number;
  toLevel: number;
  tier: string;
  tierColor: string;
}>();
defineEmits<{ close: [] }>();
</script>

<style scoped lang="scss">
.al-overlay {
  position: fixed;
  inset: 0;
  z-index: 3100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(3px);
}
.al-flash {
  position: absolute;
  inset: 0;
  animation: al-flash 0.5s ease-out forwards;
  pointer-events: none;
}
@keyframes al-flash {
  0% {
    opacity: 0.5;
  }
  100% {
    opacity: 0;
  }
}
.al-card {
  position: relative;
  width: 100%;
  max-width: 340px;
  padding: 30px 22px 22px;
  border-radius: 22px;
  border: 1px solid var(--tier);
  background: var(--surface);
  text-align: center;
  box-shadow: 0 0 60px color-mix(in srgb, var(--tier) 35%, transparent);
  animation: al-pop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
}
@keyframes al-pop {
  0% {
    transform: scale(0.85) translateY(12px);
    opacity: 0;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
.al-rings {
  position: absolute;
  top: 96px;
  left: 50%;
  width: 0;
  height: 0;
  transform: translateX(-50%);
  pointer-events: none;
}
.al-ring {
  position: absolute;
  top: 0;
  left: 0;
  width: 70px;
  height: 70px;
  margin: -35px 0 0 -35px;
  border: 2px solid var(--tier);
  border-radius: 50%;
  opacity: 0;
  animation: al-ring 1.6s ease-out infinite;
  &:nth-child(2) {
    animation-delay: 0.4s;
  }
  &:nth-child(3) {
    animation-delay: 0.8s;
  }
}
@keyframes al-ring {
  0% {
    transform: scale(0.3);
    opacity: 0.9;
  }
  100% {
    transform: scale(3.2);
    opacity: 0;
  }
}
.al-kicker {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--dim);
}
.al-levels {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 16px 0 8px;
}
.al-from {
  opacity: 0.5;
}
.al-arrow {
  color: var(--dim);
}
.al-to {
  animation: al-badge 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.5) 0.2s both;
}
@keyframes al-badge {
  0% {
    transform: scale(0) rotate(-15deg);
  }
  100% {
    transform: scale(1) rotate(0);
  }
}
.al-title {
  font-size: 20px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text);
  margin-top: 8px;
}
.al-btn {
  width: 100%;
  height: 48px;
  margin-top: 20px;
  border: none;
  border-radius: 14px;
  background: var(--tier);
  color: #15120e;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
}

.al-fade-enter-active,
.al-fade-leave-active {
  transition: opacity 0.3s ease;
}
.al-fade-enter-from,
.al-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .al-flash,
  .al-rings {
    display: none;
  }
  .al-card,
  .al-to {
    animation: none;
  }
}
</style>
