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
      <!-- Une rune n'éclaire qu'au BRIS de la pierre, pas à son apparition. -->
      <div
        class="fx-flash"
        v-if="tier >= 3 && cur.kind !== 'rankup'"
        :style="
          isRune
            ? { '--fx-color': color, animationDelay: '1s', animationFillMode: 'forwards' }
            : undefined
        "
      />
      <!-- ASCENSION : une scène à part entière (portrait du champion), pas la carte générique. -->
      <AscensionReveal
        v-if="cur.kind === 'rankup' && rankFx"
        :from="rankFx.from"
        :to="rankFx.to"
        :name="cur.title"
        :champion-id="cur.championId"
        :emoji="cur.emoji"
        :mana="cur.count ?? 0"
        :gear="!!cur.gear"
        :gear-model="cur.gear?.model ?? null"
        :note="cur.gear ? cur.subtitle : undefined"
      />
      <div v-else class="fx-card" :class="{ 'rune-card': isRune }" :style="{ '--fx-color': color }">
        <!-- Anneau + particules qui jaillissent (nombre/intensité selon rareté) -->
        <div v-if="!isRune" class="fx-ring" />
        <span
          v-for="p in isRune ? 0 : particles"
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
        <!-- 🏯 CITADELLE DÉCOUVERTE : la brume s'écarte en deux, la forteresse ennemie se
             dresse devant une lueur rouge, sa bannière claque. Dessinée : un emoji ne sort
             pas du brouillard. -->
        <svg
          v-else-if="cur.kind === 'citadel'"
          class="fx-cit"
          viewBox="0 0 140 100"
          aria-hidden="true"
        >
          <ellipse class="fx-cit-glow" cx="70" cy="64" rx="58" ry="34" />
          <g class="fx-cit-keep">
            <path
              class="fx-cit-wall"
              d="M28 92 V52 h6 v-5 h5 v5 h6 v-5 h5 v5 h6 V40 h5 v-6 h4 v6 h4 v-6 h4 v6 h4 v-6 h4 v6 h5 v12 h6 v-5 h5 v5 h6 v-5 h5 v5 h6 V92 Z"
            />
            <path class="fx-cit-gate" d="M62 92 V74 a8 8 0 0 1 16 0 V92 Z" />
            <rect class="fx-cit-slit" x="68.5" y="46" width="3" height="8" rx="1" />
            <rect class="fx-cit-slit" x="38" y="62" width="3" height="7" rx="1" />
            <rect class="fx-cit-slit" x="99" y="62" width="3" height="7" rx="1" />
            <line class="fx-cit-mast" x1="70" y1="34" x2="70" y2="14" />
            <path class="fx-cit-flag" d="M70 14 L88 18 L70 23 Z" />
          </g>
          <g class="fx-cit-fog left">
            <ellipse cx="30" cy="60" rx="38" ry="22" />
            <ellipse cx="48" cy="82" rx="34" ry="16" />
            <ellipse cx="40" cy="36" rx="30" ry="16" />
          </g>
          <g class="fx-cit-fog right">
            <ellipse cx="110" cy="60" rx="38" ry="22" />
            <ellipse cx="92" cy="82" rx="34" ry="16" />
            <ellipse cx="100" cy="36" rx="30" ry="16" />
          </g>
        </svg>
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
        <!-- 🧺 RÉCOLTE : chaque pièce jaillit du panier à son tour et retombe à sa place —
             les consommables en emoji, les runes en pierre dessinée (`RuneIcon`), la plus
             rare en dernier. -->
        <div v-else-if="cur.kind === 'harvest'" class="fx-harvest" aria-hidden="true">
          <div class="fx-hv-grid" :style="{ '--cols': harvestCols }">
            <span
              v-for="(p, i) in harvestPieces"
              :key="p.key"
              class="fx-hv"
              :class="{ rune: !!p.rune }"
              :style="harvestStyle(i, p.color)"
            >
              <RuneIcon v-if="p.rune" :tier="p.rune === 'multi' ? undefined : p.rune" size="40px" />
              <span v-else class="fx-hv-emo">{{ p.emoji }}</span>
              <span v-if="p.count > 1" class="fx-hv-n font-display">×{{ p.count }}</span>
            </span>
          </div>
          <span class="fx-hv-basket">🧺</span>
        </div>
        <!-- 🔮 RUNE POSÉE : la pierre tombe, se charge, se brise en éclats de sa couleur, et
             la compétence en sort. Plus la compétence est rare, plus ça éclate : rayons dès la
             violette, éclair pour la dorée (`RUNE_FX_INTENSITY`). -->
        <div v-else-if="isRune && cur.rune" class="fx-rune" aria-hidden="true">
          <span v-if="tier >= 2" class="fx-rn-rays" />
          <span class="fx-rn-glow" />
          <span class="fx-ring" />
          <span class="fx-rn-stone"><RuneIcon :tier="cur.rune" size="76px" /></span>
          <span
            v-for="p in shards"
            :key="p"
            class="fx-rn-shard"
            :style="{
              '--a': (p / shards) * 360 + (p % 2) * 11 + 'deg',
              '--r': 90 + (p % 4) * 22 + 'px',
            }"
          />
          <span class="fx-rn-skill">{{ cur.emoji }}</span>
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
import RuneIcon from '@/components/RuneIcon.vue';
import { RUNE_FX_INTENSITY } from '@/lib/runeFx';
import { RUNE_COLOR } from '@/lib/skillRunes';

const { queue, toasts, dismiss, dismissToast } = useGameFx();
const cur = computed(() => queue.value[0] ?? null);

/** 🏯 Le rouge de l'ennemi (celui de la bannière des citadelles sur la carte). */
const CITADEL_FX_COLOR = '#ff5d45';
/** Durée de la scène de citadelle avant que le titre ne se lise (brume qui s'écarte). */
const CITADEL_SCENE_MS = 1500;

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
/** 🔮 Une rune posée : sa couleur de compétence décide de la teinte et de l'intensité. */
const isRune = computed(() => cur.value?.kind === 'rune' && !!cur.value.rune);
const tier = computed(() => {
  if (isRune.value) return RUNE_FX_INTENSITY[cur.value!.rune!];
  if (rankFx.value) {
    const t = cur.value!.ranks!.to;
    return t >= 7 ? 4 : t >= 4 ? 3 : 2;
  }
  return cur.value?.rarity ? (RARITY_TIER[cur.value.rarity] ?? 2) : 2;
});
const color = computed(() =>
  isRune.value
    ? RUNE_COLOR[cur.value!.rune!]
    : rankFx.value
      ? rankFx.value.to.color
      : cur.value?.kind === 'citadel'
        ? CITADEL_FX_COLOR
        : cur.value?.rarity
          ? (RARITY_COLOR[cur.value.rarity] ?? '#ffd23f')
          : '#ffd23f',
);

const reduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Particules : plus la rareté est haute, plus il y en a (divin = explosion). 0 si
// mouvement réduit.
const particles = computed(() => (reduced ? 0 : 6 + tier.value * 6));
/** Éclats de la rune brisée : 6 pour une verte, 21 pour une dorée. */
const shards = computed(() => (reduced ? 0 : 6 + tier.value * 5));
/** Durée de la scène de rune avant que le titre ne se lise (chute + charge + bris). */
const RUNE_SCENE_MS = 1150;
/** Tickets DESSINÉS : un par unité, plafonnés pour que l'éventail reste lisible sur un
 *  téléphone (le total affiché, lui, dit le vrai nombre). */
const TICKETS_DRAWN_MAX = 12;
const TICKET_DEAL_MS = 90; // écart entre deux tickets distribués
const ticketCount = computed(() =>
  Math.max(0, Math.min(TICKETS_DRAWN_MAX, Math.round(cur.value?.count ?? 0))),
);

/** 🧺 Récolte : les pièces sortent du panier une à une (`HARVEST_DEAL_MS` d'écart). */
const HARVEST_DEAL_MS = 240;
const HARVEST_CELL = 70; // pas de la grille (case + écart), pour partir du panier
const harvestPieces = computed(() =>
  cur.value?.kind === 'harvest' ? (cur.value.pieces ?? []) : [],
);
const harvestCols = computed(() => Math.max(1, Math.min(4, harvestPieces.value.length)));
/** Chaque pièce part du panier, centré sous la grille : son décalage de départ est l'écart
 *  entre sa case et le panier. */
function harvestStyle(i: number, color: string): Record<string, string> {
  const n = harvestPieces.value.length;
  const cols = harvestCols.value;
  const rows = Math.ceil(n / cols);
  const row = Math.floor(i / cols);
  const inRow = Math.min(cols, n - row * cols);
  const col = i % cols;
  return {
    '--i': String(i),
    '--hc': color,
    '--dx': ((inRow - 1) / 2 - col) * HARVEST_CELL + 'px',
    '--dy': (rows - row) * HARVEST_CELL + 'px',
  };
}

// Auto-dismiss : plus long pour les raretés hautes (on savoure le divin).
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  cur,
  (fx) => {
    if (timer) clearTimeout(timer);
    if (!fx || fx.sticky) return;
    // La distribution des tickets doit avoir le temps de finir avant qu'on referme.
    // …et la bascule de couleur d'une ascension, avant que l'éclat ne parte.
    const deal =
      fx.kind === 'tickets'
        ? ticketCount.value * TICKET_DEAL_MS + 900
        : fx.kind === 'harvest'
          ? (fx.pieces?.length ?? 0) * HARVEST_DEAL_MS + 1400
          : fx.kind === 'rankup'
            ? ASCENSION_SWAP_MS + 2600
            : fx.kind === 'rune'
              ? RUNE_SCENE_MS + 900
              : fx.kind === 'citadel'
                ? CITADEL_SCENE_MS + 1400
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
/* ── Récolte : les pièces jaillissent du panier ───────────────────────────
   Chaque pièce part du panier (--dx, --dy), monte en arc au-dessus de sa case puis s'y
   pose, à son tour (--i × 240 ms). Son halo prend sa couleur (--hc) : une rune dorée
   brille, une ration reste sobre. Le nombre (×n) tombe après la pièce. */
.fx-harvest {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.fx-hv-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), 60px);
  justify-content: center;
  gap: 10px;
}
.fx-hv {
  position: relative;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--hc) 38%, transparent) 0%,
    transparent 70%
  );
  animation: fx-harvest-fly 0.62s cubic-bezier(0.25, 1.1, 0.45, 1) calc(var(--i) * 240ms + 0.25s)
    both;
}
.fx-hv.rune {
  filter: drop-shadow(0 0 10px var(--hc));
}
.fx-hv-emo {
  font-size: 36px;
  line-height: 1;
}
.fx-hv-n {
  position: absolute;
  right: -4px;
  bottom: -2px;
  font-size: 15px;
  font-weight: 800;
  color: var(--text, #f3eee6);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
  animation: fx-pop 0.35s cubic-bezier(0.2, 1.5, 0.4, 1) calc(var(--i) * 240ms + 0.8s) both;
}
.fx-hv-basket {
  font-size: 46px;
  line-height: 1;
  margin-top: 4px;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.6));
  animation: fx-basket 0.5s ease-out both;
}
@keyframes fx-harvest-fly {
  0% {
    opacity: 0;
    transform: translate(var(--dx), var(--dy)) scale(0.2);
  }
  15% {
    opacity: 1;
  }
  55% {
    transform: translate(calc(var(--dx) * 0.35), calc(var(--dy) * 0.3 - 34px)) scale(1.18);
  }
  100% {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
}
@keyframes fx-basket {
  0% {
    opacity: 0;
    transform: translateY(18px) scale(0.6);
  }
  60% {
    transform: translateY(-4px) scale(1.08);
  }
  100% {
    opacity: 1;
    transform: none;
  }
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
/* ── 🔮 Rune posée ────────────────────────────────────────────────────────
   0 → 0,45 s : la pierre tombe · 0,45 → 1 s : elle se charge et tremble ·
   1 s : elle éclate, la compétence en sort. Anneau et texte attendent le bris. */
.fx-rune {
  position: relative;
  width: 150px;
  height: 130px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fx-rn-stone {
  position: absolute;
  animation: rn-stone 1.05s cubic-bezier(0.3, 0.9, 0.4, 1) both;
}
@keyframes rn-stone {
  0% {
    transform: translateY(-90px) scale(0.6);
    opacity: 0;
  }
  40% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  55% {
    transform: translate(-2px, 0) rotate(-4deg) scale(1.02);
  }
  65% {
    transform: translate(2px, 0) rotate(4deg) scale(1.05);
  }
  75% {
    transform: translate(-3px, 0) rotate(-5deg) scale(1.08);
    filter: brightness(1.4) drop-shadow(0 0 10px var(--fx-color));
  }
  88% {
    transform: translate(3px, 0) rotate(5deg) scale(1.12);
    filter: brightness(1.9) drop-shadow(0 0 18px var(--fx-color));
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
    filter: brightness(3) drop-shadow(0 0 26px var(--fx-color));
    opacity: 0;
  }
}
.fx-rn-glow {
  position: absolute;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--fx-color), transparent 65%);
  opacity: 0;
  animation: rn-glow 1.6s ease-out 0.4s both;
}
@keyframes rn-glow {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }
  40% {
    opacity: 0.7;
    transform: scale(1.1);
  }
  100% {
    opacity: 0.35;
    transform: scale(1);
  }
}
.fx-rn-rays {
  position: absolute;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  background: repeating-conic-gradient(
    from 0deg,
    color-mix(in srgb, var(--fx-color) 45%, transparent) 0deg 8deg,
    transparent 8deg 24deg
  );
  mask: radial-gradient(circle, #000 20%, transparent 68%);
  opacity: 0;
  animation:
    rn-rays-in 0.5s ease-out 1s both,
    rn-spin 9s linear 1s infinite;
}
@keyframes rn-rays-in {
  to {
    opacity: 1;
  }
}
@keyframes rn-spin {
  to {
    rotate: 360deg;
  }
}
.fx-rn-shard {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 9px;
  height: 13px;
  margin: -6px -4px;
  background: var(--fx-color);
  clip-path: polygon(50% 0, 100% 40%, 60% 100%, 0 70%);
  opacity: 0;
  transform: rotate(var(--a)) translateY(0);
  animation: rn-shard 0.8s ease-out 1s both;
}
@keyframes rn-shard {
  0% {
    opacity: 1;
    transform: rotate(var(--a)) translateY(0) rotate(0);
  }
  100% {
    opacity: 0;
    transform: rotate(var(--a)) translateY(calc(-1 * var(--r))) rotate(220deg) scale(0.5);
  }
}
.fx-rn-skill {
  position: relative;
  font-size: 72px;
  line-height: 1;
  filter: drop-shadow(0 0 16px var(--fx-color));
  animation: rn-skill 0.6s cubic-bezier(0.2, 1.6, 0.4, 1) 1s both;
}
@keyframes rn-skill {
  0% {
    transform: scale(0.1) rotate(-20deg);
    opacity: 0;
  }
  100% {
    transform: scale(1) rotate(0);
    opacity: 1;
  }
}
.rune-card .fx-ring {
  animation-delay: 1s;
}
.rune-card .fx-title {
  animation-delay: 1.15s;
}
.rune-card .fx-sub {
  animation-delay: 1.25s;
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
/* 🏯 CITADELLE : la brume part de chaque côté, la forteresse monte de la lueur. */
.fx-cit {
  width: 168px;
  height: 120px;
  display: block;
  margin: 0 auto 6px;
  overflow: visible;
}
.fx-cit-glow {
  fill: var(--fx-color, #ff5d45);
  opacity: 0;
  filter: blur(8px);
  animation: cit-glow 1.6s ease-out 0.3s both;
}
.fx-cit-keep {
  transform-origin: 70px 92px;
  animation: cit-rise 1.1s cubic-bezier(0.2, 1.3, 0.4, 1) 0.45s both;
}
.fx-cit-wall {
  fill: #2a1e1a;
  stroke: #6b3a2e;
  stroke-width: 1.5;
  stroke-linejoin: round;
}
.fx-cit-gate {
  fill: #120c0a;
}
.fx-cit-slit {
  fill: var(--fx-color, #ff5d45);
  animation: cit-eye 1.4s ease-in-out 1.3s infinite alternate;
}
.fx-cit-mast {
  stroke: #6b3a2e;
  stroke-width: 1.5;
}
.fx-cit-flag {
  fill: var(--fx-color, #ff5d45);
  transform-origin: 70px 18px;
  animation: cit-flag 0.9s ease-in-out 1.2s infinite alternate;
}
.fx-cit-fog {
  fill: #9a927f;
  opacity: 0.92;
}
.fx-cit-fog.left {
  animation: cit-fog-l 1.5s ease-in 0.15s both;
}
.fx-cit-fog.right {
  animation: cit-fog-r 1.5s ease-in 0.15s both;
}
@keyframes cit-fog-l {
  to {
    transform: translateX(-70px);
    opacity: 0;
  }
}
@keyframes cit-fog-r {
  to {
    transform: translateX(70px);
    opacity: 0;
  }
}
@keyframes cit-rise {
  0% {
    transform: translateY(18px) scale(0.85);
    opacity: 0;
  }
  100% {
    transform: none;
    opacity: 1;
  }
}
@keyframes cit-glow {
  0% {
    opacity: 0;
  }
  50% {
    opacity: 0.55;
  }
  100% {
    opacity: 0.3;
  }
}
@keyframes cit-eye {
  to {
    opacity: 0.35;
  }
}
@keyframes cit-flag {
  to {
    transform: scaleX(0.8) skewY(4deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  /* État FINAL direct : la brume est partie, la citadelle debout. */
  .fx-cit-fog {
    display: none;
  }
  .fx-cit-keep,
  .fx-cit-slit,
  .fx-cit-flag {
    animation: none;
  }
  .fx-cit-glow {
    animation: none;
    opacity: 0.3;
  }
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
  /* Rune : la compétence directement, sans pierre ni éclats. */
  .fx-rn-stone {
    display: none;
  }
  .fx-rn-glow,
  .fx-rn-rays,
  .fx-rn-skill {
    animation: none;
    opacity: 1;
  }
  /* Récolte : les pièces directement à leur place. */
  .fx-hv,
  .fx-hv-n,
  .fx-hv-basket {
    animation: none;
  }
}
</style>
