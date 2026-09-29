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
      <template v-else-if="p.control">
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
        <!-- ⚔️ Bataille imminente : un petit avertissement au coin du fort, qui palpite. -->
        <g v-if="imminent.has(p.id)" class="ctl-alert">
          <circle :cx="p.x - 5.2" :cy="p.y - 5.2" r="2.9" />
          <text :x="p.x - 5.2" :y="p.y - 4">!</text>
        </g>
      </template>
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
        :y="p.y - (isRiftPoi(p) ? RIFT_MAP_ICON.dy + 0.5 : 5.4)"
        class="poi-rank"
      >
        {{ rankOf(p).emoji }}
        <tspan class="poi-star">{{ rankOf(p).star }}★</tspan>
      </text>
    </g>

    <!-- Objectif du héros. 🌀 Une faille garde son PORTAIL même quand on y va ou qu'on en
         revient : la pastille d'avant ne se reconnaissait plus d'un écran à l'autre. -->
    <g
      v-if="target"
      class="poi target"
      :class="{ 'rift-target': isRiftPoi(target), down: targetDown }"
    >
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
      :class="[v.kind, { 'rift-target': isRiftPoi(v.poi), down: v.down }]"
    >
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
  fill: color-mix(in srgb, #b57bff 24%, var(--surface));
  stroke: #b57bff;
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
  fill: #b57bff;
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
</style>
