<template>
  <transition name="ax-fade">
    <div v-if="ev" class="ax-fx" role="dialog" aria-label="Progression des champions" @click="tap">
      <div class="ax-title font-display">{{ ev.title }}</div>
      <div class="ax-list">
        <div
          v-for="({ t, b, gear }, i) in layout.slots"
          :key="t.id"
          class="ax-row"
          :class="{ pop: rows[b]?.pop, ready: ascendable(i) }"
          :style="{ '--d': i * 0.08 + 's', '--rc': seg(b).rankColor }"
          :role="ascendable(i) ? 'button' : undefined"
          :tabindex="ascendable(i) ? 0 : undefined"
          :aria-label="ascendable(i) ? `Ouvrir l’ascension de ${t.name}` : undefined"
          @click="rowClick($event, i)"
          @keydown.enter="rowClick($event, i)"
        >
          <div class="ax-face">
            <ChampionPortrait :champion-id="t.championId" class="ax-img">{{
              seg(b).rankEmoji
            }}</ChampionPortrait>
          </div>
          <div class="ax-main">
            <div class="ax-head">
              <span class="ax-name ellipsis">{{ t.name }}</span>
              <span class="ax-xp">+{{ t.xp }} XP</span>
            </div>
            <div class="ax-rank">
              <span class="ax-rk">{{ seg(b).rankEmoji }} {{ seg(b).rankName }}</span>
              <span class="ax-stars" :class="{ bump: rows[b]?.pop }">{{
                rankStarStr(seg(b).star)
              }}</span>
              <span class="ax-pct">{{ Math.round((rows[b]?.width ?? 0) * 100) }} %</span>
            </div>
            <div class="ax-bar">
              <div class="ax-fill" :style="fillStyle(b)" />
              <div v-if="rows[b]?.pop" class="ax-flash" />
            </div>
            <div v-if="rows[b]?.pop === 'rank'" class="ax-note rank">
              {{ seg(b).rankEmoji }} Nouveau rang : {{ seg(b).rankName }} !
            </div>
            <div v-else-if="rows[b]?.pop === 'star'" class="ax-note">
              ⭐ Une étoile de plus !
            </div>
            <div v-else-if="rows[b]?.done && t.ascendReady" class="ax-note asc">
              ⬆️ ★★★★★ — prêt pour l’ascension
            </div>
            <!-- ⬆️ L'ASCENSION, PROPOSÉE ICI (2026-09-28, demandé : « si une place forte fait
                 atteindre le moment de l'ascension, l'afficher et proposer de l'effectuer,
                 champion et équipements »). Même règle que le Panthéon (`*AscentOffer`). -->
            <AscendOfferButton
              v-if="rows[b]?.done && t.ascendReady"
              :offer="champOffer(t.id)"
              :done="ascended.has(t.id)"
              :err="errs[t.id] ?? null"
              :busy="busy"
              @go="doChamp(t.id)"
              @more="goAscend(t.id)"
            />
            <!-- 🗡️ SES PIÈCES PORTÉES (v0.1129, demandé) : elles apprennent avec lui, et leur
                 niveau est caché comme le sien — sans cette barre, rien ne disait qu'elles
                 avaient avancé. Même animation que la sienne, un peu décalée. -->
            <div v-if="gear.length" class="ax-gear">
              <div class="ax-gear-title">🔨 Ses pièces</div>
              <div
                v-for="{ g, b: gb } in gear"
                :key="g.id"
                class="ax-g"
                :class="{ pop: rows[gb]?.pop }"
                :style="{ '--rc': seg(gb).rankColor }"
              >
                <span class="ax-g-emo"
                  ><AdvGearArt :model="g.model ?? null">{{ g.emoji }}</AdvGearArt></span
                >
                <div class="ax-g-main">
                  <div class="ax-g-head">
                    <span class="ax-g-name ellipsis">{{ g.name }}</span>
                    <span class="ax-stars" :class="{ bump: rows[gb]?.pop }"
                      >{{ seg(gb).rankEmoji }}
                      {{ rankStarStr(seg(gb).star) }}</span
                    >
                    <span class="ax-pct"
                      >{{ Math.round((rows[gb]?.width ?? 0) * 100) }} %</span
                    >
                  </div>
                  <div class="ax-bar forge">
                    <div class="ax-fill" :style="fillStyle(gb)" />
                    <div v-if="rows[gb]?.pop" class="ax-flash sparks" />
                  </div>
                  <div v-if="rows[gb]?.pop === 'rank'" class="ax-note forge">
                    {{ seg(gb).rankEmoji }} Rang {{ seg(gb).rankName }} !
                  </div>
                  <div v-else-if="rows[gb]?.pop === 'star'" class="ax-note forge">
                    🔨 Une étoile de plus
                  </div>
                  <div v-else-if="rows[gb]?.done && g.ascendReady" class="ax-note forge asc">
                    ⬆️ ★★★★★ — prête pour l’ascension
                  </div>
                  <AscendOfferButton
                    v-if="rows[gb]?.done && g.ascendReady"
                    :offer="gearOffer(g.id)"
                    :done="ascended.has(g.id)"
                    :err="errs[g.id] ?? null"
                    :busy="busy"
                    gear
                    @go="doGear(g.id)"
                    @more="goAscend(t.id)"
                  />
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
import AscendOfferButton from './AscendOfferButton.vue';
import { championAscentOffer, emptySeals, gearAscentOffer } from '@/lib/ascension';
import { useCharacterStore } from '@/stores/character';
import { useAuthStore } from '@/stores/auth';
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

/** 🗡️ Toutes les barres à jouer, à PLAT (`bars`, l'index de `rows`) : chaque champion, puis
 *  ses pièces. `slots` porte, par ligne, l'index DÉJÀ résolu de chaque barre — le template ne
 *  refait aucune arithmétique d'index. */
const layout = computed(() => {
  const bars: { segs: AdvXpSegment[]; delay: number }[] = [];
  const slots = (ev.value?.tracks ?? []).map((t: AdvXpTrack, i) => {
    const b = bars.push({ segs: t.segments, delay: HOLD_MS + i * 120 }) - 1;
    const gear = (t.gear ?? []).map((g) => ({
      g,
      b: bars.push({ segs: g.segments, delay: HOLD_MS + i * 120 + GEAR_LAG_MS }) - 1,
    }));
    return { t, b, gear };
  });
  return { bars, slots };
});

const rows = ref<RowState[]>([]);

const seg = (b: number) => {
  const s = layout.value.bars[b]?.segs ?? [];
  const r = rows.value[b];
  return s[Math.min(r?.segIdx ?? 0, s.length - 1)]!;
};
const fillStyle = (b: number) => ({
  width: (rows.value[b]?.width ?? 0) * 100 + '%',
  transitionDuration: (rows.value[b]?.anim ? rows.value[b].dur : 0) + 'ms',
});
const finished = computed(() => rows.value.length > 0 && rows.value.every((r) => r.done));

let timers: ReturnType<typeof setTimeout>[] = [];
const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
const clearTimers = () => {
  timers.forEach(clearTimeout);
  timers = [];
};

function finalState(): RowState[] {
  return layout.value.bars.map(({ segs: s }) => ({
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
  const segs = layout.value.bars[b]?.segs;
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

/** ⬆️ État des boutons d’ascension — déclaré AVANT le `watch` immédiat qui le remet à zéro
 *  (sinon zone morte temporelle au montage, le défaut de la v0.910). */
const char = useCharacterStore();
const auth = useAuthStore();
const ascended = ref(new Set<string>());
const errs = ref<Record<string, string>>({});
const busy = ref(false);

watch(
  ev,
  (e) => {
    clearTimers();
    // Une nouvelle animation repart sans les ascensions ni les refus de la précédente.
    ascended.value = new Set();
    errs.value = {};
    if (!e) {
      rows.value = [];
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      rows.value = finalState();
      return;
    }
    rows.value = layout.value.bars.map(({ segs: s }) => ({
      segIdx: 0,
      width: s[0]!.from,
      anim: false,
      dur: 0,
      pop: null,
      done: false,
    }));
    layout.value.bars.forEach(({ delay }, b) => later(() => play(b, 0), delay));
  },
  { immediate: true },
);

const router = useRouter();
const { focus } = useChampionFocus();
const { openPath } = useGamePanel();
/** La ligne mène à l'ascension seulement une fois sa barre jouée : pendant l'animation, le
 *  premier toucher sert à la passer (la note « prêt » n'est pas encore affichée). */
const ascendable = (i: number) => {
  const s = layout.value.slots[i];
  return !!s && !!rows.value[s.b]?.done && s.t.ascendReady;
};
/** ⬆️ Un champion bute sur son ★5 : on ferme et on ouvre SA fiche au Panthéon, là où vit le
 *  bouton d'ascension. `openPath` gère le cockpit (volet droit) comme le téléphone. */
function goAscend(advId: string) {
  clearTimers();
  focus(advId);
  dismiss();
  openPath(router, '/aventure?tab=base');
}
/** Une ligne prête intercepte le toucher ; les autres le laissent passer au fond (passer/fermer).
 *  Le bouton d'ascension, lui, arrête le toucher (`@click.stop`) : il agit sur place. */
function rowClick(e: Event, i: number) {
  const t = ev.value?.tracks[i];
  if (!t || !ascendable(i)) return;
  e.stopPropagation();
  goAscend(t.id);
}
/** ⬆️ Les offres d'ascension, lues sur l'état APRÈS la mission (l'overlay s'ouvre après
 *  l'écriture). ⚠️ Même règle que le Panthéon et le store (`championAscentOffer` /
 *  `gearAscentOffer`) : le bouton ne promet jamais ce que l'écriture refuserait. */
const ctxOf = () => ({ seals: char.row?.seals ?? emptySeals(), gold: char.row?.gold ?? 0 });
function champOffer(id: string) {
  const a = char.advList.find((x) => x.id === id);
  return a ? championAscentOffer(a, { ...ctxOf(), pantheonLevel: char.pantheonLevel }) : null;
}
function gearOffer(id: string) {
  const g = char.advGearStock.find((x) => x.id === id);
  return g
    ? gearAscentOffer(g, { ...ctxOf(), advs: char.advList, stock: char.advGearStock })
    : null;
}
async function run(id: string, act: (uid: string) => Promise<string | null>) {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    const err = await act(uid);
    if (err) errs.value = { ...errs.value, [id]: err };
    else ascended.value = new Set([...ascended.value, id]);
  } finally {
    busy.value = false;
  }
}
const doChamp = (id: string) => run(id, (uid) => char.ascendChampion(uid, id));
const doGear = (id: string) => run(id, (uid) => char.ascendGear(uid, id));

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
/* 🗡️ Les pièces du champion, en dessous de sa barre : même rythme d'animation, mais un
   langage de FORGE pour ne pas se confondre avec lui (demandé par l'utilisateur) — liseré
   latéral, pastille à six pans, barre carrée et hachurée, étincelles orangées. */
.ax-gear {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--line);
}
.ax-gear-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dim);
}
.ax-g {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 7px;
  border-radius: 3px;
  border-left: 3px solid var(--rc);
  background: color-mix(in srgb, var(--rc) 8%, var(--surface-2, #2b241b));
  transition: box-shadow 0.25s;
  &.pop {
    box-shadow: 0 0 10px color-mix(in srgb, #ff9d4d 55%, transparent);
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
  overflow: hidden;
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
  background: color-mix(in srgb, var(--rc) 35%, var(--surface, #211c16));
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
.ax-bar.forge {
  height: 7px;
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rc) 35%, transparent);
  .ax-fill {
    border-radius: 1px;
    background: repeating-linear-gradient(
      135deg,
      var(--rc) 0 5px,
      color-mix(in srgb, var(--rc) 55%, #000) 5px 8px
    );
  }
}
/* L'étincelle de la forge : orangée et rayée, là où le champion a un éclair blanc. */
.ax-flash.sparks {
  background: repeating-linear-gradient(90deg, #ffd23f 0 3px, #ff6a45 3px 6px);
}
.ax-note.forge {
  font-size: 11px;
  font-weight: 600;
  font-style: italic;
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
