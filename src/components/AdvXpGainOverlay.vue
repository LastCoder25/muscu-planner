<template>
  <transition name="ax-fade">
    <div v-if="ev" class="ax-fx" role="dialog" aria-label="Progression des champions" @click="tap">
      <div class="ax-title font-display">{{ ev.title }}</div>
      <div class="ax-list">
        <div
          v-for="(t, i) in ev.tracks"
          :key="t.id"
          class="ax-row"
          :class="{ pop: rows[bi(i)]?.pop, ready: ascendable(i) }"
          :style="{ '--d': i * 0.08 + 's', '--rc': seg(bi(i)).rankColor }"
          :role="ascendable(i) ? 'button' : undefined"
          :tabindex="ascendable(i) ? 0 : undefined"
          :aria-label="ascendable(i) ? `Ouvrir l’ascension de ${t.name}` : undefined"
          @click="rowClick($event, i)"
          @keydown.enter="rowClick($event, i)"
        >
          <div class="ax-face">
            <ChampionPortrait :champion-id="t.championId" class="ax-img">{{
              seg(bi(i)).rankEmoji
            }}</ChampionPortrait>
          </div>
          <div class="ax-main">
            <div class="ax-head">
              <span class="ax-name ellipsis">{{ t.name }}</span>
              <span class="ax-xp">+{{ t.xp }} XP</span>
            </div>
            <div class="ax-rank">
              <span class="ax-rk">{{ seg(bi(i)).rankEmoji }} {{ seg(bi(i)).rankName }}</span>
              <span class="ax-stars" :class="{ bump: rows[bi(i)]?.pop }">{{
                rankStarStr(seg(bi(i)).star)
              }}</span>
              <span class="ax-pct">{{ Math.round((rows[bi(i)]?.width ?? 0) * 100) }} %</span>
            </div>
            <div class="ax-bar">
              <div class="ax-fill" :style="fillStyle(bi(i))" />
              <div v-if="rows[bi(i)]?.pop" class="ax-flash" />
            </div>
            <div v-if="rows[bi(i)]?.pop === 'rank'" class="ax-note rank">
              {{ seg(bi(i)).rankEmoji }} Nouveau rang : {{ seg(bi(i)).rankName }} !
            </div>
            <div v-else-if="rows[bi(i)]?.pop === 'star'" class="ax-note">
              ⭐ Une étoile de plus !
            </div>
            <div v-else-if="rows[bi(i)]?.done && t.ascendReady" class="ax-note asc">
              ⬆️ ★★★★★ — prêt pour l’ascension · <b>toucher pour y aller ›</b>
            </div>
            <!-- 🗡️ SES PIÈCES PORTÉES (v0.1126, demandé) : elles apprennent avec lui, et leur
                 niveau est caché comme le sien — sans cette barre, rien ne disait qu'elles
                 avaient avancé. Même animation que la sienne, un peu décalée. -->
            <div v-if="t.gear?.length" class="ax-gear">
              <div
                v-for="(g, j) in t.gear"
                :key="g.id"
                class="ax-g"
                :class="{ pop: rows[bi(i) + 1 + j]?.pop }"
                :style="{ '--rc': seg(bi(i) + 1 + j).rankColor }"
              >
                <span class="ax-g-emo"
                  ><AdvGearArt :model="g.model ?? null">{{ g.emoji }}</AdvGearArt></span
                >
                <div class="ax-g-main">
                  <div class="ax-g-head">
                    <span class="ax-g-name ellipsis">{{ g.name }}</span>
                    <span class="ax-stars" :class="{ bump: rows[bi(i) + 1 + j]?.pop }"
                      >{{ seg(bi(i) + 1 + j).rankEmoji }}
                      {{ rankStarStr(seg(bi(i) + 1 + j).star) }}</span
                    >
                    <span class="ax-pct"
                      >{{ Math.round((rows[bi(i) + 1 + j]?.width ?? 0) * 100) }} %</span
                    >
                  </div>
                  <div class="ax-bar thin">
                    <div class="ax-fill" :style="fillStyle(bi(i) + 1 + j)" />
                    <div v-if="rows[bi(i) + 1 + j]?.pop" class="ax-flash" />
                  </div>
                  <div v-if="rows[bi(i) + 1 + j]?.pop === 'rank'" class="ax-note">
                    {{ seg(bi(i) + 1 + j).rankEmoji }} Rang {{ seg(bi(i) + 1 + j).rankName }} !
                  </div>
                  <div v-else-if="rows[bi(i) + 1 + j]?.pop === 'star'" class="ax-note">
                    ⭐ Une étoile de plus
                  </div>
                  <div v-else-if="rows[bi(i) + 1 + j]?.done && g.ascendReady" class="ax-note asc">
                    ⬆️ ★★★★★ — prête pour l’ascension
                  </div>
                </div>
              </div>
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
import AdvGearArt from './AdvGearArt.vue';
import { useAdvXpFx } from '@/composables/useAdvXpFx';
import { rankStarStr } from '@/lib/characterRank';
import type { AdvXpSegment, AdvXpTrack } from '@/lib/adventurers';
import { useRouter } from 'vue-router';
import { useChampionFocus } from '@/composables/useChampionFocus';
import { useGamePanel } from '@/composables/useGamePanel';

/** État affiché d'une barre. Elle avance segment par segment (une étoile chacun). */
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
/** Les pièces partent un peu après leur champion : on lit la sienne d'abord. */
const GEAR_LAG_MS = 250;

const { current, dismiss } = useAdvXpFx();
const ev = computed(() => current.value);

/** 🗡️ Toutes les barres à jouer, à plat : chaque champion, puis ses pièces. `base[i]` est
 *  l'index de la barre du champion `i` ; celle de sa pièce `j` est `base[i] + 1 + j`. */
const layout = computed(() => {
  const segs: AdvXpSegment[][] = [];
  const base: number[] = [];
  const delay: number[] = [];
  (ev.value?.tracks ?? []).forEach((t: AdvXpTrack, i) => {
    base.push(segs.length);
    segs.push(t.segments);
    delay.push(HOLD_MS + i * 120);
    for (const g of t.gear ?? []) {
      segs.push(g.segments);
      delay.push(HOLD_MS + i * 120 + GEAR_LAG_MS);
    }
  });
  return { segs, base, delay };
});
const bi = (i: number) => layout.value.base[i] ?? 0;

const rows = ref<RowState[]>([]);

const seg = (b: number) => {
  const s = layout.value.segs[b] ?? [];
  const r = rows.value[b];
  return s[Math.min(r?.segIdx ?? 0, s.length - 1)]!;
};
const fillStyle = (b: number) => ({
  width: (rows.value[b]?.width ?? 0) * 100 + '%',
  transitionDuration: (rows.value[b]?.anim ? rows.value[b]!.dur : 0) + 'ms',
});
const finished = computed(() => rows.value.length > 0 && rows.value.every((r) => r.done));

let timers: ReturnType<typeof setTimeout>[] = [];
const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
const clearTimers = () => {
  timers.forEach(clearTimeout);
  timers = [];
};

function finalState(): RowState[] {
  return layout.value.segs.map((s) => ({
    segIdx: s.length - 1,
    width: s.at(-1)!.to,
    anim: false,
    dur: 0,
    pop: null,
    done: true,
  }));
}

/** Joue le segment `k` de la barre `b`, puis enchaîne l'étoile gagnée et le suivant. */
function play(b: number, k: number) {
  const segs = layout.value.segs[b];
  const r = rows.value[b];
  if (!segs || !r) return;
  const s = segs[k]!;
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
        later(() => play(b, k + 1), 40);
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
    rows.value = layout.value.segs.map((s) => ({
      segIdx: 0,
      width: s[0]!.from,
      anim: false,
      dur: 0,
      pop: null,
      done: false,
    }));
    layout.value.delay.forEach((ms, b) => later(() => play(b, 0), ms));
  },
  { immediate: true },
);

const router = useRouter();
const { focus } = useChampionFocus();
const { openPath } = useGamePanel();
/** La ligne mène à l'ascension seulement une fois sa barre jouée : pendant l'animation, le
 *  premier toucher sert à la passer (la note « prêt » n'est pas encore affichée). */
const ascendable = (i: number) => !!rows.value[bi(i)]?.done && !!ev.value?.tracks[i]?.ascendReady;
/** ⬆️ Un champion bute sur son ★5 : on ferme et on ouvre SA fiche au Panthéon, là où vit le
 *  bouton d'ascension. `openPath` gère le cockpit (volet droit) comme le téléphone. */
function goAscend(advId: string) {
  clearTimers();
  focus(advId);
  dismiss();
  openPath(router, '/aventure?tab=base');
}
/** Une ligne prête intercepte le toucher ; les autres le laissent passer au fond (passer/fermer). */
function rowClick(e: Event, i: number) {
  const t = ev.value?.tracks[i];
  if (!t || !ascendable(i)) return;
  e.stopPropagation();
  goAscend(t.id);
}

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
  // ⬆️ Prêt pour l'ascension : la ligne devient un bouton, et le dit par son liseré.
  &.ready {
    border-color: var(--accent);
    box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 35%, transparent);
    &:active {
      transform: scale(0.98);
    }
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
  display: inline-block;
  transform-origin: left center;
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
  transform-origin: left center;
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
/* 🗡️ Les pièces du champion, en dessous de sa barre : plus petites, même animation. */
.ax-gear {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--line);
}
.ax-g {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  transition: box-shadow 0.25s;
  &.pop {
    box-shadow: 0 0 10px color-mix(in srgb, var(--rc) 45%, transparent);
  }
}
.ax-g-emo {
  flex: none;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--rc);
}
.ax-g-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ax-g-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--dim);
}
.ax-g-name {
  min-width: 0;
  color: var(--text);
  font-weight: 600;
}
.ax-bar.thin {
  height: 6px;
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
