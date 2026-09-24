<template>
  <!-- ⬆️ ASCENSION D'UN CHAMPION — une scène, pas un pictogramme.
       Temps 1 : le portrait, terni, dans le cadre de l'ANCIEN rang ; la lumière monte.
       Temps 2 (`--swap`) : un éclat balaie la carte, le cadre prend la couleur du NOUVEAU
       rang, le portrait se ravive, l'emblème se retourne, l'onde et les étincelles partent.
       Temps 3 : le nom, la bascule de rang, la récompense. -->
  <div
    class="asc"
    :class="{ still: reduced }"
    :style="{ '--from': from.color, '--to': to.color, '--swap': ASCENSION_SWAP_MS + 'ms' }"
  >
    <div class="asc-rays" aria-hidden="true" />
    <div class="asc-glow" aria-hidden="true" />
    <span
      v-for="s in sparks"
      :key="s.i"
      class="asc-spark"
      aria-hidden="true"
      :style="{
        '--x': s.x + '%',
        '--dl': s.delay + 's',
        '--dur': s.dur + 's',
        '--sz': s.size + 'px',
      }"
    />

    <div class="asc-kicker font-display">Ascension</div>

    <div class="asc-stage">
      <div class="asc-beam" aria-hidden="true" />
      <div class="asc-wave" aria-hidden="true" />
      <div class="asc-wave w2" aria-hidden="true" />
      <div class="asc-card">
        <div class="asc-frame" aria-hidden="true" />
        <div class="asc-pic">
          <ChampionPortrait :champion-id="championId" large class="asc-img">
            <span class="asc-fallback">{{ emoji }}</span>
          </ChampionPortrait>
          <div class="asc-shade" aria-hidden="true" />
          <div class="asc-shine" aria-hidden="true" />
        </div>
        <div class="asc-badge" aria-hidden="true">
          <span class="asc-badge-face old">{{ from.emoji }}</span>
          <span class="asc-badge-face new">{{ to.emoji }}</span>
        </div>
      </div>
    </div>

    <div class="asc-name font-display">{{ name }}</div>
    <div class="asc-ranks">
      <span class="asc-r-old" :style="{ color: from.color }">{{ from.name }}</span>
      <span class="asc-arrow">➜</span>
      <b class="asc-r-new" :style="{ color: to.color }">{{ to.name }}</b>
    </div>
    <div v-if="mana > 0" class="asc-reward">
      <span class="asc-gem">💠</span>
      <b class="font-display">+{{ mana }}</b>
      <span>pierres de mana</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import type { RankTier } from '@/lib/characterRank';

defineProps<{
  from: RankTier;
  to: RankTier;
  name: string;
  championId?: string | null;
  /** Repli quand le champion n'a pas d'illustration (aventurier d'avant les champions). */
  emoji: string;
  mana: number;
}>();

const reduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Étincelles qui montent : positions DÉTERMINISTES (un rendu ne doit pas sautiller). */
const sparks = reduced
  ? []
  : Array.from({ length: 22 }, (_, i) => ({
      i,
      x: (i * 37) % 100,
      delay: +(((i * 0.29) % 2.4) + 0.2).toFixed(2),
      dur: +(2.2 + ((i * 0.41) % 1.6)).toFixed(2),
      size: 3 + (i % 4),
    }));
</script>

<script lang="ts">
/** Instant de la bascule vers le nouveau rang — lu aussi par l'overlay pour sa durée. */
export const ASCENSION_SWAP_MS = 1100;
</script>

<style scoped lang="scss">
.asc {
  position: relative;
  width: min(360px, 92vw);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  isolation: isolate;
}

/* ── Fond : rayons lents + halo aux couleurs du NOUVEAU rang ─────────── */
.asc-rays {
  position: absolute;
  z-index: -2;
  top: 38%;
  left: 50%;
  width: 760px;
  height: 760px;
  margin: -380px 0 0 -380px;
  background: repeating-conic-gradient(
    from 0deg,
    color-mix(in srgb, var(--to) 26%, transparent) 0deg 7deg,
    transparent 7deg 22deg
  );
  mask: radial-gradient(circle, #000 0%, transparent 62%);
  opacity: 0;
  animation:
    asc-fade-in 0.8s ease-out var(--swap) both,
    asc-spin 26s linear infinite;
}
.asc-glow {
  position: absolute;
  z-index: -1;
  top: 38%;
  left: 50%;
  width: 420px;
  height: 420px;
  margin: -210px 0 0 -210px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--to) 45%, transparent),
    transparent 65%
  );
  animation: asc-glow 1.2s ease-out var(--swap) both;
}
.asc-spark {
  position: absolute;
  z-index: -1;
  bottom: 18%;
  left: var(--x);
  width: var(--sz);
  height: var(--sz);
  border-radius: 50%;
  background: var(--to);
  box-shadow: 0 0 8px var(--to);
  opacity: 0;
  animation: asc-rise var(--dur) ease-out calc(var(--swap) + var(--dl)) infinite;
}

.asc-kicker {
  font-size: 13px;
  letter-spacing: 0.42em;
  text-transform: uppercase;
  color: var(--to);
  text-shadow: 0 0 14px color-mix(in srgb, var(--to) 70%, transparent);
  animation: asc-up 0.6s ease-out 0.1s both;
}

/* ── La carte du champion ────────────────────────────────────────────── */
.asc-stage {
  position: relative;
  width: 196px;
  height: 256px;
  margin: 6px 0 18px;
}
.asc-beam {
  position: absolute;
  left: 50%;
  bottom: -30px;
  width: 150px;
  height: 420px;
  margin-left: -75px;
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--to) 55%, transparent),
    transparent 80%
  );
  filter: blur(14px);
  transform-origin: bottom;
  animation: asc-beam 1.3s ease-out calc(var(--swap) - 0.35s) both;
}
.asc-wave {
  position: absolute;
  inset: 0;
  border-radius: 26px;
  border: 3px solid var(--to);
  opacity: 0;
  animation: asc-wave 1s ease-out var(--swap) both;
}
.asc-wave.w2 {
  animation-delay: calc(var(--swap) + 0.18s);
}
.asc-card {
  position: absolute;
  inset: 0;
  animation:
    asc-enter 0.7s cubic-bezier(0.2, 1.3, 0.4, 1) both,
    asc-pulse 0.6s ease-out var(--swap);
}
.asc-frame {
  position: absolute;
  inset: -5px;
  border-radius: 26px;
  padding: 3px;
  background: linear-gradient(160deg, var(--from), color-mix(in srgb, var(--from) 40%, #15120e));
  box-shadow: 0 0 22px color-mix(in srgb, var(--from) 45%, transparent);
  animation: asc-frame 0.5s ease-out var(--swap) both;
}
.asc-pic {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 22px;
  background: #1c1813;
  display: grid;
  place-items: center;
}
.asc-img {
  width: 100%;
  height: 100%;
  border-radius: 0;
  filter: saturate(0.25) brightness(0.62);
  animation: asc-revive 0.6s ease-out var(--swap) both;
}
.asc-fallback {
  font-size: 96px;
  line-height: 1;
  filter: saturate(0.25) brightness(0.62);
  animation: asc-revive 0.6s ease-out var(--swap) both;
}
.asc-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(10, 8, 6, 0.75), transparent 45%);
}
.asc-shine {
  position: absolute;
  top: -20%;
  left: -80%;
  width: 60%;
  height: 140%;
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.75), transparent);
  transform: skewX(-18deg);
  opacity: 0;
  animation: asc-shine 0.7s ease-in-out calc(var(--swap) - 0.2s) both;
}
.asc-badge {
  position: absolute;
  left: 50%;
  bottom: -26px;
  width: 58px;
  height: 58px;
  margin-left: -29px;
  perspective: 300px;
}
.asc-badge-face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 30px;
  border-radius: 50%;
  background: #15120e;
  backface-visibility: hidden;
}
.asc-badge-face.old {
  border: 3px solid var(--from);
  animation: asc-flip-out 0.5s ease-in var(--swap) both;
}
.asc-badge-face.new {
  border: 3px solid var(--to);
  box-shadow: 0 0 18px color-mix(in srgb, var(--to) 70%, transparent);
  animation: asc-flip-in 0.5s ease-out var(--swap) both;
}

/* ── Texte ───────────────────────────────────────────────────────────── */
.asc-name {
  font-size: 30px;
  line-height: 1.1;
  text-align: center;
  color: var(--text, #f3eee6);
  animation: asc-up 0.5s ease-out calc(var(--swap) + 0.15s) both;
}
.asc-ranks {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  animation: asc-up 0.5s ease-out calc(var(--swap) + 0.3s) both;
}
.asc-r-old {
  opacity: 0.7;
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}
.asc-arrow {
  color: var(--dim, #9a8f7e);
}
.asc-r-new {
  font-size: 19px;
  text-shadow: 0 0 12px color-mix(in srgb, var(--to) 60%, transparent);
}
.asc-reward {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 8px 16px;
  border-radius: 999px;
  background: color-mix(in srgb, #6fb8ff 14%, #15120e);
  border: 1px solid color-mix(in srgb, #6fb8ff 55%, transparent);
  color: var(--text, #f3eee6);
  font-size: 14px;
  animation: asc-pop 0.5s cubic-bezier(0.3, 1.6, 0.5, 1) calc(var(--swap) + 0.55s) both;
}
.asc-reward b {
  font-size: 20px;
  color: #8fcaff;
}
.asc-gem {
  font-size: 20px;
}

/* ── Keyframes ───────────────────────────────────────────────────────── */
@keyframes asc-enter {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.85);
  }
}
@keyframes asc-pulse {
  40% {
    transform: scale(1.07);
  }
}
@keyframes asc-frame {
  to {
    background: linear-gradient(160deg, var(--to), color-mix(in srgb, var(--to) 40%, #15120e));
    box-shadow: 0 0 34px color-mix(in srgb, var(--to) 65%, transparent);
  }
}
@keyframes asc-revive {
  to {
    filter: saturate(1.1) brightness(1);
  }
}
@keyframes asc-shine {
  0% {
    left: -80%;
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    left: 130%;
    opacity: 0;
  }
}
@keyframes asc-beam {
  0% {
    opacity: 0;
    transform: scaleY(0.2);
  }
  40% {
    opacity: 1;
    transform: scaleY(1);
  }
  100% {
    opacity: 0.35;
  }
}
@keyframes asc-wave {
  0% {
    opacity: 0.9;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.6);
  }
}
@keyframes asc-flip-out {
  to {
    transform: rotateY(90deg);
    opacity: 0;
  }
}
@keyframes asc-flip-in {
  from {
    transform: rotateY(-90deg);
    opacity: 0;
  }
  to {
    transform: rotateY(0);
    opacity: 1;
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
@keyframes asc-fade-in {
  to {
    opacity: 1;
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
    opacity: 0.7;
    transform: scale(1);
  }
}
@keyframes asc-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes asc-rise {
  0% {
    opacity: 0;
    transform: translateY(0) scale(1);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-340px) scale(0.3);
  }
}

/* Mouvement réduit : l'état FINAL directement, aux couleurs du nouveau rang. */
.asc.still *,
.asc.still {
  animation: none !important;
}
.asc.still .asc-frame {
  background: linear-gradient(160deg, var(--to), color-mix(in srgb, var(--to) 40%, #15120e));
}
.asc.still .asc-img,
.asc.still .asc-fallback {
  filter: none;
}
.asc.still .asc-badge-face.old,
.asc.still .asc-shine,
.asc.still .asc-wave {
  opacity: 0;
}
.asc.still .asc-rays {
  opacity: 1;
}
</style>
