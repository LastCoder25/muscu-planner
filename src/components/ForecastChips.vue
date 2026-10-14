<!--
  🔮 LE PRONOSTIC DE BATAILLE EN PASTILLES (2026-10-14) : la tenue d'un lieu, l'usure de la troupe
  qui s'y installerait, la part d'une armée abattue et NOS pertes, par issue. Une tuile par issue,
  des pastilles courtes qui passent à la ligne : aucun débordement à 344 px.
  ⚠️ Aucune règle ici : la vue vient de `forecastChips.ts`, qui lit `defenseForecast.ts`.
-->
<template>
  <section v-if="view.head.length || view.rows.length" class="fc" aria-label="Pronostic du combat">
    <div v-if="view.head.length" class="fc-head">
      <span
        v-for="c in view.head"
        :key="c.key"
        class="fc-chip fc-head-chip"
        :class="c.tone"
        :title="c.title"
      >
        {{ c.text }}
      </span>
    </div>
    <div v-for="r in view.rows" :key="r.key" class="fc-row">
      <span class="fc-lab">{{ r.label }}</span>
      <span class="fc-chips">
        <span v-for="c in r.chips" :key="c.key" class="fc-chip" :class="c.tone" :title="c.title">
          {{ c.text }}
        </span>
      </span>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ForecastView } from '@/lib/forecastChips';

defineProps<{ view: ForecastView }>();
</script>

<style scoped>
.fc {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 8px;
  min-width: 0;
}
.fc-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.fc-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 9px;
  border: 1px solid var(--line, rgba(128, 128, 128, 0.35));
  border-radius: 12px;
  background: var(--surface, transparent);
  min-width: 0;
}
.fc-lab {
  font-size: 11px;
  color: var(--dim, #8a8f98);
}
.fc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}
.fc-chip {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  max-width: 100%;
  padding: 2px 9px;
  border-radius: 13px;
  border: 1px solid var(--line, rgba(128, 128, 128, 0.35));
  background: color-mix(in srgb, var(--text, #888) 6%, transparent);
  color: var(--text, inherit);
  font-size: 12px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.fc-head-chip {
  min-height: 32px;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
}
.fc-chip.ok {
  border-color: color-mix(in srgb, var(--d1, #7bc86c) 60%, var(--line, #888));
  color: var(--d1, #7bc86c);
}
.fc-chip.warn {
  border-color: color-mix(in srgb, var(--d3, #e0a43a) 60%, var(--line, #888));
  color: var(--d3, #e0a43a);
}
.fc-chip.bad {
  border-color: color-mix(in srgb, var(--d4, #e0624a) 60%, var(--line, #888));
  color: var(--d4, #e0624a);
}
.fc-chip.info {
  color: var(--dim, #8a8f98);
}
</style>
