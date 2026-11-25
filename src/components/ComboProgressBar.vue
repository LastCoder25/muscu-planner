<template>
  <!-- 🎨 Avancement du Défi 360 : UNE SEULE BARRE (v1.343.0 ; avec la variété d'exos, la zone
       « secondaire » n'était plus qu'une miette). Remplissage = l'avancement (le même chiffre
       que le grand pourcentage), rose = le RETARD réel juste après, trait 🎯 = où l'on devrait
       en être. 📅 v1.354.0 (demandé : « pas de texte sous la barre, mais voir sur la barre la
       répartition théorique selon la durée choisie ») : la barre est DÉCOUPÉE en autant de
       tranches que de jours (traits fins) et la tranche du jour est teintée. Plus de ligne
       dessous. Tout vient de `comboBar` (lib, testée). -->
  <div class="cpb-wrap" :class="{ thin }">
    <div
      class="cpb-seg"
      role="progressbar"
      :aria-label="`Avancement du défi, ${bar.ticks.length + 1} jours`"
      :aria-valuenow="Math.round(bar.fill)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span
        v-if="bar.today"
        class="cpb-today"
        :style="{ left: bar.today.from + '%', width: bar.today.to - bar.today.from + '%' }"
      />
      <span class="cpb-fill" :style="{ width: bar.fill + '%' }" />
      <span
        v-if="bar.late > 0"
        class="cpb-late"
        :style="{ left: bar.fill + '%', width: bar.late + '%' }"
      />
      <i v-for="t in bar.ticks" :key="t" class="cpb-tick" :style="{ left: t + '%' }" />
      <i
        v-if="bar.mark !== null"
        class="cpb-mark"
        :style="{ left: bar.mark + '%' }"
        :title="`Pour être dans les temps : ${pace.onTimePct}%`"
      />
    </div>
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
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
}
.cpb-wrap.thin .cpb-seg {
  height: 10px;
  border-radius: 5px;
}
.cpb-fill,
.cpb-late,
.cpb-today {
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
/* La tranche du jour : un voile plus clair sur la piste (visible là où la barre n'est pas
   encore remplie), pour dire « c'est ce créneau-là qu'il faut faire aujourd'hui ». */
.cpb-today {
  background: color-mix(in srgb, var(--accent) 34%, var(--surface-2));
}
/* Frontières de jours : un trait sombre fin par-dessus remplissage et rose. */
.cpb-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--bg);
  opacity: 0.85;
  pointer-events: none;
  z-index: 1;
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
</style>
