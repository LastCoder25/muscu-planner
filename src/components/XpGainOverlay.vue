<template>
  <transition name="xf-fade">
    <div v-if="ev" class="xp-fx" @click="dismiss">
      <div class="xf-title font-display">Progression 💪</div>
      <div class="xf-rings">
        <div
          v-for="(r, i) in ev.rings"
          :key="ev.id + '-' + i"
          class="xf-ring"
          :class="{ filling: st[i]?.filling, popped: st[i]?.popped }"
          :style="{ '--c': r.color || 'var(--accent)', '--d': i * 0.15 + 's' }"
        >
          <div class="xf-disc">
            <svg viewBox="0 0 40 40" class="xf-svg">
              <circle class="xf-track" cx="20" cy="20" r="15.9155" />
              <circle
                class="xf-arc"
                cx="20"
                cy="20"
                r="15.9155"
                transform="rotate(-90 20 20)"
                :style="{ strokeDasharray: (st[i]?.pct ?? 0) + ' 100' }"
              />
              <circle
                v-if="(st[i]?.pct ?? 0) > 0.5"
                class="xf-tip"
                :cx="tip(st[i]?.pct ?? 0).x"
                :cy="tip(st[i]?.pct ?? 0).y"
                r="1.6"
              />
              <text class="xf-emo" x="20" y="18" text-anchor="middle">{{ r.emoji }}</text>
              <text class="xf-lvl font-display" x="20" y="27.5" text-anchor="middle">
                {{ st[i]?.level ?? r.fromLevel }}
              </text>
            </svg>
            <!-- Passage de niveau : éclair + gerbe. Clé = nombre de passages, pour que
                 l'animation reparte à chaque niveau franchi. -->
            <template v-if="(st[i]?.bursts ?? 0) > 0">
              <div :key="'fl' + st[i]!.bursts" class="xf-flash" />
              <div :key="'bu' + st[i]!.bursts" class="xf-burst">
                <span
                  v-for="k in SPARKS"
                  :key="k"
                  class="xf-spark"
                  :style="{ '--a': (k * 360) / SPARKS + 'deg', '--r': 58 + (k % 3) * 12 + 'px' }"
                />
              </div>
            </template>
          </div>
          <div class="xf-label">{{ r.label }}</div>
          <!-- Le chiffre n'apparaît qu'au tour de l'anneau : un « +0 XP » en attente se lit comme
               « rien gagné ». -->
          <div v-if="r.gain" class="xf-gain font-display" :class="{ on: st[i]?.started }">+{{ st[i]?.gain ?? 0 }} XP</div>
          <div v-if="(st[i]?.bursts ?? 0) > 0" :key="'up' + st[i]!.bursts" class="xf-up">
            ⬆ Niveau {{ st[i]?.level }} !
          </div>
        </div>
      </div>
      <div class="xf-tap">Toucher pour continuer</div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useXpFx, xpSegments, type XpRing } from '@/composables/useXpFx';

const { current, dismiss } = useXpFx();
const ev = computed(() => current.value);

const SPARKS = 14;
const SEG_MS = 850; // durée d'un tronçon d'arc
const LEVEL_PAUSE_MS = 520; // temps suspendu au passage de niveau (éclair + gerbe)
const RING_GAP_MS = 350; // l'anneau suivant démarre après le précédent
const HOLD_MS = 1700; // on savoure avant de refermer

interface RingState {
  pct: number;
  level: number;
  gain: number;
  bursts: number;
  filling: boolean;
  popped: boolean;
  started: boolean;
}
const st = ref<RingState[]>([]);

/** Bout de l'arc, pour y poser l'étincelle qui le suit. */
function tip(pct: number) {
  const a = ((pct * 3.6 - 90) * Math.PI) / 180;
  return { x: 20 + 15.9155 * Math.cos(a), y: 20 + 15.9155 * Math.sin(a) };
}

let raf = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
function stop() {
  cancelAnimationFrame(raf);
  clearTimeout(closeTimer);
}

/** Le déroulé d'un anneau : chaque tronçon d'arc, avec une pause après chaque
 *  passage de niveau. Rend sa durée totale, depuis son départ. */
function plan(r: XpRing) {
  const segs = xpSegments(r);
  let t = 0;
  const steps = segs.map((s, k) => {
    const start = t;
    t += SEG_MS;
    const levelUp = k < segs.length - 1; // chaque tronçon sauf le dernier finit à 100 %
    if (levelUp) t += LEVEL_PAUSE_MS;
    return { ...s, start, levelUp };
  });
  return { steps, total: t };
}

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

watch(
  ev,
  (e) => {
    stop();
    if (!e) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      // État final, sans mouvement.
      st.value = e.rings.map((r) => ({
        pct: r.toPct,
        level: r.toLevel,
        gain: r.gain ?? 0,
        bursts: 0,
        filling: false,
        popped: false,
        started: true,
      }));
      closeTimer = setTimeout(dismiss, HOLD_MS + 800);
      return;
    }
    st.value = e.rings.map((r) => ({
      pct: r.fromPct,
      level: r.fromLevel,
      gain: 0,
      bursts: 0,
      filling: false,
      popped: false,
      started: false,
    }));
    const plans = e.rings.map(plan);
    const starts: number[] = [];
    let acc = 350; // le temps que les anneaux apparaissent
    plans.forEach((p) => {
      starts.push(acc);
      acc += p.total + RING_GAP_MS;
    });
    const end = acc - RING_GAP_MS;
    const t0 = performance.now();

    const frame = (now: number) => {
      const el = now - t0;
      e.rings.forEach((r, i) => {
        const s = st.value[i]!;
        const p = plans[i]!;
        const local = el - starts[i]!;
        if (local < 0) return;
        s.started = true;
        const done = local >= p.total;
        // Tronçon courant (ou le dernier une fois terminé).
        let step = p.steps[p.steps.length - 1]!;
        let crossed = 0;
        for (const x of p.steps) {
          if (local < x.start + SEG_MS) {
            step = x;
            break;
          }
          if (x.levelUp) crossed++;
        }
        const k = Math.min(1, Math.max(0, (local - step.start) / SEG_MS));
        s.pct = done ? r.toPct : step.from + (step.to - step.from) * easeOut(k);
        s.filling = !done && local < step.start + SEG_MS;
        // Un niveau franchi : le numéro change, éclair + gerbe (une seule fois chacun).
        if (crossed > s.bursts) {
          s.bursts = crossed;
          s.level = Math.min(r.toLevel, r.fromLevel + crossed);
          s.popped = true;
        }
        if (done) s.level = r.toLevel;
        if (r.gain) s.gain = Math.round(r.gain * easeOut(Math.min(1, local / p.total)));
      });
      if (el < end) raf = requestAnimationFrame(frame);
      else closeTimer = setTimeout(dismiss, HOLD_MS);
    };
    raf = requestAnimationFrame(frame);
  },
  { immediate: true },
);
onBeforeUnmount(stop);
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
  background: var(--veil); // opaque : la page ne se relit pas à travers (app.scss)
  cursor: pointer;
  overflow: hidden;
}
.xf-title {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--accent);
  animation: xf-title-in 0.5s cubic-bezier(0.2, 1.4, 0.4, 1) both;
  text-shadow: 0 0 18px color-mix(in srgb, var(--accent) 55%, transparent);
}
.xf-rings {
  display: flex;
  gap: 28px;
}
.xf-ring {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  animation: xf-rise 0.45s ease-out var(--d, 0s) both;
}
.xf-disc {
  position: relative;
  width: 120px;
  height: 120px;
}
.xf-svg {
  width: 120px;
  height: 120px;
  overflow: visible;
}
// Halo coloré derrière l'anneau : il respire pendant le remplissage.
.xf-disc::before {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--c) 35%, transparent), transparent 70%);
  opacity: 0.35;
  transition: opacity 0.3s;
}
.xf-ring.filling .xf-disc::before {
  opacity: 1;
  animation: xf-breathe 0.9s ease-in-out infinite;
}
.xf-track {
  fill: none;
  stroke: var(--surface-2, #2b241b);
  stroke-width: 3.2;
}
.xf-arc {
  fill: none;
  stroke: var(--c);
  stroke-width: 3.2;
  stroke-linecap: round;
  filter: drop-shadow(0 0 1.6px var(--c));
}
.xf-tip {
  fill: #fff;
  filter: drop-shadow(0 0 1.8px var(--c)) drop-shadow(0 0 3px var(--c));
  opacity: 0;
}
.xf-ring.filling .xf-tip {
  opacity: 1;
  animation: xf-twinkle 0.35s ease-in-out infinite alternate;
}
.xf-emo {
  font-size: 9px;
}
.xf-lvl {
  font-size: 11px;
  font-weight: 700;
  fill: var(--c);
}
.xf-ring.popped .xf-svg {
  animation: xf-pop-ring 0.55s cubic-bezier(0.2, 1.6, 0.4, 1);
}
.xf-flash {
  position: absolute;
  inset: -20px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff 0%, color-mix(in srgb, var(--c) 70%, transparent) 30%, transparent 65%);
  pointer-events: none;
  animation: xf-flash 0.6s ease-out forwards;
}
.xf-burst {
  position: absolute;
  left: 50%;
  top: 50%;
  pointer-events: none;
}
.xf-spark {
  position: absolute;
  width: 7px;
  height: 7px;
  margin: -3.5px 0 0 -3.5px;
  border-radius: 50%;
  background: var(--c);
  box-shadow: 0 0 8px var(--c), 0 0 2px #fff;
  animation: xf-spark 0.8s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
}
.xf-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.xf-gain {
  font-size: 22px;
  font-weight: 800;
  color: var(--c);
  text-shadow: 0 0 12px color-mix(in srgb, var(--c) 55%, transparent);
  font-variant-numeric: tabular-nums;
  opacity: 0;
  transform: scale(0.6);
  transition:
    opacity 0.25s,
    transform 0.35s cubic-bezier(0.2, 1.6, 0.4, 1);
}
.xf-gain.on {
  opacity: 1;
  transform: none;
}
.xf-up {
  font-size: 13px;
  font-weight: 800;
  color: #fff;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--c);
  box-shadow: 0 0 14px var(--c);
  animation: xf-pop 0.5s cubic-bezier(0.2, 1.6, 0.4, 1) both;
}
.xf-tap {
  position: absolute;
  bottom: 40px;
  font-size: 12px;
  color: var(--dim);
}
@keyframes xf-title-in {
  0% {
    transform: scale(0.6);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
@keyframes xf-rise {
  0% {
    transform: translateY(16px) scale(0.9);
    opacity: 0;
  }
  100% {
    transform: none;
    opacity: 1;
  }
}
@keyframes xf-breathe {
  0%,
  100% {
    transform: scale(0.92);
  }
  50% {
    transform: scale(1.08);
  }
}
@keyframes xf-twinkle {
  from {
    transform-box: fill-box;
    transform-origin: center;
    transform: scale(0.8);
  }
  to {
    transform-box: fill-box;
    transform-origin: center;
    transform: scale(1.3);
  }
}
@keyframes xf-pop-ring {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes xf-flash {
  0% {
    transform: scale(0.4);
    opacity: 1;
  }
  100% {
    transform: scale(1.4);
    opacity: 0;
  }
}
@keyframes xf-spark {
  0% {
    transform: rotate(var(--a)) translateX(10px) scale(1);
    opacity: 1;
  }
  100% {
    transform: rotate(var(--a)) translateX(var(--r)) scale(0.2);
    opacity: 0;
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
  .xf-title,
  .xf-ring,
  .xf-up,
  .xf-disc::before {
    animation: none !important;
  }
}
</style>
