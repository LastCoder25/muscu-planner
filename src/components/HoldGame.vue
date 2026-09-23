<template>
  <q-dialog v-model="open" maximized persistent>
    <div class="hg">
      <!-- ⚠️ LE CHRONO EST DANS LE JEU, EN GRAND : décision de l'utilisateur, il doit
           toujours être visible. Le mettre ailleurs obligerait à regarder deux endroits,
           et on reviendrait le fixer. -->
      <header class="hg-top">
        <div class="hg-clock">{{ clock }}</div>
        <div class="hg-rule">{{ def.rule }}</div>
        <q-btn flat dense round icon="close" aria-label="Quitter le jeu" @click="quit" />
      </header>

      <div class="hg-stage">
        <component :is="scene" :beats="visible" :pulse="pulse" :reduced="reduced" />
      </div>

      <div class="hg-hud">
        <span class="hg-score">{{ score.score }}</span>
        <span v-if="score.bestStreak > 2" class="hg-streak">série {{ streak }}</span>
        <span v-if="best > 0" class="hg-best">record {{ best }}</span>
      </div>

      <!-- Deux zones, larges et plates. ⚠️ `pointerdown` et non `click` : dans un jeu de
           rythme, la latence d'un clic se sent. -->
      <div class="hg-pads">
        <button
          class="hg-pad"
          :class="{ lit: litLeft }"
          aria-label="Gauche"
          @pointerdown.prevent="tap('left')"
        >
          <span class="hg-pad-mark">◀</span>
        </button>
        <button
          class="hg-pad"
          :class="{ lit: litRight }"
          aria-label="Droite"
          @pointerdown.prevent="tap('right')"
        >
          <span class="hg-pad-mark">▶</span>
        </button>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import {
  activeBeats,
  buildHoldPlan,
  holdGame,
  judgeTap,
  scoreHold,
  targetBeat,
  type ActiveBeat,
  type HoldGameId,
  type HoldPlan,
  type HoldSide,
  type HoldTap,
  type HoldVerdict,
} from '@/lib/holdGames';
import HoldSceneRepousse from './hold/HoldSceneRepousse.vue';
import HoldSceneCadence from './hold/HoldSceneCadence.vue';
import HoldSceneTri from './hold/HoldSceneTri.vue';

const props = defineProps<{
  modelValue: boolean;
  game: HoldGameId;
  /** La durée visée — elle cale la montée en difficulté, pas la fin du jeu. */
  targetSec: number;
  /** Le chrono de l'écran hôte : c'est lui la source de vérité du temps officiel. */
  elapsedSec: number;
  /** Faux quand l'exo est en pause : le jeu se fige avec lui. */
  running: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [boolean];
  quit: [];
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const def = computed(() => holdGame(props.game));

const SCENES = {
  repousse: HoldSceneRepousse,
  cadence: HoldSceneCadence,
  tri: HoldSceneTri,
} as const;
const scene = computed(() => SCENES[props.game]);

const reduced =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

// ── Le temps ───────────────────────────────────────────────────────────────────
// ⚠️ DEUX HORLOGES, ET C'EST VOULU : celle de l'hôte bat à la seconde (elle mesure
// l'exercice), un jeu en a besoin à l'image près. On part de l'écoulé de l'hôte puis on
// avance seul — une dérive de quelques dizaines de ms sur une minute est invisible, et
// c'est l'hôte qui décide quand ça s'arrête.
const nowMs = ref(0);
let raf = 0;
let lastFrame = 0;

function loop(t: number) {
  if (lastFrame) nowMs.value += t - lastFrame;
  lastFrame = t;
  raf = requestAnimationFrame(loop);
}

function start() {
  if (raf) return;
  lastFrame = 0;
  raf = requestAnimationFrame(loop);
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  lastFrame = 0;
}

onBeforeUnmount(stop);

// ── La partie ──────────────────────────────────────────────────────────────────
const plan = shallowRef<HoldPlan>(buildHoldPlan(props.game, props.targetSec, 1));
const resolved = ref(new Set<number>());
const taps = ref<HoldTap[]>([]);
const pulse = ref<{ side: HoldSide; verdict: HoldVerdict; at: number } | null>(null);
const best = ref(0);

function reset() {
  // La graine change à chaque partie : deux gainages d'affilée ne se ressemblent pas.
  plan.value = buildHoldPlan(props.game, props.targetSec, Date.now() & 0xffff || 1);
  resolved.value = new Set();
  taps.value = [];
  pulse.value = null;
  nowMs.value = props.elapsedSec * 1000;
  best.value = readBest(props.game);
}

const visible = computed<ActiveBeat[]>(() => activeBeats(plan.value, nowMs.value, resolved.value));

// ⚠️ Le score vient de `scoreHold`, jamais d'un compteur tenu à part : deux façons de
// compter finiraient par afficher un chiffre que le record ne reconnaît pas.
const score = computed(() => scoreHold(plan.value, taps.value, nowMs.value));

const streak = computed(() => {
  let n = 0;
  for (const beat of plan.value.beats) {
    const tap = taps.value.find((x) => x.beatId === beat.id);
    if (!tap) {
      if (beat.at + beat.windowMs <= nowMs.value) n = 0;
      continue;
    }
    const v = judgeTap(beat, tap.side, tap.at);
    n = v === 'perfect' || v === 'good' ? n + 1 : 0;
  }
  return n;
});

const clock = computed(() => {
  const s = Math.max(0, Math.floor(props.elapsedSec));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
});

// ⚠️ LES WATCHERS VIENNENT APRÈS `score`, ET CE N'EST PAS COSMÉTIQUE : un `watch` immédiat
// s'exécute PENDANT le setup. Déclaré plus haut, il lirait `score` avant son initialisation
// — zone morte temporelle, donc écran qui ne se monte plus. Le projet s'est déjà fait
// prendre (v0.910) ; `mount.test` existe pour ça, et ne doit pas avoir à le rattraper.
watch(
  () => props.modelValue,
  (on) => {
    if (on) {
      reset();
      if (props.running) start();
    } else {
      stop();
      saveBest(props.game, score.value.score);
    }
  },
  { immediate: true },
);

watch(
  () => props.running,
  (on) => {
    if (!props.modelValue) return;
    if (on) start();
    else stop();
  },
);

const litLeft = computed(() => pulse.value?.side === 'left' && fresh(pulse.value.at));
const litRight = computed(() => pulse.value?.side === 'right' && fresh(pulse.value.at));
function fresh(at: number) {
  return nowMs.value - at < 180;
}

function tap(side: HoldSide) {
  if (!props.running) return;
  const beat = targetBeat(plan.value, nowMs.value, resolved.value);
  // Taper dans le vide ne coûte rien : on ne punit pas quelqu'un qui souffre.
  if (!beat) return;
  resolved.value = new Set(resolved.value).add(beat.id);
  taps.value = [...taps.value, { beatId: beat.id, side, at: nowMs.value }];
  pulse.value = { side, verdict: judgeTap(beat, side, nowMs.value), at: nowMs.value };
}

function quit() {
  saveBest(props.game, score.value.score);
  emit('quit');
  open.value = false;
}

// ── Le record, par appareil ────────────────────────────────────────────────────
// ⚠️ Purement cosmétique : ni énergie, ni or, ni XP. L'effort est DÉJÀ payé par l'exo,
// le payer une seconde fois via un mini-jeu rouvrirait un chantier d'équilibrage.
function key(game: HoldGameId) {
  return `muscu:hold:best:${game}`;
}

function readBest(game: HoldGameId): number {
  try {
    return Number(localStorage.getItem(key(game)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function saveBest(game: HoldGameId, value: number) {
  if (value <= best.value) return;
  best.value = value;
  try {
    localStorage.setItem(key(game), String(value));
  } catch {
    /* navigation privée, stockage bloqué : le record n'est pas essentiel */
  }
}
</script>

<style scoped>
.hg {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
  overscroll-behavior: contain;
  touch-action: manipulation;
  user-select: none;
}
.hg-top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px 6px 16px;
}
.hg-clock {
  font-family: 'Oswald', sans-serif;
  font-size: 40px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.hg-rule {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.25;
  color: var(--dim);
}
.hg-stage {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
.hg-hud {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 4px 16px 8px;
}
.hg-score {
  font-family: 'Oswald', sans-serif;
  font-size: 22px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.hg-streak,
.hg-best {
  font-size: 12px;
  color: var(--dim);
}
.hg-pads {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 0 8px 8px;
}
.hg-pad {
  /* ⚠️ Très haut, et c'est le point : le téléphone est tenu au-dessus du visage et on
     tremble. Une cible généreuse fait toute la différence entre jouable et pénible. */
  height: 132px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  color: var(--dim);
  font-size: 26px;
  cursor: pointer;
  transition: background 90ms linear;
}
.hg-pad.lit {
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
  color: var(--text);
}
.hg-pad-mark {
  opacity: 0.5;
}
@media (prefers-reduced-motion: reduce) {
  .hg-pad {
    transition: none;
  }
}
</style>
