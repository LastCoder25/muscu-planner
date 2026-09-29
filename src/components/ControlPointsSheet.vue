<template>
  <!-- 🗂️ LES POINTS FIXES, EN UNE LISTE (2026-09-28, demandé : « une icône au-dessus du
       dézoom qui liste les lieux fixes pour en faire la gestion »). Une tuile par point :
       son rang, qui le tient, ce qui appelle une action. Toucher une tuile la déplie : qui
       est dessus, qui y va. Les ACTIONS (attaquer, renforcer, ramener, récolter) restent
       celles de la fiche du lieu — « Gérer » l'ouvre : deux écrans qui font la même chose
       finiraient par se contredire. -->
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="cps">
      <div class="cps-head">
        <span class="cps-title">🏰 Places fortes</span>
        <span class="cps-sum">{{ heldCount }}/{{ rows.length }} tenus</span>
        <button
          type="button"
          class="cps-x"
          aria-label="Fermer"
          @click="emit('update:modelValue', false)"
        >
          ✕
        </button>
      </div>
      <p v-if="!rows.length" class="cps-empty">Aucune place forte sur ta carte pour l’instant.</p>
      <!-- 🔎 Filtres par statut (demandé : « tenu, pas tenu, vide »), avec leur nombre. Une
           catégorie vide n'est pas proposée : une pastille « 0 » n'apprend rien. -->
      <div v-if="filterChips.length > 1" class="cps-filters" role="group" aria-label="Filtrer">
        <button
          type="button"
          class="cps-chip"
          :class="{ on: activeFilter === null }"
          :aria-pressed="activeFilter === null"
          @click="filter = null"
        >
          Toutes · {{ rows.length }}
        </button>
        <button
          v-for="c in filterChips"
          :key="c.id"
          type="button"
          class="cps-chip"
          :class="['f-' + c.id, { on: activeFilter === c.id }]"
          :aria-pressed="activeFilter === c.id"
          @click="filter = activeFilter === c.id ? null : c.id"
        >
          {{ CONTROL_FILTER_LABEL[c.id] }} · {{ c.n }}
        </button>
      </div>
      <div
        v-for="r in shownRows"
        :key="r.poi.id"
        class="cps-tile"
        :class="['st-' + r.status, { open: openId === r.poi.id }]"
        :style="{ '--rk': isHeldControl(r.poi) ? HELD_COLOR : rankOf(r).color }"
      >
        <button
          type="button"
          class="cps-row"
          :aria-expanded="openId === r.poi.id"
          @click="toggle(r.poi.id)"
        >
          <span class="cps-emo">{{ CONTROL_EMO[r.kind] }}</span>
          <span class="cps-main">
            <span class="cps-name">{{ CONTROL_LABEL[r.kind] }}</span>
            <span class="cps-pills">
              <span v-if="!isHeldControl(r.poi)" class="pill rk"
                >{{ rankOf(r).emoji }} {{ rankOf(r).name }} {{ rankStarStr(rankOf(r).star) }}</span
              >
              <span class="pill st">{{ STATUS[r.status] }}</span>
              <span v-if="r.reinforcing.length" class="pill"
                >🧭 +{{ r.reinforcing.length }} en route</span
              >
            </span>
            <!-- 🖼️ Qui tient la place, d'un coup d'œil (demandé) : une case par place (1 à N),
                 remplie d'une miniature par champion ou milicien posté, numérotée si libre.
                 Elle remplace la pastille « 🛡️ 2/5 » : les cases disent la même chose. -->
            <span v-if="r.status !== 'enemy' && r.status !== 'assault'" class="cps-minis">
              <template v-for="(s, i) in slotsOf(r)" :key="i">
                <span v-if="s.kind === 'adv'" class="mini" :title="s.adv.name"
                  ><ChampionPortrait :champion-id="s.adv.championId">{{
                    advTitle(s.adv)?.emoji ?? '🧑'
                  }}</ChampionPortrait></span
                >
                <span v-else-if="s.kind === 'mil'" class="mini mil" :title="MILITIA_NAME">{{
                  MILITIA_EMO
                }}</span>
                <span v-else class="mini free" :title="`Place ${i + 1} libre`">{{ i + 1 }}</span>
              </template>
            </span>
          </span>
          <!-- 📊 Tenu : où en est la récolte (or, XP, %…). Pas tenu : ce qu'il rapporterait. -->
          <span v-if="r.progress" class="cps-yield-end prog" :class="{ full: isFull(r) }">
            <span>{{ r.progress.text }}</span>
            <span v-if="r.progress.pct !== null" class="cps-gauge"
              ><span :style="{ width: Math.round(r.progress.pct * 100) + '%' }"
            /></span>
          </span>
          <span v-else class="cps-yield-end">{{ CONTROL_YIELD[r.kind] }}</span>
          <span class="cps-chev">{{ openId === r.poi.id ? '▾' : '▸' }}</span>
        </button>
        <div v-if="openId === r.poi.id" class="cps-body">
          <p v-if="r.progress" class="cps-line dim">Rapporte : {{ CONTROL_YIELD[r.kind] }}</p>
          <template v-if="r.status === 'enemy' || r.status === 'assault'">
            <p class="cps-line">
              {{ FACTION_EMOJI[r.poi.control!.faction] }} Tenu par
              {{ FACTION_LABEL[r.poi.control!.faction] }} · force ≈
              {{ fmtSize(r.poi.control!.size) }} champion{{ r.poi.control!.size > 1 ? 's' : '' }}
            </p>
            <template v-if="r.assault">
              <p class="cps-sec">
                ⚔️ Équipe d’assaut · arrivée dans {{ formatDuration(r.assault.inMs) }}
              </p>
              <div class="cps-advs">
                <AdvPickTile
                  v-for="a in advsOf(r.assault.ids)"
                  :key="a.id"
                  :adv="a"
                  :on="false"
                  readonly
                />
              </div>
            </template>
          </template>
          <template v-else>
            <p v-if="r.status === 'imminent'" class="cps-line alert">
              ⚠️ Bataille imminente — un renfort proche peut encore arriver à temps.
            </p>
            <p v-if="r.status === 'empty'" class="cps-line warn">
              ⚠️ Sans défense : il ne produit plus, et l’ennemi le reprendra à sa prochaine attaque.
            </p>
            <p class="cps-sec">🛡️ En garnison</p>
            <div v-if="r.garrison.length" class="cps-advs">
              <AdvPickTile
                v-for="a in advsOf(r.garrison)"
                :key="a.id"
                :adv="a"
                :on="false"
                readonly
              />
              <!-- 🛡️ Les miliciens : anonymes, une tuile chacun (comme sur la carte). -->
              <div v-for="id in milOf(r.garrison)" :key="id" class="mil-tile">
                <span class="mil-emo">{{ MILITIA_EMO }}</span>
                <span class="mil-name">{{ MILITIA_NAME }}</span>
              </div>
            </div>
            <p v-else class="cps-line dim">Personne.</p>
            <template v-if="r.reinforcing.length">
              <p class="cps-sec">🧭 En route (renfort)</p>
              <div class="cps-advs">
                <AdvPickTile
                  v-for="x in reinfOf(r)"
                  :key="x.adv.id"
                  :adv="x.adv"
                  :on="false"
                  readonly
                  :reason="`arrivée dans ${formatDuration(x.inMs)}`"
                />
                <div v-for="x in milReinfOf(r)" :key="x.id" class="mil-tile">
                  <span class="mil-emo">{{ MILITIA_EMO }}</span>
                  <span class="mil-name">{{ MILITIA_NAME }}</span>
                  <span class="mil-sub">🧭 {{ formatDuration(x.inMs) }}</span>
                </div>
              </div>
            </template>
          </template>
          <button type="button" class="cps-go" @click="emit('open', r.poi)">
            {{ ACTION[r.status] }}
          </button>
        </div>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AdvPickTile from '@/components/AdvPickTile.vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { advTitle, type Adventurer } from '@/lib/adventurers';
import { rankStarStr } from '@/lib/characterRank';
import {
  CONTROL_EMO,
  CONTROL_LABEL,
  CONTROL_YIELD,
  CONTROL_FILTERS,
  CONTROL_FILTER_LABEL,
  controlFilterOf,
  HELD_COLOR,
  isHeldControl,
  type ControlFilter,
  type ControlRosterRow,
  type ControlRosterStatus,
} from '@/lib/controlPoints';
import { formatDuration } from '@/lib/duration';
import { MILITIA_EMO, MILITIA_NAME, isMilitiaId } from '@/lib/militia';
import type { Poi } from '@/lib/expedition';
import { poiRank } from '@/lib/poiRank';
import { FACTION_EMOJI, FACTION_LABEL } from '@/lib/raid';

const props = defineProps<{
  modelValue: boolean;
  rows: ControlRosterRow[];
  advs: readonly Adventurer[];
}>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; open: [Poi] }>();

const STATUS: Record<ControlRosterStatus, string> = {
  enemy: '☠️ ennemi',
  assault: '⚔️ assaut en cours',
  held: '🏰 tenu',
  empty: '⚠️ sans défense',
  imminent: '⚠️ attaque imminente',
};
const ACTION: Record<ControlRosterStatus, string> = {
  enemy: '⚔️ Attaquer',
  assault: '🗺️ Voir sur la carte',
  held: '🏰 Gérer · récolter, renforcer, ramener',
  empty: '➕ Envoyer des renforts',
  imminent: '➕ Renforcer',
};

/** 🔎 Le filtre choisi (`null` = toutes). S'il se vide (on vient de reprendre la dernière
 *  place « pas tenue »), la liste retombe sur toutes : sinon elle paraîtrait vide. */
const filter = ref<ControlFilter | null>(null);
const filterChips = computed(() =>
  CONTROL_FILTERS.map((id) => ({
    id,
    n: props.rows.filter((r) => controlFilterOf(r.status) === id).length,
  })).filter((c) => c.n > 0),
);
const activeFilter = computed(() =>
  filterChips.value.some((c) => c.id === filter.value) ? filter.value : null,
);
const shownRows = computed(() => {
  const f = activeFilter.value;
  return f ? props.rows.filter((r) => controlFilterOf(r.status) === f) : props.rows;
});
const openId = ref<string | null>(null);
const toggle = (id: string) => (openId.value = openId.value === id ? null : id);
const heldCount = computed(
  () => props.rows.filter((r) => r.status !== 'enemy' && r.status !== 'assault').length,
);
const byId = computed(() => new Map(props.advs.map((a) => [a.id, a])));
const advsOf = (ids: readonly string[]) =>
  ids.flatMap((id) => {
    const a = byId.value.get(id);
    return a ? [a] : [];
  });
/** 🛡️ Les miliciens d'une garnison : ils n'existent pas dans le vivier (`advsOf` les ignore). */
const milOf = (ids: readonly string[]) => ids.filter(isMilitiaId);
const milReinfOf = (r: ControlRosterRow) => r.reinforcing.filter((x) => isMilitiaId(x.id));
type Slot = { kind: 'adv'; adv: Adventurer } | { kind: 'mil' } | { kind: 'free' };
/** Les cases de la ligne : champions, puis miliciens, puis places libres, jusqu'à `seats`. */
const slotsOf = (r: ControlRosterRow): Slot[] => {
  const filled: Slot[] = [
    ...advsOf(r.garrison).map((adv) => ({ kind: 'adv' as const, adv })),
    ...milOf(r.garrison).map(() => ({ kind: 'mil' as const })),
  ];
  const free = Math.max(0, r.seats - filled.length);
  return [...filled, ...Array.from({ length: free }, () => ({ kind: 'free' as const }))];
};
const reinfOf = (r: ControlRosterRow) =>
  r.reinforcing.flatMap((x) => {
    const adv = byId.value.get(x.id);
    return adv ? [{ adv, inMs: x.inMs }] : [];
  });
const rankOf = (r: ControlRosterRow) => poiRank(r.poi);
/** Réserve pleine (or/XP) ou unité prête (consommable, rune) : la jauge passe à l'accent. */
const isFull = (r: ControlRosterRow) =>
  !!r.progress && r.progress.pct !== null && r.progress.pct >= 0.999;
const fmtSize = (n: number) => String(n).replace('.', ',');
</script>

<style scoped>
.cps {
  width: 100%;
  max-width: 560px;
  max-height: 80dvh;
  overflow-y: auto;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 12px 12px 20px;
}
.cps-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.cps-title {
  font-family: Oswald, sans-serif;
  font-size: 18px;
  font-weight: 700;
}
.cps-sum {
  color: var(--dim);
  font-size: 13px;
  flex: 1;
}
.cps-x {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.cps-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.cps-chip {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
}
.cps-chip.on {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
}
.cps-empty {
  color: var(--dim);
}
.cps-tile {
  border: 1px solid var(--line);
  border-left: 4px solid var(--rk);
  border-radius: 12px;
  background: var(--surface-2, var(--bg));
  margin-bottom: 8px;
  overflow: hidden;
}
.cps-tile.st-imminent,
.cps-tile.st-empty {
  border-color: var(--d4);
  border-left-color: var(--rk);
}
.cps-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.cps-emo {
  font-size: 26px;
  flex: 0 0 auto;
}
.cps-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cps-name {
  font-weight: 700;
}
.cps-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pill {
  font-size: 11.5px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  white-space: nowrap;
}
.pill.rk {
  border-color: color-mix(in srgb, var(--rk) 60%, transparent);
  color: var(--rk);
}
.st-enemy .pill.st {
  color: var(--dim);
}
.st-held .pill.st {
  color: var(--d1);
  border-color: color-mix(in srgb, var(--d1) 50%, transparent);
}
.st-assault .pill.st {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}
.st-empty .pill.st,
.st-imminent .pill.st {
  color: var(--d4);
  border-color: color-mix(in srgb, var(--d4) 50%, transparent);
}
/* Toutes les places sur UNE ligne (demandé) : les cases rétrécissent plutôt que de passer
   à la ligne — à 344 px la colonne ne laisse qu'environ 120 px pour 5 cases. */
.cps-minis {
  display: flex;
  flex-wrap: nowrap;
  gap: 3px;
  min-width: 0;
}
.mini {
  display: grid;
  place-items: center;
  flex: 0 1 28px;
  min-width: 0;
  aspect-ratio: 1;
  font-size: 17px;
  line-height: 1;
  border-radius: 7px;
  background: var(--surface);
  border: 1px solid var(--line);
  overflow: hidden;
}
/* Le portrait remplit sa case, quelle que soit sa taille. */
.mini :deep(.cp) {
  width: 100%;
  height: 100%;
  border-radius: 0;
}
.mini.free {
  font-family: Oswald, sans-serif;
  font-size: 12px;
  color: var(--dim);
  background: transparent;
  border-style: dashed;
}
.cps-chev {
  color: var(--dim);
}
.cps-body {
  padding: 0 10px 10px;
}
.cps-yield-end {
  flex: 0 1 34%;
  max-width: 120px;
  text-align: right;
  font-size: 11.5px;
  line-height: 1.25;
  color: var(--accent);
  font-weight: 600;
}
.cps-yield-end.prog {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-family: Oswald, sans-serif;
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
}
.cps-gauge {
  display: block;
  width: 56px;
  height: 5px;
  border-radius: 3px;
  background: var(--line);
  overflow: hidden;
}
.cps-gauge > span {
  display: block;
  height: 100%;
  background: var(--d1);
}
/* Réserve pleine : la production s'arrête, c'est le moment de récolter. */
.cps-yield-end.prog.full {
  color: var(--accent);
}
.cps-yield-end.prog.full .cps-gauge > span {
  background: var(--accent);
}
.cps-line {
  font-size: 13px;
  margin: 4px 0;
}
.dim {
  color: var(--dim);
}
.warn,
.alert {
  color: var(--d4);
}
.cps-sec {
  font-size: 12.5px;
  font-weight: 700;
  margin: 10px 0 6px;
}
.cps-advs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.mil-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 64px;
  padding: 6px 4px;
  border-radius: 12px;
  border: 1px dashed var(--line);
  background: var(--surface);
  color: var(--text);
}
.mil-emo {
  font-size: 22px;
  line-height: 1;
}
.mil-name {
  font-size: 11.5px;
  font-weight: 600;
}
.mil-sub {
  font-size: 10.5px;
  color: var(--dim);
}
.cps-go {
  margin-top: 10px;
  width: 100%;
  min-height: 44px;
  border-radius: 10px;
  border: 0;
  background: var(--accent);
  color: #15120e;
  font-weight: 700;
  cursor: pointer;
}
</style>
