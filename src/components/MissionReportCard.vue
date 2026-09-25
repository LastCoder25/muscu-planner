<template>
  <!-- 📜 Rapport de mission COMPACT (v0.1119) : trois lignes — où et quoi, ce que ça
       rapporte, qui y était — et le reste replié sous « Détails ». Replié, un rapport tient
       dans une TUILE d'une ligne qu'on touche pour l'ouvrir — la boîte 📬 les replie tous
       par défaut (v0.1123), le butin à prendre garde son bouton sur la ligne. Toute la
       donnée vient de `missionCard` (lib, testée) ; ce composant ne fait que peindre. -->
  <div
    v-if="!isOpen"
    class="mrc folded"
    :class="{ todo: state === 'claim', done: state === 'done', lost: !card.win }"
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

  <div
    v-else
    class="mrc"
    :class="{ todo: state === 'claim', done: state === 'done', lost: !card.win, open: expanded }"
  >
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
        <!-- Le rang passe SOUS le nom : sur une ligne, à 344 px, il écrasait le lieu. -->
        <span class="nm-col">
          <span class="name font-display">{{ card.title }}</span>
          <span v-if="card.rank" class="rank" :style="{ color: card.color }">{{ card.rank }}</span>
        </span>
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
        <template v-if="card.kills"
          >⚔️ <b>{{ card.kills }}</b></template
        >
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

    <!-- Replié par défaut : chiffres clés, récit, butin, route, équipe, journal — chacun
         dans son encart titré, pour qu'on trouve ce qu'on cherche sans tout lire. -->
    <div v-if="expanded" class="details">
      <div v-if="stats.length" class="stats">
        <div v-for="s in stats" :key="s.label" class="stat">
          <span class="st-val" :class="s.cls">{{ s.val }}</span>
          <span class="st-lab">{{ s.label }}</span>
        </div>
      </div>
      <p v-if="card.story" class="story">{{ card.story }}</p>
      <section v-if="card.loot.length" class="sec">
        <h4>
          🎁 Butin <span class="cnt">{{ card.loot.length }}</span>
        </h4>
        <div v-for="(it, i) in card.loot" :key="'ld' + i" class="loot-row">
          <ItemIcon :item="it" :size="32" />
          <div class="loot-main">
            <div class="loot-name">{{ it.name }}<span v-if="it.setId"> 🧩</span></div>
            <div class="loot-sub">{{ gradeLabel(it) }} · {{ SLOT_LABEL[it.slot] }}</div>
            <div class="loot-eff">{{ itemEffectsText(it) }}</div>
          </div>
        </div>
      </section>
      <section v-if="card.road.length" class="sec">
        <h4>
          🛣️ Route <span class="cnt">{{ card.road.length }}</span>
        </h4>
        <ul class="road">
          <li v-for="(e, i) in card.road" :key="i">
            <span class="r-txt">{{ e.text }}</span>
            <span v-if="e.slain" class="slain">⚔️ {{ e.slain }}</span>
          </li>
        </ul>
      </section>
      <section v-if="card.team.length" class="sec">
        <h4>
          🧭 Équipe <span class="cnt">{{ card.team.length }}</span>
        </h4>
        <ul class="team">
          <li v-for="m in card.team" :key="m.id" :class="{ gone: m.gone }">
            <span class="t-emo">{{ m.emoji }}</span>
            <span class="t-name">{{ m.name }}</span>
            <span class="t-tags">
              <span v-if="m.star" title="Une étoile de plus">⭐</span>
              <span v-if="m.hurt" title="Blessé : à l’infirmerie">🤕</span>
              <span v-else-if="m.down" class="t-down" title="À terre, relevé : pas d’infirmerie"
                >à terre</span
              >
            </span>
            <span class="t-kills">{{ m.kills ? `⚔️ ${m.kills}` : '' }}</span>
            <b class="xp t-xp">+{{ m.xp }}</b>
          </li>
        </ul>
      </section>
      <section v-if="card.journal.length" class="sec">
        <h4>📜 Journal</h4>
        <ol class="journal">
          <li v-for="(l, i) in card.journal" :key="i">{{ l }}</li>
        </ol>
      </section>
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
  () => !props.card.gains.length && !props.card.loot.length && !props.card.legacyItem,
);
/** La ligne unique d'un rapport encaissé : ses gains, puis l'XP. */
const summary = computed(() => {
  const parts = props.card.gains.map((g) => `${g.emoji} +${fmt(g.n)}`);
  if (props.card.loot.length) parts.push(`🎁 ×${props.card.loot.length + props.card.lootMore}`);
  if (props.card.totalXp) parts.push(`+${props.card.totalXp} XP`);
  return parts.join(' · ') || props.card.verdict;
});

/** Les chiffres clés du détail, en tête : voyage, rendement, combat, XP. */
const stats = computed(() => {
  const c = props.card;
  const out: { label: string; val: string; cls?: string }[] = [];
  if (c.travelMs) out.push({ label: 'de voyage', val: formatDuration(c.travelMs) });
  if (c.xpPerHour)
    out.push({ label: 'XP/h par champion', val: `≈ ${fmtRate(c.xpPerHour)}`, cls: 'acc' });
  if (c.kills) out.push({ label: 'abattus', val: c.kills });
  if (c.totalXp) out.push({ label: 'XP au total', val: `+${fmt(c.totalXp)}`, cls: 'xp' });
  return out;
});

function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}
function fmtRate(n: number): string {
  return (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('fr-FR');
}
</script>

<style scoped lang="scss">
/* La tuile se détache de la fenêtre qui la porte (elle-même sur --surface) : fond plus
   clair, ombre, et un LISERÉ à gauche qui dit l'état d'un coup d'œil — accent pour un
   butin à prendre, vert gagné, rouge perdu, neutre une fois encaissé. */
.mrc {
  --mrc-c: var(--d1);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-left: 4px solid var(--mrc-c);
  border-radius: 12px;
  padding: 10px 12px;
  display: grid;
  gap: 6px;
  text-align: left;
  color: var(--text);
  min-width: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
.mrc.lost {
  --mrc-c: var(--d4);
}
.mrc.done {
  border-left-color: color-mix(in srgb, var(--mrc-c) 40%, var(--line));
  background: color-mix(in srgb, var(--surface-2) 55%, var(--surface));
  box-shadow: none;
}
.mrc.todo {
  --mrc-c: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--surface-2));
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  border-left-color: var(--accent);
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
.nm-col {
  display: grid;
  min-width: 0;
  line-height: 1.2;
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
  border-top: 1px solid var(--line);
  padding-top: 10px;
  margin-top: 2px;
  font-size: 12.5px;
}
/* Chiffres clés : une grille de petites cases, valeur en gros, libellé dessous. */
.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.stat {
  display: grid;
  gap: 1px;
  padding: 7px 9px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--bg) 45%, var(--surface-2));
  min-width: 0;
}
.st-val {
  font-family: 'Oswald', sans-serif;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.st-val.xp {
  color: var(--d1);
}
.st-val.acc {
  color: var(--accent);
}
.st-lab {
  font-size: 10.5px;
  color: var(--dim);
  line-height: 1.25;
}
.story {
  margin: 0;
  padding: 6px 10px;
  border-left: 2px solid var(--line);
  color: var(--dim);
  font-style: italic;
  line-height: 1.45;
}
/* Un encart par sujet : titre en capitales, contenu dessous. */
.sec {
  display: grid;
  gap: 6px;
  padding: 8px 10px 9px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg) 45%, var(--surface-2));
}
.sec h4 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dim);
}
.cnt {
  font-size: 10.5px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text);
  letter-spacing: 0;
}
.loot-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.loot-row + .loot-row {
  padding-top: 6px;
  border-top: 1px solid var(--line-soft);
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
.team {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
/* La route : une frise, un point par rencontre. */
.road li {
  position: relative;
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 3px 0 3px 16px;
  line-height: 1.4;
}
.road li::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 9px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dim);
}
.road li:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 5.5px;
  top: 16px;
  bottom: -5px;
  width: 1px;
  background: var(--line);
}
.r-txt {
  flex: 1;
  min-width: 0;
}
.slain {
  flex: none;
  color: var(--dim);
  font-size: 11.5px;
}
/* L'équipe : un tableau aligné — nom, marques, abattus, XP à droite. */
.team li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto 44px 44px;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
}
.team li + li {
  border-top: 1px solid var(--line-soft);
}
.team li.gone {
  color: var(--dim);
}
.t-emo {
  text-align: center;
}
.t-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.t-tags {
  display: flex;
  gap: 3px;
  align-items: center;
}
.t-down,
.t-kills {
  color: var(--dim);
  font-size: 11.5px;
}
.t-kills,
.t-xp {
  text-align: right;
  white-space: nowrap;
}
.journal {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 3px;
  color: var(--dim);
  font-size: 11.5px;
  line-height: 1.4;
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
