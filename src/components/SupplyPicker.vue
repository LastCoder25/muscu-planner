<template>
  <!-- 🎒 RAVITAILLEMENT — un de chaque consommable, pris dans le stock. ⚠️ Ils entrent dans le
       kit du groupe (`partyRoad`), donc le 🎯 % de la fiche les voit comme le combat les verra.
       Ceux qui ne servent à rien ICI sont repliés AVEC la raison (`supplyUselessWhy`). -->
<div class="sup-block">
  <div class="sup-title">
    🎒 Ravitaillement
    <span class="sup-sub">un de chaque · le 🎯 % en tient compte</span>
  </div>
  <div v-if="supplyUseful.length" class="sup-grid">
    <button
      v-for="r in supplyUseful"
      :key="r.id"
      type="button"
      class="sup"
      :class="{ on: r.on && !r.why, off: !!r.why }"
      :disabled="!!r.why"
      :aria-pressed="r.on && !r.why"
      :title="`${r.def.name} — ${r.why ?? r.def.what}`"
      @click="emit('toggle', r.id)"
    >
      <span class="sup-emo">{{ r.def.emoji }}</span>
      <span class="sup-main">
        <span class="sup-name">{{ r.def.name }} ×{{ r.n }}</span>
        <span class="sup-what">{{ r.why ?? r.def.what }}</span>
      </span>
      <span class="sup-check">{{ r.on && !r.why ? '✓' : '＋' }}</span>
    </button>
  </div>
  <p v-else-if="!rows.length" class="sup-empty">
    Aucun consommable en stock — ils tombent en butin de voyage.
  </p>
  <!-- 📐 Ce qui ne sert à rien ICI est replié (raison comprise) : une ligne au lieu
       d'une tuile grisée chacun. -->
  <details v-if="supplyUseless.length" class="sup-useless">
    <summary>
      Inutiles ici :
      <span v-for="r in supplyUseless" :key="r.id">{{ r.def.emoji }}×{{ r.n }}</span>
    </summary>
    <p v-for="r in supplyUseless" :key="r.id">
      {{ r.def.emoji }} {{ r.def.name }} — {{ r.why }}
    </p>
  </details>
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SupplyDef, SupplyId } from '@/lib/supplies';

interface SupplyRow {
  id: SupplyId;
  def: SupplyDef;
  /** En stock. */
  n: number;
  /** Coché pour ce voyage. */
  on: boolean;
  /** Pourquoi il ne servirait à rien ici (null = utile). */
  why: string | null;
}

const props = defineProps<{ rows: SupplyRow[] }>();
const emit = defineEmits<{ toggle: [id: SupplyId] }>();

const supplyUseful = computed(() => props.rows.filter((r) => !r.why));
const supplyUseless = computed(() => props.rows.filter((r) => !!r.why));
</script>

<style scoped lang="scss">
/* 🎒 Ravitaillement : même langage que la tuile du héros (coché = liseré accent, inutile ici
   = pointillé et grisé, la raison écrite dessous). Une colonne : le nom ET l'effet doivent
   se lire, sur 344 px deux colonnes les couperaient. */
.sup-block {
  margin: 10px 0;
}
.sup-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 6px;
}
.sup-sub {
  font-weight: 400;
  font-size: 11.5px;
  color: var(--dim);
}
/* 📐 Une colonne (à deux, les effets se coupaient sur 5 lignes à 344 px), mais seuls les
   consommables UTILES ici ont une tuile, et leur effet tient sur deux lignes au plus. */
.sup-grid {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.sup-useless {
  margin-top: 6px;
  font-size: 12px;
  color: var(--dim);
}
.sup-useless > summary {
  min-height: 32px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  cursor: pointer;
  list-style: none;
}
.sup-useless > summary::-webkit-details-marker {
  display: none;
}
.sup-useless p {
  margin: 2px 0 0;
  line-height: 1.35;
}
.sup {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  background: #1d1913;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.sup.on {
  border-color: var(--accent);
  background: linear-gradient(90deg, rgba(255, 210, 63, 0.16), #1d1913 70%);
}
.sup.off {
  cursor: default;
  border-style: dashed;
  opacity: 0.55;
}
.sup-emo {
  font-size: 20px;
  flex: none;
}
.sup-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.sup-name {
  font-size: 12px;
  font-weight: 700;
}
.sup-what {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 11px;
  color: var(--dim);
  line-height: 1.3;
}
.sup-check {
  font-size: 16px;
  font-weight: 800;
  color: var(--accent);
}
.sup-empty {
  margin: 0;
  font-size: 12px;
  color: var(--dim);
}
</style>
