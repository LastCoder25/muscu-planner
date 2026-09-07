<template>
  <div class="arena" :class="[shake, { reduce }]">
    <!-- Ambiance : halo de torches + poussière qui flotte. Purement décoratif, mais
         c'est ce qui fait la différence entre « une simulation » et « un lieu ». -->
    <div class="amb" aria-hidden="true">
      <span class="torch t1" /><span class="torch t2" />
      <span v-for="m in MOTES" :key="m" class="mote" :style="moteStyle(m)" />
    </div>

    <div class="floor">
      <div class="sand" />
      <div class="ring-in" />

      <!-- Corps ennemis : surgis en anneau, ils se referment sur le héros. -->
      <div
        v-for="(f, i) in foes"
        :key="waveIdx + '-' + i"
        class="foe"
        :class="{
          dead: foePv(i) <= 0,
          target: i === targetIdx && foePv(i) > 0,
          hurt: hurtIdx === i,
          spawning,
        }"
        :style="{
          left: (pos[i]?.x ?? f.x) * 100 + '%',
          top: (pos[i]?.y ?? f.y) * 100 + '%',
          zIndex: 10 + i,
        }"
      >
        <span class="shadow" />
        <span class="foe-aura" :class="'ar-' + f.archetype" />
        <span class="foe-emo">{{ f.emoji }}</span>
        <span class="foe-bar"><i :style="{ width: foePct(i) + '%' }" /></span>
      </div>

      <!-- Le héros : il S'ÉLANCE sur sa cible (lunge) et lui fait face. -->
      <div
        class="hero"
        :class="{ hurt: heroHurt, lunge: lunging }"
        :style="{ left: heroPos.x * 100 + '%', top: heroPos.y * 100 + '%' }"
      >
        <span class="shadow big" />
        <div class="hero-av" :style="{ transform: facing < 0 ? 'scaleX(-1)' : 'none' }">
          <AventureAvatar :profile="playerProfile" :equipped="playerEquipped" />
        </div>
      </div>

      <!-- Arc de lame au point d'impact, orienté vers la cible. -->
      <span
        v-for="s in slashes"
        :key="s.id"
        class="slash"
        :class="{ crit: s.crit }"
        :style="{ left: s.x * 100 + '%', top: s.y * 100 + '%', rotate: s.rot + 'deg' }"
      />

      <!-- Éclat de mort : le corps explose en particules. -->
      <span
        v-for="p in sparks"
        :key="p.id"
        class="spark"
        :style="{
          left: p.x * 100 + '%',
          top: p.y * 100 + '%',
          '--dx': p.dx + 'px',
          '--dy': p.dy + 'px',
        }"
      />

      <!-- Dégâts flottants, posés sur le défenseur. -->
      <div
        v-for="p in pops"
        :key="p.id"
        class="pop"
        :class="p.kind"
        :style="{ left: p.x * 100 + '%', top: p.y * 100 + '%' }"
      >
        {{ p.text }}
      </div>
    </div>

    <!-- Éclair de crit + voile rouge quand le héros encaisse. -->
    <div v-if="critFlash" class="crit-flash" aria-hidden="true" />
    <div class="hit-vig" :style="{ opacity: hitVig }" aria-hidden="true" />

    <!-- Annonce de vague / vague tenue : le rythme du mini-jeu. -->
    <div v-if="banner" :key="banner.id" class="banner" :class="banner.kind">
      <span class="bn-main font-display">{{ banner.main }}</span>
      <span v-if="banner.sub" class="bn-sub">{{ banner.sub }}</span>
    </div>

    <!-- HUD -->
    <div class="hud top">
      <span class="hud-wave font-display">🌊 Vague {{ waveNo }}</span>
      <span class="hud-foes">{{ aliveCount }} debout</span>
      <button v-if="!ended" class="skip" @click="skip">⏩ Passer</button>
    </div>
    <div class="hud bottom">
      <span class="hud-pv">
        <span class="pv-bar" :class="{ low: heroPct <= 30 }">
          <i class="pv-ghost" :style="{ width: ghostPct + '%' }" />
          <i class="pv-fill" :style="{ width: heroPct + '%' }" />
        </span>
        <b>{{ heroPv }}</b>
      </span>
      <span v-if="kills > 0" :key="kills" class="hud-kills">⚔️ {{ kills }}</span>
    </div>

    <!-- Écran de fin : l'arène se termine TOUJOURS par la mort, le score = les vagues. -->
    <div v-if="ended" class="end">
      <div class="end-in">
        <div class="end-emo">{{ endWaves > 0 ? '🌊' : '💀' }}</div>
        <div class="end-n font-display">{{ endWaves }}</div>
        <div class="end-lbl">
          vague{{ endWaves > 1 ? 's' : '' }} tenue{{ endWaves > 1 ? 's' : '' }}
        </div>
        <div class="end-sub">
          ⚔️ {{ kills }} adversaire{{ kills > 1 ? 's' : '' }} abattu{{ kills > 1 ? 's' : '' }}
        </div>
        <button class="end-cta" @click="emit('done')">Voir le butin</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// ARÈNE PHYSIQUE — plateau plein écran. Ne calcule AUCUN combat : il rejoue la
// chorégraphie de `buildArenaStage`, elle-même dérivée du log seedé de `simulateCombat`
// (cf. la règle fondatrice d'arenaStage.ts). Tout ce qui vit ici est de la position et
// de l'effet : le sort de la run est déjà scellé avant la première image.
//
// La boucle est un `setTimeout` qui se re-programme (et non un `setInterval` fixe) :
// c'est ce qui permet d'étirer le temps sur les coups qui comptent — le corps qui
// clôt une vague, et le coup qui tue le héros.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import type { Equipped } from '@/lib/items';
import { foePvAt, type StageWave } from '@/lib/arenaStage';
import AventureAvatar from '@/components/AventureAvatar.vue';

const props = defineProps<{
  waves: StageWave[];
  playerMaxPv: number;
  playerStartPv?: number;
  playerProfile: 'puissant' | 'agile' | 'polyvalent';
  playerEquipped: Equipped;
}>();
const emit = defineEmits<{ done: [] }>();

// ── Réglages de mise en scène ──
const CREEP = 0.14; // fraction de distance parcourue par un corps entre 2 beats
const RING = 0.13; // distance à laquelle il s'arrête (il encercle, ne chevauche pas)
const REACH = 0.11; // distance à laquelle le héros se poste de sa cible
const SLOW_WAVE = 520; // ralenti sur le corps qui clôt une vague
const SLOW_DEATH = 900; // ralenti sur le coup fatal
const MOTES = 14;

const reduce =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

// Séquence à plat : un pas = un beat + l'index de sa vague.
const steps = computed(() => {
  const out: { wi: number; bi: number }[] = [];
  props.waves.forEach((w, wi) => w.beats.forEach((_, bi) => out.push({ wi, bi })));
  return out;
});
// Une run d'arène enchaîne bien plus de combats qu'un donjon → on accélère quand la
// séquence s'allonge, sinon un bon build imposerait plusieurs minutes d'animation.
const stepMs = computed(() => {
  const n = steps.value.length;
  return n > 200 ? 62 : n > 90 ? 85 : n > 40 ? 120 : 180;
});

const i = ref(0);
const waveIdx = ref(0);
const dealt = ref(0);
const heroPv = ref(props.playerStartPv ?? props.playerMaxPv);
const ghostPv = ref(heroPv.value); // barre « fantôme » qui rattrape → chip damage
const heroPos = ref({ x: 0.5, y: 0.5 });
// Positionne d'emblée la 1re vague : le 1er rendu a lieu AVANT onMounted/start().
const pos = ref<{ x: number; y: number }[]>(
  (props.waves[0]?.foes ?? []).map((f) => ({ x: f.x, y: f.y })),
);
const targetIdx = ref(0);
const facing = ref(1);
const spawning = ref(false);
const lunging = ref(false);
const hurtIdx = ref<number | null>(null);
const heroHurt = ref(false);
const shake = ref('');
const critFlash = ref(false);
const hitVig = ref(0);
const kills = ref(0);
const ended = ref(false);
const endWaves = ref(0);

const pops = ref<{ id: number; x: number; y: number; text: string; kind: string }[]>([]);
const slashes = ref<{ id: number; x: number; y: number; rot: number; crit: boolean }[]>([]);
const sparks = ref<{ id: number; x: number; y: number; dx: number; dy: number }[]>([]);
const banner = ref<{ id: number; kind: string; main: string; sub: string } | null>(null);
let uid = 0;

let timer: ReturnType<typeof setTimeout> | undefined;
const fxTimers: ReturnType<typeof setTimeout>[] = [];
/** Tout timeout d'effet passe par ici → un seul endroit à purger au démontage. */
function later(fn: () => void, ms: number) {
  fxTimers.push(setTimeout(fn, ms));
}

const wave = computed(() => props.waves[waveIdx.value] ?? null);
const foes = computed(() => wave.value?.foes ?? []);
const waveNo = computed(() => wave.value?.wave ?? 1);
const heroPct = computed(() => Math.round((heroPv.value / Math.max(1, props.playerMaxPv)) * 100));
const ghostPct = computed(() => Math.round((ghostPv.value / Math.max(1, props.playerMaxPv)) * 100));
function foePv(idx: number): number {
  return wave.value ? foePvAt(wave.value, idx, dealt.value) : 0;
}
function foePct(idx: number): number {
  const max = foes.value[idx]?.maxPv ?? 1;
  return Math.round((foePv(idx) / Math.max(1, max)) * 100);
}
const aliveCount = computed(() => foes.value.filter((_, k) => foePv(k) > 0).length);

/** Poussière d'ambiance : positions/durées figées par l'index → pas de re-tirage à
 *  chaque rendu (sinon les motes sautent d'une image à l'autre). */
function moteStyle(m: number) {
  const a = Math.sin(m * 12.9898) * 43758.5453;
  const b = Math.sin(m * 78.233) * 12345.6789;
  const f = (x: number) => Math.abs(x - Math.floor(x));
  return {
    left: (6 + f(a) * 88).toFixed(1) + '%',
    top: (8 + f(b) * 84).toFixed(1) + '%',
    animationDelay: (f(a) * 9).toFixed(2) + 's',
    animationDuration: (7 + f(b) * 7).toFixed(2) + 's',
  };
}

function showBanner(kind: string, main: string, sub = '') {
  banner.value = { id: ++uid, kind, main, sub };
  later(() => (banner.value = null), 1100);
}

/** Place les corps de la vague à leur point de surgissement, ramène le héros au centre. */
function enterWave(wi: number) {
  waveIdx.value = wi;
  dealt.value = 0;
  const w = props.waves[wi];
  pos.value = (w?.foes ?? []).map((f) => ({ x: f.x, y: f.y }));
  heroPos.value = { x: 0.5, y: 0.5 };
  targetIdx.value = 0;
  spawning.value = true;
  later(() => (spawning.value = false), 380);
  if (!reduce)
    showBanner('wave', `VAGUE ${w?.wave ?? wi + 1}`, `${w?.foes.length ?? 0} adversaires`);
}

/** Déplacements d'un tour : le héros rejoint sa cible, les autres se referment. */
function move() {
  const t = pos.value[targetIdx.value];
  if (t) {
    const dx = heroPos.value.x - t.x;
    const dy = heroPos.value.y - t.y;
    const d = Math.hypot(dx, dy) || 1;
    heroPos.value = { x: t.x + (dx / d) * REACH, y: t.y + (dy / d) * REACH };
    facing.value = t.x < heroPos.value.x ? -1 : 1;
  }
  pos.value = pos.value.map((p, k) => {
    if (k === targetIdx.value || foePv(k) <= 0) return p; // la cible est déjà au contact
    const dx = heroPos.value.x - p.x;
    const dy = heroPos.value.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d <= RING) return p;
    return {
      x: p.x + dx * Math.min(CREEP, (d - RING) / d),
      y: p.y + dy * Math.min(CREEP, (d - RING) / d),
    };
  });
}

function clearFx() {
  hurtIdx.value = null;
  heroHurt.value = false;
  lunging.value = false;
  shake.value = '';
  critFlash.value = false;
}

/** Joue un beat. Renvoie le SUPPLÉMENT de délai à observer (ralenti). */
function apply(step: { wi: number; bi: number }): number {
  if (step.wi !== waveIdx.value) enterWave(step.wi);
  const w = props.waves[step.wi];
  const b = w?.beats[step.bi];
  if (!w || !b) return 0;

  const prevHero = heroPv.value;
  dealt.value = b.dealt;
  heroPv.value = b.heroPv;
  if (b.who === 'player') targetIdx.value = b.foeIdx;
  move();

  const at = b.who === 'player' ? (pos.value[b.foeIdx] ?? heroPos.value) : heroPos.value;
  const id = ++uid;
  pops.value = [
    ...pops.value.slice(-5),
    {
      id,
      x: at.x,
      y: at.y - 0.05,
      text: b.type === 'dodge' ? 'esquive' : (b.type === 'crit' ? 'CRIT −' : '−') + b.damage,
      kind: b.type,
    },
  ];
  later(() => (pops.value = pops.value.filter((p) => p.id !== id)), 700);

  if (b.type !== 'dodge') {
    if (b.who === 'player') {
      hurtIdx.value = b.foeIdx;
      lunging.value = true; // le héros s'élance sur sa cible
      // Arc de lame orienté du héros vers le corps frappé.
      const rot = (Math.atan2(at.y - heroPos.value.y, at.x - heroPos.value.x) * 180) / Math.PI;
      const sid = ++uid;
      slashes.value = [
        ...slashes.value.slice(-3),
        { id: sid, x: at.x, y: at.y, rot, crit: b.type === 'crit' },
      ];
      later(() => (slashes.value = slashes.value.filter((s) => s.id !== sid)), 260);
      if (b.type === 'crit') {
        shake.value = 'sh-m';
        critFlash.value = true;
      }
    } else {
      heroHurt.value = true;
      const lost = Math.max(0, prevHero - b.heroPv);
      // Le voile rouge dose la peur : un coup qui gratte ne doit pas hurler.
      hitVig.value = Math.min(0.5, lost / Math.max(1, props.playerMaxPv * 0.16));
      later(() => (hitVig.value = 0), 320);
      shake.value = b.type === 'crit' ? 'sh-l' : lost > props.playerMaxPv * 0.06 ? 'sh-m' : '';
      if (b.type === 'crit') critFlash.value = true;
    }
  }

  // Chaque corps qui tombe explose ; la barre fantôme rattrape après coup.
  for (const k of b.kills) {
    kills.value++;
    const p = pos.value[k];
    if (p && !reduce) {
      for (let s = 0; s < 8; s++) {
        const a = (s / 8) * Math.PI * 2;
        const pid = ++uid;
        sparks.value.push({
          id: pid,
          x: p.x,
          y: p.y,
          dx: Math.cos(a) * 34,
          dy: Math.sin(a) * 34,
        });
        later(() => (sparks.value = sparks.value.filter((q) => q.id !== pid)), 520);
      }
    }
  }
  later(() => (ghostPv.value = heroPv.value), 260);
  later(clearFx, 170);

  // Ralenti : le corps qui CLÔT une vague, et le coup qui tue le héros.
  const lastOfWave = b.kills.length > 0 && b.dealt >= w.totalPv && w.cleared;
  const isFinal = step.wi === props.waves.length - 1 && step.bi === w.beats.length - 1;
  if (lastOfWave) {
    if (!reduce) showBanner('clear', `VAGUE ${w.wave} TENUE`, '✓');
    return SLOW_WAVE;
  }
  if (isFinal && b.heroPv <= 0) return SLOW_DEATH;
  return 0;
}

function finish() {
  clearTimeout(timer);
  timer = undefined;
  clearFx();
  pops.value = [];
  slashes.value = [];
  endWaves.value = props.waves.filter((w) => w.cleared).length;
  ended.value = true;
  // On ne ferme PAS tout seul : l'écran de fin est le moment du score. Le joueur
  // enchaîne quand il veut (bouton), ou « Passer » s'il est pressé.
}

function tick() {
  const step = steps.value[i.value];
  if (!step) return finish();
  i.value++;
  const extra = apply(step);
  timer = setTimeout(tick, stepMs.value + extra);
}

function skip() {
  clearTimeout(timer);
  // Dernier état, sans rejouer les centaines de beats intermédiaires.
  const last = steps.value[steps.value.length - 1];
  if (last) {
    const w = props.waves[last.wi];
    const b = w?.beats[last.bi];
    if (w && b) {
      waveIdx.value = last.wi;
      dealt.value = b.dealt;
      heroPv.value = b.heroPv;
      ghostPv.value = b.heroPv;
    }
    kills.value = props.waves.reduce(
      (a, w2) => a + w2.beats.reduce((c, bb) => c + bb.kills.length, 0),
      0,
    );
  }
  finish();
}

function start() {
  clearTimeout(timer);
  i.value = 0;
  kills.value = 0;
  ended.value = false;
  heroPv.value = props.playerStartPv ?? props.playerMaxPv;
  ghostPv.value = heroPv.value;
  enterWave(0);
  if (reduce || !steps.value.length) {
    skip(); // accessibilité : état final direct, sans animation
    return;
  }
  timer = setTimeout(tick, 620); // laisse l'annonce de la 1re vague se poser
}

onMounted(start);
onBeforeUnmount(() => {
  clearTimeout(timer);
  for (const t of fxTimers) clearTimeout(t);
});
</script>

<style scoped lang="scss">
.arena {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(
      ellipse at 50% 42%,
      color-mix(in srgb, var(--surface) 70%, #000),
      var(--bg) 70%
    ),
    var(--bg);
  user-select: none;
}

/* ── Ambiance ── */
.amb {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.torch {
  position: absolute;
  top: 12%;
  width: 34%;
  height: 34%;
  border-radius: 50%;
  filter: blur(42px);
  opacity: 0.16;
  background: var(--accent);
  animation: flicker 3.4s ease-in-out infinite;
}
.torch.t1 {
  left: -6%;
}
.torch.t2 {
  right: -6%;
  animation-delay: 1.1s;
}
.mote {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 60%, transparent);
  opacity: 0.35;
  animation: drift linear infinite;
}

/* ── Terrain ── */
.floor {
  position: absolute;
  inset: 8% 4% 12%;
}
.sand {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--accent) 22%, var(--line));
  background:
    radial-gradient(
      ellipse at 50% 40%,
      color-mix(in srgb, var(--accent) 10%, transparent),
      transparent 64%
    ),
    color-mix(in srgb, var(--surface) 86%, #000);
  box-shadow:
    inset 0 0 60px rgba(0, 0, 0, 0.6),
    0 0 40px color-mix(in srgb, var(--accent) 8%, transparent);
}
/* Second cercle : donne de la profondeur, comme une piste tracée dans le sable. */
.ring-in {
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  border: 1px dashed color-mix(in srgb, var(--accent) 12%, transparent);
}

.foe,
.hero,
.pop,
.slash,
.spark {
  position: absolute;
  transform: translate(-50%, -50%);
}
.foe,
.hero {
  transition:
    left 0.19s linear,
    top 0.19s linear;
}
.shadow {
  position: absolute;
  bottom: -7px;
  left: 50%;
  width: 26px;
  height: 7px;
  margin-left: -13px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.42);
  filter: blur(2px);
}
.shadow.big {
  width: 36px;
  margin-left: -18px;
  bottom: -4px;
}

.foe {
  display: grid;
  justify-items: center;
  gap: 2px;
  width: 34px;
}
.foe-emo {
  font-size: 24px;
  line-height: 1;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.7));
  transition: transform 0.14s;
}
.foe-aura {
  position: absolute;
  top: 6px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  opacity: 0.45;
  filter: blur(6px);
  background: var(--dim);
}
.foe-aura.ar-evasive {
  background: #6fd3ff;
}
.foe-aura.ar-striker {
  background: var(--d4);
}
.foe-aura.ar-brute {
  background: var(--d3);
}
.foe-aura.ar-tank {
  background: #9a8f7e;
}
.foe-bar {
  width: 26px;
  height: 3px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.6);
  overflow: hidden;
}
.foe-bar i {
  display: block;
  height: 100%;
  background: var(--d4);
  transition: width 0.17s linear;
}
.foe.target .foe-emo {
  transform: scale(1.16);
}
.foe.target .foe-aura {
  opacity: 0.9;
}
.foe.hurt .foe-emo {
  animation: bump 0.17s;
}
.foe.dead {
  opacity: 0;
  transform: translate(-50%, -20%) scale(0.4) rotate(30deg);
  transition:
    opacity 0.34s,
    transform 0.34s;
  pointer-events: none;
}
.foe.dead .foe-bar,
.foe.dead .shadow,
.foe.dead .foe-aura {
  opacity: 0;
}
.foe.spawning .foe-emo {
  animation: spawn 0.38s;
}

.hero {
  z-index: 40;
}
.hero-av {
  width: 54px;
  height: 66px;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.65));
  transition: transform 0.12s;
}
.hero.hurt .hero-av {
  animation: bump 0.17s;
}
.hero.lunge {
  animation: lunge 0.17s;
}

/* Arc de lame : un croissant qui balaie le point d'impact. */
.slash {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: var(--text);
  border-right-color: var(--text);
  opacity: 0.9;
  animation: slash 0.26s ease-out forwards;
  pointer-events: none;
}
.slash.crit {
  border-top-color: var(--accent);
  border-right-color: var(--accent);
  width: 62px;
  height: 62px;
}

.spark {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--d4);
  animation: spark 0.5s ease-out forwards;
  pointer-events: none;
}

.pop {
  z-index: 60;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
  animation: floatUp 0.7s forwards;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.95);
}
.pop.hit {
  color: var(--text);
}
.pop.crit {
  color: var(--accent);
  font-size: 19px;
}
.pop.dodge {
  color: var(--dim);
  font-style: italic;
}

.crit-flash {
  position: absolute;
  inset: 0;
  z-index: 70;
  background: var(--accent);
  opacity: 0.14;
  pointer-events: none;
}
/* Voile rouge dosé par la violence du coup encaissé. */
.hit-vig {
  position: absolute;
  inset: 0;
  z-index: 69;
  pointer-events: none;
  transition: opacity 0.18s;
  background: radial-gradient(ellipse at 50% 50%, transparent 42%, rgba(220, 40, 30, 0.85) 100%);
}

/* ── Annonces ── */
.banner {
  position: absolute;
  left: 0;
  right: 0;
  top: 38%;
  z-index: 80;
  display: grid;
  justify-items: center;
  gap: 2px;
  pointer-events: none;
  animation: bannerIn 1.1s ease-out forwards;
}
.bn-main {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--text);
  text-shadow: 0 3px 14px rgba(0, 0, 0, 0.9);
}
.banner.clear .bn-main {
  color: var(--d1);
}
.bn-sub {
  font-size: 13px;
  color: var(--dim);
  letter-spacing: 1px;
}

/* ── HUD ── */
.hud {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 75;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--dim);
}
.hud.top {
  top: 0;
}
.hud.bottom {
  bottom: 0;
}
.hud-wave {
  color: var(--text);
  font-size: 15px;
}
.skip {
  margin-left: auto;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  color: var(--dim);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
}
.hud-pv {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hud-pv b {
  color: var(--text);
  font-variant-numeric: tabular-nums;
  font-size: 15px;
}
.pv-bar {
  position: relative;
  display: block;
  width: 140px;
  height: 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.pv-bar i {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  display: block;
}
/* Fantôme : rattrape la vraie barre avec un temps de retard → on VOIT le coup. */
.pv-ghost {
  background: var(--d4);
  transition: width 0.45s ease-out;
}
.pv-fill {
  background: var(--d1);
  transition: width 0.12s linear;
}
.pv-bar.low .pv-fill {
  background: var(--d4);
  animation: pulse 0.9s ease-in-out infinite;
}
.hud-kills {
  margin-left: auto;
  color: var(--accent);
  font-weight: 700;
  animation: bump 0.25s;
}

/* ── Fin ── */
.end {
  position: absolute;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(2px);
  animation: fadeIn 0.4s;
}
.end-in {
  display: grid;
  justify-items: center;
  gap: 2px;
  text-align: center;
  padding: 0 20px;
}
.end-emo {
  font-size: 42px;
}
.end-n {
  font-size: 64px;
  font-weight: 700;
  line-height: 1;
  color: var(--accent);
}
.end-lbl {
  font-size: 15px;
  color: var(--text);
}
.end-sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--dim);
}
.end-cta {
  margin-top: 18px;
  border: 0;
  border-radius: 999px;
  padding: 11px 26px;
  font-size: 15px;
  font-weight: 700;
  background: var(--accent);
  color: #15120e;
  cursor: pointer;
}

/* ── Secousses de caméra, dosées ── */
.sh-m {
  animation: shakeM 0.17s;
}
.sh-l {
  animation: shakeL 0.26s;
}

@keyframes bump {
  50% {
    transform: scale(1.32);
  }
}
@keyframes spawn {
  0% {
    transform: scale(0) rotate(-45deg);
    opacity: 0;
  }
  70% {
    transform: scale(1.3);
    opacity: 1;
  }
}
@keyframes lunge {
  50% {
    transform: translate(-50%, -50%) scale(1.14);
  }
}
@keyframes slash {
  0% {
    transform: translate(-50%, -50%) scale(0.4);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.5);
    opacity: 0;
  }
}
@keyframes spark {
  0% {
    transform: translate(-50%, -50%);
    opacity: 1;
  }
  100% {
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.3);
    opacity: 0;
  }
}
@keyframes floatUp {
  to {
    transform: translate(-50%, -210%);
    opacity: 0;
  }
}
@keyframes bannerIn {
  0% {
    opacity: 0;
    transform: scale(0.86);
    letter-spacing: 14px;
  }
  22% {
    opacity: 1;
    transform: scale(1);
  }
  78% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes shakeM {
  25% {
    transform: translate(-4px, 2px);
  }
  75% {
    transform: translate(4px, -2px);
  }
}
@keyframes shakeL {
  20% {
    transform: translate(-9px, 4px) rotate(-0.5deg);
  }
  60% {
    transform: translate(8px, -4px) rotate(0.5deg);
  }
  90% {
    transform: translate(-3px, 1px);
  }
}
@keyframes flicker {
  50% {
    opacity: 0.26;
  }
}
@keyframes drift {
  0% {
    transform: translateY(12px);
    opacity: 0;
  }
  30% {
    opacity: 0.4;
  }
  100% {
    transform: translateY(-58px);
    opacity: 0;
  }
}
@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
}

/* Accessibilité : on garde la lisibilité, on retire le mouvement. */
.arena.reduce {
  .foe,
  .hero,
  .foe.dead {
    transition: none;
  }
  .mote,
  .torch,
  .pop,
  .slash,
  .spark,
  .banner,
  .hud-kills,
  .pv-bar.low .pv-fill,
  .foe.hurt .foe-emo,
  .hero.hurt .hero-av,
  .hero.lunge,
  .foe.spawning .foe-emo {
    animation: none;
  }
  .crit-flash,
  .hit-vig {
    display: none;
  }
}
</style>
