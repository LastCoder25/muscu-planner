<template>
  <transition name="cc-fade">
    <div v-if="show" class="cc-overlay" @click.self="$emit('close')">
      <div class="cc-flash" />
      <div class="cc-card">
        <!-- Onde radiale « voltage » -->
        <div class="cc-rings" aria-hidden="true">
          <span class="cc-ring" />
          <span class="cc-ring" />
          <span class="cc-ring" />
        </div>

        <div class="cc-trophy">🏆</div>
        <div class="cc-bolts" aria-hidden="true">
          <span>⚡</span><span>⚡</span><span>⚡</span><span>⚡</span>
        </div>

        <div class="cc-title font-display">Challenge terminé</div>
        <div class="cc-sub">{{ challenge?.exercise_name }}</div>

        <div class="cc-count font-display">
          {{ displayCount.toLocaleString('fr-FR') }}<span class="cc-unit">{{ unitLabel }}</span>
        </div>

        <div class="cc-stats">
          <div class="cc-stat">
            <b class="font-display">{{ challenge?.duration_days }}</b
            ><span>jours</span>
          </div>
          <div class="cc-stat">
            <b class="font-display">{{ stats.streak }}</b
            ><span>série</span>
          </div>
          <div class="cc-stat">
            <b class="font-display">{{ stats.completionPct }}%</b><span>complété</span>
          </div>
        </div>

        <div v-if="badges.length" class="cc-badges">
          <div
            v-for="(b, i) in badges"
            :key="b.code"
            class="cc-badge"
            :class="'r-' + b.rarity"
            :style="{ animationDelay: 1 + i * 0.18 + 's' }"
          >
            <q-icon :name="b.icon" size="20px" class="cc-badge-ic" />
            <span class="cc-badge-tx">{{ b.title }}</span>
            <span class="cc-badge-rar">{{ RARITY_LABEL[b.rarity] }}</span>
          </div>
        </div>

        <div class="cc-actions">
          <button class="cc-btn ghost" @click="$emit('see-success')">Mes succès</button>
          <button class="cc-btn" @click="$emit('close')">Continuer</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { challengeStats, type Challenge } from '@/lib/challenges';
import { achievementDef, RARITY_LABEL } from '@/data/achievements';

const props = defineProps<{
  show: boolean;
  challenge: Challenge | null;
  achievementCodes?: string[];
}>();
defineEmits<{ close: []; 'see-success': [] }>();

const unitLabel = computed(() => (props.challenge?.unit === 'time' ? ' sec' : ' reps'));
const stats = computed(() =>
  props.challenge ? challengeStats(props.challenge) : { streak: 0, completionPct: 0, totalDone: 0 },
);
const badges = computed(() =>
  (props.achievementCodes ?? [])
    .map((code) => achievementDef(code))
    .filter((d): d is NonNullable<typeof d> => !!d),
);

const displayCount = ref(0);
let raf: number | undefined;
const reduce =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function runCount(target: number) {
  if (raf) cancelAnimationFrame(raf);
  if (reduce) {
    displayCount.value = target;
    return;
  }
  const dur = 1300;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    displayCount.value = Math.round(target * eased);
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

watch(
  () => props.show,
  (v) => {
    if (v) {
      displayCount.value = 0;
      runCount(stats.value.totalDone);
    } else if (raf) {
      cancelAnimationFrame(raf);
    }
  },
);
</script>

<style scoped lang="scss">
.cc-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(3px);
}
.cc-flash {
  position: absolute;
  inset: 0;
  background: var(--accent);
  animation: cc-flash 0.5s ease-out forwards;
  pointer-events: none;
}
@keyframes cc-flash {
  0% {
    opacity: 0.5;
  }
  100% {
    opacity: 0;
  }
}
.cc-card {
  position: relative;
  width: 100%;
  max-width: 360px;
  padding: 28px 22px 22px;
  border-radius: 22px;
  border: 1px solid var(--accent);
  background: var(--surface);
  text-align: center;
  box-shadow: 0 0 60px rgba(255, 210, 63, 0.18);
  animation: cc-pop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
}
@keyframes cc-pop {
  0% {
    transform: scale(0.85) translateY(12px);
    opacity: 0;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

/* Onde radiale voltage */
.cc-rings {
  position: absolute;
  top: 58px;
  left: 50%;
  width: 0;
  height: 0;
  transform: translateX(-50%);
  pointer-events: none;
}
.cc-ring {
  position: absolute;
  top: 0;
  left: 0;
  width: 60px;
  height: 60px;
  margin: -30px 0 0 -30px;
  border: 2px solid var(--accent);
  border-radius: 50%;
  opacity: 0;
  animation: cc-ring 1.6s ease-out infinite;
  &:nth-child(2) {
    animation-delay: 0.4s;
  }
  &:nth-child(3) {
    animation-delay: 0.8s;
  }
}
@keyframes cc-ring {
  0% {
    transform: scale(0.3);
    opacity: 0.9;
  }
  100% {
    transform: scale(3.4);
    opacity: 0;
  }
}

.cc-trophy {
  position: relative;
  font-size: 56px;
  line-height: 1;
  animation: cc-trophy 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.5) 0.15s both;
  filter: drop-shadow(0 0 12px rgba(255, 210, 63, 0.6));
}
@keyframes cc-trophy {
  0% {
    transform: scale(0) rotate(-25deg);
  }
  100% {
    transform: scale(1) rotate(0);
  }
}
.cc-bolts {
  position: relative;
  height: 0;
  span {
    position: absolute;
    top: -46px;
    font-size: 15px;
    opacity: 0;
    animation: cc-bolt 0.9s ease-out 0.35s forwards;
    &:nth-child(1) {
      left: 26%;
      animation-delay: 0.35s;
    }
    &:nth-child(2) {
      left: 42%;
      animation-delay: 0.5s;
    }
    &:nth-child(3) {
      right: 42%;
      animation-delay: 0.62s;
    }
    &:nth-child(4) {
      right: 24%;
      animation-delay: 0.75s;
    }
  }
}
@keyframes cc-bolt {
  0% {
    transform: translateY(6px) scale(0.4);
    opacity: 0;
  }
  40% {
    opacity: 1;
  }
  100% {
    transform: translateY(-14px) scale(1);
    opacity: 0;
  }
}

.cc-title {
  margin-top: 14px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text);
}
.cc-sub {
  margin-top: 2px;
  font-size: 14px;
  color: var(--dim);
}
.cc-count {
  margin-top: 14px;
  font-size: 46px;
  font-weight: 700;
  line-height: 1;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.cc-unit {
  font-size: 18px;
  color: var(--dim);
}
.cc-stats {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}
.cc-stat {
  flex: 1;
  padding: 10px 4px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 2px;
  b {
    font-size: 20px;
    color: var(--text);
  }
  span {
    font-size: 11px;
    color: var(--dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}
.cc-badges {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cc-badge {
  --rar: var(--accent);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid var(--rar);
  background: color-mix(in srgb, var(--rar) 12%, transparent);
  opacity: 0;
  transform: translateY(8px);
  animation: cc-badge 0.45s ease-out both;
}
.cc-badge.r-common {
  --rar: var(--dim);
}
.cc-badge.r-rare {
  --rar: #5aa9e6;
}
.cc-badge.r-epic {
  --rar: #b57bff;
}
.cc-badge.r-legendary {
  --rar: var(--accent);
}
.cc-badge .cc-badge-ic {
  color: var(--rar);
}
.cc-badge-rar {
  margin-left: auto;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--rar);
}
@keyframes cc-badge {
  0% {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.cc-badge-ic {
  font-size: 20px;
}
.cc-badge-tx {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.cc-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}
.cc-btn {
  flex: 1;
  height: 48px;
  border: none;
  border-radius: 14px;
  background: var(--accent);
  color: var(--accent-ink);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  &.ghost {
    background: transparent;
    border: 1px solid var(--line);
    color: var(--text);
  }
}

.cc-fade-enter-active,
.cc-fade-leave-active {
  transition: opacity 0.3s ease;
}
.cc-fade-enter-from,
.cc-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .cc-flash,
  .cc-rings,
  .cc-bolts {
    display: none;
  }
  .cc-card,
  .cc-trophy,
  .cc-badge {
    animation: none;
  }
  .cc-badge {
    opacity: 1;
    transform: none;
  }
}
</style>
