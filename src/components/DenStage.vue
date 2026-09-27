<template>
  <div class="den" :class="[shake, { reduce }]">
    <!-- 🎨 LE DÉCOR, en SVG et en couches : nuit étoilée, lune voilée, deux rangs de sapins,
         la grotte en roche moussue, ses yeux qui luisent, des os, la brume. `slice` le cale sur
         le bas de l'écran quelle que soit la largeur. -->
    <svg
      class="scene"
      viewBox="0 0 100 180"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ds-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#070812" />
          <stop offset="0.5" stop-color="#1b1d3a" />
          <stop offset="0.72" stop-color="#3a3350" />
        </linearGradient>
        <radialGradient id="ds-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#e8ecff" stop-opacity="0.55" />
          <stop offset="1" stop-color="#e8ecff" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="ds-moon" cx="0.38" cy="0.35" r="0.65">
          <stop offset="0" stop-color="#fffbe9" />
          <stop offset="0.7" stop-color="#d9d6c6" />
          <stop offset="1" stop-color="#b6b2a2" />
        </radialGradient>
        <linearGradient id="ds-rock" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#6a6070" />
          <stop offset="0.45" stop-color="#3c3542" />
          <stop offset="1" stop-color="#1c1820" />
        </linearGradient>
        <radialGradient id="ds-mouth" cx="0.5" cy="0.75" r="0.6">
          <stop offset="0" stop-color="#000" />
          <stop offset="0.7" stop-color="#0b0810" />
          <stop offset="1" stop-color="#251e2a" />
        </radialGradient>
        <linearGradient id="ds-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2c2a2a" />
          <stop offset="0.3" stop-color="#1c1a1b" />
          <stop offset="1" stop-color="#0a090a" />
        </linearGradient>
        <linearGradient id="ds-fog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#b8c2e0" stop-opacity="0" />
          <stop offset="0.5" stop-color="#b8c2e0" stop-opacity="0.2" />
          <stop offset="1" stop-color="#b8c2e0" stop-opacity="0" />
        </linearGradient>
        <radialGradient id="ds-eye" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#fff3a6" />
          <stop offset="0.4" stop-color="#ffb52e" />
          <stop offset="1" stop-color="#ff7a1a" stop-opacity="0" />
        </radialGradient>
      </defs>

      <rect width="100" height="180" fill="url(#ds-sky)" />
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
      <circle cx="74" cy="34" r="20" fill="url(#ds-halo)" />
      <circle cx="74" cy="34" r="7" fill="url(#ds-moon)" />
      <g fill="#a7a296" opacity="0.4">
        <circle cx="72" cy="32" r="1.2" />
        <circle cx="76.5" cy="36" r="0.8" />
      </g>
      <!-- Deux rangs de sapins : le plus lointain bleuté, le plus proche presque noir. -->
      <path :d="pines(96, 20, 7)" fill="#2a2d4a" opacity="0.9" />
      <path :d="pines(108, 26, 5)" fill="#16172a" />

      <!-- La grotte : une masse rocheuse, sa lèvre moussue, l'entrée noire. -->
      <path d="M40 128 Q42 96 58 86 Q70 76 86 80 Q102 84 104 104 L104 128 Z" fill="url(#ds-rock)" />
      <path
        d="M40 128 Q42 96 58 86 Q70 76 86 80 Q102 84 104 104"
        stroke="#5d7a4a"
        stroke-width="1.4"
        fill="none"
        opacity="0.8"
      />
      <path
        d="M52 110 q6 -4 12 -1 M80 92 q6 -3 12 1"
        stroke="#1a161c"
        stroke-width="0.6"
        fill="none"
      />
      <path d="M58 128 Q58 104 72 100 Q86 98 88 118 L88 128 Z" fill="url(#ds-mouth)" />
      <!-- Les yeux dans le noir : ils s'éteignent quand la bête sort. -->
      <g class="eyes" :class="{ lit: phase === 'lurk' }">
        <circle cx="70" cy="113" r="2.4" fill="url(#ds-eye)" />
        <circle cx="76" cy="113" r="2.4" fill="url(#ds-eye)" />
      </g>

      <!-- Le sol, des os, quelques herbes. -->
      <path d="M0 124 Q25 120 50 126 T100 124 V180 H0 Z" fill="url(#ds-ground)" />
      <g stroke="#d9d2c0" stroke-width="1" stroke-linecap="round" opacity="0.75">
        <path d="M50 140 l7 2" />
        <path d="M64 150 l6 -3" />
        <path d="M30 156 l5 3" />
      </g>
      <g fill="#d9d2c0" opacity="0.75">
        <circle cx="50" cy="140" r="0.9" />
        <circle cx="57" cy="142" r="0.9" />
        <circle cx="64" cy="150" r="0.9" />
        <circle cx="70" cy="147" r="0.9" />
      </g>
      <g stroke="#2f3a28" stroke-width="0.7" stroke-linecap="round">
        <path d="M10 130 l1 -4 M12 130 l0 -5 M14 130 l-1 -4" />
        <path d="M92 134 l1 -4 M94 134 l0 -5 M96 134 l-1 -4" />
      </g>
      <rect class="fog" x="-40" y="118" width="180" height="24" fill="url(#ds-fog)" />
    </svg>

    <span v-for="m in MOTES" :key="m" class="mote" :style="moteStyle(m)" aria-hidden="true" />
    <!-- Le clair de lune sur la scène : une lueur froide, un liseré sur la bête. -->
    <div class="moonlight" aria-hidden="true" />

    <!-- 🐺 LA BÊTE — elle sort de la grotte en rugissant, puis se bat. -->
    <div
      class="beast"
      :class="{ out: phase !== 'lurk', striking: beastStrike, hurt: beastHurt, dead: beastDead }"
    >
      <span class="roar" :class="{ go: roar }" />
      <span class="shadow big" />
      <img
        v-if="art"
        :src="art"
        :alt="battle.name"
        class="art"
        draggable="false"
        @error="artFailed = true"
      />
      <span v-else class="emo">{{ battle.emoji }}</span>
    </div>

    <!-- ⚔️ LE GROUPE — le héros (son avatar) et les champions (leur portrait). -->
    <div
      v-for="(m, k) in shownCast"
      :key="'m' + k"
      class="member"
      :class="{ lunge: lunging === k, hurt: partyHurt, fallen: wiped }"
      :style="{ left: memberX(k) + '%', top: memberY(k) + '%' }"
    >
      <span class="shadow" />
      <div v-if="m.kind === 'hero' && hero" class="hero-av">
        <AventureAvatar :profile="hero.profile" :equipped="hero.equipped" />
      </div>
      <div v-else class="champ">
        <ChampionPortrait :champion-id="m.championId">{{ m.emoji }}</ChampionPortrait>
      </div>
    </div>

    <!-- Griffures (trois traits), lames, poussière, nombres. -->
    <span
      v-for="s in slashes"
      :key="s.id"
      class="claw"
      :class="s.side"
      :style="{ left: s.x + '%', top: s.y + '%' }"
      ><i /><i /><i
    /></span>
    <span
      v-for="p in dust"
      :key="p.id"
      class="dust"
      :style="{ left: p.x + '%', top: p.y + '%', '--dx': p.dx + 'px', '--dy': p.dy + 'px' }"
    />
    <span
      v-for="p in pops"
      :key="p.id"
      class="pop"
      :class="'pop-' + p.kind"
      :style="{ left: p.x + '%', top: p.y + '%' }"
      >{{ p.text }}</span
    >

    <div class="vig" :style="{ opacity: hitVig }" aria-hidden="true" />
    <div class="flash" :class="flash" aria-hidden="true" />

    <div class="hud">
      <span class="chip">🐺 Tanière · {{ battle.name }}</span>
      <q-btn flat dense no-caps class="skip" label="⏩ Passer" @click="skip" />
    </div>
    <div v-if="when" class="when">{{ when }}</div>
    <div class="bars">
      <div class="bar ours">
        <div class="bar-lab">
          <span>Ton groupe</span><b>{{ fmt(ourPv) }}</b>
        </div>
        <div class="track">
          <i class="ghost" :style="{ width: ourGhost + '%' }" />
          <i class="fill" :class="{ low: ourPct <= 30 }" :style="{ width: ourPct + '%' }" />
        </div>
      </div>
      <div class="bar theirs">
        <div class="bar-lab">
          <span>{{ battle.name }}</span
          ><b>{{ fmt(beastPv) }}</b>
        </div>
        <div class="track">
          <i class="ghost" :style="{ width: beastGhost + '%' }" />
          <i class="fill" :style="{ width: beastPct + '%' }" />
        </div>
      </div>
    </div>

    <transition name="ban" mode="out-in">
      <div v-if="banner" :key="banner.id" class="banner" :class="'ban-' + banner.kind">
        <div class="ban-main font-display">{{ banner.main }}</div>
        <div v-if="banner.sub" class="ban-sub">{{ banner.sub }}</div>
      </div>
    </transition>

    <!-- L'écran de fin est un MOMENT du jeu : on n'émet `done` qu'au clic. -->
    <div v-if="ended" class="end">
      <div class="end-card" :class="{ lose: !win }">
        <div class="end-emo">{{ win ? '🏆' : '💀' }}</div>
        <div class="end-title font-display">{{ win ? 'La bête est tombée' : 'Repoussés' }}</div>
        <div class="end-sub">
          {{
            win
              ? 'Une leçon que tes champions n’oublieront pas : l’XP de la tanière est triplée.'
              : 'La bête garde sa tanière. Reviens plus fort.'
          }}
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
// 🐺 LE DUEL D'UNE TANIÈRE — plateau plein écran.
//
// ⚠️ Il ne calcule AUCUN combat : il rejoue `PartyResult.den`, le log du VRAI combat résumé
// en quelques temps (`bossReplaySteps` : aucun dégât perdu, les PV de fin sont ceux du
// combat). Même règle que la bataille rangée et l'incursion.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Equipped } from '@/lib/items';
import type { DenBattle } from '@/lib/expedition';
import type { RiftCastMember } from '@/lib/riftStage';
import { speciesArt } from '@/data/monsterArt';
import AventureAvatar from '@/components/AventureAvatar.vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';

const props = defineProps<{
  battle: DenBattle;
  win: boolean;
  hero: { profile: 'puissant' | 'agile' | 'polyvalent'; equipped: Equipped } | null;
  cast: RiftCastMember[];
  when?: string | null;
}>();
const emit = defineEmits<{ done: [] }>();

/** Deux places dans une tanière (le héros en vaut deux) : au plus deux silhouettes. */
const shownCast = computed(() => props.cast.slice(0, 2));
const memberX = (k: number) => (shownCast.value.length === 1 ? 26 : k === 0 ? 30 : 15);
const memberY = (k: number) => (shownCast.value.length === 1 ? 72 : k === 0 ? 76 : 68);

const artFailed = ref(false);
const art = computed(() => (artFailed.value ? null : speciesArt(props.battle.name)));

/** Les étoiles, figées par l'index (sinon elles sauteraient à chaque rendu). */
const f01 = (x: number) => Math.abs(x - Math.floor(x));
const STARS = Array.from({ length: 34 }, (_, i) => ({
  i,
  x: +(f01(Math.sin(i * 91.7) * 4375.5) * 100).toFixed(1),
  y: +(f01(Math.sin(i * 17.3) * 9137.1) * 78).toFixed(1),
  r: 0.18 + f01(Math.sin(i * 3.1) * 777.7) * 0.32,
  d: +(f01(Math.sin(i * 5.7) * 333.3) * 4).toFixed(2),
}));
/** Une rangée de sapins en silhouette, de hauteur `h` posée sur la ligne `base`. */
function pines(base: number, h: number, w: number): string {
  let d = `M-4 ${base + 20} L-4 ${base}`;
  for (let x = -4, i = 0; x < 104; x += w, i++) {
    const t = h * (0.55 + f01(Math.sin((x + base) * 1.37) * 911.1) * 0.45);
    d += ` L${x + w / 2} ${base - t} L${x + w} ${base}`;
    if (i > 40) break;
  }
  return d + ` L104 ${base + 20} Z`;
}

// ── Rythme (ms) ──
const LURK_MS = 1500;
const EMERGE_MS = 1100;
const stepMs = computed(() => (props.battle.steps.length <= 3 ? 1800 : 1300));
const OUTCOME_MS = 1700;
const MOTES = 10;

const reduce =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

type Phase = 'lurk' | 'fight' | 'end';
const phase = ref<Phase>('lurk');
const ourPv = ref(props.battle.maxPv);
const beastPv = ref(props.battle.beastPv);
const ourGhost = ref(100);
const beastGhost = ref(100);
const lunging = ref(-1);
const partyHurt = ref(false);
const wiped = ref(false);
const beastStrike = ref(false);
const beastHurt = ref(false);
const beastDead = ref(false);
const roar = ref(false);
const hitVig = ref(0);
const shake = ref('');
const flash = ref('');
const ended = ref(false);
const banner = ref<{ id: number; kind: string; main: string; sub: string } | null>(null);
const slashes = ref<{ id: number; x: number; y: number; side: string }[]>([]);
const dust = ref<{ id: number; x: number; y: number; dx: number; dy: number }[]>([]);
const pops = ref<{ id: number; x: number; y: number; text: string; kind: string }[]>([]);
let uid = 0;

const pct = (v: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0);
const ourPct = computed(() => pct(ourPv.value, props.battle.maxPv));
const beastPct = computed(() => pct(beastPv.value, props.battle.beastPv));

const timers: ReturnType<typeof setTimeout>[] = [];
function later(fn: () => void, ms: number): void {
  timers.push(setTimeout(fn, ms));
}
function clearAll(): void {
  timers.forEach(clearTimeout);
  timers.length = 0;
}
function moteStyle(m: number) {
  const a = f01(Math.sin(m * 12.9898) * 43758.5453);
  const b = f01(Math.sin(m * 78.233) * 12345.6789);
  return {
    left: (a * 100).toFixed(1) + '%',
    top: (40 + b * 40).toFixed(1) + '%',
    animationDelay: (a * 5).toFixed(2) + 's',
    animationDuration: (6 + b * 5).toFixed(2) + 's',
  };
}
function say(kind: string, main: string, sub = '', ms = 1400): void {
  const id = ++uid;
  banner.value = { id, kind, main, sub };
  later(() => {
    if (banner.value?.id === id) banner.value = null;
  }, ms);
}
function pop(x: number, y: number, text: string, kind: string): void {
  const id = ++uid;
  pops.value.push({ id, x, y, text, kind });
  later(() => (pops.value = pops.value.filter((p) => p.id !== id)), 1000);
}
function claw(x: number, y: number, side: string): void {
  const id = ++uid;
  slashes.value.push({ id, x, y, side });
  later(() => (slashes.value = slashes.value.filter((s) => s.id !== id)), 480);
}
function puff(x: number, y: number, n = 7): void {
  for (let k = 0; k < n; k++) {
    const id = ++uid;
    const a = (k / n) * Math.PI * 2;
    dust.value.push({ id, x, y, dx: Math.cos(a) * 26, dy: Math.sin(a) * 14 - 8 });
    later(() => (dust.value = dust.value.filter((p) => p.id !== id)), 650);
  }
}
function flag(r: typeof shake, v: string, ms: number): void {
  r.value = v;
  later(() => {
    if (r.value === v) r.value = '';
  }, ms);
}
function toggle(r: typeof partyHurt, ms: number): void {
  r.value = true;
  later(() => (r.value = false), ms);
}
const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

/** Un temps du duel : le groupe frappe (s'il a joué), puis la bête (si elle a joué). */
function playStep(i: number): void {
  const s = props.battle.steps[i];
  if (!s) return finish();
  const mid = stepMs.value / 2;
  if (s.groupTurns > 0) {
    lunging.value = i % Math.max(1, shownCast.value.length);
    later(() => (lunging.value = -1), 420);
    later(() => {
      beastGhost.value = beastPct.value;
      beastPv.value = s.bossPv;
      later(() => (beastGhost.value = beastPct.value), 420);
      toggle(beastHurt, 320);
      claw(72, 62, 'ally');
      puff(72, 72);
      pop(72, 44, s.dealt > 0 ? `−${fmt(s.dealt)}` : 'Esquivé', s.crit ? 'crit' : 'dmg');
      if (s.crit) {
        flag(flash, 'crit', 260);
        flag(shake, 'sh-m', 320);
      }
    }, 240);
  }
  if (s.bossTurns > 0)
    later(() => {
      beastStrike.value = true;
      later(() => (beastStrike.value = false), 380);
      later(() => {
        ourGhost.value = ourPct.value;
        ourPv.value = s.pv;
        later(() => (ourGhost.value = ourPct.value), 420);
        const lost = props.battle.maxPv > 0 ? s.taken / props.battle.maxPv : 0;
        hitVig.value = Math.min(0.55, lost * 3);
        later(() => (hitVig.value = 0), 380);
        toggle(partyHurt, 320);
        claw(26, 70, 'foe');
        puff(26, 80, 5);
        pop(26, 54, s.taken > 0 ? `−${fmt(s.taken)}` : 'Esquivé', 'hurt');
        if (lost > 0.12) flag(shake, 'sh-l', 360);
      }, 200);
    }, mid);
  later(() => playStep(i + 1), stepMs.value);
}

function finish(): void {
  if (props.win) {
    beastDead.value = true;
    puff(72, 74, 12);
    flag(flash, 'kill', 520);
    flag(shake, 'sh-l', 420);
    say('win', 'LA BÊTE EST TOMBÉE', '', OUTCOME_MS);
  } else {
    wiped.value = true;
    say('lose', 'REPOUSSÉS', 'La bête garde sa tanière', OUTCOME_MS);
  }
  later(() => {
    phase.value = 'end';
    ended.value = true;
  }, OUTCOME_MS);
}

/** L'état final, sans animation (Passer, ou mouvement réduit). */
function skip(): void {
  clearAll();
  const last = props.battle.steps[props.battle.steps.length - 1];
  ourPv.value = last ? last.pv : props.battle.maxPv;
  beastPv.value = last ? last.bossPv : props.win ? 0 : props.battle.beastPv;
  ourGhost.value = ourPct.value;
  beastGhost.value = beastPct.value;
  lunging.value = -1;
  banner.value = null;
  pops.value = [];
  slashes.value = [];
  dust.value = [];
  beastDead.value = props.win;
  wiped.value = !props.win;
  phase.value = 'end';
  ended.value = true;
}

onMounted(() => {
  if (reduce) return skip();
  say('open', 'LA TANIÈRE', 'Quelque chose remue dans le noir…', LURK_MS);
  later(() => {
    phase.value = 'fight';
    roar.value = true;
    flag(shake, 'sh-m', 420);
  }, LURK_MS);
  later(() => (roar.value = false), LURK_MS + 900);
  later(() => playStep(0), LURK_MS + EMERGE_MS);
});
onBeforeUnmount(clearAll);
</script>

<style scoped lang="scss">
.den {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a090a;
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
  animation: tw 3.2s ease-in-out infinite;
}
@keyframes tw {
  50% {
    opacity: 0.25;
  }
}
.eyes {
  opacity: 0;
  transition: opacity 0.5s;
  &.lit {
    opacity: 1;
    animation: blink 1.4s steps(1) infinite;
  }
}
@keyframes blink {
  0%,
  86% {
    opacity: 1;
  }
  88%,
  95% {
    opacity: 0;
  }
}
.fog {
  animation: fog 12s ease-in-out infinite alternate;
}
@keyframes fog {
  to {
    transform: translateX(-24px);
  }
}
.mote {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(190, 210, 255, 0.55);
  box-shadow: 0 0 6px rgba(190, 210, 255, 0.7);
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
    transform: translate(-30px, -50px);
    opacity: 0;
  }
}
.moonlight {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 74% 18%, rgba(200, 212, 255, 0.12), transparent 55%);
  z-index: 5;
}
.shadow {
  position: absolute;
  left: 50%;
  bottom: -4px;
  width: 70%;
  height: 10px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  filter: blur(1px);
  &.big {
    width: 88%;
    height: 16px;
  }
}
.beast {
  position: absolute;
  left: 72%;
  top: 66%;
  width: 40%;
  max-width: 220px;
  aspect-ratio: 1;
  transform: translate(-50%, -62%) scale(0.45);
  opacity: 0;
  z-index: 40;
  transition:
    transform 1s cubic-bezier(0.2, 0.9, 0.25, 1.15),
    opacity 0.6s,
    filter 0.3s;
  &.out {
    transform: translate(-50%, -70%) scale(1);
    opacity: 1;
  }
  &.striking {
    transform: translate(-82%, -70%) scale(1.08);
    transition-duration: 0.18s;
  }
  &.hurt {
    filter: brightness(2.2) saturate(0.3);
  }
  &.dead {
    transform: translate(-44%, -48%) rotate(14deg) scale(0.9);
    opacity: 0.3;
    filter: grayscale(1) blur(0.5px);
    transition-duration: 1.2s;
  }
  .art {
    position: relative;
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(-3px -2px 0 rgba(200, 212, 255, 0.35))
      drop-shadow(0 10px 14px rgba(0, 0, 0, 0.7));
  }
  .emo {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    font-size: 96px;
    filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.7));
  }
}
.roar {
  position: absolute;
  left: 50%;
  top: 48%;
  width: 60%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%) scale(0.2);
  border-radius: 50%;
  border: 3px solid rgba(255, 190, 110, 0.8);
  opacity: 0;
  pointer-events: none;
  &.go {
    animation: roar 0.9s ease-out;
  }
}
@keyframes roar {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(0.2);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(3.2);
  }
}
.member {
  position: absolute;
  width: 66px;
  height: 66px;
  transform: translate(-50%, -50%);
  transition:
    transform 0.2s,
    filter 0.2s,
    opacity 0.6s;
  z-index: 50;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.6));
  &.lunge {
    transform: translate(46%, -56%);
  }
  &.hurt {
    filter: brightness(1.8) sepia(1) hue-rotate(-30deg);
  }
  &.fallen {
    transform: translate(-50%, -30%) rotate(-80deg);
    opacity: 0.4;
  }
  .hero-av,
  .champ {
    width: 100%;
    height: 100%;
    font-size: 38px;
    display: grid;
    place-items: center;
  }
  .champ :deep(img) {
    border-radius: 50%;
    border: 2px solid rgba(200, 212, 255, 0.7);
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.35);
  }
}
.claw {
  position: absolute;
  width: 56px;
  height: 56px;
  transform: translate(-50%, -50%) rotate(-24deg);
  pointer-events: none;
  z-index: 60;
  i {
    position: absolute;
    top: 0;
    width: 4px;
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(transparent, #fff 45%, #ffe6b0 55%, transparent);
    box-shadow: 0 0 8px rgba(255, 230, 170, 0.9);
    animation: claw 0.45s ease-out forwards;
    &:nth-child(1) {
      left: 12px;
    }
    &:nth-child(2) {
      left: 26px;
      animation-delay: 0.04s;
    }
    &:nth-child(3) {
      left: 40px;
      animation-delay: 0.08s;
    }
  }
  &.foe i {
    background: linear-gradient(transparent, #ff8a5c 45%, #ff4a2a 55%, transparent);
    box-shadow: 0 0 8px rgba(255, 90, 50, 0.9);
  }
}
@keyframes claw {
  0% {
    opacity: 0;
    transform: scaleY(0.2);
  }
  30% {
    opacity: 1;
    transform: scaleY(1);
  }
  100% {
    opacity: 0;
    transform: scaleY(1.1);
  }
}
.dust {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(150, 140, 130, 0.6);
  pointer-events: none;
  z-index: 55;
  animation: dust 0.65s ease-out forwards;
}
@keyframes dust {
  to {
    transform: translate(var(--dx), var(--dy)) scale(2.2);
    opacity: 0;
  }
}
.pop {
  position: absolute;
  transform: translate(-50%, -50%);
  font-family: Oswald, sans-serif;
  font-weight: 700;
  font-size: 22px;
  text-shadow:
    0 2px 0 rgba(0, 0, 0, 0.6),
    0 0 12px rgba(0, 0, 0, 0.8);
  pointer-events: none;
  z-index: 70;
  animation: rise 1s ease-out forwards;
  &.pop-crit {
    color: #ffd23f;
    font-size: 30px;
  }
  &.pop-hurt {
    color: #ff6a45;
  }
}
@keyframes rise {
  0% {
    opacity: 0;
    transform: translate(-50%, -30%) scale(0.6);
  }
  15% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.15);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -140%) scale(1);
  }
}
.vig {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 80;
  background: radial-gradient(ellipse at center, transparent 45%, rgba(200, 20, 20, 0.85));
  transition: opacity 0.3s;
}
.flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 81;
  opacity: 0;
  &.crit {
    background: rgba(255, 230, 150, 0.35);
    opacity: 1;
  }
  &.kill {
    background: rgba(255, 255, 255, 0.55);
    opacity: 1;
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
  background: rgba(10, 10, 20, 0.55);
  border: 1px solid rgba(200, 212, 255, 0.22);
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
  bottom: calc(104px + env(safe-area-inset-bottom));
  text-align: center;
  font-size: 12px;
  opacity: 0.75;
  z-index: 90;
}
.bars {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: calc(14px + env(safe-area-inset-bottom));
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(10, 10, 16, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(4px);
  z-index: 90;
}
.bar-lab {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 3px;
  span {
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  b {
    font-family: Oswald, sans-serif;
    font-weight: 600;
  }
}
.track {
  position: relative;
  height: 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
  i {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 6px;
    transition: width 0.35s;
  }
  .ghost {
    background: rgba(255, 255, 255, 0.35);
    transition-duration: 0.9s;
  }
}
.ours .fill {
  background: linear-gradient(90deg, #5aa84c, #9ad86c);
  &.low {
    background: linear-gradient(90deg, #c8412b, #ff6a45);
  }
}
.theirs .fill {
  background: linear-gradient(90deg, #8a2d20, #d95b3d);
}
.banner {
  position: absolute;
  left: 50%;
  top: 28%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 85;
  pointer-events: none;
  width: 92%;
}
.ban-main {
  font-size: 30px;
  letter-spacing: 2px;
  text-shadow: 0 3px 12px rgba(0, 0, 0, 0.8);
}
.ban-sub {
  font-size: 14px;
  opacity: 0.85;
  margin-top: 2px;
}
.ban-open .ban-main {
  color: #c8d4ff;
  text-shadow:
    0 0 18px rgba(150, 170, 255, 0.55),
    0 3px 12px rgba(0, 0, 0, 0.8);
}
.ban-win .ban-main {
  color: #ffd23f;
  text-shadow:
    0 0 20px rgba(255, 190, 60, 0.6),
    0 3px 12px rgba(0, 0, 0, 0.8);
}
.ban-lose .ban-main {
  color: #ff6a45;
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
  background: radial-gradient(circle at 50% 45%, rgba(10, 10, 20, 0.45), rgba(0, 0, 0, 0.78));
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
  background: linear-gradient(180deg, #232233, #15141d);
  border: 1px solid rgba(255, 210, 63, 0.35);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.6),
    0 0 30px rgba(255, 190, 60, 0.12);
  animation: pop 0.45s cubic-bezier(0.2, 1.5, 0.4, 1);
  &.lose {
    border-color: rgba(255, 106, 69, 0.4);
  }
}
@keyframes pop {
  from {
    transform: scale(0.85);
  }
}
.end-emo {
  font-size: 46px;
  filter: drop-shadow(0 0 12px rgba(255, 210, 63, 0.55));
}
.end-title {
  font-size: 24px;
  margin: 6px 0;
}
.end-sub {
  font-size: 14px;
  opacity: 0.85;
  margin-bottom: 14px;
}
.end-cta {
  min-height: 44px;
  width: 100%;
}
.sh-m {
  animation: shake-m 0.32s;
}
.sh-l {
  animation: shake-l 0.36s;
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
  20% {
    transform: translate(-6px, 2px);
  }
  40% {
    transform: translate(6px, -2px);
  }
  60% {
    transform: translate(-4px, 2px);
  }
  80% {
    transform: translate(3px, -1px);
  }
}
.reduce * {
  animation: none !important;
  transition: none !important;
}
</style>
