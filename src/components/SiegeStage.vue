<!--
  SiegeStage — REJEU animé d'un siège.

  ⚠️ Ne décide RIEN : il rejoue `buildSiegeStage(report)`, qui lui-même ne fait que
  relire le log du moteur. L'issue, les groupes repoussés et les récompenses sont déjà
  écrits — l'animation est le VERDICT, pas l'épreuve.

  Elle se lance DIRECTEMENT à la résolution, avant toute annonce du résultat : le rapport
  spoilerait l'issue et lui retirerait tout enjeu.

  ⚠️ Ce qu'on voit, et d'où ça vient (tout est dans la lib, rien n'est recalculé ici) :
   • les BALISTES pivotent vers leur cible, puis lâchent un trait qui vole jusqu'à
     l'impact — et ne se tournent vers une autre cible qu'une fois ce trait parti
     (`beatTiming`) ;
   • les corps marchent sur LEUR pan, celui que le moteur leur a donné (`placeBodies`) ;
   • le pan visé S'OUVRE à mesure que la brèche s'élargit, la caméra PLONGE vers la cour,
     et l'on y voit les assaillants entrés affronter le héros et les aventuriers.
-->
<template>
  <div class="siege" :class="{ shake: shakeLevel > 0, 'shake-l': shakeLevel > 1 }">
    <!-- Voile rouge quand le rempart encaisse -->
    <div class="hurt" :style="{ opacity: hurt }" />

    <svg :viewBox="viewBox" class="board" role="img" aria-label="Assaut de la base">
      <defs>
        <radialGradient id="siege-meadow" cx="50%" cy="50%" r="62%">
          <stop offset="0%" stop-color="#4a5a2a" />
          <stop offset="55%" stop-color="#3a4a22" />
          <stop offset="100%" stop-color="#232e18" />
        </radialGradient>
        <radialGradient id="siege-earth" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stop-color="#3a3120" />
          <stop offset="100%" stop-color="#3a3120" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- ── LE TERRAIN (v-once : rien n'y est réactif) ── -->
      <g v-once class="terrain" aria-hidden="true">
        <rect
          :x="100 - FIELD"
          :y="100 - FIELD"
          :width="FIELD * 2"
          :height="FIELD * 2"
          fill="url(#siege-meadow)"
        />
        <ellipse v-for="(p, i) in decor.patches" :key="'p' + i" v-bind="p" class="s-patch" />
        <circle cx="100" cy="100" :r="EARTH_R" fill="url(#siege-earth)" />
        <path v-for="(t, i) in decor.tufts" :key="'g' + i" :d="t" class="s-tuft" />
        <path v-for="(t, i) in decor.trees" :key="'tr' + i" :d="t" class="s-tree" />
      </g>

      <!-- ── L'ENCEINTE ──
           ⚠️ Tracée PAN PAR PAN, et non plus d'un seul polygone : c'est la seule façon
           d'ouvrir UN pan quand la brèche cède. Le polygone reste dessous, pour le sol. -->
      <polygon :points="wallPoints" class="s-wall-base" />
      <line
        v-for="(seg, i) in wallSegments"
        :key="'w' + i"
        :x1="seg.x1"
        :y1="seg.y1"
        :x2="seg.x2"
        :y2="seg.y2"
        class="s-wall"
        :class="{ lost: breachedEnd }"
      />
      <template v-for="(m, i) in merlons" :key="'m' + i">
        <rect
          v-if="!openGap.has(i)"
          :x="m.x - 3.1"
          :y="m.y - 3.1"
          width="6.2"
          height="6.2"
          :transform="`rotate(${m.a} ${m.x} ${m.y})`"
          class="s-merlon"
          :class="{ lost: breachedEnd }"
        />
      </template>
      <path
        v-for="(k, i) in cracks"
        :key="'k' + i"
        :d="k.d"
        class="s-crack"
        :style="{ opacity: crackOpacity(k.at), strokeWidth: crackWidth(k.at) }"
      />
      <polygon :points="innerPoints" class="s-yard" />
      <!-- ── LA TROUÉE ──
           ⚠️ Un simple manque dans le trait du mur ne se LISAIT pas : sur le banc, le pan
           ouvert passait pour intact. La brèche est donc un PASSAGE — une bande de terre
           battue qui traverse l’épaisseur du rempart, du champ jusque dans la cour — et des
           gravats qui disent que le mur est TOMBÉ, pas qu’il manque. -->
      <g v-for="o in breaches" :key="'b' + o.pan">
        <polygon :points="o.floor" class="s-breach-floor" />
        <g class="s-rubble">
          <polygon v-for="(r, i) in o.rubble" :key="'r' + i" :points="r" />
        </g>
      </g>

      <!-- ── LES BALISTES ──
           ⚠️ UNE SEULE transformation CSS (position, visée, échelle) : imbriquer un
           `rotate` CSS dans un `translate` d'attribut laisse le navigateur choisir le
           point de pivot, et la baliste tournerait autour du centre de la carte. -->
      <template v-for="(p, i) in octagon" :key="'t' + i">
        <g
          v-if="hasTurrets"
          class="s-tur"
          :class="{
            fire: firingTurret === i,
            silenced: silenced.has(i),
            struck: struckTurrets.has(i),
          }"
          :style="{
            transform: `translate(${p.x}px, ${p.y}px) rotate(${aim[i]}deg) scale(${TURRET_S})`,
            transitionDuration: pivotMs + 'ms',
          }"
        >
          <path d="M -7 7 L 7 7 L 5.5 0 L -5.5 0 Z" class="s-tur-base" />
          <path d="M -7.5 -0.5 Q 0 -5.5 7.5 -0.5" class="s-tur-bow" />
          <path d="M -6.5 -0.8 L 0 1.6 L 6.5 -0.8" class="s-tur-string" />
          <!-- Le trait engagé disparaît pendant qu'il vole : il est PARTI. -->
          <g v-if="!(firingTurret === i && launched)">
            <path d="M 0 3.5 L 0 -7" class="s-tur-bolt" />
            <path d="M 0 -9 L -2 -6.2 L 2 -6.2 Z" class="s-tur-head" />
          </g>
        </g>
        <circle v-else :cx="p.x" :cy="p.y" :r="7.5 * TURRET_S" class="s-tur-empty" />
      </template>

      <!-- ── LES DÉFENSEURS : sur le chemin de ronde, ou dans la cour ── -->
      <g
        v-for="d in stage.defenders"
        :key="'d' + d.id"
        class="s-def"
        :class="{ hero: d.id === 'hero', down: wounded.has(d.id), struck: struckDefs.has(d.id) }"
        :style="{ transform: `translate(${defPos(d.id).x}px, ${defPos(d.id).y}px)` }"
      >
        <circle r="6.5" class="s-def-bg" />
        <text y="3" class="s-def-emo">{{ wounded.has(d.id) ? '🤕' : d.emoji }}</text>
        <!-- ❤️ La vie du HÉROS (demandé) : c'est lui qu'on a gardé à la maison, et c'est
             sa chute qui l'envoie à l'infirmerie. Pas de barre sans PV de départ connus. -->
        <g v-if="d.id === 'hero' && d.maxPv" class="s-def-hp" transform="translate(-9, -11.5)">
          <rect width="18" height="2.6" rx="1.3" class="s-def-hp-bg" />
          <rect
            :width="18 * heroPvPct"
            height="2.6"
            rx="1.3"
            class="s-def-hp-fill"
            :class="{ low: heroPvPct < 0.3 }"
          />
        </g>
      </g>
      <text v-if="!stage.defenders.length && inCourtyardView" x="100" y="104" class="s-empty">
        personne pour tenir la cour
      </text>

      <!-- ── LES ASSAILLANTS ── -->
      <g
        v-for="(b, i) in stage.bodies"
        :key="b.id"
        class="s-foe"
        :class="{
          dead: dead.has(i),
          champ: b.champion,
          hit: hitBodies.has(i),
          inside: inside.has(i),
        }"
        :style="{ transform: `translate(${bodyPos(b, i).x}px, ${bodyPos(b, i).y}px)` }"
      >
        <circle r="8" class="s-foe-bg" />
        <text y="3.7" class="s-foe-emo">{{ dead.has(i) ? '💀' : b.emoji }}</text>
      </g>

      <!-- ── LES PROJECTILES ── -->
      <g
        v-for="p in projectiles"
        :key="p.id"
        class="s-proj"
        :class="p.kind"
        :style="{
          transform: `translate(${p.flying ? p.x1 : p.x0}px, ${p.flying ? p.y1 : p.y0}px) rotate(${p.deg}deg)`,
          transitionDuration: p.dur + 'ms',
        }"
      >
        <template v-if="p.kind === 'bolt'">
          <path d="M 0 5 L 0 -6" class="s-p-shaft" />
          <path d="M 0 -8.5 L -2.2 -5 L 2.2 -5 Z" class="s-p-head" />
          <path d="M -1.6 5 L 0 3 L 1.6 5" class="s-p-fletch" />
        </template>
        <template v-else>
          <path d="M 0 3.5 L 0 -4" class="s-p-shaft" />
          <path d="M 0 -5.5 L -1.3 -3.4 L 1.3 -3.4 Z" class="s-p-head" />
        </template>
      </g>

      <!-- Étincelles d'impact / de mêlée -->
      <g v-for="s in sparks" :key="s.id" class="s-spark" :transform="`translate(${s.x} ${s.y})`">
        <path d="M -4 0 L 4 0 M 0 -4 L 0 4 M -3 -3 L 3 3 M -3 3 L 3 -3" />
      </g>

      <!-- Dégâts flottants -->
      <text v-for="f in floats" :key="f.id" :x="f.x" :y="f.y" class="s-float">−{{ f.n }}</text>
    </svg>

    <!-- ── HUD ── -->
    <div class="hud">
      <div class="hud-row">
        <span class="hud-tag"
          >{{ FACTION_EMOJI[report.faction] }} {{ FACTION_LABEL[report.faction] }}</span
        >
        <span class="hud-tag">Debout {{ standing }}</span>
        <span v-if="width > 0" class="hud-tag breach"
          >🧱 Brèche · {{ insideAlive }} dans la cour</span
        >
      </div>
      <div class="pv-wrap">
        <div class="pv-ghost" :style="{ width: ghostPct + '%' }" />
        <div class="pv" :class="{ low: pvPct < 30 }" :style="{ width: pvPct + '%' }" />
        <span class="pv-txt">🧱 {{ Math.max(0, curPv) }} / {{ stage.maxPv }}</span>
      </div>
    </div>

    <button v-if="!finished" class="skip" @click="skip">⏩ Passer</button>

    <transition name="ban">
      <div v-if="banner" class="banner" :class="{ big: bannerBig }">{{ banner }}</div>
    </transition>

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
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import {
  aimDeg,
  assaultRadius,
  bodyAngleAt,
  battlefieldDecor,
  beatTiming,
  breachCamera,
  entryAngle,
  openPans,
  panAngle,
  buildSiegeStage,
  defenderSpot,
  SIEGE_STAGE,
  SIEGE_WALL_R,
  turnToward,
  yardAttackerSpot,
  type SiegeBeat,
  type SiegeBody,
} from '@/lib/siegeStage';
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
}>();
const emit = defineEmits<{ done: [] }>();

const stage = computed(() => buildSiegeStage(props.report, turretCount(props.turretLevel)));
const hasTurrets = computed(() => props.turretLevel > 0);

// ── Géométrie : la MÊME que l'écran « Ma base » ──
const WALL_R = SIEGE_WALL_R;
const EARTH_R = WALL_R + 15;
const FIELD = SIEGE_STAGE.field;
const TURRET_S = 1.35;
/** Marge entre la fin du pivot et le lâcher (une image de transition CSS + du jeu). */
const PIVOT_MARGIN_MS = 45;
const decor = battlefieldDecor(EARTH_R);
const octagon = Array.from({ length: TURRET_SLOTS }, (_, i) => {
  const a = (i / TURRET_SLOTS) * Math.PI * 2 - Math.PI / 2 + Math.PI / TURRET_SLOTS;
  return {
    x: 100 + Math.cos(a) * WALL_R,
    y: 100 + Math.sin(a) * WALL_R,
    rot: (a * 180) / Math.PI + 90,
  };
});
const wallPoints = octagon.map((p) => `${p.x},${p.y}`).join(' ');
const innerPoints = octagon
  .map((p) => `${100 + (p.x - 100) * 0.86},${100 + (p.y - 100) * 0.86}`)
  .join(' ');
const merlons = octagon.map((p, i) => {
  const q = octagon[(i + 1) % octagon.length]!;
  return {
    x: (p.x + q.x) / 2,
    y: (p.y + q.y) / 2,
    a: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI,
  };
});

// ── Déroulé ──
const idx = ref(-1);
/** Le temps courant a-t-il déjà frappé ? Tant que non, ses morts ne sont pas montrées :
 *  sinon le corps passerait en crâne avant que le trait ne l'atteigne. */
const impacted = ref(false);
const launched = ref(false);
const finished = ref(false);
const hurt = ref(0);
const shakeLevel = ref(0);
const banner = ref('');
const bannerBig = ref(false);
const firingTurret = ref(-1);
const pivotMs = ref(0);
const hitBodies = ref(new Set<number>());
const struckTurrets = ref(new Set<number>());
const struckDefs = ref(new Set<string>());
/** La VISÉE de chaque baliste, en degrés CUMULÉS (cf. `turnToward`). Elle démarre face au
 *  dehors, et ne bouge que quand SA baliste tire. */
const aim = reactive(octagon.map((p) => p.rot));
const ghostPct = ref(100);
const cam = reactive<{ cx: number; cy: number; field: number }>({ cx: 100, cy: 100, field: FIELD });
const viewBox = computed(
  () => `${cam.cx - cam.field} ${cam.cy - cam.field} ${cam.field * 2} ${cam.field * 2}`,
);

interface Projectile {
  id: number;
  kind: 'bolt' | 'arrow' | 'foe';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  deg: number;
  dur: number;
  flying: boolean;
}
const projectiles = ref<Projectile[]>([]);
const sparks = ref<{ id: number; x: number; y: number }[]>([]);
const floats = ref<{ id: number; x: number; y: number; n: number }[]>([]);
let uid = 0;
const timers = new Set<ReturnType<typeof setTimeout>>();
function later(ms: number, fn: () => void) {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}
let camFrame = 0;

const cur = computed<SiegeBeat | null>(() =>
  idx.value >= 0 ? (stage.value.beats[idx.value] ?? null) : null,
);
const curPv = computed(() => cur.value?.basePv ?? stage.value.maxPv);
const pvPct = computed(() => (curPv.value / Math.max(1, stage.value.maxPv)) * 100);
const width = computed(() => cur.value?.width ?? 0);
const breachedEnd = computed(() => finished.value && !stage.value.held);
const corpseCount = computed(() => new Set(stage.value.beats.flatMap((b) => b.kills)).size);
const inCourtyardView = computed(() => width.value > 0);

/**
 * L'ÉTAT CUMULÉ à l'instant joué : qui est tombé (et à quel tour), qui est entré (et
 * dans quel ordre), qui est blessé, quelle baliste s'est tue, qui est descendu.
 * ⚠️ Dérivé des temps DÉJÀ JOUÉS — le temps courant ne compte ses morts qu'après l'impact.
 */
const state = computed(() => {
  const dead = new Map<number, number>();
  const inside = new Map<number, number>();
  const wounded = new Set<string>();
  const silenced = new Set<number>();
  const descended: string[] = [];
  const defPv = new Map<string, number>();
  const beats = stage.value.beats;
  for (let i = 0; i <= idx.value; i++) {
    const b = beats[i];
    if (!b) continue;
    for (const a of b.kind === 'enter' ? b.attackers : [])
      if (!inside.has(a)) inside.set(a, inside.size);
    if (b.kind === 'descend')
      for (const v of b.victims) if (!descended.includes(v)) descended.push(v);
    if (i === idx.value && !impacted.value) continue;
    for (const k of b.kills) if (!dead.has(k)) dead.set(k, b.round);
    for (const [id, pv] of Object.entries(b.defPv)) defPv.set(id, pv);
    for (const w of b.wounded) {
      wounded.add(w);
      const m = /^t(\d+)$/.exec(w);
      if (m) silenced.add(Number(m[1]));
    }
  }
  return { dead, inside, wounded, silenced, descended, defPv };
});
/** Part de vie restante du héros (0..1) à l'instant joué. */
const heroPvPct = computed(() => {
  const h = stage.value.defenders.find((d) => d.id === 'hero');
  if (!h?.maxPv) return 1;
  return Math.max(0, Math.min(1, (state.value.defPv.get('hero') ?? h.maxPv) / h.maxPv));
});
const dead = computed(() => state.value.dead);
const inside = computed(() => state.value.inside);
const wounded = computed(() => state.value.wounded);
const silenced = computed(() => state.value.silenced);
const curRound = computed(() => cur.value?.round ?? 0);
const standing = computed(() => stage.value.bodies.length - dead.value.size);
const insideAlive = computed(
  () => [...inside.value.keys()].filter((b) => !dead.value.has(b)).length,
);

/** Un corps marche sur son pan jusqu'au pied du mur — et le LONGE s'il n'a plus de cible
 *  (un tireur va chercher la baliste suivante) ; entré, il se tient dans la cour. */
function bodyPos(b: SiegeBody, i: number): { x: number; y: number } {
  const e = entries.value.get(i);
  if (e) return yardAttackerSpot(e.angle, e.k);
  const tour = dead.value.get(i) ?? curRound.value;
  const d = assaultRadius(b.dist, tour);
  const a = bodyAngleAt(b, tour);
  return { x: 100 + Math.cos(a) * d, y: 100 + Math.sin(a) * d };
}

/** Où se tient un défenseur, compte tenu de ceux qui sont descendus du rempart. */
const defenderLayout = computed(() => {
  const out = new Map<string, { x: number; y: number }>();
  const angle = stage.value.breachAngle;
  const desc = state.value.descended;
  const rampart = stage.value.defenders.filter((d) => d.post === 'rampart' && !desc.includes(d.id));
  const yard = [
    ...stage.value.defenders.filter((d) => d.post === 'yard'),
    ...desc.map((id) => stage.value.defenders.find((d) => d.id === id)).filter((d) => !!d),
  ];
  rampart.forEach((d, j) => out.set(d.id, defenderSpot(angle, j, rampart.length, 'rampart')));
  yard.forEach((d, j) => out.set(d.id, defenderSpot(angle, j, yard.length, 'yard')));
  return out;
});
function defPos(id: string): { x: number; y: number } {
  return defenderLayout.value.get(id) ?? { x: 100, y: 100 };
}

/** Pans ouverts à l'instant joué (pan → part effondrée) : un seul tant que le mur tient,
 *  tous une fois pulvérisé (`openPans`). */
const openGap = computed(
  () =>
    new Map(openPans(stage.value.breachPan, width.value, curPv.value).map((o) => [o.pan, o.gap])),
);
/** Par où chaque assaillant entré est passé, et sa place parmi ceux de CETTE trouée. */
const entries = computed(() => {
  const out = new Map<number, { angle: number; k: number }>();
  const perAngle = new Map<number, number>();
  const beats = stage.value.beats;
  for (let i = 0; i <= idx.value; i++) {
    const b = beats[i];
    if (b?.kind !== 'enter') continue;
    for (const a of b.attackers) {
      if (out.has(a)) continue;
      const body = stage.value.bodies[a];
      const angle = body
        ? entryAngle(bodyAngleAt(body, b.round), stage.value.breachAngle, b.basePv <= 0)
        : stage.value.breachAngle;
      const key = Math.round(angle * 1000);
      const k = perAngle.get(key) ?? 0;
      perAngle.set(key, k + 1);
      out.set(a, { angle, k });
    }
  }
  return out;
});
/** Les chicots des pans ouverts — le reste des pans est intact. */
const wallSegments = computed(() =>
  octagon.flatMap((p, i) => {
    const q = octagon[(i + 1) % octagon.length]!;
    const g = openGap.value.get(i) ?? 0;
    if (g <= 0) return [{ x1: p.x, y1: p.y, x2: q.x, y2: q.y }];
    const at = (t: number) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    const a = at(0.5 - g / 2);
    const b = at(0.5 + g / 2);
    return [
      { x1: p.x, y1: p.y, x2: a.x, y2: a.y },
      { x1: b.x, y1: b.y, x2: q.x, y2: q.y },
    ];
  }),
);
/** Chaque trouée : son sol (les deux bords du trou, poussés vers le dehors et vers la
 *  cour) et ses gravats — graine fixe par rapport ET par pan, pour qu'ils ne sautillent pas. */
const breaches = computed(() =>
  [...openGap.value].map(([pan, g]) => {
    const p = octagon[pan]!;
    const q = octagon[(pan + 1) % octagon.length]!;
    const at = (t: number) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    const a = at(0.5 - g / 2);
    const b = at(0.5 + g / 2);
    const nx = Math.cos(panAngle(pan));
    const ny = Math.sin(panAngle(pan));
    const pt = (o: { x: number; y: number }, k: number) =>
      `${(o.x + nx * k).toFixed(1)},${(o.y + ny * k).toFixed(1)}`;
    const floor = [pt(a, 9), pt(b, 9), pt(b, -12), pt(a, -12)].join(' ');
    const rng = mulberry32(((props.report.total * 131 + pan) ^ 0x2545f491) >>> 0 || 1);
    const rubble: string[] = [];
    const n = 8 + Math.round(g * 16);
    for (let i = 0; i < n; i++) {
      const t = 0.5 + (rng() - 0.5) * g * 1.1;
      const off = (rng() - 0.3) * 9; // vers le dehors surtout : le mur tombe vers l'assaillant
      const cx = p.x + (q.x - p.x) * t + nx * off;
      const cy = p.y + (q.y - p.y) * t + ny * off;
      const r = 1.8 + rng() * 2.6;
      rubble.push(
        [0, 1, 2, 3]
          .map((k) => {
            const ang = (k / 4) * Math.PI * 2 + rng() * 0.8;
            return `${(cx + Math.cos(ang) * r).toFixed(1)},${(cy + Math.sin(ang) * r).toFixed(1)}`;
          })
          .join(' '),
      );
    }
    return { pan, floor, rubble };
  }),
);

/** 🧱 Les lézardes — seedées sur le rapport, purement décoratives. */
const cracks = computed(() => {
  const rng = mulberry32(
    ((props.report.groups.length * 7919 + props.report.total) ^ 0x7f4a7c15) >>> 0 || 1,
  );
  return octagon.map((p, i) => {
    const q = octagon[(i + 1) % octagon.length]!;
    const t = 0.25 + rng() * 0.5;
    const x0 = p.x + (q.x - p.x) * t;
    const y0 = p.y + (q.y - p.y) * t;
    const pts = [`M${x0.toFixed(1)},${y0.toFixed(1)}`];
    for (let k = 1; k <= 3; k++) {
      const f = 1 - k * 0.05;
      const x = 100 + (x0 - 100) * f + (rng() - 0.5) * 5;
      const y = 100 + (y0 - 100) * f + (rng() - 0.5) * 5;
      pts.push(`L${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return { d: pts.join(' '), at: 92 - (i * 72) / (octagon.length - 1) };
  });
});
function crackOpacity(at: number): number {
  if (pvPct.value >= at) return 0;
  return Math.min(0.9, 0.15 + ((at - pvPct.value) / Math.max(1, at)) * 1.1);
}
function crackWidth(at: number): number {
  if (pvPct.value >= at) return 0;
  return 0.5 + Math.min(1.6, ((at - pvPct.value) / Math.max(1, at)) * 2.2);
}

function reduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** Lance un projectile : posé au départ, puis envoyé à l'image suivante (sans ce double
 *  rAF, le navigateur ne voit jamais la position de départ et le trait téléporte). */
function shoot(
  kind: Projectile['kind'],
  from: { x: number; y: number },
  to: { x: number; y: number },
  dur: number,
) {
  const p: Projectile = {
    id: ++uid,
    kind,
    x0: from.x,
    y0: from.y,
    x1: to.x,
    y1: to.y,
    deg: aimDeg(from.x, from.y, to.x, to.y),
    dur: Math.max(40, dur),
    flying: false,
  };
  projectiles.value.push(p);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const live = projectiles.value.find((x) => x.id === p.id);
      if (live) live.flying = true;
    }),
  );
  later(p.dur + 60, () => (projectiles.value = projectiles.value.filter((x) => x.id !== p.id)));
}
function pop(at: { x: number; y: number }, n: number) {
  const id = ++uid;
  if (n > 0) floats.value.push({ id, x: at.x, y: at.y - 10, n: Math.round(n) });
  sparks.value.push({ id, x: at.x, y: at.y });
  later(420, () => {
    floats.value = floats.value.filter((f) => f.id !== id);
    sparks.value = sparks.value.filter((s) => s.id !== id);
  });
}
function say(text: string, big = false, ms = 1300) {
  banner.value = text;
  bannerBig.value = big;
  later(ms, () => {
    if (banner.value === text) banner.value = '';
  });
}
/** La caméra glisse vers son cadrage de brèche — pas de coupe sèche. */
function moveCamera(to: { cx: number; cy: number; field: number }, ms: number) {
  cancelAnimationFrame(camFrame);
  const from = { ...cam };
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    cam.cx = from.cx + (to.cx - from.cx) * e;
    cam.cy = from.cy + (to.cy - from.cy) * e;
    cam.field = from.field + (to.field - from.field) * e;
    if (k < 1) camFrame = requestAnimationFrame(step);
  };
  camFrame = requestAnimationFrame(step);
}

let saidEnter = false;
let saidDescend = false;

function play() {
  const beats = stage.value.beats;
  idx.value++;
  const b = beats[idx.value];
  if (!b) return finish();
  const timing = beatTiming(b, beats.length);
  impacted.value = false;
  launched.value = false;

  const prev = beats[idx.value - 1];
  if (b.body >= 0 && b.kind !== 'yard' && (!prev || prev.group !== b.group) && !b.width) {
    const g = props.report.groups[b.group];
    if (g) say(`${g.emoji} ${g.species} ×${g.count} · niveau ${g.level}`, false, 1000);
  }

  const bodyAt = (k: number) => {
    const body = stage.value.bodies[k];
    return body ? bodyPos(body, k) : { x: 100, y: 100 };
  };
  const victimAt = (id: string) => {
    const m = /^t(\d+)$/.exec(id);
    const t = m ? octagon[Number(m[1])] : undefined;
    return t ?? defPos(id);
  };

  switch (b.kind) {
    case 'turret': {
      const t = octagon[b.turret];
      const target = b.targets[0];
      if (!t || target === undefined) break;
      const p = bodyAt(target);
      // 1) la baliste PIVOTE…
      // ⚠️ La rotation se TERMINE avant l'instant du lâcher, avec une marge : une transition
      // CSS démarre une image après le changement de style, donc réglée pile sur `launch`
      // elle finissait APRÈS le minuteur. Mesuré sur le banc : 6 traits sur 88 partaient
      // pendant que la baliste tournait encore.
      pivotMs.value = Math.max(0, timing.launch - PIVOT_MARGIN_MS);
      firingTurret.value = b.turret;
      aim[b.turret] = turnToward(aim[b.turret] ?? 0, aimDeg(t.x, t.y, p.x, p.y));
      // 2) …puis LÂCHE son trait, et seulement alors.
      later(timing.launch, () => {
        launched.value = true;
        shoot('bolt', t, p, timing.impact - timing.launch);
      });
      later(timing.impact, () => {
        hitBodies.value = new Set(b.targets);
        pop(p, b.damage);
      });
      break;
    }
    case 'archer': {
      // Une VOLÉE : chaque tireur du rempart envoie sa flèche vers SA cible.
      const target = b.targets[0];
      if (target === undefined) break;
      b.targets.slice(0, 10).forEach((t, i) => {
        const who = b.strikers[i] ?? b.shooter;
        shoot('arrow', who ? defPos(who) : { x: 100, y: 100 }, bodyAt(t), timing.impact);
      });
      later(timing.impact, () => {
        hitBodies.value = new Set(b.targets);
        pop(bodyAt(target), b.damage);
      });
      break;
    }
    case 'salvo': {
      // Au plus une douzaine de flèches à l'écran : au-delà on ne lit plus rien.
      b.attackers.slice(0, 12).forEach((a, i) => {
        const v = b.victims[i % b.victims.length];
        if (v) shoot('foe', bodyAt(a), victimAt(v), timing.impact);
      });
      later(timing.impact, () => {
        struckTurrets.value = new Set(
          b.victims
            .map((v) => /^t(\d+)$/.exec(v))
            .filter((m) => !!m)
            .map((m) => Number(m[1])),
        );
        struckDefs.value = new Set(b.victims.filter((v) => !/^t\d+$/.test(v)));
        const first = b.victims[0];
        if (first) pop(victimAt(first), b.damage);
      });
      break;
    }
    case 'wall': {
      hitBodies.value = new Set(b.attackers);
      const part = b.damage / Math.max(1, stage.value.maxPv);
      hurt.value = Math.min(0.45, part * 5);
      shakeLevel.value = part > 0.05 ? 2 : 1;
      break;
    }
    case 'yard': {
      // L'ÉCHAUFFOURÉE d'un tour : une étincelle à mi-chemin de chaque paire qui s'affronte,
      // dans les deux sens (défenseur → intrus, intrus → défenseur).
      const clashes: { x: number; y: number }[] = [];
      b.targets.forEach((t, i) => {
        const who = b.strikers[i];
        if (who) {
          const a = defPos(who);
          const z = bodyAt(t);
          clashes.push({ x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 });
        }
      });
      b.attackers.forEach((k, i) => {
        const v = b.victims[i];
        if (v) {
          const a = bodyAt(k);
          const z = victimAt(v);
          clashes.push({ x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 });
        }
      });
      later(timing.impact, () => {
        hitBodies.value = new Set([...b.targets, ...b.attackers]);
        struckDefs.value = new Set([...b.victims, ...b.strikers]);
        clashes.slice(0, 8).forEach((c, i) => pop(c, i === 0 ? b.damage : 0));
      });
      break;
    }
    case 'breach':
      if (b.opens) {
        say('🧱 LA MURAILLE CÈDE !', true, 1400);
        shakeLevel.value = 2;
        hurt.value = 0.4;
        moveCamera(breachCamera(stage.value.breachAngle), 900);
      }
      break;
    case 'enter':
      if (!saidEnter) {
        saidEnter = true;
        say('⚔️ Ils entrent dans la cour', false, 1200);
      }
      break;
    case 'descend':
      if (!saidDescend) {
        saidDescend = true;
        say('🏃 Les défenseurs descendent tenir la cour', false, 1200);
      }
      break;
  }
  // Les temps sans projectile frappent tout de suite.
  if (!timing.impact) impacted.value = true;
  else later(timing.impact, () => (impacted.value = true));

  later(timing.total, () => {
    firingTurret.value = -1;
    hitBodies.value = new Set();
    struckTurrets.value = new Set();
    struckDefs.value = new Set();
    hurt.value = 0;
    shakeLevel.value = 0;
    ghostPct.value = pvPct.value;
    play();
  });
}

function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers.clear();
  cancelAnimationFrame(camFrame);
}
function finish() {
  clearTimers();
  idx.value = stage.value.beats.length - 1;
  impacted.value = true;
  projectiles.value = [];
  sparks.value = [];
  floats.value = [];
  banner.value = '';
  if (stage.value.beats.some((b) => b.width > 0))
    Object.assign(cam, breachCamera(stage.value.breachAngle));
  finished.value = true;
}
function skip() {
  finish();
}

onMounted(() => {
  if (reduced()) return finish();
  play();
});
onUnmounted(clearTimers);
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

/* Terrain */
.s-patch {
  fill: #33421e;
  opacity: 0.75;
}
.s-tuft {
  fill: none;
  stroke: #6d8a3c;
  stroke-width: 1;
  stroke-linecap: round;
}
.s-tree {
  fill: #294220;
  stroke: #1a2b14;
  stroke-width: 0.5;
  stroke-linejoin: round;
}

/* Enceinte */
.s-wall-base {
  fill: #2a231a;
}
.s-wall {
  stroke: #7a6a4f;
  stroke-width: 8;
  stroke-linecap: square;
  transition: stroke 0.4s;
}
.s-wall.lost {
  stroke: #ff6a45;
}
.s-merlon {
  fill: #7a6a4f;
  transition: fill 0.4s;
}
.s-merlon.lost {
  fill: #ff6a45;
}
.s-breach-floor {
  fill: #5a4a34;
  stroke: #1a140c;
  stroke-width: 0.6;
}
.s-rubble polygon {
  fill: #6a5a42;
  stroke: #2a231a;
  stroke-width: 0.5;
}
.s-crack {
  fill: none;
  stroke: #1a140c;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}
.s-yard {
  fill: #221c14;
  stroke: #3a3125;
  stroke-width: 1.5;
}

/* Balistes — une seule transformation CSS, pivot = leur propre centre. */
.s-tur {
  transform-box: view-box;
  transform-origin: 0 0;
  transition-property: transform;
  transition-timing-function: ease-out;
}
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
.s-tur-head {
  fill: #ffd23f;
}
.fire .s-tur-base {
  fill: var(--accent, #ffd23f);
}
.fire .s-tur-bow {
  stroke: #fff6d8;
}
.struck .s-tur-base {
  fill: #ff6a45;
}
.silenced {
  opacity: 0.4;
}
.silenced .s-tur-head {
  fill: #6a5a42;
}
.s-tur-empty {
  fill: none;
  stroke: #4a4133;
  stroke-width: 1.6;
  stroke-dasharray: 3 3;
}

/* Défenseurs */
.s-def {
  transform-box: view-box;
  transform-origin: 0 0;
  transition: transform 0.5s ease-out;
}
.s-def-bg {
  fill: #2e3a26;
  stroke: #7bc86c;
  stroke-width: 1.3;
}
.s-def-hp-bg {
  fill: rgba(0, 0, 0, 0.55);
}
.s-def-hp-fill {
  fill: var(--d1);
  transition: width 0.25s ease-out;
}
.s-def-hp-fill.low {
  fill: var(--d4);
}
.s-def.hero .s-def-bg {
  fill: #3a2f1c;
  stroke: var(--accent, #ffd23f);
}
.s-def.struck .s-def-bg {
  stroke: #ff6a45;
}
.s-def.down {
  opacity: 0.5;
}
.s-def-emo {
  font-size: 8px;
  text-anchor: middle;
}
.s-empty {
  font-size: 7px;
  fill: var(--dim, #9a8f7e);
  text-anchor: middle;
}

/* Assaillants */
.s-foe {
  transform-box: view-box;
  transform-origin: 0 0;
  transition: transform 0.55s ease-out;
}
.s-foe-bg {
  fill: #241f18;
  stroke: #5a4133;
  stroke-width: 1.5;
}
.s-foe.champ .s-foe-bg {
  stroke: #ffb23f;
  stroke-width: 2;
}
.s-foe.inside .s-foe-bg {
  stroke: #ff6a45;
}
.s-foe.hit .s-foe-bg {
  stroke: #ff6a45;
  fill: #3a1e14;
}
.s-foe-emo {
  font-size: 10px;
  text-anchor: middle;
}
.s-foe.dead {
  opacity: 0.4;
}
.s-foe.dead .s-foe-bg {
  fill: #14110c;
  stroke: #3a332a;
}

/* Projectiles */
.s-proj {
  transform-box: view-box;
  transform-origin: 0 0;
  transition-property: transform;
  transition-timing-function: linear;
  pointer-events: none;
}
.s-p-shaft {
  stroke: #f3eee6;
  stroke-width: 1.6;
  stroke-linecap: round;
}
.s-p-head {
  fill: #ffd23f;
}
.s-p-fletch {
  fill: none;
  stroke: #d8c9a4;
  stroke-width: 0.9;
}
.s-proj.arrow .s-p-shaft {
  stroke: #cfe8c2;
  stroke-width: 1.1;
}
.s-proj.arrow .s-p-head {
  fill: #7bc86c;
}
.s-proj.foe .s-p-shaft {
  stroke: #e0b8a8;
  stroke-width: 1.1;
}
.s-proj.foe .s-p-head {
  fill: #ff6a45;
}
.s-spark path {
  stroke: #ffd23f;
  stroke-width: 1.2;
  stroke-linecap: round;
  animation: spark 0.4s ease-out forwards;
}
@keyframes spark {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
.s-float {
  font-size: 10px;
  text-anchor: middle;
  fill: #f3eee6;
  font-weight: 700;
  pointer-events: none;
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
.hud-tag.breach {
  border-color: #ff6a45;
  color: #ffb23f;
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
  min-height: 44px;
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
  padding: 0 16px;
}
.banner.big {
  font-size: 24px;
  color: #ff6a45;
  letter-spacing: 0.04em;
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
