<template>
  <!-- 🎨 Avancement du Défi 360 en TROIS BARRES SÉPARÉES (demandé : segmenter, pas de barre
       continue) : séries de base (argent, jusqu'à 80 %), objectif (jaune, 80 → 100 %),
       bonus (vert, 100 → 120 %). Chaque barre se remplit de ce que les exos ont fait dans SA
       zone, sommé sur tous les exos (`comboBarParts`) : le jaune peut avancer avant que
       l'argent soit plein, si certains exos sont allés plus loin. Les largeurs gardent les
       proportions (80 · 20 · 20). Le rose est le RETARD réel (points d'objectif), réparti dans
       le vide de l'argent puis du jaune, jamais dans le bonus. Une seule barre pour la fiche du 360 et l'onglet 🎯. -->
  <div class="cpb" :class="{ thin }">
    <div
      v-for="z in zones"
      :key="z.id"
      class="cpb-seg"
      :class="'cpb-' + z.id"
      :style="{ flexGrow: z.len }"
    >
      <span class="cpb-fill" :style="{ width: z.fill + '%' }" />
      <span v-if="z.late > 0" class="cpb-late" :style="{ left: z.fill + '%', width: z.late + '%' }" />
      <i
        v-if="z.mark !== null"
        class="cpb-mark"
        :style="{ left: z.mark + '%' }"
        :title="`Pour être dans les temps : ${pace.onTimePct}%`"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { comboBarSegments, type ComboChallenge, type ComboPace } from '@/lib/combo';

const props = defineProps<{ combo: ComboChallenge; pace: ComboPace; thin?: boolean }>();

// Remplissage, retard et trait : la règle vit dans la lib (`comboBarSegments`), testée.
const zones = computed(() => comboBarSegments(props.combo, props.pace));
</script>

<style scoped lang="scss">
.cpb {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}
.cpb-seg {
  position: relative;
  flex-basis: 0;
  min-width: 0;
  height: 10px;
  border-radius: 6px;
  overflow: hidden;
}
.cpb.thin {
  margin: 9px 0 6px;
}
.cpb.thin .cpb-seg {
  height: 8px;
  border-radius: 5px;
}
/* Chaque barre porte sa couleur en pâle (vide) et en plein (fait). */
.cpb-sec {
  --c: var(--tier-sec);
  background: color-mix(in srgb, var(--tier-sec) 10%, var(--surface-2));
}
.cpb-obj {
  --c: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
}
.cpb-bonus {
  --c: var(--d1);
  background: color-mix(in srgb, var(--d1) 14%, var(--surface-2));
}
.cpb-fill,
.cpb-late {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
}
.cpb-fill {
  background: var(--c);
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
</style>
