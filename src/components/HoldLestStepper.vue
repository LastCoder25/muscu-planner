<template>
  <!-- 🧱 Lest d'une tenue du Défi 360 (planche, chaise) : le chiffre choisi ici part avec la
       prochaine série (chrono ou ajout rapide) et se mémorise pour les suivantes. -->
  <div class="hl" role="group" :aria-label="'Lest : ' + leg.exercise_name">
    <span class="hl-lbl">🧱 Lest</span>
    <button
      type="button"
      class="hl-pm"
      aria-label="Moins de lest"
      :disabled="lest <= 0"
      data-test="hold-lest-minus"
      @click="bump(-1)"
    >
      −
    </button>
    <span class="hl-val" data-test="hold-lest-val"
      ><b class="font-display">{{ lest > 0 ? fmt(lest) : '—' }}</b
      ><small>kg</small></span
    >
    <button
      type="button"
      class="hl-pm"
      aria-label="Plus de lest"
      :disabled="lest >= HOLD_LEST_MAX"
      data-test="hold-lest-plus"
      @click="bump(1)"
    >
      +
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { HOLD_LEST_MAX, HOLD_LEST_STEP, legHoldLest, type ComboLeg } from '@/lib/combo';
import { useComboStore } from '@/stores/combo';

const props = defineProps<{ comboId: string; leg: ComboLeg }>();
const combo = useComboStore();
/** Le lest proposé : celui de la dernière série lestée, sinon le dernier choisi (`legHoldLest`). */
const lest = computed(() => legHoldLest(props.leg));
const fmt = (w: number) => String(Math.round(w * 10) / 10).replace('.', ',');
function bump(d: 1 | -1) {
  combo.setHoldLest(props.comboId, props.leg.exercise_id, lest.value + d * HOLD_LEST_STEP);
}
</script>

<style scoped>
.hl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 8px 0 2px;
}
.hl-lbl {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--dim);
  margin-right: 2px;
}
.hl-pm {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.hl-pm:disabled {
  opacity: 0.4;
  cursor: default;
}
.hl-val {
  min-width: 64px;
  text-align: center;
  color: var(--accent);
}
.hl-val b {
  font-size: 22px;
  font-weight: 700;
}
.hl-val small {
  margin-left: 3px;
  font-size: 11.5px;
  color: var(--dim);
}
</style>
