<template>
  <!-- 🧱 Barre d'un exo en DURÉE (gainage…) découpée EN SÉRIES : un morceau par série faite,
       large de sa durée, avec les secondes écrites dedans — comme les cases des autres exos.
       Le trait marque l'objectif ; le vide restant = ce qu'il reste à tenir. Ne calcule rien :
       tout vient de `legTimeSegments` / `legBarGeometry` (lib, testées). -->
  <div
    class="ctb"
    role="img"
    :aria-label="label"
    :title="label"
  >
    <span
      v-for="(s, i) in segs"
      :key="i"
      class="ctb-seg"
      :class="{ over: s.over }"
      :style="{ width: s.pct + '%' }"
    >
      <template v-if="s.pct >= minPct(s.sec)">{{ s.sec }}</template>
    </span>
    <span v-if="geo.objPct < 100" class="ctb-mark" :style="{ left: geo.objPct + '%' }" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { legBarGeometry, legTimeSegments, type ComboLeg } from '@/lib/combo';

const props = defineProps<{ leg: ComboLeg }>();

/** Les durées s'écrivent TOUJOURS en secondes, sans unité (« 30 », « 90 », « 120 ») : plus court,
 *  homogène, et la plupart des séries de gainage font 30 s — elles doivent s'afficher (une
 *  série de 30 s sur un objectif de 360 s ne pèse que 8 % de la barre, ~21 px à 344 px).
 *  Un morceau montre son nombre dès que ses chiffres tiennent (3 % de la barre par chiffre) ;
 *  plus étroit, le titre de la barre (survol / lecteur d'écran) dit toutes les séries. */
const PCT_PER_DIGIT = 3;
function minPct(sec: number): number {
  return String(sec).length * PCT_PER_DIGIT;
}

const segs = computed(() => legTimeSegments(props.leg));
const geo = computed(() => legBarGeometry(props.leg));

const fmt = (sec: number): string => `${sec} s`;

const label = computed(() =>
  segs.value.length
    ? `${segs.value.length} série${segs.value.length > 1 ? 's' : ''} : ${segs.value.map((s) => fmt(s.sec)).join(' · ')}`
    : 'Aucune série faite',
);
</script>

<style scoped lang="scss">
/* Même place que la barre continue (`.reps-bar`) mais plus haute : il faut y lire des secondes. */
.ctb {
  flex: 1;
  min-width: 0;
  height: 20px;
  display: flex;
  border-radius: 6px;
  background: var(--surface-2);
  overflow: hidden;
  position: relative;
}
.ctb-seg {
  flex: 0 0 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  white-space: nowrap;
  background: var(--accent);
  color: var(--bg);
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  /* Le séparateur est DANS le morceau : la somme des largeurs reste celle de la barre. */
  box-shadow: inset -2px 0 0 var(--surface-2);
}
.ctb-seg.over {
  background: var(--d1);
}
.ctb-mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--text);
  opacity: 0.5;
  pointer-events: none;
}
</style>
