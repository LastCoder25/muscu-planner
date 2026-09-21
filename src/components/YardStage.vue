<!--
  YardStage — la COUR d'un siège, vue de côté, dans le style de la scène des failles.

  ⚠️ Ne décide RIEN et ne cadence RIEN : `SiegeStage` garde le seul déroulé (mêmes temps,
  mêmes durées) et passe ici l'index joué et l'état cumulé. Ce composant ne fait que
  PEINDRE ces temps dans une autre vue (cf. `yardScene.ts`).

  Ce qu'on voit (choix de l'utilisateur : le dehors se lit par les traits qui tombent et
  par la barre du mur, pas par une seconde vue) :
   • la brèche à gauche, par où les intrus déboulent ;
   • le héros et les champions à droite, qui chargent leur cible et reviennent ;
   • le rempart en fond : ses balistes et ses archers tirent DANS la mêlée — ou par-dessus
     le mur quand leur cible est encore dehors.
-->
<template>
  <div ref="root" class="yard" :class="{ reduce }">
    <div class="back" aria-hidden="true">
      <div class="rampart" />
      <div class="merlons">
        <span v-for="m in 16" :key="m" />
      </div>
      <!-- La trouée : un pan de mur qui manque, des gravats, de la poussière. -->
      <div class="gap">
        <span v-for="r in 7" :key="r" class="rock" :class="'r' + r" />
      </div>
      <div class="ground" />
      <span v-for="d in dust" :key="d.id" class="dust" :style="pos(d)" />
    </div>

    <!-- Les balistes du rempart : c'est d'elles que tombent les traits. -->
    <span
      v-for="t in turretCount"
      :key="'t' + t"
      class="tur"
      :class="{ silenced: state.silenced.has(t - 1), fire: firing.has(t - 1) }"
      :style="pos(yardTurretSpot(t - 1, turretCount))"
      >🏹</span
    >

    <!-- Les intrus DANS la cour, à leur place d'entrée (`yardFoeSpot`). -->
    <div
      v-for="f in foes"
      :key="'f' + f.i"
      class="foe"
      :class="{ dead: f.dead, champ: f.champion, hurt: hit.has(f.i), fresh: fresh.has(f.i) }"
      :style="{ ...pos(fresh.has(f.i) ? breachPoint(f.spot) : lunged(`f${f.i}`, f.spot)) }"
    >
      <span class="shadow" />
      <!-- ⚠️ Pas de 💀 à la mort : chez les morts-vivants c'est l'emoji d'une ESPÈCE, un
           mort se serait lu comme un vivant. Un corps tombé se couche et pâlit (cf. .dead). -->
      <span class="emo">{{ f.emoji }}</span>
    </div>

    <!-- Les défenseurs : en haut sur le chemin de ronde, ou en bas dans la cour. -->
    <div
      v-for="d in defs"
      :key="'d' + d.id"
      class="def"
      :class="{
        down: state.wounded.has(d.id),
        hurt: struck.has(d.id),
        high: d.rampart,
        hero: d.id === 'hero',
      }"
      :style="pos(lunged(d.id, d.spot))"
    >
      <span class="shadow" />
      <div v-if="d.id === 'hero' && hero" class="hero-av">
        <AventureAvatar :profile="hero.profile" :equipped="hero.equipped" />
      </div>
      <div v-else-if="portraits[d.id]" class="champ">
        <ChampionPortrait :champion-id="portraits[d.id]!">{{ d.emoji }}</ChampionPortrait>
      </div>
      <span v-else class="emo">{{ state.wounded.has(d.id) ? '🤕' : d.emoji }}</span>
      <div v-if="d.id === 'hero' && d.maxPv" class="hp">
        <i :class="{ low: heroPvPct < 0.3 }" :style="{ width: heroPvPct * 100 + '%' }" />
      </div>
    </div>

    <div v-if="!defs.length" class="empty">personne pour tenir la cour</div>

    <!-- Traits, lames, éclats, dégâts. -->
    <span
      v-for="p in shots"
      :key="p.id"
      class="shot"
      :class="p.kind"
      :style="{
        left: (p.flying ? p.to.x : p.from.x) * 100 + '%',
        top: (p.flying ? p.to.y : p.from.y) * 100 + '%',
        transform: `translate(-50%, -50%) rotate(${p.deg}deg)`,
        transitionDuration: p.dur + 'ms',
      }"
    />
    <span v-for="s in slashes" :key="s.id" class="slash" :style="pos(s)" />
    <span
      v-for="s in sparks"
      :key="s.id"
      class="spark"
      :style="{ ...pos(s), '--dx': s.dx + 'px', '--dy': s.dy + 'px' }"
    />
    <span v-for="p in pops" :key="p.id" class="pop" :style="pos(p)">−{{ p.n }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import AventureAvatar from '@/components/AventureAvatar.vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { beatTiming, type SiegeBeat, type SiegeBody, type SiegeStage } from '@/lib/siegeStage';
import {
  YARD_SCENE,
  lungeTo,
  yardDefSpot,
  yardFoeSpot,
  yardOutsideShot,
  yardRampartSpot,
  yardTurretSpot,
  type YardPoint,
} from '@/lib/yardScene';
import type { Equipped } from '@/lib/items';

const props = defineProps<{
  beats: SiegeBeat[];
  bodies: SiegeBody[];
  defenders: SiegeStage['defenders'];
  turretCount: number;
  /** Le temps joué, et s'il a déjà frappé — ceux de `SiegeStage`, jamais les nôtres. */
  idx: number;
  impacted: boolean;
  state: {
    dead: Map<number, number>;
    inside: Map<number, number>;
    wounded: Set<string>;
    silenced: Set<number>;
    descended: string[];
  };
  heroPvPct: number;
  hero?: { profile: 'puissant' | 'agile' | 'polyvalent'; equipped: Equipped } | null;
  /** Défenseur → champion, pour montrer son portrait plutôt que l'emoji de sa classe. */
  portraits: Record<string, string>;
}>();

const root = ref<HTMLElement | null>(null);
const reduce =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

function pos(p: YardPoint): Record<string, string> {
  return { left: p.x * 100 + '%', top: p.y * 100 + '%' };
}
/** La brèche, à hauteur de la file du corps qui entre : il débouche de là. */
function breachPoint(spot: YardPoint): YardPoint {
  return { x: YARD_SCENE.breachX, y: spot.y };
}

// ── Qui est où ──
const foes = computed(() =>
  [...props.state.inside].map(([i, k]) => {
    const b = props.bodies[i];
    return {
      i,
      spot: yardFoeSpot(k),
      emoji: b?.emoji ?? '👹',
      champion: !!b?.champion,
      dead: props.state.dead.has(i),
    };
  }),
);
const defs = computed(() => {
  const desc = props.state.descended;
  const high = props.defenders.filter((d) => d.post === 'rampart' && !desc.includes(d.id));
  const low = [
    ...props.defenders.filter((d) => d.post === 'yard'),
    ...desc.map((id) => props.defenders.find((d) => d.id === id)).filter((d) => !!d),
  ];
  return [
    ...high.map((d, j) => ({ ...d, rampart: true, spot: yardRampartSpot(j, high.length) })),
    ...low.map((d, j) => ({ ...d, rampart: false, spot: yardDefSpot(j) })),
  ];
});
function foeSpot(i: number): YardPoint | null {
  const k = props.state.inside.get(i);
  return k === undefined ? null : yardFoeSpot(k);
}
function defSpot(id: string): YardPoint | null {
  const t = /^t(\d+)$/.exec(id);
  if (t) return yardTurretSpot(Number(t[1]), props.turretCount);
  return defs.value.find((d) => d.id === id)?.spot ?? null;
}

// ── Effets ──
interface Shot {
  id: number;
  kind: 'bolt' | 'arrow' | 'foe';
  from: YardPoint;
  to: YardPoint;
  deg: number;
  dur: number;
  flying: boolean;
}
const shots = ref<Shot[]>([]);
const slashes = ref<(YardPoint & { id: number })[]>([]);
const sparks = ref<(YardPoint & { id: number; dx: number; dy: number })[]>([]);
const pops = ref<(YardPoint & { id: number; n: number })[]>([]);
const dust = ref<(YardPoint & { id: number })[]>([]);
/** Charges en cours : qui (clé) s'élance vers quel point. */
const lunges = ref(new Map<string, YardPoint>());
const hit = ref(new Set<number>());
const struck = ref(new Set<string>());
const firing = ref(new Set<number>());
/** Intrus qui viennent d'entrer : posés à la brèche une image, puis lâchés vers leur place. */
const fresh = ref(new Set<number>());
let uid = 0;
const timers = new Set<ReturnType<typeof setTimeout>>();
function later(ms: number, fn: () => void) {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}
function nextFrame(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

function lunged(key: string, spot: YardPoint): YardPoint {
  return lunges.value.get(key) ?? spot;
}
function lunge(key: string, from: YardPoint, to: YardPoint, ms: number) {
  const m = new Map(lunges.value);
  m.set(key, lungeTo(from, to));
  lunges.value = m;
  later(ms, () => {
    const n = new Map(lunges.value);
    n.delete(key);
    lunges.value = n;
  });
}
/** L'angle d'un trait À L'ÉCRAN — les fractions ne suffisent pas, la scène n'est pas carrée. */
function screenDeg(a: YardPoint, b: YardPoint): number {
  const w = root.value?.clientWidth ?? 1;
  const h = root.value?.clientHeight ?? 1;
  return (Math.atan2((b.y - a.y) * h, (b.x - a.x) * w) * 180) / Math.PI;
}
function shoot(kind: Shot['kind'], from: YardPoint, to: YardPoint, dur: number) {
  const s: Shot = {
    id: ++uid,
    kind,
    from,
    to,
    deg: screenDeg(from, to),
    dur: Math.max(40, dur),
    flying: false,
  };
  shots.value.push(s);
  nextFrame(() => {
    const live = shots.value.find((x) => x.id === s.id);
    if (live) live.flying = true;
  });
  later(s.dur + 60, () => (shots.value = shots.value.filter((x) => x.id !== s.id)));
}
function popAt(p: YardPoint, n: number) {
  const id = ++uid;
  if (n > 0) pops.value.push({ id, x: p.x, y: p.y - 0.06, n: Math.round(n) });
  slashes.value.push({ id, ...p });
  later(900, () => {
    pops.value = pops.value.filter((x) => x.id !== id);
    slashes.value = slashes.value.filter((x) => x.id !== id);
  });
}
function burst(p: YardPoint, n = 8) {
  for (let i = 0; i < n; i++) {
    const id = ++uid;
    const a = (i / n) * Math.PI * 2;
    sparks.value.push({ id, ...p, dx: Math.cos(a) * 22, dy: Math.sin(a) * 22 - 6 });
    later(650, () => (sparks.value = sparks.value.filter((x) => x.id !== id)));
  }
}
function puff() {
  for (const y of YARD_SCENE.lanes) {
    const id = ++uid;
    dust.value.push({ id, x: YARD_SCENE.breachX + 0.02, y });
    later(700, () => (dust.value = dust.value.filter((x) => x.id !== id)));
  }
}

/** Le temps joué, peint dans la cour. Le rythme reste celui de `SiegeStage`. */
function paint(b: SiegeBeat) {
  const t = beatTiming(b, props.beats.length);
  const from = (id: string | undefined): YardPoint =>
    (id && defSpot(id)) || { x: 0.8, y: YARD_SCENE.rampartY };
  const aimAt = (target: number, origin: YardPoint): { to: YardPoint; inside: boolean } => {
    const f = foeSpot(target);
    return f ? { to: f, inside: true } : { to: yardOutsideShot(origin), inside: false };
  };
  const impactAt = t.impact || Math.round(t.total * 0.5);

  switch (b.kind) {
    case 'turret': {
      const target = b.targets[0];
      if (target === undefined) break;
      const o = yardTurretSpot(b.turret, props.turretCount);
      const { to, inside } = aimAt(target, o);
      firing.value = new Set([b.turret]);
      later(t.launch, () => shoot('bolt', o, to, t.impact - t.launch));
      later(t.impact, () => {
        firing.value = new Set();
        if (inside) {
          hit.value = new Set([target]);
          popAt(to, b.damage);
        }
      });
      break;
    }
    case 'archer': {
      b.targets.slice(0, 8).forEach((target, i) => {
        const o = from(b.strikers[i] ?? b.shooter ?? undefined);
        shoot('arrow', o, aimAt(target, o).to, t.impact);
      });
      later(t.impact, () => {
        const inside = b.targets.filter((x) => props.state.inside.has(x));
        hit.value = new Set(inside);
        const first = inside[0];
        const p = first !== undefined ? foeSpot(first) : null;
        if (p) popAt(p, b.damage);
      });
      break;
    }
    case 'salvo': {
      // Une volée ennemie monte du dehors vers le rempart, par-dessus la brèche.
      b.victims.slice(0, 8).forEach((v, i) => {
        const to = defSpot(v);
        if (to) shoot('foe', { x: -0.04, y: 0.32 + (i % 3) * 0.04 }, to, t.impact);
      });
      later(t.impact, () => (struck.value = new Set(b.victims)));
      break;
    }
    case 'yard': {
      // Chaque défenseur CHARGE sa cible, chaque intrus la sienne — puis tous reviennent.
      const back = Math.max(120, t.total - 20);
      b.targets.forEach((target, i) => {
        const who = b.strikers[i];
        const a = who ? defSpot(who) : null;
        const z = foeSpot(target);
        if (who && a && z) lunge(who, a, z, back);
      });
      b.attackers.forEach((k, i) => {
        const v = b.victims[i];
        const a = foeSpot(k);
        const z = v ? defSpot(v) : null;
        if (a && z) lunge(`f${k}`, a, z, back);
      });
      later(impactAt, () => {
        hit.value = new Set(b.targets);
        struck.value = new Set(b.victims);
        const first = b.targets[0];
        const p = first !== undefined ? foeSpot(first) : null;
        if (p) popAt(p, b.damage);
        const v = b.victims[0];
        const q = v ? defSpot(v) : null;
        if (q && !p) popAt(q, b.damage);
      });
      break;
    }
    case 'enter': {
      const f = new Set(fresh.value);
      for (const a of b.attackers) f.add(a);
      fresh.value = f;
      puff();
      nextFrame(() => {
        const n = new Set(fresh.value);
        for (const a of b.attackers) n.delete(a);
        fresh.value = n;
      });
      break;
    }
    case 'breach':
      puff();
      break;
  }
  later(t.total, () => {
    hit.value = new Set();
    struck.value = new Set();
  });
}

watch(
  () => props.idx,
  (i, prev) => {
    if (reduce) return;
    // ⚠️ Seulement quand le rejeu AVANCE d'un temps : « Passer » saute à la fin, et
    // repeindre d'un coup des dizaines de temps n'aurait aucun sens.
    if (prev === undefined || i !== prev + 1) return;
    const b = props.beats[i];
    if (b) paint(b);
  },
);

/** Les morts déjà montrées : un corps n'éclate qu'une fois. */
const seenDead = new Set<number>(props.state.dead.keys());
// Un corps qui tombe éclate — à l'instant où la mort est MONTRÉE (après l'impact).
watch(
  () => props.state.dead.size,
  (n, prev) => {
    if (reduce || n <= prev) return;
    for (const [i] of props.state.dead) {
      if (seenDead.has(i)) continue;
      seenDead.add(i);
      const p = foeSpot(i);
      if (p) burst(p);
    }
  },
);

onUnmounted(() => {
  for (const t of timers) clearTimeout(t);
  timers.clear();
});
</script>

<style scoped>
.yard {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: linear-gradient(180deg, #1c2233 0%, #2a2a33 30%, #3a3120 44%);
  color: var(--text);
}
/* ── Le décor ── */
.back,
.back > * {
  position: absolute;
}
.back {
  inset: 0;
}
/* Le rempart de fond : une bande de pierre, et ses créneaux. */
.rampart {
  left: 0;
  right: 0;
  top: 13%;
  height: 31%;
  background:
    repeating-linear-gradient(90deg, transparent 0 38px, rgba(0, 0, 0, 0.18) 38px 40px),
    repeating-linear-gradient(0deg, transparent 0 18px, rgba(0, 0, 0, 0.2) 18px 20px),
    linear-gradient(180deg, #8a7856, #6b5c41);
  box-shadow: inset 0 -10px 18px rgba(0, 0, 0, 0.45);
}
.merlons {
  left: 0;
  right: 0;
  top: 8%;
  height: 5%;
  display: flex;
  justify-content: space-between;
  padding: 0 2%;
}
.merlons span {
  width: 4%;
  background: #8a7856;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.25);
}
/* La trouée : le mur manque à gauche, on voit la nuit du dehors. */
.gap {
  left: 0;
  top: 6%;
  width: 14%;
  height: 40%;
  background: linear-gradient(90deg, #0f0c07, #1c2233 90%);
  clip-path: polygon(0 0, 100% 12%, 78% 40%, 100% 62%, 86% 100%, 0 100%);
}
.rock {
  width: 16px;
  height: 11px;
  background: #6b5c41;
  border-radius: 3px;
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.3);
}
.r1 {
  left: 70%;
  top: 70%;
}
.r2 {
  left: 30%;
  top: 84%;
  transform: rotate(18deg);
}
.r3 {
  left: 82%;
  top: 36%;
  transform: rotate(-24deg);
}
.r4 {
  left: 50%;
  top: 92%;
  transform: rotate(40deg);
}
.r5 {
  left: 10%;
  top: 76%;
}
.r6 {
  left: 64%;
  top: 52%;
  transform: rotate(-60deg);
}
.r7 {
  left: 88%;
  top: 88%;
  transform: rotate(10deg);
}
/* Le pavé de la cour. */
.ground {
  left: 0;
  right: 0;
  top: 44%;
  bottom: 0;
  background:
    repeating-linear-gradient(90deg, transparent 0 30px, rgba(0, 0, 0, 0.14) 30px 32px),
    repeating-linear-gradient(0deg, transparent 0 16px, rgba(0, 0, 0, 0.14) 16px 18px),
    linear-gradient(180deg, #5a4d38 0%, #3e3526 55%, #241d14 100%);
  box-shadow: inset 0 10px 18px rgba(0, 0, 0, 0.5);
}
.dust {
  width: 34px;
  height: 20px;
  margin: -10px 0 0 -17px;
  border-radius: 50%;
  background: rgba(190, 170, 130, 0.5);
  filter: blur(4px);
  animation: dust 0.7s ease-out forwards;
}
@keyframes dust {
  to {
    transform: translate(26px, -10px) scale(2);
    opacity: 0;
  }
}

/* ── Les balistes du rempart ── */
.tur {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 18px;
  line-height: 1;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6));
  transition:
    filter 0.2s,
    opacity 0.3s;
  z-index: 5;
}
.tur.fire {
  filter: drop-shadow(0 0 6px var(--accent));
}
.tur.silenced {
  opacity: 0.35;
  filter: grayscale(1);
}

/* ── Les corps : même langage que la scène des failles ── */
.foe,
.def {
  position: absolute;
  transform: translate(-50%, -50%);
  transition:
    left 0.3s cubic-bezier(0.3, 0.7, 0.3, 1),
    top 0.3s cubic-bezier(0.3, 0.7, 0.3, 1),
    opacity 0.45s,
    filter 0.45s,
    transform 0.45s;
}
.foe.fresh {
  transition: none;
}
.foe {
  z-index: 20;
}
.foe .emo {
  display: block;
  font-size: 34px;
  line-height: 1;
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.6));
}
.foe.champ .emo {
  font-size: 44px;
  filter: drop-shadow(0 0 8px rgba(255, 106, 69, 0.8));
}
.foe.hurt {
  animation: nudge 0.26s;
}
@keyframes nudge {
  50% {
    transform: translate(-62%, -50%);
  }
}
.foe.dead {
  opacity: 0.25;
  filter: grayscale(1);
  transform: translate(-50%, -34%) rotate(78deg) scale(0.8);
}
.shadow {
  position: absolute;
  left: 50%;
  top: 100%;
  width: 26px;
  height: 7px;
  margin-left: -13px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  filter: blur(2px);
}
.def {
  z-index: 25;
}
.def.high {
  z-index: 6;
}
.def.high .shadow {
  display: none;
}
.def .emo {
  display: block;
  font-size: 34px;
  line-height: 1;
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.6));
}
.def.high .emo,
.def.high .champ {
  font-size: 22px;
}
.hero-av {
  width: 60px;
}
.def.high .hero-av {
  width: 40px;
}
.champ {
  font-size: 38px;
  line-height: 1;
  padding: 2px;
  border-radius: 26%;
  background: rgba(20, 15, 10, 0.7);
  box-shadow:
    0 0 0 2px #7a6a4f,
    0 4px 10px rgba(0, 0, 0, 0.6);
}
.def.hurt .champ,
.def.hurt .hero-av,
.def.hurt .emo {
  filter: drop-shadow(0 0 8px var(--d4));
}
.def.down {
  opacity: 0.35;
  filter: grayscale(1);
  transform: translate(-50%, -30%) rotate(-70deg);
}
.hp {
  position: absolute;
  left: 50%;
  top: -8px;
  width: 44px;
  height: 5px;
  margin-left: -22px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.hp i {
  display: block;
  height: 100%;
  background: var(--d1);
  transition: width 0.3s;
}
.hp i.low {
  background: var(--d4);
}
.empty {
  position: absolute;
  left: 50%;
  top: 70%;
  transform: translate(-50%, -50%);
  color: var(--dim);
  font-size: 13px;
}

/* ── Traits, lames, éclats ── */
.shot {
  position: absolute;
  width: 18px;
  height: 2px;
  border-radius: 1px;
  background: linear-gradient(90deg, transparent, #f3eee6);
  transition-property: left, top;
  transition-timing-function: linear;
  z-index: 40;
}
.shot.bolt {
  width: 34px;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--accent));
  box-shadow: 0 0 6px var(--accent);
}
.shot.foe {
  background: linear-gradient(90deg, transparent, #ff8a5c);
}
.slash {
  position: absolute;
  width: 42px;
  height: 42px;
  margin: -21px 0 0 -21px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  border-color: var(--accent) transparent transparent var(--accent);
  animation: slash 0.3s ease-out forwards;
  z-index: 50;
}
@keyframes slash {
  from {
    transform: rotate(-40deg) scale(0.5);
    opacity: 1;
  }
  to {
    transform: rotate(70deg) scale(1.25);
    opacity: 0;
  }
}
.spark {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ffb23f;
  animation: spark 0.6s ease-out forwards;
  z-index: 50;
}
@keyframes spark {
  to {
    transform: translate(var(--dx), var(--dy));
    opacity: 0;
  }
}
.pop {
  position: absolute;
  transform: translate(-50%, -50%);
  font-family: 'Oswald', sans-serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--d4);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.7);
  animation: pop 0.9s ease-out forwards;
  z-index: 60;
}
@keyframes pop {
  to {
    transform: translate(-50%, calc(-50% - 30px));
    opacity: 0;
  }
}

.reduce .foe,
.reduce .def,
.reduce .shot {
  transition: none;
}
</style>
