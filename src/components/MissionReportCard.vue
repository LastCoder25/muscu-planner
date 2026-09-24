<template>
  <!-- 📜 Rapport de mission COMPACT (v0.1119) : trois lignes — où et quoi, ce que ça
       rapporte, qui y était — et le reste replié sous « Détails ». Replié, un rapport tient
       dans une TUILE d'une ligne qu'on touche pour l'ouvrir — la boîte 📬 les replie tous
       par défaut (v0.1123), le butin à prendre garde son bouton sur la ligne. Toute la
       donnée vient de `missionCard` (lib, testée) ; ce composant ne fait que peindre. -->
  <div
    v-if="!isOpen"
    class="mrc folded"
    :class="{ todo: state === 'claim', done: state === 'done' }"
    role="button"
    tabindex="0"
    :aria-label="`Ouvrir le rapport : ${card.title}`"
    @click="isOpen = true"
    @keydown.enter.self.prevent="isOpen = true"
    @keydown.space.self.prevent="isOpen = true"
  >
    <div class="l1">
      <div class="where">
        <span class="ico" :class="{ rift: card.rift }">
          <RiftPortal v-if="card.rift" :color="card.color" :seed="seed" still />
          <template v-else>{{ card.emoji }}</template>
        </span>
        <span class="name font-display">{{ card.title }}</span>
        <span class="dot" :class="card.win ? 'win' : 'lose'" :title="card.verdict">{{
          card.win ? '✓' : '✗'
        }}</span>
      </div>
      <span class="sum">{{ summary }}</span>
      <button
        v-if="state === 'claim'"
        type="button"
        class="take mini"
        :disabled="busy"
        :aria-label="claimLabel"
        @click.stop="emit('claim')"
      >
        🎁
      </button>
      <span v-else-if="state === 'wait'" class="when" :title="waitLabel">🧭</span>
      <span v-else class="when">{{ when }}</span>
    </div>
  </div>

  <div v-else class="mrc" :class="{ todo: state === 'claim', open: expanded }">
    <!-- 1 · où, rang, verdict, quand -->
    <div class="l1">
      <div
        class="where"
        :class="{ foldable: folded }"
        :role="folded ? 'button' : undefined"
        :tabindex="folded ? 0 : undefined"
        :aria-label="folded ? 'Replier le rapport' : undefined"
        @click="folded && (isOpen = false)"
        @keydown.enter.self.prevent="folded && (isOpen = false)"
      >
        <span class="ico" :class="{ rift: card.rift }">
          <RiftPortal v-if="card.rift" :color="card.color" :seed="seed" still />
          <template v-else>{{ card.emoji }}</template>
        </span>
        <span class="name font-display">{{ card.title }}</span>
        <span v-if="card.rank" class="rank" :style="{ color: card.color }">{{ card.rank }}</span>
      </div>
      <span class="verdict" :class="card.win ? 'win' : 'lose'">
        {{ card.win ? '✓' : '✗' }} {{ card.verdict }}
      </span>
      <button
        v-if="canReplay"
        type="button"
        class="replay"
        aria-label="Revoir l’incursion"
        title="Revoir l’incursion"
        @click="emit('replay')"
      >
        ▶
      </button>
      <span v-else class="when">{{ when }}</span>
    </div>

    <!-- 2 · ce que ça rapporte, ce que ça coûte, et le geste -->
    <div class="l2">
      <div class="gains">
        <span v-for="g in card.gains" :key="g.emoji">{{ g.emoji }} +{{ fmt(g.n) }}</span>
        <button
          v-for="(it, i) in card.loot"
          :key="'lt' + i"
          type="button"
          class="loot"
          :aria-label="it.name"
          :title="it.name"
          @click="expanded = true"
        >
          <ItemIcon :item="it" :size="24" :show-stars="false" />
        </button>
        <span v-if="card.lootMore > 0" class="more">+{{ card.lootMore }} au sac</span>
        <span v-if="card.legacyItem" class="more">🎁 {{ card.legacyItem }}</span>
        <span v-if="card.wages" class="cost">🪙 −{{ fmt(card.wages) }} salaires</span>
        <span v-if="empty" class="none">Rien de récolté</span>
      </div>
      <button
        v-if="state === 'claim'"
        type="button"
        class="take"
        :disabled="busy"
        @click="emit('claim')"
      >
        {{ claimLabel }}
      </button>
      <span v-else-if="state === 'wait' && waitLabel" class="wait">🧭 {{ waitLabel }}</span>
    </div>

    <!-- 3 · qui y était -->
    <div v-if="card.team.length || card.hero" class="l3">
      <span v-if="card.hero" class="mem">🧝 Héros</span>
      <template v-for="(m, i) in shownTeam" :key="m.id">
        <span v-if="card.hero || i > 0" class="sep">·</span>
        <span class="mem" :class="{ gone: m.gone }">
          {{ m.emoji }} {{ m.name }} <b class="xp">+{{ m.xp }}</b
          ><template v-if="m.star"> ⭐</template><template v-if="m.hurt"> 🤕</template>
        </span>
      </template>
      <template v-if="hiddenTeam > 0">
        <span class="sep">·</span>
        <span class="more">+{{ hiddenTeam }} autre{{ hiddenTeam > 1 ? 's' : '' }}</span>
      </template>
    </div>

    <div class="l4">
      <span class="facts">
        <template v-if="card.kills">⚔️ <b>{{ card.kills }}</b></template>
        <template v-if="card.kills && card.totalXp"> · </template>
        <b v-if="card.totalXp" class="xp">+{{ card.totalXp }} XP</b>
        <template v-if="canReplay"> · {{ when }}</template>
      </span>
      <button
        type="button"
        class="more-btn"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        Détails <span class="chev">›</span>
      </button>
    </div>

    <!-- Replié par défaut : le récit, la route, le détail de chacun, le journal. -->
    <div v-if="expanded" class="details">
      <p v-if="card.story" class="story">{{ card.story }}</p>
      <div v-for="(it, i) in card.loot" :key="'ld' + i" class="loot-row">
        <ItemIcon :item="it" :size="32" />
        <div class="loot-main">
          <div class="loot-name">
            {{ it.name }}<span v-if="it.setId"> 🧩</span>
          </div>
          <div class="loot-sub">{{ gradeLabel(it) }} · {{ SLOT_LABEL[it.slot] }}</div>
          <div class="loot-eff">{{ itemEffectsText(it) }}</div>
        </div>
      </div>
      <div v-if="card.road.length">
        <h4>Route</h4>
        <ul class="road">
          <li v-for="(e, i) in card.road" :key="i">
            {{ e.text }}<span v-if="e.slain" class="slain"> ⚔️ {{ e.slain }}</span>
          </li>
        </ul>
      </div>
      <div v-if="card.team.length">
        <h4>Équipe</h4>
        <ul class="team">
          <li v-for="m in card.team" :key="m.id" :class="{ gone: m.gone }">
            <span>{{ m.emoji }}</span>
            <span class="t-name">{{ m.name }}</span>
            <span v-if="m.star" title="Une étoile de plus">⭐</span>
            <span v-if="m.hurt" title="Blessé : à l’infirmerie">🤕</span>
            <span v-else-if="m.down" class="t-down" title="À terre, relevé : pas d’infirmerie"
              >à terre</span
            >
            <span v-if="m.kills" class="t-kills">⚔️ {{ m.kills }}</span>
            <b class="xp">+{{ m.xp }} XP</b>
          </li>
        </ul>
      </div>
      <ol v-if="card.journal.length" class="journal">
        <li v-for="(l, i) in card.journal" :key="i">{{ l }}</li>
      </ol>
      <div v-if="card.travelMs" class="rate">
        ⏱ {{ formatDuration(card.travelMs) }} de voyage<template v-if="card.xpPerHour">
          · ≈ <b>{{ fmtRate(card.xpPerHour) }} XP/h</b> par champion</template
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import RiftPortal from '@/components/RiftPortal.vue';
import ItemIcon from '@/components/ItemIcon.vue';
import { seedOf } from '@/lib/combat';
import { formatDuration } from '@/lib/duration';
import { SLOT_LABEL, gradeLabel, itemEffectsText } from '@/lib/items';
import { TEAM_SHOWN, missionWhen, type MissionCard } from '@/lib/missionCard';
import { riftStageInputOf } from '@/lib/riftStage';

const props = withDefaults(
  defineProps<{
    card: MissionCard;
    /** `claim` : butin à prendre · `wait` : encore sur la route · `done` : encaissé
     *  (replié sur une ligne) · `none` : rien à faire, affiché en entier. */
    state?: 'claim' | 'wait' | 'done' | 'none';
    now: number;
    waitLabel?: string;
    claimLabel?: string;
    busy?: boolean;
    /** Replié par défaut (la boîte 📬) : une tuile d'une ligne. Sinon, seul un rapport
     *  encaissé part replié. */
    folded?: boolean;
  }>(),
  { state: 'none', waitLabel: '', claimLabel: '🎁 Prendre', busy: false, folded: false },
);
const emit = defineEmits<{ claim: []; replay: [] }>();

const expanded = ref(false);
// ⚠️ Lu UNE fois : encaisser un rapport ouvert ne doit pas le refermer sous le doigt.
const isOpen = ref(!props.folded && props.state !== 'done');

const seed = computed(() => seedOf(props.card.id));
const when = computed(() => missionWhen(props.card.at, props.now));
// ⚠️ MÊME SOURCE que le rejeu lui-même : le bouton ne peut pas apparaître sur un camp.
const canReplay = computed(() => !!props.card.party && !!riftStageInputOf(props.card.party));
const shownTeam = computed(() => props.card.team.slice(0, TEAM_SHOWN));
const hiddenTeam = computed(() => Math.max(0, props.card.team.length - TEAM_SHOWN));
const empty = computed(
  () =>
    !props.card.gains.length &&
    !props.card.loot.length &&
    !props.card.legacyItem &&
    !props.card.wages,
);
/** La ligne unique d'un rapport encaissé : ses gains, puis l'XP. */
const summary = computed(() => {
  const parts = props.card.gains.map((g) => `${g.emoji} +${fmt(g.n)}`);
  if (props.card.loot.length) parts.push(`🎁 ×${props.card.loot.length + props.card.lootMore}`);
  if (props.card.totalXp) parts.push(`+${props.card.totalXp} XP`);
  return parts.join(' · ') || props.card.verdict;
});

function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}
function fmtRate(n: number): string {
  return (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('fr-FR');
}
</script>

<style scoped lang="scss">
.mrc {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  padding: 10px 12px;
  display: grid;
  gap: 6px;
  text-align: left;
  color: var(--text);
  min-width: 0;
}
.mrc.todo {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}
.l1,
.l2,
.l4 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.where {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.ico {
  flex: none;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  font-size: 17px;
  line-height: 1;
}
.ico.rift {
  width: 14px;
}
.name {
  font-weight: 600;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.rank {
  flex: none;
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}
.verdict {
  flex: none;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  white-space: nowrap;
}
.verdict.win {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 16%, transparent);
}
.verdict.lose {
  color: var(--d4);
  background: color-mix(in srgb, var(--d4) 16%, transparent);
}
.when {
  flex: none;
  font-size: 11px;
  color: var(--dim);
  white-space: nowrap;
}
.replay {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: transparent;
  color: #b57bff;
  font-size: 11px;
  cursor: pointer;
}
.gains {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.gains .cost,
.gains .more {
  color: var(--dim);
  font-weight: 600;
}
.gains .none {
  color: var(--dim);
  font-weight: 500;
}
.loot {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  line-height: 0;
}
.take {
  flex: none;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: #15120e;
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}
.take:disabled {
  opacity: 0.5;
  cursor: default;
}
.wait {
  flex: none;
  font-size: 11.5px;
  color: var(--dim);
  white-space: nowrap;
}
.l3 {
  font-size: 12.5px;
  line-height: 1.5;
}
.sep {
  color: var(--line);
  margin: 0 4px;
}
.mem.gone {
  color: var(--dim);
}
.xp {
  color: var(--d1);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.more {
  color: var(--dim);
}
.l4 {
  justify-content: space-between;
  font-size: 12px;
  color: var(--dim);
}
.l4 b {
  color: var(--text);
  font-weight: 600;
}
.l4 b.xp {
  color: var(--d1);
}
.more-btn {
  flex: none;
  background: none;
  border: 0;
  color: var(--accent);
  font-weight: 600;
  font-size: 12.5px;
  cursor: pointer;
  min-height: 32px;
  padding: 0 2px;
}
.chev {
  display: inline-block;
  transition: transform 0.15s;
}
.mrc.open .chev {
  transform: rotate(90deg);
}
.details {
  display: grid;
  gap: 8px;
  border-top: 1px solid var(--line-soft);
  padding-top: 8px;
  font-size: 12.5px;
}
.details h4 {
  margin: 0 0 3px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dim);
}
.story {
  margin: 0;
  color: var(--dim);
  line-height: 1.45;
}
.loot-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.loot-main {
  min-width: 0;
}
.loot-name {
  font-weight: 700;
}
.loot-sub,
.loot-eff {
  font-size: 11.5px;
  color: var(--dim);
}
.road,
.journal {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 2px;
}
.journal {
  color: var(--dim);
  font-size: 11.5px;
}
.slain {
  color: var(--dim);
}
.team {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 3px;
}
.team li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.team li.gone {
  color: var(--dim);
}
.t-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.t-down,
.t-kills {
  color: var(--dim);
  font-size: 11.5px;
}
.rate b {
  color: var(--accent);
}
/* Replié : une TUILE d'une ligne, qu'on touche pour ouvrir. */
.mrc.folded {
  padding: 8px 10px 8px 12px;
  cursor: pointer;
  min-height: 48px;
  align-content: center;
}
.mrc.folded .where {
  flex: none;
  max-width: 55%;
}
.mrc.folded .name {
  font-size: 14px;
}
.mrc.folded.done .name,
.mrc.folded.done .sum {
  color: var(--dim);
}
.dot {
  flex: none;
  font-size: 11px;
  font-weight: 800;
}
.dot.win {
  color: var(--d1);
}
.dot.lose {
  color: var(--d4);
}
.take.mini {
  min-height: 44px;
  min-width: 44px;
  padding: 0 10px;
  font-size: 15px;
}
.where.foldable {
  cursor: pointer;
}
.sum {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: 12px;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
.mrc:focus-visible,
.mrc button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .chev {
    transition: none;
  }
}
</style>
