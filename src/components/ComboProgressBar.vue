<template>
  <!-- 🎨 Avancement du Défi 360 : UNE SEULE BARRE (v1.343.0 ; avec la variété d'exos, la zone
       « secondaire » n'était plus qu'une miette). Remplissage = l'avancement (le même chiffre
       que le grand pourcentage), rose = le RETARD réel juste après, trait 🎯 = où l'on devrait
       en être. Tout vient de `comboBar` (lib, testée). La ligne dessous rappelle la prime. -->
  <div class="cpb-wrap" :class="{ thin }">
    <div
      class="cpb-seg"
      role="progressbar"
      aria-label="Avancement du défi"
      :aria-valuenow="Math.round(bar.fill)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span class="cpb-fill" :style="{ width: bar.fill + '%' }" />
      <span
        v-if="bar.late > 0"
        class="cpb-late"
        :style="{ left: bar.fill + '%', width: bar.late + '%' }"
      />
      <i
        v-if="bar.mark !== null"
        class="cpb-mark"
        :style="{ left: bar.mark + '%' }"
        :title="`Pour être dans les temps : ${pace.onTimePct}%`"
      />
    </div>
    <!-- La prime est par exo : 15 % dès 80 % de l'exo, tout à 100 %. -->
    <p class="cpb-hint">Prime d’un exo : 15 % dès 80 % faits, en entier à 100 %</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { comboBar, type ComboPace } from '@/lib/combo';

const props = defineProps<{ pace: ComboPace; thin?: boolean }>();
const bar = computed(() => comboBar(props.pace));
</script>

<style scoped lang="scss">
.cpb-wrap {
  margin-top: 6px;
}
.cpb-seg {
  position: relative;
  display: block;
  height: 10px;
  border-radius: 6px;
  overflow: hidden;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
}
.cpb-wrap.thin .cpb-seg {
  height: 8px;
  border-radius: 5px;
}
.cpb-fill,
.cpb-late {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
}
.cpb-fill {
  background: var(--accent);
}
.cpb-late {
  background: #ff6a9c;
}
/* Repère « dans les temps ». */
.cpb-mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--text);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  z-index: 2;
}
.cpb-hint {
  margin: 4px 0 0;
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--dim);
  opacity: 0.85;
}
</style>
