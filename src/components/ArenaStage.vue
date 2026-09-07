<template>
  <div class="arena" :class="{ qshake: stageShake }">
    <div v-if="critFlash" class="crit-flash" />

    <!-- Le terrain : un ovale de sable cerclé de gradins. -->
    <div class="floor">
      <div class="sand" />

      <!-- Corps ennemis : surgis en anneau, ils se referment sur le héros. -->
      <div
        v-for="(f, i) in foes"
        :key="waveIdx + '-' + i"
        class="foe"
        :class="{
          dead: foePv(i) <= 0,
          target: i === targetIdx && foePv(i) > 0,
          hurt: hurtIdx === i,
          spawning: spawning,
        }"
        :style="{
          left: (pos[i]?.x ?? f.x) * 100 + '%',
          top: (pos[i]?.y ?? f.y) * 100 + '%',
          zIndex: 10 + i,
        }"
      >
        <span class="foe-aura" :class="'ar-' + f.archetype" />
        <span class="foe-emo">{{ f.emoji }}</span>
        <span class="foe-bar"><i :style="{ width: foePct(i) + '%' }" /></span>
      </div>

      <!-- Le héros : il fonce sur sa cible et se retourne pour la faire face. -->
      <div
        class="hero"
        :class="{ hurt: heroHurt }"
        :style="{ left: heroPos.x * 100 + '%', top: heroPos.y * 100 + '%' }"
      >
        <div class="hero-av" :style="{ transform: facing < 0 ? 'scaleX(-1)' : 'none' }">
          <AventureAvatar :profile="playerProfile" :equipped="playerEquipped" />
        </div>
      </div>

      <!-- Dégâts flottants, posés à l'endroit du coup. -->
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

    <!-- Bandeau : vague en cours, corps restants, vie du héros. -->
    <div class="hud">
      <span class="hud-wave font-display">🌊 Vague {{ waveNo }}</span>
      <span class="hud-foes">{{ aliveCount }} en vie</span>
      <span class="hud-pv">
        <span class="pv-bar"><i :style="{ width: heroPct + '%' }" /></span>
        <b>{{ heroPv }}</b>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
// ARÈNE PHYSIQUE — rendu spatial d'une run d'arène. Ne calcule AUCUN combat : il
// rejoue la chorégraphie de `buildArenaStage`, elle-même dérivée du log seedé de
// `simulateCombat` (cf. la règle fondatrice d'arenaStage.ts). Tout ce qui vit ici est
// de la position et de l'effet : le sort de la run est déjà scellé.
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

// Séquence à plat : un pas = un beat + l'index de sa vague.
const steps = computed(() => {
  const out: { wi: number; bi: number }[] = [];
  props.waves.forEach((w, wi) => w.beats.forEach((_, bi) => out.push({ wi, bi })));
  return out;
});
// Une run d'arène peut enchaîner beaucoup plus de combats qu'un donjon → on accélère
// quand la séquence s'allonge (même règle que CombatStage).
const stepMs = computed(() => (steps.value.length > 60 ? 90 : steps.value.length > 25 ? 150 : 220));

const CREEP = 0.14; // fraction de la distance parcourue par un monstre entre 2 beats
const RING = 0.12; // distance à laquelle un monstre s'arrête (il encercle, il ne chevauche pas)
const REACH = 0.1; // le héros se poste à cette distance de sa cible

const i = ref(0);
const waveIdx = ref(0);
const dealt = ref(0);
const heroPv = ref(props.playerStartPv ?? props.playerMaxPv);
const heroPos = ref({ x: 0.5, y: 0.5 });
// Positionne d'emblée la 1re vague : le 1er rendu a lieu AVANT onMounted/start().
const pos = ref<{ x: number; y: number }[]>(
  (props.waves[0]?.foes ?? []).map((f) => ({ x: f.x, y: f.y })),
);
const targetIdx = ref(0);
const facing = ref(1);
const spawning = ref(false);
const hurtIdx = ref<number | null>(null);
const heroHurt = ref(false);
const stageShake = ref(false);
const critFlash = ref(false);
const pops = ref<{ id: number; x: number; y: number; text: string; kind: string }[]>([]);
let popId = 0;

let timer: ReturnType<typeof setInterval> | undefined;
let fxTimer: ReturnType<typeof setTimeout> | undefined;
let spawnTimer: ReturnType<typeof setTimeout> | undefined;

const wave = computed(() => props.waves[waveIdx.value] ?? null);
const foes = computed(() => wave.value?.foes ?? []);
const waveNo = computed(() => wave.value?.wave ?? 1);
const heroPct = computed(() => Math.round((heroPv.value / Math.max(1, props.playerMaxPv)) * 100));
function foePv(idx: number): number {
  return wave.value ? foePvAt(wave.value, idx, dealt.value) : 0;
}
function foePct(idx: number): number {
  const max = foes.value[idx]?.maxPv ?? 1;
  return Math.round((foePv(idx) / Math.max(1, max)) * 100);
}
const aliveCount = computed(() => foes.value.filter((_, k) => foePv(k) > 0).length);

/** Place les corps de la vague à leur point de surgissement et ramène le héros au centre. */
function enterWave(wi: number) {
  waveIdx.value = wi;
  dealt.value = 0;
  const w = props.waves[wi];
  pos.value = (w?.foes ?? []).map((f) => ({ x: f.x, y: f.y }));
  heroPos.value = { x: 0.5, y: 0.5 };
  targetIdx.value = 0;
  spawning.value = true;
  clearTimeout(spawnTimer);
  spawnTimer = setTimeout(() => (spawning.value = false), 360);
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
  // Les corps encore debout convergent — sauf la cible, déjà au contact.
  pos.value = pos.value.map((p, k) => {
    if (k === targetIdx.value || foePv(k) <= 0) return p;
    const dx = heroPos.value.x - p.x;
    const dy = heroPos.value.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d <= RING) return p;
    const step = Math.min(CREEP, (d - RING) / d);
    return { x: p.x + dx * step, y: p.y + dy * step };
  });
}

function clearFx() {
  hurtIdx.value = null;
  heroHurt.value = false;
  stageShake.value = false;
  critFlash.value = false;
}

function apply(step: { wi: number; bi: number }) {
  if (step.wi !== waveIdx.value) enterWave(step.wi);
  const w = props.waves[step.wi];
  const b = w?.beats[step.bi];
  if (!w || !b) return;

  dealt.value = b.dealt;
  heroPv.value = b.heroPv;
  if (b.who === 'player') targetIdx.value = b.foeIdx;
  move();

  // Le pop se pose sur le DÉFENSEUR : sur le corps frappé, ou sur le héros.
  const at = b.who === 'player' ? (pos.value[b.foeIdx] ?? heroPos.value) : heroPos.value;
  const text = b.type === 'dodge' ? 'esquive' : (b.type === 'crit' ? 'CRIT −' : '−') + b.damage;
  const id = ++popId;
  pops.value = [...pops.value.slice(-4), { id, x: at.x, y: at.y - 0.08, text, kind: b.type }];
  setTimeout(() => (pops.value = pops.value.filter((p) => p.id !== id)), 620);

  if (b.type !== 'dodge') {
    if (b.who === 'player') hurtIdx.value = b.foeIdx;
    else heroHurt.value = true;
    if (b.type === 'crit') {
      stageShake.value = true;
      critFlash.value = true;
    }
  }
  clearTimeout(fxTimer);
  fxTimer = setTimeout(clearFx, 160);
}

function finish() {
  clearInterval(timer);
  timer = undefined;
  clearFx();
  pops.value = [];
  emit('done');
}

function start() {
  clearInterval(timer);
  i.value = 0;
  heroPv.value = props.playerStartPv ?? props.playerMaxPv;
  enterWave(0);
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !steps.value.length) {
    // Accessibilité : pas d'animation → dernier état, directement.
    const last = steps.value[steps.value.length - 1];
    if (last) apply(last);
    finish();
    return;
  }
  timer = setInterval(() => {
    if (i.value >= steps.value.length) return finish();
    apply(steps.value[i.value]!);
    i.value++;
  }, stepMs.value);
}

onMounted(start);
onBeforeUnmount(() => {
  clearInterval(timer);
  clearTimeout(fxTimer);
  clearTimeout(spawnTimer);
});
</script>

<style scoped lang="scss">
.arena {
  position: relative;
  padding: 4px 0 2px;
}
.floor {
  position: relative;
  aspect-ratio: 4 / 3;
  max-height: 244px;
  margin: 0 auto;
  width: 100%;
}
/* Le sable : ovale cerclé, éclairé au centre comme sous un projecteur. */
.sand {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid var(--line);
  background:
    radial-gradient(
      ellipse at 50% 42%,
      color-mix(in srgb, var(--primary, #ffd23f) 12%, transparent),
      transparent 62%
    ),
    color-mix(in srgb, var(--surface) 88%, #000);
  box-shadow: inset 0 0 26px rgba(0, 0, 0, 0.55);
}
.foe,
.hero,
.pop {
  position: absolute;
  transform: translate(-50%, -50%);
}
.foe,
.hero {
  transition:
    left 0.2s linear,
    top 0.2s linear;
}
.foe {
  display: grid;
  justify-items: center;
  gap: 1px;
  width: 30px;
}
.foe-emo {
  font-size: 20px;
  line-height: 1;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6));
}
.foe-aura {
  position: absolute;
  top: 8px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  opacity: 0.5;
  filter: blur(5px);
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
  width: 24px;
  height: 3px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.foe-bar i {
  display: block;
  height: 100%;
  background: var(--d4);
  transition: width 0.18s linear;
}
/* La cible du héros se distingue : c'est là que ça se joue. */
.foe.target .foe-emo {
  transform: scale(1.14);
}
.foe.target .foe-aura {
  opacity: 0.85;
}
.foe.hurt .foe-emo {
  animation: bump 0.16s;
}
.foe.dead {
  opacity: 0;
  transform: translate(-50%, -30%) scale(0.5) rotate(22deg);
  transition:
    opacity 0.35s,
    transform 0.35s;
  pointer-events: none;
}
.foe.dead .foe-bar {
  opacity: 0;
}
.foe.spawning .foe-emo {
  animation: spawn 0.36s;
}
.hero {
  z-index: 40;
}
.hero-av {
  width: 42px;
  height: 52px;
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.6));
}
.hero.hurt .hero-av {
  animation: bump 0.16s;
}
.pop {
  z-index: 60;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
  animation: floatUp 0.62s forwards;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.pop.hit {
  color: var(--text);
}
.pop.crit {
  color: var(--d4);
  font-size: 14px;
}
.pop.dodge {
  color: var(--dim);
  font-style: italic;
}
.crit-flash {
  position: absolute;
  inset: 0;
  z-index: 70;
  background: var(--primary, #ffd23f);
  opacity: 0.16;
  pointer-events: none;
  border-radius: 12px;
}
.qshake {
  animation: shake 0.16s;
}
.hud {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--dim);
}
.hud-wave {
  color: var(--text);
}
.hud-pv {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.hud-pv b {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.pv-bar {
  display: block;
  width: 64px;
  height: 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.pv-bar i {
  display: block;
  height: 100%;
  background: var(--d1);
  transition: width 0.18s linear;
}

@keyframes bump {
  50% {
    transform: scale(1.3);
  }
}
@keyframes spawn {
  0% {
    transform: scale(0) rotate(-40deg);
    opacity: 0;
  }
  70% {
    transform: scale(1.25);
    opacity: 1;
  }
}
@keyframes floatUp {
  to {
    transform: translate(-50%, -180%);
    opacity: 0;
  }
}
@keyframes shake {
  25% {
    transform: translateX(-3px);
  }
  75% {
    transform: translateX(3px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .foe,
  .hero,
  .foe.dead {
    transition: none;
  }
  .pop,
  .foe.hurt .foe-emo,
  .hero.hurt .hero-av,
  .foe.spawning .foe-emo,
  .qshake {
    animation: none;
  }
  .crit-flash {
    display: none;
  }
}
</style>
