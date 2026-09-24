<template>
  <transition name="ax-fade">
    <div v-if="ev" class="ax-fx" role="dialog" aria-label="Progression des champions" @click="tap">
      <div class="ax-title font-display">{{ ev.title }}</div>
      <div class="ax-list">
        <div
          v-for="(t, i) in ev.tracks"
          :key="t.id"
          class="ax-row"
          :class="{ pop: rows[i]?.pop }"
          :style="{ '--d': i * 0.08 + 's', '--rc': seg(i).rankColor }"
        >
          <div class="ax-face">
            <ChampionPortrait :champion-id="t.championId" class="ax-img">{{
              seg(i).rankEmoji
            }}</ChampionPortrait>
          </div>
          <div class="ax-main">
            <div class="ax-head">
              <span class="ax-name ellipsis">{{ t.name }}</span>
              <span class="ax-xp">+{{ t.xp }} XP</span>
            </div>
            <div class="ax-rank">
              <span class="ax-rk">{{ seg(i).rankEmoji }} {{ seg(i).rankName }}</span>
              <span class="ax-stars" :class="{ bump: rows[i]?.pop }">{{
                rankStarStr(seg(i).star)
              }}</span>
              <span class="ax-pct">{{ Math.round((rows[i]?.width ?? 0) * 100) }} %</span>
            </div>
            <div class="ax-bar">
              <div
                class="ax-fill"
                :style="{
                  width: (rows[i]?.width ?? 0) * 100 + '%',
                  transitionDuration: (rows[i]?.anim ? rows[i]!.dur : 0) + 'ms',
                }"
              />
              <div v-if="rows[i]?.pop" class="ax-flash" />
            </div>
            <div v-if="rows[i]?.pop === 'rank'" class="ax-note rank">
              {{ seg(i).rankEmoji }} Nouveau rang : {{ seg(i).rankName }} !
            </div>
            <div v-else-if="rows[i]?.pop === 'star'" class="ax-note">⭐ Une étoile de plus !</div>
            <div v-else-if="rows[i]?.done && t.ascendReady" class="ax-note asc">
              ⬆️ ★★★★★ — prêt pour l’ascension (Panthéon)
            </div>
          </div>
        </div>
      </div>
      <div class="ax-tap">{{ finished ? 'Toucher pour fermer' : 'Toucher pour passer' }}</div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ChampionPortrait from './ChampionPortrait.vue';
import { useAdvXpFx } from '@/composables/useAdvXpFx';
import { rankStarStr } from '@/lib/characterRank';

/** État affiché d'une ligne. La barre avance segment par segment (une étoile chacun). */
interface RowState {
  segIdx: number;
  width: number;
  /** Transition CSS active : coupée pour ramener la barre à zéro après une étoile. */
  anim: boolean;
  dur: number;
  pop: 'star' | 'rank' | null;
  done: boolean;
}

/** Une barre ENTIÈRE se remplit en ce temps ; un petit gain va plus vite, jamais trop. */
const FULL_MS = 1100;
const MIN_MS = 350;
/** Temps pendant lequel on voit l'avancement AVANT la mission. */
const HOLD_MS = 550;
const STAR_POP_MS = 750;
const RANK_POP_MS = 1300;

const { current, dismiss } = useAdvXpFx();
const ev = computed(() => current.value);
const rows = ref<RowState[]>([]);

const seg = (i: number) => {
  const t = ev.value!.tracks[i]!;
  const r = rows.value[i];
  return t.segments[Math.min(r?.segIdx ?? 0, t.segments.length - 1)]!;
};
const finished = computed(() => rows.value.length > 0 && rows.value.every((r) => r.done));

let timers: ReturnType<typeof setTimeout>[] = [];
const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
const clearTimers = () => {
  timers.forEach(clearTimeout);
  timers = [];
};

function finalState(): RowState[] {
  return (ev.value?.tracks ?? []).map((t) => ({
    segIdx: t.segments.length - 1,
    width: t.segments.at(-1)!.to,
    anim: false,
    dur: 0,
    pop: null,
    done: true,
  }));
}

/** Joue le segment `k` de la ligne `i`, puis enchaîne l'étoile gagnée et le suivant. */
function play(i: number, k: number) {
  const t = ev.value?.tracks[i];
  const r = rows.value[i];
  if (!t || !r) return;
  const s = t.segments[k]!;
  const dur = Math.max(MIN_MS, (s.to - s.from) * FULL_MS);
  r.segIdx = k;
  r.anim = true;
  r.dur = dur;
  r.width = s.to;
  later(() => {
    if (!s.starUp) {
      r.done = true;
      return;
    }
    // L'étoile (et le rang) NEUFS s'affichent dès l'éclat, sur la barre encore pleine.
    r.segIdx = k + 1;
    r.pop = s.rankUp ? 'rank' : 'star';
    later(
      () => {
        r.pop = null;
        // Ramenée à zéro SANS transition, puis la suite repart : sinon la barre reculerait
        // à l'écran, ce qui se lit comme une perte.
        r.anim = false;
        r.width = 0;
        later(() => play(i, k + 1), 40);
      },
      s.rankUp ? RANK_POP_MS : STAR_POP_MS,
    );
  }, dur);
}

watch(
  ev,
  (e) => {
    clearTimers();
    if (!e) {
      rows.value = [];
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      rows.value = finalState();
      return;
    }
    rows.value = e.tracks.map((t) => ({
      segIdx: 0,
      width: t.segments[0]!.from,
      anim: false,
      dur: 0,
      pop: null,
      done: false,
    }));
    e.tracks.forEach((_, i) => later(() => play(i, 0), HOLD_MS + i * 120));
  },
  { immediate: true },
);

/** Premier toucher : on saute à la fin. Second : on ferme. */
function tap() {
  if (finished.value) {
    clearTimers();
    dismiss();
    return;
  }
  clearTimers();
  rows.value = finalState();
}

onBeforeUnmount(clearTimers);
</script>

<style scoped lang="scss">
.ax-fx {
  position: fixed;
  inset: 0;
  z-index: 8850;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px 16px 64px;
  background: var(--veil); // opaque : la page ne se relit pas à travers (app.scss)
  cursor: pointer;
}
.ax-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--accent);
  letter-spacing: 1px;
}
.ax-list {
  width: min(420px, 100%);
  max-height: 64vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ax-row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  animation: ax-rise 0.35s ease-out var(--d, 0s) both;
  transition:
    border-color 0.25s,
    box-shadow 0.25s;
  &.pop {
    border-color: var(--rc);
    box-shadow: 0 0 16px color-mix(in srgb, var(--rc) 45%, transparent);
  }
}
.ax-face {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  background: var(--surface-2, #2b241b);
  border: 1.5px solid var(--rc);
}
.ax-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ax-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ax-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.ax-name {
  font-weight: 700;
  color: var(--text);
  min-width: 0;
}
.ax-xp {
  flex: none;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.ax-rank {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--dim);
}
.ax-rk {
  color: var(--rc);
  font-weight: 700;
}
.ax-stars {
  color: var(--rc);
  letter-spacing: 1px;
  &.bump {
    animation: ax-bump 0.6s cubic-bezier(0.2, 1.6, 0.4, 1);
  }
}
.ax-pct {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.ax-bar {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: var(--surface-2, #2b241b);
  overflow: hidden;
}
.ax-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--rc);
  transition-property: width;
  transition-timing-function: ease-out;
}
.ax-flash {
  position: absolute;
  inset: 0;
  background: #fff;
  animation: ax-flash 0.6s ease-out both;
}
.ax-note {
  font-size: 12px;
  font-weight: 700;
  color: var(--rc);
  animation: ax-bump 0.5s cubic-bezier(0.2, 1.6, 0.4, 1) both;
  &.rank {
    font-size: 13px;
  }
  &.asc {
    color: var(--accent);
  }
}
.ax-tap {
  position: absolute;
  bottom: 28px;
  font-size: 12px;
  color: var(--dim);
}
@keyframes ax-rise {
  from {
    transform: translateY(12px);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
@keyframes ax-bump {
  0% {
    transform: scale(0.6);
  }
  60% {
    transform: scale(1.35);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes ax-flash {
  from {
    opacity: 0.85;
  }
  to {
    opacity: 0;
  }
}
.ax-fade-enter-active {
  transition: opacity 0.25s;
}
.ax-fade-leave-active {
  transition: opacity 0.3s;
}
.ax-fade-enter-from,
.ax-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ax-row,
  .ax-stars.bump,
  .ax-note,
  .ax-flash {
    animation: none;
  }
}
</style>
