<template>
  <!-- 🪄 LE PLANIFICATEUR D'EXPÉDITIONS (2026-10-11, demandé) : on règle la chance de réussite
       voulue et ce qu'on optimise, il propose les départs possibles avec les effectifs libres ;
       on en lance un, ou tous. Le calcul est fait par `useExpeditionPlanner`. -->
  <div class="xp-plan">
    <div class="pl-modes" role="radiogroup" aria-label="Optimiser">
      <button
        v-for="m in MODES"
        :key="m.id"
        type="button"
        class="pl-mode"
        :class="{ on: mode === m.id }"
        role="radio"
        :aria-checked="mode === m.id"
        @click="mode = m.id"
      >
        <span class="pm-emo">{{ m.emo }}</span>
        <span class="pm-title">{{ m.title }}</span>
        <span class="pm-sub">{{ m.sub }}</span>
      </button>
    </div>

    <div class="pl-row">
      <span class="pl-lab">🎯 Réussite au moins</span>
      <div class="pl-chips">
        <button
          v-for="t in THRESHOLDS"
          :key="t"
          type="button"
          class="pl-chip"
          :class="{ on: threshold === t }"
          @click="threshold = t"
        >
          {{ t }} %
        </button>
      </div>
    </div>
    <div class="pl-row">
      <span class="pl-lab">Qui peut partir</span>
      <div class="pl-chips">
        <button
          type="button"
          class="pl-chip"
          :class="{ on: withHero && heroFree, off: !heroFree }"
          :disabled="!heroFree"
          :title="heroFree ? '' : 'Ton héros n’est pas disponible'"
          @click="withHero = !withHero"
        >
          🧝 Héros{{ heroFree ? '' : ' (pris)' }}
        </button>
        <button
          type="button"
          class="pl-chip"
          :class="{ on: withGarrisons }"
          title="Faire sortir les champions en garnison sur tes lieux fixes"
          @click="withGarrisons = !withGarrisons"
        >
          🏰 Garnisons
        </button>
      </div>
    </div>

    <p class="pl-pool">
      👥 {{ poolInfo.base }} champion{{ poolInfo.base > 1 ? 's' : '' }} libre{{
        poolInfo.base > 1 ? 's' : ''
      }}
      à la base<template v-if="withGarrisons">
        · {{ poolInfo.garrison }} en garnison prêt{{ poolInfo.garrison > 1 ? 's' : '' }}</template
      ><template v-if="withHero && heroFree"> · 🧝 héros</template>
    </p>
    <button type="button" class="pl-go" :disabled="running" @click="compute">
      <span v-if="running">⏳ Calcul… {{ Math.round(progress * 100) }} %</span>
      <span v-else>🪄 {{ rows ? 'Recalculer' : 'Proposer des expéditions' }}</span>
    </button>
    <div v-if="running" class="pl-bar">
      <div class="pl-fill" :style="{ width: Math.round(progress * 100) + '%' }" />
    </div>

    <template v-if="rows && !running">
      <p v-if="!rows.length" class="pl-empty">
        Aucune expédition n’atteint {{ threshold }} % avec les effectifs libres.
      </p>
      <template v-else>
        <div class="pl-sum">
          <span class="pl-pill">{{ rows.length }} expédition{{ rows.length > 1 ? 's' : '' }}</span>
          <span class="pl-pill">👥 {{ engaged }}</span>
          <span class="pl-pill">⏱️ {{ fmt(longest) }} au plus</span>
          <span v-if="totalXp" class="pl-pill">⭐ {{ totalXp }} XP</span>
        </div>
        <button type="button" class="pl-all" :disabled="!!launching" @click="launchAll">
          {{ launching === '*' ? '⏳ Départs…' : `🚀 Tout lancer (${rows.length})` }}
        </button>
        <div class="pl-list">
          <div v-for="r in rows" :key="r.key" class="pl-tile">
            <div class="pt-head">
              <span class="pt-emo" aria-hidden="true">{{ poiEmo(r.poi) }}</span>
              <span class="pt-name">{{ poiLabel(r.poi) }}</span>
              <span class="pt-rank" :style="{ '--rk': rankOf(r.poi).color }">
                {{ rankOf(r.poi).name }} ★{{ rankOf(r.poi).star }}
              </span>
            </div>
            <div class="pt-team">
              <span v-if="r.from" class="pt-from">🏰 depuis {{ poiLabel(r.from) }}</span>
              <span v-if="r.hero" class="pt-mem hero">🧝 Héros</span>
              <span v-for="a in r.advs" :key="a.id" class="pt-mem">
                {{ advTitle(a)?.emoji ?? '🗡️' }} {{ a.name }}
              </span>
            </div>
            <div class="pt-foot">
              <span class="pt-stat" :class="winClass(r.win)"
                >🎯 {{ Math.round(r.win * 100) }} %</span
              >
              <span class="pt-stat">⏱️ {{ fmt(r.tripMin) }}</span>
              <span v-if="r.xp" class="pt-stat">⭐ {{ r.xp }}</span>
              <button type="button" class="pt-go" :disabled="!!launching" @click="launch(r)">
                {{ launching === r.key ? '⏳' : 'Lancer' }}
              </button>
            </div>
          </div>
        </div>
      </template>
      <p v-if="unreachable.length" class="pl-note">
        {{ unreachable.length }} lieu{{ unreachable.length > 1 ? 'x' : '' }} hors de portée à
        {{ threshold }} % avec ce qui reste.
      </p>
    </template>
    <p class="pl-note">
      Lieux fixes ennemis et armées en marche ne sont pas proposés : ce sont des choix à faire lieu
      par lieu.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { useExpeditionPlanner } from '@/composables/useExpeditionPlanner';
import { advTitle } from '@/lib/adventurers';
import { characterRank } from '@/lib/characterRank';
import { formatDurationMin } from '@/lib/duration';
import { poiDifficultyLevel, poiEmo, poiLabel, type Poi } from '@/lib/expedition';
import type { PlanMode } from '@/lib/expeditionPlanner';

const props = defineProps<{ planner: ReturnType<typeof useExpeditionPlanner> }>();
const {
  threshold,
  mode,
  withGarrisons,
  withHero,
  heroFree,
  poolInfo,
  running,
  progress,
  rows,
  unreachable,
  launching,
  compute,
  launch,
  launchAll,
} = props.planner;

const MODES: { id: PlanMode; emo: string; title: string; sub: string }[] = [
  { id: 'events', emo: '🗺️', title: 'Événements', sub: 'le plus possible, le plus vite' },
  { id: 'xp', emo: '⭐', title: 'XP des champions', sub: 'le plus d’XP par heure' },
];
const THRESHOLDS = [70, 80, 90, 95, 99];

const rankOf = (p: Poi) => characterRank(poiDifficultyLevel(p));
const fmt = (min: number) => formatDurationMin(min);
const winClass = (w: number) => (w >= 0.9 ? 'good' : w >= 0.7 ? 'ok' : 'bad');
const engaged = computed(() =>
  (rows.value ?? []).reduce((s, r) => s + r.advs.length + (r.hero ? 1 : 0), 0),
);
const longest = computed(() => Math.max(0, ...(rows.value ?? []).map((r) => r.tripMin)));
const totalXp = computed(() => (rows.value ?? []).reduce((s, r) => s + r.xp, 0));
</script>

<style scoped lang="scss">
.xp-plan {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 2px 2px 8px;
}
.pl-modes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.pl-mode {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 64px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  &.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  }
}
.pm-emo {
  font-size: 18px;
}
.pm-title {
  font-weight: 700;
  font-size: 13px;
}
.pm-sub {
  font-size: 11px;
  color: var(--dim);
}
.pl-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pl-lab {
  font-size: 12px;
  color: var(--dim);
}
.pl-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pl-chip {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  &.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  }
  &.off,
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
.pl-go,
.pl-all {
  min-height: 46px;
  border-radius: 12px;
  border: none;
  background: var(--accent);
  color: #15120e;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}
.pl-all {
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
  color: var(--text);
  border: 1.5px solid var(--accent);
}
.pl-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--line);
  overflow: hidden;
}
.pl-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}
.pl-sum {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pl-pill {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  font-size: 12px;
  font-weight: 600;
}
.pl-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pl-tile {
  padding: 9px 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pt-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.pt-emo {
  font-size: 18px;
}
.pt-name {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pt-rank {
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1.5px solid var(--rk);
  color: var(--rk);
  font-size: 11px;
  font-weight: 700;
}
.pt-team {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pt-from {
  width: 100%;
  font-size: 11px;
  color: var(--dim);
}
.pt-mem {
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, #5fd0ff 14%, transparent);
  border: 1px solid color-mix(in srgb, #5fd0ff 45%, transparent);
  font-size: 12px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  &.hero {
    background: color-mix(in srgb, #2f6bff 20%, transparent);
    border-color: #2f6bff;
  }
}
.pt-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.pt-stat {
  font-size: 12px;
  font-weight: 700;
  &.good {
    color: var(--d1);
  }
  &.ok {
    color: var(--d3);
  }
  &.bad {
    color: var(--d4);
  }
}
.pt-go {
  margin-left: auto;
  min-height: 40px;
  min-width: 72px;
  padding: 0 14px;
  border-radius: 10px;
  border: none;
  background: var(--accent);
  color: #15120e;
  font-weight: 800;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
  }
}
.pl-pool,
.pl-empty,
.pl-note {
  font-size: 12px;
  color: var(--dim);
  margin: 0;
}
</style>
