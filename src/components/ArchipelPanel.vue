<!--
  🏝️ LA VUE D'ENSEMBLE DE L'ARCHIPEL (étape 1 de la roadmap `2026-10-01-carte-archipel-roadmap`).
  Réservée à l'admin pendant le développement : une tuile REPLIABLE (même langage que les
  filtres de la carte) qui dit sur quelle île on joue, et dépliée la CARTE de l’archipel (les cinq silhouettes,
  reliées par les routes de traversée) et la fiche de l’île touchée. Elle porte aussi
  l'interrupteur du mode. ⚠️ Repliée à chaque ouverture : la carte passe avant.
-->
<template>
  <div class="arch" :class="{ open, on: !!island }">
    <button
      type="button"
      class="arch-head"
      :aria-expanded="open"
      aria-controls="archipel-islands"
      @click="open = !open"
    >
      <span class="arch-ico" aria-hidden="true">🏝️</span>
      <span class="arch-title">Archipel</span>
      <span class="arch-sum">
        <template v-if="crossing">⛵ en mer vers l'île {{ crossing.to }}</template>
        <template v-else-if="island"
          >{{ island.emoji }} Île {{ island.id }} · {{ island.name
          }}{{ conquest?.pacified ? ' · 🕊️ pacifiée' : '' }}</template
        >
        <template v-else>mode désactivé · admin</template>
      </span>
      <span class="arch-chev" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>

    <div v-if="open" id="archipel-islands" class="arch-body">
      <!-- ⛵ La traversée réservée ou en cours. -->
      <div v-if="crossing" class="arch-sea">
        <span class="as-emo" aria-hidden="true">⛵</span>
        <span class="as-txt">
          <b>Vers l'île {{ crossing.to }}</b>
          <template v-if="now < crossing.departAt">
            · départ à {{ clock(crossing.departAt) }} (dans
            {{ formatDuration(crossing.departAt - now) }})
          </template>
          <template v-else>
            · en mer, arrivée à {{ clock(crossing.arriveAt) }} (dans
            {{ formatDuration(Math.max(0, crossing.arriveAt - now)) }})
          </template>
          <span class="as-sub"
            >Le héros et {{ crossing.ids.length }} champion{{
              crossing.ids.length > 1 ? 's' : ''
            }}
            à bord</span
          >
        </span>
      </div>
      <!-- 🗺️ LA CARTE DE L'ARCHIPEL : les cinq îles (leur vraie silhouette), reliées par les
           routes de traversée. Toucher une île en montre la fiche juste dessous. -->
      <svg class="arch-map" viewBox="0 0 330 182" role="group" aria-label="Carte de l’archipel">
        <defs>
          <radialGradient id="arch-sea" cx="50%" cy="50%" r="75%">
            <stop offset="0" stop-color="#2a6a88" />
            <stop offset="1" stop-color="#122f45" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="330" height="182" rx="8" fill="url(#arch-sea)" />
        <path v-for="(w, i) in SEA_WAVES" :key="'w' + i" :d="w" class="am-wave" />
        <path
          v-for="r in routes"
          :key="'r' + r.from"
          :d="r.d"
          class="am-route"
          :class="{ open: r.open }"
        />
        <g
          v-for="i in tiles"
          :key="i.id"
          class="am-isl"
          :class="{ active: i.active, locked: i.locked, sel: sel === i.id }"
          role="button"
          tabindex="0"
          :aria-label="`Île ${i.id} · ${i.name}`"
          :aria-pressed="sel === i.id"
          @click="sel = i.id"
          @keydown.enter.prevent="sel = i.id"
          @keydown.space.prevent="sel = i.id"
        >
          <circle :cx="i.x" :cy="i.y" r="34" class="am-hit" />
          <path :d="i.outline" class="am-shoal" :style="{ stroke: i.style.shoal }" />
          <path :d="i.outline" :fill="i.style.land0" :stroke="i.style.sand" class="am-land" />
          <text :x="i.x" :y="i.y + 4" class="am-emo">{{ i.locked ? '🔒' : i.emoji }}</text>
          <text :x="i.x" :y="i.y + 40" class="am-name">Île {{ i.id }}</text>
          <g v-if="i.active" class="am-here">
            <circle :cx="i.x + 22" :cy="i.y - 22" r="6" />
            <text :x="i.x + 22" :y="i.y - 19.6">⚓</text>
          </g>
        </g>
      </svg>

      <div
        v-if="selTile"
        class="arch-tile"
        :class="{ active: selTile.active, locked: selTile.locked }"
        :style="{ '--a': selTile.color }"
      >
        <div class="at-top">
          <span class="at-emo" aria-hidden="true">{{ selTile.emoji }}</span>
          <span class="at-num">Île {{ selTile.id }} · {{ selTile.name }}</span>
          <span v-if="selTile.active" class="at-chip">Tu es ici</span>
          <span v-else-if="!selTile.locked" class="at-chip open">⛵ ouverte</span>
          <span v-else class="at-chip dim">🔒 à venir</span>
        </div>
        <div class="at-ranks">
          <span class="at-rank" :style="{ '--rk': selTile.lo.color }">{{ selTile.lo.name }}</span>
          <span class="at-rank" :style="{ '--rk': selTile.hi.color }">{{ selTile.hi.name }}</span>
          <span class="at-lvl">niv. {{ selTile.minLevel }}-{{ selTile.maxLevel }}</span>
        </div>
        <div class="at-threat">⚔️ {{ selTile.threat }}</div>
        <div class="at-fort">🏰 {{ selTile.fortress }}</div>
        <!-- 🏝️ La conquête de l'île active : objectifs abattus, forteresse, pacification. -->
        <div v-if="selTile.active && conquest" class="at-conq">
          <span
            class="at-pill"
            :class="{ done: conquest.objectivesDown >= conquest.objectivesTotal }"
            >{{ selTile.objectiveEmoji }} {{ conquest.objectivesDown }}/{{
              conquest.objectivesTotal
            }}
            abattus</span
          >
          <span class="at-pill" :class="{ done: conquest.fortressDown, dim: conquest.locked }">{{
            conquest.fortressDown
              ? '🏰 abattue'
              : conquest.locked
                ? '🔒 forteresse verrouillée'
                : '🏰 forteresse à abattre'
          }}</span>
          <span v-if="conquest.pacified" class="at-pill done">🕊️ île pacifiée</span>
        </div>
        <!-- ⛵ Les champions restés sur cette île, et la traversée pour la rejoindre. -->
        <div v-if="awayOn(selTile.id)" class="at-away">
          ⛵ {{ awayOn(selTile.id) }} champion{{ awayOn(selTile.id) > 1 ? 's' : '' }} resté{{
            awayOn(selTile.id) > 1 ? 's' : ''
          }}
          ici{{
            selTile.visited && !selTile.active ? ' · ses lieux tenus produisent à distance' : ''
          }}
        </div>
        <template v-if="island && !selTile.active && !selTile.locked">
          <p v-if="blocks?.[selTile.id]" class="at-block">{{ blocks[selTile.id] }}</p>
          <button
            v-else
            type="button"
            class="at-cross"
            :disabled="busy"
            @click="$emit('cross', selTile.id)"
          >
            <span class="ac-main">⛵ Traverser vers l'île {{ selTile.id }}</span>
            <span class="ac-sub"
              >Départ à {{ clock(departAt) }} · arrivée {{ clock(departAt + CROSSING.travelMs) }} ·
              le héros et {{ travellers ?? 0 }} champion{{ (travellers ?? 0) > 1 ? 's' : '' }}</span
            >
          </button>
        </template>
        <p v-else-if="island && selTile.locked" class="at-block">
          🔒 Abats {{ prevFortress(selTile.id) }} pour ouvrir la traversée.
        </p>
      </div>
      <p v-if="island" class="arch-note">
        Lieux plafonnés au rang {{ islandCapRank }}, trajets selon la seule distance, carte à la
        taille de l'île : l'Avant-poste ne règle plus que la vitesse.
      </p>
      <button type="button" class="arch-toggle" :disabled="busy" @click="$emit('toggle', !island)">
        {{ island ? 'Quitter le mode archipel' : '🏝️ Activer le mode archipel (admin)' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ISLANDS, type Island } from '@/lib/archipelago';
import { CROSSING, nextCrossingDeparture } from '@/lib/crossing';
import { formatDuration } from '@/lib/duration';
import type { Crossing } from '@/lib/expedition';
import { characterRank } from '@/lib/characterRank';
import { ISLAND_STYLES, islandOutline } from '@/lib/islandTerrain';

const props = defineProps<{
  island: Island | null;
  busy?: boolean;
  /** 🏝️ Où en est la conquête de l'île active (`islandConquest`). */
  conquest?: {
    objectivesDown: number;
    objectivesTotal: number;
    fortressDown: boolean;
    locked: boolean;
    pacified: boolean;
  } | null;
  /** ⛵ Les îles ouvertes à la traversée (`openIslands`) et celles déjà visitées. */
  openIds?: number[];
  visitedIds?: number[];
  /** ⛵ La traversée réservée ou en cours. */
  crossing?: Crossing | null;
  /** ⛵ Pourquoi on ne peut pas traverser vers chaque île (texte), null si possible. */
  blocks?: Record<number, string | null>;
  /** ⛵ Combien de champions embarqueraient maintenant (les libres). */
  travellers?: number;
  /** ⛵ Champions restés sur chaque autre île. */
  away?: Record<number, number>;
  now: number;
}>();
defineEmits<{ toggle: [on: boolean]; cross: [to: number] }>();

/** Heure d'horloge (« 14:00 »). */
const clock = (t: number) =>
  new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const departAt = computed(() => nextCrossingDeparture(props.now));
const awayOn = (id: number) => props.away?.[id] ?? 0;
const prevFortress = (id: number) => ISLANDS.find((i) => i.id === id - 1)?.fortress ?? '';

const open = ref(false);

/** Où chaque île se pose sur la carte de l'archipel (une chaîne, d'ouest en est). */
const POS: Record<number, [number, number]> = {
  1: [44, 112],
  2: [108, 56],
  3: [168, 120],
  4: [228, 56],
  5: [290, 114],
};
/** Échelle d'une silhouette : une île (rayon ≤ 100) tient dans ~34 unités. */
const SCALE = 0.34;
const SEA_WAVES = [
  'M18 30q3 -2.4 6 0q3 2.4 6 0',
  'M150 20q3 -2.4 6 0q3 2.4 6 0',
  'M300 30q3 -2.4 6 0q3 2.4 6 0',
  'M82 150q3 -2.4 6 0q3 2.4 6 0',
  'M210 154q3 -2.4 6 0q3 2.4 6 0',
  'M265 160q3 -2.4 6 0q3 2.4 6 0',
];

const tiles = computed(() =>
  ISLANDS.map((i) => {
    const lo = characterRank(i.minLevel);
    const hi = characterRank(i.maxLevel);
    const [x, y] = POS[i.id]!;
    const active = props.island?.id === i.id;
    const reached = props.openIds?.length
      ? props.openIds.includes(i.id)
      : (props.island?.id ?? 1) >= i.id;
    const visited = !!props.visitedIds?.includes(i.id);
    return {
      ...i,
      lo,
      hi,
      x,
      y,
      style: ISLAND_STYLES[i.id]!,
      outline: islandOutline(i.id, x, y, SCALE),
      color: hi.color,
      active,
      visited,
      locked: !reached,
    };
  }),
);
/** Les routes de traversée : d'une île à la suivante, ouvertes jusqu'à l'île active. */
const routes = computed(() =>
  ISLANDS.slice(0, -1).map((i) => {
    const [x1, y1] = POS[i.id]!;
    const [x2, y2] = POS[i.id + 1]!;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 + (y1 < y2 ? -14 : 14);
    return {
      from: i.id,
      d: `M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`,
      open: props.openIds?.length
        ? props.openIds.includes(i.id + 1)
        : (props.island?.id ?? 1) > i.id,
    };
  }),
);
const sel = ref(props.island?.id ?? 1);
const selTile = computed(() => tiles.value.find((t) => t.id === sel.value) ?? null);
const islandCapRank = computed(() =>
  props.island ? characterRank(props.island.maxLevel).name : '',
);
</script>

<style scoped lang="scss">
.arch {
  margin: 0 12px 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  overflow: hidden;
}
.arch.on {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}
.arch-head {
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: none;
  border: none;
  color: var(--text);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.arch-head:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.arch-ico {
  font-size: 14px;
}
.arch-title {
  font-weight: 700;
  font-size: 13px;
}
.arch-sum {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--dim);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.arch-chev {
  color: var(--dim);
  font-size: 12px;
}
.arch-body {
  padding: 4px 12px 12px;
}
.arch-map {
  display: block;
  width: 100%;
  height: auto;
  margin-bottom: 10px;
}
.am-wave {
  fill: none;
  stroke: #ffffff;
  stroke-opacity: 0.2;
  stroke-width: 0.8;
  stroke-linecap: round;
}
.am-route {
  fill: none;
  stroke: #e9dfc8;
  stroke-opacity: 0.35;
  stroke-width: 1.4;
  stroke-dasharray: 3 3;
}
.am-route.open {
  stroke: var(--accent);
  stroke-opacity: 0.9;
  stroke-dasharray: none;
}
.am-isl {
  cursor: pointer;
  outline: none;
}
.am-hit {
  fill: transparent;
}
.am-shoal {
  fill: none;
  stroke-width: 4;
  stroke-opacity: 0.55;
}
.am-land {
  stroke-width: 1.2;
}
.am-isl.locked .am-land,
.am-isl.locked .am-shoal {
  opacity: 0.45;
}
.am-isl.active .am-land {
  filter: drop-shadow(0 0 3px var(--accent));
}
.am-isl.sel .am-land {
  stroke: #ffffff;
  stroke-width: 1.8;
}
.am-isl:focus-visible .am-land {
  stroke: var(--accent);
  stroke-width: 2;
}
.am-emo {
  font-size: 14px;
  text-anchor: middle;
  pointer-events: none;
}
.am-name {
  font-size: 9px;
  font-weight: 700;
  fill: #f3eee6;
  stroke: #0e1a24;
  stroke-width: 2.2;
  paint-order: stroke;
  text-anchor: middle;
  pointer-events: none;
}
.am-here circle {
  fill: var(--accent);
  stroke: #15120e;
  stroke-width: 1;
}
.am-here text {
  font-size: 7px;
  text-anchor: middle;
  pointer-events: none;
}
.arch-tile {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px;
  background: var(--surface-2, var(--bg));
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.arch-tile.active {
  border-color: var(--a);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--a) 40%, transparent);
}
.arch-tile.locked {
  opacity: 0.6;
}
.at-top {
  display: flex;
  align-items: center;
  gap: 5px;
}
.at-emo {
  font-size: 16px;
}
.at-num {
  font-family: 'Oswald', sans-serif;
  font-size: 13px;
  font-weight: 600;
}
.at-chip {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent);
  color: #15120e;
  white-space: nowrap;
}
.at-chip.dim {
  background: transparent;
  color: var(--dim);
  box-shadow: inset 0 0 0 1px var(--line);
}
.at-name {
  font-size: 12px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.at-ranks {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.at-rank {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  color: var(--rk);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rk) 60%, transparent);
}
.at-lvl {
  font-size: 10px;
  color: var(--dim);
}
.at-threat,
.at-fort {
  font-size: 11px;
  color: var(--dim);
  overflow-wrap: anywhere;
}
.at-conq {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.at-pill {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2, var(--surface));
  color: var(--text);
}
.at-pill.done {
  border-color: color-mix(in srgb, var(--d1) 60%, var(--line));
  color: var(--d1);
}
.at-pill.dim {
  color: var(--dim);
}
.at-chip.open {
  background: #5aa9d6;
  color: #0e1a22;
}
.arch-sea {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 4px 0 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, #5aa9d6 18%, var(--surface));
  border: 1px solid color-mix(in srgb, #5aa9d6 50%, var(--line));
  font-size: 12px;
}
.as-emo {
  font-size: 20px;
  line-height: 1;
}
.as-txt {
  flex: 1;
  min-width: 0;
}
.as-sub {
  display: block;
  color: var(--dim);
  margin-top: 2px;
}
.at-away {
  margin-top: 8px;
  font-size: 12px;
  color: #8cc7e6;
}
.at-block {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--dim);
}
.at-cross {
  margin-top: 10px;
  width: 100%;
  min-height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 10px;
  border-radius: 10px;
  border: none;
  background: #5aa9d6;
  color: #0e1a22;
  font: inherit;
  cursor: pointer;
}
.at-cross:disabled {
  opacity: 0.5;
}
.ac-main {
  font-weight: 800;
  font-size: 14px;
}
.ac-sub {
  font-size: 11px;
  text-align: center;
}
.arch-note {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--dim);
}
.arch-toggle {
  margin-top: 10px;
  width: 100%;
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.arch-toggle:disabled {
  opacity: 0.5;
}
</style>
