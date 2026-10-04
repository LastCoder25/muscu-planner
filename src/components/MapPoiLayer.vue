<!--
  🗺️ LES LIEUX DE LA CARTE D'EXPÉDITION — les lieux à prendre, la cible du héros et celles des
  équipes en route. Sorti de `ExpeditionMapPage` (découpage de la page, 2026-09-27).

  ⚠️ LA RAISON D'ÊTRE DE CE COMPOSANT, c'est le RE-RENDU : la page tique à la SECONDE (le héros
  et les équipes avancent sur la carte), et son gabarit se re-diffuse à chaque tick. Les lieux,
  eux, ne changent qu'à l'apparition, à la disparition ou à la sélection d'un lieu. Isolés ici
  avec des props à IDENTITÉ STABLE (des listes qui ne changent de référence que si leur contenu
  change, des ids joints en chaîne), Vue ne les re-diffuse plus que quand ils bougent vraiment.
  ⚠️ Passer ici un tableau reconstruit à chaque tick annulerait tout le bénéfice.
-->
<template>
  <g>
    <g
      v-for="p in pois"
      :key="p.id"
      class="poi"
      :class="{
        sel: selectedId === p.id,
        dim: dimmed.has(p.id),
        veiled: veiled.has(p.id),
        down: down.has(p.id),
      }"
      :style="{ '--rk': isHeldControl(p) ? HELD_COLOR : rankOf(p).color }"
      @click="emit('select', p)"
    >
      <!-- 🌀 Une faille se dessine comme dans son incursion : un portail ovale cerné de
           flammes, à la couleur de son rang — on la reconnaît d'un écran à l'autre.
           ⚠️ Une cible de clic TRANSPARENTE dessous : sans elle, seuls les traits
           peints du portail captaient le toucher (leçon des tourelles, v0.673). -->
      <template v-if="isRiftPoi(p)">
        <ellipse :cx="p.x" :cy="p.y" rx="4.4" ry="6.4" class="rift-hit" />
        <RiftPortal :color="rankOf(p).color" :seed="seedOf(p.id)" :box="riftMapBox(p.x, p.y)" />
      </template>
      <!-- 🏰 UN POINT DE CONTRÔLE se dessine en FORT, et sa bannière dit qui le tient :
           ROUGE à l'ennemi, VIOLET (la couleur de nos équipes) quand nos champions y sont.
           Pointillé tant qu'une équipe y marche. -->
      <!-- 🏰 Un lieu FIXE se dessine plus GROS qu'un lieu ordinaire (demandé), et une citadelle
           plus encore : on les repère sur la carte. Agrandi autour de son centre, garnison,
           cran et alerte compris. -->
      <g v-else-if="p.control" :transform="fixedScale(p)">
        <!-- 🏰 La FORTERESSE adverse porte un cadre que nul autre lieu ne porte : halo et
             équerres rouges (`QgFrame`, demandé). Ta base a le même, en or. -->
        <g v-if="p.control.kind === 'fortress'" :transform="`translate(${p.x} ${p.y})`">
          <QgFrame :half="7.4" tone="foe" />
        </g>
        <rect
          :x="p.x - 5.2"
          :y="p.y - 5.2"
          width="10.4"
          height="10.4"
          rx="2"
          class="ctl-bg"
          :class="[p.control.owner, { assault: p.control.assault }]"
        />
        <text :x="p.x" :y="p.y + 1.6" class="poi-emo">{{ CONTROL_EMO[p.control.kind] }}</text>
        <line :x1="p.x + 5.2" :y1="p.y - 5.2" :x2="p.x + 5.2" :y2="p.y - 10.4" class="ctl-mast" />
        <path
          :d="`M${p.x + 5.2},${p.y - 10.4} l4.2,1.3 l-4.2,1.3 z`"
          class="ctl-flag"
          :class="p.control.owner"
        />
        <!-- ⚫ SA GARNISON EN POINTS, sous le fort (demandé : « voir d'un coup d'œil ») : un
             point par place — plein cyan un champion, plein clair un milicien, orange
             une troupe en route (renfort, transfert, sortie qui reviendra ou assaut : sa place est prise sans y être
             encore), vide une place libre (rouge si personne ne tient ni ne rejoint le
             point). -->
        <g
          v-if="dots.get(p.id)"
          class="ctl-dots"
          :class="{ empty: !/[cmr]/.test(dots.get(p.id)!) }"
        >
          <circle
            v-for="(d, i) in dots.get(p.id)!"
            :key="i"
            :cx="p.x + (i - (dots.get(p.id)!.length - 1) / 2) * DOT_GAP"
            :cy="p.y + 7.2"
            :r="DOT_R"
            :class="'d-' + d"
          />
        </g>
        <!-- 🏅 Son CRAN (ancienneté), sous le fort — seulement s'il en a. La citadelle, elle,
             montre son PALIER (« P3 »). -->
        <text
          v-if="tiers.get(p.id)"
          :x="p.x"
          :y="p.y + (dots.get(p.id) ? 11.6 : 9)"
          class="ctl-tier"
          :class="p.control.owner"
        >
          {{ p.control.kind === 'citadel' ? 'P' : '🏅' }}{{ tiers.get(p.id) }}
        </text>
        <!-- ⚔️ Bataille imminente : un petit avertissement au coin du fort, qui palpite. -->
        <g v-if="imminent.has(p.id)" class="ctl-alert">
          <circle :cx="p.x - 5.2" :cy="p.y - 5.2" r="2.9" />
          <text :x="p.x - 5.2" :y="p.y - 4">!</text>
        </g>
      </g>
      <!-- ⚔️🗼 Une ARMÉE EN CAMPAGNE (siège, reprise) : un liseré rouge — elle marche sur nous. -->
      <template v-else>
        <circle :cx="p.x" :cy="p.y" r="4.5" class="poi-bg" :class="{ 'poi-army': p.army }" />
        <text :x="p.x" :y="p.y + 1.4" class="poi-emo">{{ poiEmo(p) }}</text>
      </template>
      <!-- 🏅 Le RANG du lieu, pas son niveau : la boule du rang au-dessus et le contour dans
           sa couleur — on repère d'un coup d'œil les lieux du rang de ses champions. ⚠️ Plus
           ses ÉTOILES : un rang couvre dix niveaux, et un lieu Bronze ★5 écrase des champions
           Bronze ★1 (mesuré : 0 % de victoire). -->
      <text
        v-if="!isHeldControl(p)"
        :x="p.x"
        :y="p.y - (isRiftPoi(p) ? RIFT_MAP_ICON.dy + 0.5 : 5.4 * scaleOf(p))"
        class="poi-rank"
      >
        {{ rankOf(p).emoji }}
        <tspan class="poi-star">{{ rankOf(p).star }}★</tspan>
      </text>
      <!-- 🔴 Une de nos troupes marche sur ce lieu : un point rouge dessous (demandé). -->
      <circle
        v-if="attacked.has(p.id)"
        :cx="p.x"
        :cy="p.y + attackDotDy(p)"
        r="1.5"
        class="attack-dot"
      />
    </g>

    <!-- Objectif du héros. 🌀 Une faille garde son PORTAIL même quand on y va ou qu'on en
         revient : la pastille d'avant ne se reconnaissait plus d'un écran à l'autre. -->
    <g
      v-if="target"
      class="poi target"
      :class="{ 'rift-target': isRiftPoi(target), down: targetDown, sel: selectedId === target.id }"
      @click="emit('select', target)"
    >
      <!-- ⚔️ Un lieu qu'on attaque reste TOUCHABLE : on y voit ce qu'il rapporte (la fiche
           se réduit alors au minimum, cf. `engagedTrip` de la page). -->
      <ellipse
        v-if="isRiftPoi(target)"
        :cx="target.x"
        :cy="target.y"
        rx="4.4"
        ry="6.4"
        class="rift-hit"
      />
      <RiftPortal
        v-if="isRiftPoi(target)"
        :color="rankOf(target).color"
        :seed="seedOf(target.id)"
        :box="riftMapBox(target.x, target.y)"
      />
      <template v-else>
        <circle :cx="target.x" :cy="target.y" r="4.8" class="poi-bg" />
        <text :x="target.x" :y="target.y + 1.4" class="poi-emo">{{ poiEmo(target) }}</text>
      </template>
      <path v-if="targetDown" :d="slash(target)" class="down-x" />
    </g>

    <!-- ⚠️ Destination d'une ÉQUIPE. Le lieu est retiré de la carte au départ — il est
         CONSOMMÉ, comme pour le héros. Mais le héros garde sa cible DESSINÉE : sans son
         équivalent ici, le tracé d'une équipe menait à du vide. On la montre donc, marquée
         occupée (liseré violet, sans rang : elle n'est plus à prendre). -->
    <g
      v-for="v in travelTargets"
      :key="'vg' + v.id"
      class="poi target van-target"
      :class="[
        v.kind,
        { 'rift-target': isRiftPoi(v.poi), down: v.down, sel: selectedId === v.poi.id },
      ]"
      @click="emit('select', v.poi)"
    >
      <ellipse
        v-if="isRiftPoi(v.poi)"
        :cx="v.poi.x"
        :cy="v.poi.y"
        rx="4.4"
        ry="6.4"
        class="rift-hit"
      />
      <RiftPortal
        v-if="isRiftPoi(v.poi)"
        :color="rankOf(v.poi).color"
        :seed="seedOf(v.poi.id)"
        :box="riftMapBox(v.poi.x, v.poi.y)"
      />
      <template v-else>
        <circle :cx="v.poi.x" :cy="v.poi.y" r="4.8" class="poi-bg" />
        <text :x="v.poi.x" :y="v.poi.y + 1.4" class="poi-emo">{{ poiEmo(v.poi) }}</text>
      </template>
      <path v-if="v.down" :d="slash(v.poi)" class="down-x" />
    </g>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import QgFrame from '@/components/QgFrame.vue';
import RiftPortal from '@/components/RiftPortal.vue';
import { isRiftPoi, poiEmo, type Poi } from '@/lib/expedition';
import { CONTROL_EMO, HELD_COLOR, isHeldControl } from '@/lib/controlPoints';
import { poiRank } from '@/lib/poiRank';
import { seedOf } from '@/lib/combat';
import { RIFT_MAP_ICON, riftMapBox } from '@/lib/riftPortal';

/** 💀 La croix posée sur un lieu terrassé (deux traits en X sur la pastille). */
const slash = (p: { x: number; y: number }) =>
  `M${p.x - 3.4} ${p.y - 3.4}L${p.x + 3.4} ${p.y + 3.4}M${p.x + 3.4} ${p.y - 3.4}L${p.x - 3.4} ${p.y + 3.4}`;

const props = defineProps<{
  pois: Poi[];
  selectedId: string | null;
  /** Ids des lieux GRISÉS, joints par « | » — une CHAÎNE pour que le prop ne change que si
   *  la liste change (un Set reconstruit à chaque tick relancerait le rendu). */
  dimmedKey: string;
  /** Ids des lieux encore sous le brouillard qui recule, même forme que `dimmedKey`. */
  veiledKey: string;
  /** 💀 Ids des lieux terrassés encore sur la carte (armées en campagne), même forme. */
  downKey?: string;
  /** Ids des points de contrôle sous attaque imminente, même forme que `dimmedKey`. */
  imminentKey: string;
  /** 🔴 Ids des lieux sur lesquels une de nos troupes marche (`underAttackKey`), même forme. */
  attackedKey?: string;
  /** 🏅 Les crans des points fixes, « id:cran » joints par « | » (seuls les crans > 0). */
  tierKey?: string;
  /** ⚫ La garnison des points tenus, « id:lettres » joints par « | » (`garrisonDots`). */
  garrisonKey?: string;
  /** La cible du héros en voyage. */
  target: Poi | null;
  /** Les cibles des équipes en route. */
  travelTargets: { id: string; poi: Poi; kind: string; down: boolean }[];
  /** 💀 La cible du héros est terrassée (grisée jusqu'à son retour). */
  targetDown?: boolean;
}>();
const emit = defineEmits<{ select: [p: Poi] }>();

const toSet = (k: string) => new Set(k ? k.split('|') : []);
const dimmed = computed(() => toSet(props.dimmedKey));
const veiled = computed(() => toSet(props.veiledKey));
const down = computed(() => toSet(props.downKey ?? ''));
const imminent = computed(() => toSet(props.imminentKey));
const attacked = computed(() => toSet(props.attackedKey ?? ''));
/** 🏰 Agrandissement d'un lieu fixe (citadelle encore plus) ; 1 pour un lieu ordinaire. */
const FIXED_SCALE = 1.15;
const CITADEL_SCALE = 1.35;
const scaleOf = (p: Poi) =>
  !p.control
    ? 1
    : p.control.kind === 'citadel' || p.control.kind === 'fortress'
      ? CITADEL_SCALE
      : FIXED_SCALE;
const fixedScale = (p: Poi) => {
  const k = scaleOf(p);
  return `translate(${p.x} ${p.y}) scale(${k}) translate(${-p.x} ${-p.y})`;
};
/** 🔴 Le point d'attaque se pose sous tout ce que le lieu dessine (garnison, cran, faille). */
const attackDotDy = (p: Poi) => {
  // 🌀 Une faille : juste sous le bas de l'ovale (le bas de sa boîte est vide, mesuré au banc).
  if (isRiftPoi(p)) return RIFT_MAP_ICON.h - RIFT_MAP_ICON.dy;
  if (!p.control) return 6.6;
  const below = tiers.value.get(p.id) ? 13.2 : dots.value.get(p.id) ? 9.2 : 7.2;
  return below * scaleOf(p);
};
const tiers = computed(
  () =>
    new Map(
      (props.tierKey ? props.tierKey.split('|') : []).map((s) => {
        const i = s.lastIndexOf(':');
        return [s.slice(0, i), Number(s.slice(i + 1))] as const;
      }),
    ),
);
const dots = computed(
  () =>
    new Map(
      (props.garrisonKey ? props.garrisonKey.split('|') : []).map((s) => {
        const i = s.lastIndexOf(':');
        return [s.slice(0, i), s.slice(i + 1)] as const;
      }),
    ),
);
/** ⚫ Taille et écart des points de garnison (unités de carte) : 5 places tiennent sous le fort. */
const DOT_R = 0.85;
const DOT_GAP = 2.3;
/** 🏅 Le rang de chaque lieu, une fois par changement de carte (sinon une bisection par
 *  lecture, quatre lectures par lieu). Repli sur le calcul direct pour une cible de voyage,
 *  qui n'est plus sur la carte. */
const ranks = computed(() => new Map(props.pois.map((p) => [p.id, poiRank(p)])));
const rankOf = (p: Poi) => ranks.value.get(p.id) ?? poiRank(p);
</script>

<style scoped lang="scss">
.poi {
  transition: opacity 0.35s ease-out;
  cursor: pointer;
}
/* Un lieu que le front du brouillard n’a pas encore atteint reste invisible, puis apparaît en fondu. */
.poi.veiled {
  opacity: 0;
  pointer-events: none;
}
/* 🏰 Point de contrôle : fond et bannière selon qui le tient. */
.ctl-bg {
  stroke-width: 1.2;
}
.ctl-bg.enemy {
  fill: color-mix(in srgb, var(--d4, #ff6a45) 22%, var(--surface));
  stroke: var(--d4, #ff6a45);
}
.ctl-bg.player {
  fill: color-mix(in srgb, var(--held) 24%, var(--surface));
  stroke: var(--held);
}
.ctl-bg.assault {
  stroke-dasharray: 1.6 1.2;
}
.poi.sel .ctl-bg {
  stroke: var(--accent);
}
.ctl-mast {
  stroke: var(--text);
  stroke-width: 0.5;
}
.ctl-flag.enemy {
  fill: var(--d4, #ff6a45);
}
.ctl-flag.player {
  fill: var(--held);
}
/* ⚔️ Bataille imminente : pastille rouge au coin du fort, lente pulsation (une menace qui
   approche en heures, pas une alarme). Figée si l'on préfère moins de mouvement. */
.ctl-alert circle {
  fill: var(--d4, #ff6a45);
  stroke: var(--bg);
  stroke-width: 0.6;
}
.ctl-alert text {
  fill: #fff;
  font-size: 4.2px;
  font-weight: 800;
  text-anchor: middle;
}
.ctl-alert {
  animation: ctl-alert-pulse 2.4s ease-in-out infinite;
  pointer-events: none;
}
@keyframes ctl-alert-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ctl-alert {
    animation: none;
  }
}
/* 🔴 Lieu en train d'être attaqué par une de nos troupes. */
.attack-dot {
  fill: var(--d4, #ff6a45);
  stroke: var(--bg);
  stroke-width: 0.5;
  pointer-events: none;
}
/* Contour dans la couleur du RANG du lieu (`--rk`, posé par lieu). */
.poi-bg {
  fill: var(--surface);
  stroke: var(--rk, var(--line));
  stroke-width: 1;
}
/* La cible de clic d'une faille : invisible, sauf sélectionnée (le liseré d'accent de
   tous les lieux, autour de l'ovale). */
.rift-hit {
  fill: transparent;
  stroke: none;
}
.poi.sel .rift-hit {
  stroke: var(--accent);
  stroke-width: 0.8;
  stroke-dasharray: 1.4 0.9;
}
.poi-bg.poi-army {
  stroke: var(--d4);
  stroke-width: 1.1;
}
.poi.sel .poi-bg {
  stroke: var(--accent);
  stroke-width: 1.5;
}
.poi.dim {
  opacity: 0.4;
}
.poi.target .poi-bg {
  stroke: var(--accent);
  stroke-width: 1.4;
}
.poi-emo {
  font-size: 4px;
  text-anchor: middle;
}
/* ⚫ La garnison en points : un liseré sombre pour se lire sur la prairie comme sur la mer. */
.ctl-dots {
  pointer-events: none;
}
.ctl-dots circle {
  stroke: var(--bg);
  stroke-width: 0.35;
}
.ctl-dots .d-c {
  fill: #5fd0ff; /* cyan : lisible sur prairie et mer, distinct du violet du fort */
}
.ctl-dots .d-m {
  fill: var(--text);
}
/* 🚶 En route (renfort, transfert, assaut) : orange plein, hors du cyan des champions et du
   clair des miliciens — la place est prise, la troupe n'y est pas encore. */
.ctl-dots .d-r {
  fill: var(--d3, #ffb23f);
}
.ctl-dots .d-f {
  fill: color-mix(in srgb, var(--bg) 70%, transparent);
  stroke: var(--dim);
  stroke-width: 0.35;
}
.ctl-dots.empty .d-f {
  stroke: var(--d4, #ff6a45);
}
.ctl-tier {
  font-size: 3px;
  font-weight: 800;
  text-anchor: middle;
  fill: var(--accent);
  paint-order: stroke;
  stroke: var(--bg);
  stroke-width: 0.8px;
  pointer-events: none;
  &.enemy {
    fill: var(--dim);
  }
}
.poi-rank {
  font-size: 3.2px;
  text-anchor: middle;
}
.poi-star {
  font-size: 2.6px;
  font-weight: 800;
  fill: var(--rk, var(--text));
  paint-order: stroke;
  stroke: var(--bg);
  stroke-width: 0.5px;
}
.van-target {
  opacity: 0.75;
}
/* 💀 Lieu ou armée TERRASSÉ : grisé et barré d'une croix, jusqu'au retour de ceux qui l'ont
   vaincu (le voyage s'achève, le lieu cesse d'être dessiné). Deux indices en plus de la
   couleur — l'opacité et la croix — pour que ça se lise sans elle. */
.poi.down {
  opacity: 0.6;
  filter: grayscale(1);
}
.poi.down .poi-bg {
  stroke: var(--dim);
  stroke-dasharray: none;
}
.down-x {
  stroke: var(--text);
  stroke-width: 0.6;
  stroke-linecap: round;
  fill: none;
  pointer-events: none;
}
.van-target .poi-bg {
  stroke: #b57bff;
  stroke-width: 0.8;
}
/* Groupes ⚔️ : liseré pointillé sur la cible — lisible sans la couleur ni l'emoji. */
.van-target.party .poi-bg {
  stroke-width: 1;
  stroke-dasharray: 1.2 0.9;
}
/* ⚔️ Un lieu attaqué qu'on a touché : le liseré de sélection, par-dessus celui du voyage. */
.poi.target.sel .poi-bg {
  stroke: var(--accent);
  stroke-width: 1.7;
  stroke-dasharray: none;
}
</style>
