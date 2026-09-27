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
              <b class="srp-lvl">Nv {{ s.level }}{{ s.level >= SKILL_MAX_LEVEL ? ' · max' : '' }}</b>
            </span>
            <span class="srp-what">{{ whatOf(s.id, s.level) }}</span>
          </span>
        </template>
        <span v-else class="srp-free">Emplacement libre</span>
      </div>
    </div>

    <!-- ⚠️ UNE DÉCISION ATTEND : la rune est déjà dépensée, la compétence tirée est gardée
         en base (un rechargement ne la relance pas). Remplacer = la nouvelle au niveau 1. -->
    <div v-if="pending" class="srp-pending">
      <div class="srp-p-t">
        {{ SKILLS[pending.drawn].emoji }} <b>{{ SKILLS[pending.drawn].name }}</b> tirée —
        {{ whatOf(pending.drawn, 1) }}
      </div>
      <p class="srp-p-note">
        Tous ses emplacements sont pris. Remplace une compétence (la nouvelle arrive au niveau 1),
        ou garde les siennes : la rune est alors perdue.
      </p>
      <div class="srp-p-choices">
        <button
          v-for="(s, i) in skills"
          :key="s.id"
          type="button"
          class="srp-choice"
          :disabled="busy"
          @click="emit('resolve', i)"
        >
          Remplacer {{ SKILLS[s.id].emoji }} {{ SKILLS[s.id].name }} Nv {{ s.level }}
        </button>
        <button
          type="button"
          class="srp-choice keep"
          :disabled="busy"
          @click="emit('resolve', null)"
        >
          Garder les siennes
        </button>
      </div>
    </div>

    <!-- 🧩 LE STOCK : une tuile par couleur. Grisée AVEC la raison — jamais en silence. -->
    <div class="srp-sec">Poser une rune</div>
    <div class="srp-runes">
      <button
        v-for="t in RUNE_TIERS"
        :key="t"
        type="button"
        class="srp-rune"
        :class="'t-' + t"
        :disabled="busy || !!blockOf(t)"
        :title="blockOf(t) ? RUNE_USE_BLOCK_LABEL[blockOf(t)!] : RUNE_INFO[t].label"
        @click="emit('apply', t)"
      >
        <span class="srp-r-emo">{{ RUNE_INFO[t].emoji }}</span>
        <span class="srp-r-n font-display">{{ runes.stock[t] }}</span>
        <span class="srp-r-why">{{
          blockOf(t) === 'noRune'
            ? 'aucune'
            : blockOf(t) === 'rank'
              ? minRankName(t) + '+'
              : blockOf(t) === 'maxed'
                ? 'au max'
                : blockOf(t) === 'pending'
                  ? 'en attente'
                  : 'poser'
        }}</span>
      </button>
    </div>
    <p class="srp-note">
      Une rune tire une compétence de sa couleur ; déjà portée, elle monte d’un niveau (5 au
      maximum). Les runes tombent des lieux de la carte, des ascensions et de l’Éveil.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  RUNE_INFO,
  RUNE_TIERS,
  SKILLS,
  SKILL_MAX_LEVEL,
  skillValue,
  type RuneState,
  type RuneTier,
  type SkillId,
} from '@/lib/skillRunes';
import {
  RUNE_USE_BLOCK_LABEL,
  advRuneSkills,
  advSkillSlots,
  runeUseBlocker,
  type Adventurer,
} from '@/lib/adventurers';
import { CHARACTER_RANKS } from '@/lib/characterRank';

const props = defineProps<{ adv: Adventurer; runes: RuneState; busy?: boolean }>();
const emit = defineEmits<{ apply: [tier: RuneTier]; resolve: [index: number | null] }>();

const skills = computed(() => advRuneSkills(props.adv));
const slots = computed(() => advSkillSlots(props.adv));
const cells = computed(() =>
  Array.from({ length: Math.max(slots.value, skills.value.length) }, (_, i) => skills.value[i] ?? null),
);
const pending = computed(() =>
  props.runes.pending?.advId === props.adv.id ? props.runes.pending : null,
);
function blockOf(t: RuneTier) {
  return runeUseBlocker(props.adv, t, props.runes);
}
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
.srp-pending {
  margin-top: 10px;
  padding: 10px;
  border-radius: 12px;
  border: 1.5px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.srp-p-t {
  font-size: 14px;
}
.srp-p-note {
  margin: 4px 0 8px;
  font-size: 12.5px;
  color: var(--dim);
}
.srp-p-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.srp-choice {
  min-height: 44px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.srp-choice.keep {
  color: var(--dim);
}
.srp-sec {
  margin: 12px 0 6px;
  font-size: 13px;
  color: var(--dim);
}
.srp-runes {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.srp-rune {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-height: 64px;
  padding: 6px 2px;
  border-radius: 12px;
  border: 1.5px solid var(--tier);
  background: color-mix(in srgb, var(--tier) 12%, transparent);
  color: var(--text);
  cursor: pointer;
}
.srp-rune:disabled {
  opacity: 0.45;
  cursor: default;
}
.srp-r-emo {
  font-size: 18px;
}
.srp-r-n {
  font-size: 18px;
  line-height: 1;
}
.srp-r-why {
  font-size: 11px;
  color: var(--dim);
}
.srp-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--dim);
}
</style>
