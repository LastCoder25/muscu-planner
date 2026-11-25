<template>
  <!-- 🧩 Défi 360 « PAR GROUPE » : un bloc par groupe musculaire, sa jauge « 8 / 12 séries », et
       dessous les exos au menu avec LEUR nombre de séries faites — jamais « 3/0 », un exo n'a pas
       d'objectif propre : on répartit les séries du groupe comme on veut. Partagé par l'onglet 🎯
       et la fiche du défi. Le mode « par exercice » ne passe pas par ici (il reste tel quel). -->
  <div class="cgb">
    <section
      v-for="g in rows"
      :key="g.key"
      class="cgb-group"
      :class="{ done: g.complete }"
      :style="{ '--mc': g.color }"
      :data-test="'group-' + g.key"
    >
      <header class="cgb-head">
        <span class="cgb-emo">{{ g.emoji }}</span>
        <span class="cgb-name font-display">{{ g.label }}</span>
        <span class="cgb-count" :data-test="'count-' + g.key"
          >{{ g.done }} / {{ g.target }} séries<template v-if="g.complete"> ✓</template></span
        >
      </header>
      <div
        class="cgb-bar"
        role="progressbar"
        :aria-valuenow="g.done"
        :aria-valuemin="0"
        :aria-valuemax="g.target"
        :aria-label="`${g.label} : ${g.done} séries sur ${g.target}`"
      >
        <i :style="{ width: g.pct + '%' }" />
      </div>
      <ul class="cgb-legs">
        <li v-for="l in g.legs" :key="l.exercise_id" class="cgb-leg">
          <button
            type="button"
            class="cgb-main"
            :aria-label="`Séries faites : ${l.exercise_name}`"
            @click="emit('history', l)"
          >
            <span class="cgb-thumb">
              <ExerciseDemo :exercise-id="l.exercise_id" :name="l.exercise_name" :size="36">
                <span class="cgb-fb">{{ g.emoji }}</span>
              </ExerciseDemo>
            </span>
            <span class="cgb-leg-name">{{ l.exercise_name }}</span>
            <span class="cgb-leg-n" :data-test="'n-' + l.exercise_id">{{ nLabel(l) }}</span>
          </button>
          <button
            v-if="editable"
            type="button"
            class="cgb-add"
            :disabled="g.complete"
            :title="g.complete ? 'Objectif du groupe atteint' : 'Une série de plus'"
            :aria-label="`Ajouter une série : ${l.exercise_name}`"
            :data-test="'add-' + l.exercise_id"
            @click="emit('add', l)"
          >
            ＋
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ExerciseDemo from './ExerciseDemo.vue';
import {
  comboGoals,
  goalComplete,
  legSetsDone,
  legsByGroup,
  type ComboChallenge,
  type ComboLeg,
} from '@/lib/combo';
import { comboSlot, comboSlotRank } from '@/data/combo';
import { comboLegColor } from '@/lib/volume';

const props = defineProps<{
  combo: ComboChallenge;
  /** Défi en cours : les boutons d'ajout sont proposés. */
  editable?: boolean;
}>();
const emit = defineEmits<{
  (e: 'add', leg: ComboLeg): void;
  (e: 'history', leg: ComboLeg): void;
}>();

function nLabel(l: ComboLeg): string {
  const n = legSetsDone(l);
  return n === 0 ? 'aucune série' : `${n} série${n > 1 ? 's' : ''}`;
}

/** Les groupes dans l'ordre des emplacements, ceux qui sont BOUCLÉS en bas (comme les exos finis
 *  du mode exo) ; dans chaque groupe, les exos par ordre alphabétique (`legsByGroup`). */
const rows = computed(() => {
  const all = comboGoals(props.combo)
    .map((g) => {
      const slot = comboSlot(g.slot);
      return {
        key: g.key,
        label: slot?.label ?? g.slot,
        emoji: slot?.emoji ?? '🏋️',
        color: comboLegColor({ slot: g.slot }),
        done: g.done,
        target: g.target,
        complete: goalComplete(g),
        pct: g.target > 0 ? Math.min(100, (g.done / g.target) * 100) : 0,
        legs: legsByGroup(g.legs),
        rank: comboSlotRank(g.slot),
      };
    })
    .sort((a, b) => a.rank - b.rank);
  return [...all.filter((g) => !g.complete), ...all.filter((g) => g.complete)];
});
</script>

<style scoped>
.cgb {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cgb-group {
  border: 1px solid var(--line);
  border-left: 4px solid var(--mc, var(--line));
  border-radius: 12px;
  background: var(--surface);
  padding: 10px 10px 6px;
}
.cgb-group.done {
  opacity: 0.62;
}
.cgb-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.cgb-emo {
  font-size: 20px;
  line-height: 1;
}
.cgb-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 17px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.cgb-count {
  flex: none;
  padding: 1px 9px;
  border-radius: 999px;
  border: 1.5px solid var(--mc, var(--line));
  background: var(--surface-2);
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cgb-bar {
  margin: 8px 0 4px;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}
.cgb-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--mc, var(--accent));
}
.cgb-legs {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cgb-leg {
  display: flex;
  align-items: center;
  gap: 6px;
  border-top: 1px solid var(--line-soft);
}
.cgb-leg:first-child {
  border-top: 0;
}
.cgb-main {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  background: none;
  border: 0;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.cgb-thumb {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  place-items: center;
}
.cgb-fb {
  font-size: 18px;
}
.cgb-leg-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.cgb-leg-n {
  flex: none;
  font-size: 12.5px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cgb-add {
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--accent);
  font-size: 22px;
  font-weight: 700;
  cursor: pointer;
}
.cgb-add:disabled {
  color: var(--dim);
  cursor: default;
  opacity: 0.5;
}
</style>
