<template>
  <div
    class="wb"
    :class="[shake, 'f-' + faction, { reduce }]"
    :style="{ '--fc': FACTION_COLOR[faction] }"
  >
    <!-- Le décor : un ciel d'orage, des collines, la plaine où l'on coupe la route. -->
    <div class="sky" aria-hidden="true">
      <!-- Là-bas, d'où ils viennent : la faille effondrée luit encore à l'horizon. -->
      <span class="hill h1" /><span class="hill h2" />
      <span class="rift-glow" />
      <span v-for="m in MOTES" :key="m" class="mote" :style="moteStyle(m)" />
    </div>
    <div class="plain" aria-hidden="true">
      <span class="road" />
    </div>

    <!-- 🐺 LA COLONNE — de vrais petits corps, du premier rang au champion sous sa bannière.
         Elle ARRIVE de la droite (elle vient de la faille), puis charge. -->
    <div
      class="army"
      :class="{ marching: phase === 'approach' || phase === 'march', passing: phase === 'march' }"
      :style="{ transform: `translateX(${armyShift * 100}%)` }"
    >
      <div
        v-for="(b, i) in stage.bodies"
        :key="i"
        class="body"
        :class="{
          dead: downs.has(i),
          champ: b.champion,
          striking: strikers.has(i),
          flee: fleeing && !downs.has(i),
        }"
        :style="{
          left: b.x * 100 + '%',
          top: b.y * 100 + '%',
          zIndex: 10 + Math.round(b.y * 100),
          animationDelay: (i % 7) * 0.09 + 's',
        }"
      >
        <span class="shadow" />
        <span v-if="b.champion" class="standard" :class="{ fallen: fleeing }">
          <i class="pole" /><i class="flag">{{ factionEmoji }}</i>
        </span>
        <img
          v-if="artOf(b.species)"
          :src="artOf(b.species)!"
          :alt="b.species"
          class="art"
          draggable="false"
          @error="failed.add(b.species)"
        />
        <span v-else class="emo">{{ b.emoji }}</span>
      </div>
    </div>

    <!-- ⚔️ NOTRE LIGNE — le héros (son avatar) et les champions (leur portrait). -->
    <div
      v-for="(m, k) in shownCast"
      :key="'m' + k"
      class="member"
      :class="{
        lunge: lunging === k,
        hurt: partyHurt,
        fallen: wiped,
        hero: m.kind === 'hero',
        charging: phase === 'charge',
      }"
      :style="{
        left: (WARBAND_STAGE.allies[k]!.x + lineShift) * 100 + '%',
        top: WARBAND_STAGE.allies[k]!.y * 100 + '%',
        zIndex: 10 + Math.round(WARBAND_STAGE.allies[k]!.y * 100),
      }"
    >
      <span class="shadow big" />
      <div v-if="m.kind === 'hero' && hero" class="hero-av">
        <AventureAvatar :profile="hero.profile" :equipped="hero.equipped" />
      </div>
      <div v-else class="champ">
        <ChampionPortrait :champion-id="m.championId">{{ m.emoji }}</ChampionPortrait>
      </div>
    </div>

    <!-- Projectiles, lames, poussière, nombres. -->
    <span
      v-for="a in arrows"
      :key="a.id"
      class="arrow"
      :class="a.side"
      :style="{
        '--x0': a.x0 * 100 + '%',
        '--y0': a.y0 * 100 + '%',
        '--x1': a.x1 * 100 + '%',
        '--y1': a.y1 * 100 + '%',
        animationDelay: a.delay + 'ms',
      }"
      ><i :style="{ animationDelay: a.delay + 'ms' }"
    /></span>
    <span
      v-for="s in slashes"
      :key="s.id"
      class="slash"
      :style="{ left: s.x * 100 + '%', top: s.y * 100 + '%' }"
    />
    <span
      v-for="p in dust"
      :key="p.id"
      class="dust"
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

    <div class="vig" :style="{ opacity: hitVig }" aria-hidden="true" />
    <div class="flash" :class="flash" aria-hidden="true" />

    <!-- HUD : qui l'on croise, et le bouton pour abréger. -->
    <div class="hud">
      <div class="hud-l">
        <span class="chip fc">{{ factionEmoji }} {{ factionLabel }}</span>
        <span class="chip">⚔️ {{ stage.effectif }} en marche</span>
      </div>
      <q-btn flat dense no-caps class="skip" label="⏩ Passer" @click="skip" />
    </div>
    <div class="roster">
      <span v-for="(g, i) in stage.groups" :key="i" class="rchip" :class="{ champ: g.champion }">
        {{ g.champion ? '👑' : '' }}{{ g.emoji }} ×{{ g.count }}
      </span>
    </div>

    <!-- ⏱️ Rejeu en retard : l’heure de la bataille, au-dessus des barres (en haut elle
         chevauchait la ligne d’effectifs à 344/390 px, mesuré au banc). -->
    <div v-if="when" class="when">{{ when }}</div>
    <!-- Les deux camps : les VRAIS PV du combat, temps par temps. -->
    <div class="bars">
      <div class="bar ours">
        <div class="bar-lab">Ton groupe</div>
        <div class="track">
          <i class="ghost" :style="{ width: ourGhost + '%' }" />
          <i class="fill" :class="{ low: ourPct <= 30 }" :style="{ width: ourPct + '%' }" />
        </div>
      </div>
      <div class="bar theirs">
        <div class="bar-lab">La colonne</div>
        <div class="track">
          <i class="ghost" :style="{ width: armyGhost + '%' }" />
          <i class="fill" :style="{ width: armyPct + '%' }" />
        </div>
      </div>
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
        <div class="end-emo">{{ stage.win ? '🏳️' : '💀' }}</div>
        <div class="end-title font-display">
          {{ stage.win ? 'Bande rompue' : 'La bande passe' }}
        </div>
        <div class="end-sub">
          {{
            stage.win
              ? 'Le prochain siège ne sera pas renforcé.'
              : 'Elle poursuit sa marche vers ta base.'
          }}
        </div>
        <q-btn
          unelevated
          no-caps
          color="primary"
          text-color="dark"
          class="end-cta"
          label="Voir le rapport"
          @click="emit('done')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// ⚔️ LA BATAILLE RANGÉE — plateau plein écran d'une interception.
//
// ⚠️ Il ne calcule AUCUN combat : il rejoue `buildWarbandStage`, elle-même dérivée de ce que
// `resolveInterception` a tranché (les PV des deux camps temps par temps sont ceux du LOG).
// L'issue est scellée avant la première image : la volée d'approche et la marche sont du
// DÉCOR, les chiffres qui s'affichent sont ceux du rapport.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import type { Equipped } from '@/lib/items';
import { WARBAND_STAGE, type WarbandStage } from '@/lib/warbandStage';
import type { RiftCastMember } from '@/lib/riftStage';
import { FACTION_EMOJI, FACTION_LABEL, type RaidFaction } from '@/lib/raid';
import { speciesArt } from '@/data/monsterArt';
import AventureAvatar from '@/components/AventureAvatar.vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';

const props = defineProps<{
  stage: WarbandStage;
  faction: RaidFaction;
  hero: { profile: 'puissant' | 'agile' | 'polyvalent'; equipped: Equipped } | null;
  cast: RiftCastMember[];
  /** ⏱️ Heure de la bataille quand le rejeu arrive en retard (`replayWhenLabel`). */
  when?: string | null;
}>();
const emit = defineEmits<{ done: [] }>();

/** La couleur des bannières : une par faction, hors de l'accent (qui dit « à faire »). */
const FACTION_COLOR: Record<RaidFaction, string> = {
  bandits: '#c8553d',
  betes: '#7a9a3a',
  mortsvivants: '#8a7bc8',
};
const factionLabel = computed(() => FACTION_LABEL[props.faction]);
const factionEmoji = computed(() => FACTION_EMOJI[props.faction]);
const shownCast = computed(() => props.cast.slice(0, props.stage.partySize));

// ── Rythme (ms) ──
const APPROACH_MS = 1700;
const VOLLEY_MS = 1400;
const CHARGE_MS = 850;
/** Un temps de mêlée. ⚠️ Plus LENT quand le combat n'en compte que peu : une victoire
 *  écrasante se résume à deux ou trois temps, et l'expédier en 2 s volerait la bataille. */
const stepMs = computed(() => (props.stage.steps.length <= 3 ? 1700 : 1150));
const FATAL_MS = 900;
const OUTCOME_MS = 2400;
const MOTES = 10;

const reduce =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

/** Illustration d'une espèce (celle de son gardien à défaut), ou l'emoji si elle manque. */
const failed = reactive(new Set<string>());
function artOf(species: string): string | null {
  return failed.has(species) ? null : speciesArt(species);
}

type Phase = 'approach' | 'volley' | 'charge' | 'melee' | 'rout' | 'march' | 'end';
const phase = ref<Phase>('approach');
/** La colonne, en fraction de la largeur : elle part hors champ à droite. */
const armyShift = ref(0.62);
/** Notre ligne avance à la charge. */
const lineShift = ref(0);
const downs = ref(new Set<number>());
const strikers = ref(new Set<number>());
const fleeing = ref(false);
const wiped = ref(false);
const lunging = ref(-1);
const partyHurt = ref(false);
const ourPv = ref(props.stage.maxPv);
const armyPv = ref(props.stage.armyPv);
const ourGhost = ref(100);
const armyGhost = ref(100);
const hitVig = ref(0);
const shake = ref('');
const flash = ref('');
const ended = ref(false);
const banner = ref<{ id: number; kind: string; main: string; sub: string } | null>(null);
const arrows = ref<
  {
    id: number;
    side: 'foe' | 'ally';
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    delay: number;
  }[]
>([]);
const slashes = ref<{ id: number; x: number; y: number }[]>([]);
const dust = ref<{ id: number; x: number; y: number; dx: number; dy: number }[]>([]);
const pops = ref<{ id: number; x: number; y: number; text: string; kind: string }[]>([]);
let uid = 0;

const pct = (v: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0);
const ourPct = computed(() => pct(ourPv.value, props.stage.maxPv));
const armyPct = computed(() => pct(armyPv.value, props.stage.armyPv));

const timers: ReturnType<typeof setTimeout>[] = [];
function later(fn: () => void, ms: number): void {
  timers.push(setTimeout(fn, reduce ? 0 : ms));
}
function clearAll(): void {
  timers.forEach(clearTimeout);
  timers.length = 0;
}

/** Poussière qui dérive : figée par l'index, sinon elle sauterait à chaque rendu. */
function moteStyle(m: number) {
  const f = (x: number) => Math.abs(x - Math.floor(x));
  const a = f(Math.sin(m * 12.9898) * 43758.5453);
  const b = f(Math.sin(m * 78.233) * 12345.6789);
  return {
    left: (a * 100).toFixed(1) + '%',
    top: (40 + b * 50).toFixed(1) + '%',
    animationDelay: (a * 5).toFixed(2) + 's',
    animationDuration: (6 + b * 5).toFixed(2) + 's',
  };
}

function say(kind: string, main: string, sub = '', ms = 1500): void {
  const id = ++uid;
  banner.value = { id, kind, main, sub };
  later(() => {
    if (banner.value?.id === id) banner.value = null;
  }, ms);
}
function pop(x: number, y: number, text: string, kind: string): void {
  const id = ++uid;
  pops.value.push({ id, x, y, text, kind });
  later(() => (pops.value = pops.value.filter((p) => p.id !== id)), 950);
}
function pulse(target: typeof shake, value: string, ms: number): void {
  target.value = value;
  later(() => {
    if (target.value === value) target.value = '';
  }, ms);
}
function puff(x: number, y: number, n = 6, spread = 30): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const id = ++uid;
    dust.value.push({ id, x, y, dx: Math.cos(a) * spread, dy: Math.sin(a) * spread * 0.5 - 8 });
    later(() => (dust.value = dust.value.filter((d) => d.id !== id)), 700);
  }
}
function slash(x: number, y: number): void {
  const id = ++uid;
  slashes.value.push({ id, x, y });
  later(() => (slashes.value = slashes.value.filter((s) => s.id !== id)), 320);
}
function shoot(
  side: 'foe' | 'ally',
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  delay: number,
) {
  const id = ++uid;
  arrows.value.push({ id, side, x0, y0, x1, y1, delay });
  later(() => (arrows.value = arrows.value.filter((a) => a.id !== id)), delay + 800);
}

/** Position À L'ÉCRAN d'un corps (la colonne est décalée par `armyShift`). */
function bodyAt(i: number): { x: number; y: number } {
  const b = props.stage.bodies[i]!;
  return { x: b.x + armyShift.value, y: b.y };
}
function allyAt(k: number): { x: number; y: number } {
  const s = WARBAND_STAGE.allies[k] ?? WARBAND_STAGE.allies[0];
  return { x: s.x + lineShift.value, y: s.y };
}
/** Les corps debout du premier rang — ceux qui sont au contact. */
function frontline(n: number): number[] {
  return props.stage.bodies
    .map((b, i) => ({ b, i }))
    .filter(({ b, i }) => !downs.value.has(i) && !b.champion)
    .sort((p, q) => p.b.x - q.b.x)
    .slice(0, n)
    .map(({ i }) => i);
}
function rangedAlive(): number[] {
  return props.stage.bodies
    .map((b, i) => ({ b, i }))
    .filter(({ b, i }) => b.ranged && !downs.value.has(i))
    .map(({ i }) => i);
}

// ── Le déroulé ──
function start(): void {
  say(
    'march',
    `${factionEmoji.value} Une bande sort de la faille`,
    `${props.stage.effectif} combattants en marche`,
  );
  // La colonne entre dans le champ : la transition CSS porte la marche.
  later(() => (armyShift.value = 0), 60);
  later(volley, APPROACH_MS);
}

/** 🏹 La volée d'approche : les tireurs des deux camps. Décor — aucun PV ne bouge ici. */
function volley(): void {
  phase.value = 'volley';
  const archers = rangedAlive().slice(0, 8);
  archers.forEach((i, j) => {
    const from = bodyAt(i);
    const to = allyAt(j % shownCast.value.length);
    shoot('foe', from.x, from.y - 0.04, to.x, to.y - 0.03, j * 90);
  });
  shownCast.value.forEach((_, k) => {
    const from = allyAt(k);
    const f = frontline(6);
    const tgt = f.length ? bodyAt(f[k % f.length]!) : { x: 0.6, y: 0.6 };
    shoot('ally', from.x, from.y - 0.04, tgt.x, tgt.y - 0.03, 260 + k * 110);
  });
  say('volley', '🏹 Premières volées', '');
  later(charge, VOLLEY_MS);
}

/** ⚔️ La charge : les deux lignes se jettent l'une sur l'autre. */
function charge(): void {
  phase.value = 'charge';
  lineShift.value = 0.13;
  armyShift.value = -0.06;
  say('charge', '⚔️ Chargez !', '', 1000);
  later(() => {
    pulse(shake, 'sh-l', 380);
    const mid = { x: 0.45, y: 0.64 };
    puff(mid.x, mid.y, 10, 46);
    puff(mid.x, mid.y - 0.12, 6, 30);
    puff(mid.x, mid.y + 0.12, 6, 30);
  }, 420);
  later(() => {
    phase.value = 'melee';
    playStep(0);
  }, CHARGE_MS);
}

/** Un temps du combat : on frappe, puis la colonne riposte — les chiffres sont ceux du log. */
function playStep(i: number): void {
  const st = props.stage.steps[i];
  if (!st) return outcome();
  const before = i > 0 ? props.stage.steps[i - 1]! : null;
  const k = Math.min(st.striker, shownCast.value.length - 1);
  const front = frontline(3);

  // 1. Notre coup.
  if (st.groupTurns > 0) {
    // Celui qui mène l'assaut d'abord, puis toute la ligne, en vague — c'est une MÊLÉE.
    const order = [k, ...shownCast.value.map((_, j) => j).filter((j) => j !== k)];
    order.forEach((j, n) => later(() => (lunging.value = j), n * 110));
    later(() => (lunging.value = -1), order.length * 110 + 200);
    front.forEach((fi, j) => later(() => slash(bodyAt(fi).x, bodyAt(fi).y - 0.04), j * 90));
  }
  later(() => {
    const at = front.length ? bodyAt(front[0]!) : { x: 0.6, y: 0.6 };
    if (st.dealt > 0) {
      pop(at.x, at.y - 0.12, `−${st.dealt}`, st.crit ? 'crit' : 'dmg');
      if (st.crit) {
        pop(at.x, at.y - 0.2, 'CRITIQUE', 'crit');
        pulse(flash, 'white', 160);
      }
    } else if (st.groupTurns > 0) pop(at.x, at.y - 0.12, 'Paré', 'miss');
    armyPv.value = st.bossPv;
    later(() => (armyGhost.value = armyPct.value), 420);
    // Les corps de CE temps tombent.
    const nd = new Set(downs.value);
    props.stage.bodies.forEach((b, bi) => {
      if (b.fallStep === i && !nd.has(bi)) {
        nd.add(bi);
        const p = bodyAt(bi);
        puff(p.x, p.y, 5, 22);
      }
    });
    if (nd.size !== downs.value.size) pulse(shake, 'sh-m', 280);
    downs.value = nd;
  }, 260);

  // 2. La riposte.
  later(() => {
    if (st.bossTurns > 0) {
      strikers.value = new Set(frontline(4));
      later(() => (strikers.value = new Set()), 300);
      rangedAlive()
        .slice(0, 3)
        .forEach((ri, j) => {
          const from = bodyAt(ri);
          const to = allyAt(j % shownCast.value.length);
          shoot('foe', from.x, from.y - 0.04, to.x, to.y - 0.03, j * 70);
        });
    }
  }, 560);
  later(() => {
    const lost = Math.max(0, (before?.pv ?? props.stage.maxPv) - st.pv);
    const at = allyAt(0);
    if (st.taken > 0 && lost > 0) {
      partyHurt.value = true;
      later(() => (partyHurt.value = false), 260);
      pop(at.x, at.y - 0.16, `−${lost}`, 'dmg');
      const part = lost / Math.max(1, props.stage.maxPv);
      hitVig.value = Math.min(0.55, part * 1.6);
      later(() => (hitVig.value = 0), 360);
      if (part > 0.12) pulse(flash, 'red', 180);
    } else if (st.bossTurns > 0) pop(at.x, at.y - 0.16, 'Esquivé', 'miss');
    ourPv.value = st.pv;
    later(() => (ourGhost.value = ourPct.value), 420);
  }, 820);

  const last = i === props.stage.steps.length - 1;
  later(() => playStep(i + 1), stepMs.value + (last ? FATAL_MS : 0));
}

/** L'issue : la colonne rompt et fuit — ou elle passe sur nous et reprend sa marche. */
function outcome(): void {
  if (props.stage.win) {
    phase.value = 'rout';
    fleeing.value = true;
    pulse(flash, 'white', 220);
    say(
      'win',
      '🏳️ Bande rompue',
      'Les survivants fuient — le siège ne sera pas renforcé',
      OUTCOME_MS,
    );
  } else {
    wiped.value = true;
    pulse(shake, 'sh-l', 400);
    later(() => {
      phase.value = 'march';
      armyShift.value = -1.15;
    }, 700);
    say('lose', '💀 La bande passe', 'Elle poursuit sa marche vers ta base', OUTCOME_MS);
  }
  later(finish, OUTCOME_MS);
}

function finish(): void {
  phase.value = 'end';
  ended.value = true;
}

/** ⏩ L'état FINAL, sans animation : l'issue ne change pas, on saute à la fin. */
function skip(): void {
  clearAll();
  const last = props.stage.steps[props.stage.steps.length - 1];
  ourPv.value = last?.pv ?? props.stage.maxPv;
  armyPv.value = last?.bossPv ?? props.stage.armyPv;
  ourGhost.value = ourPct.value;
  armyGhost.value = armyPct.value;
  downs.value = new Set(
    props.stage.bodies.map((b, i) => (b.fallStep >= 0 ? i : -1)).filter((i) => i >= 0),
  );
  arrows.value = [];
  slashes.value = [];
  dust.value = [];
  pops.value = [];
  banner.value = null;
  lineShift.value = 0.13;
  if (props.stage.win) {
    armyShift.value = -0.06;
    fleeing.value = true;
  } else {
    wiped.value = true;
    armyShift.value = -1.15;
  }
  finish();
}

onMounted(() => (reduce ? skip() : start()));
onBeforeUnmount(clearAll);
</script>

<style scoped lang="scss">
.wb {
  --fc: #c8553d; /* repli ; la faction le remplace (style en ligne) */
  position: relative;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background: linear-gradient(180deg, #2b2330 0%, #4a3a36 30%, #6b5440 37%, #3d3322 38%);
  color: var(--text);
}
.wb.sh-m {
  animation: shake 0.28s;
}
.wb.sh-l {
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
    transform: translate(-7px, 3px);
  }
  50% {
    transform: translate(6px, -3px);
  }
  80% {
    transform: translate(-3px, 2px);
  }
}

/* ── Décor ── */
.sky {
  position: absolute;
  inset: 0 0 61% 0;
  pointer-events: none;
}
.rift-glow {
  position: absolute;
  right: -12%;
  bottom: 4%;
  width: 55%;
  height: 60%;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--fc) 70%, white 10%),
    color-mix(in srgb, var(--fc) 35%, transparent) 45%,
    transparent 75%
  );
  opacity: 0.4;
  mix-blend-mode: screen;
  animation: riftPulse 3.2s ease-in-out infinite alternate;
}
.reduce .rift-glow {
  animation: none;
}
@keyframes riftPulse {
  to {
    opacity: 0.85;
    transform: scale(1.06);
  }
}
.hill {
  position: absolute;
  bottom: -2px;
  border-radius: 50% 50% 0 0;
  background: #2c2520;
}
.hill.h1 {
  left: -10%;
  width: 70%;
  height: 38%;
  opacity: 0.8;
}
.hill.h2 {
  right: -15%;
  width: 80%;
  height: 52%;
  background: #241e1a;
}
.plain {
  position: absolute;
  inset: 38% 0 0 0;
  pointer-events: none;
  background:
    radial-gradient(60% 30% at 30% 30%, rgba(120, 140, 70, 0.25), transparent 70%),
    radial-gradient(50% 30% at 75% 70%, rgba(90, 110, 55, 0.3), transparent 70%),
    linear-gradient(180deg, #4d5a2e 0%, #3c4724 55%, #2a321a 100%);
}
.road {
  position: absolute;
  left: -5%;
  right: -5%;
  top: 38%;
  height: 26%;
  background: linear-gradient(
    180deg,
    transparent,
    rgba(120, 95, 60, 0.45) 30%,
    rgba(120, 95, 60, 0.45) 70%,
    transparent
  );
}
.mote {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(230, 210, 170, 0.35);
  animation: drift 8s linear infinite;
}
.reduce .mote {
  animation: none;
}
@keyframes drift {
  from {
    transform: translate(0, 0);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  to {
    transform: translate(-80px, -20px);
    opacity: 0;
  }
}

/* ── La colonne ── */
.army {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition: transform 1.6s linear;
}
.army.passing {
  transition: transform 3s ease-in;
}
.reduce .army {
  transition: none;
}
.body {
  position: absolute;
  transform: translate(-50%, -100%);
  transition:
    opacity 0.5s,
    filter 0.5s,
    transform 0.5s;
}
.army.marching .body .art,
.army.marching .body .emo {
  animation: bob 0.42s ease-in-out infinite alternate;
  animation-delay: inherit;
}
@keyframes bob {
  to {
    transform: translateY(-3px);
  }
}
.body .art {
  display: block;
  width: clamp(30px, 10.5vw, 54px);
  height: clamp(30px, 10.5vw, 54px);
  object-fit: contain;
  user-select: none;
  filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.3)) drop-shadow(0 3px 4px rgba(0, 0, 0, 0.6));
}
.body .emo {
  display: block;
  font-size: clamp(22px, 7.5vw, 36px);
  line-height: 1;
  filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.6));
}
.body.champ .art {
  width: clamp(46px, 16vw, 82px);
  height: clamp(46px, 16vw, 82px);
  filter: drop-shadow(0 0 6px var(--fc)) drop-shadow(0 3px 5px rgba(0, 0, 0, 0.7));
}
.body.champ .emo {
  font-size: clamp(32px, 11vw, 52px);
}
.body .shadow {
  position: absolute;
  left: 50%;
  bottom: -3px;
  width: 60%;
  height: 6px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  filter: blur(2px);
}
.body.striking {
  animation: foeStrike 0.3s ease-out;
}
@keyframes foeStrike {
  50% {
    transform: translate(-78%, -100%);
  }
}
.body.dead {
  opacity: 0.35;
  filter: grayscale(1) brightness(0.7);
  transform: translate(-50%, -40%) rotate(80deg);
}
.body.flee {
  transform: translate(260%, -100%) scaleX(-1);
  opacity: 0;
  transition:
    transform 2s ease-in,
    opacity 2s ease-in;
}
.reduce .body.flee {
  transition: none;
}
.standard {
  position: absolute;
  left: 60%;
  bottom: 40%;
  width: 0;
  height: 0;
  transform-origin: bottom center;
  transition: transform 0.8s ease-in;
}
.standard .pole {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 3px;
  height: clamp(54px, 18vw, 96px);
  background: #6b4e2e;
  border-radius: 2px;
}
.standard .flag {
  position: absolute;
  left: 3px;
  bottom: calc(clamp(54px, 18vw, 96px) - 26px);
  width: 34px;
  height: 24px;
  display: grid;
  place-items: center;
  font-style: normal;
  font-size: 14px;
  background: var(--fc);
  clip-path: polygon(0 0, 100% 0, 80% 50%, 100% 100%, 0 100%);
  animation: wave 1.2s ease-in-out infinite alternate;
  transform-origin: left center;
}
.reduce .standard .flag {
  animation: none;
}
@keyframes wave {
  to {
    transform: skewY(-6deg) scaleX(0.92);
  }
}
.standard.fallen {
  transform: rotate(-80deg);
}

/* ── Notre ligne ── */
.member {
  position: absolute;
  transform: translate(-50%, -100%);
  transition:
    left 0.8s cubic-bezier(0.4, 0, 0.3, 1),
    opacity 0.5s,
    filter 0.5s,
    transform 0.5s;
}
.reduce .member {
  transition: none;
}
.member.lunge {
  animation: lunge 0.26s ease-out;
}
@keyframes lunge {
  50% {
    transform: translate(-15%, -100%);
  }
}
.member.hurt .hero-av,
.member.hurt .champ {
  filter: drop-shadow(0 0 8px var(--d4));
}
.member.fallen {
  opacity: 0.35;
  filter: grayscale(1);
  transform: translate(-50%, -40%) rotate(-75deg);
}
.hero-av {
  width: clamp(48px, 15vw, 70px);
}
.champ {
  font-size: clamp(26px, 9vw, 40px);
  line-height: 1;
  padding: 3px;
  border-radius: 26%;
  background: rgba(20, 15, 10, 0.7);
  box-shadow:
    0 0 0 2px var(--accent),
    0 4px 10px rgba(0, 0, 0, 0.6);
}
.member .shadow.big {
  position: absolute;
  left: 50%;
  bottom: -4px;
  width: 36px;
  height: 8px;
  margin-left: -18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  filter: blur(3px);
}

/* ── Projectiles et effets ── */
.arrow {
  position: absolute;
  left: var(--x0);
  top: var(--y0);
  width: 0;
  height: 0;
  z-index: 150;
  opacity: 0;
  animation: fly 0.62s linear forwards;
}
.arrow i {
  position: absolute;
  width: 22px;
  height: 3px;
  margin: -1.5px 0 0 -11px;
  box-shadow: 0 0 4px rgba(255, 240, 200, 0.7);
  background: linear-gradient(90deg, #d8c7a0, #f3eee6 80%, var(--accent));
  border-radius: 2px;
  animation: arc 0.62s ease-in-out forwards;
}
.arrow.foe i {
  transform: scaleX(-1);
  background: linear-gradient(90deg, var(--fc), #f3eee6 20%, #d8c7a0);
}
@keyframes fly {
  0% {
    left: var(--x0);
    top: var(--y0);
    opacity: 1;
  }
  95% {
    opacity: 1;
  }
  100% {
    left: var(--x1);
    top: var(--y1);
    opacity: 0;
  }
}
@keyframes arc {
  50% {
    translate: 0 -34px;
  }
}
.slash {
  position: absolute;
  width: 42px;
  height: 42px;
  margin: -21px 0 0 -21px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  border-color: var(--accent) transparent transparent var(--accent);
  animation: slash 0.3s ease-out forwards;
  z-index: 160;
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
.dust {
  position: absolute;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: 50%;
  background: rgba(200, 175, 130, 0.55);
  filter: blur(1px);
  animation: dust 0.7s ease-out forwards;
  z-index: 140;
}
@keyframes dust {
  to {
    transform: translate(var(--dx), var(--dy)) scale(2.2);
    opacity: 0;
  }
}
.pop {
  position: absolute;
  transform: translateX(-50%);
  font-family: 'Oswald', sans-serif;
  font-size: 19px;
  font-weight: 600;
  animation: pop 0.95s ease-out forwards;
  z-index: 170;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.75);
  white-space: nowrap;
}
.pop-dmg {
  color: var(--d4);
}
.pop-crit {
  color: var(--accent);
  font-size: 22px;
}
.pop-miss {
  color: var(--dim);
  font-size: 15px;
}
@keyframes pop {
  to {
    translate: 0 -34px;
    opacity: 0;
  }
}
.vig {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(120% 90% at 50% 50%, transparent 45%, rgba(255, 60, 40, 0.55));
  transition: opacity 0.3s ease;
  z-index: 180;
}
.flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  z-index: 185;
}
.flash.white {
  background: rgba(255, 255, 255, 0.5);
  animation: flash 0.22s ease-out;
}
.flash.red {
  background: rgba(255, 70, 50, 0.35);
  animation: flash 0.22s ease-out;
}
@keyframes flash {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/* ── HUD ── */
.hud {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 0;
  z-index: 200;
}
.when {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 52px;
  z-index: 200;
  text-align: center;
  font-size: 11.5px;
  color: var(--accent);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}
.hud-l {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}
.chip {
  font-size: 11.5px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid var(--line);
  color: var(--text);
  white-space: nowrap;
}
.chip.fc {
  border-color: var(--fc);
}
.skip {
  min-height: 44px;
  font-size: 12.5px;
  color: var(--dim);
  flex-shrink: 0;
}
.roster {
  position: absolute;
  top: 58px;
  left: 12px;
  right: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  z-index: 200;
}
.rchip {
  font-size: 11.5px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.4);
  color: var(--text);
  white-space: nowrap;
}
.rchip.champ {
  box-shadow: 0 0 0 1px var(--fc);
}
.bars {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 14px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  z-index: 200;
}
.bar-lab {
  font-size: 11px;
  color: var(--dim);
  margin-bottom: 3px;
}
.theirs .bar-lab {
  text-align: right;
}
.track {
  position: relative;
  height: 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--line);
  overflow: hidden;
}
.track i {
  position: absolute;
  top: 0;
  bottom: 0;
  display: block;
}
.ours .track i {
  left: 0;
}
.theirs .track i {
  right: 0;
}
.track .ghost {
  background: rgba(255, 106, 69, 0.45);
  transition: width 0.5s ease 0.15s;
}
.ours .fill {
  background: var(--d1);
  transition: width 0.35s ease;
}
.ours .fill.low {
  background: var(--d4);
}
.theirs .fill {
  background: var(--fc);
  transition: width 0.35s ease;
}

/* ── Bannières et fin ── */
.banner {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 26%;
  text-align: center;
  z-index: 210;
  pointer-events: none;
}
.ban-main {
  font-size: clamp(22px, 7vw, 34px);
  text-shadow: 0 3px 10px rgba(0, 0, 0, 0.8);
}
.ban-sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8);
}
.ban-win .ban-main {
  color: var(--accent);
}
.ban-lose .ban-main {
  color: var(--d4);
}
.ban-enter-active,
.ban-leave-active {
  transition:
    opacity 0.25s,
    transform 0.25s;
}
.ban-enter-from {
  opacity: 0;
  transform: scale(1.3);
}
.ban-leave-to {
  opacity: 0;
}
.end {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
  z-index: 250;
}
.end-card {
  width: min(100%, 360px);
  text-align: center;
  padding: 20px 18px;
  border-radius: 18px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.end-emo {
  font-size: 44px;
}
.end-title {
  font-size: 26px;
  margin-top: 4px;
}
.end-sub {
  font-size: 13.5px;
  color: var(--dim);
  margin: 6px 0 16px;
}
.end-cta {
  min-height: 44px;
  width: 100%;
}
</style>
