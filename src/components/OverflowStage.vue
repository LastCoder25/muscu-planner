<template>
  <div class="ovf" :class="[shake, 'ph-' + phase, { reduce }]">
    <!-- 🎨 LE DÉCOR : une lande sous un ciel de fin du monde. Nuages bas teintés par la
         faille, montagnes au loin, et, à droite sur l'horizon, TA VILLE — ses tours, ses
         feux. C'est vers elle qu'une partie de l'armée va marcher. -->
    <svg
      class="scene"
      viewBox="0 0 100 180"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ov-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#07040f" />
          <stop offset="0.45" stop-color="#1d0f2c" />
          <stop offset="0.7" :stop-color="skyGlow" />
        </linearGradient>
        <radialGradient id="ov-bloom" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" :stop-color="color" stop-opacity="0.55" />
          <stop offset="1" :stop-color="color" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="ov-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2a1f2a" />
          <stop offset="0.35" stop-color="#171117" />
          <stop offset="1" stop-color="#080508" />
        </linearGradient>
        <linearGradient id="ov-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="color" stop-opacity="0" />
          <stop offset="0.5" :stop-color="color" stop-opacity="0.16" />
          <stop offset="1" :stop-color="color" stop-opacity="0" />
        </linearGradient>
        <radialGradient id="ov-torch" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#ffe29a" />
          <stop offset="1" stop-color="#ff8a2a" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="180" fill="url(#ov-sky)" />
      <g class="stars" fill="#fff">
        <circle
          v-for="s in STARS"
          :key="s.i"
          :cx="s.x"
          :cy="s.y"
          :r="s.r"
          :style="{ animationDelay: s.d + 's' }"
        />
      </g>
      <!-- Nuages bas, éclairés par-dessous par la faille. -->
      <g class="clouds">
        <ellipse cx="22" cy="58" rx="30" ry="5" :fill="color" opacity="0.12" />
        <ellipse cx="70" cy="50" rx="36" ry="6" fill="#3a1c4a" opacity="0.5" />
        <ellipse cx="44" cy="68" rx="40" ry="4" :fill="color" opacity="0.1" />
      </g>
      <path
        d="M-4 104 L10 86 L20 96 L32 80 L44 94 L56 84 L68 97 L80 88 L92 98 L104 90 L104 110 L-4 110 Z"
        fill="#1a1024"
      />
      <path
        d="M-4 110 L14 100 L28 106 L40 98 L54 108 L66 102 L82 108 L104 100 L104 116 L-4 116 Z"
        fill="#120b18"
      />

      <!-- 🏰 TA VILLE, sur l'horizon à droite : remparts, tours, bannière, feux. -->
      <g
        class="city"
        :class="{ alarm: phase === 'march' || phase === 'end' }"
        transform="translate(-12 0)"
      >
        <path
          d="M78 116 L78 104 L81 104 L81 101 L84 101 L84 104 L88 104 L88 98 L90 96 L92 98 L92 104 L96 104 L96 101 L99 101 L99 104 L104 104 L104 116 Z"
          fill="#0c0810"
        />
        <path d="M90 96 L90 90 L94 92 L90 94" fill="#b8262b" class="flag" />
        <circle cx="82.5" cy="106" r="3" fill="url(#ov-torch)" class="torch" />
        <circle cx="94" cy="106" r="3" fill="url(#ov-torch)" class="torch t2" />
        <circle cx="88" cy="109" r="2.2" fill="url(#ov-torch)" class="torch t3" />
      </g>

      <!-- La lande, ses rochers et ses arbres morts (les cachettes des embusqués). -->
      <path d="M0 114 Q30 110 60 115 T100 113 V180 H0 Z" fill="url(#ov-ground)" />
      <g fill="#0b070c">
        <path d="M4 136 q4 -9 10 -2 q3 -5 6 1 Z" />
        <path d="M76 150 q5 -10 11 -2 q4 -6 8 1 Z" />
        <path d="M18 162 q4 -7 9 -1 q3 -4 6 1 Z" />
        <path d="M64 132 q3 -6 7 -1 q2 -3 5 1 Z" />
      </g>
      <g stroke="#0b070c" stroke-width="0.9" stroke-linecap="round" fill="none">
        <path d="M9 132 l0 -14 m0 5 l-4 -4 m4 1 l3 -5 m-3 9 l4 -2" />
        <path d="M86 146 l0 -16 m0 6 l4 -5 m-4 2 l-3 -4 m3 10 l-4 -2" />
      </g>
      <!-- Les lézardes qui fendent le sol à mesure que la faille grossit. -->
      <g class="cracks" :stroke="color" stroke-width="0.7" fill="none" stroke-linecap="round">
        <path d="M50 126 l-8 6 l-5 -1 l-7 7" />
        <path d="M50 126 l9 5 l4 -2 l8 8" />
        <path d="M50 126 l-2 10 l3 6 l-3 9" />
        <path d="M50 126 l-14 -1 l-6 3" />
        <path d="M50 126 l15 -2 l6 3" />
      </g>
      <circle class="bloom" cx="50" cy="110" r="36" fill="url(#ov-bloom)" />
      <rect class="mist" x="-40" y="116" width="180" height="22" fill="url(#ov-mist)" />
    </svg>

    <span v-for="m in MOTES" :key="m" class="mote" :style="moteStyle(m)" aria-hidden="true" />

    <!-- 🌀 LA FAILLE — elle enfle, se déchire, vomit son armée, puis s'effondre. -->
    <div class="portal-wrap">
      <span class="ring" :class="{ go: ringGo }" />
      <span class="ring r2" :class="{ go: ringGo }" />
      <div class="portal" :class="{ swell: phase !== 'brew', collapse: collapsed }">
        <RiftPortal
          :color="color"
          :open="phase !== 'brew'"
          :sealed="collapsed"
          :seed="7"
          :still="reduce"
        />
      </div>
      <!-- 💠 …et il ne reste qu'une mine de mana. -->
      <div class="crystal" :class="{ on: crystal }">
        <span class="gem g1">💠</span><span class="gem g2">💠</span><span class="gem g3">💠</span>
        <span class="gem-glow" />
      </div>
    </div>

    <!-- 🐾 LES MONSTRES. Chacun part du portail, puis rejoint SON poste : une cachette pour
         les embusqués, le rang de la colonne pour les autres. -->
    <div
      v-for="f in bodies"
      :key="f.key"
      class="foe"
      :class="[f.role, { out: released, lurk: f.role === 'amb' && lurking, boss: f.boss }]"
      :style="foeStyle(f)"
    >
      <span class="fshadow" />
      <img
        v-if="f.art && !failed.has(f.art)"
        :src="f.art"
        :alt="f.name"
        class="fart"
        draggable="false"
        @error="failed = new Set(failed).add(f.art!)"
      />
      <span v-else class="femo">{{ f.emoji }}</span>
      <span v-if="f.role === 'amb'" class="eyes" :class="{ on: lurking }"><i /><i /></span>
    </div>

    <div class="flash" :class="flash" aria-hidden="true" />
    <div class="vig" aria-hidden="true" />

    <div class="hud">
      <span class="chip">🕳️ Faille · {{ factionLabel }} · niv {{ overflow.level }}</span>
      <q-btn flat dense no-caps class="skip" label="⏩ Passer" @click="skip" />
    </div>
    <div class="clock" :class="{ zero: days === 0 }">
      <span class="clk-n font-display">{{ days }}</span
      ><span class="clk-u">j avant débordement</span>
    </div>
    <div v-if="when" class="when">{{ when }}</div>

    <transition name="ban" mode="out-in">
      <div v-if="banner" :key="banner.id" class="banner" :class="'ban-' + banner.kind">
        <div class="ban-main font-display">{{ banner.main }}</div>
        <div v-if="banner.sub" class="ban-sub">{{ banner.sub }}</div>
      </div>
    </transition>

    <!-- L'écran de fin est un MOMENT : on n'émet `done` qu'au clic. -->
    <div v-if="ended" class="end">
      <div class="end-card">
        <div class="end-emo">🕳️</div>
        <div class="end-title font-display">La faille a débordé</div>
        <ul class="end-list">
          <li><span>🗡️</span>{{ ambushLine }}</li>
          <li>
            <span>{{ overflow.marching ? '🏰' : '🌫️' }}</span
            >{{ marchLine }}
          </li>
          <li><span>💠</span>Il en reste une mine de mana, à récolter sur la carte.</li>
        </ul>
        <div class="end-tip">Referme une faille avant 7 jours pour l'empêcher de déborder.</div>
        <q-btn
          unelevated
          no-caps
          color="primary"
          text-color="dark"
          class="end-cta"
          label="Voir le rapport"
          @click="emit('done')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 🕳️💥 LE DÉBORDEMENT D'UNE FAILLE — plateau plein écran.
//
// ⚠️ Il ne décide RIEN : le débordement est déjà tranché (carte et base). Il met en scène
// ce que le message a gardé — la faction, le niveau, le nombre de lieux harcelés, et si
// l'armée marche sur une base. Les monstres montrés sont ceux du roster de la faction,
// dans le même ordre qu'une incursion.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { OverflowReplay } from '@/lib/expedition';
import { overflowCast } from '@/lib/overflowStage';
import { FACTION_LABEL } from '@/lib/raid';
import { characterRank } from '@/lib/characterRank';
import { speciesArt } from '@/data/monsterArt';
import RiftPortal from '@/components/RiftPortal.vue';

const props = defineProps<{ overflow: OverflowReplay; when?: string | null }>();
const emit = defineEmits<{ done: [] }>();

const color = computed(() => characterRank(props.overflow.level).color);
/** L'horizon prend la couleur de la faille, assombrie. */
const skyGlow = computed(() => `color-mix(in srgb, ${color.value} 45%, #2a0f24)`);
const factionLabel = computed(() => FACTION_LABEL[props.overflow.faction]);

const ambushLine = computed(() => {
  const n = props.overflow.ambushed;
  return n
    ? `${n} lieu${n > 1 ? 'x' : ''} alentour ${n > 1 ? 'sont harcelés' : 'est harcelé'} pendant 2 jours.`
    : 'Des monstres rôdent autour pendant 2 jours.';
});
const marchLine = computed(() =>
  props.overflow.marching
    ? 'Le reste marche sur ta base : le prochain siège sera renforcé.'
    : 'Le reste se disperse dans les terres.',
);

// ── La distribution : postes à l'écran (en % du plateau) ──
interface Body {
  key: string;
  role: 'amb' | 'march';
  name: string;
  emoji: string;
  art: string | null;
  boss: boolean;
  x: number;
  y: number;
  delay: number;
}
/** Les cachettes : les rochers et les arbres morts du décor. */
const HIDE = [
  { x: 12, y: 74 },
  { x: 86, y: 82 },
  { x: 24, y: 89 },
  { x: 42, y: 93 },
];
const cast = computed(() => overflowCast(props.overflow));
const bodies = computed<Body[]>(() => {
  const out: Body[] = [];
  cast.value.ambushers.forEach((f, k) =>
    out.push({
      key: 'a' + k,
      role: 'amb',
      name: f.name,
      emoji: f.emoji,
      art: speciesArt(f.name),
      boss: false,
      x: HIDE[k % HIDE.length]!.x,
      y: HIDE[k % HIDE.length]!.y,
      delay: k * 160,
    }),
  );
  const n = cast.value.marchers.length;
  cast.value.marchers.forEach((f, k) => {
    // Une colonne en diagonale, du pied du portail vers la ville ; le chef ferme la marche.
    const t = (k + 1) / (n + 1);
    const boss = k === n - 1;
    out.push({
      key: 'm' + k,
      role: 'march',
      name: f.name,
      emoji: f.emoji,
      art: speciesArt(boss ? f.name.replace(' (gardien)', '') : f.name),
      boss,
      x: props.overflow.marching ? 52 + t * 26 : 50 + (k % 2 ? 1 : -1) * (14 + t * 30),
      y: props.overflow.marching ? 73 - t * 8 + (k % 2 ? 4 : 0) : 72 - t * 6,
      delay: 700 + k * 150,
    });
  });
  return out;
});
const failed = ref(new Set<string>());

// ── Rythme ──
const BREW_MS = 2000;
const RIP_MS = 1300;
const POUR_MS = 2600;
const MARCH_MS = 2200;
const COLLAPSE_MS = 2000;

const reduce =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

type Phase = 'brew' | 'rip' | 'pour' | 'march' | 'collapse' | 'end';
const phase = ref<Phase>('brew');
const days = ref(7);
const released = ref(false);
const lurking = ref(false);
const collapsed = ref(false);
const crystal = ref(false);
const ringGo = ref(false);
const flash = ref('');
const shake = ref('');
const ended = ref(false);
const banner = ref<{ id: number; kind: string; main: string; sub: string } | null>(null);
let uid = 0;

const timers: ReturnType<typeof setTimeout>[] = [];
function later(fn: () => void, ms: number): void {
  timers.push(setTimeout(fn, ms));
}
function clearAll(): void {
  timers.forEach(clearTimeout);
  timers.length = 0;
}
function say(kind: string, main: string, sub = '', ms = 1600): void {
  const id = ++uid;
  banner.value = { id, kind, main, sub };
  later(() => {
    if (banner.value?.id === id) banner.value = null;
  }, ms);
}
function pulse(r: typeof flash, v: string, ms: number): void {
  r.value = v;
  later(() => {
    if (r.value === v) r.value = '';
  }, ms);
}

/** Où se tient un monstre : dans le portail tant qu'il n'est pas sorti. */
function foeStyle(b: Body) {
  const out = released.value;
  return {
    left: (out ? b.x : 50) + '%',
    top: (out ? b.y : 62) + '%',
    transitionDelay: out && !reduce ? b.delay + 'ms' : '0ms',
    zIndex: String(Math.round(b.y * 10)),
  };
}

const f01 = (x: number) => Math.abs(x - Math.floor(x));
const STARS = Array.from({ length: 30 }, (_, i) => ({
  i,
  x: +(f01(Math.sin(i * 91.7) * 4375.5) * 100).toFixed(1),
  y: +(f01(Math.sin(i * 17.3) * 9137.1) * 60).toFixed(1),
  r: 0.18 + f01(Math.sin(i * 3.1) * 777.7) * 0.3,
  d: +(f01(Math.sin(i * 5.7) * 333.3) * 4).toFixed(2),
}));
const MOTES = 14;
function moteStyle(m: number) {
  const a = f01(Math.sin(m * 12.9898) * 43758.5453);
  const b = f01(Math.sin(m * 78.233) * 12345.6789);
  return {
    left: (20 + a * 60).toFixed(1) + '%',
    top: (45 + b * 30).toFixed(1) + '%',
    animationDelay: (a * 4).toFixed(2) + 's',
    animationDuration: (3 + b * 4).toFixed(2) + 's',
  };
}

function skip(): void {
  clearAll();
  banner.value = null;
  days.value = 0;
  released.value = true;
  lurking.value = true;
  collapsed.value = true;
  crystal.value = true;
  phase.value = 'end';
  ended.value = true;
}

onMounted(() => {
  if (reduce) return skip();
  // 1. La faille mûrit : le compte à rebours fond, le sol se fend.
  say('brew', 'LA FAILLE MÛRIT', 'Personne ne l’a refermée…', BREW_MS - 200);
  for (let d = 6; d >= 0; d--) later(() => (days.value = d), ((7 - d) / 7) * BREW_MS);
  // 2. Elle se déchire.
  let t = BREW_MS;
  later(() => {
    phase.value = 'rip';
    ringGo.value = true;
    pulse(flash, 'rip', 420);
    pulse(shake, 'sh-l', 520);
    say('rip', 'LA FAILLE DÉBORDE', '', RIP_MS + 200);
  }, t);
  // 3. Elle vomit son armée.
  t += RIP_MS;
  later(() => {
    phase.value = 'pour';
    released.value = true;
    pulse(shake, 'sh-m', 360);
    say('pour', 'DES MONSTRES S’EMBUSQUENT', 'Les lieux alentour seront harcelés', POUR_MS - 200);
  }, t);
  later(() => (lurking.value = true), t + POUR_MS * 0.7);
  // 4. Le reste marche.
  t += POUR_MS;
  later(() => {
    phase.value = 'march';
    say(
      'march',
      props.overflow.marching ? 'L’ARMÉE MARCHE SUR TA BASE' : 'LE RESTE SE DISPERSE',
      props.overflow.marching ? 'Le prochain siège sera renforcé' : '',
      MARCH_MS - 200,
    );
  }, t);
  // 5. Elle s'effondre en mine de mana.
  t += MARCH_MS;
  later(() => {
    phase.value = 'collapse';
    collapsed.value = true;
    pulse(flash, 'seal', 380);
    pulse(shake, 'sh-m', 360);
    say('seal', 'LA FAILLE S’EFFONDRE', 'Il en reste une mine de mana', COLLAPSE_MS);
  }, t);
  later(() => (crystal.value = true), t + 700);
  later(() => {
    phase.value = 'end';
    ended.value = true;
  }, t + COLLAPSE_MS);
});
onBeforeUnmount(clearAll);
</script>

<style scoped lang="scss">
.ovf {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #07040f;
  color: #f3eee6;
  user-select: none;
}
.scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.stars circle {
  animation: tw 3s ease-in-out infinite;
}
@keyframes tw {
  50% {
    opacity: 0.2;
  }
}
.clouds {
  animation: drift 18s ease-in-out infinite alternate;
}
@keyframes drift {
  to {
    transform: translateX(-6px);
  }
}
.cracks path {
  stroke-dasharray: 30;
  stroke-dashoffset: 30;
  filter: drop-shadow(0 0 1px currentColor);
  transition: stroke-dashoffset 2s ease-in;
}
.ph-brew .cracks path {
  stroke-dashoffset: 16;
}
.ovf:not(.ph-brew) .cracks path {
  stroke-dashoffset: 0;
}
.ph-collapse .cracks,
.ph-end .cracks {
  opacity: 0.25;
  transition: opacity 1.5s;
}
.bloom {
  transform-origin: 50px 110px;
  animation: bloom 2.2s ease-in-out infinite;
}
@keyframes bloom {
  50% {
    transform: scale(1.12);
    opacity: 0.8;
  }
}
.ph-rip .bloom,
.ph-pour .bloom {
  animation-duration: 0.7s;
}
.ph-collapse .bloom,
.ph-end .bloom {
  opacity: 0.2;
}
.mist {
  animation: mist 10s ease-in-out infinite alternate;
}
@keyframes mist {
  to {
    transform: translateX(-26px);
  }
}
.city .torch {
  animation: flick 0.9s ease-in-out infinite alternate;
}
.city .t2 {
  animation-delay: 0.3s;
}
.city .t3 {
  animation-delay: 0.6s;
}
@keyframes flick {
  to {
    opacity: 0.55;
  }
}
.city.alarm .torch {
  animation-duration: 0.25s;
}
.city .flag {
  transform-origin: 90px 92px;
  animation: flag 1.4s ease-in-out infinite;
}
@keyframes flag {
  50% {
    transform: skewY(-12deg);
  }
}
.mote {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(220, 180, 255, 0.7);
  box-shadow: 0 0 6px rgba(220, 180, 255, 0.9);
  animation: rise linear infinite;
  pointer-events: none;
}
@keyframes rise {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform: translate(10px, -80px);
    opacity: 0;
  }
}
.portal-wrap {
  position: absolute;
  left: 50%;
  top: 61%;
  width: 34%;
  max-width: 190px;
  aspect-ratio: 3 / 4;
  transform: translate(-50%, -78%);
  z-index: 500;
  pointer-events: none;
}
.portal {
  position: absolute;
  inset: 0;
  transform: scale(0.6);
  transition:
    transform 1.1s cubic-bezier(0.2, 1.6, 0.4, 1),
    opacity 1.2s;
  &.swell {
    transform: scale(1.18);
  }
  &.collapse {
    transform: scale(0.04) rotate(200deg);
    opacity: 0;
    transition-duration: 0.9s;
    transition-timing-function: cubic-bezier(0.6, 0, 1, 0.6);
  }
}
.ring {
  position: absolute;
  left: 50%;
  top: 55%;
  width: 60%;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 3px solid v-bind(color);
  box-shadow: 0 0 18px v-bind(color);
  transform: translate(-50%, -50%) scale(0.3);
  opacity: 0;
  &.go {
    animation: ring 1.1s ease-out forwards;
  }
  &.r2.go {
    animation-delay: 0.25s;
  }
}
@keyframes ring {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(0.3);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(5);
  }
}
.crystal {
  position: absolute;
  left: 50%;
  bottom: 4%;
  width: 70%;
  height: 34%;
  transform: translateX(-50%) scale(0.2);
  opacity: 0;
  transition:
    transform 0.8s cubic-bezier(0.2, 1.7, 0.4, 1),
    opacity 0.5s;
  &.on {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
  .gem {
    position: absolute;
    bottom: 0;
    font-size: 30px;
    filter: drop-shadow(0 0 8px #7ad0ff);
    animation: gem 2.4s ease-in-out infinite;
  }
  .g1 {
    left: 34%;
    font-size: 40px;
  }
  .g2 {
    left: 10%;
    animation-delay: 0.4s;
  }
  .g3 {
    left: 62%;
    animation-delay: 0.8s;
  }
  .gem-glow {
    position: absolute;
    left: 50%;
    bottom: 10%;
    width: 120%;
    aspect-ratio: 2;
    transform: translateX(-50%);
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(122, 208, 255, 0.45), transparent);
    z-index: -1;
  }
}
@keyframes gem {
  50% {
    transform: translateY(-4px);
  }
}
.foe {
  position: absolute;
  width: 13%;
  max-width: 70px;
  aspect-ratio: 1;
  transform: translate(-50%, -80%) scale(0.2);
  opacity: 0;
  transition:
    left 1.3s cubic-bezier(0.3, 0.7, 0.3, 1),
    top 1.3s cubic-bezier(0.3, 0.7, 0.3, 1),
    transform 0.6s,
    opacity 0.5s,
    filter 0.8s;
  pointer-events: none;
  &.out {
    transform: translate(-50%, -80%) scale(1);
    opacity: 1;
  }
  &.boss {
    width: 22%;
    max-width: 110px;
  }
  &.amb.lurk .fart,
  &.amb.lurk .femo {
    filter: brightness(0.1) saturate(0);
  }
  .fart {
    position: relative;
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 0 6px v-bind(color)) drop-shadow(0 6px 6px rgba(0, 0, 0, 0.7));
  }
  .femo {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    font-size: 34px;
  }
}
.ph-march .foe.march.out,
.ph-collapse .foe.march.out,
.ph-end .foe.march.out {
  animation: step 0.5s ease-in-out infinite alternate;
}
@keyframes step {
  to {
    transform: translate(-50%, -84%) scale(1);
  }
}
.fshadow {
  position: absolute;
  left: 50%;
  bottom: -2px;
  width: 70%;
  height: 8px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
}
.eyes {
  position: absolute;
  left: 50%;
  top: 32%;
  transform: translateX(-50%);
  display: flex;
  gap: 7px;
  opacity: 0;
  transition: opacity 0.6s;
  &.on {
    opacity: 1;
    animation: blink 2.6s steps(1) infinite;
  }
  i {
    width: 5px;
    height: 4px;
    border-radius: 50%;
    background: #ffcf4a;
    box-shadow:
      0 0 6px #ff9c2a,
      0 0 12px #ff6a1a;
  }
}
@keyframes blink {
  0%,
  88% {
    opacity: 1;
  }
  90%,
  96% {
    opacity: 0;
  }
}
.flash {
  position: absolute;
  inset: 0;
  z-index: 900;
  pointer-events: none;
  opacity: 0;
  &.rip {
    opacity: 1;
    background: radial-gradient(circle at 50% 55%, #fff, v-bind(color) 40%, transparent 75%);
  }
  &.seal {
    opacity: 1;
    background: radial-gradient(circle at 50% 55%, rgba(122, 208, 255, 0.8), transparent 60%);
  }
}
.vig {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 800;
  background: radial-gradient(ellipse at 50% 55%, transparent 50%, rgba(0, 0, 0, 0.6));
}
.hud {
  position: absolute;
  top: calc(8px + env(safe-area-inset-top));
  left: 12px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  z-index: 950;
}
.chip {
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(10, 6, 18, 0.55);
  border: 1px solid rgba(220, 180, 255, 0.25);
  backdrop-filter: blur(4px);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skip {
  min-height: 44px;
  color: #f3eee6;
}
.clock {
  position: absolute;
  left: 50%;
  top: calc(58px + env(safe-area-inset-top));
  transform: translateX(-50%);
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 14px;
  border-radius: 999px;
  background: rgba(10, 6, 18, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 950;
  transition:
    border-color 0.3s,
    box-shadow 0.3s;
  &.zero {
    border-color: #ff6a45;
    box-shadow: 0 0 16px rgba(255, 106, 69, 0.55);
  }
}
.clk-n {
  font-size: 22px;
  color: #ffd23f;
}
.zero .clk-n {
  color: #ff6a45;
}
.clk-u {
  font-size: 12px;
  opacity: 0.8;
}
.when {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: calc(14px + env(safe-area-inset-bottom));
  text-align: center;
  font-size: 12px;
  opacity: 0.75;
  z-index: 950;
}
.banner {
  position: absolute;
  left: 50%;
  top: 26%;
  transform: translate(-50%, -50%);
  width: 92%;
  text-align: center;
  z-index: 940;
  pointer-events: none;
}
.ban-main {
  font-size: 28px;
  letter-spacing: 2px;
  text-shadow:
    0 0 18px v-bind(color),
    0 3px 12px rgba(0, 0, 0, 0.8);
}
.ban-sub {
  font-size: 14px;
  opacity: 0.85;
  margin-top: 2px;
}
.ban-rip .ban-main,
.ban-march .ban-main {
  color: #ff6a45;
}
.ban-seal .ban-main {
  color: #9fdcff;
  text-shadow:
    0 0 18px rgba(122, 208, 255, 0.7),
    0 3px 12px rgba(0, 0, 0, 0.8);
}
.ban-enter-active,
.ban-leave-active {
  transition:
    opacity 0.3s,
    transform 0.3s;
}
.ban-enter-from,
.ban-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.9);
}
.end {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: radial-gradient(circle at 50% 45%, rgba(10, 6, 20, 0.4), rgba(0, 0, 0, 0.8));
  z-index: 1000;
  animation: fade 0.4s ease-out;
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
.end-card {
  width: 100%;
  max-width: 350px;
  padding: 20px 16px 16px;
  border-radius: 16px;
  text-align: center;
  background: linear-gradient(180deg, #24182f, #140e1b);
  border: 1px solid color-mix(in srgb, v-bind(color) 55%, transparent);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.6),
    0 0 30px color-mix(in srgb, v-bind(color) 25%, transparent);
  animation: pop 0.45s cubic-bezier(0.2, 1.5, 0.4, 1);
}
@keyframes pop {
  from {
    transform: scale(0.85);
  }
}
.end-emo {
  font-size: 44px;
  filter: drop-shadow(0 0 12px v-bind(color));
}
.end-title {
  font-size: 24px;
  margin: 4px 0 12px;
}
.end-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: grid;
  gap: 8px;
  text-align: left;
  li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 14px;
    line-height: 1.35;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    span {
      font-size: 18px;
      line-height: 1;
    }
  }
}
.end-tip {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 14px;
}
.end-cta {
  min-height: 44px;
  width: 100%;
}
.sh-m {
  animation: shake-m 0.36s;
}
.sh-l {
  animation: shake-l 0.52s;
}
@keyframes shake-m {
  25% {
    transform: translate(-3px, 1px);
  }
  50% {
    transform: translate(3px, -1px);
  }
  75% {
    transform: translate(-2px, 1px);
  }
}
@keyframes shake-l {
  15% {
    transform: translate(-7px, 3px);
  }
  30% {
    transform: translate(7px, -3px);
  }
  45% {
    transform: translate(-5px, 2px);
  }
  60% {
    transform: translate(5px, -2px);
  }
  80% {
    transform: translate(-2px, 1px);
  }
}
.reduce * {
  animation: none !important;
  transition: none !important;
}
</style>
