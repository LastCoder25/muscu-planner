<template>
  <div class="rift" :class="[shake, { reduce }]" :style="{ '--rift': rankColor }">
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
        <!-- L'entrée : le portail d'où le groupe est sorti, à demi hors champ. -->
        <div class="entry">
          <RiftPortal :color="rankColor" :sealed="sealed" :seed="7" />
        </div>

        <!-- La porte du gardien : une faille dans la faille, dans la couleur de son RANG.
             Le feu couve tant qu'un monstre tient debout ; elle s'embrase à l'ouverture,
             et s'effondre sur elle-même quand le gardien tombe. -->
        <div
          class="door"
          :class="{ open: doorOpen, overload: riftFx === 'overload', blown: riftFx === 'blown' }"
          :style="{ left: stage.doorX * 100 + '%' }"
        >
          <span class="door-burst" />
          <RiftPortal :color="rankColor" :open="doorOpen" :sealed="sealed" :seed="level" />
          <!-- ⚡ La surcharge : l'énergie afflue vers le cœur de la faille avant qu'elle cède. -->
          <template v-if="riftFx === 'overload'">
            <span
              v-for="k in CHARGE_BOLTS"
              :key="'c' + k"
              class="charge"
              :style="{ '--a': (k / CHARGE_BOLTS) * 360 + 'deg', animationDelay: k * 0.07 + 's' }"
            />
          </template>
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
            [bossFx]: f.boss && !!bossFx,
            dormant: f.boss && bossDormant,
            enraged: f.boss && enraged,
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
          <!-- 🕳️ Le gardien a son illustration en pied, tournée vers le groupe (v0.1108).
               Un fichier qui ne charge pas retombe sur l'emoji, jamais sur une image cassée. -->
          <img
            v-if="f.boss && bossArt"
            :src="bossArt"
            :alt="f.name"
            class="art"
            draggable="false"
            @error="artFailed = bossArt"
          />
          <span v-else class="emo">{{ f.emoji }}</span>
        </div>

        <!-- Le groupe : chaque membre à sa place dans l'éventail. Celui dont c'est le
             tour fonce sur SON monstre pendant que les autres avancent — ils ratissent.
             Le héros garde son avatar, un champion son portrait (l'emoji de sa classe
             à défaut). -->
        <div
          v-for="(m, k) in cast"
          :key="'m' + k"
          class="member"
          :class="{
            striking: dashes.has(k),
            lunge: lunges.has(k),
            hurt: partyHurt,
            fallen: wiped,
            hero: m.kind === 'hero',
          }"
          :style="{
            left: memberPos(k).x * 100 + '%',
            top: memberPos(k).y * 100 + '%',
            zIndex: 40 + Math.round(memberPos(k).y * 20),
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

        <!-- Ondes de choc : le rugissement du gardien, et ses coups qui balaient le groupe. -->
        <span
          v-for="w in waves"
          :key="w.id"
          class="wave"
          :class="'wave-' + w.kind"
          :style="{ left: w.x * 100 + '%', top: w.y * 100 + '%' }"
        />

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
    <div class="flash" :class="flash" aria-hidden="true" />
    <!-- 💥 L'explosion de la faille : un éclat qui part du portail et COUVRE tout l'écran,
         au-dessus du HUD — c'est derrière lui qu'on bascule sur le rapport. -->
    <div
      v-if="boom"
      class="boom"
      :style="{ '--bx': boomAt.x + '%', '--by': boomAt.y + '%' }"
      aria-hidden="true"
    />
    <!-- Bandes de cinéma : le duel contre le gardien est un moment à part. -->
    <div class="bars" :class="{ on: cinema }" aria-hidden="true">
      <span class="bar top" /><span class="bar bot" />
    </div>

    <!-- HUD : ce qu'on a abattu, et ce qu'il reste au groupe. -->
    <div class="hud">
      <div class="hud-l">
        <span class="chip">🕳️ Faille niv {{ level }}</span>
        <span class="chip">⚔️ {{ killCount }}/{{ monsterCount }}</span>
      </div>
      <q-btn flat dense no-caps class="skip" label="⏩ Passer" @click="skip" />
    </div>

    <!-- La vie du gardien : les VRAIES valeurs du duel (stage.boss), temps par temps. -->
    <transition name="bb">
      <div v-if="bossBar" class="bossbar" :class="{ enraged }">
        <div class="bb-name font-display">{{ bossBar.emoji }} {{ bossBar.name }}</div>
        <div class="bb-track">
          <i class="ghost" :style="{ width: bossGhost + '%' }" />
          <i class="fill" :style="{ width: bossPct + '%' }" />
        </div>
      </div>
    </transition>

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

    <!-- L'écran de fin est un MOMENT du jeu : on n'émet `done` qu'au clic. ⚠️ Sauf une
         faille refermée : son explosion enchaîne SEULE sur le rapport (`explodeRift`) — on
         ne voit cet écran que via « Passer », une défaite ou `prefers-reduced-motion`. -->
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
import { ref, computed, onMounted, onBeforeUnmount, type Ref } from 'vue';
import type { Equipped } from '@/lib/items';
import { RIFT_STAGE, type RiftCastMember, type RiftStage } from '@/lib/riftStage';
import type { RiftBossStep } from '@/lib/rift';
import AventureAvatar from '@/components/AventureAvatar.vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import RiftPortal from '@/components/RiftPortal.vue';
import { characterRank } from '@/lib/characterRank';
import { monsterArt } from '@/data/monsterArt';

const props = defineProps<{
  stage: RiftStage;
  level: number;
  hero: { profile: 'puissant' | 'agile' | 'polyvalent'; equipped: Equipped } | null;
  /** Le groupe, dans l'ordre de la formation (`riftCast`). */
  cast: RiftCastMember[];
}>();
const emit = defineEmits<{ done: [] }>();

/** La couleur de la faille : celle de son RANG, la même que sur la carte. */
const rankColor = computed(() => characterRank(props.level).color);

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
/** La faille se surcharge après la chute du gardien, puis explose. */
const OVERLOAD_MS = 1700;
/** L'éclat couvre l'écran ; on bascule sur le rapport quand il est opaque. */
const BOOM_COVER_MS = 650;
const CHARGE_BOLTS = 10;
/** Durée de l'élan d'un membre vers sa cible, puis du retour à sa place. */
const DASH_MS = 520;
/** Un membre en attaque se poste juste devant sa cible, pas dessus. */
const DASH_GAP = 0.03;

const reduce =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

const beats = computed(() => props.stage.beats);
/** Cadence : une incursion compte au plus 14 rencontres, on peut respirer. */
const beatMs = computed(() => (beats.value.length > 10 ? 560 : 680));

const monsterCount = computed(() => props.stage.foes.filter((f) => !f.boss).length);

/** L'illustration du gardien (par son NOM, comme tous les ennemis) — `null` si elle
 *  n'existe pas ou n'a pas chargé : on retombe alors sur l'emoji. */
const artFailed = ref<string | null>(null);
const bossArt = computed(() => {
  const a = monsterArt(props.stage.foes.find((f) => f.boss)?.name);
  return a && a !== artFailed.value ? a : null;
});

const cursor = ref(0);
const downs = ref(new Set<number>());
const targetIdx = ref(0);
/** Le point de marche du GROUPE — chaque membre s'en écarte selon sa place. */
const heroX = ref(0.03);
/** Membres partis frapper, et où. ⚠️ Une place à part : pendant ce temps le reste du
 *  groupe continue d'avancer, c'est ce qui fait ratisser plutôt que défiler en file. */
const dashes = ref(new Map<number, { x: number; y: number }>());
const lunges = ref(new Set<number>());
/** Le groupe est tombé : il n'ira pas plus loin. */
const wiped = ref(false);

/** Où se tient le k-ième membre : à sa cible s'il frappe, à sa place sinon. */
function memberPos(k: number): { x: number; y: number } {
  const d = dashes.value.get(k);
  if (d) return d;
  const f = RIFT_STAGE.formation[k] ?? RIFT_STAGE.formation[0];
  return { x: Math.max(0.01, heroX.value + f.dx), y: AXIS_Y + f.dy };
}

/** Où le GROUPE se poste face à une cible : un peu en retrait, plus loin du gardien (il
 *  est plus gros, et l'éventail doit pouvoir se refermer sur lui). */
function standOff(foe: { x: number; boss: boolean }): number {
  return Math.max(0.02, foe.x - (foe.boss ? 0.12 : 0.09));
}

/**
 * Envoie ces membres sur la cible, puis les ramène.
 *
 * `surround` : ils ENCERCLENT (le gardien) en gardant chacun leur rang de l'éventail —
 * ⚠️ le banc l'a montré, répartis dans l'ordre de la liste ils s'empilaient et le héros
 * cachait un champion. Sinon, le membre se poste droit devant sa cible.
 */
function dashTo(members: number[], foe: { x: number; y: number }, surround: boolean, gap: number) {
  const next = new Map(dashes.value);
  for (const k of members) {
    const dy = surround ? (RIFT_STAGE.formation[k] ?? RIFT_STAGE.formation[0]).dy : 0;
    next.set(k, { x: Math.max(0.01, foe.x - gap), y: foe.y + dy });
  }
  dashes.value = next;
  later(
    () => {
      const back = new Map(dashes.value);
      for (const k of members) back.delete(k);
      dashes.value = back;
    },
    reduce ? 0 : DASH_MS,
  );
}
/** Point de mire. ⚠️ Distinct de `heroX` : à l'ouverture de la porte on recule pour
 *  montrer la salle, sinon le gardien reste hors champ au moment précis où il se révèle. */
const camX = ref(0.03);
const pv = ref(props.stage.maxPv);
const ghostPct = ref(100);
const partyHurt = ref(false);
const hurtIdx = ref<number | null>(null);
const shake = ref('');
const hitVig = ref(0);
const doorOpen = ref(false);
const ended = ref(false);
const killCount = ref(0);

// ── Le duel contre le gardien ──
// ⚠️ Tout ce qui suit PEINT `stage.boss` (les vrais PV des deux camps, temps par temps) ;
// rien n'y est tiré au sort. Sans duel enregistré (rapport d'avant la v0.998), le gardien
// se joue en un seul coup, comme avant.
/** Le gardien sommeille au fond de la salle tant que le duel n'a pas commencé. */
const bossDormant = ref(!!props.stage.boss);
/** Animation ponctuelle du gardien : entrée, rugissement, frappe, coup reçu, éclatement. */
const bossFx = ref('');
/** Sous le tiers de sa vie, le gardien enrage — aura rouge, respiration plus rapide. */
const enraged = ref(false);
/** La faille se referme : la déchirure du fond s'éteint. */
const sealed = ref(false);
/** Bandes de cinéma pendant le duel. */
const cinema = ref(false);
/** Éclair plein écran : blanc sur un critique ou le coup fatal, rouge sur un gros coup reçu. */
const flash = ref('');
const bossBar = ref<{ emoji: string; name: string } | null>(null);
const bossPvShown = ref(props.stage.boss?.maxPv ?? 0);
const bossGhost = ref(100);
const waves = ref<{ id: number; x: number; y: number; kind: string }[]>([]);
const bossPct = computed(() => {
  const max = props.stage.boss?.maxPv ?? 0;
  return max > 0 ? Math.max(0, Math.min(100, (bossPvShown.value / max) * 100)) : 0;
});
/** Sous cette part de sa vie, le gardien enrage. */
const ENRAGE_AT = 0.35;
// Rythme du duel (ms). Un temps = le groupe frappe, puis le gardien riposte.
const BOSS_INTRO = 1700;
/** Le groupe frappe (élans échelonnés + impact). */
const BOSS_GROUP_MS = 760;
/** Le gardien riposte (bond + onde + impact). */
const BOSS_RIPOSTE_MS = 720;
/** Un souffle entre deux temps. */
const BOSS_BREATH_MS = 180;
const BOSS_FINALE = 2300;

/** La faille après la chute du gardien : elle se surcharge, puis cède. */
const riftFx = ref<'' | 'overload' | 'blown'>('');
/** L'éclat plein écran de l'explosion. */
const boom = ref(false);

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

/** Où le portail se trouve À L'ÉCRAN (en %), pour que l'éclat de l'explosion parte de lui. */
const boomAt = computed(() => ({
  x: Math.max(0, Math.min(100, (props.stage.doorX + camPct.value / 100) * CAM_W * 100)),
  y: 38,
}));

/** Le point de mire du duel : le groupe, le gardien ET la faille derrière lui. */
function duelCam(): number {
  return (heroX.value + props.stage.doorX) / 2;
}

/**
 * 💥 LA FAILLE CÈDE (v0.1168, demandé) — son gardien tombé, elle se SURCHARGE d'énergie,
 * puis EXPLOSE : un éclat part du portail et couvre tout l'écran, et c'est derrière lui
 * qu'on bascule sur le rapport. Seulement sur une faille refermée : une défaite garde son
 * écran de fin.
 */
function explodeRift(at: number): void {
  later(() => {
    riftFx.value = 'overload';
    camX.value = duelCam();
    say('overload', '⚡ La faille se surcharge', '');
    shake.value = 'sh-m';
  }, at);
  later(() => (shake.value = 'sh-l'), at + OVERLOAD_MS * 0.6);
  later(() => {
    riftFx.value = 'blown';
    banner.value = null;
    cinema.value = false;
    boom.value = true;
  }, at + OVERLOAD_MS);
  later(finish, at + OVERLOAD_MS + BOOM_COVER_MS);
}

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
    // Le gardien se tient DEVANT la faille : le groupe s'arrête face à lui, et la caméra
    // recule pour montrer les deux.
    const guard = props.stage.foes.find((f) => f.boss);
    heroX.value = guard ? standOff(guard) : props.stage.doorX - 0.2;
    camX.value = duelCam();
    say('door', '🌀 La faille s’embrase', 'Son gardien se dresse devant elle');
    cursor.value++;
    timer = setTimeout(play, reduce ? 0 : beatMs.value + SLOW_DOOR);
    return;
  }

  const foe = props.stage.foes[b.foe];
  if (!foe) return stop();
  if (b.kind === 'boss' && props.stage.boss) return playBoss(b, foe);

  targetIdx.value = b.foe;
  // Le groupe avance derrière sa cible ; celui dont c'est le tour fonce dessus. Le
  // gardien, on y va TOUS — l'éventail se referme sur lui.
  const strikers =
    b.striker < 0 ? props.cast.map((_, k) => k) : [Math.min(b.striker, props.cast.length - 1)];
  heroX.value = standOff(foe);
  camX.value = foe.boss ? duelCam() : heroX.value + 0.03;
  dashTo(strikers, foe, foe.boss, foe.boss ? 0.08 : DASH_GAP);
  if (b.kind === 'boss') say('boss', `${foe.emoji} ${foe.name}`, 'Le gardien de la faille');

  // Le coup : élan, arc de lame, puis l'issue de la rencontre.
  later(
    () => {
      lunges.value = new Set(strikers);
      later(() => (lunges.value = new Set()), 240);
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
        // …et le groupe tombe avec lui : personne ne va plus loin.
        later(() => (wiped.value = true), reduce ? 0 : 420);
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
    reduce ? 0 : 260,
  );

  cursor.value++;
  // Gardien tombé sans duel enregistré (rapport d'avant) : la faille explose aussi.
  if (b.kind === 'boss' && b.down && props.stage.cleared) {
    explodeRift(beatMs.value + 200);
    return;
  }
  const extra = b.fatal ? SLOW_FATAL : b.kind === 'boss' ? SLOW_BOSS : 0;
  timer = setTimeout(play, reduce ? 0 : beatMs.value + extra);
}

/** Un effet ponctuel qui s'éteint seul. */
function pulse(target: Ref<string>, value: string, ms: number) {
  target.value = value;
  later(() => {
    if (target.value === value) target.value = '';
  }, ms);
}

function wave(x: number, y: number, kind: 'roar' | 'hit') {
  const id = ++uid;
  waves.value.push({ id, x, y, kind });
  later(() => (waves.value = waves.value.filter((w) => w.id !== id)), 900);
}

/** Tous les membres, encore debout, sur le gardien. */
function allMembers(): number[] {
  return props.cast.map((_, k) => k);
}

/** Le groupe encercle le gardien et frappe, un membre après l'autre. */
function groupStrike(
  step: RiftBossStep,
  foe: { x: number; y: number },
  members: number[],
  maxPv: number,
) {
  dashTo(members, foe, true, 0.08);
  members.forEach((k, j) => {
    later(() => {
      lunges.value = new Set([k]);
      const sid = ++uid;
      slashes.value.push({ id: sid, x: foe.x, y: foe.y + (j - 1) * 0.05 });
      later(() => (slashes.value = slashes.value.filter((s) => s.id !== sid)), 320);
    }, j * 130);
  });
  later(
    () => {
      lunges.value = new Set();
      if (step.dealt <= 0) {
        pop(foe.x, foe.y - 0.14, 'Esquivé', 'miss');
        return;
      }
      pulse(bossFx, 'hit', 280);
      pop(foe.x, foe.y - 0.14, `−${step.dealt}`, step.crit ? 'crit' : 'dmg');
      if (step.crit) {
        pop(foe.x, foe.y - 0.22, 'CRITIQUE', 'crit');
        pulse(flash, 'white', 160);
      }
      bossPvShown.value = step.bossPv;
      later(() => (bossGhost.value = bossPct.value), 420);
      if (!enraged.value && step.bossPv > 0 && step.bossPv < maxPv * ENRAGE_AT) {
        enraged.value = true;
        say('rage', '🔥 Le gardien enrage', '');
      }
    },
    members.length * 130 + 60,
  );
}

/** Le gardien riposte : il bondit, son onde balaie le groupe. */
function bossRiposte(step: RiftBossStep, pvBefore: number, foe: { x: number; y: number }) {
  pulse(bossFx, 'strike', 420);
  wave(foe.x, foe.y, 'hit');
  later(() => {
    const lost = Math.max(0, pvBefore - step.pv);
    if (step.taken <= 0) {
      pop(heroX.value, AXIS_Y - 0.16, 'Esquivé', 'miss');
    } else {
      partyHurt.value = true;
      later(() => (partyHurt.value = false), 260);
      shake.value = 'sh-m';
      later(() => (shake.value = ''), 300);
      if (props.stage.hasPv && lost > 0) {
        pop(heroX.value, AXIS_Y - 0.16, `−${lost}`, 'dmg');
        hitVig.value = Math.min(0.55, (lost / Math.max(1, props.stage.maxPv)) * 1.6);
        later(() => (hitVig.value = 0), 360);
        if (lost > props.stage.maxPv * 0.12) pulse(flash, 'red', 180);
      }
    }
    if (props.stage.hasPv) {
      pv.value = step.pv;
      later(() => (ghostPct.value = pvPct.value), 380);
    }
  }, 200);
}

/**
 * 🐉 LE DUEL — une séquence à part, pilotée par `stage.boss`.
 *
 * 1. **L'entrée** : bandes de cinéma, la caméra se pose sur la salle, le gardien se dresse
 *    de l'autel et rugit (onde de choc, secousse), sa barre de vie apparaît.
 * 2. **Les échanges** : à chaque temps, les membres frappent l'un après l'autre (la barre
 *    du gardien descend du VRAI montant), puis il riposte (onde qui balaie le groupe, la
 *    barre du groupe descend du vrai montant). Il enrage sous le tiers de sa vie.
 * 3. **Le dénouement** : coup fatal au ralenti puis éclatement et fermeture de la faille —
 *    ou le groupe qui tombe sous le dernier coup.
 */
function playBoss(b: (typeof beats.value)[number], foe: (typeof props.stage.foes)[number]) {
  const duel = props.stage.boss!;
  const members = allMembers();
  targetIdx.value = b.foe;
  heroX.value = standOff(foe);
  camX.value = duelCam();
  cinema.value = true;

  // 1. L'entrée.
  later(() => {
    bossDormant.value = false;
    pulse(bossFx, 'rise', 900);
  }, 250);
  later(() => {
    pulse(bossFx, 'roar', 700);
    wave(foe.x, foe.y, 'roar');
    shake.value = 'sh-l';
    later(() => (shake.value = ''), 420);
    bossBar.value = { emoji: foe.emoji, name: foe.name };
    say('boss', `${foe.emoji} ${foe.name}`, 'Le gardien de la faille');
  }, 1000);

  // 2. Les échanges. ⚠️ Un temps n'est pas forcément « chacun son tour » : il porte les
  // tours RÉELLEMENT joués par chaque camp (`groupTurns`, `bossTurns`). Le camp qui n'a pas
  // joué ne bouge pas, et une attaque à 0 dégât s'affiche « Esquivé ».
  let t = BOSS_INTRO;
  let before = b.pvBefore;
  for (const [i, step] of duel.steps.entries()) {
    const pvBefore = before;
    const groupMs = step.groupTurns > 0 ? BOSS_GROUP_MS : 0;
    if (step.groupTurns > 0) later(() => groupStrike(step, foe, members, duel.maxPv), t);
    // La riposte — seulement s'il est encore debout.
    if (step.bossTurns > 0 && step.bossPv > 0)
      later(() => bossRiposte(step, pvBefore, foe), t + groupMs);
    else if (props.stage.hasPv) later(() => (pv.value = step.pv), t + groupMs);
    before = step.pv;
    const bossMs = step.bossTurns > 0 && step.bossPv > 0 ? BOSS_RIPOSTE_MS : 0;
    t += groupMs + bossMs + (i === duel.steps.length - 1 ? 0 : BOSS_BREATH_MS);
  }

  // 3. Le dénouement.
  if (b.down) {
    // Le coup fatal : tous ensemble sur lui, un temps suspendu, puis l'éclatement.
    later(() => {
      dashTo(members, foe, true, 0.08);
      lunges.value = new Set(members);
      later(() => (lunges.value = new Set()), 240);
    }, t + 80);
    later(() => {
      pulse(flash, 'white', 200);
      // Pas de `pulse` : dissous, il le RESTE — sinon il reviendrait grisé au sol.
      bossFx.value = 'shatter';
      downs.value = new Set(downs.value).add(b.foe);
      for (let k = 0; k < 3; k++) later(() => burst(foe.x, foe.y), k * 140);
      shake.value = 'sh-l';
      later(() => (shake.value = ''), 500);
      bossPvShown.value = 0;
    }, t + 460);
    later(() => (bossBar.value = null), t + 1100);
    // Son gardien tombé, la faille se surcharge puis explose — et le rapport suit.
    explodeRift(t + 1250);
    cursor.value++;
    return;
  } else {
    later(() => {
      pulse(bossFx, 'roar', 700);
      wave(foe.x, foe.y, 'roar');
      hurtIdx.value = b.foe;
      wiped.value = true;
      shake.value = 'sh-l';
      later(() => (shake.value = ''), 420);
      say('fall', `${foe.emoji} Le gardien tient`, 'Le groupe est tombé');
    }, t + 300);
  }
  later(() => (cinema.value = false), t + BOSS_FINALE - 300);

  cursor.value++;
  timer = setTimeout(play, t + BOSS_FINALE);
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
  dashes.value = new Map();
  lunges.value = new Set();
  wiped.value = beats.value.some((b) => b.fatal);
  if (last) {
    pv.value = last.pvAfter;
    const lastFoe = props.stage.foes[Math.max(0, last.foe)];
    if (lastFoe) heroX.value = standOff(lastFoe);
    camX.value = heroX.value;
  }
  ghostPct.value = pvPct.value;
  // Le duel, à son état final : barre au dernier PV, faille scellée si elle l'est.
  const duel = props.stage.boss;
  waves.value = [];
  // Un gardien vaincu dans le duel reste dissous (cf. le dénouement).
  bossFx.value = duel && props.stage.cleared ? 'gone' : '';
  flash.value = '';
  riftFx.value = '';
  boom.value = false;
  cinema.value = false;
  bossDormant.value = false;
  if (duel) {
    bossPvShown.value = duel.steps.at(-1)?.bossPv ?? duel.maxPv;
    bossGhost.value = bossPct.value;
    enraged.value = bossPvShown.value > 0 && bossPvShown.value < duel.maxPv * ENRAGE_AT;
  }
  sealed.value = props.stage.cleared;
  bossBar.value = null;
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
/* Teinte de la faille : la couleur de son RANG (posée en ligne sur la racine), la même que
   sur la carte — portails, lueur et horizon la suivent. Le violet n'est plus qu'un repli. */
.rift {
  --rift: #c07bff; /* repli ; le rang de la faille le remplace (style en ligne) */
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
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--rift) 55%, transparent),
    transparent
  );
}
.ceil {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 40%;
  background: linear-gradient(0deg, transparent, #1a1226 70%);
}
/* L'entrée : un portail à demi hors champ, d'où le groupe est sorti. */
.entry {
  position: absolute;
  left: -1.4%;
  top: 20%;
  height: 44%;
  width: 7%;
  z-index: 5;
  opacity: 0.85;
}
/* La porte du gardien : plus grande que l'entrée — c'est le fond de la faille. Le portail
   se pose EN BAS de sa boîte (xMidYMax) : son pied touche le sol où marche le groupe, en
   portrait comme en paysage. */
.door {
  position: absolute;
  top: 12%;
  height: 52%;
  width: 14%;
  transform: translateX(-50%);
  z-index: 6;
  transition: filter 0.8s ease;
}
.door.open {
  filter: drop-shadow(0 0 16px var(--rift));
}
/* À l'ouverture, une onde de feu part du portail. */
.door-burst {
  position: absolute;
  left: 50%;
  top: 56%;
  width: 60%;
  aspect-ratio: 1 / 1.7;
  border-radius: 50%;
  border: 3px solid var(--rift);
  transform: translate(-50%, -50%) scale(0.4);
  opacity: 0;
  pointer-events: none;
}
.door.open .door-burst {
  animation: doorBurst 0.9s ease-out;
}
@keyframes doorBurst {
  0% {
    opacity: 0.9;
    transform: translate(-50%, -50%) scale(0.5);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(2.2);
  }
}
.reduce .door-burst {
  animation: none;
}

.sanctum {
  position: absolute;
  top: 26%;
  height: 46%;
  width: 26%;
  /* Centrée sur la faille : l'autel et ses braseros l'encadrent. */
  transform: translateX(-50%);
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
  box-shadow: 0 0 24px color-mix(in srgb, var(--rift) 55%, transparent);
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
/* L'illustration pose les pieds au bas de son carré (cf. le script) : un peu plus grande
   que l'emoji pour que la silhouette, qui n'en remplit pas tout le cadre, pèse autant.
   Halo clair : plusieurs gardiens sont sombres et disparaîtraient sur le fond de la faille
   (même remède que le rejeu de donjon). */
.foe .art {
  display: block;
  width: 50px;
  height: 50px;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.35)) drop-shadow(0 3px 5px rgba(0, 0, 0, 0.6));
}
.foe .aura {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 54px;
  height: 54px;
  margin: -27px 0 0 -27px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--rift) 40%, transparent),
    transparent 68%
  );
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
.foe.target .emo,
.foe.target .art {
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

/* Chaque membre du groupe a sa place : il marche (transition longue) et, quand c'est son
   tour, fonce sur sa cible (même transition — c'est l'élan qu'on voit). */
.member {
  position: absolute;
  transform: translate(-50%, -50%);
  transition:
    left 0.34s cubic-bezier(0.3, 0.7, 0.3, 1),
    top 0.34s cubic-bezier(0.3, 0.7, 0.3, 1),
    opacity 0.5s,
    filter 0.5s;
}
.reduce .member {
  transition: none;
}
.member.lunge {
  animation: lunge 0.24s ease-out;
}
@keyframes lunge {
  50% {
    transform: translate(-30%, -50%);
  }
}
.member.hurt .hero-av,
.member.hurt .champ {
  filter: drop-shadow(0 0 8px var(--d4));
}
/* Le groupe tombé : il reste où il est, à terre — comme un monstre abattu. */
.member.fallen {
  opacity: 0.35;
  filter: grayscale(1);
  transform: translate(-50%, -30%) rotate(-70deg);
}
.hero-av {
  width: 62px;
}
/* Un champion : son portrait dans un médaillon à la couleur de la faille. La taille vient
   du `font-size` (le portrait fait 1.15em, et l'emoji de repli la même taille). */
.champ {
  font-size: 40px;
  line-height: 1;
  padding: 3px;
  border-radius: 26%;
  background: rgba(20, 15, 30, 0.7);
  box-shadow:
    0 0 0 2px var(--rift),
    0 4px 10px rgba(0, 0, 0, 0.6);
}
.member.striking .champ {
  box-shadow:
    0 0 0 2px var(--accent),
    0 0 14px var(--accent);
}
.member .shadow.big {
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

/* ── 🐉 LE DUEL CONTRE LE GARDIEN ─────────────────────────────────────────── */
/* ⚠️ `.foe` porte déjà `transform: translate(-50%, -50%) scale(var(--sc))` : chaque
   animation du gardien le REPREND, sinon il sauterait hors de sa place. */
.foe.boss.dormant {
  filter: brightness(0.35) saturate(0.4);
  transform: translate(-50%, -40%) scale(calc(var(--sc) * 0.72));
}
.foe.boss.dormant .aura {
  opacity: 0.25;
}
.foe.boss.rise {
  animation: bossRise 0.9s cubic-bezier(0.2, 0.9, 0.2, 1.2);
}
@keyframes bossRise {
  0% {
    transform: translate(-50%, -30%) scale(calc(var(--sc) * 0.4));
    filter: brightness(3) saturate(0);
  }
  60% {
    transform: translate(-50%, -58%) scale(calc(var(--sc) * 1.18));
  }
  100% {
    transform: translate(-50%, -50%) scale(var(--sc));
    filter: none;
  }
}
.foe.boss.roar {
  animation: bossRoar 0.7s ease-out;
}
@keyframes bossRoar {
  25% {
    transform: translate(-50%, -54%) scale(calc(var(--sc) * 1.22));
    filter: drop-shadow(0 0 18px var(--d4)) brightness(1.3);
  }
}
/* Il frappe VERS le groupe (à gauche), puis revient. */
.foe.boss.strike {
  animation: bossStrike 0.42s cubic-bezier(0.5, 0, 0.2, 1);
}
@keyframes bossStrike {
  45% {
    transform: translate(-95%, -46%) scale(calc(var(--sc) * 1.1));
  }
}
.foe.boss.hit {
  animation: bossHit 0.28s ease-out;
}
@keyframes bossHit {
  40% {
    transform: translate(-42%, -50%) scale(calc(var(--sc) * 0.94));
    filter: brightness(2.4) saturate(0.2);
  }
}
.foe.boss.enraged .aura {
  width: 128px;
  height: 128px;
  margin: -64px 0 0 -64px;
  background: radial-gradient(circle, rgba(255, 70, 40, 0.75), transparent 66%);
  animation-duration: 0.9s;
}
.foe.boss.enraged .emo,
.foe.boss.enraged .art {
  filter: drop-shadow(0 0 10px var(--d4));
}
/* L'éclatement : il gonfle, blanchit et se dissout — la faille se referme derrière. */
.foe.boss.gone {
  opacity: 0;
}
.foe.boss.shatter {
  animation: bossShatter 1.4s ease-in forwards;
}
@keyframes bossShatter {
  0% {
    transform: translate(-50%, -50%) scale(var(--sc));
    filter: brightness(1);
    opacity: 1;
  }
  30% {
    transform: translate(-50%, -52%) scale(calc(var(--sc) * 1.35));
    filter: brightness(4) saturate(0);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(calc(var(--sc) * 2.2));
    filter: brightness(4) blur(6px);
    opacity: 0;
  }
}

/* Ondes de choc : le rugissement rayonne, la frappe balaie le groupe. */
.wave {
  position: absolute;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 55;
}
.wave-roar {
  border: 3px solid rgba(255, 106, 69, 0.85);
  animation: waveOut 0.9s ease-out forwards;
}
.wave-hit {
  border: 2px solid rgba(255, 106, 69, 0.9);
  border-right-color: transparent;
  animation: waveSweep 0.6s ease-out forwards;
}
@keyframes waveOut {
  from {
    transform: scale(0.4);
    opacity: 1;
  }
  to {
    transform: scale(9);
    opacity: 0;
  }
}
@keyframes waveSweep {
  from {
    transform: translateX(0) scale(0.6);
    opacity: 1;
  }
  to {
    transform: translateX(-140px) scale(3.2);
    opacity: 0;
  }
}

.pop.pop-miss {
  color: var(--mana);
  font-size: 15px;
  font-style: italic;
  letter-spacing: 0.04em;
}
.pop.pop-crit {
  color: var(--accent);
  font-size: 23px;
  letter-spacing: 0.05em;
}

.flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  z-index: 75;
  transition: opacity 0.18s ease;
}
.flash.white {
  background: rgba(255, 250, 235, 0.2);
  opacity: 1;
  transition: none;
}
.flash.red {
  background: rgba(255, 70, 40, 0.3);
  opacity: 1;
  transition: none;
}

/* Bandes de cinéma : sous le HUD (80), au-dessus du terrain. */
.bars .bar {
  position: absolute;
  left: 0;
  right: 0;
  height: 7%;
  background: #000;
  z-index: 72;
  transition: transform 0.6s cubic-bezier(0.3, 0.7, 0.3, 1);
}
.bars .top {
  top: 0;
  transform: translateY(-100%);
}
.bars .bot {
  bottom: 0;
  transform: translateY(100%);
}
.bars.on .bar {
  transform: none;
}

/* La vie du gardien : en haut, sous le HUD, à sa couleur. */
.bossbar {
  position: absolute;
  left: 18px;
  right: 18px;
  top: 54px;
  z-index: 82;
  display: grid;
  gap: 4px;
  text-align: center;
}
.bb-name {
  font-size: 15px;
  letter-spacing: 0.06em;
  color: var(--d4);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9);
}
.bb-track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 106, 69, 0.55);
  overflow: hidden;
}
.bb-track i {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  display: block;
}
.bb-track .ghost {
  background: rgba(255, 235, 200, 0.55);
  transition: width 0.6s ease 0.2s;
}
.bb-track .fill {
  background: linear-gradient(90deg, #c2261a, var(--d4));
  transition: width 0.35s ease;
}
.bossbar.enraged .bb-track {
  box-shadow: 0 0 12px rgba(255, 70, 40, 0.7);
}
.bb-enter-active,
.bb-leave-active {
  transition: all 0.4s ease;
}
.bb-enter-from,
.bb-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.banner.ban-rage .ban-main,
.banner.ban-fall .ban-main {
  color: var(--d4);
}
.banner.ban-seal .ban-main {
  color: var(--mana);
}
.banner.ban-overload .ban-main {
  color: #fff6c8;
  text-shadow: 0 0 14px var(--rift);
}

/* ⚡ LA SURCHARGE — le portail enfle, s'éclaire et tremble, l'énergie afflue vers son cœur. */
.door.overload {
  animation: riftOverload 1.7s cubic-bezier(0.5, 0, 0.9, 0.6) forwards;
}
@keyframes riftOverload {
  0% {
    transform: translateX(-50%) scale(1);
    filter: drop-shadow(0 0 16px var(--rift)) brightness(1);
  }
  30% {
    transform: translateX(-50%) scale(1.06) rotate(-0.6deg);
  }
  45% {
    transform: translateX(-50%) scale(1.09) rotate(0.8deg);
  }
  60% {
    transform: translateX(-50%) scale(1.14) rotate(-1deg);
  }
  75% {
    transform: translateX(-50%) scale(1.2) rotate(1.2deg);
  }
  88% {
    transform: translateX(-50%) scale(1.26) rotate(-1.4deg);
  }
  100% {
    transform: translateX(-50%) scale(1.34);
    filter: drop-shadow(0 0 40px #fff) drop-shadow(0 0 70px var(--rift)) brightness(2.4);
  }
}
.charge {
  position: absolute;
  left: 50%;
  top: 56%;
  width: 3px;
  height: 22%;
  border-radius: 2px;
  background: linear-gradient(180deg, transparent, #fff, var(--rift));
  box-shadow: 0 0 8px var(--rift);
  transform-origin: 50% 0;
  opacity: 0;
  animation: chargeIn 0.55s ease-in infinite;
}
@keyframes chargeIn {
  0% {
    opacity: 0;
    transform: rotate(var(--a)) translateY(140%) scaleY(0.6);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: rotate(var(--a)) translateY(0) scaleY(1);
  }
}
/* Elle cède : le portail se dilate et s'efface dans l'éclat. */
.door.blown {
  animation: riftBlown 0.5s ease-out forwards;
}
@keyframes riftBlown {
  from {
    transform: translateX(-50%) scale(1.34);
    filter: brightness(3);
    opacity: 1;
  }
  to {
    transform: translateX(-50%) scale(2.6);
    filter: brightness(4);
    opacity: 0;
  }
}
/* 💥 L'ÉCLAT — part du portail et couvre TOUT, HUD compris : le rapport s'ouvre derrière. */
.boom {
  position: absolute;
  inset: 0;
  z-index: 200;
  pointer-events: none;
  background: radial-gradient(
    circle at var(--bx) var(--by),
    #fff 0%,
    #fffbe8 30%,
    color-mix(in srgb, var(--rift) 30%, #fff) 70%,
    #fff 100%
  );
  animation: boomCover 0.55s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
@keyframes boomCover {
  0% {
    clip-path: circle(0% at var(--bx) var(--by));
    opacity: 0.9;
  }
  100% {
    clip-path: circle(160% at var(--bx) var(--by));
    opacity: 1;
  }
}

.reduce .foe.boss,
.reduce .wave,
.reduce .bars .bar {
  animation: none;
  transition: none;
}
</style>
