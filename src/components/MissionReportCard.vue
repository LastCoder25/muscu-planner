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
      <!-- 💰 Les gains de la ligne repliée sont des PASTILLES (demandé : « toucher l'icône du
           consommable montre son détail ») : un toucher ouvre la bulle FLOTTANTE de `HaulPills`
           sans ouvrir le rapport (`@click.stop` dans le composant). -->
      <span class="sum">
        <HaulPills v-if="card.gains.length" :pills="card.gains" sign="+" floating />
        <template v-if="summaryTail"
          >{{ card.gains.length ? ' · ' : '' }}{{ summaryTail }}</template
        >
      </span>
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
          <!-- Sous le nom : le verdict, le rang du lieu, quand. Il se replie sur deux lignes
               plutôt que d'écraser le nom (à 344 px, un verdict long recouvrait la date). -->
          <span class="meta">
            <span class="verdict" :class="card.win ? 'win' : 'lose'">
              {{ card.win ? '✓' : '✗' }} {{ card.verdict }}
            </span>
            <span v-if="card.rank" class="rank" :style="{ color: card.color }">{{
              card.rank
            }}</span>
            <span class="when">{{ when }}</span>
          </span>
        </span>
      </div>
      <button
        v-if="canReplay"
        type="button"
        class="replay"
        :aria-label="replayLabel"
        :title="replayLabel"
        @click="emit('replay')"
      >
        ▶
      </button>
    </div>

    <!-- 2 · le corps, toujours visible : ce que ça rapporte, puis qui y était — chacun dans
         son encart titré (`missionMain`, au modèle commun des rapports). -->
    <ReportDetail :detail="main">
      <template #loot>
        <!-- ❓ Toucher une ressource dit ce que c'est (`HaulPills`, partagé). -->
        <div v-if="card.gains.length" class="gains">
          <HaulPills :pills="card.gains" sign="+" />
        </div>
        <span v-if="empty" class="none">Rien de récolté</span>
      </template>
    </ReportDetail>

    <!-- 3 · le geste -->
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

    <!-- 4 · replié : le récit, le combat coup par coup, la route. -->
    <template v-if="detail.sections.length || detail.stats.length">
      <button
        type="button"
        class="more-btn"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <span>{{ expanded ? 'Masquer le déroulé' : 'Voir le déroulé' }}</span>
        <span class="chev">›</span>
      </button>
      <ReportDetail v-if="expanded" :detail="detail" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import RiftPortal from '@/components/RiftPortal.vue';
import { seedOf } from '@/lib/combat';
import ReportDetail from '@/components/ReportDetail.vue';
import { missionDetail, missionMain } from '@/lib/reportDetail';
import { missionWhen, type MissionCard } from '@/lib/missionCard';
import { riftStageInputOf } from '@/lib/riftStage';
import HaulPills from '@/components/HaulPills.vue';
import { warbandStageInputOf } from '@/lib/warbandStage';

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
const canReplay = computed(
  () =>
    !!props.card.overflow ||
    (!!props.card.party &&
      (!!riftStageInputOf(props.card.party) ||
        !!warbandStageInputOf(props.card.party) ||
        !!props.card.party.den ||
        !!props.card.party.fallen)),
);
const replayLabel = computed(() => {
  const p = props.card.party;
  if (props.card.overflow) return 'Revoir le débordement';
  if (p?.battle) return 'Revoir la bataille';
  if (p?.den) return 'Revoir le combat';
  if (p?.fallen) return 'Revoir la fouille';
  return 'Revoir l’incursion';
});
const empty = computed(
  () => !props.card.gains.length && !props.card.loot.length && !props.card.legacyItem,
);
/** La ligne unique d'un rapport replié : ses gains (pastilles touchables, cf. le gabarit),
 *  puis les objets et l'XP ; le verdict si rien n'est rapporté. */
const summaryTail = computed(() => {
  const parts: string[] = [];
  if (props.card.loot.length) parts.push(`🎁 ×${props.card.loot.length + props.card.lootMore}`);
  if (props.card.totalXp) parts.push(`+${props.card.totalXp} XP`);
  return parts.join(' · ') || (props.card.gains.length ? '' : props.card.verdict);
});

const main = computed(() => missionMain(props.card));
const detail = computed(() => missionDetail(props.card));
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
  padding: 12px;
  display: grid;
  gap: 10px;
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
.l1 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.where {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.ico {
  flex: none;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  font-size: 22px;
  line-height: 1;
}
.ico.rift {
  width: 18px;
}
.name {
  font-weight: 600;
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.nm-col {
  display: grid;
  min-width: 0;
  line-height: 1.25;
}
/* Sous le nom : le verdict, le rang du lieu, puis quand — sur deux lignes s'il le faut. */
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px 8px;
  min-width: 0;
  margin-top: 3px;
  font-size: 11.5px;
  white-space: nowrap;
}
.rank {
  flex: none;
  font-weight: 600;
}
.verdict {
  flex: none;
  font-size: 11.5px;
  font-weight: 700;
  padding: 3px 9px;
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
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: transparent;
  color: #b57bff;
  font-size: 12px;
  cursor: pointer;
}
/* Les ressources du butin, sous le titre de l'encart. */
.gains {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-weight: 700;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.none {
  color: var(--dim);
  font-size: 12.5px;
}
.take {
  width: 100%;
  min-height: 46px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: #15120e;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.take:disabled {
  opacity: 0.5;
  cursor: default;
}
.wait {
  font-size: 12px;
  color: var(--dim);
  text-align: center;
}
/* Déplier le déroulé : toute la largeur, pour le doigt. */
.more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 44px;
  background: none;
  border: 1px dashed var(--line);
  border-radius: 10px;
  color: var(--accent);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.chev {
  display: inline-block;
  transition: transform 0.15s;
}
.mrc.open .chev {
  transform: rotate(90deg);
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
