<template>
  <!-- Scène du boss entre amis : le boss en haut, le groupe en ligne dessous. Chaque frappe
       fait bondir son auteur, part vers le boss et retire des PV à l'impact. Rien n'est décidé
       ici : les dégâts viennent du serveur, la scène ne fait que les montrer. -->
  <div ref="root" class="fbs">
    <div class="fbs-boss-zone">
      <div ref="bossEl" class="fbs-boss" :class="{ shake, dying, dead: shownHp <= 0 && !dying }">
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
        <span v-if="flash" :key="flash" class="fbs-flash" aria-hidden="true" />
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
      <span v-for="p in pops" :key="p.key" class="fbs-pop font-display">{{ p.text }}</span>
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
      aria-hidden="true"
      :style="{
        left: p.x + 'px',
        top: p.y + 'px',
        '--dx': p.dx + 'px',
        '--dy': p.dy + 'px',
      }"
    />

    <!-- Une frappe de 30 reps dure 15 s : on peut toujours passer au résultat. -->
    <button v-if="animating" class="fbs-skip" @click="skip">⏩ Passer</button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import AventureAvatar from '@/components/AventureAvatar.vue';
import { BOSS_SHOT_MS, bossCry, fmtBossPv, strikeShots, type BossStrike } from '@/lib/friendBoss';
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
const SHARDS = 10;
/** Durée de la mort, alignée sur l'animation CSS `fbs-die` (+ la bannière). */
const DEATH_MS = 2200;
const shake = ref(false);
const flash = ref(0);
const projs = ref<{ key: number; x: number; y: number; dx: number; dy: number }[]>([]);
const pops = ref<{ key: number; text: string }[]>([]);
const cry = ref<{ key: number; text: string } | null>(null);
/** Temps pendant lequel le cri reste affiché après l'impact du dernier projectile. */
const CRY_LINGER_MS = 700;
let cryTimer: ReturnType<typeof setTimeout> | null = null;
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

/** Un impact : le projectile retire SES dégâts, le boss tremble, le chiffre s'affiche. */
function impact(damage: number) {
  shownHp.value = Math.max(0, shownHp.value - damage);
  flash.value = ++seq;
  shake.value = false;
  void nextTick(() => {
    shake.value = true;
    setTimeout(() => (shake.value = false), 380);
  });
  const key = ++seq;
  pops.value.push({ key, text: `−${fmtBossPv(damage)}` });
  setTimeout(() => (pops.value = pops.value.filter((p) => p.key !== key)), 1100);
}

/** Une frappe = un projectile par rep, un toutes les `BOSS_SHOT_MS` ; chacun applique ses
 *  propres dégâts à l'impact (leur somme vaut la frappe, `strikeShots`). */
async function strike(s: BossStrike, token: number) {
  const shots = strikeShots(s.damage);
  // Un cri par frappe, choisi sur les PV d'AVANT la frappe (le coup fatal arrache un dernier
  // souffle), affiché dès le premier projectile.
  if (cryTimer) clearTimeout(cryTimer);
  cry.value = {
    key: ++seq,
    text: bossCry(s.damage, shownHp.value, props.hpTotal, Math.random(), cry.value?.text),
  };
  for (const dmg of shots) {
    if (!alive || skipped) return;
    strikerId.value = null;
    await nextTick();
    strikerId.value = s.userId;
    const from = centerOf(allyEls.get(s.userId));
    const to = centerOf(bossEl.value);
    if (from && to) {
      const key = ++seq;
      projs.value.push({ key, x: from.x, y: from.y, dx: to.x - from.x, dy: to.y - from.y });
      setTimeout(() => {
        projs.value = projs.value.filter((p) => p.key !== key);
        if (alive && !skipped && token === run) impact(dmg);
      }, FLIGHT_MS);
    } else {
      impact(dmg);
    }
    await wait(BOSS_SHOT_MS);
  }
  // Laisse le dernier projectile arriver avant la frappe suivante ; le cri tient encore un
  // peu après l'impact.
  const settle = Math.max(0, FLIGHT_MS - BOSS_SHOT_MS) + 380;
  const ours = cry.value?.key;
  cryTimer = setTimeout(
    () => {
      if (cry.value?.key === ours) cry.value = null;
    },
    Math.max(0, FLIGHT_MS - BOSS_SHOT_MS) + CRY_LINGER_MS,
  );
  await wait(settle);
  strikerId.value = null;
}

function skip() {
  skipped = true;
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
  projs.value = [];
  strikerId.value = null;
  if (skipped) clearCry();
  shownHp.value = props.hpLeft;
  if (skipped) ghostHp.value = props.hpLeft;
}

/** L'animation de mort, APRÈS la dernière frappe : on la regarde, puis la page affiche le
 *  résultat. `prefers-reduced-motion` : rien à attendre. */
async function die() {
  shownHp.value = 0;
  if (reduced() || !alive) return;
  // Le dernier projectile et le cri « dernier souffle » ont le temps d'arriver.
  await wait(500);
  if (!alive) return;
  clearCry();
  dying.value = true;
  await wait(DEATH_MS);
  if (!alive) return;
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
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.fbs-boss {
  position: relative;
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
.fbs-boss.dead {
  filter: grayscale(1) brightness(0.7);
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
/* Bulle du cri, accrochée en haut à gauche du boss (le chiffre des dégâts est au centre). */
.fbs-cry {
  position: absolute;
  top: 2px;
  left: 50%;
  margin-left: -150px;
  max-width: 120px;
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
    transform: translate(-50%, 10px) scale(0.7);
  }
  18% {
    opacity: 1;
    transform: translate(-50%, -6px) scale(1.15);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -46px) scale(1);
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

@media (prefers-reduced-motion: reduce) {
  .fbs-boss,
  .fbs-aura {
    animation: none;
  }
}
</style>
