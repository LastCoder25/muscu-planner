<template>
  <svg
    v-if="pattern"
    class="ex-anim"
    :viewBox="`0 0 100 100`"
    :style="{ width: size + 'px', height: size + 'px' }"
    role="img"
    :aria-label="`Animation : ${title}`"
  >
    <!-- Mobilier / appuis selon l'ancrage -->
    <line
      v-if="showFloor"
      class="fx-struct"
      x1="8"
      :y1="FLOOR_Y"
      x2="92"
      :y2="FLOOR_Y"
    />
    <line v-if="pattern.anchor === 'hang'" class="fx-struct" x1="14" :y1="BAR_Y" x2="86" :y2="BAR_Y" />
    <rect
      v-if="pattern.anchor === 'supine'"
      class="fx-fill"
      x="24"
      :y="BENCH_Y"
      width="56"
      height="6"
      rx="2"
    />
    <rect
      v-if="pattern.anchor === 'seated'"
      class="fx-fill"
      x="38"
      :y="SEAT_Y"
      width="26"
      height="6"
      rx="2"
    />
    <template v-if="pattern.anchor === 'dip'">
      <line class="fx-struct" x1="10" :y1="DIPBAR_Y" x2="40" :y2="DIPBAR_Y" />
      <line class="fx-struct" x1="60" :y1="DIPBAR_Y" x2="90" :y2="DIPBAR_Y" />
    </template>

    <!-- Segments du corps -->
    <g class="fx-body">
      <line :x1="j.hip[0]" :y1="j.hip[1]" :x2="j.shoulder[0]" :y2="j.shoulder[1]" class="fx-torso" />
      <line :x1="j.hip[0]" :y1="j.hip[1]" :x2="j.knee[0]" :y2="j.knee[1]" />
      <line :x1="j.knee[0]" :y1="j.knee[1]" :x2="j.ankle[0]" :y2="j.ankle[1]" />
      <line :x1="j.ankle[0]" :y1="j.ankle[1]" :x2="j.toe[0]" :y2="j.toe[1]" class="fx-foot" />
      <line :x1="j.shoulder[0]" :y1="j.shoulder[1]" :x2="j.elbow[0]" :y2="j.elbow[1]" />
      <line :x1="j.elbow[0]" :y1="j.elbow[1]" :x2="j.hand[0]" :y2="j.hand[1]" />
      <circle :cx="j.head[0]" :cy="j.head[1]" :r="j.headR" class="fx-head" />
    </g>

    <!-- Accessoire tenu -->
    <template v-if="pattern.prop === 'barbell'">
      <line
        class="fx-prop"
        :x1="j.hand[0] - 17"
        :y1="j.hand[1]"
        :x2="j.hand[0] + 17"
        :y2="j.hand[1]"
      />
      <rect class="fx-prop-f" :x="j.hand[0] - 19" :y="j.hand[1] - 4" width="4" height="8" rx="1" />
      <rect class="fx-prop-f" :x="j.hand[0] + 15" :y="j.hand[1] - 4" width="4" height="8" rx="1" />
    </template>
    <rect
      v-else-if="pattern.prop === 'dumbbell'"
      class="fx-prop-f"
      :x="j.hand[0] - 4"
      :y="j.hand[1] - 3"
      width="8"
      height="6"
      rx="1.5"
    />
  </svg>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import {
  jointsFor,
  lerpPose,
  FLOOR_Y,
  BAR_Y,
  BENCH_Y,
  SEAT_Y,
  DIPBAR_Y,
  type Joints,
} from '@/lib/figure';
import { PATTERNS, patternFor } from '@/data/exercisePatterns';

const props = withDefaults(
  defineProps<{
    exerciseId?: string;
    muscle?: string | null;
    patternKey?: string;
    size?: number;
    play?: boolean;
    title?: string;
  }>(),
  { size: 120, play: true, muscle: null, title: 'exercice' },
);

const pattern = computed(() => {
  if (props.patternKey) return PATTERNS[props.patternKey] ?? null;
  return patternFor(props.exerciseId ?? '', props.muscle ?? null);
});

// Pas de sol pour les mouvements suspendus (traction, relevé de jambes).
const showFloor = computed(() => pattern.value != null && pattern.value.anchor !== 'hang');

const reduce =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const t = ref(reduce ? 0.5 : 0);
const j = computed<Joints>(() => {
  const p = pattern.value;
  if (!p) return jointsFor({ torso: 0, shoulder: 0, elbow: 0, hip: 0, knee: 0 }, 'stand');
  return jointsFor(lerpPose(p.a, p.b, t.value), p.anchor);
});

let raf = 0;
let start = 0;
function frame(now: number) {
  if (!start) start = now;
  const period = pattern.value?.period ?? 900;
  const elapsed = (now - start) % (2 * period);
  const raw = elapsed <= period ? elapsed / period : 2 - elapsed / period;
  // easing in-out (cosine)
  t.value = 0.5 - 0.5 * Math.cos(raw * Math.PI);
  raf = requestAnimationFrame(frame);
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  start = 0;
}
function begin() {
  stop();
  if (reduce || !props.play || !pattern.value) {
    t.value = reduce ? 0.5 : t.value;
    return;
  }
  raf = requestAnimationFrame(frame);
}

onMounted(begin);
onBeforeUnmount(stop);
watch(
  () => [props.play, props.exerciseId, props.patternKey, props.muscle],
  () => begin(),
);
</script>

<style scoped>
.ex-anim {
  display: block;
}
.fx-struct {
  stroke: var(--dim);
  stroke-width: 2;
  stroke-linecap: round;
  opacity: 0.6;
}
.fx-fill {
  fill: var(--line);
}
.fx-body line {
  stroke: var(--text);
  stroke-width: 4.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.fx-body .fx-torso {
  stroke-width: 5.4;
}
.fx-body .fx-foot {
  stroke-width: 3.2;
}
.fx-head {
  fill: var(--surface);
  stroke: var(--text);
  stroke-width: 3.4;
}
.fx-prop {
  stroke: var(--accent);
  stroke-width: 2.6;
  stroke-linecap: round;
}
.fx-prop-f {
  fill: var(--accent);
}
</style>
