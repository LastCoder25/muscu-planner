<template>
  <!-- 🪬 L'OUVERTURE D'UNE RUNE (spec `2026-09-30-runes-multicolores` § 8).
       ⚠️ Rien n'est tiré ici : le store a DÉJÀ ouvert et crédité, `runeReveal` dit le rythme et
       le présage, ce composant ne fait que peindre. Monté À CÔTÉ de la feuille des runes (une
       modale dans une modale hériterait de sa hauteur, cf. GachaReveal). -->
  <q-dialog :model-value="!!opened" maximized persistent @update:model-value="close">
    <div
      class="rr"
      :class="{
        'rr-lot': isLot,
        'rr-flooded': flooded,
        'rr-shaking': shaking,
        'rr-flashing': flash,
      }"
      :style="{ '--c': wallColor, '--omen': String(omen) }"
    >
      <!-- Le mur : pierre, joints, torches. -->
      <div class="rr-wall" aria-hidden="true"></div>
      <div class="rr-flood" aria-hidden="true"></div>
      <div class="rr-omen" aria-hidden="true"></div>
      <span class="rr-torch l" aria-hidden="true"></span>
      <span class="rr-torch r" aria-hidden="true"></span>

      <div class="rr-top">
        <button
          type="button"
          class="rr-ico"
          :aria-label="sfx.enabled.value ? 'Couper le son' : 'Activer le son'"
          @click="sfx.setEnabled(!sfx.enabled.value)"
        >
          {{ sfx.enabled.value ? '🔊' : '🔇' }}
        </button>
        <span class="rr-count font-display">
          <template v-if="isLot">{{ revealedCount }}/{{ cells.length }}</template>
        </span>
        <button v-if="!done" type="button" class="rr-skip" @click="skip">⏩ Passer</button>
      </div>

      <!-- ── À l'unité (ou une rare du lot, ouverte en grand) ── -->
      <div v-if="focus" class="rr-stage">
        <div class="rr-glyphs" aria-hidden="true">
          <span
            v-for="(g, i) in RUNE_GLYPHS"
            :key="i"
            class="rr-glyph"
            :class="{ lit: i < litCount }"
            :style="glyphStyle(i)"
            >{{ g }}</span
          >
        </div>
        <div class="rr-alcove" aria-hidden="true">
          <div class="rr-arch"></div>
          <div class="rr-core" :class="{ on: broken }"></div>
          <div
            class="rr-rune"
            :class="{ 'rr-dropped': dropped, 'rr-trembling': trembling, 'rr-broken': broken }"
          >
            <RuneIcon size="96px" />
          </div>
          <span
            v-for="p in shards"
            :key="p.k"
            class="rr-shard"
            :style="{
              '--dx': p.dx + 'px',
              '--dy': p.dy + 'px',
              '--r': p.r + 'deg',
              '--d': p.d + 'ms',
            }"
          ></span>
        </div>

        <div v-if="revealed" class="rr-card" :class="'t-' + focus.tier">
          <span class="rr-emo">{{ SKILLS[focus.id].emoji }}</span>
          <span class="rr-tier font-display">{{ RUNE_INFO[focus.tier].label }}</span>
          <span class="rr-name font-display"
            >{{ typed }}<span v-if="typing" class="rr-caret">▍</span></span
          >
          <span class="rr-lvl">Nv {{ focus.level }} · {{ whatOf(focus.id, focus.level) }}</span>
          <span v-if="stockOf(focus.id) > 1" class="rr-fuse"
            >🔗 {{ stockOf(focus.id) }} exemplaires au stock — fusionnables</span
          >
        </div>
        <p v-else class="rr-hint">{{ hint }}</p>

        <button
          v-if="isLot && revealed && !typing"
          type="button"
          class="rr-btn"
          @click="closeFocus"
        >
          ‹ Retour aux runes
        </button>
      </div>

      <!-- ── Le lot ×10 : dix alcôves ── -->
      <div v-else-if="isLot" class="rr-lotwrap">
        <div class="rr-grid">
          <button
            v-for="c in cells"
            :key="c.index"
            type="button"
            class="rr-cell"
            :class="[
              't-' + c.tier,
              {
                'rr-in': dropIn[c.index],
                'rr-scan': scanAt === c.index,
                'rr-hot': c.hot && !flipped[c.index] && landed,
                'rr-open': flipped[c.index],
              },
            ]"
            :style="{ '--c': RUNE_COLOR[c.tier] }"
            :disabled="!c.hot || flipped[c.index] || !landed"
            :aria-label="
              flipped[c.index] ? SKILLS[c.id].name : c.hot ? 'Ouvrir cette rune' : 'Rune'
            "
            @click="openHot(c)"
          >
            <span v-if="!flipped[c.index]" class="rr-cell-rune"><RuneIcon size="40px" /></span>
            <template v-else>
              <span class="rr-cell-emo">{{ SKILLS[c.id].emoji }}</span>
              <span class="rr-cell-name">{{ SKILLS[c.id].name }}</span>
            </template>
          </button>
        </div>
        <p v-if="!done" class="rr-hint">
          {{ hotLeft ? 'Une lueur rare… touche-la pour l’ouvrir' : 'Les runes s’ouvrent…' }}
        </p>
        <button v-if="!done && landed" type="button" class="rr-btn ghost" @click="revealAll">
          Tout révéler
        </button>
      </div>

      <!-- ── Fin ── -->
      <div v-if="done && !focus" class="rr-end">
        <div v-if="isLot" class="rr-sum">
          <span v-for="t in tierSummary" :key="t.tier" class="rr-sum-pill" :class="'t-' + t.tier"
            >{{ RUNE_INFO[t.tier].emoji }} ×{{ t.n }}</span
          >
        </div>
        <div class="rr-actions">
          <button v-if="canAgain" type="button" class="rr-btn" :disabled="busy" @click="again">
            🪬 Ouvrir encore
          </button>
          <button type="button" class="rr-btn ghost" @click="close">Au stock</button>
        </div>
      </div>
      <div v-else-if="done && focus && !isLot" class="rr-end">
        <div class="rr-actions">
          <button v-if="canAgain" type="button" class="rr-btn" :disabled="busy" @click="again">
            🪬 Ouvrir encore
          </button>
          <button type="button" class="rr-btn ghost" @click="close">Au stock</button>
        </div>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import RuneIcon from '@/components/RuneIcon.vue';
import { useInvokeSfx } from '@/composables/useInvokeSfx';
import {
  RUNE_COLOR,
  RUNE_INFO,
  RUNE_TIERS,
  SKILLS,
  skillValue,
  type RuneTier,
  type SkillId,
} from '@/lib/skillRunes';
import type { StockSkill } from '@/lib/runeBank';
import {
  RUNE_GLYPHS,
  RUNE_REVEAL,
  bestTier,
  glyphAt,
  holdMs,
  litGlyphs,
  lotCascadeStart,
  lotCells,
  runeOmen,
  tierRank,
  type LotCell,
} from '@/lib/runeReveal';

const props = defineProps<{
  opened: StockSkill[] | null;
  /** Le stock après l'ouverture (pour dire « fusionnable »). */
  stock: readonly StockSkill[];
  canAgain: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{ close: []; again: [] }>();

const sfx = useInvokeSfx();

interface Focus {
  id: SkillId;
  tier: RuneTier;
  level: number;
  cell: number | null;
}

const focus = ref<Focus | null>(null);
const litCount = ref(0);
const dropped = ref(false);
const trembling = ref(false);
const broken = ref(false);
const flooded = ref(false);
const flash = ref(false);
const shaking = ref(false);
const revealed = ref(false);
const typed = ref('');
const typing = ref(false);
const omen = ref(0);
const shards = ref<{ k: number; dx: number; dy: number; r: number; d: number }[]>([]);
const done = ref(false);
const wallTier = ref<RuneTier | 'none'>('none');

// Lot
const cells = ref<LotCell[]>([]);
const dropIn = ref<boolean[]>([]);
const flipped = ref<boolean[]>([]);
const scanAt = ref(-1);
const landed = ref(false);

const isLot = computed(() => (props.opened?.length ?? 0) > 1);
const wallColor = computed(() =>
  wallTier.value === 'none' ? '#b57bff' : RUNE_COLOR[wallTier.value],
);
const revealedCount = computed(() => flipped.value.filter(Boolean).length);
const hotLeft = computed(() => cells.value.some((c) => c.hot && !flipped.value[c.index]));
const tierSummary = computed(() =>
  [...RUNE_TIERS]
    .reverse()
    .map((t) => ({ tier: t, n: cells.value.filter((c) => c.tier === t).length }))
    .filter((x) => x.n > 0),
);
const hint = computed(() =>
  litCount.value === 0
    ? 'La rune tombe dans l’alcôve…'
    : trembling.value
      ? 'Le mur retient son souffle…'
      : 'Les glyphes s’éveillent…',
);

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

function whatOf(id: SkillId, level: number): string {
  return SKILLS[id].what.replace('{v}', String(skillValue(id, level)).replace('.', ','));
}
const stockOf = (id: SkillId): number => props.stock.filter((s) => s.id === id).length;

/** Les douze glyphes sur un arc autour de l'alcôve. */
function glyphStyle(i: number): Record<string, string> {
  const a = Math.PI * (0.92 + (i / (RUNE_GLYPHS.length - 1)) * 1.16);
  return {
    left: `${50 + Math.cos(a) * 42}%`,
    top: `${50 + Math.sin(a) * 42}%`,
  };
}

function resetFocus() {
  litCount.value = 0;
  dropped.value = false;
  trembling.value = false;
  broken.value = false;
  flooded.value = false;
  revealed.value = false;
  typed.value = '';
  typing.value = false;
  omen.value = 0;
  shards.value = [];
}

function makeShards(t: RuneTier) {
  const n = 10 + tierRank(t) * 8;
  shards.value = Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
    const d = 70 + Math.random() * (60 + tierRank(t) * 40);
    return {
      k,
      dx: Math.round(Math.cos(a) * d),
      dy: Math.round(Math.sin(a) * d),
      r: Math.round(Math.random() * 540),
      d: Math.round(500 + Math.random() * 400),
    };
  });
}

/** Une ouverture en grand : chute, glyphes, souffle retenu, éclat, révélation. */
function playFocus(f: Focus, onEnd: () => void) {
  resetFocus();
  focus.value = f;
  wallTier.value = 'none';
  const t = f.tier;
  const rank = tierRank(t);
  sfx.whoosh(0.7);
  later(30, () => (dropped.value = true));
  later(RUNE_REVEAL.dropMs, () => {
    sfx.impact(0);
    shaking.value = true;
    later(260, () => (shaking.value = false));
    omen.value = runeOmen(t);
  });
  const n = litGlyphs(t);
  for (let i = 0; i < n; i++)
    later(RUNE_REVEAL.dropMs + glyphAt(t, i), () => {
      litCount.value = i + 1;
      sfx.pulse(i);
    });
  const holdAt = RUNE_REVEAL.dropMs + glyphAt(t, n);
  later(holdAt, () => {
    trembling.value = true;
    sfx.humStart();
    sfx.humSet(0.2 + rank * 0.25);
  });
  const floodAt = holdAt + holdMs(t);
  later(floodAt, () => {
    sfx.humStop();
    sfx.crack();
    sfx.impact(rank);
    trembling.value = false;
    broken.value = true;
    makeShards(t);
    wallTier.value = t;
    flooded.value = true;
    flash.value = true;
    shaking.value = rank >= 2;
    later(360, () => {
      flash.value = false;
      shaking.value = false;
    });
  });
  const revealAt = floodAt + RUNE_REVEAL.floodMs;
  later(revealAt, () => {
    revealed.value = true;
    sfx.chime(rank);
    sfx.stamp();
    typeName(SKILLS[f.id].name, onEnd);
  });
}

function typeName(name: string, onEnd: () => void) {
  typing.value = true;
  typed.value = '';
  const chars = [...name];
  chars.forEach((_, i) =>
    later(i * RUNE_REVEAL.typeMs, () => {
      typed.value = chars.slice(0, i + 1).join('');
      if (i % 2 === 0) sfx.tick();
    }),
  );
  later(chars.length * RUNE_REVEAL.typeMs + 120, () => {
    typing.value = false;
    onEnd();
  });
}

/** L'état FINAL de la scène en grand. ⚠️ C'est aussi celui d'un `prefers-reduced-motion`. */
function finalFocus(f: Focus) {
  focus.value = f;
  dropped.value = true;
  broken.value = true;
  litCount.value = litGlyphs(f.tier);
  wallTier.value = f.tier;
  flooded.value = true;
  omen.value = 0;
  shards.value = [];
  revealed.value = true;
  typed.value = SKILLS[f.id].name;
  typing.value = false;
  trembling.value = false;
}

function startSingle(s: StockSkill) {
  const f: Focus = { id: s.id, tier: SKILLS[s.id].tier, level: s.level, cell: null };
  if (reduced()) {
    finalFocus(f);
    done.value = true;
    return;
  }
  playFocus(f, () => (done.value = true));
}

function startLot(list: StockSkill[]) {
  const ids = list.map((s) => s.id);
  cells.value = lotCells(ids);
  dropIn.value = ids.map(() => false);
  flipped.value = ids.map(() => false);
  scanAt.value = -1;
  landed.value = false;
  wallTier.value = 'none';
  if (reduced()) {
    revealAll();
    return;
  }
  sfx.whoosh(1);
  ids.forEach((_, i) =>
    later(i * RUNE_REVEAL.lotDropGapMs, () => {
      dropIn.value[i] = true;
      sfx.tick();
    }),
  );
  const scanFrom = RUNE_REVEAL.dropMs + (ids.length - 1) * RUNE_REVEAL.lotDropGapMs;
  ids.forEach((_, i) =>
    later(scanFrom + i * RUNE_REVEAL.lotScanMs, () => {
      scanAt.value = i;
      sfx.pulse(i);
    }),
  );
  const start = lotCascadeStart(ids.length);
  later(start, () => {
    scanAt.value = -1;
    landed.value = true;
    omen.value = runeOmen(bestTier(ids));
  });
  for (const c of cells.value)
    if (c.autoAt !== null)
      later(c.autoAt, () => {
        flipped.value[c.index] = true;
        sfx.chime(tierRank(c.tier));
        checkLotDone();
      });
}

function checkLotDone() {
  if (flipped.value.every(Boolean)) {
    done.value = true;
    omen.value = 0;
    wallTier.value = bestTier(cells.value.map((c) => c.id));
    flooded.value = true;
  }
}

function openHot(c: LotCell) {
  if (!c.hot || flipped.value[c.index] || focus.value) return;
  const s = props.opened?.[c.index];
  if (!s) return;
  const f: Focus = { id: s.id, tier: c.tier, level: s.level, cell: c.index };
  if (reduced()) {
    finalFocus(f);
    flipped.value[c.index] = true;
    return;
  }
  playFocus(f, () => {
    flipped.value[c.index] = true;
  });
}

function closeFocus() {
  const f = focus.value;
  focus.value = null;
  resetFocus();
  flooded.value = false;
  wallTier.value = 'none';
  if (f?.cell != null) flipped.value[f.cell] = true;
  checkLotDone();
}

function revealAll() {
  clearTimers();
  dropIn.value = cells.value.map(() => true);
  flipped.value = cells.value.map(() => true);
  scanAt.value = -1;
  landed.value = true;
  focus.value = null;
  resetFocus();
  checkLotDone();
}

function skip() {
  clearTimers();
  if (isLot.value) {
    revealAll();
    return;
  }
  const s = props.opened?.[0];
  if (!s) return;
  finalFocus({ id: s.id, tier: SKILLS[s.id].tier, level: s.level, cell: null });
  done.value = true;
}

function begin(list: StockSkill[] | null) {
  clearTimers();
  focus.value = null;
  resetFocus();
  done.value = false;
  cells.value = [];
  flooded.value = false;
  wallTier.value = 'none';
  if (!list?.length) return;
  if (list.length === 1) startSingle(list[0]!);
  else startLot(list);
}

watch(
  () => props.opened,
  (list) => begin(list),
  { immediate: true },
);

function close() {
  clearTimers();
  emit('close');
}
function again() {
  emit('again');
}
</script>

<style scoped>
.rr {
  position: relative;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #0d0b09;
  color: #f3eee6;
}
.rr.rr-shaking {
  animation: rr-shake 0.26s linear;
}
@keyframes rr-shake {
  0%,
  100% {
    transform: translate(0, 0);
  }
  20% {
    transform: translate(-5px, 2px);
  }
  40% {
    transform: translate(4px, -3px);
  }
  60% {
    transform: translate(-3px, 3px);
  }
  80% {
    transform: translate(3px, -1px);
  }
}
/* La pierre : un appareil de moellons dessiné par dégradés, jamais une image. */
.rr-wall {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 45%, rgba(0, 0, 0, 0) 20%, rgba(0, 0, 0, 0.75) 85%),
    repeating-linear-gradient(0deg, #1b1712 0 38px, #0e0c09 38px 40px),
    repeating-linear-gradient(90deg, rgba(0, 0, 0, 0) 0 78px, #0e0c09 78px 80px),
    linear-gradient(180deg, #2a2219, #16120e);
  background-blend-mode: normal, normal, multiply, normal;
}
.rr-flood {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 42%,
    color-mix(in srgb, var(--c) 55%, transparent) 0%,
    color-mix(in srgb, var(--c) 18%, transparent) 38%,
    transparent 70%
  );
  opacity: 0;
  transform: scale(0.3);
  transition:
    opacity 0.7s ease-out,
    transform 0.7s ease-out;
  pointer-events: none;
}
.rr.rr-flooded .rr-flood {
  opacity: 1;
  transform: scale(1);
}
.rr.rr-flashing::after {
  content: '';
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--c) 60%, #fff);
  animation: rr-flash 0.36s ease-out forwards;
  pointer-events: none;
}
@keyframes rr-flash {
  from {
    opacity: 0.85;
  }
  to {
    opacity: 0;
  }
}
/* 🔮 Le présage : RIEN sur une verte ou une bleue. */
.rr-omen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    circle at 50% 42%,
    color-mix(in srgb, #ffcf6b 40%, transparent),
    transparent 55%
  );
  opacity: calc(var(--omen) * 0.9);
  animation: rr-breathe 1.6s ease-in-out infinite;
  transition: opacity 0.5s;
}
@keyframes rr-breathe {
  50% {
    transform: scale(1.08);
  }
}
.rr-torch {
  position: absolute;
  top: 18%;
  width: 14px;
  height: 22px;
  border-radius: 50% 50% 40% 40%;
  background: radial-gradient(circle at 50% 70%, #fff3b0, #ffb23f 45%, #ff6a45 80%);
  box-shadow: 0 0 30px 12px rgba(255, 150, 60, 0.28);
  animation: rr-fire 0.18s steps(2) infinite alternate;
}
.rr-torch.l {
  left: 8%;
}
.rr-torch.r {
  right: 8%;
}
@keyframes rr-fire {
  to {
    transform: scale(1.1, 0.92);
    opacity: 0.85;
  }
}
.rr-top {
  position: relative;
  z-index: 3;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
}
.rr-ico,
.rr-skip {
  min-width: 44px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.35);
  color: #f3eee6;
  font-size: 15px;
  cursor: pointer;
}
.rr-count {
  font-size: 18px;
  color: #cbbfae;
}
.rr-stage {
  position: relative;
  z-index: 2;
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 0 16px 16px;
}
.rr-glyphs {
  position: absolute;
  left: 50%;
  top: 34%;
  width: min(84vw, 380px);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.rr-glyph {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: clamp(18px, 6vw, 26px);
  color: #3a3128;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.05);
  transition:
    color 0.25s,
    text-shadow 0.25s;
}
.rr-glyph.lit {
  color: #fff3d6;
  text-shadow:
    0 0 8px #ffd98a,
    0 0 18px #ffb23f;
}
.rr.rr-flooded .rr-glyph.lit {
  color: color-mix(in srgb, var(--c) 45%, #fff);
  text-shadow:
    0 0 8px var(--c),
    0 0 20px var(--c);
}
.rr-alcove {
  position: relative;
  width: 150px;
  height: 180px;
  display: grid;
  place-items: center;
}
.rr-arch {
  position: absolute;
  inset: 0;
  border-radius: 75px 75px 10px 10px;
  background: radial-gradient(ellipse at 50% 70%, #070605, #120f0c 70%);
  box-shadow:
    inset 0 10px 30px rgba(0, 0, 0, 0.9),
    0 0 0 6px #2c241a,
    0 0 0 8px #0d0b09;
}
.rr.rr-flooded .rr-arch {
  box-shadow:
    inset 0 10px 30px rgba(0, 0, 0, 0.6),
    0 0 0 6px color-mix(in srgb, var(--c) 45%, #2c241a),
    0 0 40px 6px color-mix(in srgb, var(--c) 45%, transparent);
}
/* Le cœur de l'alcôve, allumé à la couleur tirée quand la rune éclate. */
.rr-core {
  position: absolute;
  left: 50%;
  top: 56%;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  transform: translate(-50%, -50%) scale(0.2);
  background: radial-gradient(circle, #fff 0%, var(--c) 35%, transparent 70%);
  opacity: 0;
  transition:
    transform 0.6s cubic-bezier(0.2, 1.4, 0.4, 1),
    opacity 0.4s;
}
.rr-core.on {
  opacity: 0.9;
  transform: translate(-50%, -50%) scale(1);
  animation: rr-core-breathe 1.8s ease-in-out 0.6s infinite;
}
@keyframes rr-core-breathe {
  50% {
    transform: translate(-50%, -50%) scale(1.15);
  }
}
.rr-rune {
  position: relative;
  transform: translateY(-110vh) rotate(-30deg);
  filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.7));
}
.rr-rune.rr-dropped {
  animation: rr-drop 0.9s cubic-bezier(0.5, 0, 0.75, 1) forwards;
}
@keyframes rr-drop {
  0% {
    transform: translateY(-110vh) rotate(-30deg);
  }
  78% {
    transform: translateY(8px) rotate(4deg);
  }
  90% {
    transform: translateY(-10px) rotate(-2deg);
  }
  100% {
    transform: translateY(0) rotate(0);
  }
}
.rr-rune.rr-trembling {
  animation: rr-tremble 0.09s linear infinite;
  transform: translateY(0);
}
@keyframes rr-tremble {
  0% {
    transform: translate(-2px, 0) rotate(-2deg);
  }
  50% {
    transform: translate(2px, -1px) rotate(2deg);
  }
  100% {
    transform: translate(-1px, 1px) rotate(-1deg);
  }
}
.rr-rune.rr-broken {
  animation: rr-burst 0.45s ease-out forwards;
  transform: translateY(0);
}
@keyframes rr-burst {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}
.rr-shard {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 9px;
  height: 14px;
  clip-path: polygon(50% 0, 100% 60%, 40% 100%, 0 40%);
  background: color-mix(in srgb, var(--c) 70%, #fff);
  box-shadow: 0 0 8px var(--c);
  animation: rr-fly var(--d) cubic-bezier(0.15, 0.7, 0.3, 1) forwards;
}
@keyframes rr-fly {
  from {
    transform: translate(-50%, -50%) rotate(0);
    opacity: 1;
  }
  to {
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--r));
    opacity: 0;
  }
}
.rr-hint {
  position: relative;
  z-index: 2;
  margin: 0;
  min-height: 22px;
  font-size: 14px;
  color: #cbbfae;
  text-align: center;
}
.rr-card {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: min(92vw, 360px);
  padding: 16px 14px;
  border-radius: 18px;
  border: 2px solid var(--tier);
  background: color-mix(in srgb, var(--tier) 14%, rgba(15, 12, 9, 0.92));
  box-shadow: 0 0 40px color-mix(in srgb, var(--tier) 40%, transparent);
  animation: rr-card 0.45s cubic-bezier(0.2, 1.4, 0.4, 1) both;
  text-align: center;
}
@keyframes rr-card {
  from {
    transform: scale(0.6) translateY(20px);
    opacity: 0;
  }
}
.rr-emo {
  font-size: 54px;
  line-height: 1;
}
.rr-tier {
  padding: 2px 12px;
  border-radius: 999px;
  background: var(--tier);
  color: #15120e;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  animation: rr-stamp 0.35s cubic-bezier(0.2, 1.6, 0.4, 1) 0.1s both;
}
@keyframes rr-stamp {
  from {
    transform: scale(2.2) rotate(-8deg);
    opacity: 0;
  }
}
.rr-name {
  font-size: 28px;
  min-height: 34px;
  color: color-mix(in srgb, var(--tier) 35%, #fff);
}
.rr-caret {
  animation: rr-blink 0.5s steps(1) infinite;
}
@keyframes rr-blink {
  50% {
    opacity: 0;
  }
}
.rr-lvl {
  font-size: 14px;
  color: #e3d9ca;
  overflow-wrap: anywhere;
}
.rr-fuse {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--tier);
}
/* ── Lot ── */
.rr-lotwrap {
  position: relative;
  z-index: 2;
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 0 12px;
}
.rr-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  width: min(100%, 520px);
}
.rr-cell {
  position: relative;
  aspect-ratio: 3 / 4;
  min-height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px 2px;
  border-radius: 30px 30px 8px 8px;
  border: 2px solid #2c241a;
  background: radial-gradient(ellipse at 50% 70%, #070605, #15110d 75%);
  box-shadow: inset 0 6px 16px rgba(0, 0, 0, 0.9);
  color: #f3eee6;
  cursor: default;
}
.rr-cell-rune {
  transform: translateY(-110vh);
  opacity: 0;
}
.rr-cell.rr-in .rr-cell-rune {
  animation: rr-drop 0.9s cubic-bezier(0.5, 0, 0.75, 1) forwards;
  opacity: 1;
}
.rr-cell.rr-scan {
  border-color: #f3eee6;
  box-shadow:
    inset 0 6px 16px rgba(0, 0, 0, 0.9),
    0 0 14px rgba(255, 243, 214, 0.7);
}
.rr-cell.rr-hot {
  cursor: pointer;
  border-color: var(--c);
  animation: rr-hot 1.1s ease-in-out infinite;
}
@keyframes rr-hot {
  50% {
    box-shadow:
      inset 0 6px 16px rgba(0, 0, 0, 0.6),
      0 0 22px 4px var(--c);
  }
}
.rr-cell.rr-open {
  border-color: var(--c);
  background: radial-gradient(
    ellipse at 50% 40%,
    color-mix(in srgb, var(--c) 40%, #15110d),
    #120f0c 80%
  );
  animation: rr-flip 0.4s ease-out;
}
@keyframes rr-flip {
  from {
    transform: rotateY(90deg);
  }
}
.rr-cell-emo {
  font-size: 24px;
  line-height: 1;
}
.rr-cell-name {
  font-size: 10px;
  line-height: 1.1;
  text-align: center;
  overflow-wrap: anywhere;
}
.rr-end {
  position: relative;
  z-index: 3;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 0 16px calc(18px + env(safe-area-inset-bottom));
}
.rr-sum {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.rr-sum-pill {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1.5px solid var(--tier);
  background: color-mix(in srgb, var(--tier) 15%, transparent);
  font-weight: 700;
}
.rr-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
.rr-btn {
  min-height: 48px;
  padding: 0 20px;
  border-radius: 14px;
  border: 0;
  background: linear-gradient(135deg, #b57bff, #7a4bd6);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  position: relative;
  z-index: 3;
}
.rr-btn:disabled {
  opacity: 0.5;
}
.rr-btn.ghost {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.t-green {
  --tier: #7bc86c;
}
.t-blue {
  --tier: #5aa9ff;
}
.t-violet {
  --tier: #b98cff;
}
.t-gold {
  --tier: #ffb23f;
}
@media (prefers-reduced-motion: reduce) {
  .rr *,
  .rr {
    animation: none !important;
    transition: none !important;
  }
  .rr-rune,
  .rr-cell-rune {
    transform: none;
    opacity: 1;
  }
  .rr-rune.rr-broken {
    opacity: 0;
  }
}
</style>
