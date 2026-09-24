<template>
  <!-- 📊 LE RANG D'UNE PIÈCE ET SON AVANCEMENT VERS L'ÉTOILE SUIVANTE (v0.1126, demandé).
       Son niveau est caché comme celui d'un champion : sans cette barre, une pièce apprend
       plusieurs missions sans que rien ne bouge. Un seul dessin pour le stock, le sélecteur,
       la fiche et la feuille d'une pièce : plusieurs copies finiraient par diverger. -->
  <span class="gsb" :class="{ big, thin }" :style="{ '--rc': rs.color }" :title="thin ? `${rs.name} ${stars} · ${capped ? '★5, ascension' : pct + ' % vers l’étoile suivante'}` : undefined">
    <span v-if="!thin" class="gsb-top">
      <span class="gsb-rk">{{ rs.emoji }} {{ rs.name }}</span>
      <span class="gsb-stars">{{ stars }}</span>
      <span class="gsb-pct">{{ capped ? '★5 · ascension' : pct + ' %' }}</span>
    </span>
    <span
      class="gsb-bar"
      role="progressbar"
      :aria-valuenow="pct"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`${rs.name} ${rs.star} étoile${rs.star > 1 ? 's' : ''}, ${pct} % vers la suivante`"
    >
      <span class="gsb-fill" :style="{ width: pct + '%' }" />
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  advGearAtRankCap,
  advGearProgress,
  advGearRankStar,
  type AdvGear,
} from '@/lib/advGear';
import { rankStarStr } from '@/lib/characterRank';

const props = defineProps<{
  g: Pick<AdvGear, 'rarity' | 'level' | 'xp'>;
  big?: boolean;
  /** La barre seule, pour une case étroite (fiche, portrait) : rang et % au survol. */
  thin?: boolean;
}>();
const rs = computed(() => advGearRankStar(props.g));
const stars = computed(() => rankStarStr(rs.value.star));
const pct = computed(() => Math.round(advGearProgress(props.g) * 100));
const capped = computed(() => advGearAtRankCap(props.g));
</script>

<style scoped>
.gsb {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  min-width: 0;
  font-size: 11px;
}
.gsb-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.gsb-rk {
  color: var(--rc);
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.gsb-stars {
  flex: none;
  color: var(--rc);
  letter-spacing: 0.5px;
}
.gsb-pct {
  flex: none;
  margin-left: auto;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.gsb-bar {
  position: relative;
  display: block;
  height: 5px;
  border-radius: 999px;
  background: var(--surface-2, #2b241b);
  overflow: hidden;
}
.gsb-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--rc);
}
.gsb.big {
  font-size: 13px;
  gap: 6px;
}
.gsb.big .gsb-bar {
  height: 10px;
}
</style>
