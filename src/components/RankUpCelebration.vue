<template>
  <transition name="ru-fade">
    <div v-if="show" class="ru-overlay" @click.self="$emit('close')">
      <div class="ru-flash" :style="{ background: toColor }" />
      <div class="ru-card" :style="{ '--rank': toColor }">
        <div class="ru-rings" aria-hidden="true">
          <span class="ru-ring" />
          <span class="ru-ring" />
          <span class="ru-ring" />
        </div>

        <div class="ru-kicker font-display">Rang supérieur</div>

        <div class="ru-ranks">
          <RankBadge :rank="fromRank" :size="52" class="ru-from" />
          <q-icon name="arrow_forward" size="24px" class="ru-arrow" />
          <RankBadge :rank="toRank" :size="76" class="ru-to" />
        </div>

        <div class="ru-title font-display">Rang {{ toRank }} atteint !</div>
        <button class="ru-btn" @click="$emit('close')">Continuer</button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import RankBadge from '@/components/RankBadge.vue';
import { rankColor } from '@/data/ranks';

const props = defineProps<{ show: boolean; fromRank: string; toRank: string }>();
defineEmits<{ close: [] }>();
const toColor = computed(() => rankColor(props.toRank));
</script>

<style scoped lang="scss">
.ru-overlay {
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
.ru-flash {
  position: absolute;
  inset: 0;
  animation: ru-flash 0.5s ease-out forwards;
  pointer-events: none;
}
@keyframes ru-flash {
  0% {
    opacity: 0.5;
  }
  100% {
    opacity: 0;
  }
}
.ru-card {
  position: relative;
  width: 100%;
  max-width: 340px;
  padding: 30px 22px 22px;
  border-radius: 22px;
  border: 1px solid var(--rank);
  background: var(--surface);
  text-align: center;
  box-shadow: 0 0 60px color-mix(in srgb, var(--rank) 35%, transparent);
  animation: ru-pop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
}
@keyframes ru-pop {
  0% {
    transform: scale(0.85) translateY(12px);
    opacity: 0;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
.ru-rings {
  position: absolute;
  top: 96px;
  left: 50%;
  width: 0;
  height: 0;
  transform: translateX(-50%);
  pointer-events: none;
}
.ru-ring {
  position: absolute;
  top: 0;
  left: 0;
  width: 70px;
  height: 70px;
  margin: -35px 0 0 -35px;
  border: 2px solid var(--rank);
  border-radius: 50%;
  opacity: 0;
  animation: ru-ring 1.6s ease-out infinite;
  &:nth-child(2) {
    animation-delay: 0.4s;
  }
  &:nth-child(3) {
    animation-delay: 0.8s;
  }
}
@keyframes ru-ring {
  0% {
    transform: scale(0.3);
    opacity: 0.9;
  }
  100% {
    transform: scale(3.2);
    opacity: 0;
  }
}
.ru-kicker {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--dim);
}
.ru-ranks {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 16px 0 8px;
}
.ru-from {
  opacity: 0.5;
}
.ru-arrow {
  color: var(--dim);
}
.ru-to {
  animation: ru-badge 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.5) 0.2s both;
}
@keyframes ru-badge {
  0% {
    transform: scale(0) rotate(-15deg);
  }
  100% {
    transform: scale(1) rotate(0);
  }
}
.ru-title {
  font-size: 22px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text);
  margin-top: 8px;
}
.ru-btn {
  width: 100%;
  height: 48px;
  margin-top: 20px;
  border: none;
  border-radius: 14px;
  background: var(--rank);
  color: #15120e;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
}

.ru-fade-enter-active,
.ru-fade-leave-active {
  transition: opacity 0.3s ease;
}
.ru-fade-enter-from,
.ru-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .ru-flash,
  .ru-rings {
    display: none;
  }
  .ru-card,
  .ru-to {
    animation: none;
  }
}
</style>
