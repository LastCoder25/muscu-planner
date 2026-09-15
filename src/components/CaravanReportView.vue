<template>
  <!-- Rapport d'un convoi : destination, temps de voyage, route, cargaison, puis le détail
       REPLIABLE des aventuriers et de leur XP. Toute la règle vit dans `caravanReport`. -->
  <div class="cr">
    <div class="cr-head">
      <span class="cr-emo">{{ POI_EMO[van.poi.type] }}</span>
      <div class="cr-main">
        <div class="cr-title font-display">
          {{ POI_LABEL[van.poi.type] }} · niv {{ van.poi.level }}
        </div>
        <div class="cr-sub">⏱ {{ fmtDuration(r.travelMs) }} de voyage (aller-retour)</div>
      </div>
    </div>

    <!-- Une ligne par embuscade (et le reste de la route) : « N bandits abattus » s'affiche
         quand l'embuscade en a abattu au moins un — jamais « 0 bandit abattu », et rien sur
         un convoi d'avant le combat de groupe (pas de `slain`). -->
    <ul v-if="r.events.length" class="cr-road">
      <li v-for="(e, i) in r.events" :key="i" class="cr-road-line">
        {{ e.text }}
        <span v-if="e.slain" class="cr-road-slain"> ⚔️ {{ slainLabel(e.slain) }} </span>
      </li>
    </ul>

    <div class="cr-pills">
      <span v-for="p in r.pills" :key="p.emoji" class="cr-pill">{{ p.emoji }} {{ p.n }}</span>
      <span v-if="r.wages" class="cr-pill cr-wage">🪙 −{{ r.wages }} salaires</span>
      <span v-if="!r.pills.length && !r.wages" class="cr-empty">Cargaison vide</span>
    </div>

    <!-- Le détail se replie : on lit la cargaison d'un coup d'œil, et on ouvre pour comparer
         ce que chacun a appris selon la longueur du voyage. -->
    <q-expansion-item
      dense
      dense-toggle
      switch-toggle-side
      :default-opened="opened"
      class="cr-exp"
      header-class="cr-exp-head"
    >
      <template #header>
        <div class="cr-exp-title">
          ⚔️ {{ r.members.length }} aventurier{{ r.members.length > 1 ? 's' : '' }}
          <span class="cr-exp-trailing">
            <span
              v-if="r.hasKills && r.totalKills > 0"
              class="cr-exp-kills"
              title="Bandits abattus au total"
            >
              ⚔️ {{ r.totalKills }}
            </span>
            <span class="cr-exp-xp">+{{ r.totalXp }} XP</span>
          </span>
        </div>
      </template>
      <ul class="cr-list">
        <li v-for="m in r.members" :key="m.id" class="cr-row" :class="{ gone: m.gone }">
          <span class="cr-m-emo">{{ m.emoji }}</span>
          <span class="cr-m-name">{{ m.name }}</span>
          <span v-if="stars.includes(m.id)" class="cr-m-star" title="Une étoile de plus">⭐</span>
          <span v-if="m.hurt" class="cr-m-hurt" title="Blessé : à l'infirmerie">🤕</span>
          <span
            v-else-if="m.knockedDown"
            class="cr-m-down"
            title="Mis à terre pendant une embuscade, mais pas blessé — pas d'infirmerie"
            >à terre</span
          >
          <span v-if="m.kills" class="cr-m-kills" :title="`${m.kills} bandit(s) abattu(s) par lui`">
            ⚔️ {{ killsLabel(m.kills) }}
          </span>
          <span class="cr-m-xp">+{{ m.xp }} XP</span>
        </li>
      </ul>
      <div class="cr-rate">
        ≈ <b>{{ fmtRate(r.xpPerHour) }} XP/h</b> par aventurier
        <span class="cr-rate-sub">— le temps qu'ils ont passé sur la route</span>
      </div>
    </q-expansion-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { caravanReport, type Caravan } from '@/lib/caravan';
import { POI_EMO, POI_LABEL } from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';

const props = withDefaults(
  defineProps<{
    van: Caravan;
    roster: readonly Adventurer[];
    /** Ids des aventuriers qui ont gagné une étoile à CET encaissement (sinon vide). */
    stars?: string[];
    opened?: boolean;
  }>(),
  { stars: () => [], opened: false },
);

const r = computed(() => caravanReport(props.van, props.roster));

function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
function fmtRate(n: number): string {
  return (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('fr-FR');
}
/** « 1 abattu » / « N abattus » — pur formatage, comme `fmtDuration`/`fmtRate` ci-dessus. */
function killsLabel(n: number): string {
  return `${n} abattu${n > 1 ? 's' : ''}`;
}
/** « 1 bandit abattu » / « N bandits abattus » — accord dès que N > 1. Jamais appelé à 0 :
 *  une embuscade sans abattu n'affiche pas de compte (cf. le `v-if` du template). */
function slainLabel(n: number): string {
  const pl = n > 1 ? 's' : '';
  return `${n} bandit${pl} abattu${pl}`;
}
</script>

<style scoped lang="scss">
.cr {
  color: var(--text);
}
.cr-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cr-emo {
  font-size: 26px;
}
.cr-main {
  min-width: 0;
}
.cr-title {
  font-size: 16px;
  font-weight: 600;
}
.cr-sub {
  font-size: 12.5px;
  color: var(--dim);
}
.cr-road {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
.cr-road-line {
  font-size: 12.5px;
  color: var(--dim);
  & + & {
    margin-top: 2px;
  }
}
.cr-road-slain {
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.cr-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.cr-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.cr-wage {
  color: var(--dim);
  font-weight: 600;
}
.cr-empty {
  font-size: 12.5px;
  color: var(--dim);
}
.cr-exp {
  margin-top: 8px;
  border-top: 1px solid var(--line-soft);
}
:deep(.cr-exp-head) {
  min-height: 44px;
  padding: 0 4px;
}
.cr-exp-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 600;
}
.cr-exp-trailing {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.cr-exp-kills {
  color: var(--dim);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.cr-exp-xp {
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.cr-list {
  list-style: none;
  margin: 0;
  padding: 0 4px;
}
.cr-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  font-size: 13px;
  &.gone {
    color: var(--dim);
  }
}
.cr-m-emo {
  width: 22px;
  text-align: center;
}
.cr-m-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cr-m-down {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--dim);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.cr-m-kills {
  color: var(--dim);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cr-m-xp {
  margin-left: auto;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.cr-rate {
  padding: 6px 4px 4px;
  font-size: 12px;
  color: var(--dim);
  b {
    color: var(--text);
  }
}
.cr-rate-sub {
  display: block;
}
</style>
