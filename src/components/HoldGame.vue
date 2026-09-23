<template>
  <q-dialog v-model="open" maximized persistent>
    <div class="hg">
      <!-- ⚠️ LE CHRONO EST DANS LE JEU, EN GRAND : décision de l'utilisateur, il doit
           toujours être visible. Le mettre ailleurs obligerait à regarder deux endroits,
           et on reviendrait le fixer. -->
      <header class="hg-top">
        <div class="hg-clock">{{ clock }}</div>
        <div class="hg-rule">{{ def.rule }}</div>
        <q-btn flat dense round icon="close" aria-label="Quitter le jeu" @click="open = false" />
      </header>

      <div class="hg-stage">
        <component :is="scene" :beats="visible" :pulse="livePulse" :reduced="reduced" />
      </div>

      <div class="hg-hud">
        <span class="hg-score">{{ score.score }}</span>
        <span v-if="score.streak > 2" class="hg-streak">série {{ score.streak }}</span>
        <span v-if="best > 0" class="hg-best">record {{ best }}</span>
      </div>

      <!-- Deux zones, larges et plates. ⚠️ `pointerdown` et non `click` : dans un jeu de
           rythme, la latence d'un clic se sent. -->
      <div class="hg-pads">
        <button
          class="hg-pad"
          :class="{ lit: lit === 'left' }"
          aria-label="Gauche"
          @pointerdown.prevent="tap('left')"
        >
          <span class="hg-pad-mark">◀</span>
        </button>
        <button
          class="hg-pad"
          :class="{ lit: lit === 'right' }"
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
  activePulse,
  buildHoldPlan,
  holdGame,
  judgeTap,
  readHoldBest,
  saveHoldBest,
  scoreHold,
  targetBeat,
  type ActiveBeat,
  type HoldGameId,
  type HoldPlan,
  type HoldPulse,
  type HoldSide,
  type HoldTap,
} from '@/lib/holdGames';
import { formatClock } from '@/lib/duration';
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

const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const def = computed(() => holdGame(props.game));

// Exhaustive par construction : ajouter un jeu sans sa scène ne compile plus.
const SCENES: Record<HoldGameId, unknown> = {
  repousse: HoldSceneRepousse,
  cadence: HoldSceneCadence,
  tri: HoldSceneTri,
};
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
// Plan VIDE au départ : `reset()` le remplit avant la première image, et un plan
// construit ici avec une graine bidon serait généré puis jeté à chaque montage.
const plan = shallowRef<HoldPlan>({ game: props.game, durationSec: props.targetSec, beats: [] });
// ⚠️ `shallowRef` POUR LES TROIS : `tap()` remplace toujours la valeur ENTIÈRE, donc la
// réactivité se déclenche à l'identique — mais un `ref` profond enveloppe chaque élément
// dans un proxy, et ces structures sont relues à CHAQUE image. Mesuré : ~1 million
// d'opérations de proxy par seconde, plus une dépendance reconstruite par sollicitation.
const resolved = shallowRef(new Set<number>());
const taps = shallowRef<HoldTap[]>([]);
const pulse = shallowRef<HoldPulse | null>(null);
const best = ref(0);

function reset() {
  // La graine change à chaque partie : deux gainages d'affilée ne se ressemblent pas.
  plan.value = buildHoldPlan(props.game, props.targetSec, Date.now() & 0xffff || 1);
  resolved.value = new Set();
  taps.value = [];
  pulse.value = null;
  nowMs.value = props.elapsedSec * 1000;
  best.value = readHoldBest(props.game);
}

const visible = computed<ActiveBeat[]>(() => activeBeats(plan.value, nowMs.value, resolved.value));

/**
 * ⚠️ LE SCORE NE SE RECALCULE QU'À LA SECONDE, pas à chaque image. Il ne change qu'à une
 * frappe (`taps`) ou quand une sollicitation expire — soit au plus une fois par seconde.
 * Adossé à `nowMs`, il reparcourait tout le plan 60 fois par seconde pour un chiffre
 * identique.
 *
 * ⚠️ Et il vient de `scoreHold`, jamais d'un compteur tenu à part : deux façons de
 * compter finiraient par afficher un chiffre que le record ne reconnaît pas. La série en
 * cours en fait partie — elle était recalculée ici à la main, en quadratique.
 */
const nowSec = computed(() => Math.floor(nowMs.value / 1000));
const score = computed(() => scoreHold(plan.value, taps.value, nowSec.value * 1000));

const clock = computed(() => formatClock(props.elapsedSec));

/**
 * Le retour de la dernière frappe, ÉTEINT une fois périmé.
 * ⚠️ C'est LUI qu'on passe aux scènes, jamais `pulse` brut : sans péremption, le rempart
 * restait vert en permanence et un bac du Tri allumé pour toujours.
 */
const livePulse = computed(() => activePulse(pulse.value, nowMs.value));
const lit = computed(() => livePulse.value?.side ?? null);

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
      best.value = saveHoldBest(props.game, score.value.score, best.value);
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

function tap(side: HoldSide) {
  if (!props.running) return;
  const beat = targetBeat(plan.value, nowMs.value, resolved.value);
  // Taper dans le vide ne coûte rien : on ne punit pas quelqu'un qui souffre.
  if (!beat) return;
  resolved.value = new Set(resolved.value).add(beat.id);
  taps.value = [...taps.value, { beatId: beat.id, side, at: nowMs.value }];
  pulse.value = { side, verdict: judgeTap(beat, side, nowMs.value), at: nowMs.value };
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
