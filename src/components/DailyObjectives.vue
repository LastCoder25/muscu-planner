<template>
  <!-- 🎯 LES OBJECTIFS DU JOUR : trois buts qui tournent, la progression lue dans ce que le jeu
       a déjà écrit, UN consommable quand les trois sont atteints. Ne calcule rien (`dailyObjectives.ts`). -->
  <section class="dly" data-test="daily" aria-label="Objectifs du jour">
    <button
      type="button"
      class="dly-head"
      :aria-expanded="open"
      data-test="daily-toggle"
      @click="toggle"
    >
      <span class="dly-title">🎯 Objectifs du jour</span>
      <span class="dly-count">{{ doneCount }}/{{ states.length }}</span>
      <span class="dly-chev" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </button>
    <ul v-if="open" class="dly-list">
      <li
        v-for="s in rows"
        :key="s.obj.kind"
        class="dly-row"
        :class="{ done: s.complete }"
        :title="s.view.how"
      >
        <span class="dly-emo" aria-hidden="true">{{ s.view.emoji }}</span>
        <span class="dly-main">
          <span class="dly-label">{{ s.view.label }}</span>
          <span class="dly-bar" aria-hidden="true">
            <span class="dly-fill" :style="{ width: pct(s) + '%' }" />
          </span>
        </span>
        <span class="dly-num">{{ s.complete ? '✓' : `${s.progress}/${s.obj.target}` }}</span>
      </li>
      <li
        v-if="rewardInfo"
        class="dly-bonus"
        :class="{ done: doneCount === states.length }"
        data-test="daily-bonus"
        :title="rewardInfo.name"
      >
        <span aria-hidden="true">🎁</span>
        <span class="dly-label">{{ states.length }}/{{ states.length }} : un consommable</span>
        <span class="dly-rew">{{ rewardInfo.emoji }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { objectiveView, rewardView, type ObjectiveState } from '@/lib/dailyObjectives';
import type { SupplyId } from '@/lib/supplies';

const props = defineProps<{ states: ObjectiveState[]; reward?: SupplyId }>();

const KEY = 'muscu:daily:open';
function readOpen(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}
const open = ref(readOpen());
function toggle() {
  open.value = !open.value;
  try {
    localStorage.setItem(KEY, open.value ? '1' : '0');
  } catch {
    /* navigation privée : sans mémoire */
  }
}

const rows = computed(() => props.states.map((s) => ({ ...s, view: objectiveView(s.obj) })));
const rewardInfo = computed(() => (props.reward ? rewardView(props.reward) : null));
const doneCount = computed(() => props.states.filter((s) => s.complete).length);
const pct = (s: ObjectiveState) => Math.round((s.progress / s.obj.target) * 100);
</script>

<style scoped lang="scss">
.dly {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  overflow: hidden;
}
.dly-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  background: none;
  color: var(--text);
  font-size: 14px;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
}
.dly-title {
  flex: 1;
  min-width: 0;
}
.dly-count {
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-family: Oswald, Inter, sans-serif;
  font-size: 13px;
}
.dly-chev {
  color: var(--dim);
}
.dly-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0 8px 8px;
  list-style: none;
}
.dly-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 4px 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--bg);
  &.done {
    border-color: #7bc86c;
    .dly-fill {
      background: #7bc86c;
    }
  }
}
.dly-emo {
  font-size: 18px;
}
.dly-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dly-label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
}
.dly-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--line);
  overflow: hidden;
}
.dly-fill {
  display: block;
  height: 100%;
  background: var(--accent);
}
.dly-num {
  font-family: Oswald, Inter, sans-serif;
  font-size: 14px;
  min-width: 34px;
  text-align: right;
}
.dly-bonus {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 4px 10px;
  border-radius: 10px;
  border: 1px dashed var(--line);
  &.done {
    border: 1px solid #7bc86c;
  }
  .dly-label {
    flex: 1;
  }
}
.dly-rew {
  font-size: 18px;
}
</style>
