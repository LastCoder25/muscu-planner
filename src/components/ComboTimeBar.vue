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
      <template v-if="s.pct >= MIN_LABEL_PCT">{{ fmt(s.sec) }}</template>
    </span>
    <span v-if="geo.objPct < 100" class="ctb-mark" :style="{ left: geo.objPct + '%' }" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { legBarGeometry, legTimeSegments, type ComboLeg } from '@/lib/combo';

const props = defineProps<{ leg: ComboLeg }>();

/** Sous cette largeur (en % de la barre) un morceau est trop étroit pour son texte : le titre
 *  de la barre (survol / lecteur d'écran) dit alors toutes les séries. */
const MIN_LABEL_PCT = 11;

const segs = computed(() => legTimeSegments(props.leg));
const geo = computed(() => legBarGeometry(props.leg));

/** 45 → « 45 s », 90 → « 1:30 ». */
function fmt(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const r = sec % 60;
  return `${Math.floor(sec / 60)}:${String(r).padStart(2, '0')}`;
}

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
