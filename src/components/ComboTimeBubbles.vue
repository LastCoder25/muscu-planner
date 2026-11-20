<template>
  <!-- 🫧 Exo en DURÉE (gainage…) : les MÊMES bulles que les exos en séries. Une bulle = 30 s ;
       quand on arrête le chrono, les bulles faites se remplissent de la couleur de leur palier,
       la dernière à la hauteur de ce qui a été tenu (45 s = une bulle pleine + une à moitié).
       Ne calcule rien : tout vient de `legTimeBubbles` (lib, testée). -->
  <div class="tb-bar" role="img" :aria-label="label" :title="label">
    <span
      v-for="b in bubbles"
      :key="b.n"
      class="tb"
      :class="['tier-' + b.zone, { on: b.fill >= 1, part: b.fill > 0 && b.fill < 1 }]"
    >
      <i v-if="b.fill > 0" class="tb-fill" :style="{ width: b.fill * 100 + '%' }" />
      <span v-if="b.held > 0" class="tb-txt">{{ Math.round(b.held) }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { legDone, legTimeBubbles, type ComboLeg, type ComboLegFilter } from '@/lib/combo';

const props = withDefaults(defineProps<{ leg: ComboLeg; filter?: ComboLegFilter }>(), {
  filter: 'all',
});

const bubbles = computed(() => legTimeBubbles(props.leg, props.filter));

// L'unité vit dans le titre (survol / lecteur d'écran) : les bulles ne portent que le nombre.
const label = computed(
  () => `${Math.round(legDone(props.leg))} s tenues sur ${props.leg.target} s`,
);
</script>

<style scoped lang="scss">
/* Même grille et même allure que `.seg-bar` / `.seg` des exos en séries. */
.tb-bar {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
  gap: 4px;
}
.tb {
  position: relative;
  min-height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  overflow: hidden;
  font-family: var(--font-display);
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  /* À FAIRE : fond légèrement teinté + liseré, comme une série à faire. */
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line));
  color: var(--text);
}
.tb.tier-secondary {
  border-color: color-mix(in srgb, var(--tier-sec) 55%, var(--line));
}
.tb.tier-principal {
  border-color: color-mix(in srgb, var(--accent) 70%, var(--line));
}
/* Le remplissage : de la couleur du palier, sur la part tenue de la bulle. */
.tb-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background: var(--accent);
}
.tb.tier-secondary .tb-fill {
  background: var(--tier-sec);
}
.tb.tier-beyond .tb-fill {
  background: var(--d1);
}
.tb-txt {
  position: relative; /* au-dessus du remplissage */
}
/* Bulle PARTIELLE : le nombre est à cheval sur le remplissage et le vide → clair + ombre,
   lisible sur la couleur comme sur le fond sombre. */
.tb.part .tb-txt {
  color: var(--text);
  text-shadow:
    0 0 3px rgba(0, 0, 0, 0.95),
    0 0 2px rgba(0, 0, 0, 0.95);
}
/* Bulle pleine : bordure de la couleur du palier, texte sombre lisible sur la couleur. */
.tb.on {
  border-color: var(--accent);
  color: var(--accent-ink);
}
.tb.on.tier-secondary {
  border-color: var(--tier-sec);
  color: var(--tier-sec-ink);
}
.tb.on.tier-beyond {
  border-color: var(--d1);
  color: #10231a;
}
</style>
