<template>
  <div class="srp">
    <div class="srp-head">
      <span class="srp-t font-display">🪬 Compétences</span>
      <span class="srp-n">{{ skills.length }}/{{ slots }}</span>
    </div>

    <!-- Les emplacements : posés, puis vides en pointillés (ils disent ce qu'on peut encore
         avoir, comme les emplacements de tourelle de la base). -->
    <div class="srp-slots">
      <div
        v-for="(s, i) in cells"
        :key="i"
        class="srp-slot"
        :class="[s ? 't-' + SKILLS[s.id].tier : 'empty']"
      >
        <template v-if="s">
          <span class="srp-emo">{{ SKILLS[s.id].emoji }}</span>
          <span class="srp-main">
            <span class="srp-name">
              {{ SKILLS[s.id].name }}
              <b class="srp-lvl"
                >Nv {{ s.level }}{{ s.level >= SKILL_MAX_LEVEL ? ' · max' : '' }}</b
              >
            </span>
            <span class="srp-what">{{ whatOf(s.id, s.level) }}</span>
          </span>
        </template>
        <span v-else class="srp-free">Emplacement libre</span>
      </div>
    </div>

    <!-- 🪬 Depuis la bascule des runes multicolores, on ne pose plus rien ICI : une rune
         s'ouvre au Panthéon, et la compétence se DONNE depuis la tuile Runes. Une compétence
         donnée ne revient jamais au stock — il n'y a pas de bouton « retirer ». -->
    <p class="srp-note">
      Donne-lui des compétences depuis la tuile 🪬 Runes du Panthéon<template v-if="stock">
        ({{ stock }} au stock)</template
      >. 🟣 dès le rang {{ minRankName('violet') }}, 🟠 dès le rang {{ minRankName('gold') }}.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  RUNE_INFO,
  SKILLS,
  SKILL_MAX_LEVEL,
  skillValue,
  type RuneTier,
  type SkillId,
} from '@/lib/skillRunes';
import { advRuneSkills, advSkillSlots, type Adventurer } from '@/lib/adventurers';
import { CHARACTER_RANKS } from '@/lib/characterRank';

/** `stock` : combien de compétences attendent au stock (pour le rappel). */
const props = defineProps<{ adv: Adventurer; stock?: number }>();

const skills = computed(() => advRuneSkills(props.adv));
const slots = computed(() => advSkillSlots(props.adv));
const cells = computed(() =>
  Array.from(
    { length: Math.max(slots.value, skills.value.length) },
    (_, i) => skills.value[i] ?? null,
  ),
);
function whatOf(id: SkillId, level: number): string {
  return SKILLS[id].what.replace('{v}', String(skillValue(id, level)).replace('.', ','));
}
function minRankName(t: RuneTier): string {
  return CHARACTER_RANKS[RUNE_INFO[t].minRank]?.name ?? '';
}
</script>

<style scoped>
.srp {
  margin-top: 12px;
}
.srp-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
}
.srp-t {
  font-size: 15px;
}
.srp-n {
  color: var(--dim);
  font-size: 13px;
}
.srp-slots {
  display: grid;
  gap: 6px;
}
.srp-slot {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 6px 10px;
  border-radius: 12px;
  background: var(--surface-2, rgba(255, 255, 255, 0.04));
  border: 1.5px solid var(--tier, var(--line));
}
.srp-slot.empty {
  border-style: dashed;
  justify-content: center;
}
.srp-free {
  color: var(--dim);
  font-size: 13px;
}
.srp-emo {
  font-size: 22px;
}
.srp-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.srp-name {
  font-weight: 600;
  font-size: 14px;
}
.srp-lvl {
  margin-left: 6px;
  font-size: 12px;
  color: var(--tier, var(--accent));
}
.srp-what {
  font-size: 12.5px;
  color: var(--dim);
  overflow-wrap: anywhere;
}
.t-green {
  --tier: #7bc86c;
}
.t-blue {
  --tier: #5aa9ff;
}
.t-violet {
  --tier: #b98cff;
}
.t-gold {
  --tier: #ffb23f;
}
.srp-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--dim);
}
</style>
