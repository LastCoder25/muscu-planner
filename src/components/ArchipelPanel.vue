<!--
  🏝️ LES CINQ ÎLES DE L'ARCHIPEL, en tête de la carte (v1.40.2, demandé par l'utilisateur : « à la
  place de la liste archipel, les 5 options des 5 îles, cadenas pour celles encore bloquées »).
  Une rangée de cinq tuiles basses (44 px) — la carte doit toujours finir en bas de l'écran ;
  toucher une île déplie sa fiche (traversée, conquête, réserve) juste dessous, la toucher
  encore la replie. ⚠️ Repliée à chaque ouverture : la carte passe avant.
-->
<template>
  <div class="arch">
    <div class="isl-row" role="group" aria-label="Les îles de l’archipel">
      <button
        v-for="i in tiles"
        :key="i.id"
        type="button"
        class="isl"
        :class="{ active: i.active, locked: i.locked, sel: open && sel === i.id, sea: i.sea }"
        :style="{ '--a': i.color }"
        :aria-label="`Île ${i.id} · ${i.name}${i.locked ? ' (verrouillée)' : ''}`"
        :aria-current="i.active ? 'location' : undefined"
        :aria-expanded="open && sel === i.id"
        aria-controls="archipel-island"
        @click="pick(i.id)"
      >
        <span class="isl-emo" aria-hidden="true">{{ i.locked ? '🔒' : i.emoji }}</span>
        <span class="isl-num">Île {{ i.id }}</span>
        <span v-if="i.active" class="isl-tag" aria-hidden="true">📍</span>
        <span v-else-if="i.sea" class="isl-tag" aria-hidden="true">⛵</span>
      </button>
    </div>

    <div v-if="open" id="archipel-island" class="arch-body">
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
      <!-- ⛵ Les champions qui naviguent seuls (option A). -->
      <div v-for="(s, k) in sailings ?? []" :key="'s' + k" class="arch-sea">
        <span class="as-emo" aria-hidden="true">⛵</span>
        <span class="as-txt">
          <b>Île {{ s.from }} → île {{ s.to }}</b>
          <template v-if="now < s.departAt">
            · départ à {{ clock(s.departAt) }} (dans {{ formatDuration(s.departAt - now) }})
          </template>
          <template v-else>
            · arrivée à {{ clock(s.arriveAt) }} (dans
            {{ formatDuration(Math.max(0, s.arriveAt - now)) }})
          </template>
          <span class="as-sub"
            >{{ s.ids.length }} champion{{ s.ids.length > 1 ? 's' : '' }} sans le héros</span
          >
        </span>
      </div>
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
          <span class="at-pill" :class="{ done: conquest.pointsHeld >= OBJECTIVES_AFTER_HELD }"
            >🏳️ {{ Math.min(conquest.pointsHeld, OBJECTIVES_AFTER_HELD) }}/{{
              OBJECTIVES_AFTER_HELD
            }}
            lieux tenus</span
          >
          <span
            class="at-pill"
            :class="{ done: conquest.objectivesDown >= conquest.objectivesTotal }"
            >{{ selTile.objectiveEmoji }} {{ conquest.objectivesDown }}/{{
              conquest.objectivesTotal
            }}
            pris</span
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
        <div v-if="selTile.visited || selTile.active" class="at-away mil">
          🛡️ {{ militiaOn(selTile.id) }} milicien{{ militiaOn(selTile.id) > 1 ? 's' : '' }} en
          réserve{{ selTile.active ? '' : ' · la Caserne continue de produire' }}
        </div>
        <!-- 🛡️ Île quittée : sa milice se gère d'ici, entre sa réserve et ses lieux fixes. -->
        <div v-if="!selTile.active && remote?.[selTile.id]?.length" class="at-remote">
          <div v-for="rp in remote[selTile.id]" :key="rp.id" class="ar-row">
            <span class="ar-name">{{ rp.emoji }} {{ rp.label }}</span>
            <span class="ar-count">🛡️ {{ rp.militia }}</span>
            <button
              type="button"
              class="ar-btn"
              :aria-label="`Ramener un milicien de ${rp.label}`"
              :disabled="busy || rp.militia < 1"
              @click="$emit('militia', { island: selTile.id, pointId: rp.id, delta: -1 })"
            >
              −
            </button>
            <button
              type="button"
              class="ar-btn"
              :aria-label="`Poster un milicien sur ${rp.label}`"
              :disabled="busy || rp.room < 1 || militiaOn(selTile.id) < 1"
              @click="$emit('militia', { island: selTile.id, pointId: rp.id, delta: 1 })"
            >
              +
            </button>
          </div>
        </div>
        <template v-if="island && !selTile.active && !selTile.locked">
          <!-- ⛵ Option A (2026-10-03) : le héros retenu bloque SA traversée, pas celle des
               champions vers une île déjà visitée — la feuille propose alors de les envoyer seuls. -->
          <p v-if="blocks?.[selTile.id]" class="at-block">{{ blocks[selTile.id] }}</p>
          <button
            v-if="!blocks?.[selTile.id] || selTile.visited"
            type="button"
            class="at-cross"
            :disabled="busy"
            @click="$emit('cross', selTile.id)"
          >
            <span class="ac-main">⛵ Traverser vers l'île {{ selTile.id }}</span>
            <span class="ac-sub"
              >Départ {{ heroDepartAt && heroDepartAt > departAt ? 'avec le héros' : '' }} à
              {{ clock(Math.max(departAt, heroDepartAt ?? 0)) }} · arrivée
              {{ clock(Math.max(departAt, heroDepartAt ?? 0) + CROSSING.travelMs) }} ·
              {{
                selTile.visited
                  ? 'avec ou sans le héros, tu choisis qui embarque'
                  : 'avec le héros, tu choisis les champions'
              }}</span
            >
          </button>
          <button
            v-if="fetchable?.[selTile.id]"
            type="button"
            class="at-cross alt"
            :disabled="busy"
            @click="$emit('fetch', selTile.id)"
          >
            <span class="ac-main"
              >⛵ Faire venir {{ fetchable[selTile.id] }} champion{{
                fetchable[selTile.id]! > 1 ? 's' : ''
              }}
              sur l'île {{ island.id }}</span
            >
            <span class="ac-sub">Ils naviguent seuls, sans le héros.</span>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ISLANDS, type Island } from '@/lib/archipelago';
import { CROSSING, nextCrossingDeparture, type RemotePoint } from '@/lib/crossing';
import { formatDuration } from '@/lib/duration';
import type { Crossing } from '@/lib/expedition';
import { characterRank } from '@/lib/characterRank';
import { OBJECTIVES_AFTER_HELD } from '@/lib/islandConquest';

const props = defineProps<{
  island: Island | null;
  busy?: boolean;
  /** 🏝️ Où en est la conquête de l'île active (`islandConquest`). */
  conquest?: {
    pointsHeld: number;
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
  /** ⛵ Champions LIBRES sur chaque autre île visitée : on peut les faire venir. */
  fetchable?: Record<number, number>;
  /** ⛵ Les navigations sans héros en cours. */
  sailings?: Crossing[];
  /** ⛵ Le départ avec le héros (après le retour des troupes encore en marche). */
  heroDepartAt?: number;
  /** ⛵ Champions restés sur chaque autre île. */
  away?: Record<number, number>;
  /** 🛡️ La réserve de milice de chaque île visitée (la milice ne traverse pas). */
  militia?: Record<number, number>;
  /** 🛡️ Les lieux fixes tenus de chaque île rangée, avec leur milice (`remotePoints`). */
  remote?: Record<number, RemotePoint[]>;
  now: number;
}>();
defineEmits<{
  cross: [to: number];
  fetch: [from: number];
  militia: [{ island: number; pointId: string; delta: number }];
}>();

/** Heure d'horloge (« 14:00 »). */
const clock = (t: number) =>
  new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const departAt = computed(() => nextCrossingDeparture(props.now));
const awayOn = (id: number) => props.away?.[id] ?? 0;
const militiaOn = (id: number) => props.militia?.[id] ?? 0;
const prevFortress = (id: number) => ISLANDS.find((i) => i.id === id - 1)?.fortress ?? '';

const open = ref(false);

const tiles = computed(() =>
  ISLANDS.map((i) => {
    const lo = characterRank(i.minLevel);
    const hi = characterRank(i.maxLevel);
    const active = props.island?.id === i.id;
    const reached = props.openIds?.length
      ? props.openIds.includes(i.id)
      : (props.island?.id ?? 1) >= i.id;
    const visited = !!props.visitedIds?.includes(i.id);
    return {
      ...i,
      lo,
      hi,
      /** ⛵ Une traversée (héros ou champions seuls) fait route vers elle. */
      sea: props.crossing?.to === i.id || !!props.sailings?.some((s) => s.to === i.id),
      color: hi.color,
      active,
      visited,
      locked: !reached,
    };
  }),
);
const sel = ref(props.island?.id ?? 1);
/** Toucher une île déplie sa fiche ; la même encore la replie. */
function pick(id: number) {
  if (open.value && sel.value === id) open.value = false;
  else {
    sel.value = id;
    open.value = true;
  }
}
const selTile = computed(() => tiles.value.find((t) => t.id === sel.value) ?? null);
const islandCapRank = computed(() =>
  props.island ? characterRank(props.island.maxLevel).name : '',
);
</script>

<style scoped lang="scss">
.arch {
  margin: 0 12px 6px;
}
/* 🏝️ Cinq colonnes égales, 44 px de haut : la carte garde le bas de l'écran. */
.isl-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  padding: 3px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
}
.isl {
  position: relative;
  height: 42px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 0 2px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: var(--surface-2, var(--bg));
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.isl:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.isl-emo {
  font-size: 15px;
  line-height: 1;
}
.isl-num {
  font-family: 'Oswald', sans-serif;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.isl-tag {
  position: absolute;
  top: -5px;
  right: -3px;
  font-size: 11px;
  line-height: 1;
}
/* 📍 Le sélecteur : l'île où l'on est est le segment PLEIN, comme un onglet choisi. */
.isl.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #15120e;
}
.isl.sea {
  border-color: #5aa9d6;
}
.isl.locked {
  color: var(--dim);
  background: transparent;
  border: 1px dashed var(--line);
}
.isl.sel {
  box-shadow: 0 0 0 2px var(--a);
}
.arch-body {
  padding: 8px 0 4px;
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
.at-away.mil {
  color: var(--dim);
}
.at-remote {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.ar-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.ar-count {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.ar-btn {
  width: 44px;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
}
.ar-btn:disabled {
  opacity: 0.35;
  cursor: default;
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
.at-cross.alt {
  background: transparent;
  color: var(--text);
  border: 1px solid #5aa9d6;
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
</style>
