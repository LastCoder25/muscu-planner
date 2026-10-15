<template>
  <!-- Scène du boss entre amis : le boss en haut, le groupe en ligne dessous. Chaque frappe
       fait bondir son auteur, part vers le boss et retire des PV à l'impact. Rien n'est décidé
       ici : les dégâts viennent du serveur, la scène ne fait que les montrer. -->
  <div ref="root" class="fbs" :class="{ quake }">
    <div class="fbs-boss-zone">
      <div ref="bossEl" class="fbs-boss" :class="{ shake, dying, dead: fallen && !dying }">
        <span class="fbs-aura" aria-hidden="true" />
        <img
          v-if="art"
          :src="art"
          alt=""
          class="fbs-boss-art"
          draggable="false"
          @error="artFailed = art"
        />
        <span v-else class="fbs-boss-emo" aria-hidden="true">{{ bossEmoji }}</span>
        <span
          v-if="flash"
          :key="flash"
          class="fbs-flash"
          :class="'fx-' + flashStyle"
          aria-hidden="true"
        />
        <span class="fbs-family" :title="familyName">{{ familyEmoji }}</span>
        <!-- MORT : éclats qui jaillissent du boss pendant qu'il s'effondre. -->
        <template v-if="dying">
          <span
            v-for="i in SHARDS"
            :key="i"
            class="fbs-shard"
            aria-hidden="true"
            :style="{ '--a': (i / SHARDS) * 360 + 'deg' }"
          />
        </template>
      </div>
      <span v-if="dying" class="fbs-ko font-display" role="status">VAINCU !</span>
      <div class="fbs-name font-display">{{ bossName }}</div>
      <div
        class="fbs-hp"
        role="img"
        :aria-label="`${fmtBossPv(shownHp)} PV sur ${fmtBossPv(hpTotal)}`"
      >
        <span class="fbs-ghost" :style="{ width: ghostPct + '%' }" />
        <span class="fbs-fill" :style="{ width: hpPct + '%' }" />
      </div>
      <div class="fbs-hp-l">
        <span class="font-display">{{ fmtBossPv(shownHp) }}</span> / {{ fmtBossPv(hpTotal) }} PV
      </div>
      <span
        v-for="p in pops"
        :key="p.key"
        class="fbs-pop font-display"
        :class="'pop-' + p.size"
        :style="{ '--px': p.dx + 'px' }"
        >{{ p.text }}</span
      >
      <!-- Le cri de la frappe : il naît au premier projectile et s'éteint un peu après le dernier. -->
      <span v-if="cry" :key="cry.key" class="fbs-cry font-display" role="status">{{
        cry.text
      }}</span>
    </div>

    <div class="fbs-party">
      <div
        v-for="a in allies"
        :key="a.userId"
        :ref="(el) => setAllyEl(a.userId, el)"
        class="fbs-ally"
        :class="{ me: a.me, striking: strikerId === a.userId }"
      >
        <div class="fbs-ally-av">
          <AventureAvatar
            :profile="a.look?.profile ?? 'polyvalent'"
            :equipped="a.look ? lookEquipped(a.look) : {}"
          />
        </div>
        <div class="fbs-ally-n">{{ a.me ? 'Toi' : a.pseudo }}</div>
        <div class="fbs-ally-u">{{ a.units }}</div>
      </div>
    </div>

    <span
      v-for="p in projs"
      :key="p.key"
      class="fbs-proj"
      :class="p.style"
      aria-hidden="true"
      :style="{
        left: p.x + 'px',
        top: p.y + 'px',
        '--dx': p.dx + 'px',
        '--dy': p.dy + 'px',
        '--ang': p.ang + 'deg',
      }"
    />

    <!-- ⚡ Tempête : la foudre tombe du haut de la scène sur le boss. -->
    <svg
      v-for="b in bolts"
      :key="b.key"
      class="fbs-bolt"
      aria-hidden="true"
      :style="{ left: b.x - 30 + 'px', height: b.h + 'px' }"
      :viewBox="`0 0 60 ${b.h}`"
      preserveAspectRatio="none"
    >
      <polyline :points="b.points" class="fbs-bolt-glow" />
      <polyline :points="b.points" class="fbs-bolt-core" />
    </svg>

    <!-- 🔆 Laser : un rayon continu de l'auteur au boss, tant que la frappe dure. -->
    <span
      v-if="beam"
      :key="beam.key"
      class="fbs-beam"
      :class="{ end: beam.end }"
      aria-hidden="true"
      :style="{
        left: beam.x + 'px',
        top: beam.y + 'px',
        width: beam.len + 'px',
        '--ang': beam.ang + 'deg',
      }"
    />

    <!-- ☄️ Météore : la scène s'assombrit, il tombe du ciel, l'onde de choc balaie tout. -->
    <span v-if="dim" class="fbs-dim" aria-hidden="true" />
    <span
      v-if="meteor"
      :key="meteor.key"
      class="fbs-meteor"
      aria-hidden="true"
      :style="{
        left: meteor.x + 'px',
        top: meteor.y + 'px',
        '--dx': meteor.dx + 'px',
        '--dy': meteor.dy + 'px',
        '--ang': meteor.ang + 'deg',
      }"
    />
    <span
      v-for="w in waves"
      :key="w.key"
      class="fbs-wave"
      :class="w.style"
      aria-hidden="true"
      :style="{ left: w.x + 'px', top: w.y + 'px' }"
    />

    <!-- Le nom de l'attaque, à partir des boules de feu. -->
    <span
      v-if="banner"
      :key="banner.key"
      class="fbs-banner font-display"
      :class="banner.style"
      role="status"
      >{{ banner.text }}</span
    >

    <!-- Une frappe de 30 reps dure 15 s : on peut toujours passer au résultat. -->
    <button v-if="animating" class="fbs-skip" @click="skip">⏩ Passer</button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import AventureAvatar from '@/components/AventureAvatar.vue';
import {
  BOSS_CRY_MEMORY,
  bossCry,
  fmtBossPv,
  strikePlan,
  type BossFamily,
  type BossStrike,
  type StrikeStyle,
} from '@/lib/friendBoss';
import { lookEquipped, type HeroLook } from '@/lib/heroLook';

export interface StageAlly {
  userId: string;
  pseudo: string;
  look: HeroLook | null;
  units: number;
  me: boolean;
}

const props = defineProps<{
  bossName: string;
  bossEmoji: string;
  /** Illustration de la silhouette (`friendBossArt`) — `null` : on garde l'emoji. */
  bossArt?: string | null;
  familyEmoji: string;
  familyName: string;
  /** Famille d'exo : un boss de gainage compte ses frappes en secondes (`strikeReps`). */
  family?: BossFamily | null;
  hpTotal: number;
  /** PV restants selon le serveur. */
  hpLeft: number;
  /** Une frappe est en cours d'envoi : la barre attend l'animation au lieu de sauter. */
  hold?: boolean;
  allies: StageAlly[];
}>();

const root = ref<HTMLElement | null>(null);
const bossEl = ref<HTMLElement | null>(null);
const allyEls = new Map<string, HTMLElement>();
function setAllyEl(id: string, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) allyEls.set(id, el);
  else allyEls.delete(id);
}

/** Un fichier qui ne charge pas retombe sur l'emoji, jamais sur une image cassée. */
const artFailed = ref<string | null>(null);
const art = computed(() =>
  props.bossArt && props.bossArt !== artFailed.value ? props.bossArt : null,
);

const shownHp = ref(props.hpLeft);
const ghostHp = ref(props.hpLeft);
const animating = ref(false);
watch(
  () => props.hpLeft,
  (v) => {
    if (animating.value || props.hold) return;
    shownHp.value = v;
    ghostHp.value = v;
  },
);
// La barre « fantôme » suit avec retard : on voit la part arrachée par le coup.
let ghostTimer: ReturnType<typeof setTimeout> | null = null;
watch(shownHp, (v) => {
  if (ghostTimer) clearTimeout(ghostTimer);
  ghostTimer = setTimeout(() => (ghostHp.value = v), 450);
});

const pct = (v: number) => Math.max(0, Math.min(100, (v / Math.max(1, props.hpTotal)) * 100));
const hpPct = computed(() => pct(shownHp.value));
const ghostPct = computed(() => pct(Math.max(ghostHp.value, shownHp.value)));

const strikerId = ref<string | null>(null);
/** Le boss s'effondre (`die`) : secousse, éclats, chute, puis « VAINCU ». */
const dying = ref(false);
/** À terre : seulement APRÈS l'animation de mort (ou un boss déjà mort à l'ouverture). Lier
 *  l'état aux PV le faisait noircir dès le dernier impact, AVANT de briller puis de tomber. */
const fallen = ref(props.hpLeft <= 0);
const SHARDS = 10;
/** Durée de la mort, alignée sur l'animation CSS `fbs-die` (+ la bannière). */
const DEATH_MS = 2200;
const shake = ref(false);
const flash = ref(0);
const projs = ref<
  { key: number; x: number; y: number; dx: number; dy: number; ang: number; style: StrikeStyle }[]
>([]);
type PopSize = 'sm' | 'md' | 'xl';
const pops = ref<{ key: number; text: string; size: PopSize; dx: number }[]>([]);
/** Couleur du flash d'impact : celle de l'attaque. */
const flashStyle = ref<StrikeStyle>('orb');
/** Secousse de TOUTE la scène (laser qui éclate, météore). */
const quake = ref(false);
const bolts = ref<{ key: number; x: number; h: number; points: string }[]>([]);
const beam = ref<{
  key: number;
  x: number;
  y: number;
  len: number;
  ang: number;
  end: boolean;
} | null>(null);
const dim = ref(false);
const meteor = ref<{
  key: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  ang: number;
} | null>(null);
const waves = ref<{ key: number; x: number; y: number; style: StrikeStyle }[]>([]);
const banner = ref<{ key: number; text: string; style: StrikeStyle } | null>(null);
const cry = ref<{ key: number; text: string } | null>(null);
/** Temps pendant lequel le cri reste affiché après l'impact du dernier projectile. */
const CRY_LINGER_MS = 700;
let cryTimer: ReturnType<typeof setTimeout> | null = null;
/** Les derniers cris affichés : une série de reps ne répète pas ceux des précédentes. */
let recentCries: string[] = [];
function clearCry() {
  if (cryTimer) clearTimeout(cryTimer);
  cryTimer = null;
  cry.value = null;
}
let seq = 0;
let alive = true;
/** « Passer » : la boucle s'arrête au prochain pas et la barre retombe sur le serveur. */
let skipped = false;
/** Numéro du rejeu en cours : un impact d'un rejeu passé ne touche jamais la barre du suivant. */
let run = 0;
onUnmounted(() => {
  alive = false;
  if (ghostTimer) clearTimeout(ghostTimer);
  if (cryTimer) clearTimeout(cryTimer);
});

const reduced = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function centerOf(el: HTMLElement | null | undefined): { x: number; y: number } | null {
  const box = root.value?.getBoundingClientRect();
  const r = el?.getBoundingClientRect();
  if (!box || !r) return null;
  return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
}

const FLIGHT_MS = 420;

/** Retire un élément d'une liste réactive au bout de `ms`. */
function expire<T extends { key: number }>(list: { value: T[] }, key: number, ms: number) {
  setTimeout(() => (list.value = list.value.filter((x) => x.key !== key)), ms);
}

/** Un impact : il retire SES dégâts, le boss tremble, le chiffre s'affiche. `size` règle la
 *  taille du chiffre ; `big` secoue toute la scène. */
function impact(damage: number, style: StrikeStyle, size: PopSize = 'md', big = false) {
  shownHp.value = Math.max(0, shownHp.value - damage);
  flashStyle.value = style;
  flash.value = ++seq;
  shake.value = false;
  void nextTick(() => {
    shake.value = true;
    setTimeout(() => (shake.value = false), 380);
  });
  if (big) {
    quake.value = false;
    void nextTick(() => {
      quake.value = true;
      setTimeout(() => (quake.value = false), 650);
    });
  }
  const key = ++seq;
  // Les petits chiffres s'écartent un peu les uns des autres, sinon un laser les empile.
  const dx = size === 'sm' ? Math.round((Math.random() - 0.5) * 70) : 0;
  pops.value.push({ key, text: `−${fmtBossPv(damage)}`, size, dx });
  expire(pops, key, size === 'xl' ? 1700 : 1100);
}

/** Onde de choc au centre du boss. */
function wave(style: StrikeStyle) {
  const to = centerOf(bossEl.value);
  if (!to) return;
  const key = ++seq;
  waves.value.push({ key, x: to.x, y: to.y, style });
  expire(waves, key, 900);
}

/** Un éclair en zigzag, du haut de la scène jusqu'au boss (un peu décalé à chaque fois). */
function bolt(): void {
  const to = centerOf(bossEl.value);
  if (!to) return;
  const h = Math.max(40, Math.round(to.y));
  const pts: string[] = ['30,0'];
  const steps = 6;
  for (let i = 1; i < steps; i++) {
    pts.push(`${30 + Math.round((Math.random() - 0.5) * 44)},${Math.round((h * i) / steps)}`);
  }
  pts.push(`30,${h}`);
  const key = ++seq;
  bolts.value.push({
    key,
    x: to.x + Math.round((Math.random() - 0.5) * 50),
    h,
    points: pts.join(' '),
  });
  expire(bolts, key, 260);
}

/** Fait bondir l'auteur (relance l'animation même s'il frappait déjà). */
async function hop(userId: string) {
  strikerId.value = null;
  await nextTick();
  strikerId.value = userId;
}

const live = (token: number) => alive && !skipped && token === run;

/** Orbes (1-4 reps) et boules de feu (5-9) : un projectile par rep. */
async function volley(
  s: BossStrike,
  hits: number[],
  gap: number,
  style: StrikeStyle,
  token: number,
) {
  for (const dmg of hits) {
    if (!live(token)) return;
    await hop(s.userId);
    const from = centerOf(allyEls.get(s.userId));
    const to = centerOf(bossEl.value);
    if (from && to) {
      const key = ++seq;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      projs.value.push({ key, x: from.x, y: from.y, dx, dy, ang, style });
      setTimeout(() => {
        projs.value = projs.value.filter((p) => p.key !== key);
        if (live(token)) impact(dmg, style, 'md');
      }, FLIGHT_MS);
    } else {
      impact(dmg, style);
    }
    await wait(gap);
  }
  // Le dernier projectile arrive.
  await wait(Math.max(0, FLIGHT_MS - gap) + 380);
}

/** ⚡ 10-19 reps : cinq éclairs s'abattent du ciel. */
async function storm(s: BossStrike, hits: number[], gap: number, token: number) {
  await hop(s.userId);
  await wait(260); // l'auteur lève la main, le ciel gronde
  for (const dmg of hits) {
    if (!live(token)) return;
    bolt();
    impact(dmg, 'storm', 'md');
    await wait(gap);
  }
  await wait(300);
}

/** 🔆 20-39 reps : un rayon continu, les PV fondent par petits paliers, puis il éclate. */
async function laser(s: BossStrike, hits: number[], gap: number, token: number) {
  await hop(s.userId);
  await wait(380); // charge
  if (!live(token)) return;
  const from = centerOf(allyEls.get(s.userId));
  const to = centerOf(bossEl.value);
  if (from && to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    beam.value = {
      key: ++seq,
      x: from.x,
      y: from.y,
      len: Math.hypot(dx, dy),
      ang: (Math.atan2(dy, dx) * 180) / Math.PI,
      end: false,
    };
  }
  for (let i = 0; i < hits.length; i++) {
    if (!live(token)) break;
    const last = i === hits.length - 1;
    if (last && beam.value) beam.value = { ...beam.value, end: true };
    impact(hits[i]!, 'laser', last ? 'xl' : 'sm', last);
    if (last) wave('laser');
    await wait(gap);
  }
  await wait(260);
  beam.value = null;
  await wait(300);
}

/** ☄️ 40+ reps : la scène s'assombrit, un météore tombe, onde de choc, un seul gros chiffre. */
async function meteorStrike(s: BossStrike, hits: number[], token: number) {
  await hop(s.userId);
  dim.value = true;
  await wait(320);
  if (!live(token)) {
    dim.value = false;
    return;
  }
  const to = centerOf(bossEl.value);
  const box = root.value?.getBoundingClientRect();
  if (to && box) {
    // Il arrive du coin haut-droit, hors de la scène.
    const x = Math.min(box.width + 40, to.x + 220);
    const y = -70;
    const dx = to.x - x;
    const dy = to.y - y;
    meteor.value = { key: ++seq, x, y, dx, dy, ang: (Math.atan2(dy, dx) * 180) / Math.PI };
  }
  await wait(METEOR_FALL_MS);
  meteor.value = null;
  if (live(token)) {
    impact(
      hits.reduce((a, b) => a + b, 0),
      'meteor',
      'xl',
      true,
    );
    wave('meteor');
  }
  await wait(450);
  dim.value = false;
  await wait(400);
}
/** Durée de la chute, alignée sur l'animation CSS `fbs-meteor`. */
const METEOR_FALL_MS = 900;

/** Une frappe, mise en scène selon son nombre de reps (`strikePlan`) : orbes, boules de feu,
 *  tempête, laser ou météore. Au-delà de 10 reps le nombre d'impacts est FIXE : l'animation
 *  ne s'allonge pas avec la frappe. Chaque impact retire ses propres dégâts (leur somme vaut
 *  la frappe). */
async function strike(s: BossStrike, token: number) {
  const plan = strikePlan(s.damage, props.family);
  // Un cri par frappe, choisi sur les PV d'AVANT la frappe (le coup fatal arrache un dernier
  // souffle), affiché dès le premier impact.
  if (cryTimer) clearTimeout(cryTimer);
  cry.value = {
    key: ++seq,
    text: bossCry(s.damage, shownHp.value, props.hpTotal, Math.random(), recentCries),
  };
  recentCries = [...recentCries, cry.value.text].slice(-BOSS_CRY_MEMORY);
  if (plan.style !== 'orb') {
    const label =
      plan.style === 'fire'
        ? `${plan.emoji} ${plan.name} ×${plan.hits.length}`
        : `${plan.emoji} ${plan.name}`;
    banner.value = { key: ++seq, text: label, style: plan.style };
  }
  if (plan.style === 'orb' || plan.style === 'fire') {
    await volley(s, plan.hits, plan.gapMs, plan.style, token);
  } else if (plan.style === 'storm') {
    await storm(s, plan.hits, plan.gapMs, token);
  } else if (plan.style === 'laser') {
    await laser(s, plan.hits, plan.gapMs, token);
  } else {
    await meteorStrike(s, plan.hits, token);
  }
  banner.value = null;
  // Le cri tient encore un peu après le dernier impact.
  const ours = cry.value?.key;
  cryTimer = setTimeout(() => {
    if (cry.value?.key === ours) cry.value = null;
  }, CRY_LINGER_MS - 380);
  strikerId.value = null;
}

function skip() {
  skipped = true;
}

/** Tout ce que la mise en scène a laissé à l'écran disparaît (« Passer », fin du rejeu). */
function clearFx() {
  projs.value = [];
  bolts.value = [];
  waves.value = [];
  beam.value = null;
  meteor.value = null;
  dim.value = false;
  banner.value = null;
}

/** Joue des frappes dans l'ordre. `startHp` = les PV avant la première (rejeu à l'ouverture,
 *  ou frappe qu'on vient d'envoyer) ; à la fin, la barre retombe sur ce que dit le serveur. */
async function play(strikes: BossStrike[], startHp?: number) {
  if (!strikes.length || reduced()) {
    shownHp.value = props.hpLeft;
    ghostHp.value = props.hpLeft;
    return;
  }
  animating.value = true;
  skipped = false;
  const token = ++run;
  if (startHp != null) {
    shownHp.value = startHp;
    ghostHp.value = startHp;
  }
  for (const s of strikes) {
    if (!alive || skipped) break;
    await strike(s, token);
  }
  if (!alive || token !== run) return;
  animating.value = false;
  clearFx();
  strikerId.value = null;
  if (skipped) clearCry();
  shownHp.value = props.hpLeft;
  if (skipped) ghostHp.value = props.hpLeft;
}

/** L'animation de mort, APRÈS la dernière frappe : on la regarde, puis la page affiche le
 *  résultat. `prefers-reduced-motion` : rien à attendre. */
async function die() {
  shownHp.value = 0;
  if (reduced() || !alive) {
    fallen.value = true;
    return;
  }
  // Le dernier projectile et le cri « dernier souffle » ont le temps d'arriver.
  await wait(500);
  if (!alive) return;
  clearCry();
  dying.value = true;
  await wait(DEATH_MS);
  if (!alive) return;
  fallen.value = true;
  dying.value = false;
}

defineExpose({ play, die });
</script>

<style scoped lang="scss">
.fbs {
  position: relative;
  margin: 12px 0 4px;
  padding: 14px 10px 12px;
  border-radius: 14px;
  background:
    radial-gradient(
      circle at 50% 22%,
      color-mix(in srgb, var(--accent) 16%, transparent),
      transparent 60%
    ),
    color-mix(in srgb, var(--bg) 70%, #000);
  border: 1px solid var(--line);
  overflow: hidden;
}
.fbs-boss-zone {
  z-index: 2;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* margin-top : l'illustration dépasse du médaillon de ~20 px (la tête), plus le balancement ;
   sans cette marge elle était coupée par le haut de la carte (overflow: hidden). */
.fbs-boss {
  position: relative;
  margin-top: 24px;
  width: 116px;
  height: 116px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 50% 40%, #3a1f1a, #120d0a 70%);
  border: 2px solid color-mix(in srgb, var(--d4) 70%, transparent);
  box-shadow: 0 0 22px color-mix(in srgb, var(--d4) 35%, transparent);
  animation: fbs-bob 3.2s ease-in-out infinite;
}
.fbs-boss.shake {
  animation: fbs-shake 0.38s linear;
}
/* À terre : l'état final de `fbs-die` — sans lui, le boss reprenait sa taille d'un coup à la
   fin de l'animation. */
.fbs-boss.dead {
  filter: grayscale(1) brightness(0.55);
  transform: translateY(18px) scale(0.78) rotate(-8deg);
  opacity: 0.75;
  animation: none;
}
/* La mort : tremble, blanchit, puis s'effondre en pâlissant. */
.fbs-boss.dying {
  animation: fbs-die 1.9s ease-in forwards;
}
.fbs-boss.dying .fbs-aura {
  animation: fbs-spin 0.6s linear infinite;
  border-color: #fff;
}
.fbs-shard {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--d4) 60%, #fff);
  box-shadow: 0 0 8px var(--d4);
  pointer-events: none;
  animation: fbs-shard 1.1s ease-out 0.7s both;
}
.fbs-ko {
  position: absolute;
  top: 44px;
  left: 50%;
  font-size: 34px;
  letter-spacing: 2px;
  color: var(--accent);
  text-shadow:
    0 3px 0 #000,
    0 0 18px color-mix(in srgb, var(--accent) 70%, transparent);
  pointer-events: none;
  animation: fbs-ko 2.2s ease-out both;
}
.fbs-aura {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 2px dashed color-mix(in srgb, var(--d4) 45%, transparent);
  animation: fbs-spin 14s linear infinite;
}
.fbs-boss-emo {
  font-size: 64px;
  line-height: 1;
}
/* Posé au fond du médaillon (l'image a les pieds en bas de son carré) et un peu plus grand
   que lui : la tête dépasse du cercle, le boss domine le groupe. */
.fbs-boss-art {
  position: absolute;
  left: 50%;
  bottom: 4px;
  width: 132px;
  height: 132px;
  transform: translateX(-50%);
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.35)) drop-shadow(0 4px 6px rgba(0, 0, 0, 0.6));
}
.fbs-family {
  position: absolute;
  right: -4px;
  bottom: -2px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.fbs-flash {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    #fff 0%,
    color-mix(in srgb, var(--accent) 70%, transparent) 40%,
    transparent 70%
  );
  animation: fbs-flash 0.35s ease-out forwards;
  pointer-events: none;
}
.fbs-name {
  margin-top: 8px;
  font-size: 17px;
}
.fbs-hp {
  position: relative;
  width: min(100%, 280px);
  height: 12px;
  margin-top: 6px;
  border-radius: 6px;
  background: var(--line);
  overflow: hidden;
}
.fbs-ghost,
.fbs-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 6px;
}
.fbs-ghost {
  background: color-mix(in srgb, var(--text) 55%, transparent);
  transition: width 0.6s ease-out;
}
.fbs-fill {
  background: linear-gradient(90deg, var(--d4), color-mix(in srgb, var(--d4) 65%, var(--accent)));
  transition: width 0.25s ease-out;
}
.fbs-hp-l {
  margin-top: 4px;
  font-size: 12px;
  color: var(--dim);
}
.fbs-hp-l .font-display {
  color: var(--text);
  font-size: 15px;
}
.fbs-pop {
  position: absolute;
  top: 26px;
  left: 50%;
  font-size: 26px;
  color: var(--accent);
  text-shadow:
    0 2px 0 #000,
    0 0 12px color-mix(in srgb, var(--accent) 60%, transparent);
  pointer-events: none;
  animation: fbs-pop 1.1s ease-out forwards;
}
/* Bulle du cri, accrochée au bord gauche du médaillon (le chiffre des dégâts est au centre) :
   son coin droit touche le boss, elle ne file plus vers le bord de l'écran. */
.fbs-cry {
  position: absolute;
  top: 44px;
  right: calc(50% + 44px);
  max-width: 96px;
  padding: 5px 10px;
  border-radius: 14px 14px 4px 14px;
  background: var(--text);
  color: var(--bg);
  font-size: 15px;
  line-height: 1.15;
  text-align: center;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  animation: fbs-cry-in 0.22s ease-out;
}
.fbs-party {
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px 8px;
  margin-top: 14px;
}
.fbs-ally {
  width: 66px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.fbs-ally-av {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--surface);
  border: 2px solid var(--line);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
  // Une vignette : ni badge de talent ni anneaux cliquables (ils ouvrent des sélecteurs sur
  // la fiche Héros, pas ici). Le familier, lui, reste dessiné.
  pointer-events: none;
  :deep(.talent-badge),
  :deep(.hotspot-ring) {
    display: none;
  }
}
.fbs-ally.me .fbs-ally-av {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--line));
}
.fbs-ally.striking .fbs-ally-av {
  border-color: var(--accent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 70%, transparent);
  animation: fbs-hop 0.34s ease-out;
}
.fbs-ally-n {
  margin-top: 3px;
  max-width: 100%;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fbs-ally-u {
  font-size: 10.5px;
  color: var(--dim);
}
.fbs-skip {
  position: absolute;
  z-index: 4;
  top: 8px;
  right: 8px;
  min-height: 32px;
  padding: 4px 10px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}
.fbs-proj {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff, var(--accent) 55%, transparent 72%);
  box-shadow: 0 0 14px var(--accent);
  pointer-events: none;
  animation: fbs-fly 0.42s ease-in forwards;
}

@keyframes fbs-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}
@keyframes fbs-shake {
  0%,
  100% {
    transform: translate(0, 0);
  }
  20% {
    transform: translate(-7px, 2px) rotate(-3deg);
  }
  45% {
    transform: translate(6px, -2px) rotate(2deg);
  }
  70% {
    transform: translate(-4px, 1px);
  }
}
@keyframes fbs-die {
  0% {
    transform: translate(0, 0);
    filter: none;
  }
  8%,
  24%,
  40% {
    transform: translate(-8px, 2px) rotate(-4deg);
    filter: brightness(1.8);
  }
  16%,
  32%,
  48% {
    transform: translate(8px, -2px) rotate(4deg);
    filter: brightness(1);
  }
  60% {
    transform: scale(1.12);
    filter: brightness(2.4) saturate(0);
  }
  100% {
    transform: translateY(18px) scale(0.78) rotate(-8deg);
    filter: grayscale(1) brightness(0.55);
    opacity: 0.75;
  }
}
@keyframes fbs-shard {
  from {
    opacity: 1;
    transform: rotate(var(--a)) translateX(0) scale(1);
  }
  to {
    opacity: 0;
    transform: rotate(var(--a)) translateX(90px) scale(0.4);
  }
}
@keyframes fbs-ko {
  0%,
  45% {
    opacity: 0;
    transform: translate(-50%, 10px) scale(0.5);
  }
  60% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1.2);
  }
  75%,
  100% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}
@keyframes fbs-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes fbs-flash {
  from {
    opacity: 1;
    transform: scale(0.6);
  }
  to {
    opacity: 0;
    transform: scale(1.25);
  }
}
@keyframes fbs-pop {
  0% {
    opacity: 0;
    transform: translate(calc(-50% + var(--px, 0px)), 10px) scale(0.7);
  }
  18% {
    opacity: 1;
    transform: translate(calc(-50% + var(--px, 0px)), -6px) scale(1.15);
  }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--px, 0px)), -46px) scale(1);
  }
}
@keyframes fbs-cry-in {
  0% {
    opacity: 0;
    transform: scale(0.6) rotate(-6deg);
  }
  70% {
    opacity: 1;
    transform: scale(1.08) rotate(2deg);
  }
  100% {
    transform: scale(1) rotate(0);
  }
}
@keyframes fbs-hop {
  40% {
    transform: translateY(-12px);
  }
}
@keyframes fbs-fly {
  from {
    transform: translate(0, 0) scale(0.8);
  }
  to {
    transform: translate(var(--dx), var(--dy)) scale(1.4);
  }
}

/* ── Paliers de frappe ──────────────────────────────────────────────────────────── */
.fbs-proj,
.fbs-bolt,
.fbs-beam,
.fbs-meteor,
.fbs-wave,
.fbs-banner {
  z-index: 3;
}
/* 🔥 Boule de feu : plus grosse, une traînée de flammes derrière elle. */
.fbs-proj.fire {
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  background: radial-gradient(circle, #fff 0%, #ffd23f 30%, #ff6a2a 60%, transparent 74%);
  box-shadow:
    0 0 14px #ff6a2a,
    0 0 26px color-mix(in srgb, #ff6a2a 50%, transparent);
}
.fbs-proj.fire::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 46px;
  height: 12px;
  margin-top: -6px;
  border-radius: 6px;
  transform-origin: 0 50%;
  transform: rotate(calc(var(--ang) + 180deg));
  background: linear-gradient(
    90deg,
    rgba(255, 150, 50, 0.95),
    rgba(255, 70, 30, 0.5) 45%,
    transparent
  );
  filter: blur(1.5px);
}
/* Flash d'impact à la couleur de l'attaque. */
.fbs-flash.fx-fire {
  background: radial-gradient(circle, #fff 0%, #ff9a3c 40%, transparent 70%);
}
.fbs-flash.fx-storm {
  background: radial-gradient(circle, #fff 0%, #8ecbff 45%, transparent 72%);
}
.fbs-flash.fx-laser {
  background: radial-gradient(circle, #fff 0%, #7ff3ff 45%, transparent 72%);
}
.fbs-flash.fx-meteor {
  inset: -40px;
  background: radial-gradient(circle, #fff 0%, #ffd23f 30%, #ff5a1f 55%, transparent 72%);
  animation-duration: 0.6s;
}
/* ⚡ Éclair : un zigzag blanc dans un halo bleu, qui grésille. */
.fbs-bolt {
  position: absolute;
  top: 0;
  width: 60px;
  overflow: visible;
  pointer-events: none;
  animation: fbs-bolt 0.26s steps(4) forwards;
}
.fbs-bolt polyline {
  fill: none;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
.fbs-bolt-glow {
  stroke: #8ecbff;
  stroke-width: 9;
  opacity: 0.45;
  filter: blur(3px);
}
.fbs-bolt-core {
  stroke: #fff;
  stroke-width: 2.5;
}
/* 🔆 Laser : un rayon continu, cœur blanc, halo cyan, qui pulse. */
.fbs-beam {
  position: absolute;
  height: 12px;
  margin-top: -6px;
  border-radius: 6px;
  transform-origin: 0 50%;
  transform: rotate(var(--ang));
  pointer-events: none;
  background: linear-gradient(180deg, transparent, #3fd8ff 25%, #fff 50%, #3fd8ff 75%, transparent);
  box-shadow: 0 0 18px #3fd8ff;
  animation:
    fbs-beam-in 0.2s ease-out,
    fbs-beam-pulse 0.12s ease-in-out 0.2s infinite alternate;
}
.fbs-beam.end {
  height: 26px;
  margin-top: -13px;
  box-shadow: 0 0 34px #fff;
}
/* ☄️ Météore : la scène s'assombrit, il tombe en grossissant, traîne de feu. */
.fbs-dim {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: radial-gradient(circle at 50% 28%, rgba(120, 30, 0, 0.35), rgba(0, 0, 0, 0.78) 70%);
  animation: fbs-fade-in 0.3s ease-out;
}
.fbs-meteor {
  position: absolute;
  width: 48px;
  height: 48px;
  margin: -24px 0 0 -24px;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(circle, #fff 0%, #ffd23f 28%, #ff6a2a 58%, transparent 74%);
  box-shadow:
    0 0 26px #ff6a2a,
    0 0 60px color-mix(in srgb, #ff6a2a 55%, transparent);
  animation: fbs-meteor 0.9s cubic-bezier(0.5, 0, 0.9, 0.6) forwards;
}
.fbs-meteor::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 150px;
  height: 30px;
  margin-top: -15px;
  border-radius: 15px;
  transform-origin: 0 50%;
  transform: rotate(calc(var(--ang) + 180deg));
  background: linear-gradient(
    90deg,
    rgba(255, 210, 63, 0.95),
    rgba(255, 90, 30, 0.6) 40%,
    transparent
  );
  filter: blur(3px);
}
/* Onde de choc. */
.fbs-wave {
  position: absolute;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border-radius: 50%;
  border: 3px solid #7ff3ff;
  pointer-events: none;
  animation: fbs-wave 0.75s ease-out forwards;
}
.fbs-wave.meteor {
  border-width: 5px;
  border-color: #ffb23f;
  box-shadow: 0 0 24px #ff6a2a;
  animation-duration: 0.9s;
}
/* Nom de l'attaque, calé à gauche (le bouton « Passer » est à droite). */
.fbs-banner {
  position: absolute;
  top: 8px;
  left: 10px;
  max-width: calc(100% - 120px);
  padding: 4px 10px;
  border-radius: 14px;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: color-mix(in srgb, #000 70%, transparent);
  border: 1px solid var(--line);
  pointer-events: none;
  animation: fbs-banner 0.35s ease-out;
}
.fbs-banner.fire {
  color: #ffb23f;
  border-color: #ff6a2a;
}
.fbs-banner.storm {
  color: #b9e0ff;
  border-color: #8ecbff;
}
.fbs-banner.laser {
  color: #b5f7ff;
  border-color: #3fd8ff;
}
.fbs-banner.meteor {
  color: #ffd23f;
  border-color: #ffb23f;
  box-shadow: 0 0 14px color-mix(in srgb, #ff6a2a 60%, transparent);
}
.fbs-pop.pop-sm {
  font-size: 16px;
}
.fbs-pop.pop-xl {
  top: 12px;
  font-size: 40px;
  color: #fff;
  text-shadow:
    0 3px 0 #000,
    0 0 18px #ff6a2a,
    0 0 30px #ffd23f;
  animation-duration: 1.7s;
}
/* Toute la scène tremble. */
.fbs.quake {
  animation: fbs-quake 0.6s linear;
}

@keyframes fbs-bolt {
  0%,
  50% {
    opacity: 1;
  }
  25%,
  75% {
    opacity: 0.35;
  }
  100% {
    opacity: 0;
  }
}
@keyframes fbs-beam-in {
  from {
    clip-path: inset(0 100% 0 0);
  }
  to {
    clip-path: inset(0 0 0 0);
  }
}
@keyframes fbs-beam-pulse {
  from {
    filter: brightness(1);
  }
  to {
    filter: brightness(1.6);
  }
}
@keyframes fbs-fade-in {
  from {
    opacity: 0;
  }
}
@keyframes fbs-meteor {
  from {
    transform: translate(0, 0) scale(0.5);
  }
  to {
    transform: translate(var(--dx), var(--dy)) scale(1.35);
  }
}
@keyframes fbs-wave {
  from {
    opacity: 1;
    transform: scale(0.3);
  }
  to {
    opacity: 0;
    transform: scale(5);
  }
}
@keyframes fbs-banner {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.85);
  }
}
@keyframes fbs-quake {
  0%,
  100% {
    transform: translate(0, 0);
  }
  15% {
    transform: translate(-6px, 4px);
  }
  30% {
    transform: translate(6px, -3px);
  }
  45% {
    transform: translate(-4px, -4px);
  }
  60% {
    transform: translate(4px, 3px);
  }
  80% {
    transform: translate(-2px, 1px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fbs-boss,
  .fbs-aura {
    animation: none;
  }
}
</style>
