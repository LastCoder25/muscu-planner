<template>
  <!-- 🎰 L'INVOCATION, EN PLEIN ÉCRAN (v0.960, demandé : « un écran plus flashy, plus
       centré dessus… le frisson du tirage au sort »).
       ⚠️ ELLE NE DÉCIDE RIEN : le champion est déjà tiré par le store (avec son pity
       persisté), la roulette ne fait que le mettre en scène — la règle de `siegeStage` et
       d'`arenaStage`. Une roulette qui tirerait elle-même ferait diverger ce qu'on voit de
       ce qu'on possède. -->
  <q-dialog :model-value="!!plan" maximized persistent @update:model-value="onClose">
    <div class="gx" :class="[phase, rarClass]" :style="{ '--rar-c': rarColor }">
      <div class="gx-sky" aria-hidden="true"></div>

      <!-- ⚠️ « Passer » dès la première seconde : une roulette de 3,4 s se subit au
           dixième tirage. On coupe l'animation, jamais l'écran de résultat — c'est LUI le
           moment du jeu (même règle que le plateau de l'arène). -->
      <button v-if="phase === 'spin'" type="button" class="gx-skip" @click="skip">⏩ Passer</button>

      <div class="gx-title font-display">
        {{ phase === 'spin' ? 'Invocation…' : verdictTitle }}
      </div>

      <!-- LA ROULETTE — une bande qui défile sous un repère fixe. -->
      <div v-if="phase === 'spin'" class="gx-wheel">
        <div class="gx-halo" :style="haloStyle" aria-hidden="true"></div>
        <div class="gx-mark" aria-hidden="true">
          <span class="gx-caret up">▼</span>
          <span class="gx-caret dn">▲</span>
        </div>
        <div class="gx-strip" :style="stripStyle">
          <div
            v-for="(c, i) in plan?.strip ?? []"
            :key="i"
            class="gx-cell"
            :style="{ '--c': RANK_COLOR[c.rarity] }"
          >
            <span class="gx-emo">
              <ChampionPortrait :champion-id="c.id" :size="48">{{ c.emoji }}</ChampionPortrait>
            </span>
          </div>
        </div>
      </div>

      <!-- LA RÉVÉLATION -->
      <div v-else-if="champ" class="gx-reveal">
        <div class="gx-burst" aria-hidden="true">
          <i v-for="i in sparks" :key="i" :style="sparkStyle(i)"></i>
        </div>
        <div class="gx-portrait">
          <span class="gx-pemo">
            <ChampionPortrait :champion-id="champ.id" :size="76" :alt="champ.name">{{
              champ.emoji
            }}</ChampionPortrait>
          </span>
        </div>
        <div class="gx-name font-display">{{ champ.name }}</div>
        <div class="gx-rar font-display">{{ RARITY_LABEL[champ.rarity] }}</div>
        <div class="gx-meta">{{ meta }}</div>
        <div v-if="verdictSub" class="gx-verdict">{{ verdictSub }}</div>

        <!-- 🎰 LE RESTE DU LOT (v0.968) : la roulette porte le MEILLEUR, la grille dit
             les neuf autres d'un coup d'œil. Dix roulettes d'affilée, c'est trente
             secondes pour un seul geste — le genre concentre la tension puis récapitule. -->
        <div v-if="lotRows.length > 1" class="gx-lot">
          <div class="gx-lot-t">Ton lot de {{ lotRows.length }}</div>
          <div class="gx-lot-grid">
            <div
              v-for="(it, i) in lotRows"
              :key="i"
              class="gx-lot-c"
              :style="{ '--c': RANK_COLOR[it.champion.rarity] }"
              :title="`${it.champion.name} · ${RARITY_LABEL[it.champion.rarity]}`"
            >
              <span class="gl-emo">
                <ChampionPortrait :champion-id="it.champion.id" :size="26">{{
                  it.champion.emoji
                }}</ChampionPortrait>
              </span>
              <span class="gl-name">{{ it.champion.name }}</span>
              <!-- Ce qui DISTINGUE une ligne : neuf ou déjà là (donc un cran d'Éveil,
                   ou du mana rendu quand il n'y a plus rien à réveiller). -->
              <span v-if="!it.duplicate" class="gl-tag neuf">NEUF</span>
              <span v-else-if="it.manaBack > 0" class="gl-tag">+{{ it.manaBack }} 💠</span>
              <span v-else class="gl-tag">✨ {{ awakenLevel(it.copies) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="gx-acts">
        <q-btn
          v-if="phase === 'done'"
          flat
          no-caps
          class="gx-again"
          :disable="!canAgain || busy"
          @click="emit('again')"
        >
          🎰 Invoquer encore
          <small>{{ pullCost }} 💠</small>
        </q-btn>
        <q-btn v-if="phase === 'done'" flat no-caps class="gx-close" @click="onClose(false)">
          Fermer
        </q-btn>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RANK_COLOR, RARITY_LABEL, RARITY_RANK } from '@/lib/items';
import { ADV_ROLE_LABEL, ADV_SIGNATURE_LABEL, AWAKEN } from '@/lib/adventurers';
import { GACHA } from '@/lib/gacha';
import { lotOrder, type RevealPlan, type LotItem } from '@/lib/gachaReveal';
import { awakenLevel } from '@/lib/adventurers';
import ChampionPortrait from '@/components/ChampionPortrait.vue';

const props = defineProps<{
  plan: RevealPlan | null;
  /** Ce que le tirage a donné — pour le dire APRÈS la roulette, jamais pendant. */
  verdict: { duplicate: boolean; copies: number; manaBack: number; awaken: number } | null;
  canAgain: boolean;
  busy: boolean;
  /** Le lot COMPLET quand le tirage était un ×10 — la roulette, elle, ne porte que
   *  son meilleur. Absent pour un tirage à l'unité. */
  lot?: LotItem[] | null;
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'again'): void }>();

const pullCost = GACHA.pullCost;
/** Le lot, du plus rare au plus commun — la règle vit en lib. */
const lotRows = computed(() => lotOrder(props.lot ?? []));
const phase = ref<'spin' | 'done'>('spin');
const rolling = ref(false);
let timer: number | undefined;

/** ⚠️ Le champion révélé est la case `stopIndex` — **pas la dernière** : la bande continue
 *  après lui pour qu'on ne voie pas la fin arriver (v0.962). On ne le reçoit pas deux fois. */
const champ = computed(() => props.plan?.strip[props.plan.stopIndex] ?? null);
const rarColor = computed(() => (champ.value ? RANK_COLOR[champ.value.rarity] : '#9A8F7E'));
const rarClass = computed(() => (champ.value ? `r-${champ.value.rarity}` : ''));
/** ⚠️ Ce qui DISTINGUE un champion : son rôle de convoi et ses signatures de combat —
 *  pas sa forme brute. C'est la leçon de la feuille de promotion (v0.752). */
const meta = computed(() => {
  const c = champ.value;
  if (!c) return '';
  const l = [
    ...(c.role ? [ADV_ROLE_LABEL[c.role]] : []),
    ...c.skills.map((s) => ADV_SIGNATURE_LABEL[s]).filter(Boolean),
  ];
  return l.length ? l.join(' · ') : 'combattant pur';
});

/** Des étincelles, d'autant plus nombreuses que la rareté est haute — le langage de
 *  `GameFxOverlay`, repris ici pour que la révélation ressemble au reste du jeu. */
const sparks = computed(() => {
  const i = champ.value ? (RARITY_RANK[champ.value.rarity] ?? 0) : 0;
  return 6 + i * 4;
});
function sparkStyle(i: number) {
  const a = (i / sparks.value) * Math.PI * 2;
  return {
    '--dx': `${Math.cos(a) * 46}%`,
    '--dy': `${Math.sin(a) * 46}%`,
    '--d': `${(i % 5) * 60}ms`,
  };
}

const verdictTitle = computed(() => {
  const v = props.verdict;
  if (!v) return 'Invocation';
  if (!v.duplicate) return '✨ Nouveau champion !';
  return v.manaBack > 0 ? '💠 Éveil au maximum' : '✨ Éveil !';
});
const verdictSub = computed(() => {
  const v = props.verdict;
  if (!v) return '';
  if (!v.duplicate) return 'Il rejoint ton Panthéon — utilisable tout de suite.';
  return v.manaBack > 0
    ? `Il n’a plus rien à révéler : ${v.manaBack} 💠 te sont rendus.`
    : `Éveil ${v.awaken}/${AWAKEN.max} — il gagne en puissance.`;
});

/** La bande glisse jusqu'à amener sa DERNIÈRE case sous le repère. ⚠️ La translation est
 *  posée UNE image après le montage, sinon la transition n'a pas d'état de départ et la
 *  roulette saute directement à la fin. */
/** Largeur d'une case + ses marges — en DUR ici ET dans la feuille de style : une seule
 *  valeur pilote les deux (`--cell`), sinon la bande s'arrêterait à côté du repère. */
const CELL = 96;
const stripStyle = computed(() => {
  const ms = props.plan?.spinMs ?? 0;
  const i = rolling.value ? (props.plan?.stopIndex ?? 0) : 0;
  return {
    transform: `translate3d(${-(CELL / 2 + i * CELL)}px, 0, 0)`,
    transition: rolling.value ? `transform ${ms}ms cubic-bezier(0.1, 0.72, 0.16, 1)` : 'none',
  };
});
/** ⚠️ L'aura est pilotée par `glowFrom`, pas par un stop de keyframe écrit en dur : c'est
 *  la lib qui décide QUAND la rareté se devine, et l'écran ne fait que l'appliquer. */
const haloStyle = computed(() => {
  const ms = props.plan?.spinMs ?? 0;
  const from = props.plan?.glowFrom ?? 0.66;
  return {
    animationDelay: `${Math.round(ms * from)}ms`,
    animationDuration: `${Math.round(ms * (1 - from))}ms`,
  };
});

function skip() {
  window.clearTimeout(timer);
  phase.value = 'done';
}
function onClose(v?: boolean) {
  if (v === true) return;
  emit('close');
}

watch(
  () => props.plan,
  (p) => {
    window.clearTimeout(timer);
    rolling.value = false;
    if (!p) return;
    // ⚠️ `prefers-reduced-motion` → l'état FINAL directement, pas une animation courte.
    if (!p.spinMs) {
      phase.value = 'done';
      return;
    }
    phase.value = 'spin';
    requestAnimationFrame(() => requestAnimationFrame(() => (rolling.value = true)));
    timer = window.setTimeout(() => (phase.value = 'done'), p.spinMs + 120);
  },
  { immediate: true },
);
onBeforeUnmount(() => window.clearTimeout(timer));
</script>

<style scoped lang="scss">
.gx {
  position: relative;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  background: radial-gradient(120% 80% at 50% 38%, #241d15 0%, var(--bg) 62%);
  overflow: hidden;
  text-align: center;
}
/* Un ciel qui respire — assez discret pour ne pas concurrencer la roulette. */
.gx-sky {
  position: absolute;
  inset: -20%;
  background: radial-gradient(
    40% 30% at 50% 40%,
    color-mix(in srgb, var(--rar-c) 22%, transparent),
    transparent 70%
  );
  opacity: 0;
  animation: gx-breathe 2.4s ease-in-out infinite;
}
.gx.done .gx-sky {
  opacity: 1;
}
@keyframes gx-breathe {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(1);
  }
  50% {
    opacity: 0.85;
    transform: scale(1.06);
  }
}
.gx-skip {
  position: absolute;
  top: 14px;
  right: 14px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 12px;
  cursor: pointer;
  z-index: 3;
}
.gx-title {
  position: relative;
  font-size: 20px;
  letter-spacing: 0.04em;
  color: var(--text);
}
.gx.done .gx-title {
  color: var(--rar-c);
  text-shadow: 0 0 18px color-mix(in srgb, var(--rar-c) 45%, transparent);
}

/* ── LA ROULETTE ─────────────────────────────────────────────────────────── */
.gx-wheel {
  position: relative;
  width: 100%;
  max-width: 420px;
  height: 112px;
  overflow: hidden;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent);
}
/* L'aura ne se colore QUE sur la fin (`glowFrom`) : trop tôt, on saurait dès le début. */
.gx-halo {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    28% 100% at 50% 50%,
    color-mix(in srgb, var(--rar-c) 55%, transparent),
    transparent 70%
  );
  opacity: 0;
  animation-name: gx-glow;
  animation-timing-function: ease-in;
  animation-fill-mode: forwards;
}
@keyframes gx-glow {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.gx-mark {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.gx-caret {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  color: var(--accent);
  font-size: 13px;
  line-height: 1;
}
.gx-caret.up {
  top: 2px;
}
.gx-caret.dn {
  bottom: 2px;
}
.gx-strip {
  position: absolute;
  left: 50%;
  top: 0;
  display: flex;
  height: 100%;
  align-items: center;
  will-change: transform;
}
.gx-cell {
  flex: 0 0 92px;
  height: 92px;
  display: grid;
  place-items: center;
  margin: 0 2px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--c) 12%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--c) 50%, transparent);
}
.gx-emo {
  font-size: 40px;
  line-height: 1;
}

/* ── LA RÉVÉLATION ───────────────────────────────────────────────────────── */
.gx-reveal {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  animation: gx-pop 420ms cubic-bezier(0.2, 1.5, 0.4, 1) both;
}
@keyframes gx-pop {
  from {
    transform: scale(0.72);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
/* ⚠️ `flex: none` — sans lui la colonne le RÉTRÉCIT (mesuré au banc : 95 px au lieu de
   132), et la révélation perd exactement ce qui doit frapper. */
.gx-portrait {
  position: relative;
  flex: none;
  width: 132px;
  height: 132px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--rar-c) 26%, var(--surface)),
    var(--surface)
  );
  border: 2px solid var(--rar-c);
  box-shadow: 0 0 34px color-mix(in srgb, var(--rar-c) 45%, transparent);
}
/* Des rayons qui tournent derrière le portrait — c'est eux qui font le « flashy »
   demandé, et ils ne coûtent qu'un dégradé conique. */
.gx-portrait::before {
  content: '';
  position: absolute;
  inset: -26px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    color-mix(in srgb, var(--rar-c) 55%, transparent) 0deg 8deg,
    transparent 12deg 36deg
  );
  opacity: 0.75;
  animation: gx-rays 9s linear infinite;
  z-index: -1;
}
@keyframes gx-rays {
  to {
    transform: rotate(360deg);
  }
}
.gx-pemo {
  font-size: 64px;
  line-height: 1;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.6));
}
.gx-name {
  margin-top: 4px;
  font-size: 26px;
  letter-spacing: 0.02em;
  color: var(--text);
  text-shadow: 0 0 22px color-mix(in srgb, var(--rar-c) 40%, transparent);
}
.gx-rar {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--rar-c);
  border: 1px solid color-mix(in srgb, var(--rar-c) 55%, transparent);
  background: color-mix(in srgb, var(--rar-c) 16%, transparent);
  border-radius: 999px;
  padding: 3px 12px;
}
.gx-meta {
  font-size: 12.5px;
  color: var(--dim);
  max-width: 300px;
}
.gx-verdict {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text);
  max-width: 320px;
  line-height: 1.35;
}
/* Les étincelles : leur NOMBRE suit la rareté — le langage de `GameFxOverlay`. */
.gx-burst {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.gx-burst i {
  position: absolute;
  top: 46px;
  left: 50%;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--rar-c);
  animation: gx-spark 900ms ease-out var(--d) both;
}
@keyframes gx-spark {
  from {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
  to {
    transform: translate(var(--dx), var(--dy)) scale(0.2);
    opacity: 0;
  }
}

/* 🎰 LA GRILLE DU LOT — une RÉCAPITULATION : sous la révélation, plus petite qu'elle,
   jamais en concurrence avec le champion qu'on vient de voir tomber. */
.gx-lot {
  /* ⚠️ LARGEUR ADOSSÉE AU VIEWPORT, pas au parent : toute la chaîne au-dessus est en
     flex CENTRÉ (`.gx` puis `.gx-reveal`), donc un `width: 100%` mesure le CONTENU — la
     grille se rabattait à DEUX colonnes même à 600 px, soit cinq rangées, une
     récapitulation plus haute que la révélation qu elle accompagne. L écran est plein
     écran (`maximized`), le viewport est donc la bonne référence. */
  width: min(420px, calc(100vw - 32px));
  margin: 14px auto 0;
}
.gx-lot-t {
  margin-bottom: 6px;
  color: var(--dim);
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.gx-lot-grid {
  display: grid;
  /* 80 px : trois colonnes tiennent dès 344 px — dix cellules sur deux colonnes font
     cinq rangées, et la récapitulation devenait plus haute que la révélation. */
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 6px;
}
.gx-lot-c {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  padding: 6px 4px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  background: color-mix(in srgb, var(--c) 10%, var(--bg));
}
.gl-emo {
  font-size: 22px;
  line-height: 1;
}
.gl-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--text);
}
.gl-tag {
  font-size: 9.5px;
  letter-spacing: 0.05em;
  color: var(--dim);
}
.gl-tag.neuf {
  color: var(--c);
  font-weight: 700;
}
.gx-acts {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 320px;
  margin-top: 6px;
}
.gx-again {
  min-height: 48px;
  border-radius: 12px;
  background: var(--accent);
  color: #15120e;
  font-weight: 700;
  small {
    margin-left: 8px;
    opacity: 0.75;
  }
}
.gx-close {
  min-height: 44px;
  color: var(--dim);
}

@media (prefers-reduced-motion: reduce) {
  .gx-sky,
  .gx-halo,
  .gx-portrait::before,
  .gx-reveal,
  .gx-burst i {
    animation: none;
  }
  .gx-strip {
    transition: none !important;
  }
}
</style>
