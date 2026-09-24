<template>
  <!-- 🧩 Une pièce de set face à SA pièce du set (même emplacement, dans « Mes sets »).
       ⚠️ Pas de « si équipée seule » : hors de son set elle perd ses paliers et sa voie, donc
       elle paraît souvent pire qu'elle n'est. On compare la puissance du SET avec l'une puis
       l'autre — le barème du rangement, donc le verdict dit ce qui va se passer. -->
  <div v-if="cmp" class="spc" :class="cls">
    <div class="spc-verdict">
      <span class="spc-tag">{{ tag }}</span>
      <span class="spc-what">{{ what }}</span>
    </div>
    <div v-if="cmp.other" class="spc-other">
      Ta pièce du set : {{ cmp.other.name }} · {{ gradeLabel(cmp.other) }}
    </div>
    <div v-if="cmp.before !== undefined && cmp.after !== undefined" class="spc-pow">
      ⚔️ Puissance du set {{ fmtPow(cmp.before) }} →
      <b>{{ fmtPow(cmp.after) }} ({{ fmtDelta(cmp.before, cmp.after) }})</b>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { gradeLabel } from '@/lib/items';
import { fmtDelta, fmtPow } from '@/lib/combat';
import type { SetPieceCmp } from '@/lib/setFiling';

// `null` : rien à afficher (pas une pièce de set de voie).
const props = defineProps<{ cmp: SetPieceCmp | null }>();

const cls = computed(() =>
  props.cmp?.verdict === 'free' || props.cmp?.verdict === 'better'
    ? 'up'
    : props.cmp?.verdict === 'equal'
      ? 'same'
      : 'down',
);
const tag = computed(
  () =>
    ({ free: '＋ Libre', better: '↑ Meilleure', equal: '≈ Égale', worse: '↓ Moins bonne' })[props.cmp?.verdict ?? 'free'],
);
// ⚠️ Ce qui se passe vraiment : un doublon est VENDU d'office (v0.890), pas gardé.
const what = computed(
  () =>
    ({
      free: 'emplacement libre dans ton set → rangée',
      better: 'que ta pièce du set → la remplace (l’ancienne est vendue)',
      equal: 'à ta pièce du set → vendue (doublon)',
      worse: 'que ta pièce du set → vendue (doublon)',
    })[props.cmp?.verdict ?? 'free'],
);
</script>

<style scoped>
.spc {
  margin-top: 4px;
  font-size: 11px;
  color: var(--dim);
}
.spc-verdict {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 5px;
}
.spc-tag {
  font-weight: 800;
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: 999px;
}
.spc.up .spc-tag {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 18%, transparent);
}
.spc.same .spc-tag {
  color: var(--text);
  background: color-mix(in srgb, var(--dim) 22%, transparent);
}
.spc.down .spc-tag {
  color: var(--d4);
  background: color-mix(in srgb, var(--d4) 18%, transparent);
}
.spc-other {
  margin-top: 2px;
}
.spc-pow {
  margin-top: 2px;
}
.spc-pow b {
  font-weight: 800;
}
.spc.up .spc-pow b {
  color: var(--d1);
}
.spc.down .spc-pow b {
  color: var(--d4);
}
</style>
