<template>
  <!-- ⬆️ ASCENSION D'UN CHAMPION — l'AVANT/APRÈS se lit sur une carte qui se retourne.
       Recto : le portrait dans le cadre de l'ANCIEN rang, ★★★★★ (condition pour monter).
       Verso : le cadre du NOUVEAU rang, ★☆☆☆☆, portrait ravivé, éclat qui balaie.
       ⚠️ Les faces se permutent par OPACITÉ à mi-rotation, pas par `backface-visibility` :
       mesuré au banc, Chrome montrait le recto EN MIROIR à la fin du retournement. -->
  <div
    class="asc"
    :class="{ still: reduced }"
    :style="{
      '--from': from.color,
      '--to': to.color,
      '--swap': FLIP_AT_MS + 'ms',
      '--turn': TURN_MS + 'ms',
      '--swapEnd': ASCENSION_SWAP_MS + 'ms',
    }"
  >
    <div class="asc-rays" aria-hidden="true" />
    <div class="asc-glow" aria-hidden="true" />
    <span
      v-for="s in sparks"
      :key="s.i"
      class="asc-spark"
      aria-hidden="true"
      :style="{ '--x': s.x + '%', '--dl': s.delay + 's', '--dur': s.dur + 's' }"
    />

    <div class="asc-kicker font-display">Ascension</div>

    <div class="asc-flip">
      <div class="asc-wave" aria-hidden="true" />
      <div class="asc-wave w2" aria-hidden="true" />
      <div class="asc-card">
        <div v-for="f in faces" :key="f.key" class="asc-face" :class="f.key">
          <div class="asc-frame" aria-hidden="true" />
          <div class="asc-pic">
            <ChampionPortrait :champion-id="championId" large class="asc-img">
              <span class="asc-fallback">{{ emoji }}</span>
            </ChampionPortrait>
          </div>
          <div v-if="f.key === 'new'" class="asc-shine-wrap" aria-hidden="true">
            <div class="asc-shine" />
          </div>
          <div class="asc-ribbon font-display">{{ f.rank.name }}</div>
          <div class="asc-stars" aria-hidden="true">
            {{ '★'.repeat(f.stars) }}<i>{{ '★'.repeat(STARS_PER_RANK - f.stars) }}</i>
          </div>
          <div class="asc-badge" aria-hidden="true">{{ f.rank.emoji }}</div>
        </div>
      </div>
    </div>

    <div class="asc-name font-display">{{ name }}</div>
    <div class="asc-ranks">
      <s :style="{ color: from.color }">{{ from.name }} {{ '★'.repeat(STARS_PER_RANK) }}</s>
      <span class="asc-arrow">➜</span>
      <b :style="{ color: to.color }">{{ to.name }} ★</b>
    </div>
    <div v-if="mana > 0" class="asc-reward">
      <span class="asc-gem">💠</span>
      <b class="font-display">+{{ mana }}</b>
      <span>pierres de mana</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { STARS_PER_RANK, type RankTier } from '@/lib/characterRank';

const props = defineProps<{
  from: RankTier;
  to: RankTier;
  name: string;
  championId?: string | null;
  /** Repli quand le champion n'a pas d'illustration (aventurier d'avant les champions). */
  emoji: string;
  mana: number;
}>();

/** Recto au maximum de l'ancien rang (c'est la condition d'ascension), verso au ★1. */
const faces = computed(() => [
  { key: 'old', rank: props.from, stars: STARS_PER_RANK },
  { key: 'new', rank: props.to, stars: 1 },
]);

const reduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Étincelles qui montent : positions DÉTERMINISTES (un rendu ne doit pas sautiller). */
const sparks = reduced
  ? []
  : Array.from({ length: 20 }, (_, i) => ({
      i,
      x: (i * 37) % 100,
      delay: +((i * 0.29) % 2.4).toFixed(2),
      dur: +(2.2 + ((i * 0.41) % 1.6)).toFixed(2),
    }));
</script>

<script lang="ts">
/** Début du retournement, et sa durée. */
const FLIP_AT_MS = 1300;
const TURN_MS = 900;
/** Instant où le VERSO apparaît (mi-rotation) — lu aussi par l'overlay pour sa durée. */
export const ASCENSION_SWAP_MS = FLIP_AT_MS + TURN_MS / 2;
</script>

<style scoped lang="scss">
.asc {
  position: relative;
  width: min(360px, 92vw);
  display: flex;
  flex-direction: column;
  align-items: center;
  isolation: isolate;
}

/* ── Fond : rayons lents + halo aux couleurs du NOUVEAU rang ─────────── */
.asc-rays {
  position: absolute;
  z-index: -2;
  top: 190px;
  left: 50%;
  width: 820px;
  height: 820px;
  margin: -410px 0 0 -410px;
  background: repeating-conic-gradient(
    from 0deg,
    color-mix(in srgb, var(--to) 24%, transparent) 0deg 7deg,
    transparent 7deg 22deg
  );
  mask: radial-gradient(circle, #000, transparent 60%);
  opacity: 0;
  animation:
    asc-fade 0.9s ease-out var(--swapEnd) both,
    asc-spin 28s linear infinite;
}
.asc-glow {
  position: absolute;
  z-index: -1;
  top: 190px;
  left: 50%;
  width: 460px;
  height: 460px;
  margin: -230px 0 0 -230px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--to) 42%, transparent),
    transparent 65%
  );
  opacity: 0;
  animation: asc-glow 1.3s ease-out var(--swapEnd) both;
}
.asc-spark {
  position: absolute;
  z-index: -1;
  top: 420px;
  left: var(--x);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--to);
  box-shadow: 0 0 8px var(--to);
  opacity: 0;
  animation: asc-rise var(--dur) ease-out calc(var(--swapEnd) + var(--dl)) infinite;
}
.asc-kicker {
  font-size: 13px;
  letter-spacing: 0.42em;
  text-transform: uppercase;
  color: var(--to);
  text-shadow: 0 0 14px var(--to);
  margin-bottom: 26px;
  animation: asc-up 0.6s ease-out 0.1s both;
}

/* ── La carte qui se retourne ────────────────────────────────────────── */
.asc-flip {
  position: relative;
  width: 206px;
  height: 280px;
  perspective: 1100px;
}
.asc-card {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  animation:
    asc-enter 0.7s cubic-bezier(0.2, 1.3, 0.4, 1) both,
    asc-turn var(--turn) cubic-bezier(0.6, -0.05, 0.25, 1.15) var(--swap) both;
}
.asc-face {
  position: absolute;
  inset: 0;
  border-radius: 24px;
}
.asc-face.old {
  --c: var(--from);
  --gl: 14px;
  animation: asc-out var(--turn) linear var(--swap) both;
}
.asc-face.new {
  --c: var(--to);
  --gl: 40px;
  transform: rotateY(180deg);
  animation: asc-in var(--turn) linear var(--swap) both;
}
.asc-frame {
  position: absolute;
  inset: -6px;
  border-radius: 28px;
  /* Cadre MÉTALLIQUE : reflets clairs et creux sombres de la couleur du rang. */
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--c) 55%, #fff) 0%,
    var(--c) 22%,
    color-mix(in srgb, var(--c) 45%, #000) 50%,
    var(--c) 72%,
    color-mix(in srgb, var(--c) 60%, #fff) 100%
  );
  box-shadow: 0 0 var(--gl) color-mix(in srgb, var(--c) 60%, transparent);
}
.asc-pic {
  position: absolute;
  inset: 0;
  border-radius: 22px;
  overflow: hidden;
  background: #1c1813;
  display: grid;
  place-items: center;
}
.asc-pic::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(10, 8, 6, 0.85), transparent 42%);
}
.asc-img {
  width: 100%;
  height: 100%;
  border-radius: 0;
}
.asc-fallback {
  font-size: 96px;
  line-height: 1;
}
.asc-face.old .asc-img,
.asc-face.old .asc-fallback {
  filter: saturate(0.55) brightness(0.8);
}
.asc-shine-wrap {
  position: absolute;
  inset: 0;
  border-radius: 22px;
  overflow: hidden;
  pointer-events: none;
}
.asc-shine {
  position: absolute;
  top: -20%;
  left: -90%;
  width: 55%;
  height: 140%;
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.7), transparent);
  transform: skewX(-18deg);
  opacity: 0;
  animation: asc-shine 0.8s ease-in-out calc(var(--swapEnd) + 0.15s) both;
}
.asc-ribbon {
  position: absolute;
  top: -15px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 16px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  color: #15120e;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--c) 60%, #fff),
    var(--c) 45%,
    color-mix(in srgb, var(--c) 70%, #000)
  );
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}
.asc-stars {
  position: absolute;
  bottom: 38px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 17px;
  letter-spacing: 2px;
  color: var(--c);
  text-shadow: 0 1px 4px #000;
}
.asc-stars i {
  font-style: normal;
  color: rgba(255, 255, 255, 0.28);
}
.asc-badge {
  position: absolute;
  bottom: -26px;
  left: 50%;
  margin-left: -28px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 28px;
  background: #15120e;
  border: 3px solid var(--c);
  box-shadow: 0 0 16px color-mix(in srgb, var(--c) 60%, transparent);
}
.asc-wave {
  position: absolute;
  inset: -6px;
  border-radius: 28px;
  border: 3px solid var(--to);
  opacity: 0;
  animation: asc-wave 1s ease-out var(--swapEnd) both;
}
.asc-wave.w2 {
  animation-delay: calc(var(--swapEnd) + 0.18s);
}

/* ── Texte ───────────────────────────────────────────────────────────── */
.asc-name {
  margin-top: 46px;
  font-size: 31px;
  line-height: 1.1;
  text-align: center;
  color: var(--text, #f3eee6);
  animation: asc-up 0.5s ease-out calc(var(--swapEnd) + 0.1s) both;
}
.asc-ranks {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 4px 10px;
  margin-top: 6px;
  font-size: 16px;
  animation: asc-up 0.5s ease-out calc(var(--swapEnd) + 0.25s) both;
}
.asc-ranks s {
  opacity: 0.7;
}
.asc-arrow {
  color: var(--dim, #9a8f7e);
}
.asc-ranks b {
  font-size: 19px;
  text-shadow: 0 0 12px currentColor;
}
.asc-reward {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 8px 16px;
  border-radius: 999px;
  background: color-mix(in srgb, #6fb8ff 14%, #15120e);
  border: 1px solid color-mix(in srgb, #6fb8ff 55%, transparent);
  color: var(--text, #f3eee6);
  font-size: 14px;
  animation: asc-pop 0.5s cubic-bezier(0.3, 1.6, 0.5, 1) calc(var(--swapEnd) + 0.45s) both;
}
.asc-reward b {
  font-size: 20px;
  color: #8fcaff;
}
.asc-gem {
  font-size: 18px;
}

/* ── Keyframes ───────────────────────────────────────────────────────── */
@keyframes asc-enter {
  from {
    opacity: 0;
    transform: translateY(26px) scale(0.85);
  }
}
@keyframes asc-turn {
  0% {
    transform: rotateY(0) scale(1);
  }
  45% {
    transform: rotateY(90deg) scale(1.1);
  }
  100% {
    transform: rotateY(180deg) scale(1);
  }
}
@keyframes asc-out {
  0%,
  49.9% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}
@keyframes asc-in {
  0%,
  49.9% {
    opacity: 0;
  }
  50%,
  100% {
    opacity: 1;
  }
}
@keyframes asc-shine {
  0% {
    left: -90%;
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    left: 135%;
    opacity: 0;
  }
}
@keyframes asc-wave {
  0% {
    opacity: 0;
  }
  1% {
    opacity: 0.9;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.55);
  }
}
@keyframes asc-glow {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.75;
    transform: scale(1);
  }
}
@keyframes asc-fade {
  to {
    opacity: 1;
  }
}
@keyframes asc-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes asc-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
@keyframes asc-pop {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
}
@keyframes asc-rise {
  0% {
    opacity: 0;
    transform: translateY(0);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-330px) scale(0.3);
  }
}

/* Mouvement réduit : l'état FINAL directement — le verso, aux couleurs du nouveau rang. */
.asc.still,
.asc.still * {
  animation: none !important;
}
.asc.still .asc-card {
  transform: rotateY(180deg);
}
.asc.still .asc-face.old,
.asc.still .asc-wave,
.asc.still .asc-shine {
  opacity: 0;
}
.asc.still .asc-rays,
.asc.still .asc-glow {
  opacity: 1;
}
</style>
