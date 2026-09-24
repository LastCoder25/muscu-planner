<template>
  <!-- Bandeaux DISCRETS : en haut, sans voile. Le conteneur laisse passer les touches
       (on continue de toucher « Réattaquer ») ; un bandeau, lui, se ferme d'un toucher. -->
  <div class="fx-toasts" aria-live="polite">
    <transition-group name="fx-toast">
      <button
        v-for="t in toasts"
        :key="t.id"
        type="button"
        class="fx-toast"
        title="Toucher pour fermer"
        :style="{ '--fx-color': t.rarity ? (RARITY_COLOR[t.rarity] ?? '#ffd23f') : '#ffd23f' }"
        @click="dismissToast(t.id)"
      >
        <span class="fx-toast-emo">{{ t.emoji }}</span>
        <span class="fx-toast-txt">
          <b>{{ t.title }}</b>
          <span v-if="t.subtitle"> · {{ t.subtitle }}</span>
        </span>
      </button>
    </transition-group>
  </div>
  <transition name="fx-fade">
    <div v-if="cur" :key="cur.id" class="fx-overlay" :class="'tier-' + tier" @click="dismiss">
      <div class="fx-flash" v-if="tier >= 3 && cur.kind !== 'rankup'" />
      <!-- ASCENSION : une scène à part entière (portrait du champion), pas la carte générique. -->
      <AscensionReveal
        v-if="cur.kind === 'rankup' && rankFx"
        :from="rankFx.from"
        :to="rankFx.to"
        :name="cur.title"
        :champion-id="cur.championId"
        :emoji="cur.emoji"
        :mana="cur.count ?? 0"
      />
      <div v-else class="fx-card" :style="{ '--fx-color': color }">
        <!-- Anneau + particules qui jaillissent (nombre/intensité selon rareté) -->
        <div class="fx-ring" />
        <span
          v-for="p in particles"
          :key="p"
          class="fx-particle"
          :style="{ '--a': (p / particles) * 360 + 'deg', '--d': (p % 3) * 0.05 + 's' }"
        />
        <!-- COFFRE : dessiné, pas un emoji — un emoji ne s'ouvre pas. Le couvercle
             pivote sur sa charnière, un faisceau sort de la caisse. -->
        <svg v-if="cur.kind === 'chest'" class="fx-chest" viewBox="0 0 100 84" aria-hidden="true">
          <path class="fx-beam" d="M30 46 L18 0 L82 0 L70 46 Z" />
          <rect class="fx-box" x="14" y="42" width="72" height="38" rx="4" />
          <rect class="fx-band" x="44" y="42" width="12" height="38" />
          <g class="fx-lid">
            <path class="fx-box" d="M14 46 A36 24 0 0 1 86 46 Z" />
            <rect class="fx-band" x="44" y="28" width="12" height="18" />
          </g>
          <rect class="fx-lock" x="46" y="54" width="8" height="9" rx="2" />
        </svg>
        <!-- TICKETS : distribués UN PAR UN en éventail, puis le total — on compte ce qu'on
             reçoit au lieu de lire un chiffre. -->
        <div v-else-if="cur.kind === 'tickets'" class="fx-tickets" aria-hidden="true">
          <div class="fx-tk-grid" :style="{ '--cols': Math.min(5, ticketCount) }">
            <span
              v-for="i in ticketCount"
              :key="i"
              class="fx-tk"
              :style="{ '--i': i - 1, '--r': (i % 2 ? -1 : 1) * 3 + 'deg' }"
              ><span class="fx-tk-star">✦</span><span class="fx-tk-stub"
            /></span>
          </div>
          <span class="fx-tk-total font-display" :style="{ '--n': ticketCount }"
            >×{{ cur.count }}</span
          >
        </div>
        <div v-else class="fx-emoji">{{ cur.emoji }}</div>
        <div class="fx-title font-display">{{ cur.title }}</div>
        <div v-if="cur.subtitle" class="fx-sub">{{ cur.subtitle }}</div>
      </div>
      <div class="fx-tap">Toucher pour continuer</div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, watch, onBeforeUnmount } from 'vue';
import { useGameFx } from '@/composables/useGameFx';
import { CHARACTER_RANKS } from '@/lib/characterRank';
import AscensionReveal, { ASCENSION_SWAP_MS } from '@/components/AscensionReveal.vue';

const { queue, toasts, dismiss, dismissToast } = useGameFx();
const cur = computed(() => queue.value[0] ?? null);

const RARITY_COLOR: Record<string, string> = {
  common: '#9a8f7e',
  rare: '#4ec6d6',
  epic: '#b07cff',
  legendary: '#ffd23f',
  divin: '#ff5cd8',
};
const RARITY_TIER: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, divin: 4 };
/** Les deux rangs d'une ascension, lus dans `CHARACTER_RANKS` (la seule table des rangs). */
const rankFx = computed(() => {
  const r = cur.value?.kind === 'rankup' ? cur.value.ranks : undefined;
  const from = r ? CHARACTER_RANKS[r.from] : undefined;
  const to = r ? CHARACTER_RANKS[r.to] : undefined;
  return from && to ? { from, to } : null;
});
/** Une ascension haute éclate plus fort : l'intensité suit le rang atteint. */
const tier = computed(() => {
  if (rankFx.value) {
    const t = cur.value!.ranks!.to;
    return t >= 7 ? 4 : t >= 4 ? 3 : 2;
  }
  return cur.value?.rarity ? (RARITY_TIER[cur.value.rarity] ?? 2) : 2;
});
const color = computed(() =>
  rankFx.value
    ? rankFx.value.to.color
    : cur.value?.rarity
      ? (RARITY_COLOR[cur.value.rarity] ?? '#ffd23f')
      : '#ffd23f',
);

const reduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Particules : plus la rareté est haute, plus il y en a (divin = explosion). 0 si
// mouvement réduit.
const particles = computed(() => (reduced ? 0 : 6 + tier.value * 6));
/** Tickets DESSINÉS : un par unité, plafonnés pour que l'éventail reste lisible sur un
 *  téléphone (le total affiché, lui, dit le vrai nombre). */
const TICKETS_DRAWN_MAX = 12;
const TICKET_DEAL_MS = 90; // écart entre deux tickets distribués
const ticketCount = computed(() =>
  Math.max(0, Math.min(TICKETS_DRAWN_MAX, Math.round(cur.value?.count ?? 0))),
);

// Auto-dismiss : plus long pour les raretés hautes (on savoure le divin).
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  cur,
  (fx) => {
    if (timer) clearTimeout(timer);
    if (!fx) return;
    // La distribution des tickets doit avoir le temps de finir avant qu'on referme.
    // …et la bascule de couleur d'une ascension, avant que l'éclat ne parte.
    const deal =
      fx.kind === 'tickets'
        ? ticketCount.value * TICKET_DEAL_MS + 900
        : fx.kind === 'rankup'
          ? ASCENSION_SWAP_MS + 2600
          : 0;
    const ms = reduced ? 1100 : 1600 + tier.value * 350 + deal;
    timer = setTimeout(dismiss, ms);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<style scoped lang="scss">
.fx-toasts {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: min(420px, calc(100vw - 24px));
  z-index: 8950;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
}
.fx-toast {
  pointer-events: auto;
  cursor: pointer;
  width: 100%;
  text-align: left;
  font: inherit;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface, #211c16) 94%, transparent);
  border: 1px solid var(--fx-color);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
  color: var(--text, #f3eee6);
  font-size: 12.5px;
  line-height: 1.3;
}
.fx-toast-emo {
  font-size: 20px;
  flex: none;
}
.fx-toast-txt {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fx-toast-txt b {
  color: var(--fx-color);
}
.fx-toast-enter-from,
.fx-toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.fx-toast-enter-active,
.fx-toast-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.fx-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: var(--veil); // opaque : la page ne se relit pas à travers (app.scss)
  cursor: pointer;
}
.fx-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, var(--fx-color, #fff), transparent 60%);
  opacity: 0;
  animation: fx-flash 0.5s ease-out;
}
@keyframes fx-flash {
  0% {
    opacity: 0.5;
  }
  100% {
    opacity: 0;
  }
}
.fx-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 40px;
}
.fx-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 120px;
  height: 120px;
  margin: -60px 0 0 -60px;
  border-radius: 50%;
  border: 3px solid var(--fx-color, #ffd23f);
  opacity: 0;
  animation: fx-ring 0.9s ease-out;
}
@keyframes fx-ring {
  0% {
    transform: scale(0.3);
    opacity: 0.9;
  }
  100% {
    transform: scale(2.4);
    opacity: 0;
  }
}
.fx-particle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 7px;
  height: 7px;
  margin: -3.5px;
  border-radius: 50%;
  background: var(--fx-color, #ffd23f);
  transform: rotate(var(--a)) translateY(0);
  animation: fx-particle 0.85s ease-out var(--d, 0s) both;
}
@keyframes fx-particle {
  0% {
    opacity: 1;
    transform: rotate(var(--a)) translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: rotate(var(--a)) translateY(-140px) scale(0.4);
  }
}
/* ── Coffre qui s’ouvre ─────────────────────────────────────────────────
   Le couvercle pivote sur sa CHARNIÈRE (transform-origin en bas), pas sur son
   centre : c’est ce détail qui fait la différence entre un couvercle et une
   forme qui tourne. Le faisceau ne sort qu’APRÈS l’ouverture. */
.fx-chest {
  width: 132px;
  height: 111px;
  display: block;
  margin: 0 auto 6px;
  overflow: visible;
}
.fx-box {
  fill: #8a7856;
  stroke: #4a3d2b;
  stroke-width: 2;
}
.fx-band {
  fill: #5a4c36;
}
.fx-lock {
  fill: var(--fx-color, #ffd23f);
}
.fx-lid {
  transform-origin: 14px 46px;
  animation: chest-open 0.75s cubic-bezier(0.3, 1.6, 0.5, 1) 0.35s both;
}
.fx-beam {
  fill: var(--fx-color, #ffd23f);
  opacity: 0;
  transform-origin: 50px 46px;
  animation: chest-beam 1.1s ease-out 0.75s both;
}
@keyframes chest-open {
  0% {
    transform: rotate(0deg);
  }
  35% {
    transform: rotate(6deg);
  }
  100% {
    transform: rotate(-104deg);
  }
}
@keyframes chest-beam {
  0% {
    opacity: 0;
    transform: scaleY(0.2);
  }
  40% {
    opacity: 0.3;
    transform: scaleY(1);
  }
  100% {
    opacity: 0.12;
    transform: scaleY(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  /* État FINAL direct : le coffre est ouvert, sans le mouvement. */
  .fx-lid {
    animation: none;
    transform: rotate(-104deg);
  }
  .fx-beam {
    animation: none;
    opacity: 0.12;
  }
}
/* ── Tickets distribués UN PAR UN ─────────────────────────────────────────
   Un vrai TICKET dessiné, pas un emoji dans une case : carton doré, encoches sur
   les côtés (masque radial), perforation qui détache la souche, étoile. Chacun
   tombe à son tour (--i × 90 ms) avec une légère inclinaison alternée (--r), puis
   un reflet le traverse. ⚠️ Cartes séparées, jamais superposées : un premier essai
   en arc (emoji serrés + halo) donnait une bande floue illisible. */
.fx-tickets {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin-bottom: 4px;
}
.fx-tk-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), 44px);
  gap: 12px 10px;
}
.fx-tk {
  position: relative;
  width: 44px;
  height: 30px;
  display: flex;
  align-items: center;
  padding-left: 8px;
  overflow: hidden;
  border-radius: 5px;
  background: linear-gradient(135deg, #fff1a8 0%, #ffd23f 42%, #e8a917 100%);
  color: #5a3d00;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.55));
  /* Encoches : un demi-disque découpé au milieu de chaque côté. */
  -webkit-mask:
    radial-gradient(circle 5px at 0 50%, transparent 97%, #000) left / 51% 100% no-repeat,
    radial-gradient(circle 5px at 100% 50%, transparent 97%, #000) right / 51% 100% no-repeat;
  mask:
    radial-gradient(circle 5px at 0 50%, transparent 97%, #000) left / 51% 100% no-repeat,
    radial-gradient(circle 5px at 100% 50%, transparent 97%, #000) right / 51% 100% no-repeat;
  transform: rotate(var(--r, 0deg));
  animation: fx-deal 0.46s cubic-bezier(0.2, 1.5, 0.4, 1) calc(var(--i) * 90ms) both;
}
.fx-tk-star {
  font-size: 15px;
  line-height: 1;
  z-index: 1;
}
/* Souche : perforation en pointillés, à droite. */
.fx-tk-stub {
  position: absolute;
  top: 5px;
  bottom: 5px;
  right: 12px;
  border-left: 2px dotted rgba(90, 61, 0, 0.55);
}
/* Reflet qui traverse le carton une fois posé. */
.fx-tk::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    transparent 30%,
    rgba(255, 255, 255, 0.75) 48%,
    transparent 64%
  );
  transform: translateX(-120%);
  animation: fx-shine 0.9s ease-out calc(var(--i) * 90ms + 0.45s) both;
}
@keyframes fx-deal {
  0% {
    opacity: 0;
    transform: translateY(-26px) rotate(calc(var(--r, 0deg) * -4)) scale(0.5);
  }
  100% {
    opacity: 1;
    transform: translateY(0) rotate(var(--r, 0deg)) scale(1);
  }
}
@keyframes fx-shine {
  to {
    transform: translateX(120%);
  }
}
.fx-tk-total {
  font-size: 34px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.5px;
  color: var(--fx-color, #ffd23f);
  text-shadow: 0 2px 10px color-mix(in srgb, var(--fx-color, #ffd23f) 45%, transparent);
  animation: fx-pop 0.45s cubic-bezier(0.2, 1.5, 0.4, 1) calc(var(--n) * 90ms + 0.1s) both;
}
.fx-emoji {
  font-size: 84px;
  line-height: 1;
  filter: drop-shadow(0 0 18px var(--fx-color, #ffd23f));
  animation: fx-pop 0.6s cubic-bezier(0.2, 1.5, 0.4, 1) both;
}
@keyframes fx-pop {
  0% {
    transform: scale(0.2) rotate(-12deg);
    opacity: 0;
  }
  100% {
    transform: scale(1) rotate(0);
    opacity: 1;
  }
}
.fx-title {
  font-size: 26px;
  font-weight: 800;
  color: var(--fx-color, #ffd23f);
  text-align: center;
  animation: fx-rise 0.5s ease-out 0.15s both;
}
.fx-sub {
  font-size: 14px;
  color: var(--text);
  text-align: center;
  animation: fx-rise 0.5s ease-out 0.25s both;
}
@keyframes fx-rise {
  0% {
    transform: translateY(10px);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}
.fx-tap {
  position: absolute;
  bottom: 40px;
  font-size: 12px;
  color: var(--dim);
  animation: fx-blink 1.4s ease-in-out infinite 0.6s;
}
@keyframes fx-blink {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.8;
  }
}
.fx-fade-enter-active {
  transition: opacity 0.2s;
}
.fx-fade-leave-active {
  transition: opacity 0.3s;
}
.fx-fade-enter-from,
.fx-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .fx-ring,
  .fx-emoji,
  .fx-title,
  .fx-sub,
  .fx-flash,
  .fx-tap {
    animation: none;
  }
  /* État FINAL direct : l'éventail en place, le total affiché. */
  .fx-tk,
  .fx-tk::after {
    animation: none;
  }
  .fx-tk-total {
    animation: none;
  }
}
</style>
