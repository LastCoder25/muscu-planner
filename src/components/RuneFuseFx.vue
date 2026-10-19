<template>
  <!-- 🔗 LA FUSION DE RUNES MISE EN SCÈNE. ⚠️ Rien n'est décidé ici : le store a DÉJÀ fusionné,
       ce composant peint ce que dit chaque `FuseGroup` (niveaux d'avant → d'après). Les
       exemplaires apparaissent en cercle, tournent en se chargeant, convergent, éclatent, et la
       compétence se révèle. Plusieurs compétences (« Tout fusionner ») passent l'une après
       l'autre. Monté À CÔTÉ de la feuille des runes, comme `RuneReveal`. -->
  <q-dialog :model-value="!!groups" maximized persistent @update:model-value="close">
    <div class="rf" :class="'p-' + phase" :style="{ '--c': color }">
      <div class="rf-glow" aria-hidden="true"></div>

      <div class="rf-top">
        <button
          type="button"
          class="rf-ico"
          :aria-label="sfx.enabled.value ? 'Couper le son' : 'Activer le son'"
          @click="sfx.setEnabled(!sfx.enabled.value)"
        >
          {{ sfx.enabled.value ? '🔊' : '🔇' }}
        </button>
        <span v-if="list.length > 1" class="rf-count font-display"
          >{{ Math.min(index + 1, list.length) }}/{{ list.length }}</span
        >
        <button v-if="phase !== 'done'" type="button" class="rf-skip" @click="skip">
          ⏩ Passer
        </button>
      </div>

      <!-- ── Une compétence qui fusionne ── -->
      <div v-if="cur && phase !== 'done'" class="rf-stage">
        <div class="rf-ring" :class="{ spin: phase === 'orbit' }">
          <span
            v-for="(st, i) in stones"
            :key="i"
            class="rf-stone"
            :class="{ in: i < shown }"
            :style="stoneStyle(i)"
          >
            <RuneIcon :tier="tier" size="44px" />
            <b class="rf-lv font-display">{{ st }}</b>
          </span>
        </div>
        <div class="rf-core" aria-hidden="true"></div>
        <div class="rf-wave" aria-hidden="true"></div>
        <span
          v-for="s in shards"
          :key="s.k"
          class="rf-shard"
          aria-hidden="true"
          :style="{ '--dx': s.dx + 'px', '--dy': s.dy + 'px', '--r': s.r + 'deg' }"
        ></span>

        <div v-if="phase === 'reveal'" class="rf-result">
          <span class="rf-emo">{{ SKILLS[cur.id].emoji }}</span>
          <span class="rf-name font-display">{{ SKILLS[cur.id].name }}</span>
          <span class="rf-after">
            <b v-for="(l, i) in cur.after" :key="i" class="rf-nv font-display">Nv {{ l }}</b>
          </span>
          <span class="rf-what">{{ skillEffectText(cur.id, cur.after[0] ?? 1) }}</span>
        </div>
        <p v-else class="rf-hint">{{ hint }}</p>
      </div>

      <!-- ── Le résumé ── -->
      <div v-else-if="phase === 'done'" class="rf-done">
        <span class="rf-done-t font-display">🔗 Fusion terminée</span>
        <div class="rf-list">
          <div
            v-for="g in list"
            :key="g.id"
            class="rf-row"
            :style="{ '--c': RUNE_COLOR[SKILLS[g.id].tier] }"
          >
            <span class="rf-row-emo">{{ SKILLS[g.id].emoji }}</span>
            <span class="rf-row-main">
              <span class="rf-row-name">{{ SKILLS[g.id].name }}</span>
              <span class="rf-row-sub">{{ fuseGroupText(g) }}</span>
            </span>
            <span class="rf-pill">⬆️ Nv {{ g.after[0] }}</span>
          </div>
        </div>
        <button type="button" class="rf-ok font-display" @click="close">Continuer</button>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import RuneIcon from '@/components/RuneIcon.vue';
import { useInvokeSfx } from '@/composables/useInvokeSfx';
import { fuseGroupText, type FuseGroup } from '@/lib/runeBank';
import { tierRank } from '@/lib/runeReveal';
import { RUNE_COLOR, SKILLS, skillEffectText } from '@/lib/skillRunes';

const props = defineProps<{ groups: FuseGroup[] | null }>();
const emit = defineEmits<{ close: [] }>();

const sfx = useInvokeSfx();

/** Au-delà, les exemplaires restants ne se dessinent pas (le cercle resterait lisible). */
const MAX_STONES = 12;

type Phase = 'gather' | 'orbit' | 'merge' | 'reveal' | 'done';
const phase = ref<Phase>('gather');
const index = ref(0);
const shown = ref(0);
const shards = ref<{ k: number; dx: number; dy: number; r: number }[]>([]);

const list = computed(() => props.groups ?? []);
const cur = computed(() => list.value[index.value] ?? null);
const tier = computed(() => (cur.value ? SKILLS[cur.value.id].tier : 'green'));
const color = computed(() => RUNE_COLOR[tier.value]);
const stones = computed(() => (cur.value?.before ?? []).slice(0, MAX_STONES));
const hint = computed(() =>
  phase.value === 'gather'
    ? 'Les runes se rassemblent…'
    : phase.value === 'orbit'
      ? 'Leur énergie se lie…'
      : 'Fusion !',
);

/** Chaque pierre sur le cercle ; à la fusion, toutes rejoignent le centre. */
function stoneStyle(i: number) {
  const a = (360 / stones.value.length) * i - 90;
  const r = phase.value === 'merge' || phase.value === 'reveal' ? 0 : 108;
  const k = phase.value === 'merge' || phase.value === 'reveal' ? 0.2 : 1;
  return { transform: `rotate(${a}deg) translate(${r}px) rotate(${-a}deg) scale(${k})` };
}

let timers: number[] = [];
function later(ms: number, fn: () => void) {
  timers.push(window.setTimeout(fn, ms));
}
function clearTimers() {
  timers.forEach((t) => window.clearTimeout(t));
  timers = [];
  sfx.humStop();
}
onBeforeUnmount(clearTimers);

const reduced = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** La scène d'une compétence : rassemblement, orbite, fusion, révélation. */
function play(i: number) {
  index.value = i;
  phase.value = 'gather';
  shown.value = 0;
  shards.value = [];
  const n = stones.value.length;
  const rank = tierRank(tier.value);
  sfx.whoosh(0.6);
  for (let k = 0; k < n; k++)
    later(120 + k * 110, () => {
      shown.value = k + 1;
      sfx.pulse(k % 8);
    });
  const orbitAt = 220 + n * 110;
  later(orbitAt, () => {
    phase.value = 'orbit';
    sfx.humStart();
    sfx.humSet(0.25);
    later(450, () => sfx.humSet(0.6));
  });
  const mergeAt = orbitAt + 1100;
  later(mergeAt, () => {
    phase.value = 'merge';
    sfx.whoosh(0.4);
  });
  later(mergeAt + 420, () => {
    sfx.humStop();
    sfx.crack();
    sfx.impact(rank);
    shards.value = Array.from({ length: 14 }, (_, k) => {
      const a = (Math.PI * 2 * k) / 14 + Math.random() * 0.3;
      const d = 90 + Math.random() * 70;
      return { k, dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: Math.random() * 360 };
    });
    phase.value = 'reveal';
    later(260, () => {
      sfx.chime(rank);
      sfx.stamp();
    });
  });
  later(mergeAt + 420 + (i + 1 < list.value.length ? 1500 : 1900), () => {
    if (i + 1 < list.value.length) play(i + 1);
    else phase.value = 'done';
  });
}

/** ⏩ Droit au résumé. C'est aussi l'état d'un `prefers-reduced-motion`. */
function skip() {
  clearTimers();
  index.value = list.value.length - 1;
  phase.value = 'done';
}

function close() {
  clearTimers();
  emit('close');
}

watch(
  () => props.groups,
  (g) => {
    clearTimers();
    if (!g?.length) return;
    if (reduced()) skip();
    else play(0);
  },
  { immediate: true },
);
</script>

<style scoped>
.rf {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: var(--text, #f3eee6);
  background: radial-gradient(
    circle at 50% 45%,
    color-mix(in srgb, var(--c) 16%, #15120e),
    #0b0907 70%
  );
  transition: background 0.6s;
}
.rf-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    circle at 50% 45%,
    color-mix(in srgb, var(--c) 45%, transparent),
    transparent 45%
  );
  opacity: 0.25;
  transition: opacity 0.4s;
}
.p-orbit .rf-glow {
  opacity: 0.55;
}
.p-reveal .rf-glow {
  opacity: 0.8;
}
.rf-top {
  position: relative;
  z-index: 3;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
}
.rf-ico,
.rf-skip {
  min-width: 44px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.35);
  color: inherit;
  font-size: 15px;
  cursor: pointer;
}
.rf-count {
  font-size: 18px;
  color: var(--dim, #9a8f7e);
}

/* ── La scène ── */
.rf-stage {
  position: relative;
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rf-ring {
  position: absolute;
  left: 50%;
  top: 42%;
  width: 0;
  height: 0;
}
.rf-ring.spin {
  animation: rf-spin 1.1s cubic-bezier(0.5, 0, 0.8, 1) forwards;
}
@keyframes rf-spin {
  to {
    transform: rotate(540deg);
  }
}
.rf-stone {
  position: absolute;
  left: -26px;
  top: -26px;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  opacity: 0;
  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--c) 70%, transparent));
  transition:
    transform 0.42s cubic-bezier(0.6, 0, 0.9, 0.4),
    opacity 0.3s;
}
.rf-stone.in {
  opacity: 1;
  animation: rf-pop 0.35s ease-out;
}
.p-merge .rf-stone,
.p-reveal .rf-stone {
  opacity: 0;
  transition:
    transform 0.42s cubic-bezier(0.6, 0, 0.9, 0.4),
    opacity 0.42s ease-in;
}
@keyframes rf-pop {
  from {
    scale: 0.2;
  }
  70% {
    scale: 1.2;
  }
}
.rf-lv {
  position: absolute;
  right: -2px;
  bottom: -2px;
  min-width: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: #15120e;
  border: 1px solid var(--c);
  font-size: 13px;
  line-height: 18px;
  text-align: center;
}
.rf-core {
  position: absolute;
  left: 50%;
  top: 42%;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff, var(--c) 45%, transparent 70%);
  opacity: 0.35;
  transform: scale(0.6);
  transition:
    transform 1.1s ease-in,
    opacity 0.4s;
}
.p-orbit .rf-core {
  opacity: 0.9;
  transform: scale(1.8);
  animation: rf-throb 0.25s ease-in-out infinite alternate;
}
.p-merge .rf-core {
  opacity: 1;
  transform: scale(2.6);
}
.p-reveal .rf-core {
  opacity: 0;
  transform: scale(5);
}
/* ⚠️ Jamais `filter` dans une boucle (cf. test `noFilterLoops`) : `scale` se compose. */
@keyframes rf-throb {
  to {
    scale: 1.15;
  }
}
.rf-wave {
  position: absolute;
  left: 50%;
  top: 42%;
  width: 60px;
  height: 60px;
  margin: -30px 0 0 -30px;
  border-radius: 50%;
  border: 3px solid var(--c);
  opacity: 0;
  pointer-events: none;
}
.p-reveal .rf-wave {
  animation: rf-wave 0.7s ease-out forwards;
}
@keyframes rf-wave {
  from {
    opacity: 1;
    transform: scale(0.3);
  }
  to {
    opacity: 0;
    transform: scale(6);
  }
}
.rf-shard {
  position: absolute;
  left: 50%;
  top: 42%;
  width: 8px;
  height: 14px;
  margin: -7px 0 0 -4px;
  clip-path: polygon(50% 0, 100% 60%, 50% 100%, 0 60%);
  background: var(--c);
  animation: rf-shard 0.75s ease-out forwards;
}
@keyframes rf-shard {
  from {
    transform: translate(0, 0) rotate(0);
    opacity: 1;
  }
  to {
    transform: translate(var(--dx), var(--dy)) rotate(var(--r));
    opacity: 0;
  }
}
.rf-hint {
  position: absolute;
  bottom: 18%;
  left: 16px;
  right: 16px;
  margin: 0;
  text-align: center;
  color: var(--dim, #9a8f7e);
  font-size: 15px;
}
.rf-result {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 42%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  animation: rf-rise 0.5s ease-out;
}
@keyframes rf-rise {
  from {
    opacity: 0;
    scale: 0.6;
  }
}
.rf-emo {
  font-size: 64px;
  line-height: 1;
  filter: drop-shadow(0 0 18px var(--c));
}
.rf-name {
  font-size: 28px;
}
.rf-after {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.rf-nv {
  padding: 2px 14px;
  border-radius: 999px;
  border: 2px solid var(--c);
  color: var(--c);
  font-size: 26px;
  animation: rf-stamp 0.35s 0.25s cubic-bezier(0.3, 1.6, 0.5, 1) backwards;
}
@keyframes rf-stamp {
  from {
    opacity: 0;
    scale: 2.4;
  }
}
.rf-what {
  color: var(--dim, #9a8f7e);
  font-size: 14px;
}

/* ── Le résumé ── */
.rf-done {
  position: relative;
  z-index: 2;
  flex: 1;
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 16px 24px;
  overflow-y: auto;
}
.rf-done-t {
  font-size: 26px;
  text-align: center;
}
.rf-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rf-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 8px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
  background: rgba(0, 0, 0, 0.35);
}
.rf-row-emo {
  font-size: 26px;
}
.rf-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.rf-row-name {
  font-weight: 700;
}
.rf-row-sub {
  font-size: 13px;
  color: var(--dim, #9a8f7e);
}
.rf-pill {
  flex: none;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #7bc86c;
  background: color-mix(in srgb, #7bc86c 16%, transparent);
}
.rf-ok {
  align-self: center;
  min-height: 48px;
  min-width: 200px;
  margin-top: auto;
  border: 0;
  border-radius: 14px;
  background: #ffd23f;
  color: #15120e;
  font-size: 20px;
  cursor: pointer;
}
@media (prefers-reduced-motion: reduce) {
  .rf * {
    animation: none !important;
    transition: none !important;
  }
}
</style>
