<template>
  <div class="fall" :class="[{ reduce }, quake]">
    <!-- 🎨 LE DÉCOR, en SVG et en couches : ciel au couchant, soleil voilé, tours lointaines,
         rayons qui traversent l'arche, colonnes cannelées, gravats. `slice` le cale sur le
         bas de l'écran (le sol ne remonte jamais), quelle que soit la largeur. -->
    <svg
      class="scene"
      viewBox="0 0 100 180"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="fs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1c1330" />
          <stop offset="0.45" stop-color="#6b2f4a" />
          <stop offset="0.72" stop-color="#d9784a" />
          <stop offset="0.8" stop-color="#f3b06a" />
        </linearGradient>
        <radialGradient id="fs-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#fff2c4" />
          <stop offset="0.35" stop-color="#ffd08a" stop-opacity="0.9" />
          <stop offset="1" stop-color="#ff9a55" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="fs-stone" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#4a3a2e" />
          <stop offset="0.35" stop-color="#9c8566" />
          <stop offset="0.55" stop-color="#b59c79" />
          <stop offset="1" stop-color="#3e3026" />
        </linearGradient>
        <linearGradient id="fs-stone-d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#8a735a" />
          <stop offset="1" stop-color="#3a2d22" />
        </linearGradient>
        <linearGradient id="fs-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#5a4430" />
          <stop offset="0.25" stop-color="#3b2d1f" />
          <stop offset="1" stop-color="#140f0a" />
        </linearGradient>
        <linearGradient id="fs-ray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffe2a8" stop-opacity="0.55" />
          <stop offset="1" stop-color="#ffe2a8" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="fs-fog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e9d3c0" stop-opacity="0" />
          <stop offset="0.5" stop-color="#e9d3c0" stop-opacity="0.22" />
          <stop offset="1" stop-color="#e9d3c0" stop-opacity="0" />
        </linearGradient>
        <pattern id="fs-flute" width="2.2" height="4" patternUnits="userSpaceOnUse">
          <rect width="0.5" height="4" fill="#000" opacity="0.18" />
        </pattern>
      </defs>

      <rect width="100" height="180" fill="url(#fs-sky)" />
      <circle cx="62" cy="84" r="22" fill="url(#fs-sun)" />
      <!-- Nuages étirés, qui passent lentement devant le soleil. -->
      <g class="clouds">
        <ellipse cx="30" cy="60" rx="26" ry="2.4" fill="#f7b58a" opacity="0.35" />
        <ellipse cx="78" cy="72" rx="22" ry="1.8" fill="#ffd2a1" opacity="0.3" />
        <ellipse cx="48" cy="44" rx="30" ry="2" fill="#b86a6a" opacity="0.3" />
      </g>
      <!-- Lointain : collines et tours effondrées, en silhouettes violacées. -->
      <path
        d="M0 104 Q14 94 26 100 T52 98 T78 96 T100 100 V120 H0 Z"
        fill="#5a3350"
        opacity="0.75"
      />
      <g fill="#4a2a44" opacity="0.85">
        <path d="M10 104 V82 L12 79 L14 82 V104 Z" />
        <path d="M86 104 V76 L88 72 L90 76 V104 Z" />
        <path d="M84 84 H92 V86 H84 Z" />
      </g>

      <!-- Rayons de lumière à travers l'arche : ils respirent. -->
      <g class="rays">
        <polygon points="46,76 52,76 70,150 40,150" fill="url(#fs-ray)" />
        <polygon points="54,78 58,78 86,150 66,150" fill="url(#fs-ray)" opacity="0.7" />
        <polygon points="40,78 44,78 30,150 18,150" fill="url(#fs-ray)" opacity="0.5" />
      </g>

      <!-- Les ruines : l'arche brisée et quatre colonnes cannelées. -->
      <g class="ruins">
        <path
          d="M34 124 V96 Q34 70 50 70 Q64 70 66 90 L63 92 L62 88 Q58 76 50 76 Q40 76 40 96 V124 Z"
          fill="url(#fs-stone-d)"
        />
        <g>
          <rect x="6" y="66" width="8" height="58" fill="url(#fs-stone)" />
          <rect x="6" y="66" width="8" height="58" fill="url(#fs-flute)" />
          <rect x="4.6" y="63" width="10.8" height="3.4" fill="#a48b6b" />
          <rect x="4" y="61" width="12" height="2.2" fill="#8a7358" />
          <rect x="5" y="124" width="10" height="2.4" fill="#6e5a45" />
        </g>
        <g>
          <path d="M20 124 V92 L22 89 L24 93 L26 90 L28 92 V124 Z" fill="url(#fs-stone)" />
          <path d="M20 124 V92 L22 89 L24 93 L26 90 L28 92 V124 Z" fill="url(#fs-flute)" />
        </g>
        <g>
          <rect x="72" y="72" width="8" height="52" fill="url(#fs-stone)" />
          <rect x="72" y="72" width="8" height="52" fill="url(#fs-flute)" />
          <rect x="70.6" y="69" width="10.8" height="3.4" fill="#a48b6b" />
          <rect x="70" y="67" width="12" height="2.2" fill="#8a7358" />
        </g>
        <g>
          <path d="M86 124 V100 L88 97 L90 101 L92 98 L94 100 V124 Z" fill="url(#fs-stone)" />
          <path d="M86 124 V100 L88 97 L90 101 L92 98 L94 100 V124 Z" fill="url(#fs-flute)" />
        </g>
        <!-- Lierre qui retombe des chapiteaux. -->
        <path
          d="M8 66 q1 6 -1 12 q2 5 0 11 M76 72 q-1 7 1 13 q-2 6 0 10"
          stroke="#4f7a3c"
          stroke-width="1.1"
          fill="none"
          stroke-linecap="round"
        />
        <g fill="#6a9a4c">
          <circle cx="7.4" cy="72" r="0.9" />
          <circle cx="7" cy="80" r="0.9" />
          <circle cx="76.6" cy="80" r="0.9" />
          <circle cx="77" cy="90" r="0.9" />
        </g>
      </g>

      <!-- Le sol, et les gravats où l'on fouille. -->
      <path d="M0 122 Q30 118 50 121 T100 120 V180 H0 Z" fill="url(#fs-ground)" />
      <g class="rubble">
        <ellipse cx="54" cy="134" rx="14" ry="4.2" fill="#5e4a37" />
        <path d="M44 134 l4 -6 l6 1 l4 -5 l7 3 l2 7 Z" fill="#7a6450" />
        <path d="M58 133 l3 -4 l5 0 l2 4 Z" fill="#8d7458" />
        <!-- Un tambour de colonne tombé, couché. -->
        <rect x="68" y="129" width="16" height="6" rx="1.2" fill="url(#fs-stone-d)" />
        <rect x="68" y="129" width="16" height="6" rx="1.2" fill="url(#fs-flute)" />
      </g>
      <g fill="#2a2016" opacity="0.8">
        <ellipse cx="18" cy="146" rx="4" ry="1.2" />
        <ellipse cx="88" cy="150" rx="5" ry="1.4" />
      </g>
      <!-- Brume au ras du sol, qui dérive. -->
      <rect class="fog" x="-40" y="116" width="180" height="22" fill="url(#fs-fog)" />
    </svg>

    <span v-for="m in MOTES" :key="m" class="mote" :style="moteStyle(m)" aria-hidden="true" />

    <!-- 🗡️ Ce qu'il reste du héros tombé : son épée fichée en terre, son bouclier. -->
    <div class="relic" :class="{ glow: phase !== 'walk' }" aria-hidden="true">
      <span class="sword">🗡️</span><span class="shield">🛡️</span>
    </div>
    <div class="lamp" :class="{ on: phase !== 'walk' }" aria-hidden="true" />

    <!-- Le groupe arrive par la gauche, puis fouille. -->
    <div
      v-for="(m, k) in shownCast"
      :key="'m' + k"
      class="member"
      :class="{ searching: phase === 'search' }"
      :style="{
        left: (phase === 'walk' ? -14 : memberX(k)) + '%',
        top: memberY(k) + '%',
        transitionDelay: k * 0.14 + 's',
        animationDelay: k * 0.3 + 's',
      }"
    >
      <span class="shadow" />
      <div v-if="m.kind === 'hero' && hero" class="hero-av">
        <AventureAvatar :profile="hero.profile" :equipped="hero.equipped" />
      </div>
      <div v-else class="champ">
        <ChampionPortrait :champion-id="m.championId">{{ m.emoji }}</ChampionPortrait>
      </div>
    </div>

    <!-- 🎒 Les trouvailles : elles jaillissent des gravats, une par une, dans un halo. -->
    <div
      v-for="(f, i) in finds"
      :key="'f' + i"
      class="find"
      :class="{ shown: i < revealed }"
      :style="{ left: f.x + '%', '--dy': f.dy + 'px' }"
    >
      <span class="ring" />
      <span class="glow" />
      <span v-for="k in 8" :key="k" class="spark" :style="{ '--a': k * 45 + 'deg' }" />
      <span class="f-emo">{{ f.emoji }}</span>
      <span class="f-name">{{ f.name }}</span>
    </div>

    <div class="hud">
      <span class="chip">🏚️ Ruines d’un héros tombé</span>
      <q-btn flat dense no-caps class="skip" label="⏩ Passer" @click="skip" />
    </div>
    <div v-if="when" class="when">{{ when }}</div>

    <transition name="ban" mode="out-in">
      <div v-if="banner" :key="banner" class="banner">
        <div class="ban-main font-display">{{ banner }}</div>
      </div>
    </transition>

    <div v-if="ended" class="end">
      <div class="end-card">
        <div class="end-emo">🎒</div>
        <div class="end-title font-display">
          {{ finds.length }} trouvaille{{ finds.length > 1 ? 's' : '' }}
        </div>
        <div class="end-sub">Ce que le héros tombé avait laissé derrière lui.</div>
        <div class="end-list">
          <span v-for="(f, i) in grouped" :key="i" class="end-pill"
            ><b>{{ f.emoji }}</b> {{ f.name }} <i>×{{ f.n }}</i></span
          >
        </div>
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
// 🏚️ LA FOUILLE DES RUINES D'UN HÉROS TOMBÉ — plateau plein écran.
//
// ⚠️ Il ne tire RIEN : les objets montrés sont ceux du rapport (`PartyResult.fallen`),
// tirés au départ du voyage. La mise en scène (l'arrivée, la fouille, les objets qui
// jaillissent) n'est que du décor autour de ce résultat.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Equipped } from '@/lib/items';
import type { RiftCastMember } from '@/lib/riftStage';
import { SUPPLIES, SUPPLY_IDS, type SupplyStock } from '@/lib/supplies';
import AventureAvatar from '@/components/AventureAvatar.vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';

const props = defineProps<{
  supplies: SupplyStock;
  hero: { profile: 'puissant' | 'agile' | 'polyvalent'; equipped: Equipped } | null;
  cast: RiftCastMember[];
  when?: string | null;
}>();
const emit = defineEmits<{ done: [] }>();

const shownCast = computed(() => props.cast.slice(0, 3));
const memberX = (k: number) => [26, 13, 38][k] ?? 26;
const memberY = (k: number) => [80, 74, 74][k] ?? 80;

/** Un objet par exemplaire, dans l'ordre du catalogue — réparti sur la largeur. */
const finds = computed(() => {
  const list: { emoji: string; name: string; x: number; dy: number }[] = [];
  for (const id of SUPPLY_IDS)
    for (let n = 0; n < (props.supplies[id] ?? 0); n++)
      list.push({ emoji: SUPPLIES[id].emoji, name: SUPPLIES[id].name, x: 0, dy: 0 });
  const k = list.length;
  list.forEach((f, i) => {
    // Réparties sur la largeur, et sur DEUX hauteurs : côte à côte, leurs noms se
    // chevauchaient dès trois objets à 344 px (vu au banc).
    f.x = k === 1 ? 54 : 16 + (i * 68) / Math.max(1, k - 1);
    f.dy = i % 2 ? -70 : 0;
  });
  return list;
});
const grouped = computed(() => {
  const out: { emoji: string; name: string; n: number }[] = [];
  for (const id of SUPPLY_IDS) {
    const n = props.supplies[id] ?? 0;
    if (n > 0) out.push({ emoji: SUPPLIES[id].emoji, name: SUPPLIES[id].name, n });
  }
  return out;
});

const WALK_MS = 1600;
const SEARCH_MS = 1700;
const FIND_MS = 800;
const MOTES = 14;

const reduce =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

type Phase = 'walk' | 'search' | 'finds' | 'end';
const phase = ref<Phase>('walk');
const revealed = ref(0);
const ended = ref(false);
const banner = ref<string | null>(null);
/** Les gravats tremblent quand un objet en jaillit. */
const quake = ref('');

const timers: ReturnType<typeof setTimeout>[] = [];
function later(fn: () => void, ms: number): void {
  timers.push(setTimeout(fn, ms));
}
function clearAll(): void {
  timers.forEach(clearTimeout);
  timers.length = 0;
}
function moteStyle(m: number) {
  const f = (x: number) => Math.abs(x - Math.floor(x));
  const a = f(Math.sin(m * 12.9898) * 43758.5453);
  const b = f(Math.sin(m * 78.233) * 12345.6789);
  return {
    left: (a * 100).toFixed(1) + '%',
    top: (30 + b * 50).toFixed(1) + '%',
    animationDelay: (a * 5).toFixed(2) + 's',
    animationDuration: (6 + b * 5).toFixed(2) + 's',
  };
}

function reveal(i: number): void {
  revealed.value = i + 1;
  quake.value = 'qk';
  later(() => (quake.value = ''), 260);
}

function skip(): void {
  clearAll();
  banner.value = null;
  quake.value = '';
  revealed.value = finds.value.length;
  phase.value = 'end';
  ended.value = true;
}

onMounted(() => {
  if (reduce) return skip();
  later(() => {
    phase.value = 'search';
    banner.value = 'La fouille commence…';
  }, WALK_MS);
  later(() => {
    banner.value = null;
    phase.value = 'finds';
  }, WALK_MS + SEARCH_MS);
  finds.value.forEach((_, i) => later(() => reveal(i), WALK_MS + SEARCH_MS + 200 + i * FIND_MS));
  later(
    () => {
      phase.value = 'end';
      ended.value = true;
    },
    WALK_MS + SEARCH_MS + 900 + finds.value.length * FIND_MS,
  );
});
onBeforeUnmount(clearAll);
</script>

<style scoped lang="scss">
.fall {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #140f0a;
  color: #f3eee6;
  user-select: none;
}
.scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.clouds {
  animation: clouds 40s linear infinite alternate;
}
@keyframes clouds {
  to {
    transform: translateX(8px);
  }
}
.rays {
  mix-blend-mode: screen;
  animation: rays 4.5s ease-in-out infinite;
}
@keyframes rays {
  50% {
    opacity: 0.55;
  }
}
.fog {
  animation: fog 14s ease-in-out infinite alternate;
}
@keyframes fog {
  to {
    transform: translateX(22px);
  }
}
.qk .rubble {
  animation: qk 0.26s;
}
@keyframes qk {
  33% {
    transform: translate(0.4px, -0.3px);
  }
  66% {
    transform: translate(-0.4px, 0.2px);
  }
}
.mote {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(255, 226, 170, 0.75);
  box-shadow: 0 0 6px rgba(255, 226, 170, 0.8);
  animation: drift linear infinite;
  pointer-events: none;
}
@keyframes drift {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform: translate(26px, -60px);
    opacity: 0;
  }
}
.relic {
  position: absolute;
  left: 84%;
  top: 72%;
  font-size: 28px;
  transform: translate(-50%, -50%);
  transition: filter 0.8s;
  z-index: 30;
  .sword {
    display: inline-block;
    transform: rotate(135deg) translate(-4px, 6px);
  }
  &.glow {
    filter: drop-shadow(0 0 12px rgba(255, 210, 63, 0.75));
  }
}
.lamp {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.9s;
  z-index: 20;
  background: radial-gradient(circle at 42% 76%, rgba(255, 184, 96, 0.32), transparent 38%);
  &.on {
    opacity: 1;
    animation: flicker 1.3s ease-in-out infinite;
  }
}
@keyframes flicker {
  50% {
    opacity: 0.72;
  }
}
.shadow {
  position: absolute;
  left: 50%;
  bottom: -4px;
  width: 70%;
  height: 10px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  filter: blur(1px);
}
.member {
  position: absolute;
  width: 62px;
  height: 62px;
  transform: translate(-50%, -50%);
  transition: left 1.4s cubic-bezier(0.3, 0.7, 0.3, 1);
  z-index: 50;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5));
  &.searching {
    animation: dig 0.7s ease-in-out infinite;
  }
  .hero-av,
  .champ {
    width: 100%;
    height: 100%;
    font-size: 34px;
    display: grid;
    place-items: center;
  }
  .champ :deep(img) {
    border-radius: 50%;
    border: 2px solid rgba(255, 226, 170, 0.7);
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.35);
  }
}
@keyframes dig {
  50% {
    transform: translate(-50%, -44%) rotate(7deg);
  }
}
.find {
  position: absolute;
  top: 70%;
  width: 84px;
  transform: translate(-50%, 0) scale(0.2);
  opacity: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 60;
  transition:
    transform 0.6s cubic-bezier(0.2, 1.7, 0.4, 1),
    opacity 0.25s;
  .f-emo {
    position: relative;
    z-index: 2;
    font-size: 36px;
    line-height: 1;
    filter: drop-shadow(0 0 10px rgba(255, 210, 63, 0.9));
  }
  .f-name {
    position: relative;
    z-index: 2;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(20, 15, 10, 0.72);
    border: 1px solid rgba(255, 210, 63, 0.45);
    font-size: 10.5px;
    line-height: 1.2;
    text-align: center;
  }
  .glow {
    position: absolute;
    top: -10px;
    left: 50%;
    width: 70px;
    height: 70px;
    transform: translateX(-50%);
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 214, 120, 0.55), transparent 65%);
  }
  .ring {
    position: absolute;
    top: 2px;
    left: 50%;
    width: 44px;
    height: 44px;
    margin-left: -22px;
    border-radius: 50%;
    border: 2px solid rgba(255, 226, 150, 0.9);
    opacity: 0;
  }
  .spark {
    position: absolute;
    top: 20px;
    left: 50%;
    width: 4px;
    height: 10px;
    margin-left: -2px;
    border-radius: 2px;
    background: linear-gradient(#fff6d6, #ffc94a);
    opacity: 0;
    transform: rotate(var(--a)) translateY(0);
  }
  &.shown {
    opacity: 1;
    transform: translate(-50%, calc(-80px + var(--dy))) scale(1);
    .ring {
      animation: ring 0.7s ease-out forwards;
    }
    .spark {
      animation: spark 0.7s ease-out forwards;
    }
    .f-emo {
      animation: bob 2s ease-in-out 0.6s infinite;
    }
  }
}
@keyframes ring {
  0% {
    opacity: 1;
    transform: scale(0.3);
  }
  100% {
    opacity: 0;
    transform: scale(2.2);
  }
}
@keyframes spark {
  0% {
    opacity: 1;
    transform: rotate(var(--a)) translateY(0);
  }
  100% {
    opacity: 0;
    transform: rotate(var(--a)) translateY(-34px);
  }
}
@keyframes bob {
  50% {
    transform: translateY(-5px);
  }
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
  z-index: 90;
}
.chip {
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(20, 15, 10, 0.55);
  border: 1px solid rgba(255, 226, 170, 0.25);
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
.when {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  text-align: center;
  font-size: 12px;
  opacity: 0.75;
  z-index: 90;
}
.banner {
  position: absolute;
  left: 50%;
  top: 26%;
  transform: translate(-50%, -50%);
  width: 92%;
  text-align: center;
  z-index: 85;
  pointer-events: none;
}
.ban-main {
  font-size: 26px;
  letter-spacing: 1px;
  color: #ffe2a8;
  text-shadow:
    0 0 18px rgba(255, 170, 80, 0.6),
    0 3px 10px rgba(0, 0, 0, 0.8);
}
.ban-enter-active,
.ban-leave-active {
  transition:
    opacity 0.35s,
    transform 0.35s;
}
.ban-enter-from,
.ban-leave-to {
  opacity: 0;
  transform: translate(-50%, -40%);
}
.end {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 50% 45%, rgba(20, 15, 10, 0.45), rgba(0, 0, 0, 0.75));
  z-index: 100;
  padding: 16px;
  animation: fade 0.4s ease-out;
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
.end-card {
  width: 100%;
  max-width: 340px;
  text-align: center;
  padding: 22px 16px 16px;
  border-radius: 16px;
  background: linear-gradient(180deg, #2a2219, #1a1510);
  border: 1px solid rgba(255, 210, 63, 0.35);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.6),
    0 0 30px rgba(255, 180, 90, 0.12);
  animation: pop 0.45s cubic-bezier(0.2, 1.5, 0.4, 1);
}
@keyframes pop {
  from {
    transform: scale(0.85);
  }
}
.end-emo {
  font-size: 44px;
  filter: drop-shadow(0 0 12px rgba(255, 210, 63, 0.6));
}
.end-title {
  font-size: 24px;
  margin: 6px 0 2px;
}
.end-sub {
  font-size: 13px;
  opacity: 0.75;
  margin-bottom: 12px;
}
.end-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-bottom: 16px;
}
.end-pill {
  padding: 5px 11px;
  border-radius: 999px;
  background: rgba(255, 210, 63, 0.12);
  border: 1px solid rgba(255, 210, 63, 0.45);
  font-size: 13px;
  b {
    font-weight: 400;
  }
  i {
    font-style: normal;
    opacity: 0.8;
  }
}
.end-cta {
  min-height: 44px;
  width: 100%;
}
.reduce * {
  animation: none !important;
  transition: none !important;
}
</style>
