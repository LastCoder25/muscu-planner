<template>
  <!-- 🧝 LE HÉROS, PARMI LES EFFECTIFS (demandé : il vivait dans un bandeau au-dessus des lieux
       de départ). Il part toujours de la BASE : il se range donc dans son groupe, au format
       d'une tuile de champion (`AdvPickTile`). Grisé AVEC la raison plutôt que caché. -->
  <button
    type="button"
    class="party-hero"
    :class="{ on: on && !block, off: !!block }"
    :disabled="!!block"
    :aria-pressed="on"
    @click="emit('toggle')"
  >
    <span class="ph-emo" aria-hidden="true">🧝</span>
    <span class="ph-main">
      <span class="ph-name">Ton héros</span>
      <span class="ph-sub">{{ block ?? sub }}</span>
      <span
        v-if="gain != null && !block"
        class="ph-gain"
        :class="{ zero: gain === 0, neg: gain < 0 }"
        :title="
          on
            ? 'Ce que l’équipe perdrait en réussite sans lui.'
            : 'Ce qu’il ajouterait en réussite à l’équipe cochée.'
        "
        >🎯 {{ gain > 0 ? '+' : gain < 0 ? '−' : '' }}{{ Math.abs(gain) }} %</span
      >
    </span>
    <span class="ph-check">{{ on && !block ? '✓' : '＋' }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  on: boolean;
  /** Pourquoi il ne peut pas partir (null = disponible). */
  block: string | null;
  /** La ligne sous son nom quand il est disponible. */
  sub: string;
  /** Ce qu'il change à la réussite (null = pas de pronostic). */
  gain?: number | null;
}>();
const emit = defineEmits<{ toggle: [] }>();
</script>

<style scoped lang="scss">
/* Même gabarit qu'une tuile de champion : il se lit dans la même grille. */
.party-hero {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 44px;
  padding: 7px 8px;
  background: #1d1913;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.party-hero.on {
  border-color: var(--accent);
  background: linear-gradient(180deg, rgba(255, 210, 63, 0.16), #1d1913 65%);
}
.party-hero.off {
  cursor: default;
  border-style: dashed;
  opacity: 0.65;
}
.ph-emo {
  flex: none;
  font-size: 40px;
  line-height: 1;
}
.ph-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ph-name {
  font-size: 13px;
  font-weight: 700;
}
.ph-sub {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.3;
}
.ph-gain {
  font-size: 12px;
  font-weight: 700;
  color: var(--d1, #7bc86c);
}
.ph-gain.zero {
  color: var(--dim);
  font-weight: 600;
}
.ph-gain.neg {
  color: var(--d3, #ffb23f);
}
.ph-check {
  flex: none;
  font-size: 16px;
  font-weight: 800;
  color: var(--accent);
}
</style>
