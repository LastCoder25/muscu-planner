<!--
  SiegeStage — REJEU animé d'un siège.

  ⚠️ Ne décide RIEN : il rejoue `buildSiegeStage(report)`, qui lui-même ne fait que
  relire le log de `simulateDungeon`. L'issue, les groupes repoussés et les récompenses
  sont déjà écrits — l'animation est le VERDICT, pas l'épreuve. C'est précisément ce qui
  la distingue de l'arène (masquée derrière `ARENA_ENABLED`) : là-bas on regardait un
  combat sans avoir rien décidé ; ici la décision a eu lieu avant, en bâtissant.

  Elle se lance DIRECTEMENT à la résolution, avant toute annonce du résultat : le rapport
  spoilerait l'issue et lui retirerait tout enjeu.
-->
<template>
  <div class="siege" :class="{ shake: shakeLevel > 0, 'shake-l': shakeLevel > 1 }">
    <!-- Voile rouge quand le rempart encaisse -->
    <div class="hurt" :style="{ opacity: hurt }" />

    <svg viewBox="0 0 200 200" class="board" role="img" aria-label="Assaut de la base">
      <defs>
        <radialGradient id="siege-ground" cx="50%" cy="50%">
          <stop offset="0%" stop-color="#2b241a" />
          <stop offset="100%" stop-color="#141009" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="200" height="200" fill="url(#siege-ground)" />

      <!-- ── L'ENCEINTE (même géométrie que l'écran « Ma base ») ── -->
      <polygon :points="wallPoints" class="s-wall" :class="{ breached }" />
      <rect
        v-for="(m, i) in merlons"
        :key="'m' + i"
        :x="m.x - 3.1"
        :y="m.y - 3.1"
        width="6.2"
        height="6.2"
        :transform="`rotate(${m.a} ${m.x} ${m.y})`"
        class="s-merlon"
        :class="{ breached }"
      />
      <polygon :points="innerPoints" class="s-yard" />

      <!-- Les tourelles : toutes en place, elles tirent à tour de rôle -->
      <g v-for="(p, i) in octagon" :key="'t' + i">
        <template v-if="hasTurrets">
          <rect
            :x="p.x - 6.5"
            :y="p.y - 8"
            width="13"
            height="16"
            rx="1.5"
            class="s-tur"
            :class="{ fire: firingTurret === i }"
          />
          <rect
            v-for="k in 3"
            :key="k"
            :x="p.x - 6.5 + (k - 1) * 4.7"
            :y="p.y - 11"
            width="3.6"
            height="3.6"
            class="s-tur"
            :class="{ fire: firingTurret === i }"
          />
        </template>
        <circle v-else :cx="p.x" :cy="p.y" r="7.5" class="s-tur-empty" />
      </g>

      <!-- ── LA COUR : ce qu'on défend, et ce qui aide ── -->
      <!-- Familiers postés, au centre : leur pulsation part vers ce qu'ils renforcent. -->
      <g v-if="familiars.length" class="s-gar">
        <circle
          cx="100"
          cy="100"
          :r="26 + pulse * 5"
          class="s-gar-ring"
          :style="{ opacity: 0.25 - pulse * 0.18 }"
        />
        <text
          v-for="(f, i) in familiars"
          :key="'f' + i"
          :x="100 + (i - (familiars.length - 1) / 2) * 20"
          y="104"
          class="s-fam"
        >
          {{ f }}
        </text>
      </g>
      <text v-else x="100" y="104" class="s-empty">la ville, sans garnison</text>

      <!-- Le héros sur le rempart, s'il est resté -->
      <g v-if="report.heroHome">
        <circle :cx="100" :cy="heroY" r="7" class="s-hero-bg" />
        <text :x="100" :y="heroY + 3.4" class="s-hero">🦸</text>
      </g>

      <!-- ── LES ASSAILLANTS ── -->
      <g
        v-for="(b, i) in stage.bodies"
        :key="b.id"
        class="s-foe"
        :class="{ dead: deadAt(i), champ: b.champion, hit: hitBody === i }"
        :transform="`translate(${bodyPos(b, i).x} ${bodyPos(b, i).y})`"
      >
        <circle r="6.5" class="s-foe-bg" />
        <text y="3" class="s-foe-emo">{{ deadAt(i) ? '💀' : b.emoji }}</text>
      </g>

      <!-- Trait de tir : de la tourelle vers sa cible -->
      <line v-if="bolt" :x1="bolt.x1" :y1="bolt.y1" :x2="bolt.x2" :y2="bolt.y2" class="s-bolt" />

      <!-- Dégâts flottants -->
      <text v-if="float" :x="float.x" :y="float.y" class="s-float" :class="{ crit: float.crit }">
        −{{ float.n }}
      </text>
    </svg>

    <!-- ── HUD ── -->
    <div class="hud">
      <div class="hud-row">
        <span class="hud-tag"
          >{{ FACTION_EMOJI[report.faction] }} {{ FACTION_LABEL[report.faction] }}</span
        >
        <span class="hud-tag"
          >Groupe {{ Math.min(curGroup + 1, stage.total) }}/{{ stage.total }}</span
        >
        <span class="hud-tag">Debout {{ standing }}</span>
      </div>
      <div class="pv-wrap">
        <div class="pv-ghost" :style="{ width: ghostPct + '%' }" />
        <div class="pv" :class="{ low: pvPct < 30 }" :style="{ width: pvPct + '%' }" />
        <span class="pv-txt">🧱 {{ Math.max(0, curPv) }} / {{ stage.maxPv }}</span>
      </div>
    </div>

    <button v-if="!finished" class="skip" @click="skip">⏩ Passer</button>

    <!-- Bannière de vague -->
    <transition name="ban">
      <div v-if="banner" class="banner">{{ banner }}</div>
    </transition>

    <!-- Écran de fin : le moment du jeu, on ne l'escamote pas -->
    <transition name="end">
      <div v-if="finished" class="endcard">
        <div class="end-emo">{{ stage.held ? '🛡️' : '💥' }}</div>
        <div class="end-title font-display">
          {{ stage.held ? 'Assaut repoussé' : 'L’enceinte a cédé' }}
        </div>
        <div class="end-sub">
          {{ stage.defeated }}/{{ stage.total }} groupes abattus · {{ corpseCount }} corps sur le
          terrain
          <template v-if="report.heroHome"> · héros au rempart</template>
        </div>
        <button class="end-cta" @click="emit('done')">Voir le rapport</button>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { buildSiegeStage, type SiegeBody } from '@/lib/siegeStage';
import {
  FACTION_EMOJI,
  FACTION_LABEL,
  TURRET_SLOTS,
  turretCount,
  type RaidReport,
} from '@/lib/raid';

const props = defineProps<{
  report: RaidReport;
  turretLevel: number;
  /** Emojis des familiers postés — ce que le chenil apporte, rendu visible. */
  familiars: string[];
}>();
const emit = defineEmits<{ done: [] }>();

const stage = computed(() => buildSiegeStage(props.report, turretCount(props.turretLevel)));
const hasTurrets = computed(() => props.turretLevel > 0);

// ── Géométrie : la MÊME que l'écran « Ma base », pour qu'on reconnaisse son enceinte ──
const WALL_R = 80;
const octagon = computed(() =>
  Array.from({ length: TURRET_SLOTS }, (_, i) => {
    const a = (i / TURRET_SLOTS) * Math.PI * 2 - Math.PI / 2 + Math.PI / TURRET_SLOTS;
    return { x: 100 + Math.cos(a) * WALL_R, y: 100 + Math.sin(a) * WALL_R };
  }),
);
const wallPoints = computed(() => octagon.value.map((p) => `${p.x},${p.y}`).join(' '));
const innerPoints = computed(() =>
  octagon.value.map((p) => `${100 + (p.x - 100) * 0.86},${100 + (p.y - 100) * 0.86}`).join(' '),
);
const merlons = computed(() =>
  octagon.value.map((p, i) => {
    const q = octagon.value[(i + 1) % octagon.value.length]!;
    return {
      x: (p.x + q.x) / 2,
      y: (p.y + q.y) / 2,
      a: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI,
    };
  }),
);
const APOTHEM = WALL_R * Math.cos(Math.PI / TURRET_SLOTS);
const heroY = 100 - APOTHEM + 4;

// ── Déroulé ──
const idx = ref(-1); // index du beat courant
const finished = ref(false);
const hurt = ref(0);
const shakeLevel = ref(0);
const banner = ref('');
const bolt = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
const float = ref<{ x: number; y: number; n: number; crit: boolean } | null>(null);
const firingTurret = ref(-1);
const hitBody = ref(-1);
const pulse = ref(0);
let timer: ReturnType<typeof setTimeout> | null = null;
let pulseTimer: ReturnType<typeof setInterval> | null = null;

const cur = computed(() => (idx.value >= 0 ? (stage.value.beats[idx.value] ?? null) : null));
const curGroup = computed(() => cur.value?.group ?? 0);
const curPv = computed(() => cur.value?.basePv ?? stage.value.maxPv);
const pvPct = computed(() => (curPv.value / Math.max(1, stage.value.maxPv)) * 100);
const ghostPct = ref(100);
const breached = computed(() => finished.value && !stage.value.held);
const corpseCount = computed(() => new Set(stage.value.beats.flatMap((b) => b.kills)).size);

/** Corps déjà tombés à cet instant — dérivé des morts ANNONCÉES, donc toujours d'accord
 *  avec les barres et avec le rapport. */
const dead = computed(() => {
  const s = new Set<number>();
  for (let i = 0; i <= idx.value; i++) {
    for (const k of stage.value.beats[i]?.kills ?? []) s.add(k);
  }
  return s;
});
function deadAt(i: number): boolean {
  return dead.value.has(i);
}
const standing = computed(() => stage.value.bodies.length - dead.value.size);

/** Un corps attend son tour au loin, monte à l'assaut quand SON groupe est engagé, et
 *  reste où il est tombé. */
function bodyPos(b: SiegeBody, i: number): { x: number; y: number } {
  const engaged = idx.value >= 0 && curGroup.value >= b.group;
  const d = engaged || dead.value.has(i) ? APOTHEM + 9 : b.dist;
  return { x: 100 + Math.cos(b.angle) * d, y: 100 + Math.sin(b.angle) * d };
}

/** Cadence : plus l'assaut est long, plus on serre — un siège de 200 temps ne doit pas
 *  durer trois minutes. Mêmes paliers que le plateau de l'arène. */
const stepMs = computed(() => {
  const n = stage.value.beats.length;
  return n > 200 ? 62 : n > 90 ? 85 : n > 40 ? 120 : 180;
});

function reduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

function play() {
  const beats = stage.value.beats;
  idx.value++;
  const b = beats[idx.value];
  if (!b) return finish();

  // Nouvelle vague → bannière.
  const prev = beats[idx.value - 1];
  if (!prev || prev.group !== b.group) {
    const g = props.report.groups[b.group];
    banner.value = g ? `${g.emoji} ${g.species} ×${g.count} · niveau ${g.level}` : '';
    setTimeout(() => (banner.value = ''), 1100);
  }

  if (b.kind === 'turret') {
    const t = octagon.value[b.turret];
    const body = stage.value.bodies[b.body];
    if (t && body) {
      const p = bodyPos(body, b.body);
      bolt.value = { x1: t.x, y1: t.y, x2: p.x, y2: p.y };
      firingTurret.value = b.turret;
      if (!b.dodge) float.value = { x: p.x, y: p.y - 10, n: b.damage, crit: b.crit };
    }
  } else {
    // Le rempart encaisse : secousse et voile proportionnels au coup.
    hitBody.value = b.body;
    const part = b.damage / Math.max(1, stage.value.maxPv);
    hurt.value = Math.min(0.45, part * 6);
    shakeLevel.value = b.crit || part > 0.06 ? 2 : 1;
  }

  // Un temps qui compte se regarde : on ralentit sur les morts.
  const slow = b.kills.length ? 380 : 0;
  timer = setTimeout(() => {
    bolt.value = null;
    float.value = null;
    firingTurret.value = -1;
    hitBody.value = -1;
    hurt.value = 0;
    shakeLevel.value = 0;
    ghostPct.value = pvPct.value;
    play();
  }, stepMs.value + slow);
}

function finish() {
  idx.value = stage.value.beats.length - 1;
  finished.value = true;
}
function skip() {
  if (timer) clearTimeout(timer);
  timer = null;
  finish();
}

onMounted(() => {
  pulseTimer = setInterval(() => (pulse.value = (pulse.value + 0.12) % 1), 90);
  if (reduced()) return finish(); // état final direct, zéro animation
  play();
});
onUnmounted(() => {
  if (timer) clearTimeout(timer);
  if (pulseTimer) clearInterval(pulseTimer);
});
</script>

<style scoped>
.siege {
  position: relative;
  width: 100%;
  height: 100dvh;
  background: #0f0c07;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}
.board {
  width: 100%;
  max-height: 74dvh;
  display: block;
}
.hurt {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, transparent 40%, #b03018 100%);
  pointer-events: none;
  transition: opacity 0.12s;
  z-index: 2;
}
.shake {
  animation: sh 0.12s;
}
.shake-l {
  animation: sh 0.18s;
}
@keyframes sh {
  0%,
  100% {
    transform: translate(0, 0);
  }
  30% {
    transform: translate(-3px, 2px);
  }
  70% {
    transform: translate(3px, -2px);
  }
}

/* Enceinte */
.s-wall {
  fill: #2a231a;
  stroke: #7a6a4f;
  stroke-width: 8;
  stroke-linejoin: round;
  transition: stroke 0.4s;
}
.s-wall.breached {
  stroke: #ff6a45;
  stroke-dasharray: 16 8;
}
.s-merlon {
  fill: #7a6a4f;
  transition: fill 0.4s;
}
.s-merlon.breached {
  fill: #ff6a45;
}
.s-yard {
  fill: #332b1e;
  stroke: #453b2c;
  stroke-width: 1.5;
}
.s-tur {
  fill: #8a7856;
  stroke: #5a4c36;
  stroke-width: 1;
  transition: fill 0.08s;
}
.s-tur.fire {
  fill: var(--accent, #ffd23f);
}
.s-tur-empty {
  fill: none;
  stroke: #4a4133;
  stroke-width: 1.6;
  stroke-dasharray: 3 3;
}

/* Cour */
.s-gar-ring {
  fill: none;
  stroke: var(--accent, #ffd23f);
  stroke-width: 2;
}
.s-fam {
  font-size: 14px;
  text-anchor: middle;
}
.s-empty {
  font-size: 7px;
  fill: var(--dim, #9a8f7e);
  text-anchor: middle;
}
.s-hero-bg {
  fill: #3a2f1c;
  stroke: var(--accent, #ffd23f);
  stroke-width: 1.5;
}
.s-hero {
  font-size: 8px;
  text-anchor: middle;
}

/* Assaillants */
.s-foe {
  transition: transform 0.55s ease-out;
}
.s-foe-bg {
  fill: #241f18;
  stroke: #5a4133;
  stroke-width: 1.2;
}
.s-foe.champ .s-foe-bg {
  stroke: #ffb23f;
  stroke-width: 2;
}
.s-foe.hit .s-foe-bg {
  stroke: #ff6a45;
}
.s-foe-emo {
  font-size: 8px;
  text-anchor: middle;
}
.s-foe.dead {
  opacity: 0.4;
}
.s-foe.dead .s-foe-bg {
  fill: #14110c;
  stroke: #3a332a;
}
.s-bolt {
  stroke: var(--accent, #ffd23f);
  stroke-width: 1.6;
  stroke-linecap: round;
  opacity: 0.9;
}
.s-float {
  font-size: 9px;
  text-anchor: middle;
  fill: #f3eee6;
  font-weight: 700;
}
.s-float.crit {
  fill: #ffd23f;
  font-size: 12px;
}

/* HUD */
.hud {
  padding: 10px 14px 0;
}
.hud-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-bottom: 8px;
}
.hud-tag {
  background: #211c16;
  border: 1px solid #3a332a;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  color: #f3eee6;
}
.pv-wrap {
  position: relative;
  height: 20px;
  border-radius: 10px;
  background: #211c16;
  border: 1px solid #3a332a;
  overflow: hidden;
}
.pv,
.pv-ghost {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
}
.pv-ghost {
  background: #6b4234;
  transition: width 0.5s ease-out;
}
.pv {
  background: #7bc86c;
  transition: width 0.12s;
}
.pv.low {
  background: #ff6a45;
}
.pv-txt {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #f3eee6;
  font-weight: 600;
}

.skip {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid #3a332a;
  background: rgba(20, 17, 12, 0.8);
  color: #9a8f7e;
  font-size: 13px;
  cursor: pointer;
}

.banner {
  position: absolute;
  top: 22%;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 17px;
  font-weight: 700;
  color: #ffd23f;
  text-shadow: 0 2px 8px #000;
  pointer-events: none;
  z-index: 3;
}
.ban-enter-active,
.ban-leave-active {
  transition: opacity 0.25s;
}
.ban-enter-from,
.ban-leave-to {
  opacity: 0;
}

.endcard {
  position: absolute;
  inset: 0;
  z-index: 4;
  background: rgba(15, 12, 7, 0.92);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
}
.end-emo {
  font-size: 54px;
}
.end-title {
  font-size: 22px;
  color: #f3eee6;
}
.end-sub {
  font-size: 13px;
  color: #9a8f7e;
  line-height: 1.5;
}
.end-cta {
  margin-top: 18px;
  min-height: 48px;
  padding: 0 24px;
  border-radius: 12px;
  border: 1px solid #ffd23f;
  background: none;
  color: #ffd23f;
  font-size: 15px;
  cursor: pointer;
}
.end-enter-active {
  transition: opacity 0.3s;
}
.end-enter-from {
  opacity: 0;
}
</style>
