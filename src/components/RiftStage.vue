<template>
  <div class="rift" :class="[shake, { reduce }]">
    <!-- Ambiance : la déchirure respire, des éclats de mana dérivent. Décor pur — mais
         c'est ce qui fait la différence entre « une simulation » et « un lieu ». -->
    <div class="amb" aria-hidden="true">
      <span class="glow g1" /><span class="glow g2" />
      <span v-for="m in MOTES" :key="m" class="mote" :style="moteStyle(m)" />
    </div>

    <!-- La caméra SUIT le groupe : à douze monstres, tout montrer d'un coup les
         réduirait à des points de quelques pixels sur un téléphone. -->
    <div class="view">
      <div class="field" :style="{ width: CAM_W * 100 + '%', transform: `translateX(${camPct}%)` }">
        <div class="ground" />
        <div class="ceil" />
        <div class="breach" />

        <!-- La porte du gardien : fermée tant qu'un monstre tient debout. -->
        <div class="door" :class="{ open: doorOpen }" :style="{ left: stage.doorX * 100 + '%' }">
          <span class="leaf l" /><span class="leaf r" />
          <span class="lintel" />
          <span class="door-glow" />
        </div>

        <!-- La salle : un autel, des braseros. Elle n'existe qu'au-delà de la porte. -->
        <div class="sanctum" :class="{ lit: doorOpen }" :style="{ left: stage.doorX * 100 + '%' }">
          <span class="altar" />
          <span class="brazier b1" /><span class="brazier b2" />
        </div>

        <!-- Les corps. Leur TAILLE est la rampe de force du moteur : ce qui grossit
             frappe vraiment plus fort (cf. riftStage.ts). -->
        <div
          v-for="(f, i) in stage.foes"
          :key="i"
          class="foe"
          :class="{
            dead: downs.has(i),
            boss: f.boss,
            target: i === targetIdx,
            hurt: hurtIdx === i,
          }"
          :style="{
            left: f.x * 100 + '%',
            top: f.y * 100 + '%',
            '--sc': f.scale,
            zIndex: 10 + i,
          }"
        >
          <span class="shadow" />
          <span class="aura" />
          <span class="emo">{{ f.emoji }}</span>
        </div>

        <!-- Le groupe : le héros devant, l'escorte dans son dos. -->
        <div
          class="party"
          :class="{ lunge: lunging, hurt: partyHurt }"
          :style="{ left: heroX * 100 + '%', top: AXIS_Y * 100 + '%' }"
        >
          <span class="shadow big" />
          <span v-for="(m, k) in backline" :key="k" class="ally" :style="allyStyle(k)">{{
            m.emoji
          }}</span>
          <div v-if="hero" class="hero-av">
            <AventureAvatar :profile="hero.profile" :equipped="hero.equipped" />
          </div>
          <span v-else class="hero-emo">⚔️</span>
        </div>

        <!-- Arc de lame, éclats de mort, nombres flottants. -->
        <span
          v-for="s in slashes"
          :key="s.id"
          class="slash"
          :style="{ left: s.x * 100 + '%', top: s.y * 100 + '%' }"
        />
        <span
          v-for="p in sparks"
          :key="p.id"
          class="spark"
          :style="{
            left: p.x * 100 + '%',
            top: p.y * 100 + '%',
            '--dx': p.dx + 'px',
            '--dy': p.dy + 'px',
          }"
        />
        <span
          v-for="p in pops"
          :key="p.id"
          class="pop"
          :class="'pop-' + p.kind"
          :style="{ left: p.x * 100 + '%', top: p.y * 100 + '%' }"
          >{{ p.text }}</span
        >
      </div>
    </div>

    <div class="vig" :style="{ opacity: hitVig }" aria-hidden="true" />

    <!-- HUD : ce qu'on a abattu, et ce qu'il reste au groupe. -->
    <div class="hud">
      <div class="hud-l">
        <span class="chip">🕳️ Faille niv {{ level }}</span>
        <span class="chip">⚔️ {{ killCount }}/{{ monsterCount }}</span>
      </div>
      <q-btn flat dense no-caps class="skip" label="⏩ Passer" @click="skip" />
    </div>

    <div v-if="stage.hasPv" class="pvbar">
      <i class="ghost" :style="{ width: ghostPct + '%' }" />
      <i class="fill" :class="{ low: pvPct <= 30 }" :style="{ width: pvPct + '%' }" />
      <span class="pvtxt">{{ Math.round(pv) }} / {{ stage.maxPv }}</span>
    </div>

    <transition name="ban" mode="out-in">
      <div v-if="banner" :key="banner.id" class="banner" :class="'ban-' + banner.kind">
        <div class="ban-main font-display">{{ banner.main }}</div>
        <div v-if="banner.sub" class="ban-sub">{{ banner.sub }}</div>
      </div>
    </transition>

    <!-- L'écran de fin est un MOMENT du jeu : on n'émet `done` qu'au clic. -->
    <div v-if="ended" class="end">
      <div class="end-card">
        <div class="end-emo">{{ stage.cleared ? '🌀' : '💀' }}</div>
        <div class="end-title font-display">
          {{ stage.cleared ? 'Faille refermée' : 'La faille tient' }}
        </div>
        <div class="end-sub">
          {{ killCount }} monstre{{ killCount > 1 ? 's' : '' }} abattu{{ killCount > 1 ? 's' : '' }}
          <template v-if="stage.doorOpens && !stage.cleared"> · le gardien a résisté</template>
          <template v-else-if="!stage.doorOpens"> · le gardien n’a jamais été atteint</template>
        </div>
        <q-btn
          unelevated
          no-caps
          color="primary"
          text-color="dark"
          class="end-cta"
          label="Voir le rapport"
          @click="finish"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 🕳️ LA SALLE DU GARDIEN — plateau plein écran d'une incursion.
//
// ⚠️ Il ne calcule AUCUN combat : il rejoue `buildRiftStage`, elle-même dérivée de ce que
// `simulateIncursion` a tranché au départ (règle fondatrice de riftStage.ts). Le sort de
// l'incursion est scellé avant la première image.
//
// ⚠️ LES VALEURS INTERMÉDIAIRES DE LA BARRE SONT DE L'INTERPOLATION D'AFFICHAGE, pas des
// PV du moteur : chaque rencontre ARRIVE exactement sur le PV lu dans le sillage. On ne
// connaît pas le détail coup par coup (granularité de rencontre), et on ne l'invente pas —
// c'est pourquoi les monstres n'ont AUCUNE barre de vie individuelle : debout, ou à terre.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import type { Equipped } from '@/lib/items';
import { RIFT_STAGE, type RiftStage } from '@/lib/riftStage';
import AventureAvatar from '@/components/AventureAvatar.vue';

const props = defineProps<{
  stage: RiftStage;
  level: number;
  hero: { profile: 'puissant' | 'agile' | 'polyvalent'; equipped: Equipped } | null;
  members: { emoji: string; name: string }[];
}>();
const emit = defineEmits<{ done: [] }>();

// ── Réglages de mise en scène ──
/** Largeur du terrain, en écrans. ⚠️ À 1 écran, douze monstres tiendraient dans 46 % de
 *  la vue, soit ~14 px d'écart sur un téléphone : illisible. La caméra suit, on découvre. */
const CAM_W = 2.8;
/** L'axe de marche vient de la LIB : les corps et le héros doivent fouler le même sol. */
const AXIS_Y = RIFT_STAGE.axisY;
const MOTES = 12;
const SLOW_DOOR = 760; // on laisse la porte s'ouvrir
const SLOW_BOSS = 900; // le gardien mérite son temps
const SLOW_FATAL = 1100; // et la chute aussi
const BACKLINE = 3; // au plus trois silhouettes derrière le héros

const reduce =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

const beats = computed(() => props.stage.beats);
/** Cadence : une incursion compte au plus 14 rencontres, on peut respirer. */
const beatMs = computed(() => (beats.value.length > 10 ? 560 : 680));

const monsterCount = computed(() => props.stage.foes.filter((f) => !f.boss).length);
const backline = computed(() => props.members.slice(0, BACKLINE));

const cursor = ref(0);
const downs = ref(new Set<number>());
const targetIdx = ref(0);
const heroX = ref(0.03);
/** Point de mire. ⚠️ Distinct de `heroX` : à l'ouverture de la porte on recule pour
 *  montrer la salle, sinon le gardien reste hors champ au moment précis où il se révèle. */
const camX = ref(0.03);
const pv = ref(props.stage.maxPv);
const ghostPct = ref(100);
const lunging = ref(false);
const partyHurt = ref(false);
const hurtIdx = ref<number | null>(null);
const shake = ref('');
const hitVig = ref(0);
const doorOpen = ref(false);
const ended = ref(false);
const killCount = ref(0);

const pops = ref<{ id: number; x: number; y: number; text: string; kind: string }[]>([]);
const slashes = ref<{ id: number; x: number; y: number }[]>([]);
const sparks = ref<{ id: number; x: number; y: number; dx: number; dy: number }[]>([]);
const banner = ref<{ id: number; kind: string; main: string; sub: string } | null>(null);
let uid = 0;

let timer: ReturnType<typeof setTimeout> | undefined;
const fxTimers: ReturnType<typeof setTimeout>[] = [];
/** Tout timeout d'effet passe par ici → un seul endroit à purger au démontage. */
function later(fn: () => void, ms: number) {
  fxTimers.push(setTimeout(fn, ms));
}

const pvPct = computed(() =>
  props.stage.maxPv > 0 ? Math.max(0, Math.min(100, (pv.value / props.stage.maxPv) * 100)) : 0,
);

/**
 * La caméra centre le groupe, sans jamais montrer le vide au-delà des bords.
 *
 * ⚠️ LE DÉCALAGE EST EN POURCENTAGE DU TERRAIN, pas de la vue — un `translateX(%)` se
 * rapporte à la largeur de l'élément translaté, qui fait ici `CAM_W` écrans. Une première
 * version raisonnait en fractions de vue : le groupe dérivait hors champ au bout de
 * quelques rencontres, et le banc l'a montré du premier coup d'œil.
 */
const camPct = computed(() => {
  const want = 50 / CAM_W - camX.value * 100;
  const min = -(1 - 1 / CAM_W) * 100; // au-delà, on verrait le vide à droite
  return Math.max(min, Math.min(0, want));
});

/** Poussière de mana : figée par l'index, sinon elle sauterait à chaque rendu. */
function moteStyle(m: number) {
  const f = (x: number) => Math.abs(x - Math.floor(x));
  const a = f(Math.sin(m * 12.9898) * 43758.5453);
  const b = f(Math.sin(m * 78.233) * 12345.6789);
  return {
    left: (5 + a * 90).toFixed(1) + '%',
    top: (10 + b * 80).toFixed(1) + '%',
    animationDelay: (a * 6).toFixed(2) + 's',
    animationDuration: (5 + b * 6).toFixed(2) + 's',
  };
}

function allyStyle(k: number) {
  return { left: -18 - k * 15 + 'px', bottom: 2 + (k % 2) * 9 + 'px', opacity: 0.75 - k * 0.14 };
}

function say(kind: string, main: string, sub = '') {
  banner.value = { id: ++uid, kind, main, sub };
  later(() => {
    if (banner.value?.main === main) banner.value = null;
  }, 1400);
}

function burst(x: number, y: number) {
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const id = ++uid;
    sparks.value.push({ id, x, y, dx: Math.cos(a) * 34, dy: Math.sin(a) * 34 });
    later(() => (sparks.value = sparks.value.filter((s) => s.id !== id)), 620);
  }
}

function pop(x: number, y: number, text: string, kind: string) {
  const id = ++uid;
  pops.value.push({ id, x, y, text, kind });
  later(() => (pops.value = pops.value.filter((p) => p.id !== id)), 900);
}

/** Applique un battement : la scène ne décide rien, elle PEINT ce que la lib a écrit. */
function play(): void {
  const b = beats.value[cursor.value];
  if (!b) return stop();

  if (b.kind === 'door') {
    doorOpen.value = true;
    heroX.value = props.stage.doorX - 0.08;
    camX.value = (props.stage.doorX + (props.stage.foes.at(-1)?.x ?? props.stage.doorX)) / 2;
    say('door', '🚪 La porte s’ouvre', 'Le gardien attend');
    cursor.value++;
    timer = setTimeout(play, reduce ? 0 : beatMs.value + SLOW_DOOR);
    return;
  }

  const foe = props.stage.foes[b.foe];
  if (!foe) return stop();

  targetIdx.value = b.foe;
  heroX.value = Math.max(0.02, foe.x - (foe.boss ? 0.1 : 0.05));
  camX.value = foe.boss ? (heroX.value + foe.x) / 2 : heroX.value;
  if (b.kind === 'boss') say('boss', `${foe.emoji} ${foe.name}`, 'Le gardien de la faille');

  // Le coup : élan, arc de lame, puis l'issue de la rencontre.
  later(
    () => {
      lunging.value = true;
      later(() => (lunging.value = false), 240);
      const sid = ++uid;
      slashes.value.push({ id: sid, x: foe.x, y: foe.y });
      later(() => (slashes.value = slashes.value.filter((s) => s.id !== sid)), 320);

      if (b.down) {
        downs.value = new Set(downs.value).add(b.foe);
        if (!foe.boss) killCount.value++;
        burst(foe.x, foe.y);
        shake.value = foe.boss ? 'sh-l' : 'sh-m';
        later(() => (shake.value = ''), 300);
      } else {
        // Le groupe s'arrête ici : c'est LE monstre qui a eu le dernier mot.
        hurtIdx.value = b.foe;
        partyHurt.value = true;
        shake.value = 'sh-l';
        later(() => (shake.value = ''), 380);
      }

      // La barre glisse VERS la valeur lue — l'arrivée est exacte, le chemin est du rendu.
      if (props.stage.hasPv) {
        const lost = Math.max(0, b.pvBefore - b.pvAfter);
        if (lost > 0) {
          pop(foe.x, foe.y - 0.08, `−${lost}`, 'dmg');
          hitVig.value = Math.min(0.5, lost / Math.max(1, props.stage.maxPv));
          later(() => (hitVig.value = 0), 320);
        } else if (b.pvAfter > b.pvBefore) {
          pop(heroX.value, 0.4, `+${b.pvAfter - b.pvBefore}`, 'heal');
        }
        pv.value = b.pvAfter;
        later(() => (ghostPct.value = pvPct.value), 380);
      }
    },
    reduce ? 0 : 200,
  );

  cursor.value++;
  const extra = b.fatal ? SLOW_FATAL : b.kind === 'boss' ? SLOW_BOSS : 0;
  timer = setTimeout(play, reduce ? 0 : beatMs.value + extra);
}

/** Saute à l'état final — aussi le chemin de `prefers-reduced-motion`. */
function skip(): void {
  if (timer) clearTimeout(timer);
  for (const t of fxTimers) clearTimeout(t);
  fxTimers.length = 0;
  pops.value = [];
  slashes.value = [];
  sparks.value = [];
  banner.value = null;
  const done = new Set<number>();
  let k = 0;
  for (const [idx, f] of props.stage.foes.entries()) {
    if (f.down) {
      done.add(idx);
      if (!f.boss) k++;
    }
  }
  downs.value = done;
  killCount.value = k;
  doorOpen.value = props.stage.doorOpens;
  const last = beats.value.at(-1);
  if (last) {
    pv.value = last.pvAfter;
    heroX.value = props.stage.foes[Math.max(0, last.foe)]?.x ?? heroX.value;
    camX.value = heroX.value;
  }
  ghostPct.value = pvPct.value;
  cursor.value = beats.value.length;
  stop();
}

function stop(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
  ended.value = true;
}

function finish(): void {
  emit('done');
}

onMounted(() => {
  if (reduce) return skip();
  timer = setTimeout(play, 420);
});
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  for (const t of fxTimers) clearTimeout(t);
});
</script>

<style scoped lang="scss">
/* Teinte de la faille : hors du jaune de l'interface, du bleu du héros et du vert/rouge
   de l'effort. Le mana est la seule couleur froide vive de l'écran. */
.rift {
  --rift: #c07bff;
  --mana: #8ce0ff;
  position: relative;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background: radial-gradient(120% 90% at 50% 40%, #241a33 0%, #140f1e 55%, #0b0810 100%);
  color: var(--text);
}
.rift.sh-m {
  animation: shake 0.3s;
}
.rift.sh-l {
  animation: shakeL 0.38s;
}
@keyframes shake {
  25% {
    transform: translate(3px, -2px);
  }
  75% {
    transform: translate(-3px, 2px);
  }
}
@keyframes shakeL {
  20% {
    transform: translate(-6px, 3px);
  }
  50% {
    transform: translate(6px, -3px);
  }
  80% {
    transform: translate(-3px, 2px);
  }
}

.amb {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.glow {
  position: absolute;
  width: 46vmin;
  height: 46vmin;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.32;
}
.g1 {
  left: -10vmin;
  top: 18%;
  background: var(--rift);
  animation: breathe 5.5s ease-in-out infinite;
}
.g2 {
  right: -12vmin;
  bottom: 8%;
  background: var(--mana);
  opacity: 0.22;
  animation: breathe 7s ease-in-out infinite reverse;
}
@keyframes breathe {
  50% {
    opacity: 0.5;
    transform: scale(1.12);
  }
}
.mote {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--mana);
  opacity: 0.5;
  animation: drift linear infinite;
}
@keyframes drift {
  from {
    transform: translate(0, 12px);
    opacity: 0;
  }
  30% {
    opacity: 0.6;
  }
  to {
    transform: translate(18px, -60px);
    opacity: 0;
  }
}
.reduce .mote,
.reduce .glow {
  animation: none;
}

.view {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.field {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  transition: transform 0.55s cubic-bezier(0.3, 0.7, 0.3, 1);
}
.reduce .field {
  transition: none;
}
/* Le sol et la voûte : la faille s'enfonce, donc elle se resserre et s'assombrit. */
.ground {
  position: absolute;
  left: 0;
  right: 0;
  top: 40%;
  bottom: 0;
  background: linear-gradient(180deg, #4a3763 0%, #2c2040 30%, #140e1d 100%);
  box-shadow: inset 0 8px 22px rgba(0, 0, 0, 0.6);
}
/* La ligne d'horizon : une arête claire, c'est elle qui fait lire la profondeur. */
.ground::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(192, 123, 255, 0.55), transparent);
}
.ceil {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 40%;
  background: linear-gradient(0deg, transparent, #1a1226 70%);
}
.breach {
  position: absolute;
  left: 0;
  top: 8%;
  bottom: 8%;
  width: 3%;
  background: linear-gradient(90deg, var(--rift), transparent);
  opacity: 0.55;
  filter: blur(6px);
}

.door {
  position: absolute;
  top: 30%;
  height: 34%;
  width: 4.2%;
  transform: translateX(-50%);
  z-index: 6;
}
/* Chambranle : deux montants de pierre + un linteau. Sans eux, les battants se lisaient
   comme un couloir, pas comme une porte (vu au banc). */
.door::before,
.door::after {
  content: '';
  position: absolute;
  top: -10px;
  bottom: -6px;
  width: 7px;
  background: linear-gradient(180deg, #6b5640, #3a2f22);
  border-radius: 2px;
}
.door::before {
  left: -8px;
}
.door::after {
  right: -8px;
}
.leaf {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  background: linear-gradient(180deg, #4a3b2c, #2a2119);
  border: 1px solid #6b5640;
  transition: transform 0.7s ease;
}
.leaf.l {
  left: 0;
  border-right: none;
}
.leaf.r {
  right: 0;
  border-left: none;
}
.door.open .leaf.l {
  transform: translateX(-96%) rotateY(28deg);
}
.door.open .leaf.r {
  transform: translateX(96%) rotateY(-28deg);
}
.reduce .leaf {
  transition: none;
}
.lintel {
  position: absolute;
  left: -14px;
  right: -14px;
  top: -16px;
  height: 11px;
  background: linear-gradient(180deg, #7d6749, #4a3b2c);
  border-radius: 3px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}
.door-glow {
  position: absolute;
  inset: 0;
  background: var(--mana);
  opacity: 0;
  filter: blur(12px);
  transition: opacity 0.7s ease;
}
.door.open .door-glow {
  opacity: 0.45;
}

.sanctum {
  position: absolute;
  top: 26%;
  height: 46%;
  width: 26%;
  z-index: 3;
  opacity: 0.25;
  transition: opacity 0.8s ease;
}
.sanctum.lit {
  opacity: 1;
}
.altar {
  position: absolute;
  left: 42%;
  bottom: 14%;
  width: 26%;
  height: 16%;
  background: linear-gradient(180deg, #52426b, #2c2340);
  border-radius: 4px 4px 0 0;
  box-shadow: 0 0 24px rgba(192, 123, 255, 0.55);
}
.brazier {
  position: absolute;
  bottom: 16%;
  width: 9px;
  height: 20px;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--d3), #5a3a12);
  box-shadow: 0 0 16px rgba(255, 178, 63, 0.7);
  animation: flicker 1.8s ease-in-out infinite;
}
.b1 {
  left: 24%;
}
.b2 {
  right: 16%;
  animation-delay: 0.6s;
}
@keyframes flicker {
  50% {
    opacity: 0.65;
    transform: scaleY(0.88);
  }
}
.reduce .brazier {
  animation: none;
}

.foe {
  position: absolute;
  transform: translate(-50%, -50%) scale(var(--sc));
  transition:
    opacity 0.45s ease,
    filter 0.45s ease,
    transform 0.45s ease;
}
.foe .emo {
  font-size: 30px;
  line-height: 1;
  display: block;
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.6));
}
.foe.boss .emo {
  font-size: 40px;
}
.foe .aura {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 54px;
  height: 54px;
  margin: -27px 0 0 -27px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(192, 123, 255, 0.4), transparent 68%);
}
.foe.boss .aura {
  width: 92px;
  height: 92px;
  margin: -46px 0 0 -46px;
  background: radial-gradient(circle, rgba(255, 106, 69, 0.5), transparent 68%);
  animation: breathe 2.6s ease-in-out infinite;
}
.reduce .foe.boss .aura {
  animation: none;
}
.foe .shadow {
  position: absolute;
  left: 50%;
  top: 100%;
  width: 26px;
  height: 7px;
  margin-left: -13px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  filter: blur(2px);
}
.foe.target .emo {
  filter: drop-shadow(0 0 7px var(--accent));
}
.foe.hurt {
  animation: nudge 0.26s;
}
@keyframes nudge {
  50% {
    transform: translate(-42%, -50%) scale(var(--sc));
  }
}
.foe.dead {
  opacity: 0.22;
  filter: grayscale(1);
  transform: translate(-50%, -34%) scale(calc(var(--sc) * 0.8)) rotate(78deg);
}

.party {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 40;
  transition: left 0.55s cubic-bezier(0.3, 0.7, 0.3, 1);
}
.reduce .party {
  transition: none;
}
.party.lunge {
  animation: lunge 0.24s ease-out;
}
@keyframes lunge {
  50% {
    transform: translate(-30%, -50%);
  }
}
.party.hurt .hero-av,
.party.hurt .hero-emo {
  filter: drop-shadow(0 0 8px var(--d4));
}
.hero-av {
  width: 62px;
}
.hero-emo {
  font-size: 34px;
}
.party .shadow.big {
  position: absolute;
  left: 50%;
  top: 100%;
  width: 34px;
  height: 9px;
  margin-left: -17px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  filter: blur(3px);
}
.ally {
  position: absolute;
  font-size: 19px;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6));
}

.slash {
  position: absolute;
  width: 46px;
  height: 46px;
  margin: -23px 0 0 -23px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  border-color: var(--accent) transparent transparent var(--accent);
  animation: slash 0.3s ease-out forwards;
  z-index: 50;
}
@keyframes slash {
  from {
    transform: rotate(-40deg) scale(0.5);
    opacity: 1;
  }
  to {
    transform: rotate(70deg) scale(1.25);
    opacity: 0;
  }
}
.spark {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--mana);
  animation: spark 0.6s ease-out forwards;
  z-index: 50;
}
@keyframes spark {
  to {
    transform: translate(var(--dx), var(--dy));
    opacity: 0;
  }
}
.pop {
  position: absolute;
  font-family: 'Oswald', sans-serif;
  font-size: 19px;
  font-weight: 600;
  animation: pop 0.9s ease-out forwards;
  z-index: 60;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.7);
}
.pop.pop-dmg {
  color: var(--d4);
}
.pop.pop-heal {
  color: var(--d1);
}
@keyframes pop {
  to {
    transform: translateY(-34px);
    opacity: 0;
  }
}

.vig {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(120% 90% at 50% 50%, transparent 45%, rgba(255, 60, 40, 0.55));
  transition: opacity 0.3s ease;
  z-index: 70;
}

.hud {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  z-index: 80;
}
.hud-l {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.chip {
  font-size: 11.5px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--line);
  color: var(--text);
}
.skip {
  min-height: 44px;
  font-size: 12.5px;
  color: var(--dim);
}

.pvbar {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 14px;
  height: 16px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--line);
  overflow: hidden;
  z-index: 80;
}
.pvbar i {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  display: block;
}
.pvbar .ghost {
  background: rgba(255, 106, 69, 0.45);
  transition: width 0.5s ease 0.15s;
}
.pvbar .fill {
  background: var(--d1);
  transition: width 0.35s ease;
}
.pvbar .fill.low {
  background: var(--d4);
}
.pvtxt {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-family: 'Oswald', sans-serif;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.banner {
  position: absolute;
  left: 0;
  right: 0;
  top: 22%;
  text-align: center;
  z-index: 85;
  pointer-events: none;
}
.ban-main {
  font-size: 26px;
  letter-spacing: 0.04em;
  color: var(--mana);
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
}
.banner.ban-boss .ban-main {
  color: var(--d4);
}
.ban-sub {
  font-size: 12.5px;
  color: var(--dim);
}
.ban-enter-active,
.ban-leave-active {
  transition: all 0.3s ease;
}
.ban-enter-from,
.ban-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.end {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--veil);
  z-index: 90;
  padding: 16px;
}
.end-card {
  text-align: center;
  display: grid;
  gap: 10px;
  justify-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 20px 18px;
  max-width: 330px;
}
.end-emo {
  font-size: 46px;
}
.end-title {
  font-size: 22px;
}
.end-sub {
  font-size: 12.5px;
  color: var(--dim);
  line-height: 1.45;
}
/* ⚠️ C'est le bouton qui FERME le plateau : il ne peut pas être sous la cible mobile.
   Quasar le rendait à 36 px — mesuré au banc, invisible dans le code. */
.end-cta {
  min-height: 44px;
  padding: 0 18px;
}
</style>
