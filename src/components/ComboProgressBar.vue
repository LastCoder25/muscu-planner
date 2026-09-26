<template>
  <!-- 🎨 Barre d'avancement du Défi 360 de 0 à 120 %, en trois ZONES (demandé) : séries de
       base (argent, jusqu'à 80 %), objectif (jaune, 80 → 100 %), bonus (vert, 100 → 120 %).
       La piste montre les trois zones en pâle, séparées ; le plein montre la part faite dans
       chacune, sommée sur tous les exos (`comboBarParts`). Le rose dit le RETARD jusqu'au
       trait « dans les temps ». Une seule barre pour la fiche du 360 et l'onglet 🎯 : les deux
       écrans en avaient chacun leur copie. -->
  <div class="cpb" :class="{ thin }">
    <span class="cpb-z cpb-z-sec" :style="{ width: SEC + '%' }" />
    <span class="cpb-z cpb-z-obj" :style="{ left: SEC + '%', width: OBJ - SEC + '%' }" />
    <span class="cpb-z cpb-z-bonus" :style="{ left: OBJ + '%', width: 100 - OBJ + '%' }" />
    <span class="cpb-f cpb-f-sec" :style="{ width: parts.sec + '%' }" />
    <span class="cpb-f cpb-f-obj" :style="{ left: parts.sec + '%', width: parts.obj + '%' }" />
    <span
      class="cpb-f cpb-f-bonus"
      :style="{ left: parts.sec + parts.obj + '%', width: parts.bonus + '%' }"
    />
    <span v-if="late > 0" class="cpb-f cpb-f-late" :style="{ left: fillEnd + '%', width: late + '%' }" />
    <i class="cpb-sep" :style="{ left: SEC + '%' }" />
    <i class="cpb-sep" :style="{ left: OBJ + '%' }" />
    <i
      v-if="pace.showMark"
      class="cpb-mark"
      :style="{ left: markPos + '%' }"
      :title="`Pour être dans les temps : ${pace.onTimePct}%`"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { comboBarParts, comboBarPos, type ComboChallenge, type ComboPace } from '@/lib/combo';

const props = defineProps<{ combo: ComboChallenge; pace: ComboPace; thin?: boolean }>();

/** Limites des zones, en % de la largeur (80 % et 100 % de l'objectif sur une barre à 120). */
const SEC = comboBarPos(80);
const OBJ = comboBarPos(100);

const parts = computed(() => comboBarParts(props.combo));
const fillEnd = computed(() => parts.value.sec + parts.value.obj + parts.value.bonus);
const markPos = computed(() => comboBarPos(props.pace.onTimePct));
// Le retard ne se peint que là où le plein n'est pas déjà arrivé.
const late = computed(() => (props.pace.latePct > 0 ? Math.max(0, markPos.value - fillEnd.value) : 0));
</script>

<style scoped lang="scss">
.cpb {
  position: relative;
  height: 10px;
  border-radius: 6px;
  overflow: hidden;
  margin-top: 8px;
  background: var(--surface-2);
}
.cpb.thin {
  height: 8px;
  border-radius: 5px;
  margin: 9px 0 6px;
}
.cpb-z,
.cpb-f {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
}
/* Piste : chaque zone en pâle, pour qu'on voie où commence le jaune et le vert. */
.cpb-z-sec {
  background: color-mix(in srgb, var(--tier-sec) 10%, var(--surface-2));
}
.cpb-z-obj {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
}
.cpb-z-bonus {
  background: color-mix(in srgb, var(--d1) 16%, var(--surface-2));
}
.cpb-f-sec {
  background: var(--tier-sec);
}
.cpb-f-obj {
  background: var(--accent);
}
.cpb-f-bonus {
  background: var(--d1);
}
.cpb-f-late {
  background: #ff6a9c;
}
.cpb-sep {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--bg, #15120e);
  pointer-events: none;
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
