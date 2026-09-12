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
      <!-- ── 🧱 LA MURAILLE SE LÉZARDE SOUS LES COUPS ──────────────────────────
           ⚠️ Demandé par l’utilisateur. C’est gratuit en information : le rejeu CONNAÎT
           déjà les PV du mur à chaque instant (la barre s’en sert). Et ça dit ce que le
           modèle affirme depuis la v0.753 — le mur convertit sa solidité en TEMPS :
           autant qu’on voie ce temps s’épuiser.
           ⚠️ Chaque lézarde a son SEUIL : elle apparaît quand l’intégrité passe dessous,
           puis s’épaissit. Toutes d’un coup, on ne lirait qu’un état binaire de plus. -->
      <path
        v-for="(k, i) in cracks"
        :key="'k' + i"
        :d="k.d"
        class="s-crack"
        :style="{ opacity: crackOpacity(k.at), strokeWidth: crackWidth(k.at) }"
      />
      <polygon :points="innerPoints" class="s-yard" />

      <!-- LES BALISTES. ⚠️ MÊME SILHOUETTE QUE L’ÉCRAN « MA BASE » (plateforme, arc, corde,
           trait engagé, pointe), et c’est la correction : c’étaient deux rectangles plats en
           #8a7856 posés sur un rempart tracé en #7a6a4f — deux nuances quasi identiques, sur
           un trait de 8 d’épaisseur. Un joueur l’a dit exactement : « je ne vois plus les
           tourelles, on voit des murs qui tirent ». La leçon était pourtant DÉJÀ écrite dans
           le code de la Base (« en clair, pas dans le brun de la pierre ») — elle n’avait
           simplement jamais traversé jusqu’ici. -->
      <g v-for="(p, i) in octagon" :key="'t' + i">
        <g
          v-if="hasTurrets"
          :transform="`translate(${p.x} ${p.y}) rotate(${p.rot})`"
          :class="{ fire: firingTurret === i }"
        >
          <path d="M -7 7 L 7 7 L 5.5 0 L -5.5 0 Z" class="s-tur-base" />
          <path d="M -7.5 -0.5 Q 0 -5.5 7.5 -0.5" class="s-tur-bow" />
          <path d="M -6.5 -0.8 L 0 1.6 L 6.5 -0.8" class="s-tur-string" />
          <path d="M 0 3.5 L 0 -7" class="s-tur-bolt" />
          <path d="M 0 -9 L -2 -6.2 L 2 -6.2 Z" class="s-tur-head" />
        </g>
        <circle v-else :cx="p.x" :cy="p.y" r="7.5" class="s-tur-empty" />
      </g>

      <!-- ── LA COUR : CEUX QUI TIENNENT LA BRÈCHE ── -->
      <!-- ⚠️ LES AVENTURIERS, PAS LES FAMILIERS (signalé par un joueur). Séquelle de la
           refonte : depuis que le moteur en deux phases est branché, ce sont les AVENTURIERS
           qui se battent — les familiers ne font que les renforcer depuis le chenil. Montrer
           les seconds laissait croire que c’étaient eux qui combattaient, et c’est
           exactement le contre-sens que le renommage du panneau avait déjà corrigé. -->
      <g v-if="defenders.length" class="s-gar">
        <circle
          cx="100"
          cy="100"
          :r="26 + pulse * 5"
          class="s-gar-ring"
          :style="{ opacity: 0.25 - pulse * 0.18 }"
        />
        <text
          v-for="(f, i) in defenders"
          :key="'d' + i"
          :x="100 + (i - (defenders.length - 1) / 2) * 18"
          y="104"
          class="s-fam"
        >
          {{ f }}
        </text>
      </g>
      <text v-else x="100" y="104" class="s-empty">la ville, sans défenseurs</text>

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
import { assaultRadius, buildSiegeStage, type SiegeBody } from '@/lib/siegeStage';
import { mulberry32 } from '@/lib/combat';
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
  /** Emojis des AVENTURIERS qui tiennent la brèche. ⚠️ Pas les familiers : ils ne
   *  combattent pas, ils renforcent ceux-ci depuis le chenil. */
  defenders: string[];
}>();
const emit = defineEmits<{ done: [] }>();

const stage = computed(() => buildSiegeStage(props.report, turretCount(props.turretLevel)));
const hasTurrets = computed(() => props.turretLevel > 0);

// ── Géométrie : la MÊME que l'écran « Ma base », pour qu'on reconnaisse son enceinte ──
// ⚠️ Ces deux valeurs doivent rester d'accord : si l'enceinte change de taille là-bas,
// elle change ici, sans quoi on ne reconnaît plus sa propre base au moment du verdict.
const WALL_R = 72;
const octagon = computed(() =>
  Array.from({ length: TURRET_SLOTS }, (_, i) => {
    const a = (i / TURRET_SLOTS) * Math.PI * 2 - Math.PI / 2 + Math.PI / TURRET_SLOTS;
    // L’art est dessiné « vers le haut » (−Y), d’où le +90° — MÊME formule que l’écran
    // Ma base : c’est ce qui fait qu’on reconnaît son enceinte au moment du verdict.
    return {
      x: 100 + Math.cos(a) * WALL_R,
      y: 100 + Math.sin(a) * WALL_R,
      rot: (a * 180) / Math.PI + 90,
    };
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
/** 🧱 LES LÉZARDES — une par pan de mur, tracées de l’extérieur vers la cour.
 *
 *  ⚠️ SEEDÉES sur le rapport : le même siège se rejoue à l’identique, et deux ouvertures
 *  de la modale ne redessinent pas des fissures différentes. On réutilise `mulberry32`,
 *  le PRNG du projet — pas une n-ième copie.
 *
 *  ⚠️ Purement DÉCORATIF : `siegeStage` ne décide rien du combat (règle fondatrice
 *  reprise d’`arenaStage`), et ceci n’en décide pas davantage — on ne fait que peindre
 *  une intégrité que le log a déjà fixée. */
const cracks = computed(() => {
  // ⚠️ MÊME graine que le placement des corps (`placeBodies`), dérivée du rapport :
  // deux ouvertures de la modale doivent redessiner EXACTEMENT les mêmes fissures.
  const rng = mulberry32(
    ((props.report.groups.length * 7919 + props.report.total) ^ 0x7f4a7c15) >>> 0 || 1,
  );
  return octagon.value.map((p, i) => {
    const q = octagon.value[(i + 1) % octagon.value.length]!;
    // Départ : un point du pan, jamais pile au sommet (une pierre d’angle tient mieux).
    const t = 0.25 + rng() * 0.5;
    const x0 = p.x + (q.x - p.x) * t;
    const y0 = p.y + (q.y - p.y) * t;
    // …et on descend vers le centre, en zigzag, sur l’épaisseur du rempart.
    const pts = [`M${x0.toFixed(1)},${y0.toFixed(1)}`];
    let x = x0;
    let y = y0;
    for (let k = 1; k <= 3; k++) {
      const f = 1 - k * 0.05;
      const jx = (rng() - 0.5) * 5;
      const jy = (rng() - 0.5) * 5;
      x = 100 + (x0 - 100) * f + jx;
      y = 100 + (y0 - 100) * f + jy;
      pts.push(`L${x.toFixed(1)},${y.toFixed(1)}`);
    }
    // Seuil d’apparition : les huit lézardes s’ouvrent l’une après l’autre, de 92 %
    // d’intégrité jusqu’à 20 %. Le mur se dégrade donc VISIBLEMENT tout du long.
    return { d: pts.join(String.fromCharCode(32)), at: 92 - (i * 72) / (octagon.value.length - 1) };
  });
});
/** Une lézarde naît transparente à son seuil et s’affirme à mesure que le mur tombe. */
function crackOpacity(at: number): number {
  if (pvPct.value >= at) return 0;
  return Math.min(0.9, 0.15 + ((at - pvPct.value) / Math.max(1, at)) * 1.1);
}
function crackWidth(at: number): number {
  if (pvPct.value >= at) return 0;
  return 0.5 + Math.min(1.6, ((at - pvPct.value) / Math.max(1, at)) * 2.2);
}

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
// ⚠️ On retient le TOUR de la mort, plus seulement le fait de mourir : un corps reste
// où il est TOMBÉ. Sans ça, un mort continuerait d’avancer vers le mur avec les
// vivants — ou pire, sauterait au rempart d’un coup.
const dead = computed(() => {
  const m = new Map<number, number>();
  for (let i = 0; i <= idx.value; i++) {
    const b = stage.value.beats[i];
    for (const k of b?.kills ?? []) if (!m.has(k)) m.set(k, b?.round ?? 0);
  }
  return m;
});
function deadAt(i: number): boolean {
  return dead.value.has(i);
}
/** Le tour du moteur au temps joué. Avant le premier temps, l’assaut n’a pas commencé :
 *  l’armée est encore au bord du terrain. */
const curRound = computed(() => (idx.value >= 0 ? (stage.value.beats[idx.value]?.round ?? 0) : 0));
const standing = computed(() => stage.value.bodies.length - dead.value.size);

/**
 * Un corps TRAVERSE le terrain découvert sous le feu, puis s’arrête au pied du mur —
 * et reste où il est tombé.
 *
 * ⚠️ Il SAUTAIT jusqu’ici au rempart d’un coup, dès que son groupe était engagé : la
 * traversée n’existait pas à l’écran alors qu’elle est tout l’intérêt du moteur — c’est
 * pendant l’approche que les balistes gagnent leur valeur, puis que les archers entrent
 * en jeu. On voit désormais l’assaut avancer, et le feu se stratifier avec lui.
 *
 * ⚠️ Le rayon vient de `assaultRadius`, dans la LIB : le composant ne recalcule rien.
 * Une seconde copie de « où en est l’assaut » finirait par montrer une armée qui arrive
 * avant ou après qu’elle ne frappe.
 */
function bodyPos(b: SiegeBody, i: number): { x: number; y: number } {
  const tour = dead.value.get(i) ?? curRound.value;
  const d = assaultRadius(b.dist, tour);
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
/* La pierre qui cède : plus sombre que le rempart, jamais noire — une fissure est une
   ombre, pas un trou. Elle ne capte pas le clic (le mur n'est pas cliquable ici). */
.s-crack {
  fill: none;
  stroke: #1a140c;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}
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
/* ⚠️ EN CLAIR, PAS DANS LE BRUN DE LA PIERRE. Les mêmes teintes que l’écran Ma base :
   posées dans le ton du rempart, les balistes y devenaient invisibles — le défaut
   signalé (« on voit des murs qui tirer »). */
.s-tur-base {
  fill: #9a8768;
  stroke: #4a3d2b;
  stroke-width: 1;
}
.s-tur-bow {
  fill: none;
  stroke: #d8c9a4;
  stroke-width: 2.4;
  stroke-linecap: round;
}
.s-tur-string {
  fill: none;
  stroke: #8a7856;
  stroke-width: 0.9;
}
.s-tur-bolt {
  stroke: #f3eee6;
  stroke-width: 2;
  stroke-linecap: round;
}
/* Pointe en jaune voltage : le seul accent de l’enceinte, et il dit « armé ». */
.s-tur-head {
  fill: #ffd23f;
}
/* Celle qui TIRE s’embrase : c’est le seul signal qui dit d’où part le trait. */
.fire .s-tur-base {
  fill: var(--accent, #ffd23f);
}
.fire .s-tur-bow,
.fire .s-tur-bolt {
  stroke: #fff6d8;
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
