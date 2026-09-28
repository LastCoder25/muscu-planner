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
      <div
        v-for="r in rows"
        :key="r.poi.id"
        class="cps-tile"
        :class="['st-' + r.status, { open: openId === r.poi.id }]"
        :style="{ '--rk': rankOf(r).color }"
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
              <span class="pill rk"
                >{{ rankOf(r).emoji }} {{ rankOf(r).name }} {{ rankStarStr(rankOf(r).star) }}</span
              >
              <span class="pill st">{{ STATUS[r.status] }}</span>
              <span v-if="r.status !== 'enemy' && r.status !== 'assault'" class="pill">
                🛡️ {{ r.garrison.length }}/{{ r.seats }}
              </span>
              <span v-if="r.reinforcing.length" class="pill"
                >🧭 +{{ r.reinforcing.length }} en route</span
              >
              <span v-if="r.ready" class="pill go">🎁 à récolter</span>
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
import type { Adventurer } from '@/lib/adventurers';
import { rankStarStr } from '@/lib/characterRank';
import {
  CONTROL_EMO,
  CONTROL_LABEL,
  CONTROL_YIELD,
  type ControlRosterRow,
  type ControlRosterStatus,
} from '@/lib/controlPoints';
import { formatDuration } from '@/lib/duration';
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
.pill.go {
  background: var(--accent);
  color: #15120e;
  border-color: var(--accent);
  font-weight: 700;
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
