<template>
  <!-- ⛵ LA TRAVERSÉE, à la place de la carte (demandé) : la mer, le bateau qui avance au fil du
       temps réel, l'île quittée qui s'éloigne et celle d'arrivée qui grandit — dans le ciel et
       les effets de l'île de destination (`crossingTheme`). Le compte à rebours dit quand on
       accoste. Ne décide rien : l'accostage reste celui du store. -->
  <div class="xsea" :class="['m-' + theme.mood, { still: reduced }]" role="status" aria-live="polite">
    <svg
      class="xs-svg"
      viewBox="40 -140 320 440"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient :id="uid('sky')" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="theme.sky0" />
          <stop offset="1" :stop-color="theme.sky1" />
        </linearGradient>
        <linearGradient :id="uid('sea')" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="theme.sea0" />
          <stop offset="1" :stop-color="theme.sea1" />
        </linearGradient>
        <radialGradient :id="uid('mist')" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#d6dfda" stop-opacity="0.55" />
          <stop offset="1" stop-color="#d6dfda" stop-opacity="0" />
        </radialGradient>
        <linearGradient :id="uid('refl')" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="theme.glow" stop-opacity="0.45" />
          <stop offset="1" :stop-color="theme.glow" stop-opacity="0" />
        </linearGradient>
        <radialGradient :id="uid('glow')" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" :stop-color="theme.glow" stop-opacity="0.9" />
          <stop offset="1" :stop-color="theme.glow" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- Ciel -->
      <rect x="0" y="-150" width="400" height="320" :fill="`url(#${uid('sky')})`" />

      <!-- ☀️ Astre : soleil (île 1), soleil couchant (2, 4), lune voilée (3), aucune (5). -->
      <g v-if="theme.mood !== 'curse'" class="xs-orb">
        <circle :cx="orb.x" :cy="orb.y" :r="orb.r * 2.4" :fill="`url(#${uid('glow')})`" />
        <circle :cx="orb.x" :cy="orb.y" :r="orb.r" :fill="theme.glow" :opacity="orb.op" />
      </g>
      <!-- ✨ Étoiles (île maudite) -->
      <g v-if="theme.mood === 'curse'" class="xs-stars">
        <circle
          v-for="(s, i) in stars"
          :key="'st' + i"
          :cx="s.x"
          :cy="s.y"
          :r="s.r"
          fill="#e9dcff"
          :style="{ animationDelay: s.d + 's' }"
        />
      </g>
      <!-- ⚡ Éclair (île maudite) -->
      <path
        v-if="theme.mood === 'curse'"
        class="xs-bolt"
        d="M312 10 L300 66 L314 66 L296 132"
        :stroke="theme.glow"
      />

      <!-- Nuages -->
      <g class="xs-clouds" :opacity="theme.mood === 'curse' ? 0.35 : 0.55">
        <ellipse cx="80" cy="60" rx="38" ry="9" fill="#fff" opacity="0.5" />
        <ellipse cx="250" cy="42" rx="46" ry="8" fill="#fff" opacity="0.4" />
        <ellipse cx="330" cy="90" rx="30" ry="7" fill="#fff" opacity="0.45" />
        <ellipse cx="150" cy="-40" rx="40" ry="8" fill="#fff" opacity="0.35" />
      </g>

      <!-- 🏝️ L'île QUITTÉE s'éloigne à gauche -->
      <g :style="{ opacity: 1 - p * 0.85 }">
        <path :d="ridgeFrom" :fill="fromLand" opacity="0.85" />
      </g>
      <!-- 🏝️ L'île d'ARRIVÉE grandit à droite -->
      <g
        class="xs-dest"
        :style="{
          transform: `translate(305px, 168px) scale(${destScale}) translate(-305px, -168px)`,
        }"
      >
        <path :d="ridgeTo" :fill="theme.land" />
        <!-- Effets propres à l'île, posés sur sa crête -->
        <g v-if="theme.mood === 'war'" class="xs-smoke">
          <circle
            v-for="k in 3"
            :key="'sm' + k"
            :cx="280 + k * 12"
            cy="142"
            r="6"
            fill="#5a504a"
            opacity="0.7"
            :style="{ animationDelay: k * 0.9 + 's' }"
          />
        </g>
        <g v-if="theme.mood === 'curse'">
          <ellipse
            cx="305"
            cy="150"
            rx="26"
            ry="10"
            :fill="`url(#${uid('glow')})`"
            class="xs-pulse"
          />
        </g>
        <g v-if="theme.mood === 'dusk'" fill="#16231a">
          <path v-for="k in 5" :key="'pn' + k" :d="pine(266 + k * 13, 160 - (k % 2) * 5)" />
        </g>
        <g v-if="theme.mood === 'sun'" fill="#2d2418">
          <path d="M302 150 L302 134 L316 144 Z" />
        </g>
      </g>

      <!-- Mer -->
      <rect x="0" y="168" width="400" height="132" :fill="`url(#${uid('sea')})`" />
      <!-- Reflet de l'astre sur l'eau -->
      <path
        v-if="theme.mood !== 'curse'"
        :d="`M${orb.x - orb.r} 169 L${orb.x + orb.r} 169 L${orb.x + 3} 260 L${orb.x - 3} 260 Z`"
        :fill="`url(#${uid('refl')})`"
      />

      <!-- 🌊 Vagues (trois couches qui défilent) -->
      <g class="xs-waves">
        <path
          v-for="(w, i) in waves"
          :key="'w' + i"
          :d="w.d"
          :class="'wv wv' + i"
          :stroke="w.c"
          fill="none"
        />
      </g>

      <!-- 🌫️ Brume (île des morts) -->
      <g v-if="theme.mood === 'fog'" class="xs-fog">
        <ellipse
          v-for="(f, i) in fogBanks"
          :key="'fb' + i"
          :cx="f.x"
          :cy="f.y"
          :rx="f.rx"
          :ry="f.ry"
          :fill="`url(#${uid('mist')})`"
        />
      </g>

      <!-- ⛵ Le bateau, qui avance avec le temps réel -->
      <g class="xs-ship-pos" :style="{ transform: `translate(${shipX}px, 0)` }">
        <g class="xs-ship">
          <path
            d="M-26 214 L26 214 L18 226 L-18 226 Z"
            fill="#4a2f1c"
            stroke="#2a1a0f"
            stroke-width="1"
          />
          <rect x="-1.2" y="168" width="2.4" height="46" fill="#3a2716" />
          <path d="M1 170 Q24 186 2 210 Z" fill="#f2ead8" />
          <path d="M-1 176 Q-18 192 -2 208 Z" fill="#e6dcc4" />
          <path d="M0 166 L12 169 L0 172 Z" :fill="flag" />
        </g>
        <!-- Sillage -->
        <path
          d="M-28 222 Q-50 224 -80 221"
          stroke="#ffffff"
          stroke-opacity="0.35"
          stroke-width="1.5"
          fill="none"
        />
      </g>

      <!-- 🏴‍☠️ Une voile de pillards au large (île des Brigands) -->
      <g v-if="theme.mood === 'sun'" class="xs-pirate" fill="#1c1712">
        <path d="M206 172 L222 172 L219 175 L209 175 Z" />
        <path d="M214 171 L214 157 L224 169 Z" />
      </g>

      <!-- Effets de premier plan par île -->
      <g
        v-if="theme.mood === 'sun'"
        class="xs-gulls"
        stroke="#2d2a26"
        stroke-width="1.2"
        fill="none"
      >
        <path
          v-for="(g, i) in birds"
          :key="'g' + i"
          :d="gull(g.x, g.y)"
          :style="{ animationDelay: g.d + 's' }"
          class="xs-bird"
        />
      </g>
      <g v-if="theme.mood === 'dusk'" class="xs-flies">
        <circle
          v-for="(f, i) in sparks"
          :key="'f' + i"
          :cx="f.x"
          :cy="f.y"
          r="1.3"
          :fill="theme.glow"
          :style="{ animationDelay: f.d + 's' }"
        />
      </g>
      <g v-if="theme.mood === 'fog'" class="xs-wisps">
        <circle
          v-for="(f, i) in sparks"
          :key="'wi' + i"
          :cx="f.x"
          :cy="f.y + 50"
          r="2.2"
          :fill="theme.glow"
          :style="{ animationDelay: f.d + 's' }"
        />
      </g>
      <g v-if="theme.mood === 'war'" class="xs-embers">
        <circle
          v-for="(f, i) in sparks"
          :key="'e' + i"
          :cx="f.x"
          :cy="f.y + 60"
          r="1.2"
          :fill="theme.glow"
          :style="{ animationDelay: f.d + 's' }"
        />
      </g>
      <rect
        v-if="theme.mood === 'curse'"
        class="xs-flash"
        x="0"
        y="-150"
        width="400"
        height="460"
        :fill="theme.glow"
      />
    </svg>

    <!-- ⏳ Le compte à rebours -->
    <div class="xs-card">
      <div class="xs-dest-name">
        <span class="xs-emo">{{ to?.emoji ?? '🏝️' }}</span>
        <span>
          <span class="xs-kicker">{{ kicker }}</span>
          <b>Île {{ crossing.to }}{{ to ? ' · ' + to.name : '' }}</b>
        </span>
      </div>
      <div class="xs-timer">{{ timer }}</div>
      <div class="xs-bar" aria-hidden="true">
        <i :style="{ width: Math.round(p * 100) + '%' }" />
      </div>
      <p class="xs-hint">{{ line }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { islandById } from '@/lib/archipelago';
import { crossingProgress, crossingTheme, islandRidge } from '@/lib/crossingScene';
import { formatCountdown } from '@/lib/duration';
import { ISLAND_STYLES } from '@/lib/islandTerrain';
import type { Crossing } from '@/lib/expedition';

const props = defineProps<{ crossing: Crossing; now: number }>();

/** Des ids de dégradé propres à l'instance (deux scènes ne se marchent pas dessus). */
const key = Math.random().toString(36).slice(2, 8);
const uid = (n: string) => `xs-${n}-${key}`;

const reduced =
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const theme = computed(() => crossingTheme(props.crossing.to));
const to = computed(() => islandById(props.crossing.to));
const state = computed(() => crossingProgress(props.crossing, props.now));
const p = computed(() => state.value.progress);

const ridgeFrom = computed(() => islandRidge(props.crossing.from, -20, 150, 168, 34));
const ridgeTo = computed(() => islandRidge(props.crossing.to, 250, 110, 168, 40));
const fromLand = computed(() => (ISLAND_STYLES[props.crossing.from] ?? ISLAND_STYLES[1]!).land1);
/** L'île d'arrivée, petite au départ, en grand à l'accostage. */
const destScale = computed(() => 0.45 + p.value * 0.85);
/** Le bateau quitte la côte de gauche et file vers l'île d'arrivée. */
const shipX = computed(() => 120 + p.value * 120);
const flag = computed(() => theme.value.glow);

const orb = computed(() => {
  switch (theme.value.mood) {
    case 'sun':
      return { x: 110, y: 70, r: 16, op: 1 };
    case 'dusk':
      return { x: 200, y: 150, r: 20, op: 0.95 };
    case 'war':
      return { x: 160, y: 140, r: 24, op: 0.9 };
    default:
      return { x: 120, y: 80, r: 12, op: 0.45 };
  }
});

/** Positions fixes (dérivées de l'indice) : la scène est la même à chaque ouverture. */
const stars = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 137) % 400,
  y: -130 + ((i * 59) % 270),
  r: 0.5 + (i % 3) * 0.35,
  d: (i % 7) * 0.4,
}));
const sparks = Array.from({ length: 12 }, (_, i) => ({
  x: 60 + ((i * 83) % 280),
  y: 120 + ((i * 47) % 70),
  d: (i % 6) * 0.7,
}));
const fogBanks = [
  { x: 120, y: 166, rx: 120, ry: 14 },
  { x: 300, y: 178, rx: 110, ry: 12 },
  { x: 200, y: 214, rx: 150, ry: 16 },
];
const birds = [
  { x: 150, y: 70, d: 0 },
  { x: 175, y: 82, d: 0.6 },
  { x: 230, y: 40, d: 1.2 },
];

const waveColor = computed(() => (theme.value.mood === 'curse' ? '#7a5ca8' : '#ffffff'));
const waves = computed(() =>
  [190, 232, 270].map((y, i) => {
    let d = `M-400 ${y}`;
    for (let x = -400; x <= 800; x += 40) d += ` q10 -${3 + i} 20 0 t20 0`;
    return { d, c: waveColor.value };
  }),
);

function pine(x: number, y: number): string {
  return `M${x} ${y} L${x - 4} ${y} L${x} ${y - 12} L${x + 4} ${y} Z`;
}
function gull(x: number, y: number): string {
  return `M${x - 6} ${y} q3 -4 6 0 q3 -4 6 0`;
}

const kicker = computed(() =>
  state.value.phase === 'waiting'
    ? 'Embarquement pour'
    : state.value.phase === 'docking'
      ? 'Accostage sur'
      : 'En mer vers',
);
const timer = computed(() => {
  const s = state.value;
  if (s.phase === 'docking') return 'Terre !';
  return formatCountdown(s.leftMs);
});
const line = computed(() => {
  const s = state.value;
  if (s.phase === 'waiting')
    return `On lève l'ancre dans ${formatCountdown(s.departInMs)}, au retour des troupes.`;
  if (s.phase === 'docking') return 'Le bateau touche le quai…';
  return theme.value.hint;
});
</script>

<style scoped>
.xsea {
  position: absolute;
  inset: 0;
  z-index: 4;
  overflow: hidden;
  background: #0b0d12;
}
.xs-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.xs-dest {
  transition: transform 1s linear;
}
.xs-ship-pos {
  transition: transform 1s linear;
}
.xs-ship {
  animation: xs-bob 3.2s ease-in-out infinite;
  transform-origin: center bottom;
  transform-box: fill-box;
}
@keyframes xs-bob {
  0%,
  100% {
    transform: translateY(0) rotate(-2deg);
  }
  50% {
    transform: translateY(3px) rotate(2deg);
  }
}
.wv {
  stroke-width: 1.4;
  stroke-opacity: 0.35;
  animation: xs-wave 6s linear infinite;
}
.wv1 {
  stroke-opacity: 0.25;
  animation-duration: 9s;
}
.wv2 {
  stroke-opacity: 0.18;
  animation-duration: 13s;
}
@keyframes xs-wave {
  to {
    transform: translateX(40px);
  }
}
.xs-clouds {
  animation: xs-drift 40s linear infinite;
}
@keyframes xs-drift {
  from {
    transform: translateX(-30px);
  }
  to {
    transform: translateX(30px);
  }
}
.xs-pirate {
  animation: xs-drift 30s ease-in-out infinite alternate;
}
.xs-orb {
  animation: xs-breathe 5s ease-in-out infinite;
}
@keyframes xs-breathe {
  50% {
    opacity: 0.8;
  }
}
.xs-stars circle {
  animation: xs-twinkle 2.6s ease-in-out infinite;
}
@keyframes xs-twinkle {
  50% {
    opacity: 0.2;
  }
}
.xs-bolt {
  fill: none;
  stroke-width: 2;
  opacity: 0;
  animation: xs-bolt 7s steps(1) infinite;
}
@keyframes xs-bolt {
  0%,
  100% {
    opacity: 0;
  }
  62% {
    opacity: 0.95;
  }
  64% {
    opacity: 0;
  }
  66% {
    opacity: 0.8;
  }
  68% {
    opacity: 0;
  }
}
.xs-flash {
  opacity: 0;
  animation: xs-flash 7s steps(1) infinite;
  pointer-events: none;
}
@keyframes xs-flash {
  0%,
  100% {
    opacity: 0;
  }
  62% {
    opacity: 0.18;
  }
  64% {
    opacity: 0;
  }
  66% {
    opacity: 0.12;
  }
  68% {
    opacity: 0;
  }
}
.xs-pulse {
  animation: xs-breathe 2.4s ease-in-out infinite;
}
.xs-smoke circle {
  animation: xs-smoke 4.5s ease-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}
@keyframes xs-smoke {
  0% {
    transform: translate(0, 0) scale(0.6);
    opacity: 0.8;
  }
  100% {
    transform: translate(6px, -40px) scale(2.6);
    opacity: 0;
  }
}
.xs-fog rect {
  animation: xs-drift 14s ease-in-out infinite alternate;
}
.xs-bird {
  animation: xs-flap 1.4s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}
@keyframes xs-flap {
  50% {
    transform: translate(4px, -3px) scaleY(0.6);
  }
}
.xs-flies circle,
.xs-wisps circle {
  animation: xs-float 4s ease-in-out infinite;
}
@keyframes xs-float {
  0%,
  100% {
    transform: translate(0, 0);
    opacity: 0.2;
  }
  50% {
    transform: translate(6px, -8px);
    opacity: 1;
  }
}
.xs-embers circle {
  animation: xs-rise 3.5s linear infinite;
}
@keyframes xs-rise {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform: translate(10px, -70px);
    opacity: 0;
  }
}
.xsea.still *,
.xsea.still {
  animation: none !important;
  transition: none !important;
}

.xs-card {
  position: absolute;
  left: 50%;
  top: 62px;
  transform: translateX(-50%);
  width: min(92%, 340px);
  padding: 12px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, #0b0d12 72%, transparent);
  border: 1px solid color-mix(in srgb, #ffffff 18%, transparent);
  color: #f3eee6;
  text-align: center;
  backdrop-filter: blur(3px);
}
.xs-dest-name {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
}
.xs-dest-name > span:last-child {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.xs-emo {
  font-size: 22px;
}
.xs-kicker {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.75;
}
.xs-timer {
  font-family: Oswald, sans-serif;
  font-size: 40px;
  line-height: 1.1;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.xs-bar {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, #ffffff 15%, transparent);
  overflow: hidden;
  margin: 6px 0 8px;
}
.xs-bar i {
  display: block;
  height: 100%;
  background: var(--accent, #ffd23f);
  transition: width 1s linear;
}
.xs-hint {
  margin: 0;
  font-size: 12.5px;
  opacity: 0.85;
}
@media (prefers-reduced-motion: reduce) {
  .xsea *,
  .xsea {
    animation: none !important;
    transition: none !important;
  }
}
</style>
